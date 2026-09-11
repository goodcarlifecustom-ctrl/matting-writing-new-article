import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const checker = path.resolve('scripts/check-all-sources.mjs');

async function sourceFixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'source-all-'));
  const dir = path.join(cwd, 'articles', 'sample');
  await mkdir(dir, { recursive: true });
  for (const file of ['draft.md', 'article.html', 'article-linked.html', 'article-decorated.html', 'external-links.md']) {
    await writeFile(path.join(dir, file), file.endsWith('.html') ? '<p>本文です。</p>\n' : '本文です。\n');
  }
  await writeFile(path.join(dir, 'source-manifest.json'), JSON.stringify({ version: 1, sources: [] }));
  await writeFile(path.join(dir, 'metadata.json'), '{}');
  await writeFile(path.join(dir, 'input.yml'), 'target_media: null\n');
  return { cwd, dir };
}

test('repository-wide source check passes complete articles and fails closed on an empty artifact', async () => {
  const { cwd, dir } = await sourceFixture();
  try {
    const passed = await runFile('node', [checker], { cwd });
    assert.match(passed.stdout, /passed for 1 article directories/);
    await writeFile(path.join(dir, 'external-links.md'), '');
    await assert.rejects(
      runFile('node', [checker], { cwd }),
      (error) => /SOURCE_ARTIFACT_MISSING.*external-links\.md/u.test(`${error.stdout || ''}${error.stderr || ''}`)
    );
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('repository-wide source check rejects a missing manifest', async () => {
  const { cwd, dir } = await sourceFixture();
  try {
    await rm(path.join(dir, 'source-manifest.json'));
    await assert.rejects(
      runFile('node', [checker], { cwd }),
      (error) => /SOURCE_MANIFEST_MISMATCH/u.test(`${error.stdout || ''}${error.stderr || ''}`)
    );
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
