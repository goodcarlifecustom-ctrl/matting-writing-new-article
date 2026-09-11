import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_TARGET_MEDIA, normalizeRelatedKeywords, postToWpFromInputs, slugFromKeyword } from '../scripts/workflow-utils.mjs';
const execFileAsync = promisify(execFile);
const repo = path.resolve('.');
async function run(args, cwd) { return execFileAsync('node', [path.join(repo,'scripts/create-article-dir.mjs'), ...args], { cwd, maxBuffer: 1024*1024 }); }
const requiredArgs = ['--article-type','評判','--persona','成人読者','--article-purpose','安全な判断材料を示す','--min-word-count','1000','--target-word-count','1500','--max-word-count','2000'];

test('related_keywords array/comma normalization and duplicates', () => {
  assert.deepEqual(normalizeRelatedKeywords([' 安全　対策 ', 'マッチングアプリ 安全', '安全 対策'], 'マッチングアプリ 安全'), ['安全 対策']);
  assert.deepEqual(normalizeRelatedKeywords('a, b, a,, c', 'main'), ['a','b','c']);
});

test('legacy WordPress controls are always disabled', () => {
  assert.equal(postToWpFromInputs({ wordpressDraft: 'true', postToWp: 'true' }), false);
  assert.equal(postToWpFromInputs({ wordpressDraft: undefined, postToWp: 'true' }), false);
  assert.equal(postToWpFromInputs({}), false);
  assert.equal(postToWpFromInputs({ wordpressDraft: 'false', postToWp: 'true' }), false);
});

test('slug generation', () => { assert.equal(slugFromKeyword('マッチングアプリ 初心者 安全'), 'matching-app-beginner-safety'); });

test('create defaults an omitted target_media to the matching site and writes local-only artifacts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-'));
  try {
    await mkdir(path.join(dir,'jobs'));
    await writeFile(path.join(dir,'jobs/in.yml'), 'main_keyword: "マッチングアプリ 初心者 安全"\nrelated_keywords:\n  - "マッチングアプリ 始め方"\n  - "出会い系 安全対策"\narticle_type: "ハウツー"\npersona: "成人初心者"\narticle_purpose: "安全な始め方を理解してもらう"\nmin_word_count: 1000\ntarget_word_count: 1500\nmax_word_count: 2000\n');
    await run(['--input','jobs/in.yml'], dir);
    const articleDir = path.join(dir,'articles/matching-app-beginner-safety');
    assert.equal(existsSync(articleDir), true);
    const input = await readFile(path.join(articleDir,'input.yml'),'utf8');
    assert.match(input, /main_keyword:/);
    assert.match(input, /related_keywords:/);
    assert.match(input, /^citation_sources: \[\]$/m);
    assert.match(input, new RegExp(`target_media: "${DEFAULT_TARGET_MEDIA}"`));
    assert.match(input, /wordpress_draft: false/);
    assert.match(input, /post_to_wp: false/);
    const metadata = JSON.parse(await readFile(path.join(articleDir,'metadata.json'),'utf8'));
    assert.equal(metadata.target_media, DEFAULT_TARGET_MEDIA);
    assert.equal(metadata.post_to_wp, false);
    assert.equal(metadata.delivery_mode, 'manual_copy');
    assert.equal(metadata.primary_output, 'article-decorated.html');
    assert.equal(metadata.external_write_performed, false);
    assert.equal(metadata.source_policy_status, 'PENDING');
    assert.equal(metadata.review_evidence_status, 'PENDING');
    assert.deepEqual(metadata.citation_source_candidates, []);
    assert.deepEqual(JSON.parse(await readFile(path.join(articleDir,'source-manifest.json'),'utf8')), { version: 1, sources: [] });
    assert.deepEqual(JSON.parse(await readFile(path.join(articleDir,'section-evidence.json'),'utf8')), { version: 1, article_slug: 'matching-app-beginner-safety', sections: [], evidence_items: [] });
    assert.equal(existsSync(path.join(articleDir,'research.md')), true);
    assert.equal(existsSync(path.join(articleDir,'article-decorated.html')), true);
    assert.equal(existsSync(path.join(articleDir,'wp-result.md')), false);
    await assert.rejects(run(['--input','jobs/in.yml'], dir));
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('create continues for a different target_media and ignores legacy WordPress true flags', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-'));
  try { await run(['--main-keyword','出会い系 評判','--related-keywords','出会い系 口コミ,出会い系 安全','--wordpress-draft','true','--post-to-wp','true','--target-media','https://example.test/editorial',...requiredArgs], dir);
    const input = await readFile(path.join(dir,'articles/dating-app-reviews/input.yml'),'utf8');
    assert.match(input, /target_media: "https:\/\/example\.test\/editorial\/"/);
    assert.match(input, /wordpress_draft: false/);
    assert.match(input, /post_to_wp: false/);
    assert.match(input, /出会い系 口コミ/);
    const metadata = JSON.parse(await readFile(path.join(dir,'articles/dating-app-reviews/metadata.json'),'utf8'));
    assert.equal(metadata.target_media, 'https://example.test/editorial/');
    assert.equal(metadata.wordpress_draft, false);
    assert.equal(metadata.post_to_wp, false);
    assert.equal(metadata.wordpress_status, 'DISABLED');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('create treats target_media なし as unset and still creates the article directory', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-'));
  try {
    const slug = 'no-target-media';
    await run(['--main-keyword','対象 メディア','--related-keywords','対象 メディア 確認','--target-media','なし','--slug',slug,...requiredArgs], dir);
    const articleDir = path.join(dir,'articles',slug);
    assert.equal(existsSync(articleDir), true);
    assert.match(await readFile(path.join(articleDir,'input.yml'),'utf8'), /^target_media: null$/m);
    const metadata = JSON.parse(await readFile(path.join(articleDir,'metadata.json'),'utf8'));
    assert.equal(metadata.target_media, null);
    assert.equal(metadata.post_to_wp, false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
