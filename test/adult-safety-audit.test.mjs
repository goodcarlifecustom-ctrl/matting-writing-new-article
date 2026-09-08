import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAdultSafety, isAdultSafetyTopic, repeatedAdultSafetyNotices } from '../scripts/adult-safety-audit.mjs';

test('flags direct appeals to minors and high-school students', () => {
  const html = '<p>高校生も登録できるので、18歳未満の相手を探そう。</p><p>規約では未成年禁止ですが、高校生におすすめです。</p>';
  assert.deepEqual(auditAdultSafety(html).map(({ code }) => code), ['MINOR_PROMOTION', 'MINOR_PROMOTION']);
});

test('flags promotion of compensated dating and prostitution', () => {
  const html = '<p>援助交際の相手を募集できるのでおすすめです。</p><p>買春相手を探せます。</p>';
  assert.deepEqual(auditAdultSafety(html).map(({ code }) => code), [
    'COMMERCIAL_SEX_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION'
  ]);
});

test('recognises common inflections, instructional wording, tables and CTAs', () => {
  const html = [
    '<p>17歳以下でも登録できます。</p>',
    '<p>16歳でも利用できます。</p>',
    '<p>18歳になっていない方も利用可能です。</p>',
    '<p>女子高生も登録できます。</p>',
    '<p>高校生でも登録可能です。</p>',
    '<p>高校生の登録方法を紹介します。</p>',
    '<p>高校生の相手を探してください。</p>',
    '<p>援助交際の始め方と手順を紹介します。</p>',
    '<p>援助交際を推奨します。</p>',
    '<p>買春相手を探しましょう。</p>',
    '<p>買春相手を探してください。</p>',
    '<table><tr><td>買春相手を見つけられます。</td></tr></table>',
    '<div class="cta"><a href="#join">未成年歓迎</a></div>',
    '<input type="button" value="高校生も登録できます">'
  ].join('');
  assert.deepEqual(auditAdultSafety(html).map(({ code }) => code), [
    'MINOR_PROMOTION',
    'MINOR_PROMOTION',
    'MINOR_PROMOTION',
    'MINOR_PROMOTION',
    'MINOR_PROMOTION',
    'MINOR_PROMOTION',
    'MINOR_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION',
    'MINOR_PROMOTION',
    'MINOR_PROMOTION'
  ]);
});

test('does not let a warning word or hidden text mask promotion', () => {
  const html = [
    '<p>高校生におすすめです。トラブルには注意してください。</p>',
    '<p>未成年は禁止されていますが、高校生も登録できます。</p>',
    '<p>援助交際相手を募集する方法と注意点を紹介します。</p>',
    '<p>売春は違法。でも相手を探せます。</p>',
    '<p>高校生は禁止だからこそ狙い目です。<span hidden>利用できません</span></p>',
    '<p>高校生でも登録できないわけではありません。</p>',
    '<p>援助交際の募集は禁止されていません。</p>',
    '<p>未成年は禁止です。ただし、専用リンクから登録できます。</p>',
    '<p>援交は禁止です。ただし、ここから条件を提示して相手を探せます。</p>',
    '<p>高\u200b校生も登録できます。</p>'
  ].join('');
  assert.deepEqual(auditAdultSafety(html).map(({ code }) => code), [
    'MINOR_PROMOTION',
    'MINOR_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION',
    'MINOR_PROMOTION',
    'MINOR_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION',
    'MINOR_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION',
    'MINOR_PROMOTION'
  ]);
});

test('does not flag neutral rules and safety warnings', () => {
  const html = [
    '<h2>規約と安全性</h2>',
    '<p>18歳未満と高校生は利用できません。登録時には年齢確認があります。</p>',
    '<p>援助交際を募集する投稿は禁止され、売春・買春は法律に触れるおそれがあります。</p>',
    '<p>不審な誘いには応じず、運営へ通報してください。</p>'
  ].join('');
  assert.deepEqual(auditAdultSafety(html), []);
});

