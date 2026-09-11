import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPublishedSources,
  extractPublishedUrls,
  findUnlinkedSurveyClaims,
  hostnameMatches,
  SOURCE_POLICY,
  validateSourceManifest,
  validateSourcePolicyConfiguration
} from '../scripts/source-policy.mjs';

const policy = {
  ...structuredClone(SOURCE_POLICY),
  approved_external_domains: [
    { host: 'service-official.example', include_subdomains: false, owner: 'テスト対象サービス', allowed_types: ['official_terms_help'], verified_at: '2026-09-11', verification_basis: 'テスト用の所有関係確認' },
    { host: 'partner.example', include_subdomains: false, owner: 'テスト対象サービス', allowed_types: ['official_subject'], verified_at: '2026-09-11', verification_basis: 'テスト用の遷移先確認' }
  ]
};

const emptyManifest = { version: 1, sources: [] };
const audit = (content, manifest = emptyManifest) => auditPublishedSources({
  artifacts: { 'article-decorated.html': content },
  manifest,
  targetMedia: 'https://matching.writing-corp.co.jp/',
  siteUrl: 'https://matching.writing-corp.co.jp/',
  policy
});

test('hostname matching respects label boundaries', () => {
  assert.equal(hostnameMatches('www.caa.go.jp', 'go.jp'), true);
  assert.equal(hostnameMatches('deai.app-liv.jp', 'app-liv.jp'), true);
  assert.equal(hostnameMatches('caa.go.jp.evil.example', 'go.jp'), false);
  assert.equal(hostnameMatches('notapp-liv.jp', 'app-liv.jp'), false);
});

test('source policy configuration keeps all public artifacts and the explicit competitor block', () => {
  assert.deepEqual(validateSourcePolicyConfiguration(SOURCE_POLICY), []);
  assert.deepEqual(validateSourcePolicyConfiguration({ ...policy, published_artifacts: ['draft.md', 'article.html', 'article-linked.html', 'article-decorated.html', 'external-links.md'], manifest_version: 1, mode: 'allowlist' }), []);
  const weakened = { ...policy, published_artifacts: ['article-decorated.html'], prohibited_domains: [], prohibited_source_aliases: [], manifest_version: 1, mode: 'allowlist' };
  const findings = validateSourcePolicyConfiguration(weakened);
  assert.ok(findings.some(({ message }) => message.includes('draft.md')));
  assert.ok(findings.some(({ message }) => message.includes('app-liv.jp')));
  assert.ok(findings.some(({ message }) => message.includes('出会いコンパス')));

  for (const altered of [
    { ...policy, require_https: false },
    { ...policy, unclassified_action: 'warning' },
    { ...policy, redirector_domains: [] },
    { ...policy, affiliate_link_policy: {} },
    { ...policy, error_codes: [] }
  ]) assert.ok(validateSourcePolicyConfiguration(altered).some(({ code }) => code === 'SOURCE_POLICY_INVALID'));
});

test('published URL extraction distinguishes a declared affiliate CTA', () => {
  const urls = extractPublishedUrls([
    '<a href="https://partner.example/join" data-link-purpose="affiliate-cta" rel="sponsored noopener noreferrer">申込</a>',
    '[資料](https://www.caa.go.jp/policies/)',
    'https://service.example/help'
  ].join('\n'));
  assert.deepEqual(urls.map(({ url, role }) => ({ url, role })), [
    { url: 'https://partner.example/join', role: 'affiliate_cta' },
    { url: 'https://www.caa.go.jp/policies/', role: 'citation' },
    { url: 'https://service.example/help', role: 'citation' }
  ]);
});

