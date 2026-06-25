import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

function values(name) { return process.argv.flatMap((v, i, a) => v === `--${name}` ? [a[i + 1]] : []).filter(Boolean); }
function arg(name) { return values(name)[0]; }
function stripTags(html) { return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function decodeEntities(text) { return text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); }
function cleanText(html) { return decodeEntities(stripTags(html)).replace(/[【】「」｜]/g, '').replace(/\s+/g, ' ').trim(); }
function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function yamlValue(text, key) { const m = text.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm')); return m?.[1]?.trim(); }
function yamlList(text, key) {
  const scalar = yamlValue(text, key);
  if (scalar) return scalar.split(',').map((v) => v.trim()).filter(Boolean);
  const lines = text.split(/\r?\n/); const out = []; let inList = false;
  for (const line of lines) {
    if (new RegExp(`^${key}:\\s*$`).test(line)) { inList = true; continue; }
    if (inList && /^\s*-\s+/.test(line)) out.push(line.replace(/^\s*-\s+/, '').replace(/^['"]|['"]$/g, '').trim());
    else if (inList && /^\S/.test(line)) break;
  }
  return out;
}
function isExcluded(url) {
  const u = url.toLowerCase();
  const reasons = [];
  if (/wikipedia\.org/.test(u)) reasons.push('Wikipedia');
  if (/youtube\.com|youtu\.be|twitter\.com|x\.com|instagram\.com|facebook\.com|reddit\.com|5ch\.net|detail\.chiebukuro\.yahoo\.co\.jp|oshiete\.goo\.ne\.jp/.test(u)) reasons.push('UGC/SNS/動画');
  if (/\.pdf($|[?#])/.test(u)) reasons.push('PDF');
  if (/go\.jp|lg\.jp|police\.|mlit\.go\.jp/.test(u)) reasons.push('公的機関');
  if (/amazon\.|rakuten\.|yahoo\.co\.jp\/shopping/.test(u)) reasons.push('ECサイト');
  if (/atarijo\.com\/media/.test(u)) reasons.push('対象メディア');
  return reasons;
}
async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 article-production heading research' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (/pdf/i.test(type)) throw new Error('PDFは見出し参考対象外です');
  return await res.text();
}
function extractPage(url, html, rank) {
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || url);
  let parent = ''; let order = 0;
  const headings = [...html.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => {
    const tag = `h${m[1]}`; const heading = cleanText(m[2]);
    if (!heading) return null; order += 1; if (tag === 'h2') parent = heading;
    return { rank, url, page_title: title, tag, heading_text: heading, parent_h2: tag === 'h3' ? parent : '', order };
  }).filter(Boolean);
  return { title, headings };
}
async function searchUrls(keyword) {
  const endpoint = `https://duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`;
  const html = await fetchHtml(endpoint);
  return [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/g)].map((m) => decodeURIComponent(m[1].replace(/^\/l\/\?uddg=/, '').split('&')[0])).filter((u) => /^https?:\/\//.test(u));
}

const slug = arg('slug');
if (!slug) { console.error('Usage: npm run extract -- --slug slug [--keyword KW|--main_keyword KW] [--url https://...]'); process.exit(1); }
const dir = path.join('articles', slug); await mkdir(dir, { recursive: true });
const inputText = existsSync(path.join(dir, 'input.yml')) ? await readFile(path.join(dir, 'input.yml'), 'utf8') : '';
const mainKeyword = arg('main_keyword') || arg('keyword') || yamlValue(inputText, 'main_keyword') || yamlValue(inputText, 'keyword') || '';
const title = arg('title') || yamlValue(inputText, 'title') || '';
const targetWordCount = arg('target_word_count') || yamlValue(inputText, 'target_word_count') || '';
const relatedKeywords = yamlList(inputText, 'related_keywords');
const providedUrls = [...values('url'), ...yamlList(inputText, 'reference_urls')];
const searchQueries = [mainKeyword, ...relatedKeywords.slice(0, 3)].filter(Boolean).slice(0, 5);
const candidates = providedUrls.length ? providedUrls : [...new Set((await Promise.all(searchQueries.map((q) => searchUrls(q).catch(() => [])))).flat())];
const selected = []; const excluded = []; const rows = [];
let extractionFailed = false;
for (const url of candidates) {
  if (selected.length >= 3) break;
  const reasons = isExcluded(url);
  if (reasons.length) { excluded.push({ url, reason: reasons.join('、') }); continue; }
  try {
    const html = await fetchHtml(url); const page = extractPage(url, html, selected.length + 1);
    if (!page.headings.some((h) => h.tag === 'h2')) { excluded.push({ url, reason: 'H2を抽出できないため' }); continue; }
    selected.push({ url, title: page.title, headings: page.headings }); rows.push(...page.headings);
  } catch (e) { excluded.push({ url, reason: `抽出失敗: ${e.message}` }); }
}
const csv = ['rank,url,page_title,tag,heading_text,parent_h2,order', ...rows.map((r) => [r.rank,r.url,r.page_title,r.tag,r.heading_text,r.parent_h2,r.order].map(csvCell).join(','))].join('\n') + '\n';
await writeFile(path.join(dir, 'headings.csv'), csv, 'utf8');
let serp = `# SERP・見出し調査\n\n- main_keyword: ${mainKeyword}\n- title: ${title}\n- target_word_count: ${targetWordCount}\n- 検索日: ${new Date().toISOString().slice(0,10)}\n\n## 参考にしたURL\n\n`;
for (const s of selected) serp += `- ${s.headings[0]?.rank}位相当: ${s.url}\n  - title: ${s.title}\n  - H2/H3概要: ${s.headings.slice(0,20).map((h)=>`${h.tag.toUpperCase()} ${h.heading_text}`).join(' / ')}\n`;
serp += '\n## 除外したURL\n\n' + (excluded.map((e) => `- ${e.url}\n  - 理由: ${e.reason}`).join('\n') || '- なし') + '\n';
if (selected.length < 3) {
  extractionFailed = true;
  serp += `\n## 見出し抽出失敗時の対応\n\n- 実際に取得できた参考URL数: ${selected.length}\n- 上位サイトや競合見出しは推測で作成していません。\n- reference_urls がない場合は、参考URLを3件指定して再実行してください。\n`;
}
await writeFile(path.join(dir, 'serp.md'), serp, 'utf8');
const h3Counts = selected.map((s) => ({ url: s.url, count: s.headings.filter((h) => h.tag === 'h3').length })).sort((a,b)=>b.count-a.count);
const analysis = `# 見出し分析

## 上位ページの共通論点

- headings.csvから検索意図上同じテーマを統合して記録する。

## 上位ページ間で異なる論点

- 競合ごとの独自論点を記録する。

## 不足する論点

- 作成予定記事に不足する安全、同意、個人情報、法令、公式確認事項を記録する。

## 採用するトピック

- 必須、推奨、独自トピックに分類して記録する。

## 採用しないトピックと理由

- 検索意図、重複、安全性、違法助長リスクなどの理由で記録する。

## 独自に追加する情報

- 読者の安全判断に役立つチェックリスト、公式情報確認手順、相談窓口などを検討する。

## 一次情報が必要な箇所

- 料金、規約、年齢条件、法律、健康、安全情報。

## 別記事へ分けるべきトピック

- 検索意図が大きく異なる地域ガイド、個別サービスレビュー、法律解説。

## H3数の基準

- 最多競合のH3数（${h3Counts[0] ? `${h3Counts[0].url} / ${h3Counts[0].count}件` : '未取得'}）を参考にするが、無関係なテーマは追加しない。

## 競合見出しを一語一句コピーしていないことの確認

- heading-plan.md作成時に表現を言い換え、完全一致を避ける。
`;
await writeFile(path.join(dir, 'heading-analysis.md'), analysis, 'utf8');
const planPath = path.join(dir, 'heading-plan.md');
if (!existsSync(planPath) || (await readFile(planPath, 'utf8')).trim() === '') await writeFile(planPath, '', 'utf8');
if (extractionFailed && !providedUrls.length) {
  const report = `# 見出し調査失敗\n\n- reason: 検索結果取得または競合サイトのH2/H3抽出で、参考サイト3件を確認できませんでした。\n- action: reference_urls を3件指定して再実行してください。\n- note: 架空の上位サイトや競合見出しは作成していません。\n`;
  await writeFile(path.join(dir, 'check-report.md'), report, 'utf8');
}
console.log(`Wrote ${path.join(dir, 'serp.md')}, ${path.join(dir, 'headings.csv')}, ${path.join(dir, 'heading-analysis.md')}`);
