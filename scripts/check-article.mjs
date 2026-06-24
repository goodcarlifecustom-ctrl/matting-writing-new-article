import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { execSync } from 'node:child_process';
import { argvValue, isUnresolved, parseList, parseScalar } from './workflow-utils.mjs';
import { redact } from './wordpress-utils.mjs';
import { validateGutenbergContent, visibleCharCount } from './gutenberg-utils.mjs';
const execFileAsync = promisify(execFile);

function visibleTextLength(html) { return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--([\s\S]*?)-->/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, '').length; }
function scanRepo(pattern) { try { return execSync(`rg -n "${pattern}" . -g '!node_modules' -g '!.git'`, { encoding: 'utf8' }).trim(); } catch { return ''; } }
function anchors(html) { return [...html.matchAll(/id=["']([^"']+)["']/gi)].map((m) => m[1]); }
function stripTags(html) { return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim(); }
function headingSections(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const matches = [...html.matchAll(re)];
  return matches.map((m, i) => {
    const start = m.index + m[0].length;
    const nextHeading = html.slice(start).search(/<h[23]\b/i);
    const next = nextHeading >= 0 ? start + nextHeading : html.length;
    if (tag === 'h3') {
      const boundary = html.slice(start, next).search(/<h[23]\\b/i);
      return { heading: stripTags(m[1]), body: html.slice(start, boundary >= 0 ? start + boundary : next) };
    }
    return { heading: stripTags(m[1]), body: html.slice(start, next) };
  });
}
function paragraphs(html) { return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => stripTags(m[1])).filter(Boolean); }
function firstVisibleBlockText(html) { const m = html.match(/<(p|div|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/i); return m ? stripTags(m[2]) : stripTags(html).slice(0, 120); }
function headings(html) { return [...html.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: stripTags(m[2]), index: m.index })); }
function tableFirstColumnValues(tableHtml) {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => {
    const cells = [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)];
    return cells.length ? stripTags(cells[0][1]) : '';
  }).filter((v) => v && !/^サービス名$|^項目$/.test(v));
}
function adjacentTablesWithDuplicateFirstColumn(html) {
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)];
  const problems = [];
  for (let i = 0; i < tables.length - 1; i++) {
    const between = html.slice(tables[i].index + tables[i][0].length, tables[i + 1].index);
    if (stripTags(between)) continue;
    const a = new Set(tableFirstColumnValues(tables[i][0]));
    const b = new Set(tableFirstColumnValues(tables[i + 1][0]));
    const base = Math.min(a.size, b.size);
    if (!base) continue;
    const overlap = [...a].filter((v) => b.has(v)).length / base;
    if (overlap >= 0.6) problems.push(`${Math.round(overlap * 100)}%`);
  }
  return problems;
}
function likelyFlattenedHeadingRuns(html) {
  const hs = headings(html);
  const problems = [];
  for (let i = 0; i < hs.length; i++) {
    if (hs[i].level !== 2) continue;
    let run = 1;
    for (let j = i + 1; j < hs.length && hs[j].level === 2; j++) run++;
    if (run < 4) continue;
    const block = html.slice(hs[i].index, hs[i + run]?.index ?? html.length);
    const paragraphsBetween = (block.match(/<p\b/gi) || []).length;
    if (paragraphsBetween <= run + 1) problems.push(`${hs[i].text} から ${run}件`);
  }
  return problems;
}
const slug = argvValue(process.argv, 'slug');
if (!slug) { console.error('Usage: npm run check -- --slug slug'); process.exit(1); }
const dir = path.join('articles', slug); await mkdir(dir, { recursive: true });
const required = ['input.yml','metadata.json','research.md','serp.md','headings.csv','heading-analysis.md','heading-plan.md','draft.md','article.html','article-linked.html','article-decorated.html','external-links.md'];
const results = []; let ok = true;
async function fail(message, action = '修正してください') { ok = false; results.push(`- NG: ${message}\n  - 次アクション: ${action}`); }
function pass(message) { results.push(`- OK: ${message}`); }
for (const file of required) { const target = path.join(dir, file); if (!existsSync(target)) await fail(`${file} がありません`); else if ((await stat(target)).size === 0 && !['input.yml','metadata.json'].includes(file)) await fail(`${file} が空です`); else pass(`${file} を確認しました`); }
const input = existsSync(path.join(dir, 'input.yml')) ? await readFile(path.join(dir, 'input.yml'), 'utf8') : '';
let metadata = {}; try { metadata = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8')); pass('metadata.json は有効なJSONです'); } catch { await fail('metadata.json が有効なJSONではありません'); }
const research = existsSync(path.join(dir, 'research.md')) ? await readFile(path.join(dir, 'research.md'), 'utf8') : '';
if (research.trim().length < 50) await fail('research.md が空または短すぎます'); else pass('research.md は空ではありません');
const mainKeyword = parseScalar(input, 'main_keyword') || parseScalar(input, 'keyword');
const related = parseList(input, 'related_keywords');
if (!mainKeyword) await fail('main_keyword がありません'); else pass('main_keyword を確認しました');
if (!Array.isArray(related) || related.length === 0) await fail('related_keywords が配列として存在しません'); else pass('related_keywords 配列を確認しました');
for (const key of ['title','slug','meta_description','search_intent','persona','article_type','target_word_count']) { if (isUnresolved(metadata[key])) await fail(`metadata.json の ${key} が未確定です`); else pass(`${key} は生成済みです`); }
if (metadata.status !== 'draft') await fail('metadata.json の status が draft ではありません'); else pass('status: draft を確認しました');
const minCount = Number(metadata.min_char_count ?? metadata.min_word_count);
const targetCount = Number(metadata.target_char_count ?? metadata.target_word_count);
const maxCount = Number(metadata.max_char_count ?? metadata.max_word_count);
for (const [key, value] of [['min_char_count/min_word_count', minCount], ['target_char_count/target_word_count', targetCount], ['max_char_count/max_word_count', maxCount]]) { if (!Number.isSafeInteger(value) || value <= 0) await fail(`metadata.json の ${key} が正の数値ではありません`); else pass(`${key} を確認しました`); }
if (minCount > targetCount || targetCount > maxCount) await fail('文字数設定が min <= target <= max を満たしていません'); else pass('文字数設定の大小関係を確認しました');
if (metadata.wordpress_draft !== undefined && metadata.post_to_wp !== undefined && metadata.wordpress_draft !== metadata.post_to_wp) await fail('wordpress_draft と post_to_wp が矛盾しています'); else pass('wordpress_draft と post_to_wp の整合性を確認しました');
for (const key of ['target_media','article_type','persona','article_purpose']) { const v = key === 'target_media' ? parseScalar(input, key) : (metadata[key] || parseScalar(input, key)); if (isUnresolved(v)) await fail(`${key} が未入力です`); else pass(`${key} を確認しました`); }
if (typeof metadata.post_to_wp !== 'boolean') await fail('metadata.json の post_to_wp がbooleanではありません'); else pass('post_to_wp はbooleanです');
if (metadata.slug && metadata.slug !== slug) await fail('slug がパスとmetadata.jsonで一致しません'); else pass('slug は一致しています');
if (metadata.target_keyword && mainKeyword && metadata.target_keyword !== mainKeyword) await fail('メインキーワードがファイル間で一致しません'); else pass('メインキーワードは一致しています');
for (const f of ['article.html','article-linked.html','article-decorated.html']) {
  if (!existsSync(path.join(dir, f))) continue; const html = await readFile(path.join(dir, f), 'utf8');
  if (!html.trim()) continue; const gb = validateGutenbergContent(html, { title: metadata.title }); if (!gb.ok) await fail(`${f} のGutenberg検証に失敗しました: ${gb.errors.join(' / ')}`); else pass(`${f} はGutenbergブロックとして有効です`); if (/<h1\b/i.test(html)) await fail(`${f} にH1があります`); else pass(`${f} にH1はありません`);
  const hs = headings(html);
  const h3Count = hs.filter((h) => h.level === 3).length;
  if (hs.length >= 8 && h3Count === 0) await fail(`${f} は見出しが8件以上あるのにH3が0件です`, '主要章をH2、章内項目をH3に戻してください');
  else pass(`${f} のH2/H3件数を確認しました`);
  const duplicateTables = adjacentTablesWithDuplicateFirstColumn(html);
  if (duplicateTables.length) await fail(`${f} に先頭列が60%以上重複する隣接テーブルがあります（${duplicateTables.join(', ')}）`, '同じサービス一覧を軸にした比較表は統合してください');
  else pass(`${f} の隣接テーブル重複を確認しました`);
  const flatRuns = likelyFlattenedHeadingRuns(html);
  if (flatRuns.length) await fail(`${f} に親子構造にすべきH2連続が疑われます: ${flatRuns.join(' / ')}`, '章内項目はH3へ変更してください');
  else pass(`${f} のH2連続構造を確認しました`);
  if (/<a\b[^>]*>\s*<\/a>/i.test(html)) await fail(`${f} に空のaタグがあります`);
  const ids = anchors(html); for (const href of [...html.matchAll(/href=["']#([^"']+)["']/gi)].map((m)=>m[1])) if (!ids.includes(href)) await fail(`${f} に存在しない内部アンカー #${href} があります`);
  const opening = firstVisibleBlockText(html);
  if (/^(結論|要点|ポイント)\s*[：:]/.test(opening)) results.push(`- WARN: ${f} の記事冒頭が「結論：」「要点：」「ポイント：」などのラベルで始まっています`); else pass(`${f} の冒頭ラベルを確認しました`);
  for (const section of headingSections(html, 'h3')) {
    const ps = paragraphs(section.body);
    if (ps.length === 1) results.push(`- WARN: ${f} のH3「${section.heading}」が1段落だけで終わっています`);
    else if (ps.length > 0 && (ps.length < 2 || ps.length > 4)) results.push(`- WARN: ${f} のH3「${section.heading}」の段落数が${ps.length}段落です`);
    else if (ps.length >= 2) pass(`${f} のH3「${section.heading}」は2〜4段落です`);
    const sectionText = stripTags(section.body);
    if (sectionText.length > 0 && sectionText.length < 100) results.push(`- WARN: ${f} のH3「${section.heading}」が100文字未満で完結しています`);
    const last = ps.at(-1) || sectionText;
    if (/(場合があります|確認しましょう)[。.!！]?\s*$/.test(last)) results.push(`- WARN: ${f} のH3「${section.heading}」が曖昧な確認促しだけで終わっています`);
  }
}
const decorated = existsSync(path.join(dir, 'article-decorated.html')) ? await readFile(path.join(dir, 'article-decorated.html'), 'utf8') : '';
const len = visibleCharCount(decorated); const target = targetCount;
if (minCount && len < minCount) await fail('本文文字数が最低文字数を下回っています', `最低 ${minCount} に対し本文 ${len}`);
else if (maxCount && len > maxCount) await fail('本文文字数が上限文字数を上回っています', `上限 ${maxCount} に対し本文 ${len}`);
else if (target && (len < target * 0.5 || len > target * 1.6)) await fail('本文文字数が目標文字数から大きく外れています', `目標 ${target} に対し本文 ${len}`); else if (target) pass('本文文字数は目標から大きく外れていません');
if (/https?:\/\/[^"'<>\s]+/.test(decorated.replace(/<a\b[^>]*href=["'][^"']+["'][^>]*>/gi, '<a>'))) await fail('外部URLのベタ書きがあります'); else pass('外部URLのベタ書きは検出されません');
try { const trackedEnv = execSync('git status --short .env', { encoding: 'utf8' }).trim(); if (trackedEnv) await fail('.env がGitの変更対象です'); else pass('.env はコミット対象ではありません'); } catch { results.push('- WARN: git statusで.envを確認できませんでした'); }
const secretPattern = 'WP_APP_PASSWORD=.+|WP_APPLICATION_PASSWORD=.+|Authori' + 'zation:|Ba' + 'sic [A-Za-z0-9+/=]{20,}|_wp' + 'nonce|preview_' + 'nonce';
const leaks = scanRepo(secretPattern).split('\n').filter((line) => line && !line.includes('check-article.mjs') && !line.includes('README.md') && !line.includes('rules/99-quality-check.md') && !line.includes('scripts/post-wp-draft.mjs')).join('\n');
if (leaks) await fail('認証情報またはnonceらしき文字列が残っています', leaks); else pass('認証情報・nonceの残存は検出されませんでした');
if (metadata.post_to_wp === false) pass('post_to_wp:false のためWordPress環境変数は要求しません');
else { for (const k of ['WP_SITE_URL','WP_USERNAME','WP_APPLICATION_PASSWORD']) if (!process.env[k]) results.push(`- WARN: post_to_wp:true ですが ${k} が未設定です（投稿コマンド実行時に必須）`); pass('WordPress投稿ステータスはwp:draftでdraft固定です'); }
const report = `# 品質チェックレポート\n\n- slug: ${slug}\n- result: ${ok ? 'PASS' : 'FAIL'}\n\n## 詳細\n\n${results.join('\n')}\n`;
await writeFile(path.join(dir, 'check-report.md'), report, 'utf8'); console.log(report); if (!ok) process.exit(1);

function hasWpEnv(env = process.env) { return Boolean((env.WP_SITE_URL || env.WP_REST_ROOT) && env.WP_USERNAME && (env.WP_APPLICATION_PASSWORD || env.WP_APP_PASSWORD)); }
if (metadata.post_to_wp === true && process.env.ARTICLE_CHECK_SKIP_WP_AUTOSYNC !== '1') {
  if (process.env.ARTICLE_CHECK_ENABLE_WP_AUTOSYNC !== '1') {
    console.log('\n[wordpress autosync] skipped: local-only validation completed. Set ARTICLE_CHECK_ENABLE_WP_AUTOSYNC=1 to sync WordPress.');
    process.exit(0);
  }
  if (!hasWpEnv()) {
    console.log('\n[wordpress autosync] skipped: WordPress environment variables are not set; local-only validation completed.');
    process.exit(0);
  }
  const env = { ...process.env, ARTICLE_CHECK_SKIP_WP_AUTOSYNC: '1' };
  async function runAuto(label, args) {
    console.log(`\n[${label}] npm ${args.join(' ')}`);
    try {
      const { stdout, stderr } = await execFileAsync('npm', args, { env, maxBuffer: 16 * 1024 * 1024 });
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    } catch (error) {
      const out = `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`;
      console.error(redact(`${label} failed\n${out}`));
      process.exit(1);
    }
  }
  await runAuto('decoration check', ['run', 'check:decoration', '--', '--slug', slug]);
  await runAuto('wordpress doctor', ['run', 'wp:doctor']);
  await runAuto('wordpress draft', ['run', 'wp:draft', '--', '--slug', slug, '--confirm', '--adopt-existing']);
}