test('survey numbers require a traceable citation in the same paragraph or item', () => {
  assert.deepEqual(findUnlinkedSurveyClaims('<p>200人を対象にした調査では52%でした。</p>'), ['200人を対象にした調査では52%でした。']);
  assert.deepEqual(findUnlinkedSurveyClaims('<p>利用者200人中52%が満足と回答しました。</p>'), ['利用者200人中52%が満足と回答しました。']);
  for (const claim of ['利用者200人のうち52%が満足しました。', '回答者は200人で、52%が選びました。', '200名のうち104名が回答しました。', '利用者の52%が満足しました。']) {
    assert.deepEqual(findUnlinkedSurveyClaims(`<p>${claim}</p>`), [claim]);
  }
  const manifest = {
    version: 1,
    sources: [{ id: 'survey', url: 'https://www.caa.go.jp/data', type: 'public_authority', role: 'citation', evidence_kind: 'survey_result', name: '公的調査', claim_scope: ['調査結果と回答割合'], verified_at: '2026-09-11' }]
  };
  assert.deepEqual(findUnlinkedSurveyClaims('<p>200人を対象にした調査です。<a href="https://www.caa.go.jp/data">出典</a></p>', { manifest, policy }), []);
  assert.deepEqual(findUnlinkedSurveyClaims('<p>200人を対象にした調査です。<a href="https://matching.writing-corp.co.jp/about/">内部リンク</a></p>', { manifest, policy }), ['200人を対象にした調査です。内部リンク']);
  const unrelatedManifest = {
    version: 1,
    sources: [{ id: 'hotline', url: 'https://www.caa.go.jp/hotline', type: 'public_authority', role: 'citation', evidence_kind: 'safety_guidance', name: '相談窓口', claim_scope: ['相談先'], verified_at: '2026-09-11' }]
  };
  assert.deepEqual(findUnlinkedSurveyClaims('<p>利用者200人中52%が満足しました。<a href="https://www.caa.go.jp/hotline">相談窓口</a></p>', { manifest: unrelatedManifest, policy }), ['利用者200人中52%が満足しました。相談窓口']);
  assert.deepEqual(findUnlinkedSurveyClaims('- 200人を対象にした調査では52%でした。\n- [無関係な出典](https://www.caa.go.jp/data)', { manifest, policy }), ['- 200人を対象にした調査では52%でした。']);
  assert.deepEqual(findUnlinkedSurveyClaims('<p>調査方法を説明します。</p>'), []);
  assert.deepEqual(findUnlinkedSurveyClaims('<p>会場には200人が参加しました。</p>'), []);
  assert.deepEqual(findUnlinkedSurveyClaims('<p>今回の確認ではVERIFIEDは0件、PARTIALは13件、UNVERIFIEDは20件です。これはサービスの優劣ではなく、調査日に取得できた情報の状態です。</p>'), []);
});

test('HTML parsing catches unquoted, padded, encoded, protocol-relative, and unsafe href values', () => {
  const cases = [
    '<a href=https://deai.app-liv.jp/a>競合</a>',
    '<a href=" https://deai.app-liv.jp/b ">競合</a>',
    '<a href="https&#58;//deai.app-liv.jp/c">競合</a>',
    '<a href="//deai.app-liv.jp/d">競合</a>'
  ];
  for (const html of cases) {
    const findings = audit(html);
    assert.ok(findings.some(({ code }) => ['PROHIBITED_CITATION_SOURCE', 'INSECURE_SOURCE_URL'].includes(code)), html);
  }
  for (const html of ['<a href="javascript:alert(1)">危険</a>', '<a href="data:text/html,unsafe">危険</a>']) {
    assert.ok(audit(html).some(({ code }) => code === 'INSECURE_SOURCE_URL'), html);
  }
  assert.ok(audit('[競合](//deai.app-liv.jp/relative)').some(({ code }) => code === 'INSECURE_SOURCE_URL'));
  assert.ok(audit('<https://deai.app-liv.jp/autolink>').some(({ code }) => code === 'PROHIBITED_CITATION_SOURCE'));
  for (const html of ['<a href="java&#x09;script:alert(1)">危険</a>', '<a href="ht\ntps://deai.app-liv.jp/x">危険</a>', '<a href="\\\\app-liv.jp\\x">危険</a>']) {
    assert.ok(audit(html).some(({ code }) => code === 'INSECURE_SOURCE_URL'), html);
  }
  for (const html of ['<a href="/safe" ping="https://deai.app-liv.jp/log">危険</a>', '<a href="/safe" onclick="location.href=\'https://deai.app-liv.jp\'">危険</a>', '<button onclick="location.href=\'https://deai.app-liv.jp\'">危険</button>']) {
    assert.ok(audit(html).some(({ code }) => code === 'INSECURE_SOURCE_URL'), html);
  }
  assert.ok(audit('<map><area href="https://deai.app-liv.jp/map" alt="競合"></map>').some(({ code }) => code === 'PROHIBITED_CITATION_SOURCE'));
  for (const html of ['<form action="https://deai.app-liv.jp/post"></form>', '<button formaction="https://deai.app-liv.jp/post">送信</button>', '<iframe src="https://deai.app-liv.jp/embed"></iframe>']) {
    assert.ok(audit(html).some(({ code }) => code === 'INSECURE_SOURCE_URL'), html);
  }
});