test('does not flag denials, corrections or a recommendation for adults', () => {
  const html = [
    '<p>高校生にはこのサービスをおすすめしません。</p>',
    '<p>高校生にはこのサービスをおすすめできません。</p>',
    '<p>「高校生も登録できる」という口コミは誤りです。</p>',
    '<p>援助交際の募集は認めていません。</p>',
    '<p>援助交際の相手探しは危険です。</p>',
    '<p>援助交際は禁止されており、通報手順を説明します。</p>',
    '<p>援助交際の募集には応じないでください。</p>',
    '<p>援助交際の募集はしないでください。</p>',
    '<p>援助交際の募集を見つけたら通報してください。</p>',
    '<p>未成年を募集している投稿は削除されます。</p>',
    '<p>未成年を募集しているアカウントを通報してください。</p>',
    '<p>援助交際の募集を防止します。</p>',
    '<p>売春を募集する投稿を見つけたら通報してください。</p>',
    '<p>援交で稼げるという詐欺に注意してください。</p>',
    '<p>高校生におすすめする意図はありません。</p>',
    '<p>高校生は利用禁止ですが、18歳以上の成人にはおすすめです。</p>',
    '<p>援助交際は禁止ですが、真剣な恋活にはおすすめです。</p>',
    '<p>売春について理解できる解説です。</p>'
  ].join('');
  assert.deepEqual(auditAdultSafety(html), []);
});

test('does not flag FAQ questions and prohibitive answers', () => {
  const html = [
    '<h2>よくある質問</h2>',
    '<h3>高校生でも利用できますか？</h3>',
    '<p>いいえ。18歳未満および高校生は対象外です。</p>',
    '<h3>援助交際の相手を募集できますか？</h3>',
    '<p>募集は規約違反となるため、利用してはいけません。</p>'
  ].join('');
  assert.deepEqual(auditAdultSafety(html), []);
});

test('flags promotional FAQ questions unless their answers prohibit the conduct', () => {
  const unsafe = '<h3>高校生でも利用できますか？</h3><p>はい、登録できます。</p>';
  assert.deepEqual(auditAdultSafety(unsafe).map(({ code }) => code), ['MINOR_PROMOTION']);
  const rhetorical = '<h3>高校生も登録できるって知っていますか？</h3><p>登録方法を紹介します。</p>';
  assert.deepEqual(auditAdultSafety(rhetorical).map(({ code }) => code), ['MINOR_PROMOTION']);
  const safe = '<h3>高校生におすすめ？</h3><p>いいえ。高校生は利用できません。</p>';
  assert.deepEqual(auditAdultSafety(safe), []);
  const noQuestionMark = '<h3>高校生でも利用できますか</h3><p>いいえ。高校生は利用できません。</p>';
  assert.deepEqual(auditAdultSafety(noQuestionMark), []);
  const delayedDenial = '<h3>高校生でも利用できますか？</h3><p>はい、登録できます。</p><p>ただし18歳未満は対象外です。</p>';
  assert.deepEqual(auditAdultSafety(delayedDenial).map(({ code }) => code), ['MINOR_PROMOTION']);
  const doubleNegative = '<h3>援助交際の相手を募集できますか？</h3><p>募集は禁止されていません。</p>';
  assert.deepEqual(auditAdultSafety(doubleNegative).map(({ code }) => code), ['COMMERCIAL_SEX_PROMOTION']);
  const details = '<details><summary>高校生でも利用できますか？</summary><p>いいえ。高校生は利用できません。</p></details>';
  assert.deepEqual(auditAdultSafety(details), []);
  const inline = '<p>Q: 高校生でも利用できますか？ A: いいえ。高校生は利用できません。</p>';
  assert.deepEqual(auditAdultSafety(inline), []);
  const prefixedPromotion = '<p>高校生におすすめです。Q: 高校生でも利用できますか？ A: いいえ。高校生は利用できません。</p>';
  assert.deepEqual(auditAdultSafety(prefixedPromotion).map(({ code }) => code), ['MINOR_PROMOTION']);
  const prefixedCommercialPromotion = '<p>援助交際の相手を募集できます。Q: 募集できますか？ A: いいえ。募集は禁止です。</p>';
  assert.deepEqual(auditAdultSafety(prefixedCommercialPromotion).map(({ code }) => code), ['COMMERCIAL_SEX_PROMOTION']);
});

test('flags duplicated template age notices but permits distinct facts', () => {
  const duplicate = '<p>本サービスは18歳以上が対象で、年齢確認が必要です。</p>'.repeat(2);
  assert.equal(repeatedAdultSafetyNotices(duplicate).length, 1);
  const distinct = [
    '<p>A社は18歳以上が対象で、年齢確認は公的証明書で行います。</p>',
    '<p>B社は18歳未満が対象外で、年齢確認の手順は公式サイトで確認できます。</p>'
  ].join('');
  assert.deepEqual(repeatedAdultSafetyNotices(distinct), []);
});

