import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyContent, requireWpEnv, redact, resolveWpRestRoot } from '../scripts/wordpress-utils.mjs';
import { verifySavedDraft, wordpressPolicy } from '../scripts/post-wordpress-draft.mjs';
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
<!-- /wp:paragraph -->`; writeFileSync(path.join(d,'article-decorated.html'),html); writeFileSync(path.join(d,'metadata.json'),JSON.stringify({title:'テスト記事',slug,target_keyword:'x',related_keywords:['y'],status:'draft',post_to_wp:postToWp,wordpress_draft_id:null,wordpress_draft_url:null,category:'出会い系',tags:[]},null,2)); return d;}
async function server(handler){const s=http.createServer(handler); await new Promise(r=>s.listen(0,'127.0.0.1',r)); return {url:`http://127.0.0.1:${s.address().port}`, close:()=>new Promise(r=>s.close(r))};}

test('env validation rejects missing and production http',()=>{
 assert.throws(()=>requireWpEnv({}),/Missing/);
 assert.throws(()=>requireWpEnv({WP_SITE_URL:'http://example.com',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'p'}),/HTTPS/);
 assert.equal(redact('x secret y',{WP_APPLICATION_PASSWORD:'secret'}),'x [redacted] y');
});



test('wp env supports legacy and current variable names with normalized URLs',()=>{
 const legacy=requireWpEnv({WP_REST_ROOT:'https://writing-corp.co.jp/matting/wp-json/',WP_USERNAME:'u',WP_APP_PASSWORD:'legacy',WP_DEFAULT_STATUS:'draft'});
 assert.equal(legacy.siteUrl,'https://writing-corp.co.jp/matting');
 assert.equal(legacy.restRoot,'https://writing-corp.co.jp/matting/wp-json/');
 assert.equal(legacy.password,'legacy');
 const current=requireWpEnv({WP_SITE_URL:'https://writing-corp.co.jp/matting/',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'current'});
 assert.equal(current.siteUrl,'https://writing-corp.co.jp/matting');
 assert.equal(current.restRoot,'https://writing-corp.co.jp/matting/wp-json/');
 assert.equal(current.password,'current');
 assert.ok(!current.restRoot.includes('/wp-json/wp-json/'));
});

test('wp:doctor and wp:draft shared REST resolver preserves a WP_SITE_URL subdirectory',()=>{
 assert.equal(resolveWpRestRoot('https://writing-corp.co.jp/matting/'),'https://writing-corp.co.jp/matting/wp-json/');
 const both=requireWpEnv({WP_SITE_URL:'https://writing-corp.co.jp/matting',WP_REST_ROOT:'https://writing-corp.co.jp/matting/wp-json/',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'p'});
 assert.equal(both.restRoot,resolveWpRestRoot(both.siteUrl));
});

