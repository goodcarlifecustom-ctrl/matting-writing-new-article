import * as parse5 from 'parse5';

const normalize = (value = '') => String(value).normalize('NFKC')
  .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '')
  .replace(/\s+/g, ' ')
  .trim();
const getAttr = (node, name) => node?.attrs?.find((attr) => attr.name === name)?.value || '';
const hasAttr = (node, name) => Boolean(node?.attrs?.some((attr) => attr.name === name));

const SEGMENT_TAGS = new Set([
  'p', 'li', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'tr', 'td', 'th', 'blockquote', 'figcaption', 'button', 'a', 'input', 'summary'
]);
const FALLBACK_TAGS = new Set(['div', 'section', 'article', 'aside', 'main']);
const IGNORED_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas']);

function isIgnored(node, { ignoreNavigation = false } = {}) {
  if (!node || IGNORED_TAGS.has(node.tagName)) return true;
  if (node.tagName === 'input' && getAttr(node, 'type').toLowerCase() === 'hidden') return true;
  if (hasAttr(node, 'hidden') || getAttr(node, 'aria-hidden').toLowerCase() === 'true') return true;
  if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(getAttr(node, 'style'))) return true;
  const identity = `${getAttr(node, 'id')} ${getAttr(node, 'class')} ${getAttr(node, 'role')}`;
  if (/(?:^|[\s_-])(?:hidden|is-hidden|u-hidden|sr-only|screen-reader-text|visually-hidden)(?:$|[\s_-])/iu.test(identity)) return true;
  if (/(?:^|[\s_-])(?:toc|table-of-contents)(?:$|[\s_-])|p-toc/iu.test(identity)) return true;
  return ignoreNavigation && (node.tagName === 'nav' || /(?:^|[\s_-])navigation(?:$|[\s_-])/iu.test(identity));
}

function nodeText(node, options) {
  if (isIgnored(node, options)) return '';
  if (node?.nodeName === '#text') return node.value;
  if (node?.tagName === 'input') return getAttr(node, 'value');
  return (node?.childNodes || []).map((child) => nodeText(child, options)).join('');
}

function hasSegmentDescendant(node, options) {
  return (node?.childNodes || []).some((child) =>
    !isIgnored(child, options) && (SEGMENT_TAGS.has(child.tagName) || hasSegmentDescendant(child, options))
  );
}

function auditableSegments(html = '', options = {}) {
  const root = parse5.parseFragment(html), segments = [];
  const walk = (node, insideSegment = false) => {
    if (isIgnored(node, options)) return;
    const segment = SEGMENT_TAGS.has(node.tagName) ||
      (FALLBACK_TAGS.has(node.tagName) && !hasSegmentDescendant(node, options));
    if (segment && !insideSegment) {
      const text = normalize(nodeText(node, options));
      if (text) segments.push({ tag: node.tagName, text });
    } else if (node?.nodeName === '#text' && !insideSegment) {
      const text = normalize(node.value);
      if (text) segments.push({ tag: '#text', text });
    }
    for (const child of node.childNodes || []) walk(child, insideSegment || segment);
  };
  walk(root);
  return segments;
}

const ADULT_TOPIC = /(?:成人向け|アダルト|18禁|出会い(?:系|アプリ|サイト|サービス|目的)|マッチング(?:アプリ|サイト|サービス)|恋活|婚活|エロ|性行為|セックス|性的(?:サービス|コンテンツ|目的)|ライブチャット|チャットレディ|パパ活|援助交際|援交|売春|買春|風俗|PCMAX|ハッピーメール|ワクワクメール|イククル|Jメール|YYC|ペアーズ|Pairs|タップル|Omiai)/iu;
const MINOR = /(?:(?<![0-9])(?:1[0-7]|[0-9])(?:歳|才)|18(?:歳|才)(?:未満|以下|になっていない|に満たない|に達していない)|未成年(?:者)?|女子高生|男子高生|高校生|中学生|小学生|児童|JK)/u;
const COMMERCIAL_SEX = /(?:援助交際|援交|売春|買春)/u;

