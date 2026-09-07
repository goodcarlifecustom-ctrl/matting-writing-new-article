import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@wordpress/block-serialization-default-parser';
import { normalizeGutenbergBlocks, findUnwrappedHtmlBlocks } from '../scripts/gutenberg-utils.mjs';

function flatten(blocks, out = []) {
  for (const b of blocks) {
    out.push(b);
    if (b.innerBlocks?.length) flatten(b.innerBlocks, out);
  }
  return out;
}
function names(html) { return flatten(parse(html)).map(b => b.blockName); }

for (const slug of ['matching-app-beginner-safety']) {
  test(`WordPress parser accepts completed Gutenberg content for ${slug}`, () => {
    const html = readFileSync(`articles/${slug}/article-decorated.html`, 'utf8');
    const blocks = flatten(parse(html));
    const blockNames = blocks.map(b => b.blockName);
    assert.equal(findUnwrappedHtmlBlocks(html).length, 0);
    assert.equal(normalizeGutenbergBlocks(html).html, html);
    assert.ok(blocks.filter((b) => !b.blockName).every((b) => !String(b.innerHTML || '').trim()), 'non-empty freeform blocks must not remain');
    assert.ok(blockNames.includes('core/paragraph'));
    assert.ok(blockNames.includes('core/heading'));
    if (html.includes('wp:list')) assert.ok(blockNames.includes('core/list'));
    if (html.includes('wp-block-table')) assert.ok(blockNames.includes('core/table'));
    if (html.includes('loos/cap-block')) assert.ok(blockNames.includes('loos/cap-block'));
    assert.deepEqual(blockNames, names(html));
  });
}

test('manual copy source is exactly article-decorated.html content', () => {
  const slug = 'matching-app-beginner-safety';
  const source = `articles/${slug}/article-decorated.html`;
  const content = readFileSync(source, 'utf8');
  assert.ok(content.trim());
  assert.doesNotMatch(content, /^---/m);
  assert.match(content, /<!-- wp:/);
  assert.doesNotMatch(content, /<h1\b/i);
  assert.equal(normalizeGutenbergBlocks(content).html, content);
});