test('WordPress policy accepts only explicit missing-term and collision strategies',()=>{
 assert.deepEqual(wordpressPolicy({}),{missing_terms_policy:'fail',collision_policy:'fail'});
 assert.deepEqual(wordpressPolicy({missing_terms_policy:'stop',collision_policy:'stop'}),{missing_terms_policy:'fail',collision_policy:'fail'});
 assert.deepEqual(wordpressPolicy({missing_terms_policy:'create_exact',collision_policy:'review_suffix'}),{missing_terms_policy:'create_exact',collision_policy:'review_suffix'});
 assert.equal(wordpressPolicy({collision_policy:'update_owned_draft'}).collision_policy,'update_owned_draft');
 assert.throws(()=>wordpressPolicy({missing_terms_policy:'guess'}),/invalid missing_terms_policy/);
 assert.throws(()=>wordpressPolicy({collision_policy:'overwrite'}),/invalid collision_policy/);
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
  if(u.pathname==='/wp-json/wp/v2/categories') return res.end('[{"id":3,"name":"出会い系","slug":"dating"}]');
  if(u.pathname==='/wp-json/wp/v2/tags') return res.end('[]');
  if(u.pathname==='/wp-json/wp/v2/posts' && req.method==='GET'){const slugq=u.searchParams.get('slug'); return res.end(JSON.stringify(slugq?posts.filter(p=>p.slug===slugq):posts));}
  if(u.pathname==='/wp-json/wp/v2/posts' && req.method==='POST'){writes++; const p=JSON.parse(body); assert.equal(p.status,'draft'); const post={id:1,status:'draft',slug:p.slug,title:{raw:p.title},content:{raw:p.content},categories:p.categories||[],tags:p.tags||[]}; posts=[post]; res.statusCode=201; return res.end(JSON.stringify(post));}
  const m=u.pathname.match(/\/wp-json\/wp\/v2\/posts\/(\d+)/); if(m&&req.method==='GET') return res.end(JSON.stringify(posts.find(p=>p.id==m[1])||{}));
  if(m&&req.method==='POST'){writes++; const p=JSON.parse(body); posts[0]={id:Number(m[1]),status:'draft',slug:p.slug,title:{raw:p.title},content:{raw:p.content},categories:p.categories||[],tags:p.tags||[]}; return res.end(JSON.stringify(posts[0]));}
  res.statusCode=404; res.end('{}');});});
 try{const env={...process.env,WP_SITE_URL:srv.url,WP_REST_ROOT:'',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'app-pass',WP_APP_PASSWORD:'',WP_DRAFT_SKIP_PRECHECKS:'1'};
  await runAsync(['scripts/post-wordpress-draft.mjs','--slug',slug,'--dry-run'],{env}); assert.equal(existsSync(path.join(root,'articles',slug,'wp-result.md')),false); assert.equal(writes,0);
  await runAsync(['scripts/post-wordpress-draft.mjs','--slug',slug,'--confirm'],{env}); let meta=JSON.parse(readFileSync(path.join(root,'articles',slug,'metadata.json'))); assert.equal(meta.wordpress_draft_id,1); assert.equal(meta.wordpress_status,'draft'); assert.ok(meta.wordpress_content_sha256);
  await runAsync(['scripts/post-wordpress-draft.mjs','--slug',slug,'--confirm'],{env}); assert.equal(writes,2); assert.equal(posts.length,1);
 } finally {await srv.close(); rmSync(path.join(root,'articles',slug),{recursive:true,force:true});}
});

test('wp draft preflight resolves terms and review slug using GET requests only', async()=>{
 const slug='wp-preflight-test',dir=tmpArticle(slug,true);
 const metadata=JSON.parse(readFileSync(path.join(dir,'metadata.json')));
 Object.assign(metadata,{missing_terms_policy:'create_exact',collision_policy:'review_suffix',tags:['確認タグ']});
 writeFileSync(path.join(dir,'metadata.json'),JSON.stringify(metadata,null,2));
 const methods=[];
 const srv=await server((req,res)=>{methods.push(req.method); res.setHeader('content-type','application/json'); const u=new URL(req.url,'http://x');
  if(u.pathname==='/wp-json/wp/v2/categories'||u.pathname==='/wp-json/wp/v2/tags') return res.end('[]');
  if(u.pathname==='/wp-json/wp/v2/posts'){
   const requested=u.searchParams.get('slug');
   return res.end(JSON.stringify(requested===slug?[{id:9,status:'draft',slug}]:[]));
  }
  res.statusCode=404; res.end('{}');
 });
 try{
  const env={...process.env,WP_SITE_URL:srv.url,WP_REST_ROOT:'',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'p',WP_APP_PASSWORD:'',WP_DRAFT_SKIP_PRECHECKS:'1'};
  const output=await runAsync(['scripts/post-wordpress-draft.mjs','--slug',slug,'--preflight'],{env});
  assert.match(output,/wp:draft preflight PASS/);
  assert.match(output,/wordpress_slug: wp-preflight-test-review/);
  assert.match(output,/create_exact: 出会い系/);
  assert.match(output,/create_exact: 確認タグ/);
  assert.match(output,/WordPress write request: NOT SENT/);
  assert.deepEqual([...new Set(methods)],['GET']);
  const unchanged=JSON.parse(readFileSync(path.join(dir,'metadata.json')));
  assert.equal(unchanged.wordpress_draft_id,null);
  assert.equal(existsSync(path.join(dir,'wp-result.md')),false);
 } finally {await srv.close(); rmSync(dir,{recursive:true,force:true});}
});

