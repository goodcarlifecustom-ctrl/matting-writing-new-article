import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as parse5 from 'parse5';
export const CAP_TITLE_CLASS='cap_box_ttl';
export function sha256(s){return crypto.createHash('sha256').update(s).digest('hex');}
export async function loadDecorationConfig(dir){const p=path.join(dir,'decoration.json'); if(!existsSync(p)) throw new Error('decoration.json がありません'); const c=JSON.parse(await readFile(p,'utf8')); if(c.enabled!==true) throw new Error('decoration.enabled が true ではありません'); return c;}
export function parseFragment(html){return parse5.parseFragment(html,{sourceCodeLocationInfo:false});}
export function serialize(doc){return parse5.serialize(doc).replace(/\n{3,}/g,'\n\n').trim()+"\n";}
export function text(n){if(!n)return''; if(n.nodeName==='#text')return n.value||''; return (n.childNodes||[]).map(text).join('');}
export function els(root,name){const out=[]; walk(root,n=>{if(n.tagName===name)out.push(n)}); return out;}
export function walk(n,fn){fn(n); for(const c of n.childNodes||[])walk(c,fn)}
export function attr(n,k){return n.attrs?.find(a=>a.name===k)?.value||''}
export function setAttr(n,k,v){n.attrs=n.attrs||[]; const a=n.attrs.find(a=>a.name===k); if(a)a.value=v; else n.attrs.push({name:k,value:v});}
export function hasClass(n,c){return (` ${attr(n,'class')} `).includes(` ${c} `)}
export function parent(root,target){let p=null; walk(root,n=>{for(const c of n.childNodes||[])if(c===target)p=n}); return p;}
export function indexInParent(root,n){const p=parent(root,n); return p?p.childNodes.indexOf(n):-1}
export function before(root,ref,nodes){const p=parent(root,ref),i=indexInParent(root,ref); p.childNodes.splice(i,0,...nodes);}
export function after(root,ref,nodes){const p=parent(root,ref),i=indexInParent(root,ref); p.childNodes.splice(i+1,0,...nodes);}
export function replace(root,oldn,nodes){const p=parent(root,oldn),i=indexInParent(root,oldn); p.childNodes.splice(i,1,...nodes);}
export function fragNodes(html){return parseFragment(html).childNodes;}
export function capbox(title, items){return fragNodes(`<!-- wp:loos/cap-block {"className":"is-style-onborder_ttl"} --><div class="swell-block-capbox cap_box is-style-onborder_ttl"><div class="cap_box_ttl"><span>${esc(title)}</span></div><div class="cap_box_content"><!-- wp:list --><ul class="wp-block-list">${items.map(i=>`<!-- wp:list-item --><li><a href="#${escAttr(i.id)}">${esc(i.title)}</a></li><!-- /wp:list-item -->`).join('')}</ul><!-- /wp:list --></div></div><!-- /wp:loos/cap-block -->`)}
export function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')} export function escAttr(s){return esc(s).replaceAll('"','&quot;')}
export function assignHeadingIds(root){const used=new Set(); for(const h2 of els(root,'h2')){let id=attr(h2,'id'); if(!id||used.has(id)){id=`section-${String([...els(root,'h2')].indexOf(h2)+1).padStart(2,'0')}`; setAttr(h2,'id',id)} used.add(id); let j=1; for(const h3 of sectionNodes(root,h2).filter(n=>n.tagName==='h3')){let hid=attr(h3,'id'); if(!hid||used.has(hid)){hid=`${id}-${String(j).padStart(2,'0')}`; setAttr(h3,'id',hid)} used.add(hid); j++;}}}
export function sectionNodes(root,heading){const p=parent(root,heading); const i=p.childNodes.indexOf(heading); const lvl=Number(heading.tagName.slice(1)); const out=[]; for(const n of p.childNodes.slice(i+1)){if(/^h[1-6]$/.test(n.tagName||'')&&Number(n.tagName.slice(1))<=lvl)break; out.push(n)} return out;}
export function sectionKeyMatch(sec,heading){if(sec.id&&attr(heading,'id')===sec.id)return true; return Number(sec.level||2)===Number(heading.tagName.slice(1)) && !sec.id && text(heading).trim()===sec.heading;}
export function findSection(root,sec){const hs=els(root,`h${sec.level||2}`).filter(h=>sectionKeyMatch(sec,h)); if(hs.length!==1) throw new Error(`セクションを一意に特定できません: ${JSON.stringify(sec)}`); return hs[0];}
export function isIn(root,n,pred){let p=parent(root,n); while(p){if(pred(p))return true; p=parent(root,p)} return false;}
export function capTitle(n){return hasClass(n,'swell-block-capbox')? text((n.childNodes||[]).find(c=>hasClass(c,CAP_TITLE_CLASS))).trim():''}
export function stripGeneratedText(root){
 const parts=[]; function rec(n){
  if(hasClass(n,'cap_box_ttl')) return;
  if(hasClass(n,'swell-block-capbox')&&['【この記事でわかること】','この章でわかること'].includes(capTitle(n))) return;
  if(n.nodeName==='#text') parts.push(n.value||'');
  for(const c of n.childNodes||[]) rec(c);
 }
 rec(root); return parts.join('').replace(/\s+/g,'');
}