const MINOR_ACTION = /(?:登録(?:できないわけでは(?:ない|ありません)|でき(?:る|ます)|可能|しよう|しましょう|する(?:方法|手順)|方法|手順|OK|可|大丈夫)|利用(?:できないわけでは(?:ない|ありません)|でき(?:る|ます)|可能|しよう|しましょう|方法|手順|OK|可|大丈夫)|参加(?:でき(?:る|ます)|可能)|使(?:える|えます)|出会(?:える|えます|おう|いましょう)|会(?:える|えます|おう|いましょう)|(?:相手を)?探(?:す|します|してください|せる|せます|そう|しましょう)|狙い目|おすすめ|お勧め|推奨(?:する|します)?|歓迎|募集(?:中|しよう|しましょう)?|攻略|バレずに|サポート(?:する|します)?)/gu;
const COMMERCIAL_SEX_ACTION = /(?:(?:援助交際|援交|売春|買春)(?:(?:が|を|も|で)?(?:でき(?:る|ます)|しよう|しましょう|OK|可能|大丈夫)|(?:の|を)?(?:始め方|やり方|手順))|募集(?:でき(?:る|ます)|しよう|しましょう|する(?:方法|手順)|中)?|相手.{0,12}(?:探(?:す|します|してください|しましょう|せる|せます|し方|そう)|見つけ(?:る|よう|ましょう|られる|られます))|稼(?:ぐ|げる|げます|ごう|ぎましょう)|儲(?:かる|ける|けます|けましょう)|条件.{0,12}(?:提示|交渉)|おすすめ|お勧め|推奨(?:する|します)?|実行(?:する|します|しよう|しましょう)|会おう|斡旋|仲介|手伝(?:う|います)|サポート(?:する|します)?)/gu;

