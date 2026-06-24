import { readFile } from 'node:fs/promises';
import * as parse5 from 'parse5';

export function stripFrontMatter(content) {
  return String(content).replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trimStart();
}

export async function readWordPressContent(file) {
  return stripFrontMatter(await readFile(file, 'utf8'));
}

export function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

export function stripTags(html) {
  return decodeHtmlEntities(String(html).replace(/<!--([\s\S]*?)-->/g, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

export function normalizeVisibleText(value) {
  return decodeHtmlEntities(String(value).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function removeExcludedForMarkdown(content) {
  let out = String(content);
  out = out.replace(/<!--\s*wp:(code|html)\b[\s\S]*?<!--\s*\/wp:\1\s*-->/gi, '');
  out = out.replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  out = out.replace(/<pre\b[\s\S]*?<\/pre>/gi, '');
  out = out.replace(/<code\b[\s\S]*?<\/code>/gi, '');
  return out;
}

export function visibleCharCount(html) {
  let content = stripFrontMatter(html);
  content = content.replace(/<!--\s*wp:[\s\S]*?-->/g, '');
  content = content.replace(/<!--\s*\/wp:[\s\S]*?-->/g, '');
  content = content.replace(/<!--(?!\s*\/?wp:)[\s\S]*?-->/g, '');
  content = content.replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  content = content.replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(content).replace(/[\s\u200b]+/g, '').length;
}

export function parseWpBlocks(html) {
  const content = stripFrontMatter(html);
  const re = /<!--\s*(\/?)wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)([\s\S]*?)\s*(\/?)-->/gi;
  const events = [];
  let m;
  while ((m = re.exec(content))) {
    const closing = Boolean(m[1]);
    const name = m[2];
    const rawAttrs = (m[3] || '').trim().replace(/\/$/, '').trim();
    const selfClosing = !closing && (Boolean(m[4]) || /\/\s*$/.test(m[3] || ''));
    let attrs = null;
    if (!closing && rawAttrs) {
      if (rawAttrs.startsWith('{')) {
        try { attrs = JSON.parse(rawAttrs); }
        catch (e) { events.push({ type: 'error', message: `invalid JSON attributes for ${name}: ${e.message}`, index: m.index }); }
      } else if (rawAttrs !== '/') {
        events.push({ type: 'error', message: `invalid block attributes for ${name}`, index: m.index });
      }
    }
    events.push({ type: closing ? 'close' : selfClosing ? 'self' : 'open', name, attrs, raw: m[0], index: m.index, end: m.index + m[0].length });
  }
  return events;
}

export function validateBlockNesting(html) {
  const errors = [];
  const stack = [];
  for (const event of parseWpBlocks(html)) {
    if (event.type === 'error') { errors.push(event.message); continue; }
    if (event.type === 'self') continue;
    if (event.type === 'open') stack.push(event);
    if (event.type === 'close') {
      const last = stack.pop();
      if (!last) errors.push(`closing block without opener: ${event.name}`);
      else if (last.name !== event.name) errors.push(`Gutenberg block close mismatch: expected ${last.name}, got ${event.name}`);
    }
  }
  if (stack.length) errors.push(`Gutenberg block is not closed: ${stack.map(x => x.name).join(', ')}`);
  return errors;
}

function serializeNode(node) { return parse5.serialize({ childNodes: [node] }); }
function hasClass(attrs, c) { return (` ${attrs.find(a => a.name === 'class')?.value || ''} `).includes(` ${c} `); }
function attrValue(attrs, k) { return attrs.find(a => a.name === k)?.value || ''; }
function setAttr(attrs, k, v) { const a = attrs.find(x => x.name === k); if (a) a.value = v; else attrs.push({ name: k, value: v }); }
function addClass(attrs, c) { const cur = attrValue(attrs, 'class'); if (!(` ${cur} `).includes(` ${c} `)) setAttr(attrs, 'class', cur ? `${cur} ${c}` : c); }
function block(name, attrs, inner) { return `<!-- wp:${name}${attrs ? ` ${JSON.stringify(attrs)}` : ''} -->\n${inner}\n<!-- /wp:${name} -->`; }

function normalizeNodeChildren(node, stats) {
  if (node.childNodes?.length) node.childNodes = parse5.parseFragment(normalizeSegment(node.childNodes.map(serializeNode).join(''), stats).trim()).childNodes;
}

function wrapListItems(node) {
  const out = [];
  for (const child of node.childNodes || []) {
    if (child.tagName === 'li') out.push(...parse5.parseFragment(`\n<!-- wp:list-item -->\n${serializeNode(child)}\n<!-- /wp:list-item -->\n`).childNodes);
    else out.push(child);
  }
  node.childNodes = out;
}

function normalizeSegment(html, stats) {
  const doc = parse5.parseFragment(html);
  const out = [];
  for (const node of doc.childNodes || []) {
    if (node.nodeName === '#text' && !node.value.trim()) { out.push(node.value); continue; }
    if (node.nodeName === '#comment') { out.push(`<!--${node.data}-->`); continue; }
    const tag = node.tagName;
    if (!tag) { out.push(serializeNode(node)); continue; }
    if (tag === 'p') { stats.paragraph++; out.push(block('paragraph', null, serializeNode(node)));  continue; }
    if (/^h[2-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      addClass(node.attrs, 'wp-block-heading');
      const id = attrValue(node.attrs, 'id');
      stats.heading++;
      out.push(block('heading', id ? { level, anchor: id } : { level }, serializeNode(node))); 
      continue;
    }
    if (tag === 'figure' && hasClass(node.attrs, 'wp-block-table')) { stats.table++; out.push(block('table', null, serializeNode(node)));  continue; }
    if (tag === 'table') { stats.table++; out.push(block('table', null, `<figure class="wp-block-table">${serializeNode(node)}</figure>`)); continue; }
    if (tag === 'ul' || tag === 'ol') {
      addClass(node.attrs, 'wp-block-list');
      wrapListItems(node);
      stats.list++;
      const attrs = tag === 'ol' ? { ordered: true } : null;
      out.push(block('list', attrs, serializeNode(node))); 
      continue;
    }
    if (tag === 'blockquote') { stats.quote++; out.push(block('quote', null, serializeNode(node)));  continue; }
    if (tag === 'pre') { stats.preformatted++; out.push(block('preformatted', null, serializeNode(node)));  continue; }
    if (tag === 'hr') { stats.separator++; out.push('<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity">\n<!-- /wp:separator -->'); continue; }
    out.push(serializeNode(node));
  }
  return out.join('');
}

export function normalizeGutenbergBlocks(html) {
  const content = stripFrontMatter(html);
  const re = /<!--\s*(\/?)wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)([\s\S]*?)\s*(\/?)-->/gi;
  const stats = { paragraph: 0, heading: 0, table: 0, list: 0, quote: 0, preformatted: 0, separator: 0 };
  let out = '', last = 0, depth = 0, m;
  while ((m = re.exec(content))) {
    if (m.index > last) out += depth === 0 ? normalizeSegment(content.slice(last, m.index), stats) : content.slice(last, m.index);
    out += m[0];
    if (!m[1] && !m[4] && !/\/\s*$/.test(m[3] || '')) depth++;
    if (m[1]) depth = Math.max(0, depth - 1);
    last = re.lastIndex;
  }
  if (last < content.length) out += depth === 0 ? normalizeSegment(content.slice(last), stats) : content.slice(last);
  return { html: out.replace(/\n{3,}/g, '\n\n').trim() + '\n', stats };
}

function blockRanges(content) {
  const ranges = [], stack = [];
  for (const e of parseWpBlocks(content)) {
    if (e.type === 'open') stack.push(e);
    else if (e.type === 'close') {
      const open = stack.pop();
      if (open && open.name === e.name) ranges.push({ name: e.name, start: open.index, contentStart: open.end, end: e.end });
    } else if (e.type === 'self') ranges.push({ name: e.name, start: e.index, contentStart: e.end, end: e.end });
  }
  return ranges;
}
function insideRange(ranges, idx, names) { return ranges.some(r => idx >= r.start && idx < r.end && names.includes(r.name)); }
function insideSwell(ranges, idx) { return ranges.some(r => idx >= r.start && idx < r.end && r.name.startsWith('loos/')); }
function insideCapBoxContent(content, idx) {
  const before = content.slice(0, idx);
  const open = before.lastIndexOf('<div');
  if (open < 0 || !/class=[\"'][^\"']*cap_box_content/i.test(before.slice(open))) return false;
  const close = before.lastIndexOf('</div>');
  return close < open;
}

export function findUnwrappedHtmlBlocks(html) {
  const content = stripFrontMatter(html);
  const ranges = blockRanges(content);
  const issues = [];
  const first = content.replace(/^\s+/, '');
  if (/^<(p|h[2-6]|figure|ul|ol|blockquote|pre|hr)\b/i.test(first)) issues.push('本文冒頭がGutenbergブロックコメントではなく通常HTMLから始まっています');
  const checks = [
    { re: /<p\b[^>]*>/gi, names: ['paragraph', 'list'], label: '<p> が wp:paragraph に囲まれていません' },
    { re: /<h[2-6]\b[^>]*>/gi, names: ['heading'], label: 'h2〜h6 が wp:heading に囲まれていません' },
    { re: /<figure\b(?=[^>]*class=["'][^"']*wp-block-table)/gi, names: ['table'], label: 'figure.wp-block-table が wp:table に囲まれていません' },
    { re: /<table\b[^>]*>/gi, names: ['table'], label: '<table> が wp:table に囲まれていません' },
    { re: /<(ul|ol)\b[^>]*>/gi, names: ['list'], label: 'ul / ol が wp:list に囲まれていません' },
    { re: /<li\b[^>]*>/gi, names: ['list-item'], label: 'li が wp:list-item に囲まれていません' },
    { re: /<blockquote\b[^>]*>/gi, names: ['quote', 'pullquote'], label: '<blockquote> が wp:quote に囲まれていません' },
    { re: /<pre\b[^>]*>/gi, names: ['preformatted', 'code'], label: '<pre> が wp:preformatted または wp:code に囲まれていません' },
    { re: /<hr\b[^>]*>/gi, names: ['separator'], label: '<hr> が wp:separator に囲まれていません' },
  ];
  for (const c of checks) {
    for (const m of content.matchAll(c.re)) if (!insideSwell(ranges, m.index) && !insideCapBoxContent(content, m.index) && !insideRange(ranges, m.index, c.names)) issues.push(c.label);
  }
  return [...new Set(issues)];
}

function blockAttributes(content, name, index) {
  const ranges = blockRanges(content).filter(r => r.name === name && index >= r.start && index < r.end).sort((a, b) => b.start - a.start);
  if (!ranges.length) return null;
  const event = parseWpBlocks(content.slice(ranges[0].start, ranges[0].contentStart)).find(e => e.name === name && e.type === 'open');
  return event?.attrs || null;
}

export function validateGutenbergContent(html, { title = '' } = {}) {
  const content = stripFrontMatter(html);
  const errors = [];
  errors.push(...validateBlockNesting(content));
  if (!/<!--\s*wp:/.test(content)) errors.push('Gutenberg block comments are missing');
  errors.push(...findUnwrappedHtmlBlocks(content));
  if (/^---\s*$/m.test(content)) errors.push('front matter remains in content');
  const markdownTarget = removeExcludedForMarkdown(content).replace(/<!--[\s\S]*?-->/g, '');
  if (/^#{1,6}\s+/m.test(markdownTarget)) errors.push('Markdown headings remain');
  if (/^\s*[-*+]\s+/m.test(markdownTarget)) errors.push('Markdown unordered lists remain');
  if (/!\[[^\]]*\]\([^)]*\)/.test(markdownTarget)) errors.push('Markdown image syntax remains');
  if (/```/.test(markdownTarget)) errors.push('Markdown code fences remain');
  if (/<h1\b/i.test(content)) errors.push('H1 is not allowed in article body');
  const meaningfulBlocks = [...content.matchAll(/<!--\s*wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)/gi)].map(m => m[1]).filter(n => !n.startsWith('/'));
  if (meaningfulBlocks.length === 1 && meaningfulBlocks[0] === 'html') errors.push('article must not be a single wp:html block');
  const ids = [...content.matchAll(/\sid=["']([^"']+)["']/gi)].map(x => x[1]);
  const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dup.length) errors.push(`duplicate id: ${dup.join(', ')}`);
  const h2s = [...content.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi)].map(x => {
    const id = (x[1].match(/\sid=["']([^"']+)["']/i) || [])[1] || '';
    return { id, text: normalizeVisibleText(x[2]), index: x.index, attrs: x[1] };
  });
  for (const h of h2s) {
    if (!h.id) errors.push(`H2 id is missing: ${h.text}`);
    const attrs = blockAttributes(content, 'heading', h.index);
    if (attrs?.anchor && attrs.anchor !== h.id) errors.push(`H2 anchor does not match id: ${attrs.anchor} != ${h.id}`);
  }
  const secIds = h2s.map(h => h.id).filter(id => /^sec-\d{2}$/.test(id));
  const duplicatedSec = [...new Set(secIds.filter((id, i) => secIds.indexOf(id) !== i))];
  if (duplicatedSec.length) errors.push(`duplicate sec id: ${duplicatedSec.join(', ')}`);
  const hrefs = [...content.matchAll(/<a\b[^>]*href=["']#([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(x => ({ id: x[1], text: normalizeVisibleText(x[2]), index: x.index }));
  for (const href of hrefs) if (!ids.includes(href.id)) errors.push(`missing target: #${href.id}`);
  if (h2s.length) {
    const firstH2 = h2s[0].index;
    const beforeFirstH2 = content.slice(0, firstH2);
    const hasToc = /この記事でわかること/.test(normalizeVisibleText(beforeFirstH2));
    const tocLinks = hrefs.filter(h => h.index < firstH2 && h2s.some(x => x.id === h.id));
    if (hasToc) {
      if (!tocLinks.length) errors.push('toc block has no H2 links before first H2');
      const h2Order = new Map(h2s.map((h, i) => [h.id, i]));
      const seenTocIds = new Set();
      const dedupedTocLinks = [...tocLinks].reverse().filter((h) => { if (seenTocIds.has(h.id)) return false; seenTocIds.add(h.id); return true; }).reverse();
      const order = dedupedTocLinks.map(h => h2Order.get(h.id));
      if (order.some((n, i) => i > 0 && n <= order[i - 1])) errors.push('toc hrefs must follow H2 order');
      for (const link of dedupedTocLinks) {
        const target = h2s.find(h => h.id === link.id);
        if (target && normalizeVisibleText(link.text) !== normalizeVisibleText(target.text)) errors.push(`toc text must match H2 text for #${link.id}`);
      }
    }
  }
  if (title) {
    const bodyText = normalizeVisibleText(content);
    const escaped = normalizeVisibleText(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escaped && new RegExp(escaped, 'g').test(bodyText)) errors.push('article title is duplicated in body');
  }
  return { ok: errors.length === 0, errors, content };
}
