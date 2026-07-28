import { argvValue } from './workflow-utils.mjs';
import { atomicJson, editUrl, loadArticle, redact, requireWpEnv, runPrechecks, wpFetch, writeResult } from './wordpress-utils.mjs';
import { canonicalHeadings, compareSemanticHtml, htmlHeadingStructure } from './content-integrity.mjs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const ALLOWED_TERM_POLICIES=['stop','fail','create_exact'];
const ALLOWED_COLLISION_POLICIES=['stop','fail','review_suffix','update_owned_draft'];
function has(flag){return process.argv.includes(`--${flag}`)}
function fail(message){throw new Error(message)}
function norm(value){return String(value??'').trim().toLowerCase()}
function endpoint(root,relative){return new URL(relative,root).toString()}
function idSet(values=[]){return [...new Set((Array.isArray(values)?values:[]).map(Number))].sort((a,b)=>a-b)}
function sameIds(expected,actual){return JSON.stringify(idSet(expected))===JSON.stringify(idSet(actual))}

export function wordpressPolicy(metadata){
 const configuredMissingTermsPolicy=metadata.missing_terms_policy??'fail';
 const configuredCollisionPolicy=metadata.collision_policy??'fail';
 if(!ALLOWED_TERM_POLICIES.includes(configuredMissingTermsPolicy)) fail(`invalid missing_terms_policy: ${configuredMissingTermsPolicy}`);
 if(!ALLOWED_COLLISION_POLICIES.includes(configuredCollisionPolicy)) fail(`invalid collision_policy: ${configuredCollisionPolicy}`);
 // Existing article metadata uses "stop"; normalize it to the equivalent internal "fail" behavior.
 return {
  missing_terms_policy:configuredMissingTermsPolicy==='stop'?'fail':configuredMissingTermsPolicy,
  collision_policy:configuredCollisionPolicy==='stop'?'fail':configuredCollisionPolicy
 };
}

export function verifySavedDraft({post,targetId,title,wordpressSlug,content,category,tags=[],approvedOutline=null}){
 const errors=[];
 if(Number(post?.id)!==Number(targetId)) errors.push(`投稿ID不一致: expected ${targetId}, got ${post?.id??'missing'}`);
 if(post?.status!=='draft') errors.push(`status不一致: expected draft, got ${post?.status??'missing'}`);
 const scheduledAt=post?.date_gmt?Date.parse(`${post.date_gmt}Z`):NaN;
 if(post?.status==='draft'&&Number.isFinite(scheduledAt)&&scheduledAt>Date.now()+60000) errors.push(`意図しない公開日時: ${post.date_gmt} GMT`);
 if((post?.title?.raw??'')!==title) errors.push('タイトル不一致');
 if(post?.slug!==wordpressSlug) errors.push(`WordPress slug不一致: expected ${wordpressSlug}, got ${post?.slug??'missing'}`);
 const expectedCategories=category?[category.id]:[],expectedTags=tags.map(term=>term.id);
 if(!sameIds(expectedCategories,post?.categories||[])) errors.push(`カテゴリーID集合不一致: expected [${idSet(expectedCategories)}], got [${idSet(post?.categories||[])}]`);
 if(!sameIds(expectedTags,post?.tags||[])) errors.push(`タグID集合不一致: expected [${idSet(expectedTags)}], got [${idSet(post?.tags||[])}]`);
 if(category && (norm(category.name)===''||!Number.isFinite(Number(category.id)))) errors.push('カテゴリーplanの名前またはIDが不正です');
 if(tags.some(term=>norm(term.name)===''||!Number.isFinite(Number(term.id)))) errors.push('タグplanの名前またはIDが不正です');
 const raw=post?.content?.raw??'';
 errors.push(...compareSemanticHtml(content,raw));
 const allHeadings=htmlHeadingStructure(String(raw).replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi,''));
 const h1Count=(String(raw).match(/<h1\b/gi)||[]).length;
 if(h1Count) errors.push(`H1が${h1Count}件あります`);
 if(approvedOutline){
  const canonical=canonicalHeadings(approvedOutline);
  if(JSON.stringify(canonical)!==JSON.stringify(allHeadings)) errors.push(`canonical見出し不一致: expected ${JSON.stringify(canonical)}, got ${JSON.stringify(allHeadings)}`);
 }
 if(post?.status==='future'||post?.status==='publish'||post?.status==='private') errors.push(`公開・予約状態を拒否: ${post.status}`);
 return errors;
}

async function getPost(root,id){return wpFetch(endpoint(root,`wp/v2/posts/${id}?context=edit`),{auth:true})}
async function findBySlug(root,slug){return wpFetch(endpoint(root,`wp/v2/posts?slug=${encodeURIComponent(slug)}&status=publish,draft,pending,private,future&context=edit`),{auth:true})}
function assertDraft(post,label='post'){
 if(!post||post.status!=='draft') fail(`${label} is not an editable draft (status: ${post?.status??'unknown'})`);
}
function isOwnedDraft(post,metadata){
 return post?.status==='draft' && Number(metadata.wordpress_draft_id)===Number(post.id) &&
   typeof metadata.source_content_hash==='string' && metadata.source_content_hash.length===64;
}