const CATEGORY_SAFETY = /(?:禁止|対象外|利用でき(?:ない|ません)|登録でき(?:ない|ません)|認められ(?:ない|ません)|許され(?:ない|ません)|規約違反|法律違反|違法|犯罪|危険|誤り|虚偽|事実では(?:ない|ありません)|避け(?:る|ましょう)|控え(?:る|ましょう)|やめ(?:る|ましょう)|してはいけ(?:ない|ません)|しないで)/u;
const NEGATED_SAFETY = /(?:できないわけでは(?:ない|ありません)|しないとは言え(?:ない|ません)|禁止されてい(?:ない|ません)|対象外では(?:ない|ありません)|違法(?:では(?:ない|ありません)|にならない)|犯罪(?:では(?:ない|ありません)|にならない)|認められないわけでは(?:ない|ありません))/u;
const DIRECT_REFUTATION = /^(?:(?:は|を)?しないで|し(?:ない|ません)|でき(?:ない|ません)|では(?:ない|ありません)|で(?:は)?なく|不可(?:です)?|を?禁止|は?対象外|[をは]?認め(?:ない|ません|ていません)|は?認められ(?:ない|ません|ていません)|を?許可し(?:ない|ません)|は?許され(?:ない|ません|ていません))/u;
const REPORTED_REFUTATION = /^["'」』）)]*(?:という|との|といった|などの).{0,32}(?:情報|口コミ|噂|説明|主張)?(?:は|が)?.{0,12}(?:誤り|虚偽|事実では(?:ない|ありません)|否定され)/u;
const REPORTED_WARNING = /^["'」』）)]*(?:という|との|と称する).{0,28}(?:詐欺|虚偽|危険な勧誘|誤情報)(?:に|へ|を)?.{0,16}(?:注意|警戒|通報|無視|避け)?/u;
const INTENT_DENIAL = /^(?:する|した)?(?:意図|目的|もの)は(?:ない|ありません)/u;
const NOUN_PHRASE_DENIAL = /^(?:の|という)?[^。！？]{0,24}(?:わけでは(?:ない|ありません)|とは(?:限りません|言えません)|では(?:ない|ありません))/u;
const SAFETY_PREDICATE = /^(?:する|した|している|していた|された|される|を|は|が|の)?(?:こと|行為|投稿|アカウント|内容|情報|口コミ|噂)?(?:を|は|が|には|に|について)?[^。！？]{0,20}(?:禁止|対象外|認められ(?:ない|ません|ていません)|許され(?:ない|ません)|規約違反|法律違反|違法|犯罪|危険|削除|通報|防止|検知|監視|ブロック|停止|凍結|無視|応じ(?:ない|ません)|断(?:る|りましょう)|避け(?:る|ましょう)|控え(?:る|ましょう)|やめ(?:る|ましょう)|してはいけ(?:ない|ません))/u;

function splitClauses(text) {
  const marked = normalize(text)
    .replace(/((?:です|ます|ません|でした|ました|ない|いる|ある|れる|られる)が)[、,]?/gu, '$1。')
    .replace(/[、,]?(?=(?:しかし|だが|ですが|一方で|それでも|ただし|とはいえ|ものの|だからこそ|にもかかわらず))/gu, '。');
  return marked.split(/[。！？!?]+/u).map(normalize).filter(Boolean);
}

function isRefuted(clause, match) {
  const rest = clause.slice((match.index || 0) + match[0].length);
  if (NEGATED_SAFETY.test(rest)) return false;
  return DIRECT_REFUTATION.test(rest) || REPORTED_REFUTATION.test(rest) ||
    REPORTED_WARNING.test(rest) || INTENT_DENIAL.test(rest) ||
    NOUN_PHRASE_DENIAL.test(rest) || SAFETY_PREDICATE.test(rest);
}

function unsafeAction(clause, termPattern, actionPattern, alternativePattern) {
  const terms = [...clause.matchAll(new RegExp(termPattern.source, `${termPattern.flags}g`))];
  if (!terms.length) return false;
  const alternative = alternativePattern?.exec(clause);
  for (const match of clause.matchAll(actionPattern)) {
    const nearestTerm = [...terms].sort((left, right) =>
      Math.abs((match.index || 0) - (left.index || 0)) - Math.abs((match.index || 0) - (right.index || 0))
    )[0];
    if (alternative && (alternative.index || 0) > (nearestTerm.index || 0) && (match.index || 0) >= (alternative.index || 0)) continue;
    if (!isRefuted(clause, match)) return true;
  }
  return false;
}

const CARRIED_ACTION = /^(?:(?:しかし|でも|だが|ですが|一方で|それでも|ただし|とはいえ|ものの|だからこそ|にもかかわらず)[、,]?)?[^。！？]{0,32}(?:登録|利用|参加|使|出会|会|相手|探|募集|おすすめ|お勧め|狙い目|歓迎|稼|儲|条件)/u;
const ADULT_ALTERNATIVE = /(?:18歳以上|成人)(?:[^。]{0,16})(?:は|が|を|なら|には|では)/u;
const LAWFUL_ALTERNATIVE = /(?:恋活|婚活|真剣(?:な)?交際|友達作り|一般(?:的)?な出会い|通常(?:の)?マッチング|恋活アプリ|婚活アプリ)(?:[^。]{0,16})(?:は|が|を|なら|には|では)/u;

function hasCarriedPromotion(clauses, index, termPattern, actionPattern, alternativePattern) {
  if (index === 0 || termPattern.test(clauses[index]) || !CARRIED_ACTION.test(clauses[index])) return false;
  const previous = clauses[index - 1];
  if (!termPattern.test(previous) || !CATEGORY_SAFETY.test(previous) || alternativePattern.test(clauses[index])) return false;
  return [...clauses[index].matchAll(actionPattern)].some((match) => !isRefuted(clauses[index], match));
}

function segmentCodes(text) {
  const clauses = splitClauses(text), codes = new Set();
  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index];
    if (unsafeAction(clause, MINOR, MINOR_ACTION, ADULT_ALTERNATIVE) ||
      hasCarriedPromotion(clauses, index, MINOR, MINOR_ACTION, ADULT_ALTERNATIVE)) {
      codes.add('MINOR_PROMOTION');
    }
    if (unsafeAction(clause, COMMERCIAL_SEX, COMMERCIAL_SEX_ACTION, LAWFUL_ALTERNATIVE) ||
      hasCarriedPromotion(clauses, index, COMMERCIAL_SEX, COMMERCIAL_SEX_ACTION, LAWFUL_ALTERNATIVE)) {
      codes.add('COMMERCIAL_SEX_PROMOTION');
    }
  }
  return codes;
}

