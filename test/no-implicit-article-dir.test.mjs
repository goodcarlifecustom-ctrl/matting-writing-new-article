import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scripts = [
  path.resolve('scripts/check-article.mjs'),
  path.resolve('scripts/extract-headings.mjs')
];

for (const script of scripts) {
  test(`${path.basename(script)} does not recreate a missing article directory`, async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'missing-article-dir-'));
    const target = path.join(cwd, 'articles', 'quarantined-slug');
    try {
      await assert.rejects(
        execFileAsync('node', [script, '--slug', 'quarantined-slug'], { cwd }),
        (error) => `${error.stdout || ''}${error.stderr || ''}`.includes('ARTICLE_DIRECTORY_MISSING')
      );
      assert.equal(existsSync(target), false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
}
