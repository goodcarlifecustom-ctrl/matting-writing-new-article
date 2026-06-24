import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parseScalar } from './workflow-utils.mjs';
const execFileAsync = promisify(execFile);
function arg(name) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; }
function visibleTextLength(html) { return html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length; }
function sanitize(text='') { let out=String(text); for (const s of [process.env.WP_USERNAME, process.env.WP_APP_PASSWORD]) if (s) out=out.split(s).join('[redacted]'); return out.replace(/Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/gi,'Auth header [redacted]'); }
async function fail(dir, message, details='') { const report = `# WordPress下書き投稿失敗\n\n- reason: ${sanitize(message)}${details ? `\n- details: ${sanitize(details)}` : ''}\n`; await writeFile(path.join(dir,'check-report.md'), report, 'utf8'); console.error(report); }
export function requireWpEnv(env = process.env) { for (const k of ['WP_REST_ROOT','WP_USERNAME','WP_APP_PASSWORD','WP_DEFAULT_STATUS']) if (!env[k]) throw new Error(`${k} is required.`); if (env.WP_DEFAULT_STATUS !== 'draft') throw new Error('WP_DEFAULT_STATUS must be draft.'); return { root: env.WP_REST_ROOT.endsWith('/') ? env.WP_REST_ROOT : `${env.WP_REST_ROOT}/` }; }
async function pyRequest(args, input='') { const script = `
import json, os, sys, urllib.request, urllib.parse, base64
method,url=sys.argv[1],sys.argv[2]
body=sys.stdin.buffer.read() or None if method in ('POST','PUT','PATCH') else None
headers={'User-Agent':'article-production wordpress draft workflow'}
if len(sys.argv) > 3 and sys.argv[3] == 'auth':
    token=base64.b64encode((os.environ['WP_USERNAME']+':'+os.environ['WP_APP_PASSWORD']).encode()).decode()
    headers['Authorization']='Basic '+token
if body:
    headers['Content-Type']='application/json; charset=utf-8'
opener=urllib.request.build_opener(urllib.request.ProxyHandler())
req=urllib.request.Request(url, data=body, headers=headers, method=method)
try:
    with opener.open(req, timeout=60) as r:
        print(r.status)
        sys.stdout.buffer.write(r.read())
except urllib.error.HTTPError as e:
    print(e.code)
    sys.stdout.buffer.write(e.read())
    sys.exit(2)
`; return execFileAsync('python3', ['-c', script, ...args], { input, maxBuffer: 3*1024*1024, env: process.env, timeout: 90000 }); }
async function request(method, url, auth=false, payload=null) {
  let stdout;
  try { ({ stdout } = await pyRequest([method, url, auth?'auth':'anon'], payload ? JSON.stringify(payload) : '')); }
  catch (error) {
    stdout = error.stdout || '';
    if (!stdout) {
      const reason = error.killed ? 'request timed out' : `exit code ${error.code ?? 'unknown'}`;
      throw new Error(`WordPress request failed for ${method} ${url}: ${reason}`);
    }
  }
  const text=String(stdout); const status=Number(text.split(/\n/,1)[0]); const body=text.includes('\n') ? text.slice(text.indexOf('\n')+1) : ''; return { status, body };
}
export async function main() {
 const slug=arg('slug'); if(!slug){ console.error('Usage: npm run post -- --slug slug'); process.exit(1); }
 const dir=path.join('articles',slug); const input=await readFile(path.join(dir,'input.yml'),'utf8').catch(()=> '');
 if (parseScalar(input,'post_to_wp') !== 'true') { await fail(dir,'post_to_wp が true ではないため、WordPressへ接続しません。'); process.exit(1); }
 let env; try { env=requireWpEnv(); } catch(e){ await fail(dir,e.message); process.exit(1); }
 const metadata=JSON.parse(await readFile(path.join(dir,'metadata.json'),'utf8')); const title=metadata.title || parseScalar(input,'title');
 const content=await readFile(path.join(dir,'article-decorated.html'),'utf8').catch(()=> ''); if(visibleTextLength(content)<500){ await fail(dir,'article-decorated.html の本文が500文字未満です。'); process.exit(1); }
 try { await execFileAsync('npm',['run','check','--','--slug',slug],{maxBuffer:1024*1024}); } catch(e){ await fail(dir,'品質チェックに失敗したため投稿しません。', e.stdout || e.stderr || e.message); process.exit(1); }
 try {
  const root=env.root; const anon=await request('GET', root, false); if(anon.status<200||anon.status>=300) throw new Error(`REST root GET failed: ${anon.status}`);
  const me=await request('GET', new URL('wp/v2/users/me?context=edit',root).toString(), true); if(me.status<200||me.status>=300) throw new Error(`auth check failed: ${me.status}`);
  const types=await request('GET', new URL('wp/v2/types/post?context=edit',root).toString(), true); if(types.status<200||types.status>=300) throw new Error(`capability check failed: ${types.status}`);
  const dup=await request('GET', new URL(`wp/v2/posts?slug=${encodeURIComponent(slug)}&status=publish,draft,pending,private,future`,root).toString(), true); if(dup.status<200||dup.status>=300) throw new Error(`duplicate check failed: ${dup.status}`); if(JSON.parse(dup.body||'[]').length) throw new Error('同一スラッグの投稿が存在するため停止しました。');
  const posted=await request('POST', new URL('wp/v2/posts',root).toString(), true, {title, content, slug, status:'draft'}); if(posted.status<200||posted.status>=300) throw new Error(`post failed: ${posted.status}`); const json=JSON.parse(posted.body);
  const got=await request('GET', new URL(`wp/v2/posts/${json.id}?context=edit`,root).toString(), true); const check=JSON.parse(got.body||'{}'); if(check.status!=='draft'||check.slug!==slug||!check.content?.raw) throw new Error('投稿後再取得の検証に失敗しました。');
  metadata.wordpress_draft_id=json.id; metadata.wordpress_draft_url=json.link || null; metadata.updated_at=new Date().toISOString(); await writeFile(path.join(dir,'metadata.json'), JSON.stringify(metadata,null,2)+'\n');
  const result=`# WordPress下書き投稿結果\n\n- 投稿ID: ${json.id}\n- status: ${json.status}\n- slug: ${json.slug}\n- draft_url: ${json.link || ''}\n- 投稿対象: article-decorated.html\n- transport: python urllib.request ProxyHandler\n`; await writeFile(path.join(dir,'wp-result.md'), result); console.log(result);
 } catch(e){ await fail(dir,e.message); process.exit(1); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
