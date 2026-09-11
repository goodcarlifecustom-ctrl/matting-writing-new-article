import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { findEditorialDisclaimerOveruse, findEditorialProcessLeaks } from './content-integrity.mjs';
import { SOURCE_POLICY, validateSourcePolicyConfiguration } from './source-policy.mjs';

const failures = [];
for (const finding of validateSourcePolicyConfiguration()) failures.push({ slug: '(config)', file: SOURCE_POLICY.rule_file || 'config/source-policy.json', ...finding });
const articleNames = existsSync('articles')
  ? (await readdir('articles', { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];

for (const slug of articleNames) {
  for (const file of SOURCE_POLICY.published_artifacts || []) {
    const target = path.join('articles', slug, file);
    if (!existsSync(target)) {
      failures.push({ slug, file, code: 'CONTENT_ARTIFACT_MISSING', message: '公開成果物がありません。' });
      continue;
    }
    const content = await readFile(target, 'utf8');
    if (!content.trim()) {
      failures.push({ slug, file, code: 'CONTENT_ARTIFACT_MISSING', message: '公開成果物が空です。' });
      continue;
    }
    for (const finding of [...findEditorialProcessLeaks(content), ...findEditorialDisclaimerOveruse(content)]) {
      failures.push({ slug, file, ...finding });
    }
  }
}

if (failures.length) {
  for (const finding of failures) {
    const location = `${finding.slug}/${finding.file}${finding.line ? `:${finding.line}` : ''}`;
    console.error(`[${finding.code}] ${location}: ${finding.message}${finding.excerpt ? `: 「${finding.excerpt}」` : ''}`);
  }
  process.exit(1);
}
console.log(`Public-content integrity check passed for ${articleNames.length} article directories.`);
