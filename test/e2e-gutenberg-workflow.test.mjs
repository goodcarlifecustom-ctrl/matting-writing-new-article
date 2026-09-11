import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { parse } from '@wordpress/block-serialization-default-parser';

const execFileAsync = promisify(execFile);
const root = process.cwd();
function npm(args, env = {}) { return execFileSync('npm', args, { cwd: root, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } }); }
async function node(args, env = {}) { return execFileAsync('node', args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024, env: { ...process.env, ...env } }); }
async function server(handler) { const s = http.createServer(handler); await new Promise(r => s.listen(0, '127.0.0.1', r)); return { url: `http://127.0.0.1:${s.address().port}`, close: () => new Promise(r => s.close(r)) }; }

test('E2E creates a manual-copy artifact without any WordPress HTTP request', async () => {
  const slug = 'e2e-gutenberg-safe-test';
  const dir = path.join(root, 'articles', slug);
  rmSync(dir, { recursive: true, force: true });
  let requestCount = 0;
  const srv = await server((req, res) => {
    requestCount += 1;
    res.setHeader('content-type', 'application/json');
    res.statusCode = 500;
    res.end('{"error":"WordPress connection must stay disabled"}');
  });
  try {
    mkdirSync(path.join(root, 'tmp-e2e-jobs'), { recursive: true });
    const job = path.join(root, 'tmp-e2e-jobs', `${slug}.yml`);
    writeFileSync(job, [
      'article_type: "比較"',
      'main_keyword: "安全 Gutenberg"',
      'related_keywords:',
      '  - "Gutenberg 手動コピー"',
      'persona: "編集担当者"',
      'article_purpose: "装飾済みHTMLの手動コピーを確認する"',
      'min_word_count: 50',
      'target_word_count: 120',
      'max_word_count: 2000',
      'wordpress_draft: true',
      'post_to_wp: true',
      `slug: "${slug}"`,
      'title: "安全なGutenberg記事"',
      'category: "出会い系"'
    ].join('\n') + '\n');
    npm(['run', 'create', '--', '--input', job]);
    const source = [
      '<!-- wp:paragraph -->',
      '<p>この記事では、Gutenberg形式の本文を装飾済みHTMLとして手動コピーする流れを説明します。</p>',
      '<!-- /wp:paragraph -->',
      '<!-- wp:heading {"level":2,"anchor":"sec-01"} -->',
      '<h2 class="wp-block-heading" id="sec-01">コピー前に確認すること</h2>',
      '<!-- /wp:heading -->',
      '<!-- wp:paragraph -->',
      '<p>コピー前には本文、リンク、表、アンカーが保たれているかを確認しましょう。重要です。</p>',
      '<!-- /wp:paragraph -->',
      '<!-- wp:heading {"level":2,"anchor":"sec-02"} -->',
      '<h2 class="wp-block-heading" id="sec-02">まとめ</h2>',
      '<!-- /wp:heading -->',
      '<!-- wp:paragraph -->',
      '<p>最後に、装飾済みHTMLがそのまま手動コピーできることを確認します。重要です。</p>',
      '<!-- /wp:paragraph -->'
    ].join('\n');
    for (const f of ['serp.md', 'headings.csv', 'heading-analysis.md', 'heading-plan.md', 'draft.md', 'external-links.md']) writeFileSync(path.join(dir, f), 'ok\n');
    writeFileSync(path.join(dir, 'article.html'), source);
    writeFileSync(path.join(dir, 'article-linked.html'), source);
    const metaPath = path.join(dir, 'metadata.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    Object.assign(meta, { title: '安全なGutenberg記事', meta_description: '説明文', search_intent: '確認', persona: '編集担当者', article_type: '比較', min_char_count: 50, target_char_count: 120, max_char_count: 2000 });
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    const disconnectedEnvironment = {
      WP_SITE_URL: srv.url,
      WP_REST_ROOT: `${srv.url}/wp-json/`,
      WP_USERNAME: 'must-not-be-read',
      WP_APPLICATION_PASSWORD: 'must-not-be-read',
      WP_APP_PASSWORD: 'must-not-be-read',
      WP_DEFAULT_STATUS: 'publish',
      FINISH_ENABLE_WP_SYNC: '1'
    };
    const { stdout } = await node(['scripts/finish-new-article.mjs', '--slug', slug], disconnectedEnvironment);
    const decorated = readFileSync(path.join(dir, 'article-decorated.html'), 'utf8');
    assert.equal(requestCount, 0);
    assert.match(stdout, /Completed local-only article workflow/);
    assert.match(stdout, /Copy source \(relative\): articles[/\\]e2e-gutenberg-safe-test[/\\]article-decorated\.html/);
    assert.match(stdout, /Copy source \(absolute\): .*article-decorated\.html/);
    assert.match(stdout, /WordPress connection: disabled/);
    assert.match(stdout, /External write performed: false/);
    const sentBlocks = parse(decorated).map((b) => b.blockName);
    const rawBlocks = parse(decorated).map((b) => b.blockName);
    assert.deepEqual(sentBlocks, rawBlocks);
    assert.ok(parse(decorated).filter((b) => !b.blockName).every((b) => !String(b.innerHTML || '').trim()));
    assert.match(decorated, /<!-- wp:/);
    assert.doesNotMatch(decorated, /^---/m);
    assert.doesNotMatch(decorated, /metadata|作業ログ|rendered/i);
    assert.doesNotMatch(decorated, /<h1\b/i);
    assert.doesNotMatch(decorated.trimStart(), /^安全なGutenberg記事/);
    const completed = JSON.parse(readFileSync(metaPath, 'utf8'));
    assert.equal(completed.target_media, 'https://matching.writing-corp.co.jp/');
    assert.equal(completed.wordpress_draft, false);
    assert.equal(completed.post_to_wp, false);
    assert.equal(completed.wordpress_status, 'DISABLED');
    assert.equal(completed.delivery_mode, 'manual_copy');
    assert.equal(completed.primary_output, 'article-decorated.html');
    assert.equal(completed.copy_ready, true);
    assert.equal(completed.external_write_performed, false);
    assert.equal(existsSync(path.join(dir, 'wp-result.md')), false);
    const completedReport = readFileSync(path.join(dir, 'check-report.md'), 'utf8');
    assert.match(completedReport, /^# 品質チェックレポート/m);
    assert.match(completedReport, /口コミ根拠ゲート/);
    assert.match(completedReport, /公開成果物の引用元は共通ソースポリシーに適合しています/);

    writeFileSync(path.join(dir, 'decoration.json'), '{invalid json\n');
    await assert.rejects(node(['scripts/finish-new-article.mjs', '--slug', slug], disconnectedEnvironment));
    const failed = JSON.parse(readFileSync(metaPath, 'utf8'));
    assert.equal(failed.copy_ready, false);
    assert.equal(failed.external_write_performed, false);
    assert.match(readFileSync(path.join(dir, 'check-report.md'), 'utf8'), /result: FAIL/);
    assert.equal(requestCount, 0);
  } finally {
    await srv.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(path.join(root, 'tmp-e2e-jobs'), { recursive: true, force: true });
  }
});
