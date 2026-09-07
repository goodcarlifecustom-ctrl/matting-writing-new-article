import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { argvValue, parseScalar } from './workflow-utils.mjs';
import { validateGutenbergContent, visibleCharCount, stripTags } from './gutenberg-utils.mjs';
import { canonicalHeadings, compareDerivedHtml, htmlHeadingStructure, lintReaderContent } from './content-integrity.mjs';

const slug = argvValue(process.argv, 'slug');
const mode = argvValue(process.argv, 'mode') || 'draft';
if (!slug || !['draft', 'publish'].includes(mode)) {
  console.error('Usage: node scripts/check-article.mjs --mode <draft|publish> --slug <slug>');
  process.exit(1);
}

const dir = path.join('articles', slug);
await mkdir(dir, { recursive: true });
const errors = [], warnings = [], passes = [];
const error = (code, message, action = '原因を修正して再検証してください。') => errors.push({ code, message, action });
const warning = (code, message, action = '公開前に再確認してください。') => warnings.push({ code, message, action });
const pass = (message) => passes.push(message);
const read = async (file) => existsSync(path.join(dir, file)) ? readFile(path.join(dir, file), 'utf8') : '';

const required = ['input.yml', 'metadata.json', 'research.md', 'draft.md', 'article.html', 'article-linked.html', 'article-decorated.html'];
for (const file of required) {
  const target = path.join(dir, file);
  if (!existsSync(target) || (await stat(target)).size === 0) error('CONTENT_MISSING', `${file} がないか空です`);
  else pass(`${file} を確認しました`);
}

const input = await read('input.yml');
let metadata = {};
try { metadata = JSON.parse(await read('metadata.json')); pass('metadata.json は有効なJSONです'); }
catch { error('METADATA_INVALID', 'metadata.json が有効なJSONではありません'); }
const renderProfile = parseScalar(input, 'render_profile') || metadata.render_profile || 'gutenberg_blocks';
if (!['gutenberg_blocks', 'swell_plain_headings'].includes(renderProfile)) error('RENDER_PROFILE_UNKNOWN', `未知のrender_profileです: ${renderProfile}`);
if (metadata.status !== 'draft') error('DRAFT_STATUS_UNLOCKED', 'status を draft に固定できません');
if (metadata.slug && metadata.slug !== slug) error('SLUG_MISMATCH', 'CLI、ディレクトリ、metadata.jsonのslugが一致しません');

for (const file of ['article.html', 'article-linked.html', 'article-decorated.html']) {
  const html = await read(file); if (!html) continue;
  if (/<h1\b/i.test(html)) error('H1_PRESENT', `${file} にH1があります`);
  const validation = validateGutenbergContent(html, { title: metadata.title, renderProfile });
  for (const message of validation.errors) error('STRUCTURE_FATAL', `${file}: ${message}`);
  const ids = [...html.matchAll(/\bid=["']([^"']*)["']/gi)].map((m) => m[1]);
  if (ids.some((id) => !id.trim())) error('EMPTY_ID', `${file} に空IDがあります`);
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (duplicates.length) error('DUPLICATE_ID', `${file} に重複IDがあります: ${duplicates.join(', ')}`);
  for (const anchor of [...html.matchAll(/href=["']#([^"']*)["']/gi)].map((m) => m[1])) if (!anchor || !ids.includes(anchor)) error('UNRESOLVED_ANCHOR', `${file} に未解決アンカー #${anchor} があります`);
  if (renderProfile === 'swell_plain_headings' && /<!--\s*wp:heading\b/i.test(html)) warning('LEGACY_HEADING_CONFLICT', `${file} にwp:headingが残っています（プレーン見出しとの混在）`);
}

const sourceArticle = await read('article.html');
const linked = await read('article-linked.html');
const decorated = await read('article-decorated.html');
for (const [file, html] of [['article-linked.html', linked], ['article-decorated.html', decorated]]) {
  if (!sourceArticle || !html) continue;
  const differences = compareDerivedHtml(sourceArticle, html);
  if (differences.length) error('DERIVED_CONTENT_MISMATCH', `${file}がarticle.htmlと一致しません: ${differences.join('、')}`, 'article.htmlの本文を変えず、リンク追加または装飾工程をやり直してください。');
  else pass(`${file}の可視本文・見出し・FAQ・内部アンカー・表を維持しています`);
}
if (existsSync(path.join(dir, 'approved_outline.json')) && decorated) {
  try {
    const approved = JSON.parse(await read('approved_outline.json'));
    const expected = canonicalHeadings(approved);
    await writeFile(path.join(dir, 'canonical-headings.json'), JSON.stringify(expected, null, 2) + '\n');
    const actual = htmlHeadingStructure(decorated);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) error('APPROVED_OUTLINE_MISMATCH', 'article-decorated.htmlの見出しレベル・文言・IDがapproved_outline.jsonと一致しません', '承認済み見出しを変更せず本文側を復元してください。');
    else pass('承認済み見出しのレベル・文言・ID・親子関係・順序・件数を維持しています');
  } catch (e) { error('APPROVED_OUTLINE_INVALID', `approved_outline.jsonを検証できません: ${e.message}`); }
}

