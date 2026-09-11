import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { argvValue, parseScalar } from './workflow-utils.mjs';
import { auditReviewEvidence, requiredReviewHeadings } from './review-evidence.mjs';
import { validateSourceManifest, validateSourcePolicyConfiguration } from './source-policy.mjs';

const slugArg = argvValue(process.argv, 'slug');
const all = process.argv.includes('--all');
const stage = argvValue(process.argv, 'stage') || (all ? 'verify' : 'pre-draft');
if ((!slugArg && !all) || (slugArg && all) || !['pre-draft', 'verify'].includes(stage) || (all && stage !== 'verify')) {
  console.error('Usage: node scripts/check-review-evidence.mjs (--slug <slug> --stage <pre-draft|verify> | --all --stage verify)');
  process.exit(1);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readOptional(file) {
  return existsSync(file) ? readFile(file, 'utf8') : '';
}

function parseJson(value) {
  if (!value.trim()) return { value: null, invalid: false };
  try { return { value: JSON.parse(value), invalid: false }; }
  catch { return { value: null, invalid: true }; }
}

async function checkSlug(slug) {
  const dir = path.join('articles', slug);
  const findings = [];
  const add = (code, message) => findings.push({ code, message });
  if (!existsSync(dir)) return { slug, findings: [{ code: 'REVIEW_EVIDENCE_MISSING', message: `記事ディレクトリがありません: ${dir}` }], requiredCount: 0, reviewArticle: false };

  const inputText = await readOptional(path.join(dir, 'input.yml'));
  const metadataText = await readOptional(path.join(dir, 'metadata.json'));
  const outlineText = await readOptional(path.join(dir, 'approved_outline.json'));
  const manifestText = await readOptional(path.join(dir, 'source-manifest.json'));
  const evidenceText = await readOptional(path.join(dir, 'section-evidence.json'));
  const metadataResult = parseJson(metadataText);
  const outlineResult = parseJson(outlineText);
  const manifestResult = parseJson(manifestText);
  const evidenceResult = parseJson(evidenceText);
  if (!metadataText.trim()) add('SECTION_EVIDENCE_INVALID', 'metadata.json がありません。');
  if (metadataResult.invalid) add('SECTION_EVIDENCE_INVALID', 'metadata.json が有効なJSONではありません。');
  if (outlineResult.invalid) add('SECTION_EVIDENCE_INVALID', 'approved_outline.json が有効なJSONではありません。');
  if (manifestResult.invalid) add('SOURCE_MANIFEST_MISMATCH', 'source-manifest.json が有効なJSONではありません。');
  if (evidenceResult.invalid) add('SECTION_EVIDENCE_INVALID', 'section-evidence.json が有効なJSONではありません。');

  const metadata = metadataResult.value || {};
  const articleType = parseScalar(inputText, 'article_type') || metadata.article_type || '';
  if (manifestResult.value) findings.push(...validateSourceManifest(manifestResult.value));
  else if (!manifestResult.invalid) add('SOURCE_MANIFEST_MISMATCH', 'source-manifest.json がありません。');
  findings.push(...auditReviewEvidence({
    slug,
    articleType,
    approvedOutline: outlineResult.value,
    sourceManifest: manifestResult.value,
    sectionEvidence: evidenceResult.value
  }));

  const requirement = requiredReviewHeadings({ articleType, approvedOutline: outlineResult.value });
  if (stage === 'pre-draft' && findings.length === 0) {
    const nextMetadata = { ...metadata };
    nextMetadata.review_evidence_status = requirement.reviewArticle ? 'PASS' : 'NOT_REQUIRED';
    if (requirement.reviewArticle) {
      nextMetadata.review_evidence_hashes = {
        approved_outline_sha256: hash(outlineText),
        source_manifest_sha256: hash(manifestText),
        section_evidence_sha256: hash(evidenceText)
      };
    } else delete nextMetadata.review_evidence_hashes;
    nextMetadata.updated_at = new Date().toISOString();
    const target = path.join(dir, 'metadata.json');
    const temporary = path.join(dir, `.metadata-review-evidence-${process.pid}.tmp`);
    await writeFile(temporary, JSON.stringify(nextMetadata, null, 2) + '\n', 'utf8');
    await rename(temporary, target);
  }
  return { slug, findings, requiredCount: requirement.headings.length, reviewArticle: requirement.reviewArticle };
}

const policyFindings = validateSourcePolicyConfiguration();
if (policyFindings.length) {
  for (const finding of policyFindings) console.error(`[${finding.code}] ${finding.message}`);
  process.exit(1);
}

const slugs = all
  ? (existsSync('articles') ? (await readdir('articles', { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : [])
  : [slugArg];
const results = [];
for (const slug of slugs) results.push(await checkSlug(slug));
const failed = results.filter(({ findings }) => findings.length > 0);
for (const result of failed) {
  for (const finding of result.findings) console.error(`[${finding.code}] ${result.slug}${finding.heading_id ? `/${finding.heading_id}` : ''}: ${finding.message}`);
}
for (const result of results.filter(({ findings }) => findings.length === 0)) {
  console.log(`Review evidence check passed for ${result.slug}: ${result.requiredCount} required headings${result.reviewArticle ? '' : ' (not required)'}.`);
}
if (failed.length) process.exit(1);
