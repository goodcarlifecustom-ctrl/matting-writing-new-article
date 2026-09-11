import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const checker = path.resolve('scripts/check-all-content.mjs');
const publicFiles = ['draft.md', 'article.html', 'article-linked.html', 'article-decorated.html', 'external-links.md'];

async function makeArticle(cwd, slug = 'clean') {
  const dir = path.join(cwd, 'articles', slug);
  await mkdir(dir, { recursive: true });
  for (const file of publicFiles) {
    const content = file.endsWith('.html')
      ? '<h2 id="guide">サービスの選び方</h2><p>料金と必要な機能を比べて選びます。</p>'
      : file === 'draft.md' ? '## サービスの選び方\n\n料金と必要な機能を比べて選びます。\n' : '# 外部リンク\n\n- なし\n';
    await writeFile(path.join(dir, file), content);
  }
  return dir;
}

async function snapshot(dir) {
  const files = (await readdir(dir)).sort();
  return { files, contents: Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(path.join(dir, file), 'utf8')]))) };
}

test('repository-wide content check is read-only for clean published artifacts', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'content-check-all-'));
  try {
    const dir = await makeArticle(cwd);
    const before = await snapshot(dir);
    const { stdout } = await execFileAsync('node', [checker], { cwd });
    assert.match(stdout, /passed for 1 article directories/);
    assert.deepEqual(await snapshot(dir), before);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('repository-wide content check rejects production narration in each public artifact', async () => {
  for (const file of publicFiles) {
    const cwd = await mkdtemp(path.join(tmpdir(), 'content-check-all-'));
    try {
      const dir = await makeArticle(cwd);
      const leak = file.endsWith('.html') ? '<p>今回は個別レビューを採用していません。</p>' : '今回は個別レビューを採用していません。\n';
      await writeFile(path.join(dir, file), leak);
      await assert.rejects(execFileAsync('node', [checker], { cwd }), (error) => {
        const output = `${error.stdout || ''}${error.stderr || ''}`;
        return output.includes('EDITORIAL_PROCESS_LEAK') && output.includes(`clean/${file}`);
      });
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
});

test('repository-wide content check fails closed on missing, empty and disclaimer-heavy artifacts', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'content-check-all-'));
  try {
    const dir = await makeArticle(cwd);
    await writeFile(path.join(dir, 'draft.md'), '');
    await rm(path.join(dir, 'external-links.md'));
    await writeFile(path.join(dir, 'article-decorated.html'), Array.from({ length: 6 }, (_, index) => `<p>${index}件目の結果は条件で異なり、成果を保証するものではありません。</p>`).join(''));
    await assert.rejects(execFileAsync('node', [checker], { cwd }), (error) => {
      const output = `${error.stdout || ''}${error.stderr || ''}`;
      return /CONTENT_ARTIFACT_MISSING.*draft\.md/s.test(output)
        && /CONTENT_ARTIFACT_MISSING.*external-links\.md/s.test(output)
        && /EDITORIAL_DISCLAIMER_OVERUSE.*article-decorated\.html/s.test(output);
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