async function resolveTaxonomy(root,endpointName,value,label,policy,{write=false}={}){
 if(!value) return null;
 const lookup=await wpFetch(endpoint(root,`wp/v2/${endpointName}?search=${encodeURIComponent(value)}&per_page=100&context=edit`),{auth:true});
 if(!lookup.ok) fail(`${label} lookup failed: ${lookup.status}`);
 const matches=(lookup.json||[]).filter(term=>norm(term.name)===norm(value)||norm(term.slug)===norm(value));
 if(matches.length>1) fail(`${label} is ambiguous: ${value}`);
 if(matches.length===1) return matches[0];
 if(policy!=='create_exact') fail(`${label} does not exist: ${value}`);
 if(!write) return {id:null,name:value,slug:null,plannedCreate:true};
 const created=await wpFetch(endpoint(root,`wp/v2/${endpointName}`),{method:'POST',auth:true,payload:{name:value}});
 if(!created.ok) fail(`${label} create_exact failed: ${created.status}`);
 if(norm(created.json?.name)!==norm(value)) fail(`${label} create_exact returned a different name`);
 return created.json;
}
async function resolveTags(root,values,policy,options){return Promise.all(values.map(value=>resolveTaxonomy(root,'tags',value,'tag',policy,options)))}

async function selectTarget(root,canonicalSlug,metadata,collisionPolicy){
 if(metadata.wordpress_draft_id){
  const got=await getPost(root,metadata.wordpress_draft_id);
  if(!got.ok) fail(`owned WordPress draft is inaccessible: ${got.status}`);
  assertDraft(got.json,'owned WordPress post');
  if(!isOwnedDraft(got.json,metadata)) fail('wordpress_draft_id is not accompanied by source_content_hash ownership data');
  return {targetId:got.json.id,wordpressSlug:got.json.slug,mode:'updated'};
 }
 const found=await findBySlug(root,canonicalSlug);
 if(!found.ok) fail(`canonical slug collision check failed: ${found.status}`);
 const posts=found.json||[];
 if(posts.some(post=>['publish','future'].includes(post.status))) fail(`canonical_slug is occupied by a ${posts.find(post=>['publish','future'].includes(post.status)).status} post`);
 if(posts.length===0) return {targetId:null,wordpressSlug:canonicalSlug,mode:'created'};
 if(collisionPolicy==='update_owned_draft') fail('canonical slug draft is not owned by this article');
 if(collisionPolicy!=='review_suffix') fail('canonical slug already exists');
 for(let n=1;n<=100;n++){
  const candidate=`${canonicalSlug}-review${n===1?'':`-${n}`}`;
  const check=await findBySlug(root,candidate);
  if(!check.ok) fail(`review_suffix collision check failed: ${check.status}`);
  if(!(check.json||[]).length) return {targetId:null,wordpressSlug:candidate,mode:'created-review'};
 }
 fail('review_suffix could not find an unused slug');
}