const rejectInternalStatusTerms = parseScalar(input, 'reject_internal_status_terms') ?? metadata.reader_content_policy?.reject_internal_status_terms;
const readerPolicy = {
  max_warning_boxes: parseScalar(input, 'max_warning_boxes') ?? metadata.reader_content_policy?.max_warning_boxes,
  max_unverified_markers: parseScalar(input, 'max_unverified_markers') ?? metadata.reader_content_policy?.max_unverified_markers,
  reject_internal_status_terms: rejectInternalStatusTerms === undefined ? true : !['false', '0', 'no', 'off'].includes(String(rejectInternalStatusTerms).toLowerCase())
};
for (const message of lintReaderContent(decorated, readerPolicy)) error('READER_CONTENT_LINT', message, '内部ステータスや反復した注意書きを読者向け本文から除いてください。');

const research = await read('research.md');
const sourceUncertain = /\b(PARTIAL|ACCESS_BLOCKED|HTTP\s*(?:000|401|403))\b/i.test(research);
if (sourceUncertain) warning('SOURCE_REVERIFY', '一次情報にPARTIAL、ACCESS_BLOCKED、またはアクセス失敗があります');
if (!metadata.research_date || /##\s*情報確認日\s*\n+\s*(?:未確認|未取得)/.test(research)) warning('RESEARCH_DATE_MISSING', '情報確認日を取得できていません');
const min = Number(metadata.min_char_count ?? metadata.min_word_count ?? 0), length = visibleCharCount(decorated);
if (min && length < min) warning('MIN_LENGTH_SHORT', `最低文字数 ${min} に対し ${length} 文字です`);
const markers = (decorated.match(/swl-marker|<mark\b/gi) || []).length;
if (decorated && markers < 2) warning('MARKER_DENSITY_LOW', `マーカーが${markers}件です`);
if (decorated && !/swell-block-capbox/.test(decorated)) warning('DECORATION_DENSITY_LOW', 'SWELL装飾または章別ナビゲーションが不足しています');

// These patterns intentionally stay narrow: they flag guarantees and unsafe adult-content claims,
// not ordinary cautionary prose. Human review remains required for nuanced claims.
if (/(必ず|確実に)(出会える|会える|稼げる|成功する)|100%安全|絶対安全/.test(stripTags(decorated))) error('HIGH_RISK_UNSUPPORTED_CLAIM', '根拠のない高リスクな保証表現があります');
const adultTopic = /(成人|18歳|出会い|マッチング|エロ|性行為|ライブチャット)/.test(`${metadata.target_keyword || ''}${stripTags(decorated).slice(0, 2000)}`);
if (adultTopic && !/(18歳以上|未成年.{0,12}(利用|禁止)|年齢確認)/.test(stripTags(decorated))) error('ADULT_SAFETY_FAIL', '成人向け記事に年齢・未成年利用防止の安全確認がありません');

const publishBlockers = mode === 'publish' ? warnings : [];
const blocked = errors.length > 0 || publishBlockers.length > 0;
const sourceStatus = sourceUncertain || !metadata.research_date ? 'REVERIFY_BEFORE_PUBLISH' : 'VERIFIED';
const decorationStatus = warnings.some((x) => /DECORATION|MARKER/.test(x.code)) ? 'WARNING' : 'PASS';
Object.assign(metadata, {
  render_profile: renderProfile,
  content_status: errors.some((x) => ['APPROVED_OUTLINE_MISMATCH', 'H1_PRESENT', 'HIGH_RISK_UNSUPPORTED_CLAIM', 'ADULT_SAFETY_FAIL'].includes(x.code)) ? 'ERROR' : 'PASS',
  source_verification_status: sourceStatus,
  decoration_status: decorationStatus,
  draft_readiness: errors.length ? 'NOT_READY' : 'DRAFT_READY',
  publish_readiness: errors.length || warnings.length ? 'REVERIFY_BEFORE_PUBLISH' : 'PUBLISH_READY',
  wordpress_draft: false,
  post_to_wp: false,
  wordpress_status: 'DISABLED',
  delivery_mode: 'manual_copy',
  primary_output: 'article-decorated.html',
  copy_ready: !blocked,
  external_write_performed: false,
  validation_updated_at: new Date().toISOString()
});
if (Object.keys(metadata).length) { const tmp = path.join(dir, `.metadata-${process.pid}.tmp`); await writeFile(tmp, JSON.stringify(metadata, null, 2) + '\n'); await rename(tmp, path.join(dir, 'metadata.json')); }
const lines = [
  '# 品質チェックレポート', '', `- slug: ${slug}`, `- mode: ${mode}`, `- result: ${blocked ? 'FAIL' : 'PASS'}`,
  `- draft_readiness: ${metadata.draft_readiness}`, `- publish_readiness: ${metadata.publish_readiness}`,
  `- copy_ready: ${metadata.copy_ready}`, '- delivery_mode: manual_copy', '- copy_source: article-decorated.html', '- external_write_performed: false', '',
  '## ERROR', '', ...(errors.length ? errors.map((x) => `- [${x.code}] ${x.message}\n  - 次アクション: ${x.action}`) : ['- なし']), '',
  '## WARNING', '', ...(warnings.length ? warnings.map((x) => `- [${x.code}] ${x.message}\n  - 次アクション: ${x.action}`) : ['- なし']), '',
  '## PASS', '', ...passes.map((x) => `- ${x}`), ''
];
await writeFile(path.join(dir, 'check-report.md'), lines.join('\n'));
console.log(lines.join('\n'));
if (blocked) process.exit(1);