test('HTML comments and non-link attributes are not treated as published citations', () => {
  assert.deepEqual(extractPublishedUrls('<!-- {"url":"https://deai.app-liv.jp/hidden"} --><img src="https://deai.app-liv.jp/image.jpg" alt="画像">'), []);
  assert.ok(audit('<!-- {"url":"https://partner.example/join"} --><a href="https://partner.example/join" data-link-purpose="affiliate-cta" rel="sponsored noopener noreferrer">申込</a>', {
    version: 1,
    sources: [{ id: 'partner-cta', url: 'https://partner.example/join', type: 'official_subject', role: 'affiliate_cta', official_for: '対象サービス', name: '公式申込先', verified_at: '2026-09-11' }]
  }).every(({ code }) => code !== 'AFFILIATE_LINK_AS_EVIDENCE'));
});

test('public agencies and official stores pass while hostname disguises and HTTP fail', () => {
  const publicUrl = 'https://www.caa.go.jp/policies/';
  const storeUrl = 'https://apps.apple.com/jp/app/example/id1';
  const manifest = {
    version: 1,
    sources: [
      { id: 'caa', url: publicUrl, type: 'public_authority', role: 'citation', name: '消費者庁', claim_scope: ['消費者政策'], verified_at: '2026-09-11' },
      { id: 'app-store', url: storeUrl, type: 'official_app_store', role: 'citation', name: 'App Store掲載ページ', claim_scope: ['公式掲載情報'], verified_at: '2026-09-11' }
    ]
  };
  assert.deepEqual(audit(`<a href="${publicUrl}">消費者庁</a>`, manifest), []);
  assert.deepEqual(audit(`<a href="${storeUrl}">App Store</a>`, manifest), []);
  assert.equal(audit(`<a href="${publicUrl}">未登録の消費者庁リンク</a>`)[0].code, 'UNCLASSIFIED_CITATION_SOURCE');
  assert.match(audit('<a href="https://caa.go.jp.evil.example/data">偽装</a>')[0].code, /UNCLASSIFIED_CITATION_SOURCE/);
  assert.match(audit('<a href="http://www.caa.go.jp/data">非HTTPS</a>')[0].code, /INSECURE_SOURCE_URL/);
  assert.match(audit('<a href="https://www.caa.go.jp@evil.example/data">userinfo</a>')[0].code, /UNCLASSIFIED_CITATION_SOURCE/);
});

test('verified official and primary sources can be registered by exact URL', () => {
  const url = 'https://service-official.example/terms';
  const manifest = {
    version: 1,
    sources: [{ id: 'service-terms', url, type: 'official_terms_help', role: 'citation', official_for: '対象サービス', name: '利用規約', claim_scope: ['利用条件'], verified_at: '2026-09-11' }]
  };
  assert.deepEqual(validateSourceManifest(manifest, policy), []);
  assert.deepEqual(audit(`<a href="${url}">公式規約</a>`, manifest), []);
  assert.equal(audit('<a href="https://service-official.example/other">別ページ</a>', manifest)[0].code, 'UNCLASSIFIED_CITATION_SOURCE');
  assert.equal(audit('<a href="https://service-official.example/terms.">末尾が異なるページ</a>', manifest)[0].code, 'UNCLASSIFIED_CITATION_SOURCE');
});

test('an arbitrary target_media never becomes a citation allowlist', () => {
  const findings = auditPublishedSources({
    artifacts: { 'draft.md': '[記事](https://different-media.example/report)' },
    manifest: emptyManifest,
    targetMedia: 'https://different-media.example/',
    siteUrl: 'https://matching.writing-corp.co.jp/',
    policy
  });
  assert.ok(findings.some(({ code }) => code === 'UNCLASSIFIED_CITATION_SOURCE'));
});

