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

const READER_SEGMENT_TAGS = new Set([
  'p', 'li', 'blockquote', 'figcaption', 'caption', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
]);

function hiddenNode(node) {
  if (['script', 'style', 'template'].includes(node?.tagName)) return true;
  const attributes = Object.fromEntries((node?.attrs || []).map((item) => [item.name.toLowerCase(), item.value]));
  return Object.hasOwn(attributes, 'hidden')
    || String(attributes['aria-hidden'] || '').toLowerCase() === 'true'
    || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:;|$)/iu.test(attributes.style || '');
}

function segmentText(node, root = node, hidden = false) {
  const nextHidden = hidden || hiddenNode(node);
  if (nextHidden) return '';
  if (node?.nodeName === '#text') return node.value || '';
  return (node?.childNodes || []).map((child) => {
    if (child !== root && child?.tagName && READER_SEGMENT_TAGS.has(child.tagName)) return '';
    return segmentText(child, root, nextHidden);
  }).join('');
}

function lineNumberAt(value, index) {
  if (!Number.isInteger(index) || index < 0) return null;
  return value.slice(0, index).split('\n').length;
}

function markdownReaderSegments(content) {
  const mask = (value) => value.replace(/[^\n]/gu, ' ');
  const visible = content
    .replace(/<!--[\s\S]*?-->/gu, mask)
    .replace(/```[\s\S]*?```/gu, mask)
    .replace(/~~~[\s\S]*?~~~/gu, mask);
  const segments = [];
  const clean = (value) => normalizeVisibleText(value
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/u, '')
    .replace(/[*_~`]/gu, ''));
  let buffer = [], startLine = null;
  const flush = () => {
    const value = clean(buffer.join('\n'));
    if (value) segments.push({ text: value, line: startLine });
    buffer = [];
    startLine = null;
  };
  for (const [index, line] of visible.split('\n').entries()) {
    if (!line.trim()) { flush(); continue; }
    if (/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/u.test(line)) {
      flush();
      const value = clean(line);
      if (value) segments.push({ text: value, line: index + 1 });
      continue;
    }
    if (startLine === null) startLine = index + 1;
    buffer.push(line);
  }
  flush();
  return segments;
}

/** Extract reader-visible paragraph, list, heading and caption units from HTML or Markdown. */
export function readerFacingSegments(content = '') {
  const raw = String(content);
  const appearsToBeHtml = /<(?:p|li|blockquote|figcaption|caption|td|th|h[1-6])\b/iu.test(raw)
    || /<!--\s*wp:/iu.test(raw);
  if (!appearsToBeHtml) return markdownReaderSegments(raw);
  const root = parse5.parseFragment(raw, { sourceCodeLocationInfo: true });
  const segments = [];
  const walk = (node, hidden = false) => {
    const nextHidden = hidden || hiddenNode(node);
    if (nextHidden) return;
    if (node?.tagName && READER_SEGMENT_TAGS.has(node.tagName)) {
      const value = normalizeVisibleText(segmentText(node));
      if (value) {
        const index = node.sourceCodeLocation?.startOffset ?? -1;
        segments.push({ text: value, line: lineNumberAt(raw, index) });
      }
    }
    for (const child of node?.childNodes || []) walk(child, nextHidden);
  };
  walk(root);
  if (segments.length) return segments;
  const fallback = normalizeVisibleText(segmentText(root));
  return fallback ? [{ text: fallback, line: 1 }] : [];
}

function findingExcerpt(value, maximum = 180) {
  const normalized = normalizeVisibleText(value);
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

const EDITORIAL_PROCESS_RULES = [
  {
    id: 'internal_status',
    reason: '内部ステータス・監査コード',
    pattern: /\b(?:PARTIAL|PASS_WITH_EXCEPTION|ACCESS_BLOCKED|DRAFT_READY|REVERIFY_BEFORE_PUBLISH|RESEARCH_FAIL|REVIEW_EVIDENCE_MISSING|EDITORIAL_PROCESS_LEAK|SOURCE_REVERIFY|PUBLISH_READY|NOT_READY)\b|HTTP\s*(?:000|401|403|404)|監査コード/iu
  },
  {
    id: 'internal_artifact',
    reason: '内部成果物・制作指示',
    pattern: /(?:research\.md|source-manifest\.json|section-evidence\.json|check-report\.md|approved_outline\.json|canonical-headings\.json|draft\.md|article(?:-linked|-decorated)?\.html)|(?:承認済み|固定).{0,12}見出し|見出し.{0,12}(?:固定|変更できない)|CTA.{0,12}(?:指定|設置|追加)|(?:指定|設置|追加).{0,12}CTA|WordPress投稿停止理由/iu
  },
  {
    id: 'execution_failure',
    reason: '実行環境・取得失敗',
    pattern: /(?:実行環境|制作環境|検索ツール|Web検索|ウェブ検索|プロキシ|ネットワーク制限).{0,40}(?:取得|接続|確認|アクセス|失敗|制限|エラー|利用でき|使え)|(?:取得|接続|アクセス).{0,24}(?:できなかった|できませんでした|失敗した).{0,24}(?:実行環境|検索ツール|Web検索|ウェブ検索|プロキシ)/iu
  },
  {
    id: 'source_selection_narration',
    reason: '出典・口コミの編集上の採否',
    pattern: /(?:今回は|今回確認した|本記事では|当記事では|この記事では|ここでは|編集部では|筆者は|制作側).{0,120}(?:確認できな|確認できていな|確認できません|確認できた|確認済み|採用|不採用|掲載しな|掲載していな|使用しな|使用していな|取得できな|裏付けられな|一般化していな|検証した|生成した|執筆した|引用しな|推測せず|補完しな|調査した|優先した)/iu
  },
  {
    id: 'source_selection_narration',
    reason: '出典・口コミの編集上の採否',
    pattern: /(?:口コミ|レビュー|体験談|投稿者|出典|情報源|資料|根拠).{0,48}(?:確認できな|確認できていな|未確認|採用していな|採用していません|採用しな|不採用|掲載していません|掲載しな|使用していな|使用していません|使用しな|取得できな|裏付けられな).{0,48}(?:今回は|本記事|当記事|この記事|ここでは|ため|ので|以上)/iu
  },
  {
    id: 'anti_fabrication_narration',
    reason: '架空情報を作らないという制作方針',
    pattern: /架空.{0,24}(?:口コミ|レビュー|投稿者|体験談|料金|統計|順位).{0,40}(?:掲載|作成|生成|補完|使用).{0,12}(?:しない|しません|していない)|(?:口コミ|レビュー|投稿者|体験談).{0,24}架空.{0,32}(?:掲載|作成|生成|補完|使用).{0,12}(?:しない|しません|していない)/iu
  },
  {
    id: 'evidence_gap_narration',
    reason: '根拠不足を本文で説明する制作メモ',
    pattern: /(?:公式仕様|公式情報|公式資料).{0,40}(?:確認できない|未確認).{0,24}(?:口コミ|レビュー)|(?:今回確認した|今回は).{0,48}(?:口コミ|レビュー|資料|出典).{0,48}(?:ない|なく|ありません|不足|採用|使用|裏付け)|(?:確認できる範囲|確認済み資料の範囲|資料(?:が|の)(?:ない|不足)(?:論点)?|根拠(?:が|の)(?:ない|不足)(?:論点)?).{0,60}(?:整理|説明|解説|回答|推測|補(?:う|わ)|示す|作らず)|(?:件数|発生数|割合).{0,24}(?:示さず|作らず|補わず)|資料.{0,16}(?:ない|ありません).{0,32}ここでは/iu
  }
];

/** Find production notes or source-selection narration leaked into public article prose. */
export function findEditorialProcessLeaks(content = '') {
  const findings = [];
  for (const segment of readerFacingSegments(content)) {
    const matched = EDITORIAL_PROCESS_RULES.find(({ pattern }) => pattern.test(segment.text));
    if (!matched) continue;
    findings.push({
      code: 'EDITORIAL_PROCESS_LEAK',
      rule: matched.id,
      message: `読者向け本文に${matched.reason}があります`,
      excerpt: findingExcerpt(segment.text),
      line: segment.line
    });
  }
  return findings;
}

const EDITORIAL_DISCLAIMER_PATTERN = /(?:保証(?:でき|され|するものでは|し).{0,8}(?:ない|ありません|ません)|断定(?:でき|し).{0,8}(?:ない|ありません|ません)|(?:一つ|ひとつ)の(?:判断)?材料|参考程度|あくまで.{0,16}(?:目安|参考)|個人差があり|結果.{0,20}(?:異なり|異なる|左右され))/iu;

/** Flag article-wide repetition of defensive boilerplate that crowds out direct answers. */
export function findEditorialDisclaimerOveruse(content = '', { maximum = 5 } = {}) {
  const segments = readerFacingSegments(content).filter(({ text: value }) => EDITORIAL_DISCLAIMER_PATTERN.test(value));
  if (segments.length <= maximum) return [];
  return [{
    code: 'EDITORIAL_DISCLAIMER_OVERUSE',
    message: `保証・断定回避などの同型注意書きが${segments.length}段落あり、上限${maximum}段落を超えています`,
    excerpt: segments.slice(0, 2).map(({ text: value }) => findingExcerpt(value, 100)).join(' / '),
    line: segments[0]?.line ?? null
  }];
}

export function lintReaderContent(html = '', policy = {}) {
  const errors = [], plain = normalizeVisibleText(text(parse5.parseFragment(html)));
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
