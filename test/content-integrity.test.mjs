import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHeadings, compareDerivedHtml, compareSemanticHtml, findEditorialDisclaimerOveruse, findEditorialProcessLeaks, htmlHeadingStructure, lintReaderContent, readerFacingSegments, semanticSnapshot } from '../scripts/content-integrity.mjs';

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

test('semantic snapshot tolerates serialization changes and reports precise content drift',()=>{
 const source='<h2 id="a" class="one">案内</h2><p title="x">本文 &amp; 説明</p><table><tr><td>値</td></tr></table><a href="#a">戻る</a><section id="faq"><h2 id="faq-title">FAQ</h2><p>回答</p></section>';
 const normalized='<h2 class="one wp-added" id="a">案内</h2>\n<p class="wp-added" title="x">本文 &#38; 説明</p><table><tbody><tr><td>値</td></tr></tbody></table><a href="#a">戻る</a><section id="faq"><h2 id="faq-title">FAQ</h2><p>回答</p></section>';
 assert.deepEqual(compareSemanticHtml(source,normalized),[]);
 assert.equal(semanticSnapshot(source).headings.length,semanticSnapshot(normalized).headings.length);
 assert.match(compareSemanticHtml(source,normalized.replace('値','変更')).join(),/可視本文|表の可視内容/);
 assert.match(compareSemanticHtml(source,normalized.replace('回答','別回答')).join(),/可視本文|FAQ/);
 assert.match(compareSemanticHtml(source,'').join(),/本文が空/);
});

test('reader lint rejects repeated paragraphs, warning boxes and marker excess', () => {
  const repeated = '個人情報を送る前に相手とサービスの安全性を十分確認し、不審な要求には応じないでください。';
  const html = `<h2>要確認：安全</h2><h3>公式確認不可：注意</h3><div class="warning">警告</div><div class="alert">警告2</div><p>PARTIAL HTTP 403 制作環境の情報確認日</p><p>${repeated}</p><p>${repeated}</p><p>要確認</p>`;
  const errors = lintReaderContent(html, { max_warning_boxes: 1, max_unverified_markers: 2 });
  assert.ok(errors.some((value) => value.includes('重複段落')));
  assert.ok(errors.some((value) => value.includes('注意ボックス')));
  assert.ok(errors.some((value) => value.includes('未確認マーカー')));
  assert.ok(errors.some((value) => value.includes('全見出し')));
});

test('reader lint allows reader-relevant dates and configurable limits', () => {
  const html = '<h2>法改正</h2><p>法律は2026年4月1日に施行されました。</p><div class="warning">注意1</div><div class="alert">注意2</div><p>要確認</p><p>公式確認不可</p>';
  assert.deepEqual(lintReaderContent(html, { max_warning_boxes: 2, max_unverified_markers: 2 }), []);
});

test('editorial process audit rejects the leaked PCMAX production explanation', () => {
  const html = '<p>PCMAXの良い評判として挙げられる論点を、公式仕様と確認できない口コミ情報に分けて整理します。今回は正規の公式アプリストアで個別レビューを確認・採用していないため、架空の投稿者や体験談は掲載しません。</p>';
  const findings = findEditorialProcessLeaks(html);
  assert.ok(findings.length > 0);
  assert.equal(findings[0].code, 'EDITORIAL_PROCESS_LEAK');
  assert.equal(findings[0].line, 1);
  assert.match(findings[0].excerpt, /個別レビュー|公式仕様/);
});

test('editorial process audit catches internal status, files, fixed headings and source-selection narration', () => {
  const samples = [
    '<p>実行環境のWeb検索がHTTP 403となり、情報を取得できませんでした。</p>',
    '<p>調査結果はresearch.mdとsource-manifest.jsonへ保存しました。</p>',
    '<p>固定見出しのため文言は変えず、CTAは指定されていないため追加しません。</p>',
    '<p>この記事では公式アプリストアのレビューを採用していません。</p>',
    '<p>公式アプリストアの個別レビューは今回採用していません。そのため体験談は紹介できません。</p>',
    '<p>「会えた」という個別レビューを確認できていない以上、一般論で説明します。</p>',
    '<p>架空の投稿者や体験談は記事へ掲載しません。</p>',
    '<p>PCMAX固有の発生数は示さず、一般的な対策を解説します。</p>',
    '<p>今回確認したPCMAX公式資料には、年代別の統計がありません。</p>',
    '<p>良い評判は、今回は裏付けられる個別レビューがないため一般化していません。</p>',
    '<p>本記事ではこの不確実性を残し、確認できた公式ページを優先しました。</p>',
    '<p>UNVERIFIEDのため詳細は掲載しません。</p>',
    '<p>本記事では未確認の金額や会員数を補っていません。</p>'
  ];
  for (const sample of samples) assert.ok(findEditorialProcessLeaks(sample).length > 0, sample);
});

test('editorial process audit permits reader-facing service facts and ordinary article navigation', () => {
  const allowed = [
    '<p>PCMAXは年代別の利用者割合を公式に公表していません。</p>',
    '<p>料金は決済方法によって異なる場合があります。</p>',
    '<p>年齢確認は相手の身元や安全性を保証する制度ではありません。</p>',
    '<p>この記事では料金と安全な使い方を解説します。</p>',
    '<p>最新料金はPCMAX公式サイトで確認してください。</p>'
  ];
  for (const sample of allowed) assert.deepEqual(findEditorialProcessLeaks(sample), [], sample);
});

test('editorial process audit maps Markdown lines and ignores comments and fenced code', () => {
  const markdown = '# PCMAXの評判\n\n導入文です。\n\n今回は個別レビューを採用していません。\n';
  const findings = findEditorialProcessLeaks(markdown);
  assert.equal(findings[0].line, 5);
  assert.match(findings[0].excerpt, /レビューを採用していません/);
  assert.deepEqual(findEditorialProcessLeaks('<!-- 今回はレビューを採用していません -->\n\n```text\nRESEARCH_FAIL\n```\n\n本文です。'), []);
  assert.deepEqual(readerFacingSegments('<p>表示文</p><p hidden>今回はレビューを採用していません</p>').map(({ text }) => text), ['表示文']);
});

test('editorial disclaimer overuse allows a few necessary cautions but rejects article-wide boilerplate', () => {
  const paragraph = (index) => `<p>${index}件目の条件では結果が異なり、利用結果を保証するものではありません。</p>`;
  assert.deepEqual(findEditorialDisclaimerOveruse(Array.from({ length: 5 }, (_, index) => paragraph(index)).join('')), []);
  const findings = findEditorialDisclaimerOveruse(Array.from({ length: 6 }, (_, index) => paragraph(index)).join(''));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'EDITORIAL_DISCLAIMER_OVERUSE');
  assert.match(findings[0].message, /6段落/);
});
