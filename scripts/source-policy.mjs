import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFragment } from 'parse5';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_POLICY_PATH = path.join(rootDir, 'config/source-policy.json');

export function loadSourcePolicySync() {
  return existsSync(SOURCE_POLICY_PATH)
    ? JSON.parse(readFileSync(SOURCE_POLICY_PATH, 'utf8'))
    : {};
}

export const SOURCE_POLICY = loadSourcePolicySync();

const REQUIRED_ALLOWED_TYPES = [
  'public_authority',
  'official_subject',
  'official_terms_help',
  'official_app_store',
  'academic_primary',
  'standards_body',
  'public_registry_dataset',
  'first_party_research_with_methodology'
];
const REQUIRED_RESEARCH_TYPES = ['competitor_editorial', 'secondary_review'];
const REQUIRED_PROHIBITED_TYPES = ['affiliate_media', 'content_farm', 'third_party_survey_without_methodology'];
const REQUIRED_PUBLIC_SUFFIXES = ['go.jp', 'lg.jp'];
const REQUIRED_STORE_DOMAINS = ['apps.apple.com', 'play.google.com'];
const REQUIRED_PROHIBITED_ALIASES = ['出会いコンパス', 'App-Liv', 'Appliv'];
const REQUIRED_REDIRECTORS = ['bit.ly', 'goo.gl', 't.co', 'tinyurl.com'];
const REQUIRED_ERROR_CODES = [
  'SOURCE_POLICY_INVALID',
  'PROHIBITED_CITATION_SOURCE',
  'UNCLASSIFIED_CITATION_SOURCE',
  'RESEARCH_SOURCE_LEAK',
  'SOURCE_MANIFEST_MISMATCH',
  'SOURCE_ARTIFACT_MISSING',
  'AFFILIATE_LINK_AS_EVIDENCE',
  'REDIRECTOR_SOURCE_URL',
  'INSECURE_SOURCE_URL',
  'UNSOURCED_SURVEY_CLAIM'
];
const REQUIRED_AFFILIATE_REL = ['sponsored', 'noopener', 'noreferrer'];
const SURVEY_EVIDENCE_TYPES = new Set(['public_authority', 'academic_primary', 'public_registry_dataset', 'first_party_research_with_methodology']);
const UNSAFE_REGISTRY_HOSTS = new Set(['com', 'net', 'org', 'jp', 'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'lg.jp']);

function sameStringSet(values, expected) {
  return Array.isArray(values) && values.length === expected.length && expected.every((value) => values.includes(value));
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function includesEveryString(values, expected) {
  return Array.isArray(values) && expected.every((value) => values.includes(value));
}

function isIsoCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  const today = new Date().toISOString().slice(0, 10);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value && value <= today;
}

function hasMeaningfulText(value) {
  return typeof value === 'string' && /[\p{L}\p{N}]/u.test(value.normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/gu, ''));
}

export function validateSourcePolicyConfiguration(policy = SOURCE_POLICY) {
  const findings = [];
  const allowedSourceTypes = arrayValue(policy?.allowed_source_types);
  const publishedArtifacts = arrayValue(policy?.published_artifacts);
  const researchOnlyArtifacts = arrayValue(policy?.research_only_artifacts);
  const prohibitedDomains = arrayValue(policy?.prohibited_domains);
  const prohibitedAliases = arrayValue(policy?.prohibited_source_aliases);
  const redirectorDomains = arrayValue(policy?.redirector_domains);
  const requiredArrays = [
    'published_artifacts',
    'research_only_artifacts',
    'allowed_source_types',
    'research_only_source_types',
    'prohibited_source_types',
    'public_authority_domain_suffixes',
    'official_store_domains',
    'approved_external_domains',
    'prohibited_domains',
    'prohibited_source_aliases',
    'redirector_domains',
    'error_codes'
  ];
  if (policy?.version !== 1) findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'config/source-policy.json の version は1にしてください。' });
  if (policy?.mode !== 'allowlist') findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'config/source-policy.json の mode は allowlist にしてください。' });
  if (policy?.manifest_version !== 1) findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'manifest_version は1にしてください。' });
  if (policy?.rule_file !== 'rules/00-source-policy.md') findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'rule_file は rules/00-source-policy.md にしてください。' });
  if (policy?.manifest_file !== 'source-manifest.json') findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'manifest_file は source-manifest.json にしてください。' });
  if (policy?.require_https !== true) findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'require_https は true にしてください。' });
  if (policy?.unclassified_action !== 'error') findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'unclassified_action は error にしてください。' });
  for (const key of requiredArrays) {
    if (!Array.isArray(policy?.[key])) findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${key} は配列で定義してください。` });
  }
  for (const file of ['draft.md', 'article.html', 'article-linked.html', 'article-decorated.html', 'external-links.md']) {
    if (!publishedArtifacts.includes(file)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: `published_artifacts に ${file} が必要です。` });
  }
  for (const file of ['research.md', 'serp.md', 'headings.csv', 'heading-analysis.md', 'heading-plan.md']) {
    if (!researchOnlyArtifacts.includes(file)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: `research_only_artifacts に ${file} が必要です。` });
  }
  if (!sameStringSet(policy?.allowed_source_types, REQUIRED_ALLOWED_TYPES)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'allowed_source_types は承認済みの8種別から変更できません。' });
  if (!sameStringSet(policy?.research_only_source_types, REQUIRED_RESEARCH_TYPES)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'research_only_source_types は競合調査専用の2種別から変更できません。' });
  if (!sameStringSet(policy?.prohibited_source_types, REQUIRED_PROHIBITED_TYPES)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'prohibited_source_types は公開禁止の3種別から変更できません。' });
  if (!sameStringSet(policy?.public_authority_domain_suffixes, REQUIRED_PUBLIC_SUFFIXES)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'public_authority_domain_suffixes は go.jp と lg.jp に限定してください。' });
  if (!sameStringSet(policy?.official_store_domains, REQUIRED_STORE_DOMAINS)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'official_store_domains は apps.apple.com と play.google.com に限定してください。' });
  if (!prohibitedDomains.some((domain) => hostnameMatches('app-liv.jp', domain))) {
    findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'app-liv.jp を prohibited_domains から外せません。' });
  }
  for (const requiredAlias of REQUIRED_PROHIBITED_ALIASES) {
    const requiredToken = requiredAlias.normalize('NFKC').toLowerCase().trim();
    if (!prohibitedAliases.some((alias) => String(alias).normalize('NFKC').toLowerCase().trim() === requiredToken)) {
      findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${requiredAlias} を prohibited_source_aliases から外せません。` });
    }
  }
  if (!includesEveryString(policy?.redirector_domains, REQUIRED_REDIRECTORS)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: '既定の短縮・リダイレクト用ドメインを redirector_domains から外せません。' });
  if (!includesEveryString(policy?.error_codes, REQUIRED_ERROR_CODES)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: '必須の出典監査エラーコードを error_codes から外せません。' });
  const affiliate = policy?.affiliate_link_policy;
  if (
    !affiliate
    || affiliate.manifest_section !== 'sources'
    || affiliate.manifest_role !== 'affiliate_cta'
    || affiliate.purpose_attribute !== 'data-link-purpose'
    || affiliate.purpose_value !== 'affiliate-cta'
    || affiliate.may_support_claims !== false
    || !sameStringSet(affiliate.required_rel_tokens, REQUIRED_AFFILIATE_REL)
  ) findings.push({ code: 'SOURCE_POLICY_INVALID', message: 'affiliate_link_policy はCTAと引用を分離する既定設定から変更できません。' });
  const approvedHosts = new Set();
  for (const [index, entry] of arrayValue(policy?.approved_external_domains).entries()) {
    const label = `approved_external_domains[${index}]`;
    const host = cleanHostname(entry?.host);
    if (!host || approvedHosts.has(host)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${label}.host がないか重複しています。` });
    else approvedHosts.add(host);
    try {
      const parsed = new URL(`https://${host}`);
      if (parsed.hostname !== host || parsed.pathname !== '/') throw new Error('invalid host');
    } catch { findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${label}.host は有効なホスト名にしてください。` }); }
    if (UNSAFE_REGISTRY_HOSTS.has(host)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${label}.host に共有ドメイン接尾辞は登録できません。` });
    if (!hasMeaningfulText(entry?.owner)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${label}.owner が文字列で必要です。` });
    if (!isIsoCalendarDate(entry?.verified_at)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${label}.verified_at は有効な YYYY-MM-DD で記録してください。` });
    if (!hasMeaningfulText(entry?.verification_basis)) findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${label}.verification_basis が文字列で必要です。` });
    if (entry?.include_subdomains !== false) findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${label}.include_subdomains は false にしてください。承認は完全一致ホスト単位で行います。` });
    if (!Array.isArray(entry?.allowed_types) || entry.allowed_types.length === 0 || entry.allowed_types.some((type) => !allowedSourceTypes.includes(type))) {
      findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${label}.allowed_types は許可済み出典種別の配列にしてください。` });
    }
    if (hostInList(host, prohibitedDomains) || hostInList(host, redirectorDomains)) {
      findings.push({ code: 'SOURCE_POLICY_INVALID', message: `${label}.host は禁止・リダイレクト用ドメインです。` });
    }
  }
  return findings;
}

function cleanHostname(value = '') {
  return String(value).trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

export function hostnameMatches(hostname, domain) {
  const host = cleanHostname(hostname);
  const expected = cleanHostname(domain);
  return Boolean(host && expected && (host === expected || host.endsWith(`.${expected}`)));
}

function canonicalUrl(value) {
  const url = new URL(String(value).replaceAll('&amp;', '&'));
  url.hash = '';
  return url.toString();
}

function normalizedAlias(value = '') {
  return String(value).normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff]/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

function regexpEscape(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function containsSourceAlias(text = '', alias = '') {
  const normalizedText = String(text).normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff]/gu, '');
  const compactAlias = normalizedAlias(alias);
  if (!compactAlias) return false;
  if (/^[a-z0-9]+$/u.test(compactAlias)) {
    const flexibleAlias = [...compactAlias].map(regexpEscape).join('[\\s\\p{P}\\p{S}]*');
    return new RegExp(`(?<![a-z0-9])${flexibleAlias}(?![a-z0-9])`, 'iu').test(normalizedText);
  }
  return normalizedAlias(normalizedText).includes(compactAlias);
}

function trimUrl(value = '') {
  return String(value).replace(/[\])}>,.;、。]+$/gu, '');
}

function attributesFor(node) {
  return Object.fromEntries((node?.attrs || []).map((attr) => [attr.name.toLowerCase(), attr.value]));
}

function hiddenElement(node) {
  if (!node?.tagName) return false;
  const attrs = attributesFor(node);
  return Object.hasOwn(attrs, 'hidden')
    || String(attrs['aria-hidden'] || '').toLowerCase() === 'true'
    || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:;|$)/iu.test(attrs.style || '');
}

function visibleNodeText(node, hidden = false) {
  const nextHidden = hidden || ['script', 'style', 'template'].includes(node?.tagName) || hiddenElement(node);
  if (node?.nodeName === '#text') return nextHidden ? '' : node.value || '';
  return (node?.childNodes || []).map((child) => visibleNodeText(child, nextHidden)).join('');
}

function anchorContext(node) {
  let current = node?.parentNode;
  let insideCitationElement = false;
  while (current) {
    if (['cite', 'figcaption'].includes(current.tagName)) insideCitationElement = true;
    if (['p', 'li', 'td', 'th', 'blockquote', 'figcaption'].includes(current.tagName)) {
      return { contextText: visibleNodeText(current), insideCitationElement };
    }
    current = current.parentNode;
  }
  return { contextText: visibleNodeText(node), insideCitationElement };
}

function parsedPublishedContent(content = '') {
  const fragment = parseFragment(String(content), { sourceCodeLocationInfo: true });
  const anchors = [];
  const visibleText = [];
  const bareText = [];
  const walk = (node, hidden = false, insideAnchor = false) => {
    const nextHidden = hidden || ['script', 'style', 'template'].includes(node.tagName) || hiddenElement(node);
    const nextInsideAnchor = insideAnchor || node.tagName === 'a';
    if (node.nodeName === '#text' && !nextHidden) {
      visibleText.push(node.value || '');
      if (!insideAnchor) bareText.push(node.value || '');
    }
    if (['a', 'area'].includes(node.tagName)) {
      const startTag = node.sourceCodeLocation?.startTag;
      const attrs = attributesFor(node);
      const hrefValue = String(attrs.href || attrs['xlink:href'] || '');
      const rawHref = hrefValue.trim();
      if (rawHref) {
        const rel = String(attrs.rel || '').toLowerCase().split(/[\t\n\f\r ]+/u).filter(Boolean);
        const role = String(attrs['data-link-purpose'] || '').toLowerCase() === 'affiliate-cta' ? 'affiliate_cta' : 'citation';
        const context = { anchorText: visibleNodeText(node), ...anchorContext(node) };
        if (/[\u0000-\u001f\u007f\\]/u.test(hrefValue)) anchors.push({ url: rawHref, role, rel, index: startTag?.startOffset ?? -1, unsafeScheme: true, ...context });
        else if (rawHref.startsWith('//')) anchors.push({ url: `https:${rawHref}`, role, rel, index: startTag?.startOffset ?? -1, protocolRelative: true, ...context });
        else if (/^https?:\/\//iu.test(rawHref)) anchors.push({ url: rawHref, role, rel, index: startTag?.startOffset ?? -1, ...context });
        else if (/^[a-z][a-z0-9+.-]*:/iu.test(rawHref) && !/^(?:mailto|tel):/iu.test(rawHref)) {
          anchors.push({ url: rawHref, role, rel, index: startTag?.startOffset ?? -1, unsafeScheme: true, ...context });
        }
      }
    }
    if (node.tagName) {
      const attrs = attributesFor(node);
      const unsafeActiveAttribute = Object.keys(attrs).find((name) => name === 'ping' || /^on[a-z]+$/u.test(name));
      if (unsafeActiveAttribute) anchors.push({ url: `${node.tagName}[${unsafeActiveAttribute}]`, role: 'citation', rel: [], index: node.sourceCodeLocation?.startTag?.startOffset ?? -1, unsafeScheme: true });
    }
    const blockedUrlAttribute = {
      base: 'href',
      button: 'formaction',
      embed: 'src',
      form: 'action',
      iframe: 'src',
      input: 'formaction',
      object: 'data',
      script: 'src'
    }[node.tagName];
    if (blockedUrlAttribute) {
      const blockedValue = String(attributesFor(node)[blockedUrlAttribute] || '').trim();
      if (blockedValue) anchors.push({ url: blockedValue, role: 'citation', rel: [], index: node.sourceCodeLocation?.startTag?.startOffset ?? -1, unsafeScheme: true });
    }
    if (node.tagName && !nextHidden) {
      const attrs = attributesFor(node);
      for (const name of ['alt', 'aria-label', 'title', 'placeholder', 'value']) {
        if (attrs[name]) visibleText.push(attrs[name]);
      }
    }
    for (const child of node.childNodes || []) walk(child, nextHidden, nextInsideAnchor);
  };
  walk(fragment);
  return { anchors, visibleText: visibleText.join(''), bareText: bareText.join('') };
}

export function extractPublishedUrls(content = '') {
  const parsed = parsedPublishedContent(content);
  const occurrences = [...parsed.anchors];
  const visibleOccurrences = [];

  const urlPattern = /(?:https?:)?\/\/[^\s<>"')\]]+/giu;
  for (const match of parsed.bareText.matchAll(urlPattern)) {
    const protocolRelative = match[0].startsWith('//');
    visibleOccurrences.push({ url: trimUrl(protocolRelative ? `https:${match[0]}` : match[0]), role: 'citation', rel: [], index: match.index, protocolRelative });
  }

  const markupWithoutComments = String(content)
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '');
  for (const match of markupWithoutComments.matchAll(/<((?:https?:)?\/\/[^>\s]+)>/giu)) {
    const protocolRelative = match[1].startsWith('//');
    visibleOccurrences.push({ url: trimUrl(protocolRelative ? `https:${match[1]}` : match[1]), role: 'citation', rel: [], index: match.index, protocolRelative });
  }

  const seenVisible = new Set();
  return occurrences.concat(visibleOccurrences.filter((item) => {
    const key = `${item.url}\u0000${item.protocolRelative ? 'protocol-relative' : ''}`;
    if (seenVisible.has(key)) return false;
    seenVisible.add(key);
    return true;
  }));
}

function visibleSourceText(content = '') {
  return parsedPublishedContent(content).visibleText;
}

function isTraceableSurveyCitation(occurrence, manifest, policy) {
  if (occurrence.role !== 'citation' || occurrence.protocolRelative || occurrence.unsafeScheme) return false;
  let parsed;
  try { parsed = new URL(occurrence.url.replaceAll('&amp;', '&')); }
  catch { return false; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
  const hostname = cleanHostname(parsed.hostname);
  if (hostInList(hostname, policy.prohibited_domains) || hostInList(hostname, policy.redirector_domains)) return false;
  const entry = entryForUrl(parsed.toString(), manifest);
  if (!entry || entry.role !== 'citation' || entry.evidence_kind !== 'survey_result' || !SURVEY_EVIDENCE_TYPES.has(entry.type)) return false;
  if (!arrayValue(entry.claim_scope).some((claim) => /(?:調査|統計|回答|割合|比率|人数|サンプル|データ)/u.test(claim))) return false;
  if (entry.type === 'public_authority') return hostInList(hostname, policy.public_authority_domain_suffixes);
  if (entry.type === 'official_app_store') return hostInList(hostname, policy.official_store_domains);
  return approvedDomainFor(hostname, entry.type, policy);
}

export function findUnlinkedSurveyClaims(content = '', { manifest = { sources: [] }, policy = SOURCE_POLICY } = {}) {
  const segments = String(content).split(/<\/(?:p|li|td|th|blockquote)>|(?:\r?\n){2,}|\r?\n(?=\s*(?:[-*+] |\d+[.)] ))/giu);
  const findings = [];
  for (const segment of segments) {
    const text = visibleSourceText(segment).normalize('NFKC').replace(/\s+/gu, ' ').trim();
    const surveyTerm = '(?:調査(?!日|時点|工程|状況|記録|候補|対象URL)|アンケート)';
    const peopleBeforeSurvey = new RegExp(`\\d[\\d,.]*\\s*(?:人|名)[^。！？]{0,40}${surveyTerm}`, 'u');
    const resultAfterSurvey = new RegExp(`${surveyTerm}(?:結果|によると|では|で|の回答|回答者)?[^。！？]{0,120}\\d[\\d,.]*\\s*(?:%|％|人|名|件)`, 'u');
    const sampleRatio = /\d[\d,.]*\s*(?:人|名)(?:中|のうち|で[、,]?)[^。！？]{0,80}\d[\d,.]*\s*(?:%|％|人|名)/u;
    const populationPercentage = /(?:(?:利用者|回答者|ユーザー|会員|満足度|回答率|利用率|成功率)[^。！？]{0,60}\d[\d,.]*\s*(?:%|％)|\d[\d,.]*\s*(?:%|％)[^。！？]{0,60}(?:利用者|回答者|ユーザー|会員|満足|回答|利用率|成功率))/u;
    if (!peopleBeforeSurvey.test(text) && !resultAfterSurvey.test(text) && !sampleRatio.test(text) && !populationPercentage.test(text)) continue;
    if (extractPublishedUrls(segment).some((item) => isTraceableSurveyCitation(item, manifest, policy))) continue;
    findings.push(text.slice(0, 160));
  }
  return [...new Set(findings)];
}

export function validateSourceManifest(manifest, policy = SOURCE_POLICY) {
  const findings = [];
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.sources)) {
    return [{ code: 'SOURCE_MANIFEST_MISMATCH', message: 'source-manifest.json は sources 配列を持つJSONオブジェクトにしてください。' }];
  }
  if (manifest.version !== policy.manifest_version) {
    findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `source-manifest.json の version は ${policy.manifest_version} にしてください。` });
  }

  const ids = new Set();
  const urls = new Map();
  const knownTypes = new Set([
    ...arrayValue(policy?.allowed_source_types),
    ...arrayValue(policy?.research_only_source_types),
    ...arrayValue(policy?.prohibited_source_types)
  ]);
  for (const [index, source] of manifest.sources.entries()) {
    const label = `sources[${index}]`;
    if (!source || typeof source !== 'object') {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label} はオブジェクトにしてください。` });
      continue;
    }
    if (!hasMeaningfulText(source.id) || ids.has(source.id)) findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.id が文字列でないか、空または重複しています。` });
    else ids.add(source.id);
    if (!knownTypes.has(source.type)) findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.type が未定義です: ${source.type || '(empty)'}` });
    if (!['citation', 'affiliate_cta', 'research_only'].includes(source.role)) findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.role が不正です: ${source.role || '(empty)'}` });
    if (!isIsoCalendarDate(source.verified_at)) findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.verified_at は有効な YYYY-MM-DD で記録してください。` });
    if (!hasMeaningfulText(source.name)) findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.name に資料名またはリンク先名を文字列で記録してください。` });
    if (source.aliases !== undefined && (!Array.isArray(source.aliases) || source.aliases.some((alias) => !hasMeaningfulText(alias)))) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.aliases は文字列の配列にしてください。` });
    }
    if (source.role === 'citation' && (!Array.isArray(source.claim_scope) || source.claim_scope.length === 0 || source.claim_scope.some((claim) => !hasMeaningfulText(claim)))) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.claim_scope に根拠として使用できる範囲を記録してください。` });
    }
    if (source.evidence_kind !== undefined && !['official_fact', 'rules_terms', 'safety_guidance', 'survey_result', 'academic_finding', 'public_dataset', 'individual_review_example'].includes(source.evidence_kind)) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.evidence_kind が未定義です。` });
    }
    if (source.evidence_kind === 'survey_result' && !SURVEY_EVIDENCE_TYPES.has(source.type)) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.evidence_kind が survey_result の場合、調査・統計を扱える出典種別にしてください。` });
    }
    if (source.type === 'first_party_research_with_methodology' && source.role === 'citation') {
      const methodology = source.methodology;
      if (
        !methodology
        || !hasMeaningfulText(methodology.researcher)
        || !hasMeaningfulText(methodology.population)
        || !hasMeaningfulText(methodology.method)
        || !hasMeaningfulText(methodology.period)
        || !Number.isSafeInteger(methodology.sample_size)
        || methodology.sample_size <= 0
      ) findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.methodology に調査主体・対象・方法・期間・正の回答数を記録してください。` });
    }
    if (source.role === 'affiliate_cta' && !['official_subject', 'official_terms_help', 'official_app_store'].includes(source.type)) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.role が affiliate_cta の場合、type は公式対象・公式案内・公式アプリストアに限定してください。` });
    }
    if (['official_subject', 'official_terms_help', 'official_app_store'].includes(source.type) && !hasMeaningfulText(source.official_for)) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.official_for に公式対象を記録してください。` });
    }
    let url;
    let parsedUrl;
    try {
      if (typeof source.url !== 'string' || !source.url.trim()) throw new Error('invalid URL type');
      parsedUrl = new URL(source.url.replaceAll('&amp;', '&'));
      url = canonicalUrl(source.url);
    }
    catch {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.url が有効な絶対URLではありません。` });
      continue;
    }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.url はuserinfoを含まないHTTPSの直接URLにしてください。` });
    }
    if (source.type === 'public_authority' && !hostInList(parsedUrl.hostname, policy.public_authority_domain_suffixes)) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.url は許可された公的機関ドメインではありません。` });
    }
    if (source.type === 'official_app_store' && !hostInList(parsedUrl.hostname, policy.official_store_domains)) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.url は公式アプリストアのドメインではありません。` });
    }
    if (
      source.role !== 'research_only'
      && arrayValue(policy?.allowed_source_types).includes(source.type)
      && !['public_authority', 'official_app_store'].includes(source.type)
      && !approvedDomainFor(parsedUrl.hostname, source.type, policy)
    ) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.url のホストとtypeが config/source-policy.json の approved_external_domains で承認されていません。` });
    }
    if (source.role !== 'research_only' && hostInList(parsedUrl.hostname, policy.prohibited_domains)) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.url は公開禁止ドメインです。` });
    }
    if (source.role !== 'research_only' && hostInList(parsedUrl.hostname, policy.redirector_domains)) {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.url は短縮・リダイレクト用ドメインです。` });
    }
    if (researchTypesFor(policy).has(source.type) && source.role !== 'research_only') {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.type は role: research_only でのみ記録できます。` });
    }
    if (arrayValue(policy?.prohibited_source_types).includes(source.type) && source.role !== 'research_only') {
      findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.type は公開用途へ登録できません。` });
    }
    if (urls.has(url)) findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${label}.url が ${urls.get(url)} と重複しています。` });
    else urls.set(url, label);
  }
  return findings;
}

