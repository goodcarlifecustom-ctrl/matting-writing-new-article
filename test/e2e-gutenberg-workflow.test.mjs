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

test('E2E normalizes job, decorates, checks, and posts mocked draft payload safely', async () => {
  const slug = 'e2e-gutenberg-safe-test';
  const dir = path.join(root, 'articles', slug);
  rmSync(dir, { recursive: true, force: true });
  let captured = null;
  const srv = await server((req, res) => {
    res.setHeader('content-type', 'application/json');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/wp-json/') return res.end('{}');
      if (u.pathname === '/wp-json/wp/v2/users/me') return res.end('{"id":1}');
      if (u.pathname === '/wp-json/wp/v2/posts' && req.method === 'GET') return res.end('[]');
      if (u.pathname === '/wp-json/wp/v2/posts' && req.method === 'POST') {
        captured = JSON.parse(body);
        res.statusCode = 201;
        return res.end(JSON.stringify({ id: 42, status: 'draft', slug: captured.slug, title: { raw: captured.title }, content: { raw: captured.content } }));
      }
      if (u.pathname === '/wp-json/wp/v2/posts/42' && req.method === 'GET') return res.end(JSON.stringify({ id: 42, status: 'draft', slug, title: { raw: '安全なGutenberg記事' }, content: { raw: captured.content } }));
      res.statusCode = 404; res.end('{}');
    });
  });
  try {
    mkdirSync(path.join(root, 'tmp-e2e-jobs'), { recursive: true });
    const job = path.join(root, 'tmp-e2e-jobs', `${slug}.yml`);
    writeFileSync(job, [
      'target_media: "https://poi-poi.co.jp/bike/"',
      'article_type: "比較"',
      'main_keyword: "安全 Gutenberg"',
      'related_keywords:',
      '  - "Gutenberg 下書き"',
      'persona: "編集担当者"',
      'article_purpose: "安全な下書き投稿を確認する"',
      'min_word_count: 50',
      'target_word_count: 120',
      'max_word_count: 2000',
      'wordpress_draft: true',
      'post_to_wp: true',
      `slug: "${slug}"`,
      'title: "安全なGutenberg記事"'
    ].join('\n') + '\n');
    npm(['run', 'create', '--', '--input', job]);
    const source = [
      '<!-- wp:paragraph -->',
      '<p>この記事では、Gutenberg形式の本文を安全に下書き投稿する流れを説明します。</p>',
      '<!-- /wp:paragraph -->',
      '<!-- wp:heading {"level":2,"anchor":"sec-01"} -->',
      '<h2 class="wp-block-heading" id="sec-01">投稿前に確認すること</h2>',
      '<!-- /wp:heading -->',
      '<!-- wp:paragraph -->',
      '<p>投稿前には本文、リンク、表、アンカーが保たれているかを確認しましょう。重要です。</p>',
      '<!-- /wp:paragraph -->',
      '<!-- wp:heading {"level":2,"anchor":"sec-02"} -->',
      '<h2 class="wp-block-heading" id="sec-02">まとめ</h2>',
      '<!-- /wp:heading -->',
      '<!-- wp:paragraph -->',
      '<p>最後に、WordPressへ送るpayloadがdraft固定であることを確認します。重要です。</p>',
      '<!-- /wp:paragraph -->'
    ].join('\n');
    for (const f of ['serp.md', 'headings.csv', 'heading-analysis.md', 'heading-plan.md', 'draft.md', 'external-links.md']) writeFileSync(path.join(dir, f), 'ok\n');
    writeFileSync(path.join(dir, 'article.html'), source);
    writeFileSync(path.join(dir, 'article-linked.html'), source);
    const metaPath = path.join(dir, 'metadata.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    Object.assign(meta, { title: '安全なGutenberg記事', meta_description: '説明文', search_intent: '確認', persona: '編集担当者', article_type: '比較', min_char_count: 50, target_char_count: 120, max_char_count: 2000 });
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    npm(['run', 'decorate', '--', '--slug', slug]);
    const decorated = readFileSync(path.join(dir, 'article-decorated.html'), 'utf8');
    writeFileSync(path.join(dir, 'article.html'), decorated);
    writeFileSync(path.join(dir, 'article-linked.html'), decorated);
    npm(['run', 'check', '--', '--slug', slug], { ARTICLE_CHECK_SKIP_WP_AUTOSYNC: '1' });
    await node(['scripts/post-wordpress-draft.mjs', '--slug', slug, '--confirm'], { WP_SITE_URL: srv.url, WP_REST_ROOT: '', WP_USERNAME: 'u', WP_APPLICATION_PASSWORD: 'p', WP_APP_PASSWORD: '', WP_DRAFT_SKIP_PRECHECKS: '1' });
    assert.equal(captured.status, 'draft');
    assert.equal(captured.content, readFileSync(path.join(dir, 'article-decorated.html'), 'utf8'));
    const sentBlocks = parse(captured.content).map((b) => b.blockName);
    const rawBlocks = parse(decorated).map((b) => b.blockName);
    assert.deepEqual(sentBlocks, rawBlocks);
    assert.ok(parse(captured.content).filter((b) => !b.blockName).every((b) => !String(b.innerHTML || '').trim()));
    assert.match(captured.content, /<!-- wp:/);
    assert.doesNotMatch(captured.content, /^---/m);
    assert.doesNotMatch(captured.content, /metadata|作業ログ|rendered/i);
    assert.doesNotMatch(captured.content, /<h1\b/i);
    assert.doesNotMatch(captured.content.trimStart(), /^安全なGutenberg記事/);
    assert.equal(existsSync(path.join(dir, 'wp-result.md')), true);
  } finally {
    await srv.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(path.join(root, 'tmp-e2e-jobs'), { recursive: true, force: true });
  }
});
