import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeRelatedKeywords, postToWpFromInputs, slugFromKeyword } from '../scripts/workflow-utils.mjs';
import { requireWpEnv } from '../scripts/post-wp-draft.mjs';
const execFileAsync = promisify(execFile);
const repo = path.resolve('.');
async function run(args, cwd) { return execFileAsync('node', [path.join(repo,'scripts/create-article-dir.mjs'), ...args], { cwd, maxBuffer: 1024*1024 }); }

test('related_keywords array/comma normalization and duplicates', () => {
  assert.deepEqual(normalizeRelatedKeywords([' 安全　対策 ', 'マッチングアプリ 安全', '安全 対策'], 'マッチングアプリ 安全'), ['安全 対策']);
  assert.deepEqual(normalizeRelatedKeywords('a, b, a,, c', 'main'), ['a','b','c']);
});

test('wordpress_draft conversion and default', () => {
  assert.equal(postToWpFromInputs({ wordpressDraft: 'true', postToWp: 'true' }), true);
  assert.equal(postToWpFromInputs({ wordpressDraft: undefined, postToWp: 'true' }), true);
  assert.equal(postToWpFromInputs({}), true);
  assert.throws(() => postToWpFromInputs({ wordpressDraft: 'false', postToWp: 'true' }), /must match/);
});

test('slug generation', () => { assert.equal(slugFromKeyword('マッチングアプリ 初心者 安全'), 'matching-app-beginner-safety'); });

test('create reads main_keyword and related_keywords list, writes required files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-'));
  try {
    await mkdir(path.join(dir,'jobs'));
    await writeFile(path.join(dir,'jobs/in.yml'), 'main_keyword: "マッチングアプリ 初心者 安全"\nrelated_keywords:\n  - "マッチングアプリ 始め方"\n  - "出会い系 安全対策"\nwordpress_draft: false\ntarget_media: "https://www.atarijo.com/media/"\narticle_type: "ハウツー"\npersona: "成人初心者"\narticle_purpose: "安全な始め方を理解してもらう"\nmin_word_count: 1000\ntarget_word_count: 1500\nmax_word_count: 2000\n');
    await run(['--input','jobs/in.yml'], dir);
    const articleDir = path.join(dir,'articles/matching-app-beginner-safety');
    assert.equal(existsSync(articleDir), true);
    const input = await readFile(path.join(articleDir,'input.yml'),'utf8');
    assert.match(input, /main_keyword:/); assert.match(input, /related_keywords:/); assert.match(input, /post_to_wp: false/);
    assert.equal(existsSync(path.join(articleDir,'metadata.json')), true);
    assert.equal(existsSync(path.join(articleDir,'research.md')), true);
    await assert.rejects(run(['--input','jobs/in.yml'], dir));
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('create supports comma related keywords and wordpress_draft true', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-'));
  try { await run(['--main-keyword','出会い系 評判','--related-keywords','出会い系 口コミ,出会い系 安全','--wordpress-draft','true','--target-media','https://www.atarijo.com/media/','--article-type','評判','--persona','成人読者','--article-purpose','安全な判断材料を示す','--min-word-count','1000','--target-word-count','1500','--max-word-count','2000'], dir);
    const input = await readFile(path.join(dir,'articles/dating-app-reviews/input.yml'),'utf8');
    assert.match(input, /post_to_wp: true/); assert.match(input, /出会い系 口コミ/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('post env safety', () => {
  assert.throws(() => requireWpEnv({}), /WP_REST_ROOT/);
  assert.throws(() => requireWpEnv({WP_REST_ROOT:'https://example.test/wp-json/', WP_USERNAME:'user', WP_APP_PASSWORD:'pass', WP_DEFAULT_STATUS:'publish'}), /draft/);
});

test('post_to_wp false exits before network/env requirement', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-'));
  try { await mkdir(path.join(dir,'articles/sample'), {recursive:true}); await writeFile(path.join(dir,'articles/sample/input.yml'),'post_to_wp: false\n');
    const p = await execFileAsync('node', [path.join(repo,'scripts/post-wp-draft.mjs'),'--slug','sample'], {cwd:dir, env:{PATH:process.env.PATH}, maxBuffer:1024*1024}).catch(e=>e);
    assert.notEqual(p.code, 0); const report = await readFile(path.join(dir,'articles/sample/check-report.md'),'utf8'); assert.match(report, /接続しません/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
