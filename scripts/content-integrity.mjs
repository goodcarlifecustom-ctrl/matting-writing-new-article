import * as parse5 from 'parse5';

const headingName = (node) => /^h[2-6]$/.test(node?.tagName || '');
const attr = (node, name) => node?.attrs?.find((item) => item.name === name)?.value ?? null;
const text = (node) => node?.nodeName === '#text'
  ? node.value
  : (node?.childNodes || []).map(text).join('');
export const normalizeVisibleText = (value = '') => String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();

function approvedText(item = {}) {
  return normalizeVisibleText(item.text ?? item.heading ?? item.title ?? item.question ?? item.label ?? '');
}

function approvedChildren(item = {}) {
  for (const key of ['children', 'headings', 'subheadings', 'items']) if (Array.isArray(item[key])) return item[key];
  return [];
}

/** Build the immutable heading sequence exclusively from approved_outline.json. */
export function canonicalHeadings(approved = {}) {
  const result = [];
  const includes = (item) => result.some((entry) => (item.id ?? item.anchor) ? entry.id === (item.id ?? item.anchor) : entry.text === approvedText(item));
  const visit = (items, parent = null, fallbackLevel = 2) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (typeof item === 'string') {
        result.push({ level: fallbackLevel, text: normalizeVisibleText(item), id: null, parent });
        continue;
      }
      const level = Number(item.level ?? item.depth ?? fallbackLevel);
      const entry = { level, text: approvedText(item), id: item.id ?? item.anchor ?? null, parent };
      result.push(entry);
      visit(approvedChildren(item), entry.id ?? entry.text, Math.min(level + 1, 6));
    }
  };
  visit(approved.outline ?? approved.headings ?? [], null, 2);
  if (approved.faq?.heading) {
    const heading = typeof approved.faq.heading === 'object' ? approved.faq.heading : { text: approved.faq.heading };
    const faqEntry = { level: Number(heading.level ?? 2), text: approvedText(heading), id: heading.id ?? heading.anchor ?? null, parent: null };
    if (!includes(heading)) result.push(faqEntry);
    for (const question of approved.faq.questions ?? []) {
      const item = typeof question === 'object' ? question : { text: question };
      if (!includes(item)) result.push({ level: Number(item.level ?? 3), text: approvedText(item), id: item.id ?? item.anchor ?? null, parent: faqEntry.id ?? faqEntry.text });
    }
  }
  if (approved.conclusion?.heading) {
    const item = typeof approved.conclusion.heading === 'object' ? approved.conclusion.heading : { text: approved.conclusion.heading };
    if (!includes(item)) result.push({ level: Number(item.level ?? 2), text: approvedText(item), id: item.id ?? item.anchor ?? null, parent: null });
  }
  return result;
}

export function htmlHeadingStructure(html = '') {
  const root = parse5.parseFragment(html);
  const result = [], stack = [];
  const walk = (node) => {
    if (headingName(node)) {
      const level = Number(node.tagName.slice(1));
      while (stack.length && stack.at(-1).level >= level) stack.pop();
      const entry = { level, text: normalizeVisibleText(text(node)), id: attr(node, 'id'), parent: stack.at(-1)?.key ?? null };
      result.push(entry);
      stack.push({ level, key: entry.id ?? entry.text });
    }
    for (const child of node.childNodes || []) walk(child);
  };
  walk(root);
  return result;
}

function classes(node) { return (attr(node, 'class') || '').split(/\s+/); }
function isGeneratedNavigation(node) {
  if (!classes(node).some((value) => value === 'swell-block-capbox' || value === 'cap_box')) return false;
  return /この記事でわかること|この章でわかること/.test(normalizeVisibleText(text(node)));
}
function faqVisibleContent(root) {
  const html = parse5.serialize(root), headings = [...html.matchAll(/<h([2-6])\b[^>]*>[\s\S]*?<\/h\1>/gi)], sections = [];
  for (let index=0;index<headings.length;index++) {
    const heading=headings[index],level=Number(heading[1]);
    if(!/よくある質問|FAQ/i.test(normalizeVisibleText(text(parse5.parseFragment(heading[0]))))) continue;
    const next=headings.slice(index+1).find(item=>Number(item[1])<=level);
    const end=next?.index??html.length;
    sections.push(normalizeVisibleText(text(parse5.parseFragment(html.slice(heading.index,end)))));
  }
  return sections;
}

/** Semantic HTML representation shared by derived-article and WordPress verification. */
export function semanticSnapshot(html = '') {
  const root = parse5.parseFragment(html), visible = [], anchors = [], tables = [];
  const walk = (node, ignored = false) => {
    const skip = ignored || isGeneratedNavigation(node) || ['script', 'style', 'template'].includes(node.tagName);
    if (skip) return;
    if (node.tagName === 'a' && (attr(node, 'href') || '').startsWith('#')) anchors.push({ href: attr(node, 'href'), text: normalizeVisibleText(text(node)) });
    if (node.tagName === 'table') tables.push(normalizeVisibleText(text(node)));
    if (node.nodeName === '#text') {
      visible.push(node.value);
    }
    for (const child of node.childNodes || []) walk(child, skip);
  };
  walk(root);
  return { visible: normalizeVisibleText(visible.join('')), headings: htmlHeadingStructure(html), anchors, tables, faq: faqVisibleContent(root) };
}