function researchTypesFor(policy) {
  return new Set(arrayValue(policy?.research_only_source_types));
}

function entryForUrl(url, manifest) {
  let canonical;
  try { canonical = canonicalUrl(url); }
  catch { return undefined; }
  const sources = Array.isArray(manifest?.sources) ? manifest.sources : [];
  return sources.find((entry) => {
    try { return canonicalUrl(entry.url) === canonical; }
    catch { return false; }
  });
}

function hostInList(hostname, domains = []) {
  return Array.isArray(domains) && domains.some((domain) => hostnameMatches(hostname, domain));
}

function approvedDomainFor(hostname, type, policy) {
  const entries = Array.isArray(policy?.approved_external_domains) ? policy.approved_external_domains : [];
  return entries.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const hostMatches = cleanHostname(hostname) === cleanHostname(entry.host);
    return hostMatches && Array.isArray(entry.allowed_types) && entry.allowed_types.includes(type);
  });
}

function decodedForAlias(value = '') {
  let decoded = String(value);
  for (let index = 0; index < 2; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  return decoded;
}

function affiliateLooksLikeEvidence(occurrence) {
  if (occurrence.insideCitationElement) return true;
  if (/(?:出典|根拠|引用|参考(?:資料|文献)?|調査(?:結果)?|データ)/u.test(occurrence.anchorText || '')) return true;
  const context = String(occurrence.contextText || '').normalize('NFKC').replace(/\s+/gu, ' ');
  const factTerm = '(?:料金|価格|月額|年額|会員数|利用者数|回答者数|満足度|成功率|割合|調査|アンケート|ランキング|順位|評価)';
  const number = '\\d[\\d,.]*\\s*(?:円|%|％|人|名|件|位)';
  return new RegExp(`(?:${factTerm}[^。！？]{0,60}${number}|${number}[^。！？]{0,60}${factTerm})`, 'u').test(context);
}

export function auditPublishedSources({ artifacts = {}, manifest = { version: 1, sources: [] }, siteUrl, policy = SOURCE_POLICY } = {}) {
  const findings = [];
  const sources = Array.isArray(manifest?.sources) ? manifest.sources.filter((source) => source && typeof source === 'object') : [];
  const allowedTypes = new Set(arrayValue(policy?.allowed_source_types));
  const researchTypes = new Set(arrayValue(policy?.research_only_source_types));
  const prohibitedTypes = new Set(arrayValue(policy?.prohibited_source_types));
  // target_media is user input and must never become an implicit source allowlist.
  const internalHosts = [siteUrl].flatMap((value) => {
    try { return [new URL(value).hostname]; }
    catch { return []; }
  });
  const aliases = [
    ...arrayValue(policy?.prohibited_source_aliases).map((alias) => ({ alias, code: 'PROHIBITED_CITATION_SOURCE' })),
    ...sources
      .filter((source) => source.role === 'research_only' || researchTypes.has(source.type) || prohibitedTypes.has(source.type))
      .flatMap((source) => [source.name, ...(Array.isArray(source.aliases) ? source.aliases : [])].filter((alias) => typeof alias === 'string' && alias).map((alias) => ({ alias, code: 'RESEARCH_SOURCE_LEAK' })))
  ];

  for (const [file, content] of Object.entries(artifacts)) {
    const sourceText = visibleSourceText(content);
    for (const { alias, code } of aliases) {
      if (containsSourceAlias(sourceText, alias)) {
        findings.push({ code, message: `${file} に公開利用できない情報源名「${alias}」があります。` });
      }
    }

    for (const occurrence of extractPublishedUrls(content)) {
      const sourceAlias = aliases.find(({ alias }) => containsSourceAlias(decodedForAlias(occurrence.url), alias));
      if (sourceAlias) findings.push({ code: sourceAlias.code, message: `${file} のURLに公開利用できない情報源名「${sourceAlias.alias}」があります。` });
      if (occurrence.protocolRelative || occurrence.unsafeScheme) {
        findings.push({ code: 'INSECURE_SOURCE_URL', message: `${file} のリンクは明示的なHTTPS URLではありません: ${occurrence.url}` });
        continue;
      }
      let url;
      try { url = new URL(occurrence.url.replaceAll('&amp;', '&')); }
      catch {
        findings.push({ code: 'UNCLASSIFIED_CITATION_SOURCE', message: `${file} に解析できないURLがあります: ${occurrence.url}` });
        continue;
      }
      const hostname = cleanHostname(url.hostname);
      if (url.username || url.password) {
        findings.push({ code: 'UNCLASSIFIED_CITATION_SOURCE', message: `${file} のURLにuserinfoが含まれています: ${occurrence.url}` });
        continue;
      }
      if (url.protocol !== 'https:') {
        findings.push({ code: 'INSECURE_SOURCE_URL', message: `${file} の外部URLはHTTPSではありません: ${occurrence.url}` });
        continue;
      }
      if (hostInList(hostname, policy.prohibited_domains)) {
        findings.push({ code: 'PROHIBITED_CITATION_SOURCE', message: `${file} に禁止ドメイン ${hostname} への公開リンクがあります。` });
        continue;
      }
      if (hostInList(hostname, policy.redirector_domains)) {
        findings.push({ code: 'REDIRECTOR_SOURCE_URL', message: `${file} に短縮・リダイレクト用ドメイン ${hostname} があります。最終到達URLを記録してください。` });
        continue;
      }
      if (internalHosts.some((host) => hostnameMatches(hostname, host))) continue;
      const entry = entryForUrl(url.toString(), { sources });
      if (!entry) {
        findings.push({ code: 'UNCLASSIFIED_CITATION_SOURCE', message: `${file} の外部URLが source-manifest.json で承認されていません: ${occurrence.url}` });
        continue;
      }
      if (entry.type === 'public_authority' && !hostInList(hostname, policy.public_authority_domain_suffixes)) {
        findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${file} の public_authority は許可された公的機関ドメインではありません: ${occurrence.url}` });
        continue;
      }
      if (entry.type === 'official_app_store' && !hostInList(hostname, policy.official_store_domains)) {
        findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${file} の official_app_store は公式ストアドメインではありません: ${occurrence.url}` });
        continue;
      }
      if (allowedTypes.has(entry.type) && !['public_authority', 'official_app_store'].includes(entry.type) && !approvedDomainFor(hostname, entry.type, policy)) {
        findings.push({ code: 'SOURCE_MANIFEST_MISMATCH', message: `${file} のホストと出典種別が共通承認済みドメイン台帳にありません: ${occurrence.url}` });
        continue;
      }
      if (entry.role === 'research_only' || researchTypes.has(entry.type)) {
        findings.push({ code: 'RESEARCH_SOURCE_LEAK', message: `${file} に調査専用ソース ${entry.id || occurrence.url} が流入しています。` });
        continue;
      }
      if (prohibitedTypes.has(entry.type)) {
        findings.push({ code: 'PROHIBITED_CITATION_SOURCE', message: `${file} に禁止種別 ${entry.type} のソースがあります。` });
        continue;
      }
      if (occurrence.role === 'affiliate_cta') {
        const rel = new Set(occurrence.rel);
        if (entry.role !== 'affiliate_cta' || !rel.has('sponsored') || !rel.has('noopener') || !rel.has('noreferrer') || affiliateLooksLikeEvidence(occurrence)) {
          findings.push({ code: 'AFFILIATE_LINK_AS_EVIDENCE', message: `${file} のCTAはmanifest登録と rel="sponsored noopener noreferrer" を満たし、出典・数値根拠とは別の文脈に置いてください: ${occurrence.url}` });
        }
        continue;
      }
      if (entry.role === 'affiliate_cta') {
        findings.push({ code: 'AFFILIATE_LINK_AS_EVIDENCE', message: `${file} でアフィリエイトCTA用URLを根拠・通常リンクとして使用しています: ${occurrence.url}` });
        continue;
      }
      if (entry.role !== 'citation' || !allowedTypes.has(entry.type)) {
        findings.push({ code: 'UNCLASSIFIED_CITATION_SOURCE', message: `${file} のソース種別または用途が引用許可条件を満たしません: ${occurrence.url}` });
      }
    }
    for (const excerpt of findUnlinkedSurveyClaims(content, { manifest: { ...manifest, sources }, policy })) {
      findings.push({ code: 'UNSOURCED_SURVEY_CLAIM', message: `${file} に同じ段落・項目から承認済み出典を追跡できない調査数値があります: ${excerpt}` });
    }
  }

  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.code}\u0000${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
