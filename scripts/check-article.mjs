import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { argvValue, parseScalar, SITE_PROFILE } from './workflow-utils.mjs';
import { findBlockHeadingBoundaryErrors, validateGutenbergContent, visibleCharCount, stripTags } from './gutenberg-utils.mjs';
import { canonicalHeadings, compareDerivedHtml, findEditorialDisclaimerOveruse, findEditorialProcessLeaks, htmlHeadingStructure, lintReaderContent } from './content-integrity.mjs';
import { auditAdultSafety, isAdultSafetyTopic, repeatedAdultSafetyNotices } from './adult-safety-audit.mjs';
import { auditReviewEvidence, requiredReviewHeadings } from './review-evidence.mjs';
import { auditPublishedSources, SOURCE_POLICY, validateSourceManifest, validateSourcePolicyConfiguration } from './source-policy.mjs';

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

const required = ['input.yml', 'metadata.json', 'source-manifest.json', 'research.md', 'draft.md', 'article.html', 'article-linked.html', 'article-decorated.html', 'external-links.md'];
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
  for (const message of findBlockHeadingBoundaryErrors(html)) error('BLOCK_HEADING_BOUNDARY', `${file}: ${message}`, 'ブロック構造を変えず、終了コメントと後続見出しの間に空行を1行入れてください。');
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
let approvedOutline = null;
if (existsSync(path.join(dir, 'approved_outline.json'))) {
  try {
    approvedOutline = JSON.parse(await read('approved_outline.json'));
    const expected = canonicalHeadings(approvedOutline);
    await writeFile(path.join(dir, 'canonical-headings.json'), JSON.stringify(expected, null, 2) + '\n');
    if (decorated) {
      const actual = htmlHeadingStructure(decorated);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) error('APPROVED_OUTLINE_MISMATCH', 'article-decorated.htmlの見出しレベル・文言・IDがapproved_outline.jsonと一致しません', '承認済み見出しを変更せず本文側を復元してください。');
      else pass('承認済み見出しのレベル・文言・ID・親子関係・順序・件数を維持しています');
    }
  } catch (e) { error('APPROVED_OUTLINE_INVALID', `approved_outline.jsonを検証できません: ${e.message}`); }
}

const readerPolicy = {
  max_warning_boxes: parseScalar(input, 'max_warning_boxes') ?? metadata.reader_content_policy?.max_warning_boxes,
  max_unverified_markers: parseScalar(input, 'max_unverified_markers') ?? metadata.reader_content_policy?.max_unverified_markers
};
for (const message of lintReaderContent(decorated, readerPolicy)) error('READER_CONTENT_LINT', message, '反復した段落・注意書き・未確認マーカーを読者向け本文から除いてください。');