test('wp draft rejects combining preflight with a write mode',()=>{
 const slug='wp-preflight-option-test'; tmpArticle(slug,true);
 try{
  assert.throws(()=>run(['scripts/post-wordpress-draft.mjs','--slug',slug,'--preflight','--confirm']),/mutually exclusive/);
 } finally {rmSync(path.join(root,'articles',slug),{recursive:true,force:true});}
});

test('post-write verifier checks taxonomies, semantic HTML, canonical headings, and status',()=>{
 const content='<h2 id="guide" class="source">案内</h2><p title="a" class="x">本文 &amp; 説明</p><table><tr><td>値</td></tr></table><a href="#guide">戻る</a><h2 id="faq">FAQ</h2><p>質問と回答</p><h2 id="summary">まとめ</h2>';
 const approvedOutline={outline:[{level:2,text:'案内',id:'guide'}],faq:{heading:{level:2,text:'FAQ',id:'faq'}},conclusion:{heading:{level:2,text:'まとめ',id:'summary'}}};
 const category={id:7,name:'共通名',slug:'category-name'},tags=[{id:7,name:'共通名',slug:'tag-name'},{id:9,name:'安全',slug:'safe'}];
 const base={id:42,status:'draft',slug:'article',title:{raw:'記事'},content:{raw:content},categories:[7],tags:[9,7]};
 const verify=(post)=>verifySavedDraft({post,targetId:42,title:'記事',wordpressSlug:'article',content,category,tags,approvedOutline});
 assert.deepEqual(verify(base),[],'correct re-fetch and tag order pass; same IDs remain taxonomy-scoped');
 for(const [label,post,pattern] of [
  ['category mismatch',{...base,categories:[8]},/カテゴリーID集合/],
  ['category missing',{...base,categories:[]},/カテゴリーID集合/],
  ['category extra',{...base,categories:[7,8]},/カテゴリーID集合/],
  ['tag missing',{...base,tags:[7]},/タグID集合/],
  ['tag extra',{...base,tags:[7,9,10]},/タグID集合/],
  ['empty content',{...base,content:{raw:''}},/本文が空|可視本文/],
  ['visible drift',{...base,content:{raw:content.replace('本文','改変')}},/可視本文/],
  ['table drift',{...base,content:{raw:content.replace('値','別値')}},/表の可視内容/],
  ['h1 inserted',{...base,content:{raw:`<h1>禁止</h1>${content}`}},/H1/],
  ['heading text',{...base,content:{raw:content.replace('>案内<','>変更<')}},/H2〜H6|canonical見出し/],
  ['heading id',{...base,content:{raw:content.replace('id="guide"','id="changed"')}},/H2〜H6|canonical見出し/],
  ['heading order',{...base,content:{raw:content.replace('<h2 id="guide" class="source">案内</h2>','').replace('<h2 id="summary">','<h2 id="guide" class="source">案内</h2><h2 id="summary">')}},/H2〜H6|canonical見出し/],
  ['FAQ drift',{...base,content:{raw:content.replace('質問と回答','別の回答')}},/FAQ/],
  ['unexpected date',{...base,date_gmt:'2999-01-01T00:00:00'},/意図しない公開日時/],
  ['publish',{...base,status:'publish'},/status不一致|公開・予約状態/],
  ['future',{...base,status:'future'},/status不一致|公開・予約状態/]
 ]) assert.match(verify(post).join('\n'),pattern,label);
 const normalized={...base,content:{raw:'<h2 class="wp-block-heading harmless" id="guide">案内</h2>\n<p class="x added" title="a">本文 &#38; 説明</p>\n<table><tbody><tr><td>値</td></tr></tbody></table><a href="#guide">戻る</a><h2 id="faq">FAQ</h2><p>質問と回答</p><h2 id="summary">まとめ</h2>'}};
 assert.deepEqual(verify(normalized),[],'whitespace, entities, harmless classes, attribute order, and tbody normalization pass');
});

