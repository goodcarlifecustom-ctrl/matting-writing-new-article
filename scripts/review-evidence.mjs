import { createHash } from 'node:crypto';
import { canonicalHeadings, normalizeVisibleText } from './content-integrity.mjs';

const REVIEW_TERMS = /口コミ|評判|レビュー|体験談/iu;
const SUMMARY_TERMS = /まとめ|総括|結論/iu;
const GUIDANCE_TERMS = /見方|読み方|調べ方|確認方法|見分け方|注意点|信頼性|投稿方法|削除方法|仕組み|とは(?:何|どのような)?/iu;
const AGGREGATE_TERMS = /多(?:い|く)|少な(?:い|く)|割合|比率|傾向|満足度|平均|高評価|低評価|好評|不評|人気|多数派|何割|ランキング/iu;
const OFFICIAL_CONTEXT_TERMS = /(?:料金|価格|費用).*(?:体系|仕組み|一覧|プラン)|(?:機能|使い方|登録|退会|年齢確認|本人確認|規約|禁止事項|運営会社)(?:の|について|とは|$)/iu;
const SURVEY_TYPES = new Set([
  'public_authority',
  'academic_primary',
  'public_registry_dataset',
  'first_party_research_with_methodology'
]);
const EVIDENCE_CLASSES = new Set(['review_example', 'review_aggregate']);

function compact(value = '') {
  return normalizeVisibleText(value).replace(/[\s\u200b-\u200d\ufeff]/gu, '');
}

function meaningful(value) {
  return typeof value === 'string' && /[\p{L}\p{N}]/u.test(compact(value));
}

function sameText(left, right) {
  return compact(left).toLocaleLowerCase('ja') === compact(right).toLocaleLowerCase('ja');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf())
    && parsed.toISOString().slice(0, 10) === value
    && value <= new Date().toISOString().slice(0, 10);
}

function uniqueStrings(value) {
  return Array.isArray(value)
    && value.every((item) => meaningful(item))
    && new Set(value).size === value.length;
}