const QUESTION = /(?:[?？]|(?:です|ます)か)$/u;
const FAQ_TAG = /^(?:h[1-6]|dt|summary)$/u;
const MINOR_DENIAL = /(?:18歳以上(?:のみ|が対象)|成人のみ|対象外(?!では(?:ない|ありません))|登録(?:でき(?:ない|ません)|不可)|利用(?:でき(?:ない|ません)|不可)|禁止(?!されてい(?:ない|ません))|認められ(?:ない|ません|ていません)|してはいけ(?:ない|ません))/u;
const COMMERCIAL_SEX_DENIAL = /(?:募集.{0,16}(?:禁止|できない|できません)|でき(?:ない|ません)|禁止(?!されてい(?:ない|ません))|規約違反|法律違反|違法(?!にならない|では(?:ない|ありません))|犯罪(?!にならない|では(?:ない|ありません))|認められ(?:ない|ません|ていません)|してはいけ(?:ない|ません)|通報)/u;

function hasStandalonePromotion(text, actionPattern, alternativePattern) {
  for (const clause of splitClauses(text)) {
    const alternative = alternativePattern.exec(clause);
    for (const match of clause.matchAll(actionPattern)) {
      if (alternative && (match.index || 0) >= (alternative.index || 0)) continue;
      if (!isRefuted(clause, match)) return true;
    }
  }
  return false;
}

function isSafeAnswer(answer, code) {
  if (!answer || NEGATED_SAFETY.test(answer)) return false;
  if (code === 'MINOR_PROMOTION') {
    if (hasStandalonePromotion(answer, MINOR_ACTION, ADULT_ALTERNATIVE)) return false;
    return MINOR_DENIAL.test(answer);
  }
  if (hasStandalonePromotion(answer, COMMERCIAL_SEX_ACTION, LAWFUL_ALTERNATIVE)) return false;
  return COMMERCIAL_SEX_DENIAL.test(answer);
}

function hasSafeFaqAnswer(segments, index, code) {
  const answers = [];
  for (let cursor = index + 1; cursor < segments.length && answers.length < 3; cursor += 1) {
    if (/^h[1-6]$/u.test(segments[cursor].tag) || ['dt', 'summary'].includes(segments[cursor].tag)) break;
    answers.push(segments[cursor].text);
  }
  return isSafeAnswer(answers.join(' '), code);
}

function hasSafeInlineFaq(text, code) {
  const questionEnd = Math.max(text.indexOf('?'), text.indexOf('？'));
  if (questionEnd < 0) return false;
  const markers = [...text.slice(0, questionEnd + 1).matchAll(/(?:^|[。.!！?？\s])(?:Q|質問)\s*[:：]/giu)];
  const marker = markers.at(-1);
  if (!marker || segmentCodes(text.slice(0, marker.index)).has(code)) return false;
  return segmentCodes(text.slice(marker.index, questionEnd + 1)).has(code) && isSafeAnswer(text.slice(questionEnd + 1), code);
}