test('finds service-name-only template repetition and ignores navigation copies', () => {
  const repeated = ['Aライブ', 'Bライブ', 'Cライブ'].map((service) =>
    `<p>利用を検討するなら、18歳以上というだけで進めず、${service}の最新規約と年齢確認の方法を確認してください。</p>`
  ).join('');
  assert.equal(repeatedAdultSafetyNotices(repeated)[0].message, '同じ年齢・年齢確認の警告が3回繰り返されています');
  const navigationCopy = [
    '<nav><ul><li>18歳以上が対象で、年齢確認が必要です。</li></ul></nav>',
    '<p>18歳以上が対象で、年齢確認が必要です。</p>'
  ].join('');
  assert.deepEqual(repeatedAdultSafetyNotices(navigationCopy), []);
  const shortTemplates = [
    '<p>VI-VOは18歳以上が対象で、年齢確認が必要です。</p>',
    '<p>FANZAライブチャットは18歳以上が対象で、年齢確認が必要です。</p>'
  ].join('');
  assert.equal(repeatedAdultSafetyNotices(shortTemplates)[0].message, '同じ年齢・年齢確認の警告が2回繰り返されています');
  assert.equal(repeatedAdultSafetyNotices('<p>成人のみ利用でき、年齢確認が必要です。</p>'.repeat(2)).length, 1);
  assert.equal(repeatedAdultSafetyNotices('<h3>18才以上が対象で、年齢確認が必要です。</h3>'.repeat(2)).length, 1);
  const hiddenCopy = [
    '<p class="is-hidden">18歳以上が対象で、年齢確認が必要です。</p>',
    '<p>18歳以上が対象で、年齢確認が必要です。</p>'
  ].join('');
  assert.deepEqual(repeatedAdultSafetyNotices(hiddenCopy), []);
  const differentVerification = [
    '<p>18歳以上の利用には年齢確認が必要です、運転免許証を提出する場合の規約を確認してください。</p>',
    '<p>18歳以上の利用には年齢確認が必要です、クレジットカード決済を行う場合の規約を確認してください。</p>'
  ].join('');
  assert.deepEqual(repeatedAdultSafetyNotices(differentVerification), []);
});

test('audits split table cells, heading CTAs and visible navigation', () => {
  const html = [
    '<table><tr><td>高校生</td><td>登録可能</td></tr></table>',
    '<h3>高校生向け</h3><a href="#join">今すぐ登録できます</a>',
    '<nav><p>援助交際の相手を募集できます。</p></nav>'
  ].join('');
  assert.deepEqual(auditAdultSafety(html).map(({ code }) => code), [
    'MINOR_PROMOTION',
    'MINOR_PROMOTION',
    'COMMERCIAL_SEX_PROMOTION'
  ]);
});

test('limits integration use to adult and dating topics', () => {
  for (const text of [
    '高校生におすすめの参考書を紹介します。',
    '高校生も利用できる図書館です。',
    '児童におすすめの絵本10選です。'
  ]) assert.equal(isAdultSafetyTopic('', `<p>${text}</p>`), false, text);
  assert.equal(isAdultSafetyTopic('マッチングアプリ 安全', '<p>高校生も登録できます。</p>'), true);
  assert.equal(isAdultSafetyTopic('ハッピーメール', '<p>高校生も登録できます。</p>'), true);
  assert.equal(isAdultSafetyTopic('', '<p>援助交際の相手を募集できます。</p>'), true);
});

test('PCMAX article boundary fixture passes the post-generation audit', () => {
  const pcmaxArticle = [
    '<h2>PCMAXの安全性と利用規約</h2>',
    '<p>PCMAXは18歳以上を対象とし、利用時には年齢確認が必要です。</p>',
    '<p>18歳未満や高校生は利用できません。</p>',
    '<p>援助交際、売春・買春を目的とする募集は禁止されています。不審な投稿は通報しましょう。</p>',
    '<h2>PCMAXについてよくある質問</h2>',
    '<h3>高校生でもPCMAXを利用できますか？</h3>',
    '<p>高校生は利用できません。年齢条件と最新の規約を公式情報で確認してください。</p>'
  ].join('');
  assert.deepEqual(auditAdultSafety(pcmaxArticle), []);
  assert.deepEqual(repeatedAdultSafetyNotices(pcmaxArticle), []);
});
