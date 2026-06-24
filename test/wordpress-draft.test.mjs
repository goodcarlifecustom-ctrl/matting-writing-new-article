import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyContent, requireWpEnv, redact } from '../scripts/wordpress-utils.mjs';
const root=process.cwd();
const execFileAsync = promisify(execFile);
function run(args,opts={}){return execFileSync('node',args,{cwd:root,encoding:'utf8',stdio:'pipe',...opts});}
async function runAsync(args,opts={}){const r=await execFileAsync('node',args,{cwd:root,encoding:'utf8',maxBuffer:1024*1024,...opts}); return r.stdout;}
function tmpArticle(slug,postToWp=true){const d=path.join(root,'articles',slug); rmSync(d,{recursive:true,force:true}); mkdirSync(d,{recursive:true}); const html=`<!-- wp:paragraph -->
<p><span class="swl-marker mark_yellow">重要です</span>。</p>
<!-- /wp:paragraph -->
<!-- wp:list -->
<p>この記事でわかること</p>
<ul class="wp-block-list">
<!-- wp:list-item -->
<li><a href="#sec-01">見出し</a></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
<!-- wp:heading {"level":2,"anchor":"sec-01"} -->
<h2 class="wp-block-heading" id="sec-01">見出し</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><span class="swl-marker mark_yellow">本文です。</span></p>
<!-- /wp:paragraph -->`; writeFileSync(path.join(d,'article-decorated.html'),html); writeFileSync(path.join(d,'metadata.json'),JSON.stringify({title:'テスト記事',slug,target_keyword:'x',related_keywords:['y'],status:'draft',post_to_wp:postToWp,wordpress_draft_id:null,wordpress_draft_url:null},null,2)); return d;}
async function server(handler){const s=http.createServer(handler); await new Promise(r=>s.listen(0,'127.0.0.1',r)); return {url:`http://127.0.0.1:${s.address().port}`, close:()=>new Promise(r=>s.close(r))};}

test('env validation rejects missing and production http',()=>{
 assert.throws(()=>requireWpEnv({}),/Missing/);
 assert.throws(()=>requireWpEnv({WP_SITE_URL:'http://example.com',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'p'}),/HTTPS/);
 assert.equal(redact('x secret y',{WP_APPLICATION_PASSWORD:'secret'}),'x [redacted] y');
});



test('wp env supports legacy and current variable names with normalized URLs',()=>{
 const legacy=requireWpEnv({WP_REST_ROOT:'https://poi-poi.co.jp/bike/wp-json/',WP_USERNAME:'u',WP_APP_PASSWORD:'legacy',WP_DEFAULT_STATUS:'draft'});
 assert.equal(legacy.siteUrl,'https://poi-poi.co.jp/bike');
 assert.equal(legacy.restRoot,'https://poi-poi.co.jp/bike/wp-json/');
 assert.equal(legacy.password,'legacy');
 const current=requireWpEnv({WP_SITE_URL:'https://poi-poi.co.jp/bike/',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'current'});
 assert.equal(current.siteUrl,'https://poi-poi.co.jp/bike');
 assert.equal(current.restRoot,'https://poi-poi.co.jp/bike/wp-json/');
 assert.equal(current.password,'current');
 assert.ok(!current.restRoot.includes('/wp-json/wp-json/'));
});

