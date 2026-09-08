import * as parse5 from 'parse5';

const normalize = (value = '') => String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
const nodeText = (node) => node?.nodeName === '#text'
  ? node.value
  : (node?.childNodes || []).map(nodeText).join('');

const AUDITABLE_TAGS = new Set(['p', 'li', 'dt', 'dd', 'h2', 'h3', 'h4', 'h5', 'h6']);
const SAFETY_CONTEXT = /(?:禁止|利用でき(?:ない|ません)|対象外|認められ(?:ない|ません)|避け(?:る|ましょう)|応じない|断る|通報|相談|削除|規約違反|法律違反|違法|犯罪|処罰|防止|保護|注意|警戒|してはいけない|しないで|お断り)/u;
const QUESTION = /(?:ですか|ますか|できる|よい|いい)[?？]$/u;

function auditableSegments(html = '') {
  const root = parse5.parseFragment(html), segments = [];
  const walk = (node, insideAuditable = false) => {
    const auditable = AUDITABLE_TAGS.has(node.tagName);
    if (auditable && !insideAuditable) {
      const value = normalize(nodeText(node));
      if (value) segments.push(value);
    }
    for (const child of node.childNodes || []) walk(child, insideAuditable || auditable);
  };
  walk(root);
  return segments;
}

function isNeutralExplanation(value) {
  if (QUESTION.test(value)) return true;
  // A prohibition followed by a contrasting recommendation is still promotion.
  if (/(?:だが|ですが|しかし|一方で|それでも).*(?:おすすめ|募集|探(?:せる|そう)|利用(?:できる|しよう)|登録(?:できる|しよう)|会(?:える|おう)|稼(?:げる|ごう))/u.test(value)) return false;
  return SAFETY_CONTEXT.test(value);
}

const MINOR = /(?:18歳未満|未成年|高校生|中学生|小学生|児童|JK)/u;
const MINOR_PROMOTION = /(?:登録(?:できる|しよう)|利用(?:できる|しよう)|出会える|会える|会おう|狙い目|おすすめ|歓迎|募集|探(?:せる|そう)|攻略|バレずに)/u;
const COMMERCIAL_SEX = /(?:援助交際|援交|売春|買春)/u;
const COMMERCIAL_SEX_PROMOTION = /(?:募集|相手.{0,8}探|探(?:せる|そう)|できる|しよう|稼(?:げる|ごう)|儲(?:かる|ける)|条件.{0,8}(?:提示|交渉)|おすすめ|会おう|斡旋|仲介)/u;

/**
 * Audit reader-visible article HTML for promotion of exploitation involving minors
 * or commercial sex. Mentioning those subjects in rules, warnings, neutral
 * explanations, or FAQ questions is deliberately not treated as promotion.
 */
export function auditAdultSafety(html = '') {
  const findings = [];
  for (const text of auditableSegments(html)) {
    if (!isNeutralExplanation(text) && MINOR.test(text) && MINOR_PROMOTION.test(text)) {
      findings.push({ code: 'MINOR_PROMOTION', message: '18歳未満・高校生などへの利用訴求があります', excerpt: text });
    }
    if (!isNeutralExplanation(text) && COMMERCIAL_SEX.test(text) && COMMERCIAL_SEX_PROMOTION.test(text)) {
      findings.push({ code: 'COMMERCIAL_SEX_PROMOTION', message: '援助交際、売春または買春を促進する表現があります', excerpt: text });
    }
  }
  return findings;
}

/** Detect repeated, template-like age notices without penalising distinct factual mentions. */
export function repeatedAdultSafetyNotices(html = '') {
  const notices = auditableSegments(html).filter((text) =>
    /(?:18歳以上|18歳未満|未成年)/u.test(text) &&
    /(?:年齢確認|利用禁止|利用でき(?:ない|ません)|対象(?:です|外))/u.test(text)
  );
  const fingerprint = (value) => value
    .replace(/[「」『』（）()\s、。,.!！?？]/g, '')
    .replace(/(?:本サービス|当サービス|このサービス|各サービス|サービス名)/g, 'サービス');
  const seen = new Map();
  for (const notice of notices) {
    const key = fingerprint(notice);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([text, count]) => ({ code: 'REPEATED_ADULT_SAFETY_NOTICE', message: `同じ年齢警告が${count}回繰り返されています`, excerpt: text }));
}
