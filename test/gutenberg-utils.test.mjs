import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enforceBlockHeadingBoundaries, findBlockHeadingBoundaryErrors, validateGutenbergContent, visibleCharCount } from '../scripts/gutenberg-utils.mjs';

const validBase = `<!-- wp:paragraph -->
<p>導入文です。</p>
<!-- /wp:paragraph -->
<!-- wp:list -->
<p>この記事でわかること</p>
<ul class="wp-block-list"><!-- wp:list-item --><li><a href="#custom-anchor">選び方の基準</a></li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
<!-- wp:heading {"level":2,"anchor":"custom-anchor","className":"x","align":"wide"} -->
<h2 class="wp-block-heading x" id="custom-anchor"><span>選び方の基準</span></h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>本文と<a href="https://example.com/path?q=1#hash">リンク表示</a>です。</p>
<!-- /wp:paragraph -->`;

test('validates nested Gutenberg blocks, JSON attributes, custom anchors, and visible chars', () => {
  const html = `<!-- wp:group {"className":"outer"} -->
<div class="wp-block-group"><!-- wp:columns --><div class="wp-block-columns"><!-- wp:column --><div class="wp-block-column">${validBase}</div><!-- /wp:column --></div><!-- /wp:columns --><!-- wp:loos/custom {"foo":"bar"} /--></div>
<!-- /wp:group -->`;
  const result = validateGutenbergContent(html, { title: 'タイトル' });
  assert.deepEqual(result.errors, []);
  assert.equal(visibleCharCount('---\ntitle: x\n---\n<!-- comment --><p>日本語&amp;ABC</p><a href="https://example.com">表示</a><script>ignore</script>'), 9);
});

test('detects invalid block nesting, JSON attributes, anchors and single html block', () => {
  assert.match(validateGutenbergContent('<!-- wp:group --><!-- wp:paragraph --><p>x</p><!-- /wp:group --><!-- /wp:paragraph -->').errors.join('\n'), /expected paragraph, got group/);
  assert.match(validateGutenbergContent('<!-- wp:heading {bad} --><h2 id="x">x</h2><!-- /wp:heading -->').errors.join('\n'), /invalid JSON attributes/);
  assert.match(validateGutenbergContent('<!-- wp:html --><div>only</div><!-- /wp:html -->').errors.join('\n'), /single wp:html/);
  assert.match(validateGutenbergContent(validBase.replace('anchor":"custom-anchor', 'anchor":"other')).errors.join('\n'), /anchor does not match id/);
});

test('markdown detection ignores code/html/pre/script/style but catches article body markdown', () => {
  const ok = `${validBase}
<!-- wp:code --><pre><code>## 見出し例\n- リスト例\n![画像](URL)</code></pre><!-- /wp:code -->
<!-- wp:html --><div>## 見出し例 - リスト例 ![画像](URL)</div><!-- /wp:html -->
<script type="application/ld+json">{"x":"![画像](URL)"}</script>`;
  assert.deepEqual(validateGutenbergContent(ok, { title: 'タイトル' }).errors, []);
  assert.match(validateGutenbergContent(`${validBase}\n## 未変換見出し`).errors.join('\n'), /Markdown headings remain/);
  assert.match(validateGutenbergContent(`${validBase}\n- 未変換リスト`).errors.join('\n'), /Markdown unordered lists remain/);
  assert.match(validateGutenbergContent(`${validBase}\n![代替](https://example.com/a.jpg)`).errors.join('\n'), /Markdown image syntax remains/);
});

import { normalizeGutenbergBlocks } from '../scripts/gutenberg-utils.mjs';

test('normalizes plain HTML blocks into serialized Gutenberg blocks and is idempotent', () => {
  const input = `<p>本文</p>
<h2 id="sec-01" class="custom">見出し</h2>
<h4>小見出し</h4>
<figure class="wp-block-table"><table><thead><tr><th colspan="2">A</th></tr></thead><tbody><tr><td rowspan="2">B</td><td>C</td></tr></tbody><caption>表</caption></table></figure>
<ul><li>項目</li></ul>
<!-- wp:loos/cap-block {"className":"is-style-onborder_ttl"} --><div class="swell-block-capbox"><p>SWELL内</p></div><!-- /wp:loos/cap-block -->
<!-- wp:paragraph -->
<p>既存</p>
<!-- /wp:paragraph -->`;
  const { html, stats } = normalizeGutenbergBlocks(input);
  assert.match(html, /<!-- wp:paragraph -->\n<p>本文<\/p>\n<!-- \/wp:paragraph -->/);
  assert.match(html, /<!-- wp:heading \{"level":2,"anchor":"sec-01"\} -->\n<h2 id="sec-01" class="custom wp-block-heading">見出し<\/h2>\n<!-- \/wp:heading -->/);
  assert.match(html, /<!-- wp:heading \{"level":4\} -->\n<h4 class="wp-block-heading">小見出し<\/h4>\n<!-- \/wp:heading -->/);
  assert.match(html, /<!-- wp:table -->\n<figure class="wp-block-table"><table>/);
  assert.match(html, /<!-- wp:list -->\n<ul class="wp-block-list">\n<!-- wp:list-item -->\n<li>項目<\/li>\n<!-- \/wp:list-item -->\n<\/ul>\n<!-- \/wp:list -->/);
  assert.match(html, /<!-- wp:loos\/cap-block/);
  assert.equal((html.match(/<!-- wp:paragraph -->/g) || []).length, 2);
  assert.deepEqual(stats, { paragraph: 1, heading: 2, table: 1, list: 1, quote: 0, preformatted: 0, separator: 0 });
  assert.equal(normalizeGutenbergBlocks(html).html, html);
});

