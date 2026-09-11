import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditReviewEvidence, classifyReviewHeadings, requiredReviewHeadings } from '../scripts/review-evidence.mjs';

const TODAY = '2026-09-10';

function buildEvidenceFixture(approvedOutline, { slug = 'pcmax-reputation', subject = 'PCMAX', articleType = '口コミ・評判' } = {}) {
  const classified = classifyReviewHeadings({ articleType, approvedOutline }).headings;
  const sources = [];
  const evidenceItems = [];
  const sections = classified.map((heading) => {
    const base = {
      heading_id: heading.id,
      heading_text: heading.text,
      classification: heading.classification,
      derived_from_section_ids: [],
      evidence_item_ids: []
    };
    if (heading.classification === 'review_group') {
      base.derived_from_section_ids = heading.child_ids.filter((id) => classified.some((item) => item.id === id));
    } else if (heading.classification === 'review_summary') {
      base.derived_from_section_ids = classified.filter((item) => item.classification === 'review_group').map((item) => item.id);
    } else if (heading.classification === 'review_example') {
      const itemId = `item-${heading.id}`;
      const sourceId = `source-${heading.id}`;
      base.evidence_item_ids = [itemId];
      sources.push({
        id: sourceId,
        url: 'https://apps.apple.com/jp/app/pcmax/id123456',
        type: 'official_app_store',
        role: 'citation',
        evidence_kind: 'individual_review_example',
        official_for: subject,
        name: 'PCMAX App Store掲載ページ',
        claim_scope: [heading.id],
        verified_at: TODAY
      });
      evidenceItems.push({
        id: itemId,
        kind: 'individual_review_example',
        source_id: sourceId,
        subject,
        supported_claim: `${heading.text}を裏付ける個別体験`,
        review: {
          platform: 'apple_app_store',
          review_id: `review-${heading.id}`,
          author_label: `投稿者-${heading.id}`,
          published_at: '2026-08-20',
          rating: 4,
          excerpt: `${heading.text}に関する具体的なレビュー本文です。`,
          retrieved_at: TODAY
        }
      });
    } else if (heading.classification === 'review_aggregate') {
      const itemId = `item-${heading.id}`;
      const sourceId = `source-${heading.id}`;
      base.evidence_item_ids = [itemId];
      sources.push({
        id: sourceId,
        url: `https://www.caa.go.jp/survey/${heading.id}`,
        type: 'public_authority',
        role: 'citation',
        evidence_kind: 'survey_result',
        name: '方法を確認できる一次調査',
        claim_scope: [heading.id],
        verified_at: TODAY
      });
      evidenceItems.push({
        id: itemId,
        kind: 'survey_result',
        source_id: sourceId,
        subject,
        supported_claim: `${heading.text}の集計結果`,
        survey: { locator: `設問-${heading.id}`, result_summary: '調査対象と回答割合を確認しました。', retrieved_at: TODAY }
      });
    }
    return base;
  });
  return {
    articleType,
    approvedOutline,
    sourceManifest: { version: 1, sources },
    sectionEvidence: { version: 1, article_slug: slug, sections, evidence_items: evidenceItems },
    slug
  };
}

test('PCMAX outline has nine direct evidence claims and four aggregate claims', async () => {
  const approvedOutline = JSON.parse(await readFile('prompts/approved-outlines/pcmax-reputation.json', 'utf8'));
  const requirement = requiredReviewHeadings({ articleType: '口コミ・評判・サービス解説', approvedOutline });
  assert.equal(requirement.headings.length, 9);
  assert.deepEqual(requirement.headings.filter(({ classification }) => classification === 'review_aggregate').map(({ id }) => id), [
    'pcmax-good-review-many-users',
    'pcmax-bad-review-vendors',
    'pcmax-bad-review-free-points',
    'pcmax-bad-review-casual-users'
  ]);
  assert.equal(auditReviewEvidence(buildEvidenceFixture(approvedOutline, { articleType: '口コミ・評判・サービス解説' })).length, 0);
});