function directStoreListing(source, platform) {
  let url;
  try { url = new URL(source?.url); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
  if (platform === 'apple_app_store') {
    return url.hostname.toLowerCase() === 'apps.apple.com' && /\/app\/(?:[^/]+\/)?id\d+\/?$/iu.test(url.pathname);
  }
  return platform === 'google_play'
    && url.hostname.toLowerCase() === 'play.google.com'
    && url.pathname.replace(/\/+$/u, '') === '/store/apps/details'
    && /^[a-z0-9._]+$/iu.test(url.searchParams.get('id') || '');
}

function methodologyComplete(source) {
  const methodology = source?.methodology;
  return source?.type !== 'first_party_research_with_methodology' || Boolean(
    methodology
    && meaningful(methodology.researcher)
    && meaningful(methodology.population)
    && meaningful(methodology.method)
    && meaningful(methodology.period)
    && Number.isSafeInteger(methodology.sample_size)
    && methodology.sample_size > 0
  );
}

function fingerprint(item, source) {
  const review = item?.review || {};
  const identity = meaningful(review.review_id)
    ? compact(review.review_id)
    : [compact(review.author_label), review.published_at, review.rating, compact(review.excerpt)].join('\u0000');
  return createHash('sha256')
    .update([review.platform, source?.url || '', identity].join('\u0000'))
    .digest('hex');
}

function hasReviewTerm(value) {
  return REVIEW_TERMS.test(compact(value));
}

function headingClassification(heading, { inherited, children }) {
  const text = compact(heading.text);
  const direct = hasReviewTerm(text);
  if (!direct && !inherited) return null;
  if (SUMMARY_TERMS.test(text) && direct) return 'review_summary';
  if (!direct && OFFICIAL_CONTEXT_TERMS.test(text) && !AGGREGATE_TERMS.test(text)) return 'official_context';
  if (GUIDANCE_TERMS.test(text)) return 'review_guidance';
  if (children.length) return 'review_group';
  return AGGREGATE_TERMS.test(text) ? 'review_aggregate' : 'review_example';
}

/** Classify every review-related heading while preserving canonical order and parent IDs. */
export function classifyReviewHeadings({ articleType = '', approvedOutline = null } = {}) {
  const articleDeclaresReviews = hasReviewTerm(articleType);
  if (!approvedOutline || typeof approvedOutline !== 'object') {
    return { reviewArticle: articleDeclaresReviews, outlineMissing: articleDeclaresReviews, headings: [] };
  }
  const canonical = canonicalHeadings(approvedOutline);
  const byKey = new Map(canonical.map((heading) => [heading.id ?? heading.text, heading]));
  const childrenByParent = new Map();
  for (const heading of canonical) {
    if (!heading.parent) continue;
    const children = childrenByParent.get(heading.parent) || [];
    children.push(heading);
    childrenByParent.set(heading.parent, children);
  }
  const reviewContext = (heading) => {
    let parent = heading.parent;
    while (parent) {
      const ancestor = byKey.get(parent);
      if (!ancestor) break;
      if (hasReviewTerm(ancestor.text) && !GUIDANCE_TERMS.test(compact(ancestor.text)) && !SUMMARY_TERMS.test(compact(ancestor.text))) return true;
      parent = ancestor.parent;
    }
    return false;
  };
  const headings = [];
  for (const heading of canonical) {
    const key = heading.id ?? heading.text;
    const children = childrenByParent.get(key) || [];
    const classification = headingClassification(heading, { inherited: reviewContext(heading), children });
    if (!classification) continue;
    headings.push({ ...heading, classification, child_ids: children.map((child) => child.id ?? child.text) });
  }
  const substantive = headings.some(({ classification }) => EVIDENCE_CLASSES.has(classification) || classification === 'review_group');
  return {
    reviewArticle: articleDeclaresReviews || substantive,
    outlineMissing: false,
    headings
  };
}

/** Return only leaf claims that need direct evidence. */
export function requiredReviewHeadings(options = {}) {
  const classification = classifyReviewHeadings(options);
  return {
    ...classification,
    headings: classification.headings.filter((heading) => EVIDENCE_CLASSES.has(heading.classification))
  };
}

function sourceById(manifest, id) {
  return Array.isArray(manifest?.sources) ? manifest.sources.find((source) => source?.id === id) : undefined;
}

function scopeSupports(source, headingId) {
  return Array.isArray(source?.claim_scope) && source.claim_scope.some((scope) => compact(scope) === compact(headingId));
}

function evidenceMessages(item, source, section, classification) {
  const label = `evidence_items[${item?.id || '(empty)'}]`;
  const messages = [];
  if (!meaningful(item?.source_id)) messages.push(`${label}.source_id が必要です。`);
  if (!source) return [...messages, `${label}.source_id が source-manifest.json にありません。`];
  if (source.role !== 'citation') messages.push(`${label} の出典は role: citation にしてください。`);
  if (item.kind !== source.evidence_kind) messages.push(`${label}.kind が出典台帳の evidence_kind と一致しません。`);
  if (!meaningful(item.subject)) messages.push(`${label}.subject が必要です。`);
  if (!meaningful(item.supported_claim)) messages.push(`${label}.supported_claim が必要です。`);
  if (!scopeSupports(source, section.heading_id)) messages.push(`${label} の出典 claim_scope に見出しID ${section.heading_id} がありません。`);

  if (item.kind === 'individual_review_example') {
    if (classification === 'review_aggregate') messages.push(`${label} の個別レビューは集計見出しの根拠にできません。`);
    if (source.type !== 'official_app_store') messages.push(`${label} の個別レビュー根拠は official_app_store に限定します。`);
    if (!sameText(source.official_for, item.subject)) messages.push(`${label}.subject は出典台帳の official_for と一致させてください。`);
    const review = item.review;
    if (!review || typeof review !== 'object') messages.push(`${label}.review が必要です。`);
    else {
      if (!['apple_app_store', 'google_play'].includes(review.platform)) messages.push(`${label}.review.platform は apple_app_store または google_play にしてください。`);
      if (!directStoreListing(source, review.platform)) messages.push(`${label} のURLは対象プラットフォームの直接アプリ掲載URLにしてください。`);
      if (!meaningful(review.author_label)) messages.push(`${label}.review.author_label が必要です。`);
      if (!validDate(review.published_at)) messages.push(`${label}.review.published_at は有効な過去日 YYYY-MM-DD にしてください。`);
      if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) messages.push(`${label}.review.rating は1〜5の整数にしてください。`);
      if (!meaningful(review.excerpt)) messages.push(`${label}.review.excerpt に確認した短い原文が必要です。`);
      if (!validDate(review.retrieved_at)) messages.push(`${label}.review.retrieved_at は有効な過去日 YYYY-MM-DD にしてください。`);
      if (review.review_id !== undefined && !meaningful(review.review_id)) messages.push(`${label}.review.review_id は指定する場合、空でない文字列にしてください。`);
    }
  } else if (item.kind === 'survey_result') {
    if (!SURVEY_TYPES.has(source.type)) messages.push(`${label} の調査根拠は方法論を扱える一次資料に限定します。`);
    if (!methodologyComplete(source)) messages.push(`${label} の一次調査には調査主体・対象・方法・期間・正の回答数が必要です。`);
    const survey = item.survey;
    if (!survey || typeof survey !== 'object') messages.push(`${label}.survey が必要です。`);
    else {
      if (!meaningful(survey.locator)) messages.push(`${label}.survey.locator が必要です。`);
      if (!meaningful(survey.result_summary)) messages.push(`${label}.survey.result_summary が必要です。`);
      if (!validDate(survey.retrieved_at)) messages.push(`${label}.survey.retrieved_at は有効な過去日 YYYY-MM-DD にしてください。`);
    }
  } else {
    messages.push(`${label}.kind は individual_review_example または survey_result にしてください。`);
  }
  return messages;
}