test('a per-article manifest cannot self-approve an arbitrary official domain', () => {
  const url = 'https://competitor.example/report';
  const manifest = {
    version: 1,
    sources: [{ id: 'fake-official', url, type: 'official_subject', role: 'citation', official_for: '自己申告', name: '自己申告資料', claim_scope: ['評判'], verified_at: '2026-09-11' }]
  };
  const lockedPolicy = { ...policy, approved_external_domains: [] };
  assert.ok(validateSourceManifest(manifest, lockedPolicy).some(({ code }) => code === 'SOURCE_MANIFEST_MISMATCH'));
  assert.ok(auditPublishedSources({ artifacts: { 'draft.md': url }, manifest, siteUrl: 'https://matching.writing-corp.co.jp/', policy: lockedPolicy }).some(({ code }) => code === 'SOURCE_MANIFEST_MISMATCH'));
});

test('competitor domains, aliases, and research-only sources cannot leak into public artifacts', () => {
  const direct = audit('<a href="https://deai.app-liv.jp/archive/144119/">200人調査</a>');
  assert.ok(direct.some(({ code }) => code === 'PROHIBITED_CITATION_SOURCE'));
  assert.ok(audit('出会いコンパスの200人調査では52％でした。').some(({ code }) => code === 'PROHIBITED_CITATION_SOURCE'));
  assert.ok(audit('出会い<span>コンパス</span>の調査です。').some(({ code }) => code === 'PROHIBITED_CITATION_SOURCE'));
  assert.ok(audit('出会い<span hidden>非表示文字</span>コンパスの調査です。').some(({ code }) => code === 'PROHIBITED_CITATION_SOURCE'));
  assert.ok(audit('出会いコン\u200bパスの調査です。').some(({ code }) => code === 'PROHIBITED_CITATION_SOURCE'));
  assert.ok(audit('<img alt="出会いコンパスの調査図">').some(({ code }) => code === 'PROHIBITED_CITATION_SOURCE'));
  assert.ok(!audit('App Live配信サービスの比較です。').some(({ code }) => code === 'PROHIBITED_CITATION_SOURCE'));
  const disguisedUrl = 'https://partner.example/join?ref=App-Liv';
  const disguisedManifest = { version: 1, sources: [{ id: 'disguised', url: disguisedUrl, type: 'official_subject', role: 'citation', official_for: '対象サービス', name: '公式資料', claim_scope: ['案内'], verified_at: '2026-09-11' }] };
  assert.ok(audit(`<a href="${disguisedUrl}">公式資料</a>`, disguisedManifest).some(({ code }) => code === 'PROHIBITED_CITATION_SOURCE'));

  const manifest = {
    version: 1,
    sources: [{ id: 'competitor', name: '比較メディア調査', aliases: ['比較メディア'], url: 'https://competitor.example/survey', type: 'competitor_editorial', role: 'research_only', verified_at: '2026-09-11' }]
  };
  assert.ok(audit('比較メディア調査では多数派でした。', manifest).some(({ code }) => code === 'RESEARCH_SOURCE_LEAK'));
  assert.ok(audit('<a href="https://competitor.example/survey">調査</a>', manifest).some(({ code }) => code === 'RESEARCH_SOURCE_LEAK'));
});

test('affiliate URLs pass only as declared, sponsored CTA links and never as evidence', () => {
  const url = 'https://partner.example/join?campaign=test';
  const manifest = {
    version: 1,
    sources: [{ id: 'partner-cta', url, type: 'official_subject', role: 'affiliate_cta', official_for: '対象サービス', name: '公式申込先', verified_at: '2026-09-11' }]
  };
  assert.deepEqual(audit(`<a href="${url}" data-link-purpose="affiliate-cta" rel="sponsored noopener noreferrer">公式サイトへ</a>`, manifest), []);
  assert.ok(audit(`<a href="${url}">調査根拠</a>`, manifest).some(({ code }) => code === 'AFFILIATE_LINK_AS_EVIDENCE'));
  assert.ok(audit(`<a href="${url}" data-link-purpose="affiliate-cta" rel="noopener noreferrer">公式サイトへ</a>`, manifest).some(({ code }) => code === 'AFFILIATE_LINK_AS_EVIDENCE'));
  assert.ok(audit(`<a href="${url}" data-link-purpose="affiliate-cta" rel="sponsored\u00a0noopener\u00a0noreferrer">公式サイトへ</a>`, manifest).some(({ code }) => code === 'AFFILIATE_LINK_AS_EVIDENCE'));
  assert.ok(audit(`<a href="${url}" data-link-purpose="affiliate-cta" rel="sponsored noopener noreferrer">正しいCTA</a><a href="${url}" data-link-purpose="affiliate-cta" rel="noopener noreferrer">不正なCTA</a>`, manifest).some(({ code }) => code === 'AFFILIATE_LINK_AS_EVIDENCE'));
  assert.ok(audit(`<p>料金は月額5,000円です。<a href="${url}" data-link-purpose="affiliate-cta" rel="sponsored noopener noreferrer">根拠</a></p>`, manifest).some(({ code }) => code === 'AFFILIATE_LINK_AS_EVIDENCE'));
});