test('one missing PCMAX claim reports its exact heading ID', async () => {
  const approvedOutline = JSON.parse(await readFile('prompts/approved-outlines/pcmax-reputation.json', 'utf8'));
  const fixture = buildEvidenceFixture(approvedOutline, { articleType: '口コミ・評判・サービス解説' });
  fixture.sectionEvidence.sections.find(({ heading_id: id }) => id === 'pcmax-bad-review-cost').evidence_item_ids = [];
  const findings = auditReviewEvidence(fixture);
  assert.ok(findings.some(({ code, heading_id: id }) => code === 'REVIEW_EVIDENCE_MISSING' && id === 'pcmax-bad-review-cost'));
});

test('official facts, affiliate CTAs and research-only sources cannot satisfy review claims', () => {
  const outline = { headings: [{ level: 2, text: '車の口コミ・評判', id: 'reviews', children: [{ level: 3, text: '良い評判は運転しやすいこと', id: 'easy' }] }] };
  for (const sourcePatch of [
    { type: 'official_subject', role: 'citation', evidence_kind: 'official_fact' },
    { type: 'official_app_store', role: 'affiliate_cta', evidence_kind: 'individual_review_example' },
    { type: 'secondary_review', role: 'research_only', evidence_kind: 'individual_review_example' }
  ]) {
    const fixture = buildEvidenceFixture(outline, { slug: 'car-reviews', subject: '対象車' });
    Object.assign(fixture.sourceManifest.sources[0], sourcePatch);
    fixture.sectionEvidence.evidence_items[0].kind = sourcePatch.evidence_kind;
    const findings = auditReviewEvidence(fixture);
    assert.ok(findings.some(({ code }) => code === 'REVIEW_EVIDENCE_INVALID'), JSON.stringify(sourcePatch));
    assert.ok(findings.some(({ code }) => code === 'REVIEW_EVIDENCE_MISSING'), JSON.stringify(sourcePatch));
  }
});

test('individual reviews require the matching service, complete locator fields and unique use', () => {
  const outline = { headings: [{ level: 2, text: 'アプリの口コミ・評判', id: 'reviews', children: [
    { level: 3, text: '良い評判は操作しやすいこと', id: 'easy' },
    { level: 3, text: '悪い評判は通知が遅いこと', id: 'slow' }
  ] }] };
  const wrongSubject = buildEvidenceFixture(outline, { slug: 'app-reviews', subject: '対象アプリ' });
  wrongSubject.sourceManifest.sources[0].official_for = '別サービス';
  assert.ok(auditReviewEvidence(wrongSubject).some(({ message }) => message.includes('official_for')));

  const incomplete = buildEvidenceFixture(outline, { slug: 'app-reviews', subject: '対象アプリ' });
  delete incomplete.sectionEvidence.evidence_items[0].review.author_label;
  delete incomplete.sectionEvidence.evidence_items[0].review.excerpt;
  assert.ok(auditReviewEvidence(incomplete).some(({ code }) => code === 'REVIEW_EVIDENCE_INVALID'));

  const reused = buildEvidenceFixture(outline, { slug: 'app-reviews', subject: '対象アプリ' });
  const first = reused.sectionEvidence.sections.find(({ heading_id: id }) => id === 'easy').evidence_item_ids[0];
  reused.sectionEvidence.sections.find(({ heading_id: id }) => id === 'slow').evidence_item_ids = [first];
  assert.ok(auditReviewEvidence(reused).some(({ message }) => /複数見出し|流用/u.test(message)));

  const distinct = buildEvidenceFixture(outline, { slug: 'app-reviews', subject: '対象アプリ' });
  assert.deepEqual(auditReviewEvidence(distinct), []);
});

test('aggregate claims reject individual reviews and require a qualifying primary survey', () => {
  const outline = { headings: [{ level: 2, text: 'アプリの評判', id: 'reviews', children: [{ level: 3, text: '料金が高いという声が多い', id: 'cost-majority' }] }] };
  const valid = buildEvidenceFixture(outline, { slug: 'aggregate-reviews', subject: '対象アプリ' });
  assert.deepEqual(auditReviewEvidence(valid), []);

  const individual = structuredClone(valid);
  const source = individual.sourceManifest.sources[0];
  Object.assign(source, { url: 'https://apps.apple.com/jp/app/example/id123', type: 'official_app_store', evidence_kind: 'individual_review_example', official_for: '対象アプリ' });
  individual.sectionEvidence.evidence_items[0] = {
    id: individual.sectionEvidence.evidence_items[0].id,
    kind: 'individual_review_example', source_id: source.id, subject: '対象アプリ', supported_claim: '料金が高いという個別体験',
    review: { platform: 'apple_app_store', review_id: 'aggregate-1', author_label: '投稿者', published_at: '2026-08-20', rating: 2, excerpt: '料金が高いと感じました。', retrieved_at: TODAY }
  };
  assert.ok(auditReviewEvidence(individual).some(({ message }) => message.includes('集計見出し')));

  const incompleteMethod = structuredClone(valid);
  Object.assign(incompleteMethod.sourceManifest.sources[0], { type: 'first_party_research_with_methodology', methodology: { researcher: '調査主体' } });
  assert.ok(auditReviewEvidence(incompleteMethod).some(({ message }) => message.includes('調査主体・対象・方法・期間')));
});