test('failed re-fetch verification records post ID and never deletes or retries',async()=>{
 const slug='wp-verification-failure-test',dir=tmpArticle(slug,true),methods=[]; let payload;
 const srv=await server((req,res)=>{methods.push(`${req.method} ${req.url}`); res.setHeader('content-type','application/json'); let body=''; req.on('data',chunk=>body+=chunk); req.on('end',()=>{const u=new URL(req.url,'http://x');
  if(u.pathname==='/wp-json/wp/v2/categories') return res.end('[{"id":3,"name":"出会い系","slug":"dating"}]');
  if(u.pathname==='/wp-json/wp/v2/tags') return res.end('[]');
  if(u.pathname==='/wp-json/wp/v2/posts'&&req.method==='GET') return res.end('[]');
  if(u.pathname==='/wp-json/wp/v2/posts'&&req.method==='POST'){payload=JSON.parse(body); res.statusCode=201; return res.end('{"id":77}');}
  if(u.pathname==='/wp-json/wp/v2/posts/77'&&req.method==='GET') return res.end(JSON.stringify({id:77,status:'draft',slug,title:{raw:'テスト記事'},content:{raw:'<p>改変</p>'},categories:[],tags:[]}));
  res.statusCode=404; res.end('{}');
 });});
 try{
  const env={...process.env,WP_SITE_URL:srv.url,WP_REST_ROOT:'',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'p',WP_APP_PASSWORD:'',WP_DRAFT_SKIP_PRECHECKS:'1'};
  await assert.rejects(runAsync(['scripts/post-wordpress-draft.mjs','--slug',slug,'--confirm'],{env}),/post ID 77/);
  assert.equal(methods.filter(value=>value.startsWith('POST ')).length,1);
  assert.equal(methods.some(value=>value.startsWith('DELETE ')),false);
  assert.equal(payload.status,'draft');
  const metadata=JSON.parse(readFileSync(path.join(dir,'metadata.json')));
  assert.equal(metadata.wordpress_draft_id,77);
  assert.equal(metadata.wordpress_status,'draft');
  assert.equal(metadata.wordpress_verification_status,'FAIL');
  const report=readFileSync(path.join(dir,'wp-result.md'),'utf8');
  assert.match(report,/WordPress投稿ID: 77/); assert.match(report,/不一致:/); assert.match(report,/自動公開・削除・再投稿・別slug投稿: 実行していません/);
 }finally{await srv.close(); rmSync(dir,{recursive:true,force:true});}
});

test('wp draft refuses post_to_wp false, missing confirm, existing published slug, and content mismatch', async()=>{
 const slug='wp-draft-error-test'; tmpArticle(slug,false); const env={...process.env,WP_SITE_URL:'http://127.0.0.1:9',WP_REST_ROOT:'',WP_USERNAME:'u',WP_APPLICATION_PASSWORD:'p',WP_APP_PASSWORD:'',WP_DRAFT_SKIP_PRECHECKS:'1'};
 assert.throws(()=>run(['scripts/post-wordpress-draft.mjs','--slug',slug,'--confirm'],{env}),/post_to_wp/);
 JSON.parse(readFileSync(path.join(root,'articles',slug,'metadata.json'))); let m=JSON.parse(readFileSync(path.join(root,'articles',slug,'metadata.json'))); m.post_to_wp=true; writeFileSync(path.join(root,'articles',slug,'metadata.json'),JSON.stringify(m));
 assert.throws(()=>run(['scripts/post-wordpress-draft.mjs','--slug',slug],{env}),/confirm/);
 rmSync(path.join(root,'articles',slug),{recursive:true,force:true});
});
