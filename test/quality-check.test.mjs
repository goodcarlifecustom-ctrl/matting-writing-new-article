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
  const html = '<!-- wp:paragraph -->\n<p>18歳以上の成人を対象とし、年齢確認と同意を大切にします。</p>\n<!-- /wp:paragraph -->\n\n<h2 id="safe">安全な使い方</h2>\n<!-- wp:paragraph -->\n<p>個人情報を守って利用します。</p>\n<!-- /wp:paragraph -->';
  const metadata = { title: '安全ガイド', slug: 'sample', status: 'draft', target_media: 'https://matching.writing-corp.co.jp/', post_to_wp: false, render_profile: 'swell_plain_headings', min_char_count: 1000, research_date: null };
  await writeFile(path.join(dir, 'input.yml'), 'target_media: "https://matching.writing-corp.co.jp/"\nrender_profile: swell_plain_headings\n');
  await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata));
  await writeFile(path.join(dir, 'source-manifest.json'), JSON.stringify({ version: 1, sources: [] }));
  await writeFile(path.join(dir, 'research.md'), '# 調査\n\nPARTIAL\n\n## 情報確認日\n\n未取得\n');
  await writeFile(path.join(dir, 'draft.md'), '本文');
  await writeFile(path.join(dir, 'external-links.md'), '# 外部リンク\n\nなし\n');
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

test('reports BLOCK_HEADING_BOUNDARY for every generated HTML artifact', async () => {
  for (const file of ['article.html', 'article-linked.html', 'article-decorated.html']) {
    const { cwd, dir } = await fixture();
    try {
      const invalid = '<!-- wp:loos/cap-block --><div class="swell-block-capbox"></div><!-- /wp:loos/cap-block --><h2 id="safe">安全な使い方</h2>';
      await writeFile(path.join(dir, file), invalid);
      await assert.rejects(runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd }));
      assert.match(await readFile(path.join(dir, 'check-report.md'), 'utf8'), new RegExp(`BLOCK_HEADING_BOUNDARY.*${file}`));
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
});