function setEquals(actual, expected) {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

/** Audit the complete heading-to-evidence graph without trusting persisted status fields. */
export function auditReviewEvidence({ slug = '', articleType = '', approvedOutline = null, sourceManifest = null, sectionEvidence = null } = {}) {
  const classified = classifyReviewHeadings({ articleType, approvedOutline });
  const required = classified.headings.filter(({ classification }) => EVIDENCE_CLASSES.has(classification));
  const findings = [];
  const seenFinding = new Set();
  const add = (code, message, headingId = null) => {
    const key = `${code}\u0000${headingId || ''}\u0000${message}`;
    if (seenFinding.has(key)) return;
    seenFinding.add(key);
    findings.push({ code, message, heading_id: headingId });
  };
  if (classified.outlineMissing) {
    add('REVIEW_EVIDENCE_MISSING', '口コミ・評判記事にはID付きの approved_outline.json が必要です。');
    return findings;
  }
  if (classified.reviewArticle && required.length === 0) {
    add('REVIEW_EVIDENCE_MISSING', '口コミ・評判記事ですが、根拠対象となる具体的な口コミ見出しがありません。');
    return findings;
  }
  if (!classified.reviewArticle && classified.headings.length === 0) return findings;
  if (
    !sectionEvidence
    || typeof sectionEvidence !== 'object'
    || sectionEvidence.version !== 1
    || !Array.isArray(sectionEvidence.sections)
    || !Array.isArray(sectionEvidence.evidence_items)
  ) {
    add('SECTION_EVIDENCE_INVALID', 'section-evidence.json は version: 1、sections配列、evidence_items配列を持つ必要があります。');
    for (const heading of required) add('REVIEW_EVIDENCE_MISSING', `見出し「${heading.text}」を裏付ける口コミ根拠がありません。`, heading.id);
    return findings;
  }
  if (slug && sectionEvidence.article_slug !== slug) add('SECTION_EVIDENCE_INVALID', `article_slug は ${slug} にしてください。`);

  const expectedById = new Map();
  for (const heading of classified.headings) {
    if (!meaningful(heading.id)) add('SECTION_EVIDENCE_INVALID', `口コミ見出し「${heading.text}」に一意のIDがありません。`);
    else if (expectedById.has(heading.id)) add('SECTION_EVIDENCE_INVALID', `承認済み構成の見出しIDが重複しています: ${heading.id}`);
    else expectedById.set(heading.id, heading);
  }

  const sectionById = new Map();
  for (const [index, section] of sectionEvidence.sections.entries()) {
    if (!section || typeof section !== 'object' || !meaningful(section.heading_id)) {
      add('SECTION_EVIDENCE_INVALID', `sections[${index}].heading_id が必要です。`);
      continue;
    }
    if (sectionById.has(section.heading_id)) add('SECTION_EVIDENCE_INVALID', `sections[].heading_id が重複しています: ${section.heading_id}`, section.heading_id);
    else sectionById.set(section.heading_id, section);
    if (!expectedById.has(section.heading_id)) add('SECTION_EVIDENCE_INVALID', `未知の見出しIDです: ${section.heading_id}`, section.heading_id);
  }

  for (const heading of classified.headings) {
    if (!heading.id) continue;
    const section = sectionById.get(heading.id);
    if (!section) {
      add('SECTION_EVIDENCE_INVALID', `見出し「${heading.text}」のsection定義がありません。`, heading.id);
      if (EVIDENCE_CLASSES.has(heading.classification)) add('REVIEW_EVIDENCE_MISSING', `見出し「${heading.text}」を裏付ける口コミ根拠がありません。`, heading.id);
      continue;
    }
    if (!sameText(section.heading_text, heading.text)) add('SECTION_EVIDENCE_INVALID', `heading_text が承認済み見出しと一致しません。`, heading.id);
    if (section.classification !== heading.classification) add('SECTION_EVIDENCE_INVALID', `classification は ${heading.classification} にしてください。`, heading.id);
    if (!uniqueStrings(section.evidence_item_ids || [])) add('SECTION_EVIDENCE_INVALID', 'evidence_item_ids は重複のない文字列配列にしてください。', heading.id);
    if (!uniqueStrings(section.derived_from_section_ids || [])) add('SECTION_EVIDENCE_INVALID', 'derived_from_section_ids は重複のない文字列配列にしてください。', heading.id);
  }

  const itemById = new Map();
  for (const [index, item] of sectionEvidence.evidence_items.entries()) {
    if (!item || typeof item !== 'object' || !meaningful(item.id)) {
      add('SECTION_EVIDENCE_INVALID', `evidence_items[${index}].id が必要です。`);
      continue;
    }
    if (itemById.has(item.id)) add('SECTION_EVIDENCE_INVALID', `evidence_items[].id が重複しています: ${item.id}`);
    else itemById.set(item.id, item);
  }

  const usedItems = new Map();
  const validDirect = new Set();
  const individualFingerprints = new Map();
  for (const heading of required) {
    if (!heading.id) continue;
    const section = sectionById.get(heading.id);
    const itemIds = Array.isArray(section?.evidence_item_ids) ? section.evidence_item_ids : [];
    if (itemIds.length === 0) {
      add('REVIEW_EVIDENCE_MISSING', `見出し「${heading.text}」を裏付ける口コミ根拠がありません。`, heading.id);
      continue;
    }
    let valid = 0;
    for (const itemId of itemIds) {
      const item = itemById.get(itemId);
      if (!item) {
        add('SECTION_EVIDENCE_INVALID', `未知の証拠IDです: ${itemId}`, heading.id);
        continue;
      }
      const uses = usedItems.get(itemId) || [];
      uses.push(heading.id);
      usedItems.set(itemId, uses);
      const source = sourceById(sourceManifest, item.source_id);
      const messages = evidenceMessages(item, source, section, heading.classification);
      if (messages.length === 0) {
        valid += 1;
        if (item.kind === 'individual_review_example') {
          const key = fingerprint(item, source);
          const prior = individualFingerprints.get(key);
          if (prior && prior !== heading.id) {
            add('REVIEW_EVIDENCE_INVALID', `同一の個別レビューを複数見出しへ流用しています: ${prior}, ${heading.id}`, heading.id);
            valid -= 1;
          } else individualFingerprints.set(key, heading.id);
        }
      }
      for (const message of messages) add('REVIEW_EVIDENCE_INVALID', message, heading.id);
    }
    if (valid > 0) validDirect.add(heading.id);
    else add('REVIEW_EVIDENCE_MISSING', `見出し「${heading.text}」に有効な口コミ根拠がありません。`, heading.id);
  }

  for (const [itemId, headings] of usedItems) {
    if (itemById.get(itemId)?.kind === 'individual_review_example' && new Set(headings).size > 1) {
      add('REVIEW_EVIDENCE_INVALID', `個別レビュー ${itemId} は複数見出しへ使用できません。`);
    }
  }
  for (const itemId of itemById.keys()) if (!usedItems.has(itemId)) add('SECTION_EVIDENCE_INVALID', `未使用の証拠項目があります: ${itemId}`);

  const visiting = new Set();
  const memo = new Map();
  const resolve = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) {
      add('SECTION_EVIDENCE_INVALID', `派生関係が循環しています: ${id}`, id);
      return false;
    }
    const heading = expectedById.get(id);
    const section = sectionById.get(id);
    if (!heading || !section) return false;
    if (EVIDENCE_CLASSES.has(heading.classification)) return validDirect.has(id);
    if (['review_guidance', 'official_context'].includes(heading.classification)) return true;
    visiting.add(id);
    const derived = Array.isArray(section.derived_from_section_ids) ? section.derived_from_section_ids : [];
    for (const ref of derived) if (!expectedById.has(ref)) add('SECTION_EVIDENCE_INVALID', `未知の派生元見出しIDです: ${ref}`, id);
    let valid = derived.length > 0 && derived.every((ref) => resolve(ref));
    if (heading.classification === 'review_group') {
      const expectedChildren = heading.child_ids.filter((childId) => expectedById.has(childId));
      if (!setEquals(derived, expectedChildren)) {
        add('SECTION_EVIDENCE_INVALID', 'review_group は対象となる子見出しをすべて derived_from_section_ids に指定してください。', id);
        valid = false;
      }
      if (!derived.some((ref) => {
        const childClass = expectedById.get(ref)?.classification;
        return EVIDENCE_CLASSES.has(childClass) || childClass === 'review_group';
      })) {
        add('REVIEW_EVIDENCE_MISSING', 'review_group 配下に有効な口コミ根拠がありません。', id);
        valid = false;
      }
    }
    if (heading.classification === 'review_summary') {
      const currentIndex = classified.headings.findIndex((item) => item.id === id);
      if (derived.some((ref) => classified.headings.findIndex((item) => item.id === ref) >= currentIndex)) {
        add('SECTION_EVIDENCE_INVALID', 'review_summary は前方の合格済み評判セクションからだけ派生できます。', id);
        valid = false;
      }
    }
    visiting.delete(id);
    memo.set(id, valid);
    return valid;
  };
  for (const heading of classified.headings) if (heading.id) resolve(heading.id);
  return findings;
}