const research = await read('research.md');
for (const finding of validateSourcePolicyConfiguration()) {
  error(finding.code, finding.message, 'config/source-policy.json を共通出典ルールに合う設定へ修正してください。');
}
let sourceManifest = { version: SOURCE_POLICY.manifest_version, sources: [] };
const sourceManifestText = await read('source-manifest.json');
if (sourceManifestText) {
  try {
    sourceManifest = JSON.parse(sourceManifestText);
    for (const finding of validateSourceManifest(sourceManifest)) {
      error(finding.code, finding.message, 'rules/00-source-policy.md に従って source-manifest.json を修正してください。');
    }
  } catch {
    error('SOURCE_MANIFEST_MISMATCH', 'source-manifest.json が有効なJSONではありません', 'source-manifest.json を有効なJSONへ修正してください。');
  }
} else error('SOURCE_MANIFEST_MISMATCH', 'source-manifest.json がないか空です', '記事ディレクトリへ有効な source-manifest.json を作成してください。');
const articleType = parseScalar(input, 'article_type') || metadata.article_type || '';
const reviewRequirement = requiredReviewHeadings({ articleType, approvedOutline });
const reviewEvidenceRequired = reviewRequirement.reviewArticle || reviewRequirement.headings.length > 0;
let sectionEvidence = null;
const sectionEvidenceText = await read('section-evidence.json');
if (sectionEvidenceText.trim()) {
  try { sectionEvidence = JSON.parse(sectionEvidenceText); }
  catch { error('SECTION_EVIDENCE_INVALID', 'section-evidence.json が有効なJSONではありません', '口コミ根拠を見出しID単位の有効なJSONへ修正してください。'); }
}
const reviewEvidenceFindings = auditReviewEvidence({ slug, articleType, approvedOutline, sourceManifest, sectionEvidence });
for (const finding of reviewEvidenceFindings) {
  error(finding.code, `${finding.heading_id ? `${finding.heading_id}: ` : ''}${finding.message}`, '許可された公式アプリストアの個別レビューまたは方法開示済み一次調査を見出しIDへ対応付け、本文生成前に再検証してください。');
}
if (reviewEvidenceRequired && reviewEvidenceFindings.length === 0) pass(`口コミ根拠ゲートは${reviewRequirement.headings.length}見出しすべてに合格しています`);
else if (!reviewEvidenceRequired) pass('口コミ根拠ゲートは対象外です');
const publishedSourceArtifacts = {};
for (const file of SOURCE_POLICY.published_artifacts || []) {
  publishedSourceArtifacts[file] = await read(file);
  if (!publishedSourceArtifacts[file].trim()) error('SOURCE_ARTIFACT_MISSING', `${file} がないか空のため出典検査を完了できません`, '公開成果物を完成させてから出典検査を再実行してください。');
}
let editorialFindingCount = 0;
for (const [file, content] of Object.entries(publishedSourceArtifacts)) {
  if (!content.trim()) continue;
  for (const finding of [...findEditorialProcessLeaks(content), ...findEditorialDisclaimerOveruse(content)]) {
    editorialFindingCount += 1;
    const location = finding.line ? `${file}:${finding.line}` : file;
    error(
      finding.code,
      `${location}: ${finding.message}: 「${finding.excerpt}」`,
      '制作事情はresearch.mdまたはcheck-report.mdへ移し、公開成果物には読者が対象を判断するための情報だけを書いてください。'
    );
  }
}
if (editorialFindingCount === 0) pass('公開成果物に制作過程の説明や反復した免責文はありません');
for (const finding of auditPublishedSources({
  artifacts: publishedSourceArtifacts,
  manifest: sourceManifest,
  targetMedia: metadata.target_media || parseScalar(input, 'target_media'),
  siteUrl: SITE_PROFILE.site_url
})) {
  error(finding.code, finding.message, '公的機関・公式サイト等の許可ソースへ差し替え、競合由来の記述と数値も削除して再検証してください。');
}
const sourcePolicyErrorCodes = new Set([
  'PROHIBITED_CITATION_SOURCE',
  'UNCLASSIFIED_CITATION_SOURCE',
  'RESEARCH_SOURCE_LEAK',
  'SOURCE_MANIFEST_MISMATCH',
  'SOURCE_ARTIFACT_MISSING',
  'AFFILIATE_LINK_AS_EVIDENCE',
  'REDIRECTOR_SOURCE_URL',
  'INSECURE_SOURCE_URL',
  'UNSOURCED_SURVEY_CLAIM',
  'SOURCE_POLICY_INVALID'
]);
if (!errors.some((finding) => sourcePolicyErrorCodes.has(finding.code))) pass('公開成果物の引用元は共通ソースポリシーに適合しています');
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
const matchingMedia = /^https?:\/\/(?:www\.)?matching\.writing-corp\.co\.jp(?:\/|$)/iu.test(metadata.target_media || '');
if (matchingMedia || isAdultSafetyTopic(`${metadata.title || ''} ${metadata.target_keyword || ''}`, decorated)) {
  for (const finding of auditAdultSafety(decorated)) {
    error(finding.code, `${finding.message}: ${finding.excerpt}`, '促進表現を削除し、必要な場合は規約・安全上の注意として中立的に説明してください。');
  }
  for (const finding of repeatedAdultSafetyNotices(decorated)) {
    error(finding.code, `${finding.message}: ${finding.excerpt}`, '年齢条件と年齢確認の定型警告を本文へ繰り返さないでください。');
  }
}

const publishBlockers = mode === 'publish' ? warnings : [];
const blocked = errors.length > 0 || publishBlockers.length > 0;
const sourcePolicyFailed = errors.some((finding) => sourcePolicyErrorCodes.has(finding.code));
const sourceStatus = sourcePolicyFailed ? 'ERROR' : sourceUncertain || !metadata.research_date ? 'REVERIFY_BEFORE_PUBLISH' : 'VERIFIED';
const decorationStatus = warnings.some((x) => /DECORATION|MARKER/.test(x.code)) ? 'WARNING' : 'PASS';
Object.assign(metadata, {
  render_profile: renderProfile,
  content_status: errors.some((x) => ['APPROVED_OUTLINE_MISMATCH', 'H1_PRESENT', 'HIGH_RISK_UNSUPPORTED_CLAIM', 'READER_CONTENT_LINT', 'EDITORIAL_PROCESS_LEAK', 'EDITORIAL_DISCLAIMER_OVERUSE', 'SECTION_EVIDENCE_INVALID', 'REVIEW_EVIDENCE_MISSING', 'REVIEW_EVIDENCE_INVALID', 'MINOR_PROMOTION', 'COMMERCIAL_SEX_PROMOTION', 'REPEATED_ADULT_SAFETY_NOTICE', ...sourcePolicyErrorCodes].includes(x.code)) ? 'ERROR' : 'PASS',
  review_evidence_status: reviewEvidenceRequired ? (reviewEvidenceFindings.length || errors.some((x) => ['SECTION_EVIDENCE_INVALID', 'REVIEW_EVIDENCE_INVALID', 'SOURCE_MANIFEST_MISMATCH', 'SOURCE_POLICY_INVALID'].includes(x.code)) ? 'ERROR' : 'PASS') : 'NOT_REQUIRED',
  source_verification_status: sourceStatus,
  source_policy_status: sourcePolicyFailed ? 'ERROR' : 'PASS',
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
