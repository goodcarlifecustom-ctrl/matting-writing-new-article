import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHeadings, compareDerivedHtml, htmlHeadingStructure, lintReaderContent } from '../scripts/content-integrity.mjs';

test('canonical headings include nested H2-H6, FAQ, conclusion, ids and parents', () => {
  const approved = {
    outline: [{ level: 2, text: '概要', id: 'overview', children: [{ level: 3, heading: '詳細', id: 'detail', subheadings: [{ level: 4, title: '手順', id: 'steps', children: [{ level: 5, text: '補足', id: 'note', children: [{ level: 6, text: '例', id: 'example' }] }] }] }] }],
    faq: { heading: { text: 'FAQ', id: 'faq' }, questions: [{ question: '質問1', id: 'q1' }, '質問2'] },
    conclusion: { heading: { text: 'まとめ', id: 'summary' } }
  };
  const canonical = canonicalHeadings(approved);
  assert.deepEqual(canonical.map(({ level, text, id, parent }) => [level, text, id, parent]), [
    [2, '概要', 'overview', null], [3, '詳細', 'detail', 'overview'], [4, '手順', 'steps', 'detail'],
    [5, '補足', 'note', 'steps'], [6, '例', 'example', 'note'], [2, 'FAQ', 'faq', null],
    [3, '質問1', 'q1', 'faq'], [3, '質問2', null, 'faq'], [2, 'まとめ', 'summary', null]
  ]);
  const html = canonical.map((heading) => `<h${heading.level}${heading.id ? ` id="${heading.id}"` : ''}>${heading.text}</h${heading.level}>`).join('');
  assert.deepEqual(htmlHeadingStructure(html), canonical);
});

test('derived comparison permits links and decoration wrappers but rejects content drift', () => {
  const source = '<h2 id="a">案内</h2><p>本文です。</p><table><tr><th>項目</th><td>値</td></tr></table><p><a href="#a">戻る</a></p>';
  const linked = '<h2 id="a">案内</h2><div class="decoration"><p><a href="https://example.com">本文</a>です。</p></div><table><tr><th>項目</th><td><strong>値</strong></td></tr></table><p><a class="button" href="#a">戻る</a></p>';
  assert.deepEqual(compareDerivedHtml(source, linked), []);
  assert.match(compareDerivedHtml(source, linked.replace('値</strong>', '別の値</strong>')).join(), /可視本文|表/);
  assert.match(compareDerivedHtml(source, linked.replace('id="a"', 'id="b"')).join(), /H2/);
});

test('derived comparison ignores generated SWELL navigation', () => {
  const source = '<h2 id="a">案内</h2><p>本文です。</p>';
  const decorated = '<div class="swell-block-capbox"><div>【この記事でわかること】</div><ul><li><a href="#a">案内</a></li></ul></div>' + source;
  assert.deepEqual(compareDerivedHtml(source, decorated), []);
});

test('reader lint rejects statuses, repeated paragraphs, warning boxes and marker excess', () => {
  const repeated = '個人情報を送る前に相手とサービスの安全性を十分確認し、不審な要求には応じないでください。';
  const html = `<h2>要確認：安全</h2><h3>公式確認不可：注意</h3><div class="warning">警告</div><div class="alert">警告2</div><p>PARTIAL HTTP 403 制作環境の情報確認日</p><p>${repeated}</p><p>${repeated}</p><p>要確認</p>`;
  const errors = lintReaderContent(html, { max_warning_boxes: 1, max_unverified_markers: 2, reject_internal_status_terms: true });
  assert.ok(errors.some((value) => value.includes('内部検証情報')));
  assert.ok(errors.some((value) => value.includes('重複段落')));
  assert.ok(errors.some((value) => value.includes('注意ボックス')));
  assert.ok(errors.some((value) => value.includes('未確認マーカー')));
  assert.ok(errors.some((value) => value.includes('全見出し')));
});

test('reader lint allows reader-relevant dates and configurable limits', () => {
  const html = '<h2>法改正</h2><p>法律は2026年4月1日に施行されました。</p><div class="warning">注意1</div><div class="alert">注意2</div><p>要確認</p><p>公式確認不可</p>';
  assert.deepEqual(lintReaderContent(html, { max_warning_boxes: 2, max_unverified_markers: 2 }), []);
});
