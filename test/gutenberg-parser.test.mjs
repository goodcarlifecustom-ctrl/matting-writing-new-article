import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@wordpress/block-serialization-default-parser';
import { normalizeGutenbergBlocks, findUnwrappedHtmlBlocks } from '../scripts/gutenberg-utils.mjs';
import { loadArticle } from '../scripts/wordpress-utils.mjs';

function flatten(blocks, out = []) {
  for (const b of blocks) {
    out.push(b);
    if (b.innerBlocks?.length) flatten(b.innerBlocks, out);
  }
  return out;
}
function names(html) { return flatten(parse(html)).map(b => b.blockName); }

for (const slug of ['bike-kaitori-osusume', 'bike-kaitori']) {
  test(`WordPress parser accepts completed Gutenberg content for ${slug}`, () => {
    const html = readFileSync(`articles/${slug}/article-decorated.html`, 'utf8');
    const blocks = flatten(parse(html));
    const blockNames = blocks.map(b => b.blockName);
    assert.equal(findUnwrappedHtmlBlocks(html).length, 0);
    assert.equal(normalizeGutenbergBlocks(html).html, html);
    assert.ok(blocks.filter((b) => !b.blockName).every((b) => !String(b.innerHTML || '').trim()), 'non-empty freeform blocks must not remain');
    assert.ok(blockNames.includes('core/paragraph'));
    assert.ok(blockNames.includes('core/heading'));
    assert.ok(blockNames.includes('core/list'));
    if (html.includes('wp-block-table')) assert.ok(blockNames.includes('core/table'));
    assert.ok(blockNames.includes('loos/cap-block'));
    assert.deepEqual(blockNames, names(html));
  });
}

test('WordPress payload source is exactly article-decorated.html content', async () => {
  const slug = 'bike-kaitori-osusume';
  const decorated = readFileSync(`articles/${slug}/article-decorated.html`, 'utf8').replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trimStart();
  const article = await loadArticle(slug);
  assert.equal(article.source, `articles/${slug}/article-decorated.html`);
  assert.equal(article.content, decorated);
  assert.doesNotMatch(article.content, /^---/m);
  assert.match(article.content, /<!-- wp:/);
});