export async function atomicWrite(file,content){const tmp=`${file}.tmp-${process.pid}`; await writeFile(tmp,content); await rename(tmp,file)}
export async function sourceFile(dir){const linked=path.join(dir,'article-linked.html'); return existsSync(linked)&&(await stat(linked)).size>0?linked:path.join(dir,'article.html')}

export function articleDir(slug) { return path.join('articles', slug); }
export async function readDecorated(slug) {
  const file = path.join(articleDir(slug), 'article-decorated.html');
  if (!existsSync(file)) throw new Error('article-decorated.html が存在しません');
  const html = await readFile(file, 'utf8');
  if (!html.trim()) throw new Error('article-decorated.html が空です');
  if (/<h1\b/i.test(html)) throw new Error('article-decorated.html にH1があります');
  return { file, html, hash: sha256(html) };
}
export const POSITIVE_MARKER_CLASS='swl-marker';
export const POSITIVE_MARKER_STYLE_CLASS='mark_yellow';
export const NEGATIVE_MARKER_CLASS='has-swl-deep-01-color';
export function markerNodes(root){return [
  ...els(root,'span').filter(n=>hasClass(n,POSITIVE_MARKER_CLASS)&&hasClass(n,POSITIVE_MARKER_STYLE_CLASS)),
  ...els(root,'mark').filter(n=>hasClass(n,NEGATIVE_MARKER_CLASS)),
];}
function japaneseWordChar(ch){return /^[A-Za-z0-9_\u3040-\u30ff\u3400-\u9fff]$/u.test(ch||'')}
function textEdge(node, fromEnd=true){
  if(node.nodeName==='#text'){const s=node.value||''; return fromEnd?s.at(-1)||'':s[0]||''}
  const kids=node.childNodes||[]; const seq=fromEnd?[...kids].reverse():kids;
  for(const c of seq){const v=textEdge(c,fromEnd); if(v)return v}
  return ''
}
function adjacentTextSibling(root,node,previous=true){
  const p=parent(root,node); if(!p)return ''; const i=p.childNodes.indexOf(node);
  const seq=previous?[...p.childNodes.slice(0,i)].reverse():p.childNodes.slice(i+1);
  for(const n of seq){const v=textEdge(n,previous); if(v)return v}
  return ''
}
export function markerBoundaryErrors(root){
  const errors=[];
  for(const m of markerNodes(root)){
    const insideStart=textEdge(m,false), insideEnd=textEdge(m,true);
    const prev=adjacentTextSibling(root,m,true), next=adjacentTextSibling(root,m,false);
    const label=text(m).trim().slice(0,40);
    if(japaneseWordChar(insideEnd)&&japaneseWordChar(next)) errors.push(`マーカー終了位置が語句の途中の疑い: ${label}`);
  }
  return errors;
}
export function validateMarkerPlacement(root){
  const errors=[];
  const markers=markerNodes(root);
  for(const m of markers){
    if(!text(m).trim()) errors.push('空マーカー');
    if(isIn(root,m,n=>['a','li','ul','ol','table','thead','tbody','tr','td','th','h1','h2','h3','h4','h5','h6'].includes(n.tagName)||/cta/i.test(attr(n,'class')))) errors.push('禁止箇所のマーカー');
    if((m.childNodes||[]).some(c=>markerNodes(c).length>0)) errors.push('マーカー入れ子');
  }
  errors.push(...markerBoundaryErrors(root));
  for(const h of [...els(root,'h2'),...els(root,'h3')]){
    const nodes=sectionNodes(root,h);
    const scope=h.tagName==='h2'?nodes.slice(0,nodes.findIndex(n=>n.tagName==='h3')>=0?nodes.findIndex(n=>n.tagName==='h3'):nodes.length):nodes;
    const paragraphs=scope.filter(n=>n.tagName==='p'&&!isIn(root,n,x=>hasClass(x,'swell-block-capbox')||['li','ul','ol','table','thead','tbody','tr','td','th'].includes(x.tagName))&&text(n).trim());
    if(!paragraphs.length) continue;
    const count=paragraphs.reduce((sum,p)=>sum+markerNodes(p).length,0);
    if(count===0) errors.push(`本文マーカーなし: ${text(h).trim()}`);
    if(count>=3) errors.push(`マーカー過多: ${text(h).trim()}`);
  }
  return errors;
}
export function validateDecoratedHtml(html) {
  const errors = [];
  const ids = [...html.matchAll(/id=["']([^"']+)["']/gi)].map((m) => m[1]);
  const seen = new Set();
  for (const id of ids) { if (seen.has(id)) errors.push(`IDが重複しています: ${id}`); seen.add(id); }
  for (const href of [...html.matchAll(/href=["']#([^"']*)["']/gi)].map((m) => m[1])) { if (!href) errors.push('空のアンカーリンクがあります'); else if (!seen.has(href)) errors.push(`存在しないページ内アンカーがあります: #${href}`); }
  if (/href=["']#["']/i.test(html) || /href=["']["']/i.test(html)) errors.push('空のhrefがあります');
  if ((html.match(/swell-block-capbox|cap_box/g) || []).length && !/cap_box_content/.test(html)) errors.push('capboxの本文領域が見つかりません');
  errors.push(...validateMarkerPlacement(parseFragment(html)));
  return errors;
}
export async function writeDecorationManifest(slug) {
  const { html, hash } = await readDecorated(slug);
  const errors = validateDecoratedHtml(html);
  if (errors.length) throw new Error(errors.join('\n'));
  const manifest = { slug, file: 'article-decorated.html', sha256: hash };
  await writeFile(path.join(articleDir(slug), 'decoration-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export async function checkDecorationManifest(slug, { requireManifest = true } = {}) {
  const { html, hash } = await readDecorated(slug);
  const errors = validateDecoratedHtml(html);
  const manifestPath = path.join(articleDir(slug), 'decoration-manifest.json');
  if (!existsSync(manifestPath)) { if (requireManifest) errors.push('decoration-manifest.json が存在しません'); }
  else {
    let manifest;
    try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { errors.push('decoration-manifest.json が有効なJSONではありません'); }
    if (manifest && manifest.sha256 && manifest.sha256 !== hash) errors.push('decoration-manifest.json のSHA-256とarticle-decorated.htmlが一致しません');
    if (manifest && manifest.decorated_sha256 && manifest.decorated_sha256 !== hash) errors.push('decoration-manifest.json のdecorated_sha256とarticle-decorated.htmlが一致しません');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { sha256: hash };
}
