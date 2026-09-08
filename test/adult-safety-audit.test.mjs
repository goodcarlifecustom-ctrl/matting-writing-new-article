import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAdultSafety, repeatedAdultSafetyNotices } from '../scripts/adult-safety-audit.mjs';

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

test('does not flag neutral rules and safety warnings', () => {
  const html = [
    '<h2>規約と安全性</h2>',
    '<p>18歳未満と高校生は利用できません。登録時には年齢確認があります。</p>',
    '<p>援助交際を募集する投稿は禁止され、売春・買春は法律に触れるおそれがあります。</p>',
    '<p>不審な誘いには応じず、運営へ通報してください。</p>'
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

test('flags duplicated template age notices but permits distinct facts', () => {
  const duplicate = '<p>本サービスは18歳以上が対象で、年齢確認が必要です。</p>'.repeat(2);
  assert.equal(repeatedAdultSafetyNotices(duplicate).length, 1);
  const distinct = [
    '<p>A社は18歳以上が対象で、年齢確認は公的証明書で行います。</p>',
    '<p>B社は18歳未満が対象外で、年齢確認の手順は公式サイトで確認できます。</p>'
  ].join('');
  assert.deepEqual(repeatedAdultSafetyNotices(distinct), []);
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
