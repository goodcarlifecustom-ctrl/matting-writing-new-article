import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { auditPublishedSources, SOURCE_POLICY, validateSourceManifest, validateSourcePolicyConfiguration } from './source-policy.mjs';
import { parseScalar, SITE_PROFILE } from './workflow-utils.mjs';

const articlesDir = 'articles';
const failures = [];
const policyFindings = validateSourcePolicyConfiguration();
if (policyFindings.length) {
  for (const finding of policyFindings) console.error(`[${finding.code}] ${finding.message}`);
  process.exit(1);
}
const articleNames = existsSync(articlesDir)
  ? (await readdir(articlesDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];

for (const slug of articleNames) {
  const dir = path.join(articlesDir, slug);
  const manifestPath = path.join(dir, 'source-manifest.json');
  if (!existsSync(manifestPath)) {
    failures.push({ slug, code: 'SOURCE_MANIFEST_MISMATCH', message: 'source-manifest.json がありません。' });
    continue;
  }
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch {
    failures.push({ slug, code: 'SOURCE_MANIFEST_MISMATCH', message: 'source-manifest.json が有効なJSONではありません。' });
    continue;
  }
  for (const finding of validateSourceManifest(manifest)) failures.push({ slug, ...finding });

  const artifacts = {};
  for (const file of SOURCE_POLICY.published_artifacts || []) {
    const target = path.join(dir, file);
    artifacts[file] = existsSync(target) ? await readFile(target, 'utf8') : '';
    if (!artifacts[file].trim()) failures.push({ slug, code: 'SOURCE_ARTIFACT_MISSING', message: `${file} がないか空です。` });
  }
  let metadata = {};
  try { metadata = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8')); } catch {}
  const input = existsSync(path.join(dir, 'input.yml')) ? await readFile(path.join(dir, 'input.yml'), 'utf8') : '';
  for (const finding of auditPublishedSources({
    artifacts,
    manifest,
    targetMedia: metadata.target_media || parseScalar(input, 'target_media'),
    siteUrl: SITE_PROFILE.site_url
  })) failures.push({ slug, ...finding });
}

if (failures.length) {
  for (const finding of failures) console.error(`[${finding.code}] ${finding.slug}: ${finding.message}`);
  process.exit(1);
}
console.log(`Source policy check passed for ${articleNames.length} article directories.`);