function inheritedHeadingCodes(segments, index) {
  const codes = new Set(), previous = segments[index - 1];
  if (!previous || !/^h[1-6]$/u.test(previous.tag) || QUESTION.test(previous.text)) return codes;
  if (MINOR.test(previous.text) && hasStandalonePromotion(segments[index].text, MINOR_ACTION, ADULT_ALTERNATIVE)) {
    codes.add('MINOR_PROMOTION');
  }
  if (COMMERCIAL_SEX.test(previous.text) && hasStandalonePromotion(segments[index].text, COMMERCIAL_SEX_ACTION, LAWFUL_ALTERNATIVE)) {
    codes.add('COMMERCIAL_SEX_PROMOTION');
  }
  return codes;
}

/** Return true when the article topic itself calls for the adult-safety audit. */
export function isAdultSafetyTopic(targetKeyword = '', html = '') {
  const visible = auditableSegments(html).map(({ text }) => text).join(' ');
  return ADULT_TOPIC.test(`${normalize(targetKeyword)} ${visible}`);
}

/** Audit reader-visible adult-article HTML for promotion involving minors or commercial sex. */
export function auditAdultSafety(html = '') {
  const findings = [];
  const messages = {
    MINOR_PROMOTION: '18歳未満・高校生などへの利用訴求があります',
    COMMERCIAL_SEX_PROMOTION: '援助交際、売春または買春を促進する表現があります'
  };
  const segments = auditableSegments(html);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const codes = new Set([...segmentCodes(segment.text), ...inheritedHeadingCodes(segments, index)]);
    for (const code of codes) {
      if (FAQ_TAG.test(segment.tag) && QUESTION.test(segment.text) && hasSafeFaqAnswer(segments, index, code)) continue;
      if ((segment.tag === 'p' || segment.tag === 'dd') && hasSafeInlineFaq(segment.text, code)) continue;
      findings.push({ code, message: messages[code], excerpt: segment.text.slice(0, 240) });
    }
  }
  return findings;
}

const AGE_CONDITION = /(?:18(?:歳|才)(?:以上|未満|以下)|17(?:歳|才)以下|未成年(?:者)?|高校生|成人(?:のみ)?)/u;
const AGE_VERIFICATION = /(?:年齢確認|年齢.{0,8}(?:確認|認証)|本人確認.{0,16}(?:年齢|生年月日))/u;

function noticeFingerprint(value) {
  const relevant = normalize(value).split(/[。.!！?？]+/u)
    .filter((sentence) => AGE_CONDITION.test(sentence) || AGE_VERIFICATION.test(sentence))
    .join('。');
  return relevant
    .replace(/(?:本サービス|当サービス|このサービス|各サービス|サービス名)/gu, 'サービス')
    .replace(/^[^、。,.]{1,40}?は(?=(?:18(?:歳|才)(?:以上|未満|以下)|成人))/u, 'サービスは')
    .replace(/([、,])[^、。,.]{1,32}の最新規約/gu, '$1サービスの最新規約')
    .replace(/[「」『』（）()\s、。,.!！?？・:：]/gu, '');
}

/** Detect repeated template-like age-and-verification notices, excluding navigation copies. */
export function repeatedAdultSafetyNotices(html = '') {
  const notices = auditableSegments(html, { ignoreNavigation: true })
    .filter(({ text }) => AGE_CONDITION.test(text) && AGE_VERIFICATION.test(text))
    .map(({ text }) => ({ text, fingerprint: noticeFingerprint(text) }));
  const groups = new Map();
  for (const notice of notices) {
    const group = groups.get(notice.fingerprint) || [];
    group.push(notice);
    groups.set(notice.fingerprint, group);
  }
  return [...groups.values()]
    .filter((items) => items.length > 1)
    .map((items) => ({
      code: 'REPEATED_ADULT_SAFETY_NOTICE',
      message: `同じ年齢・年齢確認の警告が${items.length}回繰り返されています`,
      excerpt: items[0].text.slice(0, 240)
    }));
}
