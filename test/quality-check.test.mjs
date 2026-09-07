import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const runFile = promisify(execFile);
const checker = path.resolve('scripts/check-article.mjs');

async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'quality-'));
  const dir = path.join(cwd, 'articles', 'sample'); await mkdir(dir, { recursive: true });
  const html = '<!-- wp:paragraph -->\n<p>18歳以上の成人を対象とし、年齢確認と同意を大切にします。</p>\n<!-- /wp:paragraph -->\n<h2 id="safe">安全な使い方</h2>\n<!-- wp:paragraph -->\n<p>個人情報を守って利用します。</p>\n<!-- /wp:paragraph -->';
  const metadata = { title: '安全ガイド', slug: 'sample', status: 'draft', target_media: 'https://matching.writing-corp.co.jp/', post_to_wp: false, render_profile: 'swell_plain_headings', min_char_count: 1000, research_date: null };
  await writeFile(path.join(dir, 'input.yml'), 'target_media: "https://matching.writing-corp.co.jp/"\nrender_profile: swell_plain_headings\n');
  await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata));
  await writeFile(path.join(dir, 'research.md'), '# 調査\n\nPARTIAL\n\n## 情報確認日\n\n未取得\n');
  await writeFile(path.join(dir, 'draft.md'), '本文');
  for (const file of ['article.html', 'article-linked.html', 'article-decorated.html']) await writeFile(path.join(dir, file), html);
  await writeFile(path.join(dir, 'approved_outline.json'), JSON.stringify({ headings: [{ level: 2, text: '安全な使い方', id: 'safe', children: [] }] }));
  return { cwd, dir };
}

test('draft warnings remain DRAFT_READY while publish check blocks them', async () => {
  const { cwd, dir } = await fixture();
  try {
    await runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd });
    let metadata = JSON.parse(await readFile(path.join(dir, 'metadata.json')));
    assert.equal(metadata.draft_readiness, 'DRAFT_READY');
    assert.equal(metadata.publish_readiness, 'REVERIFY_BEFORE_PUBLISH');
    assert.equal(metadata.source_verification_status, 'REVERIFY_BEFORE_PUBLISH');
    await assert.rejects(runFile('node', [checker, '--mode', 'publish', '--slug', 'sample'], { cwd }));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('approved outline mismatch is a draft error', async () => {
  const { cwd, dir } = await fixture();
  try {
    await writeFile(path.join(dir, 'approved_outline.json'), JSON.stringify({ headings: [{ level: 2, text: '変更禁止の見出し', id: 'safe' }] }));
    await assert.rejects(runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd }));
    const report = await readFile(path.join(dir, 'check-report.md'), 'utf8');
    assert.match(report, /APPROVED_OUTLINE_MISMATCH/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('missing or different target_media and legacy WordPress flags do not block manual-copy readiness', async () => {
  const cases = [
    { name: 'missing', input: 'render_profile: swell_plain_headings\n', targetMedia: null },
    { name: 'none', input: 'target_media: null\nrender_profile: swell_plain_headings\n', targetMedia: null },
    { name: 'different', input: 'target_media: "https://example.test/editorial/"\nrender_profile: swell_plain_headings\n', targetMedia: 'https://example.test/editorial/' }
  ];
  for (const item of cases) {
    const { cwd, dir } = await fixture();
    try {
      await writeFile(path.join(dir, 'input.yml'), item.input);
      const metadata = JSON.parse(await readFile(path.join(dir, 'metadata.json')));
      Object.assign(metadata, { target_media: item.targetMedia, wordpress_draft: true, post_to_wp: true, wordpress_status: 'PENDING' });
      await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata));
      const { stdout } = await runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], {
        cwd,
        env: {
          ...process.env,
          WP_SITE_URL: 'http://127.0.0.1:9',
          WP_REST_ROOT: 'http://127.0.0.1:9/wp-json/',
          WP_USERNAME: 'must-not-be-read',
          WP_APPLICATION_PASSWORD: 'must-not-be-read',
          FINISH_ENABLE_WP_SYNC: '1'
        }
      });
      assert.doesNotMatch(stdout, /WP_DESTINATION_UNKNOWN|WP_CONFIGURATION_UNKNOWN/);
      const report = await readFile(path.join(dir, 'check-report.md'), 'utf8');
      assert.match(report, /result: PASS/);
      assert.match(report, /copy_ready: true/);
      assert.match(report, /delivery_mode: manual_copy/);
      assert.match(report, /external_write_performed: false/);
      assert.doesNotMatch(report, /WP_DESTINATION_UNKNOWN|WP_CONFIGURATION_UNKNOWN/);
      const updated = JSON.parse(await readFile(path.join(dir, 'metadata.json')));
      assert.equal(updated.wordpress_draft, false, item.name);
      assert.equal(updated.post_to_wp, false, item.name);
      assert.equal(updated.wordpress_status, 'DISABLED', item.name);
      assert.equal(updated.delivery_mode, 'manual_copy', item.name);
      assert.equal(updated.primary_output, 'article-decorated.html', item.name);
      assert.equal(updated.copy_ready, true, item.name);
      assert.equal(updated.external_write_performed, false, item.name);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});
