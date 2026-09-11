import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const checker = path.resolve('scripts/check-review-evidence.mjs');

function validReviewFixture(slug = 'review-sample') {
  const outline = { headings: [
    { level: 2, text: 'サービスの口コミ・評判', id: 'reviews', children: [
      { level: 3, text: '良い評判は操作しやすいこと', id: 'review-easy' }
    ] },
    { level: 2, text: 'サービスの評判まとめ', id: 'review-summary', children: [] }
  ] };
  const manifest = { version: 1, sources: [{
    id: 'official-store',
    url: 'https://apps.apple.com/jp/app/example/id123',
    type: 'official_app_store',
    role: 'citation',
    evidence_kind: 'individual_review_example',
    official_for: 'Example App',
    name: 'Example App App Store掲載ページ',
    claim_scope: ['review-easy'],
    verified_at: '2026-09-10'
  }] };
  const evidence = {
    version: 1,
    article_slug: slug,
    sections: [
      { heading_id: 'reviews', heading_text: 'サービスの口コミ・評判', classification: 'review_group', derived_from_section_ids: ['review-easy'], evidence_item_ids: [] },
      { heading_id: 'review-easy', heading_text: '良い評判は操作しやすいこと', classification: 'review_example', derived_from_section_ids: [], evidence_item_ids: ['review-1'] },
      { heading_id: 'review-summary', heading_text: 'サービスの評判まとめ', classification: 'review_summary', derived_from_section_ids: ['reviews'], evidence_item_ids: [] }
    ],
    evidence_items: [{
      id: 'review-1',
      kind: 'individual_review_example',
      source_id: 'official-store',
      subject: 'Example App',
      supported_claim: '操作しやすかったという個別体験',
      review: { platform: 'apple_app_store', review_id: 'review-1', author_label: '利用者A', published_at: '2026-08-20', rating: 5, excerpt: '画面が分かりやすく操作しやすかったです。', retrieved_at: '2026-09-10' }
    }]
  };
  return { outline, manifest, evidence };
}

async function createReviewArticle(cwd, slug = 'review-sample') {
  const dir = path.join(cwd, 'articles', slug);
  await mkdir(dir, { recursive: true });
  const { outline, manifest, evidence } = validReviewFixture(slug);
  await writeFile(path.join(dir, 'input.yml'), 'article_type: "口コミ・評判"\n');
  await writeFile(path.join(dir, 'metadata.json'), JSON.stringify({ slug, article_type: '口コミ・評判', review_evidence_status: 'PENDING' }, null, 2) + '\n');
  await writeFile(path.join(dir, 'approved_outline.json'), JSON.stringify(outline, null, 2) + '\n');
  await writeFile(path.join(dir, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(dir, 'section-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  return dir;
}

test('pre-draft writes PASS and hashes only after current evidence succeeds', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'review-evidence-cli-'));
  try {
    const dir = await createReviewArticle(cwd);
    const { stdout } = await execFileAsync('node', [checker, '--slug', 'review-sample', '--stage', 'pre-draft'], { cwd });
    assert.match(stdout, /passed.*1 required headings/i);
    const metadata = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8'));
    assert.equal(metadata.review_evidence_status, 'PASS');
    assert.match(metadata.review_evidence_hashes.approved_outline_sha256, /^[a-f0-9]{64}$/u);
    assert.match(metadata.review_evidence_hashes.source_manifest_sha256, /^[a-f0-9]{64}$/u);
    assert.match(metadata.review_evidence_hashes.section_evidence_sha256, /^[a-f0-9]{64}$/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('verify recomputes evidence read-only instead of trusting a stored PASS', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'review-evidence-cli-'));
  try {
    const dir = await createReviewArticle(cwd);
    await execFileAsync('node', [checker, '--slug', 'review-sample', '--stage', 'pre-draft'], { cwd });
    const before = await readFile(path.join(dir, 'metadata.json'), 'utf8');
    const evidence = JSON.parse(await readFile(path.join(dir, 'section-evidence.json'), 'utf8'));
    evidence.sections.find(({ heading_id: id }) => id === 'review-easy').evidence_item_ids = [];
    await writeFile(path.join(dir, 'section-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    await assert.rejects(
      execFileAsync('node', [checker, '--slug', 'review-sample', '--stage', 'verify'], { cwd }),
      (error) => /REVIEW_EVIDENCE_MISSING.*review-easy/s.test(`${error.stdout || ''}${error.stderr || ''}`)
    );
    assert.equal(await readFile(path.join(dir, 'metadata.json'), 'utf8'), before);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('--all verify accepts non-review articles without review-evidence artifacts', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'review-evidence-cli-'));
  try {
    await createReviewArticle(cwd);
    const generic = path.join(cwd, 'articles', 'generic-guide');
    await mkdir(generic, { recursive: true });
    await writeFile(path.join(generic, 'input.yml'), 'article_type: "ハウツー"\n');
    await writeFile(path.join(generic, 'metadata.json'), JSON.stringify({ slug: 'generic-guide', article_type: 'ハウツー' }));
    await writeFile(path.join(generic, 'source-manifest.json'), JSON.stringify({ version: 1, sources: [] }));
    const before = await readFile(path.join(generic, 'metadata.json'), 'utf8');
    const { stdout } = await execFileAsync('node', [checker, '--all', '--stage', 'verify'], { cwd });
    assert.match(stdout, /generic-guide.*not required/);
    assert.match(stdout, /review-sample.*1 required headings/);
    assert.equal(await readFile(path.join(generic, 'metadata.json'), 'utf8'), before);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