test('validation fails when normal HTML blocks are not wrapped', () => {
  const invalid = `${validBase}\n<p>未変換</p>\n<h3 class="wp-block-heading">classだけ</h3>\n<figure class="wp-block-table"><table><tbody><tr><td>x</td></tr></tbody></table></figure>\n<ul><li>項目</li></ul>`;
  const errors = validateGutenbergContent(invalid).errors.join('\n');
  assert.match(errors, /<p> が wp:paragraph/);
  assert.match(errors, /h2〜h6 が wp:heading/);
  assert.match(errors, /figure\.wp-block-table が wp:table/);
  assert.match(errors, /ul \/ ol が wp:list/);
  assert.match(errors, /li が wp:list-item/);
});

test('swell_plain_headings accepts plain headings but keeps other block checks', () => {
  const plain = validBase.replace(/<!-- \/?wp:heading[^>]* -->\n?/g, '');
  assert.doesNotMatch(validateGutenbergContent(plain, { renderProfile: 'swell_plain_headings' }).errors.join('\n'), /wp:heading/);
  assert.match(validateGutenbergContent(`${plain}\n<p>未変換</p>`, { renderProfile: 'swell_plain_headings' }).errors.join('\n'), /wp:paragraph/);
});

test('requires one blank line between a block close and a following heading', () => {
  const capbox = '<!-- wp:loos/cap-block --><div class="swell-block-capbox"></div><!-- /wp:loos/cap-block -->';
  const valid = `${capbox}\n\n<h2 id="stable">変更しない見出し</h2>`;
  assert.deepEqual(findBlockHeadingBoundaryErrors(valid), []);
  for (const invalid of [`${capbox}<h2 id="stable">変更しない見出し</h2>`, `${capbox}\n<h3 id="stable">変更しない見出し</h3>`]) {
    assert.match(findBlockHeadingBoundaryErrors(invalid).join('\n'), /空行がありません/);
    const fixed = enforceBlockHeadingBoundaries(invalid);
    assert.match(fixed, /<!-- \/wp:loos\/cap-block -->\n\n<h[23] id="stable">変更しない見出し<\/h[23]>/);
  }
});

test('rejects nested blocks inside wp:paragraph', () => {
  const invalid = '<!-- wp:paragraph --><p>本文</p><!-- wp:loos/cap-block --><div></div><!-- /wp:loos/cap-block --><!-- /wp:paragraph -->';
  assert.match(findBlockHeadingBoundaryErrors(invalid).join('\n'), /wp:paragraph 内に別ブロック/);
});

test('rejects a foreign block between wp:heading and its heading element', () => {
  const invalid = '<!-- wp:heading {"level":2} --><!-- wp:loos/cap-block --><div></div><!-- /wp:loos/cap-block --><h2 id="stable">固定見出し</h2><!-- /wp:heading -->';
  assert.match(findBlockHeadingBoundaryErrors(invalid).join('\n'), /wp:heading 内に別ブロック wp:loos\/cap-block/);
});

test('normalization preserves heading identity and respects both render profiles', () => {
  const source = '<!-- wp:loos/cap-block --><div></div><!-- /wp:loos/cap-block --><h2 id="fixed-h2">固定H2</h2><h3 id="fixed-h3">固定H3</h3>';
  const plain = normalizeGutenbergBlocks(source, { renderProfile: 'swell_plain_headings' }).html;
  assert.equal(normalizeGutenbergBlocks(plain, { renderProfile: 'swell_plain_headings' }).html, plain);
  assert.doesNotMatch(plain, /wp:heading/);
  assert.match(plain, /<h2 id="fixed-h2"[^>]*>固定H2<\/h2>/);
  assert.match(plain, /<h3 id="fixed-h3"[^>]*>固定H3<\/h3>/);
  assert.match(plain, /<!-- \/wp:loos\/cap-block -->\n\n<h2/);
  const gutenberg = normalizeGutenbergBlocks(source, { renderProfile: 'gutenberg_blocks' }).html;
  assert.equal(normalizeGutenbergBlocks(gutenberg, { renderProfile: 'gutenberg_blocks' }).html, gutenberg);
  assert.match(gutenberg, /<!-- wp:heading \{"level":2,"anchor":"fixed-h2"\} -->/);
  assert.match(gutenberg, /<!-- wp:heading \{"level":3,"anchor":"fixed-h3"\} -->/);
  const unspecified = normalizeGutenbergBlocks(source).html;
  assert.equal(unspecified, gutenberg);
  const headings = (html) => [...html.matchAll(/<h([2-6])\b[^>]*id="([^"]+)"[^>]*>([^<]+)<\/h\1>/g)].map((match) => [match[1], match[2], match[3]]);
  assert.deepEqual(headings(plain), [['2', 'fixed-h2', '固定H2'], ['3', 'fixed-h3', '固定H3']]);
  assert.deepEqual(headings(gutenberg), headings(plain));
  assert.deepEqual(headings(unspecified), headings(plain));
});


test('car, general, and matching-app boundary fixtures all pass', () => {
  for (const name of ['car', 'general', 'matching-app']) {
    const html = readFileSync(`test/fixtures/block-heading-boundary/${name}.html`, 'utf8');
    assert.deepEqual(findBlockHeadingBoundaryErrors(html), [], name);
    assert.deepEqual(validateGutenbergContent(html, { renderProfile: 'swell_plain_headings' }).errors, [], name);
  }
});