test('policy configuration rejects wildcard approval and every required competitor alias remains pinned', () => {
  assert.ok(validateSourcePolicyConfiguration({
    ...policy,
    mode: 'allowlist',
    manifest_version: 1,
    published_artifacts: ['draft.md', 'article.html', 'article-linked.html', 'article-decorated.html', 'external-links.md'],
    approved_external_domains: [{ ...policy.approved_external_domains[0], host: 'github.io', include_subdomains: true }]
  }).some(({ message }) => message.includes('include_subdomains')));
  for (const alias of ['出会いコンパス', 'App-Liv', 'Appliv']) {
    const altered = { ...policy, mode: 'allowlist', manifest_version: 1, published_artifacts: ['draft.md', 'article.html', 'article-linked.html', 'article-decorated.html', 'external-links.md'], prohibited_source_aliases: policy.prohibited_source_aliases.filter((item) => item !== alias) };
    assert.ok(validateSourcePolicyConfiguration(altered).some(({ message }) => message.includes(alias)));
  }
});

test('source manifest rejects incomplete source records', () => {
  const findings = validateSourceManifest({ version: 1, sources: [{ id: 'bad', url: 'not-a-url', type: 'unknown', role: 'citation' }] }, policy);
  assert.ok(findings.some(({ message }) => message.includes('.type')));
  assert.ok(findings.some(({ message }) => message.includes('.verified_at')));
  assert.ok(findings.some(({ message }) => message.includes('.url')));

  const malformedFields = validateSourceManifest({
    version: 1,
    sources: [{ id: { value: 'bad' }, url: 'https://www.caa.go.jp/data', type: 'public_authority', role: 'citation', name: { value: 'name' }, claim_scope: [null], verified_at: '9999-99-99' }]
  }, policy);
  for (const field of ['.id', '.name', '.claim_scope', '.verified_at']) assert.ok(malformedFields.some(({ message }) => message.includes(field)), field);
  assert.ok(validateSourceManifest({ version: 1, sources: [{ id: 'future', url: 'https://www.caa.go.jp/data', type: 'public_authority', role: 'citation', name: '公的資料', claim_scope: ['統計'], verified_at: '2999-01-01' }] }, policy).some(({ message }) => message.includes('.verified_at')));
  const firstPartyUrl = 'https://service-official.example/survey';
  const firstPartyPolicy = { ...policy, approved_external_domains: [{ ...policy.approved_external_domains[0], allowed_types: ['first_party_research_with_methodology'] }] };
  assert.ok(validateSourceManifest({ version: 1, sources: [{ id: 'survey', url: firstPartyUrl, type: 'first_party_research_with_methodology', role: 'citation', evidence_kind: 'survey_result', name: '一次調査', claim_scope: ['調査割合'], verified_at: '2026-09-11' }] }, firstPartyPolicy).some(({ message }) => message.includes('.methodology')));
});

test('malformed manifests produce findings without crashing the audit', () => {
  for (const manifest of [null, { sources: {} }, { version: 1, sources: [{ id: 'bad', aliases: 123 }] }]) {
    assert.doesNotThrow(() => auditPublishedSources({ artifacts: { 'draft.md': '本文' }, manifest, siteUrl: 'https://matching.writing-corp.co.jp/', policy }));
    assert.ok(validateSourceManifest(manifest, policy).length > 0);
  }
});
