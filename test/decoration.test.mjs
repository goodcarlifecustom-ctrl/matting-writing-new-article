import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { validateDecoratedHtml } from '../scripts/decoration-utils.mjs';
import { cpSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const fixtureRoot = 'test/fixtures/decoration-article';
const requiredCreateArgs=['--target-media','https://poi-poi.co.jp/bike/','--article-type','テスト','--persona','テスト読者','--article-purpose','テスト目的','--min-word-count','100','--target-word-count','200','--max-word-count','10000'];
function sh(args){const patched=args[0]==='run'&&args[1]==='create'?args.concat(requiredCreateArgs):args; return execFileSync('npm',patched,{encoding:'utf8',stdio:'pipe'});}
function prepare(slug){rmSync(`articles/${slug}`,{recursive:true,force:true}); mkdirSync(`articles/${slug}`,{recursive:true}); cpSync(fixtureRoot,`articles/${slug}`,{recursive:true});}
function cleanup(slug){rmSync(`articles/${slug}`,{recursive:true,force:true});}

test('decorate creates ids, outline, h3 nav, capbox, markers and is idempotent without WordPress',()=>{
  const slug='decoration-fixture'; prepare(slug);
  try {
    const sourceBefore=readFileSync(`articles/${slug}/article.html`,'utf8');
    sh(['run','decorate','--','--slug',slug]);
    const one=readFileSync(`articles/${slug}/article-decorated.html`,'utf8');
    sh(['run','decorate','--','--slug',slug]);
    const two=readFileSync(`articles/${slug}/article-decorated.html`,'utf8');
    assert.equal(two,one);
    assert.equal(readFileSync(`articles/${slug}/article.html`,'utf8'),sourceBefore);
    assert.match(one,/id="section-01"/);
    assert.match(one,/id="existing-summary"/);
    assert.match(one,/【この記事でわかること】/);
    assert.match(one,/この章でわかること/);
    assert.match(one,/買取業者を比較するときの確認項目/);
    assert.match(one,/<span class="swl-marker mark_yellow">査定条件を同じ基準で比較することが重要です<\/span>/);
    assert.match(one,/<mark[^>]+>契約後のキャンセル条件は業者によって異なります<\/mark>/);
    assert.equal(existsSync(`articles/${slug}/decoration-manifest.json`), true);
    sh(['run','check:decoration','--','--slug',slug]);
  } finally { cleanup(slug); }
});

test('invalid placeholder title fails decoration',()=>{
  const slug='decoration-bad'; prepare(slug);
  try {
    const c=JSON.parse(readFileSync(`articles/${slug}/decoration.json`));
    c.list_boxes[0].title='ここにタイトル';
    writeFileSync(`articles/${slug}/decoration.json`,JSON.stringify(c));
    assert.throws(()=>sh(['run','decorate','--','--slug',slug]));
  } finally { cleanup(slug); }
});



test('marker validation rejects missing, excessive, forbidden, empty and nested markers',()=>{
  const cases = [
    ['missing marker', '<h2 id="a">見出し</h2><p>本文があります。</p>', /本文マーカーなし/],
    ['too many markers', '<h2 id="a">見出し</h2><p><span class="swl-marker mark_yellow">一</span><span class="swl-marker mark_yellow">二</span><mark style="background-color:rgba(0, 0, 0, 0)" class="has-inline-color has-swl-deep-01-color">三</mark></p>', /マーカー過多/],
    ['empty marker', '<h2 id="a">見出し</h2><p><span class="swl-marker mark_yellow"> </span></p>', /空マーカー/],
    ['list marker', '<h2 id="a">見出し</h2><p><span class="swl-marker mark_yellow">本文</span></p><ul><li><span class="swl-marker mark_yellow">リスト</span></li></ul>', /禁止箇所のマーカー/],
    ['nested marker', '<h2 id="a">見出し</h2><p><span class="swl-marker mark_yellow">外<mark style="background-color:rgba(0, 0, 0, 0)" class="has-inline-color has-swl-deep-01-color">内</mark></span></p>', /マーカー入れ子/],
  ];
  for (const [name, html, pattern] of cases) assert.match(validateDecoratedHtml(html).join('\n'), pattern, name);
});



test('new slug E2E auto-creates decoration config and markers without touching source html',()=>{
  const slug='auto-marker-e2e-test'; cleanup(slug);
  try {
    sh(['run','create','--','--main-keyword','自動 マーカー','--related-keywords','自動 マーカー 買取','--slug',slug]);
    const source=readFileSync(`${fixtureRoot}/article.html`,'utf8');
    writeFileSync(`articles/${slug}/article.html`,source);
    rmSync(`articles/${slug}/decoration.json`,{force:true});
    sh(['run','decorate','--','--slug',slug]);
    sh(['run','check:decoration','--','--slug',slug]);
    const cfg=JSON.parse(readFileSync(`articles/${slug}/decoration.json`,'utf8'));
    const decorated=readFileSync(`articles/${slug}/article-decorated.html`,'utf8');
    assert.ok(cfg.markers.length >= 5);
    assert.doesNotMatch(readFileSync(`articles/${slug}/article.html`,'utf8'),/swl-marker|has-swl-deep-01-color/);
    assert.doesNotMatch(readFileSync(`articles/${slug}/article-linked.html`,'utf8'),/swl-marker|has-swl-deep-01-color/);
    assert.match(decorated,/swl-marker|has-swl-deep-01-color/);
    assert.match(readFileSync(`articles/${slug}/check-report.md`,'utf8'),/result: PASS/);
    const firstHtml=readFileSync(`articles/${slug}/article-decorated.html`,'utf8');
    const firstConfig=readFileSync(`articles/${slug}/decoration.json`,'utf8');
    sh(['run','decorate','--','--slug',slug]);
    assert.equal(readFileSync(`articles/${slug}/article-decorated.html`,'utf8'),firstHtml);
    assert.equal(readFileSync(`articles/${slug}/decoration.json`,'utf8'),firstConfig);
    cfg.markers[0].tone='negative';
    cfg.markers[0].text='この章では比較するときの基本を説明します。';
    writeFileSync(`articles/${slug}/decoration.json`,JSON.stringify(cfg,null,2)+'\n');
    sh(['run','decorate','--','--slug',slug]);
    const editedConfig=JSON.parse(readFileSync(`articles/${slug}/decoration.json`,'utf8'));
    assert.equal(editedConfig.markers[0].tone,'negative');
    assert.equal(editedConfig.markers[0].text,'この章では比較するときの基本を説明します。');
  } finally { cleanup(slug); }
});



test('auto marker tone, H2 scope, duplicate text and inline tags are safe',()=>{
  const slug='auto-marker-tone-scope-test'; cleanup(slug);
  try {
    sh(['run','create','--','--main-keyword','マーカー 判定','--related-keywords','マーカー 判定 買取','--slug',slug]);
    const source=[
      '<h2>費用と安心</h2>',
      '<p>費用は無料です。<strong>重要</strong><code>ABC</code>保険があるので安心です。同じ文章が複数あります。</p>',
      '<h3>注意点</h3>',
      '<p>追加費用が発生する場合があります。同じ文章が複数あります。</p>',
      '<h3>急かされるケース</h3>',
      '<p>契約を急かされる場合は一度持ち帰りましょう。</p>',
      '<h2>まとめ</h2>',
      '<p>同じ文章が複数あります。最後は落ち着いて確認しましょう。</p>'
    ].join('\n');
    writeFileSync(`articles/${slug}/article.html`,source);
    rmSync(`articles/${slug}/decoration.json`,{force:true});
    sh(['run','decorate','--','--slug',slug]);
    sh(['run','check:decoration','--','--slug',slug]);
    const cfg=JSON.parse(readFileSync(`articles/${slug}/decoration.json`,'utf8'));
    const decorated=readFileSync(`articles/${slug}/article-decorated.html`,'utf8');
    assert.equal(cfg.markers.find((m)=>m.section.heading==='費用と安心').tone,'positive');
    assert.equal(cfg.markers.find((m)=>m.section.heading==='注意点').tone,'negative');
    assert.equal(cfg.markers.find((m)=>m.section.heading==='急かされるケース').tone,'negative');
    assert.equal(cfg.markers.find((m)=>m.section.heading==='まとめ').text,'同じ文章が複数あります。');
    assert.equal((decorated.match(/<span class="swl-marker mark_yellow">同じ文章が複数あります。<\/span>/g)||[]).length,1);
    assert.match(decorated,/<strong>重要<\/strong>/);
    assert.match(decorated,/<code>ABC<\/code>/);
  } finally { cleanup(slug); }
});



test('manual marker errors fail instead of being auto-replaced',()=>{
  const slug='manual-marker-error-test'; cleanup(slug);
  try {
    sh(['run','create','--','--main-keyword','手動 エラー','--related-keywords','手動 エラー 買取','--slug',slug]);
    writeFileSync(`articles/${slug}/article.html`,[
      '<h2>対象セクション</h2>',
      '<p>正しい本文があります。</p>',
      '<h2>インライン横断</h2>',
      '<p>前半<strong>後半</strong>があります。</p>'
    ].join('\n'));
    writeFileSync(`articles/${slug}/decoration.json`,JSON.stringify({version:1,enabled:true,outline:{enabled:true,title:'【この記事でわかること】'},section_navigation:{enabled:true,minimum_h3:3,default_title:'この章でわかること',overrides:[]},list_boxes:[],markers:[{section:{level:2,heading:'対象セクション'},tone:'positive',text:'存在しない本文'}]},null,2)+'\n');
    assert.throws(()=>sh(['run','decorate','--','--slug',slug]),/マーカー文字列を一意に特定できません/);
    writeFileSync(`articles/${slug}/decoration.json`,JSON.stringify({version:1,enabled:true,outline:{enabled:true,title:'【この記事でわかること】'},section_navigation:{enabled:true,minimum_h3:3,default_title:'この章でわかること',overrides:[]},list_boxes:[],markers:[{section:{level:2,heading:'インライン横断'},tone:'positive',text:'前半後半'}]},null,2)+'\n');
    assert.throws(()=>sh(['run','decorate','--','--slug',slug]),/インライン要素をまたぐ/);
  } finally { cleanup(slug); }
});



test('link attributes are preserved and link text targets fail explicitly',()=>{
  const slug='link-marker-safety-test'; cleanup(slug);
  try {
    sh(['run','create','--','--main-keyword','リンク マーカー','--related-keywords','リンク マーカー 買取','--slug',slug]);
    writeFileSync(`articles/${slug}/article.html`,[
      '<h2>リンク保持</h2>',
      '<p>リンク前の本文です。<a href="https://example.com/path?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">公式リンク</a>リンク後の本文です。</p>'
    ].join('\n'));
    writeFileSync(`articles/${slug}/decoration.json`,JSON.stringify({version:1,enabled:true,outline:{enabled:true,title:'【この記事でわかること】'},section_navigation:{enabled:true,minimum_h3:3,default_title:'この章でわかること',overrides:[]},list_boxes:[],markers:[{section:{level:2,heading:'リンク保持'},tone:'positive',text:'リンク後の本文です。'}]},null,2)+'\n');
    sh(['run','decorate','--','--slug',slug]);
    let decorated=readFileSync(`articles/${slug}/article-decorated.html`,'utf8');
    assert.match(decorated,/<a href="https:\/\/example.com\/path\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">公式リンク<\/a>/);
    assert.match(decorated,/<span class="swl-marker mark_yellow">リンク後の本文です。<\/span>/);
    writeFileSync(`articles/${slug}/article.html`,[
      '<h2>リンク内対象</h2>',
      '<p>詳しくは<a href="https://example.com" target="_blank" rel="noopener">リンク内テキスト</a>を確認してください。</p>'
    ].join('\n'));
    writeFileSync(`articles/${slug}/decoration.json`,JSON.stringify({version:1,enabled:true,outline:{enabled:true,title:'【この記事でわかること】'},section_navigation:{enabled:true,minimum_h3:3,default_title:'この章でわかること',overrides:[]},list_boxes:[],markers:[{section:{level:2,heading:'リンク内対象'},tone:'positive',text:'リンク内テキスト'}]},null,2)+'\n');
    assert.throws(()=>sh(['run','decorate','--','--slug',slug]),/インライン要素をまたぐ/);
    writeFileSync(`articles/${slug}/article.html`,[
      '<h2>リンク横断</h2>',
      '<p>前半<a href="https://example.com" target="_blank" rel="noopener">中間</a>後半です。</p>'
    ].join('\n'));
    writeFileSync(`articles/${slug}/decoration.json`,JSON.stringify({version:1,enabled:true,outline:{enabled:true,title:'【この記事でわかること】'},section_navigation:{enabled:true,minimum_h3:3,default_title:'この章でわかること',overrides:[]},list_boxes:[],markers:[{section:{level:2,heading:'リンク横断'},tone:'positive',text:'前半中間後半です。'}]},null,2)+'\n');
    assert.throws(()=>sh(['run','decorate','--','--slug',slug]),/インライン要素をまたぐ/);
  } finally { cleanup(slug); }
});

test('paragraph index drift fails instead of marking another paragraph',()=>{
  const slug='paragraph-index-drift-test'; cleanup(slug);
  try {
    sh(['run','create','--','--main-keyword','段落 index','--related-keywords','段落 index 買取','--slug',slug]);
    writeFileSync(`articles/${slug}/article.html`,[
      '<h2>段落ずれ</h2>',
      '<p>対象テキストです。最初の段落です。</p>',
      '<p>別の段落です。</p>'
    ].join('\n'));
    rmSync(`articles/${slug}/decoration.json`,{force:true});
    sh(['run','decorate','--','--slug',slug]);
    const cfg=readFileSync(`articles/${slug}/decoration.json`,'utf8');
    assert.match(cfg,/paragraph_text_sha256/);
    writeFileSync(`articles/${slug}/article.html`,[
      '<h2>段落ずれ</h2>',
      '<p>新しく追加した段落です。</p>',
      '<p>対象テキストです。最初の段落です。</p>',
      '<p>別の段落です。</p>'
    ].join('\n'));
    assert.throws(()=>sh(['run','decorate','--','--slug',slug]),/マーカー対象段落が一致しません/);
  } finally { cleanup(slug); }
});

test('new article template enables decoration config with default WordPress draft posting enabled',()=>{
  const slug='template-decoration-test'; cleanup(slug);
  try {
    sh(['run','create','--','--main-keyword','テンプレート バイク','--related-keywords','テンプレート バイク 買取','--slug',slug]);
    assert.equal(JSON.parse(readFileSync(`articles/${slug}/decoration.json`)).enabled,true);
    assert.match(readFileSync(`articles/${slug}/input.yml`,'utf8'),/post_to_wp: true/);
  } finally { cleanup(slug); }
});

test('marker validation rejects markers ending inside Japanese or ASCII words',()=>{
  const html='<h2 id="a">見出し</h2><p><span class="swl-marker mark_yellow">関</span>係します。</p>';
  assert.match(validateDecoratedHtml(html).join('\n'),/マーカー終了位置が語句の途中/);
  const ok='<h2 id="a">見出し</h2><p><span class="swl-marker mark_yellow">重要です</span>。</p>';
  assert.doesNotMatch(validateDecoratedHtml(ok).join('\n'),/語句の途中/);
});

test('decorate preserves existing Gutenberg block attributes, nesting, custom blocks and wp:html',()=>{
  const slug='gutenberg-preserve-test'; cleanup(slug);
  try {
    sh(['run','create','--','--main-keyword','保持 テスト','--related-keywords','保持 テスト 買取','--slug',slug]);
    const source=[
      '<!-- wp:group {"className":"outer","style":{"spacing":{"padding":"1rem"}},"backgroundColor":"white","textColor":"black"} -->',
      '<div class="wp-block-group outer has-white-background-color has-black-color">',
      '<!-- wp:heading {"level":2,"anchor":"keep-anchor","className":"keep-class","align":"wide"} -->',
      '<h2 class="wp-block-heading keep-class" id="keep-anchor">保持する見出し</h2>',
      '<!-- /wp:heading -->',
      '<!-- wp:paragraph -->',
      '<p>保持する本文です。査定条件を同じ基準で比較することが重要です。</p>',
      '<!-- /wp:paragraph -->',
      '<!-- wp:columns {"align":"wide"} -->',
      '<div class="wp-block-columns alignwide"><!-- wp:column {"width":"50%"} --><div class="wp-block-column" style="flex-basis:50%"><!-- wp:paragraph --><p>列の本文です。</p><!-- /wp:paragraph --></div><!-- /wp:column --></div>',
      '<!-- /wp:columns -->',
      '<!-- wp:loos/custom-block {"foo":"bar"} --><div class="custom">ショートコード[ad]</div><!-- /wp:loos/custom-block -->',
      '<!-- wp:html --><div class="raw-html">## Markdown example <script>window.ad=true</script></div><!-- /wp:html -->',
      '</div>',
      '<!-- /wp:group -->',
      '<!-- wp:heading {"level":2,"anchor":"summary"} -->',
      '<h2 class="wp-block-heading" id="summary">まとめ</h2>',
      '<!-- /wp:heading -->',
      '<!-- wp:paragraph -->',
      '<p>最後は落ち着いて確認しましょう。重要です。</p>',
      '<!-- /wp:paragraph -->'
    ].join('\n');
    writeFileSync(`articles/${slug}/article.html`,source);
    sh(['run','decorate','--','--slug',slug]);
    const one=readFileSync(`articles/${slug}/article-decorated.html`,'utf8');
    sh(['run','decorate','--','--slug',slug]);
    const two=readFileSync(`articles/${slug}/article-decorated.html`,'utf8');
    assert.equal(two,one);
    assert.match(one,/<!-- wp:group \{"className":"outer","style":\{"spacing":\{"padding":"1rem"\}\},"backgroundColor":"white","textColor":"black"\} -->/);
    assert.match(one,/<!-- wp:heading \{"level":2,"anchor":"keep-anchor","className":"keep-class","align":"wide"\} -->/);
    assert.match(one,/<h2 class="wp-block-heading keep-class" id="keep-anchor">保持する見出し<\/h2>/);
    assert.match(one,/<!-- wp:columns \{"align":"wide"\} -->/);
    assert.match(one,/<!-- wp:column \{"width":"50%"\} -->/);
    assert.match(one,/<!-- wp:loos\/custom-block \{"foo":"bar"\} -->/);
    assert.match(one,/<!-- wp:html --><div class="raw-html">## Markdown example <script>window\.ad=true<\/script><\/div><!-- \/wp:html -->/);
  } finally { cleanup(slug); }
});