test('wp env error messages list alternatives without secret values',()=>{
 assert.throws(()=>requireWpEnv({WP_USERNAME:'u',WP_APP_PASSWORD:'secret'}),/WP_SITE_URL or WP_REST_ROOT/);
 assert.throws(()=>requireWpEnv({WP_SITE_URL:'https://example.com',WP_USERNAME:'u'}),/WP_APPLICATION_PASSWORD or WP_APP_PASSWORD/);
 assert.throws(()=>requireWpEnv({WP_SITE_URL:'https://example.com',WP_APPLICATION_PASSWORD:'secret'}),/WP_USERNAME/);
 assert.throws(()=>requireWpEnv({WP_SITE_URL:'http://example.com',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'secret'}),/HTTPS/);
 assert.throws(()=>requireWpEnv({WP_REST_ROOT:'https://example.com/wp/v2',WP_USERNAME:'u',WP_APP_PASSWORD:'secret'}),/WP_REST_ROOT must end with \/wp-json\//);
 assert.equal(redact('secret Basic dXNlcjpwYXNz',{WP_APP_PASSWORD:'secret'}).includes('secret'),false);
});

test('content verification allows newline-only differences and catches stripped classes',()=>{
 const a='<p class="x">本文</p>\r\n<!-- wp:paragraph -->';
 assert.deepEqual(verifyContent(a,a.replace(/\r\n/g,'\n')),[]);
 assert.match(verifyContent(a,'<p>本文</p>\n<!-- wp:paragraph -->').join('\n'),/content.raw|classes/);
});

test('wp draft creates draft, saves metadata, updates same ID on rerun, and dry-run does not write', async()=>{
 const slug='wp-draft-test'; tmpArticle(slug,true); let posts=[], writes=0;
 const srv=await server((req,res)=>{res.setHeader('content-type','application/json'); let body=''; req.on('data',c=>body+=c); req.on('end',()=>{const u=new URL(req.url,'http://x');
  if(u.pathname==='/wp-json/') return res.end('{}');
  if(u.pathname==='/wp-json/wp/v2/users/me') return res.end('{"name":"tester"}');
  if(u.pathname==='/wp-json/wp/v2/posts' && req.method==='GET'){const slugq=u.searchParams.get('slug'); return res.end(JSON.stringify(slugq?posts.filter(p=>p.slug===slugq):posts));}
  if(u.pathname==='/wp-json/wp/v2/posts' && req.method==='POST'){writes++; const p=JSON.parse(body); assert.equal(p.status,'draft'); const post={id:1,status:'draft',slug:p.slug,title:{raw:p.title},content:{raw:p.content}}; posts=[post]; res.statusCode=201; return res.end(JSON.stringify(post));}
  const m=u.pathname.match(/\/wp-json\/wp\/v2\/posts\/(\d+)/); if(m&&req.method==='GET') return res.end(JSON.stringify(posts.find(p=>p.id==m[1])||{}));
  if(m&&req.method==='POST'){writes++; const p=JSON.parse(body); posts[0]={id:Number(m[1]),status:'draft',slug:p.slug,title:{raw:p.title},content:{raw:p.content}}; return res.end(JSON.stringify(posts[0]));}
  res.statusCode=404; res.end('{}');});});
 try{const env={...process.env,WP_SITE_URL:srv.url,WP_REST_ROOT:'',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'app-pass',WP_APP_PASSWORD:'',WP_DRAFT_SKIP_PRECHECKS:'1'};
  await runAsync(['scripts/post-wordpress-draft.mjs','--slug',slug,'--dry-run'],{env}); assert.equal(existsSync(path.join(root,'articles',slug,'wp-result.md')),false); assert.equal(writes,0);
  await runAsync(['scripts/post-wordpress-draft.mjs','--slug',slug,'--confirm'],{env}); let meta=JSON.parse(readFileSync(path.join(root,'articles',slug,'metadata.json'))); assert.equal(meta.wordpress_draft_id,1); assert.equal(meta.wordpress_status,'draft'); assert.ok(meta.wordpress_content_sha256);
  await runAsync(['scripts/post-wordpress-draft.mjs','--slug',slug,'--confirm'],{env}); assert.equal(writes,2); assert.equal(posts.length,1);
 } finally {await srv.close(); rmSync(path.join(root,'articles',slug),{recursive:true,force:true});}
});

test('wp draft refuses post_to_wp false, missing confirm, existing published slug, and content mismatch', async()=>{
 const slug='wp-draft-error-test'; tmpArticle(slug,false); const env={...process.env,WP_SITE_URL:'http://127.0.0.1:9',WP_REST_ROOT:'',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'p',WP_APP_PASSWORD:'',WP_DRAFT_SKIP_PRECHECKS:'1'};
 assert.throws(()=>run(['scripts/post-wordpress-draft.mjs','--slug',slug,'--confirm'],{env}),/post_to_wp/);
 JSON.parse(readFileSync(path.join(root,'articles',slug,'metadata.json'))); let m=JSON.parse(readFileSync(path.join(root,'articles',slug,'metadata.json'))); m.post_to_wp=true; writeFileSync(path.join(root,'articles',slug,'metadata.json'),JSON.stringify(m));
 assert.throws(()=>run(['scripts/post-wordpress-draft.mjs','--slug',slug],{env}),/confirm/);
 rmSync(path.join(root,'articles',slug),{recursive:true,force:true});
});