async function main(){
 const slug=argvValue(process.argv,'slug');
 if(!slug) fail('Usage: npm run wp:draft -- --slug <slug> [--dry-run | --preflight | --confirm]');
 const dryRun=has('dry-run'),preflight=has('preflight'),confirm=has('confirm');
 const {dir,metaPath,metadata,source,content,hash}=await loadArticle(slug);
 const started=new Date().toISOString();
 try{
  if(metadata.slug!==slug) fail('metadata.slug must match CLI slug');
  if(!metadata.title) fail('metadata.title is required');
  if(metadata.status!=='draft') fail('metadata.status must be draft; publish and future are forbidden');
  if([dryRun,preflight,confirm].filter(Boolean).length>1) fail('--dry-run, --preflight, and --confirm are mutually exclusive');
  if(!dryRun&&!preflight&&!confirm) fail('--confirm is required for writing');
  const policy=wordpressPolicy(metadata);
  const canonicalSlug=metadata.canonical_slug??metadata.slug;
  if(canonicalSlug!==metadata.slug) fail('canonical_slug must equal metadata.slug');
  if(dryRun){
   console.log(['wp:draft dry-run PASS',`canonical_slug: ${canonicalSlug}`,`wordpress_slug: ${metadata.wordpress_slug??'(resolved only after confirm)'}`,`status: draft`,`source: ${source}`,`source_content_hash: ${hash}`,`missing_terms_policy: ${policy.missing_terms_policy}`,`collision_policy: ${policy.collision_policy}`,'WordPress write request: NOT SENT'].join('\n'));
   return;
  }
  if(process.env.WP_DRAFT_SKIP_PRECHECKS!=='1') await runPrechecks(slug);
  const cfg=requireWpEnv();
  const category=await resolveTaxonomy(cfg.restRoot,'categories',metadata.category,'category',policy.missing_terms_policy,{write:!preflight});
  const tags=await resolveTags(cfg.restRoot,metadata.tags||[],policy.missing_terms_policy,{write:!preflight});
  const selected=await selectTarget(cfg.restRoot,canonicalSlug,metadata,policy.collision_policy);
  if(preflight){
   const termPlan=[category,...tags].filter(Boolean).map(term=>term.plannedCreate?`create_exact: ${term.name}`:`existing: ${term.name} (ID ${term.id})`);
   console.log(['wp:draft preflight PASS',`canonical_slug: ${canonicalSlug}`,`wordpress_slug: ${selected.wordpressSlug}`,`operation: ${selected.mode}`,`source_content_hash: ${hash}`,`terms: ${termPlan.join(', ')||'none'}`,'WordPress requests: READ ONLY','WordPress write request: NOT SENT'].join('\n'));
   return;
  }
  const payload={title:metadata.title,slug:selected.wordpressSlug,content,status:'draft'};
  if(category) payload.categories=[category.id];
  if(tags.length) payload.tags=tags.map(term=>term.id);
  const saveUrl=selected.targetId?endpoint(cfg.restRoot,`wp/v2/posts/${selected.targetId}`):endpoint(cfg.restRoot,'wp/v2/posts');
  const saved=await wpFetch(saveUrl,{method:'POST',auth:true,payload});
  if(!saved.ok) fail(`post ${selected.targetId?'update':'create'} failed: ${saved.status}`);
  const targetId=selected.targetId??saved.json?.id;
  if(!targetId) fail('post write response did not contain an ID');
  // Never trust the write response: perform a separate authenticated REST read.
  const verified=await getPost(cfg.restRoot,targetId);
  if(!verified.ok){
   Object.assign(metadata,{wordpress_draft_id:targetId,wordpress_status:'UNKNOWN',wordpress_verification_status:'FAIL',wordpress_last_verification_at:new Date().toISOString()});
   await atomicJson(metaPath,metadata);
   await writeResult(dir,['# WordPress下書き投稿結果','',`- 実行日時: ${started}`,'- action: verification-failed',`- WordPress投稿ID: ${targetId}`,'- 実際のステータス: 取得失敗',`- wordpress_verification_status: FAIL`,`- 不一致: 投稿後REST再取得失敗 HTTP ${verified.status}`,'- 自動公開・削除・再投稿・別slug投稿: 実行していません']);
   const error=new Error(`post verification fetch failed for post ID ${targetId}: ${verified.status}`); error.alreadyReported=true; throw error;
  }
  const post=verified.json;
  const outlinePath=`${dir}/approved_outline.json`;
  const approvedOutline=existsSync(outlinePath)?JSON.parse(await readFile(outlinePath,'utf8')):null;
  const errors=verifySavedDraft({post,targetId,title:metadata.title,wordpressSlug:selected.wordpressSlug,content,category,tags,approvedOutline});
  const url=editUrl(cfg.siteUrl,targetId);
  if(errors.length){
   Object.assign(metadata,{wordpress_draft_id:targetId,wordpress_draft_url:url,wordpress_status:post.status??'UNKNOWN',wordpress_verification_status:'FAIL',wordpress_last_verification_at:new Date().toISOString()});
   await atomicJson(metaPath,metadata);
   await writeResult(dir,['# WordPress下書き投稿結果','',`- 実行日時: ${started}`,'- action: verification-failed',`- WordPress投稿ID: ${targetId}`,`- 実際のステータス: ${post.status??'missing'}`,`- wordpress_verification_status: FAIL`,'- 自動公開・削除・再投稿・別slug投稿: 実行していません',...errors.map(error=>`- 不一致: ${error}`)]);
   const error=new Error(`POST_WRITE_VERIFICATION_FAILED (post ID ${targetId}): ${errors.join('; ')}`);
   error.alreadyReported=true;
   throw error;
  }
  Object.assign(metadata,{canonical_slug:canonicalSlug,wordpress_slug:post.slug,source_content_hash:hash,wordpress_draft_id:targetId,wordpress_draft_url:url,wordpress_status:'draft',wordpress_verification_status:'PASS',wordpress_last_synced_at:new Date().toISOString(),wordpress_content_sha256:hash});
  await atomicJson(metaPath,metadata);
  const lines=['# WordPress下書き投稿結果','',`- 実行日時: ${started}`,`- action: ${selected.mode}`,`- WordPress投稿ID: ${targetId}`,`- 編集画面URL: ${url}`,'- ステータス: draft',`- 公開日時: ${post.date_gmt??post.date??'未設定'}`,`- canonical_slug: ${canonicalSlug}`,`- wordpress_slug: ${post.slug}`,`- カテゴリーID: [${idSet(post.categories||[])}]`,`- タグID: [${idSet(post.tags||[])}]`,`- source_content_hash: ${hash}`,'- WordPress write request: SENT','- 投稿後REST再取得検証: PASS'];
  await writeResult(dir,lines);
  console.log(lines.join('\n'));
 }catch(error){
  if(!error.alreadyReported) await writeResult(dir,['# WordPress下書き投稿結果','',`- 実行日時: ${started}`,'- action: failed',`- エラー: ${redact(error.message)}`,'- 次の対応: エラー内容を解消して同じslugで再実行してください。']);
  console.error(redact(error.message)); process.exit(1);
 }
}

if(import.meta.url===`file://${process.argv[1]}`) main();