test('reports BLOCK_HEADING_BOUNDARY when another block is nested in wp:heading', async () => {
  const { cwd, dir } = await fixture();
  try {
    const invalid = '<!-- wp:heading {"level":2,"anchor":"safe"} --><!-- wp:loos/cap-block --><div></div><!-- /wp:loos/cap-block --><h2 id="safe">安全な使い方</h2><!-- /wp:heading -->';
    await writeFile(path.join(dir, 'article-decorated.html'), invalid);
    await assert.rejects(runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd }));
    const report = await readFile(path.join(dir, 'check-report.md'), 'utf8');
    assert.match(report, /BLOCK_HEADING_BOUNDARY.*wp:heading 内に別ブロック/);
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

test('post-generation check blocks unsafe adult-content promotion', async () => {
  const { cwd, dir } = await fixture();
  try {
    const paragraph = (value) => `<!-- wp:paragraph -->\n<p>${value}</p>\n<!-- /wp:paragraph -->\n\n`;
    const unsafe = `${paragraph('利用前に安全性を確認します。')}<h2 id="safe">安全な使い方</h2>${paragraph('18歳以上が対象です。')}${paragraph('高校生も登録できるのでおすすめです。')}${paragraph('援助交際の相手を募集できます。')}`;
    for (const file of ['article.html', 'article-linked.html', 'article-decorated.html']) await writeFile(path.join(dir, file), unsafe);
    await assert.rejects(runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd }));
    const report = await readFile(path.join(dir, 'check-report.md'), 'utf8');
    assert.match(report, /MINOR_PROMOTION/);
    assert.match(report, /COMMERCIAL_SEX_PROMOTION/);
    const metadata = JSON.parse(await readFile(path.join(dir, 'metadata.json')));
    assert.equal(metadata.content_status, 'ERROR');
    assert.equal(metadata.draft_readiness, 'NOT_READY');
    assert.equal(metadata.copy_ready, false);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('post-generation check accepts neutral safety FAQ boundaries', async () => {
  const { cwd, dir } = await fixture();
  try {
    const paragraph = (value) => `<!-- wp:paragraph -->\n<p>${value}</p>\n<!-- /wp:paragraph -->\n\n`;
    const safe = [
      paragraph('利用前に規約と安全性を確認します。'),
      '<h2 id="safe">安全な使い方</h2>',
      paragraph('18歳未満と高校生は利用できません。登録時に年齢確認があります。'),
      '<h3 id="faq">高校生でも利用できますか？</h3>',
      paragraph('いいえ。高校生は対象外です。'),
      '<h3 id="rule">援助交際の相手を募集できますか？</h3>',
      paragraph('援助交際、売春・買春を目的とする募集は禁止されています。')
    ].join('');
    for (const file of ['article.html', 'article-linked.html', 'article-decorated.html']) await writeFile(path.join(dir, file), safe);
    await writeFile(path.join(dir, 'approved_outline.json'), JSON.stringify({ headings: [{
      level: 2, text: '安全な使い方', id: 'safe', children: [
        { level: 3, text: '高校生でも利用できますか？', id: 'faq' },
        { level: 3, text: '援助交際の相手を募集できますか？', id: 'rule' }
      ]
    }] }));
    await runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd });
    const report = await readFile(path.join(dir, 'check-report.md'), 'utf8');
    assert.doesNotMatch(report, /MINOR_PROMOTION|COMMERCIAL_SEX_PROMOTION|REPEATED_ADULT_SAFETY_NOTICE/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('adult-topic check does not require a boilerplate age warning', async () => {
  const { cwd, dir } = await fixture();
  try {
    const paragraph = (value) => `<!-- wp:paragraph -->\n<p>${value}</p>\n<!-- /wp:paragraph -->\n\n`;
    const html = `${paragraph('マッチングアプリでは、個人情報を守り、相手の同意を尊重して利用します。')}<h2 id="safe">安全な使い方</h2>${paragraph('不審な請求や外部誘導には応じず、必要に応じて通報します。')}`;
    for (const file of ['article.html', 'article-linked.html', 'article-decorated.html']) await writeFile(path.join(dir, file), html);
    const metadata = JSON.parse(await readFile(path.join(dir, 'metadata.json')));
    metadata.target_keyword = 'マッチングアプリ 安全';
    await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata));
    await runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd });
    const report = await readFile(path.join(dir, 'check-report.md'), 'utf8');
    assert.doesNotMatch(report, /ADULT_SAFETY_FAIL|MINOR_PROMOTION|COMMERCIAL_SEX_PROMOTION/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('adult audit does not block ordinary content for students and children', async () => {
  const { cwd, dir } = await fixture();
  try {
    const paragraph = (value) => `<!-- wp:paragraph -->\n<p>${value}</p>\n<!-- /wp:paragraph -->\n\n`;
    const html = `${paragraph('高校生におすすめの参考書と、児童も利用できる図書館を紹介します。')}<h2 id="safe">教材の選び方</h2>${paragraph('対象学年と貸出条件を確認しましょう。')}`;
    for (const file of ['article.html', 'article-linked.html', 'article-decorated.html']) await writeFile(path.join(dir, file), html);
    const metadata = JSON.parse(await readFile(path.join(dir, 'metadata.json')));
    metadata.target_media = 'https://education.example/';
    metadata.target_keyword = '高校生 参考書';
    await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata));
    await writeFile(path.join(dir, 'approved_outline.json'), JSON.stringify({ headings: [{ level: 2, text: '教材の選び方', id: 'safe', children: [] }] }));
    await runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd });
    const report = await readFile(path.join(dir, 'check-report.md'), 'utf8');
    assert.doesNotMatch(report, /MINOR_PROMOTION|COMMERCIAL_SEX_PROMOTION|REPEATED_ADULT_SAFETY_NOTICE/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('post-generation audit reads the final decorated artifact', async () => {
  const { cwd, dir } = await fixture();
  try {
    const original = await readFile(path.join(dir, 'article-decorated.html'), 'utf8');
    const unsafe = `${original}\n<!-- wp:paragraph -->\n<p>マッチングアプリでは高校生も登録できます。</p>\n<!-- /wp:paragraph -->\n\n`;
    await writeFile(path.join(dir, 'article-decorated.html'), unsafe);
    await assert.rejects(runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd }));
    const report = await readFile(path.join(dir, 'check-report.md'), 'utf8');
    assert.match(report, /MINOR_PROMOTION/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('source policy rejects App-Liv and 出会いコンパス in every published artifact', async () => {
  for (const file of ['draft.md', 'article.html', 'article-linked.html', 'article-decorated.html', 'external-links.md']) {
    const { cwd, dir } = await fixture();
    try {
      const prohibited = file.endsWith('.html')
        ? '<!-- wp:paragraph -->\n<p><a href="https://deai.app-liv.jp/archive/144119/">出会いコンパスの200人調査</a></p>\n<!-- /wp:paragraph -->\n\n<h2 id="safe">安全な使い方</h2>\n<!-- wp:paragraph -->\n<p>個人情報を守って利用します。</p>\n<!-- /wp:paragraph -->'
        : '[出会いコンパスの200人調査](https://deai.app-liv.jp/archive/144119/)\n';
      await writeFile(path.join(dir, file), prohibited);
      await assert.rejects(runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd }));
      const report = await readFile(path.join(dir, 'check-report.md'), 'utf8');
      assert.match(report, new RegExp(`PROHIBITED_CITATION_SOURCE.*${file}`));
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
});

test('source policy accepts a registered public-agency source', async () => {
  const { cwd, dir } = await fixture();
  try {
    const html = '<!-- wp:paragraph -->\n<p><a href="https://www.caa.go.jp/policies/">消費者庁</a>の情報を確認します。</p>\n<!-- /wp:paragraph -->\n\n<h2 id="safe">安全な使い方</h2>\n<!-- wp:paragraph -->\n<p>個人情報を守って利用します。</p>\n<!-- /wp:paragraph -->';
    for (const file of ['article.html', 'article-linked.html', 'article-decorated.html']) await writeFile(path.join(dir, file), html);
    await writeFile(path.join(dir, 'draft.md'), '[消費者庁](https://www.caa.go.jp/policies/)の情報を確認します。\n');
    await writeFile(path.join(dir, 'external-links.md'), '- https://www.caa.go.jp/policies/\n');
    await writeFile(path.join(dir, 'source-manifest.json'), JSON.stringify({
      version: 1,
      sources: [{ id: 'caa-policies', url: 'https://www.caa.go.jp/policies/', type: 'public_authority', role: 'citation', name: '消費者庁 政策一覧', claim_scope: ['消費者政策'], verified_at: '2026-09-11' }]
    }));
    await runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd });
    const report = await readFile(path.join(dir, 'check-report.md'), 'utf8');
    assert.doesNotMatch(report, /PROHIBITED_CITATION_SOURCE|UNCLASSIFIED_CITATION_SOURCE|SOURCE_MANIFEST_MISMATCH/);
    const metadata = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8'));
    assert.equal(metadata.source_policy_status, 'PASS');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('reference_urls never acts as a citation allowlist', async () => {
  const { cwd, dir } = await fixture();
  try {
    await writeFile(path.join(dir, 'input.yml'), 'target_media: "https://matching.writing-corp.co.jp/"\nrender_profile: swell_plain_headings\nreference_urls:\n  - "https://competitor.example/survey"\n');
    await writeFile(path.join(dir, 'draft.md'), '[競合調査](https://competitor.example/survey)\n');
    await assert.rejects(runFile('node', [checker, '--mode', 'draft', '--slug', 'sample'], { cwd }));
    assert.match(await readFile(path.join(dir, 'check-report.md'), 'utf8'), /UNCLASSIFIED_CITATION_SOURCE.*draft\.md/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