/** Return precise semantic differences while tolerating serialization-only HTML changes. */
export function compareSemanticHtml(source, derived) {
  const expected = semanticSnapshot(source), actual = semanticSnapshot(derived), differences = [];
  const compact = (value) => normalizeVisibleText(value).replace(/\s+/g, '');
  if (!actual.visible) differences.push('本文が空です');
  if (compact(expected.visible) !== compact(actual.visible)) differences.push('正規化した可視本文が一致しません');
  if (JSON.stringify(expected.headings) !== JSON.stringify(actual.headings)) differences.push('H2〜H6の文字列・ID・順序・親子関係が一致しません');
  if (JSON.stringify(expected.anchors) !== JSON.stringify(actual.anchors)) differences.push('内部アンカーが一致しません');
  if (JSON.stringify(expected.tables) !== JSON.stringify(actual.tables)) differences.push('表の可視内容が一致しません');
  if (JSON.stringify(expected.faq) !== JSON.stringify(actual.faq)) differences.push('FAQが一致しません');
  return differences;
}

export function compareDerivedHtml(source, derived) {
  const expected = semanticSnapshot(source), actual = semanticSnapshot(derived), differences = [];
  if (expected.visible !== actual.visible) differences.push('可視本文');
  if (JSON.stringify(expected.headings) !== JSON.stringify(actual.headings)) differences.push('H2〜H6の文字列・ID・順序・親子関係');
  if (JSON.stringify(expected.anchors) !== JSON.stringify(actual.anchors)) differences.push('内部アンカー');
  if (JSON.stringify(expected.tables) !== JSON.stringify(actual.tables)) differences.push('表の可視内容');
  return differences;
}

function allElements(html) {
  const root = parse5.parseFragment(html), nodes = [];
  const walk = (node) => { if (node.tagName) nodes.push(node); for (const child of node.childNodes || []) walk(child); };
  walk(root); return nodes;
}

export function lintReaderContent(html = '', policy = {}) {
  const errors = [], plain = normalizeVisibleText(text(parse5.parseFragment(html)));
  const reject = policy.reject_internal_status_terms !== false;
  const internal = /\b(?:PARTIAL|PASS_WITH_EXCEPTION|ACCESS_BLOCKED|DRAFT_READY|REVERIFY_BEFORE_PUBLISH)\b|HTTP\s*(?:000|401|403)|検索ツール.{0,12}(?:エラー|失敗)|制作環境|検証スクリプト|WordPress投稿停止理由|情報確認日|確認できなかったため/iu;
  if (reject && internal.test(plain)) errors.push('読者向け本文に内部検証情報があります');
  const nodes = allElements(html);
  const paragraphs = nodes.filter((node) => ['p', 'li'].includes(node.tagName)).map((node) => normalizeVisibleText(text(node))).filter((value) => value.length >= 40);
  const normalized = paragraphs.map((value) => value.replace(/[\s、。,.!！?？「」『』（）()]/g, ''));
  const duplicate = normalized.find((value, index) => normalized.indexOf(value) !== index);
  if (duplicate) errors.push('正規化後40文字以上の重複段落があります');
  const caution = normalized.filter((value) => /(注意|警告|気をつけ|確認してください|避けましょう)/.test(value));
  if (new Set(caution).size < caution.length) errors.push('同一趣旨の注意書きが反復しています');
  const warningBoxes = nodes.filter((node) => {
    const value = `${attr(node, 'class') || ''} ${attr(node, 'data-type') || ''}`;
    return /(?:^|[-_\s])(warning|caution|alert)(?:$|[-_\s])/i.test(value) || (classes(node).includes('swell-block-capbox') && /注意|警告/.test(text(node)));
  });
  const maxWarnings = Number(policy.max_warning_boxes ?? 1);
  if (warningBoxes.length > maxWarnings) errors.push(`注意ボックスが設定上限${maxWarnings}件を超えています`);
  const boxTexts = warningBoxes.map((node) => normalizeVisibleText(text(node)));
  if (new Set(boxTexts).size < boxTexts.length) errors.push('同一注意ボックスが反復しています');
  const unverified = (plain.match(/公式確認不可|要確認/g) || []).length;
  const maxUnverified = Number(policy.max_unverified_markers ?? 2);
  if (unverified > maxUnverified) errors.push(`未確認マーカーが設定上限${maxUnverified}件を超えています`);
  const headings = nodes.filter(headingName).map((node) => normalizeVisibleText(text(node)));
  if (headings.length >= 2 && headings.every((value) => /公式確認不可|要確認/.test(value))) errors.push('全見出しに機械的な未確認マーカーがあります');
  return errors;
}