test('groups and summaries derive from valid children while guidance and official context need no review evidence', () => {
  const outline = { headings: [
    { level: 2, text: 'サービスの口コミ・評判', id: 'reviews', children: [
      { level: 3, text: '良い評判は使いやすいこと', id: 'easy' },
      { level: 3, text: '口コミの見方', id: 'how-to-read' },
      { level: 3, text: '料金の仕組み', id: 'price-system' }
    ] },
    { level: 2, text: 'サービスの評判まとめ', id: 'summary' }
  ] };
  const classified = classifyReviewHeadings({ articleType: '解説', approvedOutline: outline });
  assert.deepEqual(classified.headings.map(({ id, classification }) => [id, classification]), [
    ['reviews', 'review_group'], ['easy', 'review_example'], ['how-to-read', 'review_guidance'], ['price-system', 'official_context'], ['summary', 'review_summary']
  ]);
  const fixture = buildEvidenceFixture(outline, { slug: 'review-guide', articleType: '解説', subject: '対象サービス' });
  assert.deepEqual(auditReviewEvidence(fixture), []);
});

test('generic review-related terminology and obfuscated review terms are classified safely', () => {
  const marketing = { headings: [{ level: 2, text: '口コミマーケティングとは', id: 'marketing' }] };
  assert.equal(requiredReviewHeadings({ articleType: '用語解説', approvedOutline: marketing }).headings.length, 0);
  assert.equal(classifyReviewHeadings({ articleType: '用語解説', approvedOutline: marketing }).reviewArticle, false);

  const obfuscated = { headings: [{ level: 2, text: '商品の口 コミ・評\u200b判', id: 'reviews', children: [{ level: 3, text: '使いやすい', id: 'easy' }] }] };
  const classified = classifyReviewHeadings({ articleType: '解説', approvedOutline: obfuscated });
  assert.deepEqual(classified.headings.map(({ id, classification }) => [id, classification]), [['reviews', 'review_group'], ['easy', 'review_example']]);
});

test('unknown, duplicate, cyclic and unused evidence references are rejected', () => {
  const outline = { headings: [
    { level: 2, text: '商品の口コミ・評判', id: 'reviews', children: [{ level: 3, text: '良い評判は使いやすいこと', id: 'easy' }] },
    { level: 2, text: '商品の評判まとめ', id: 'summary' }
  ] };
  const fixture = buildEvidenceFixture(outline, { slug: 'invalid-graph', subject: '対象商品' });
  fixture.sectionEvidence.sections.push(structuredClone(fixture.sectionEvidence.sections[0]));
  fixture.sectionEvidence.sections.push({ heading_id: 'unknown', heading_text: '未知', classification: 'review_example', evidence_item_ids: ['unknown-item'], derived_from_section_ids: [] });
  fixture.sectionEvidence.sections.find(({ heading_id: id }) => id === 'summary').derived_from_section_ids = ['summary'];
  fixture.sectionEvidence.evidence_items.push({ id: 'unused', kind: 'survey_result', source_id: 'none', subject: '対象商品', supported_claim: '未使用', survey: { locator: 'Q1', result_summary: '結果', retrieved_at: TODAY } });
  const messages = auditReviewEvidence(fixture).map(({ message }) => message).join('\n');
  assert.match(messages, /重複/);
  assert.match(messages, /未知の見出しID/);
  assert.match(messages, /循環/);
  assert.match(messages, /未使用の証拠項目/);
});
