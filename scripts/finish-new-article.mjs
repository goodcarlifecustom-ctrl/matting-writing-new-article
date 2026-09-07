import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { argvValue } from './workflow-utils.mjs';

const execFileAsync = promisify(execFile);

function fail(message) { throw new Error(message); }
async function run(label, args, options = {}) {
  console.log(`\n[${label}] npm ${args.join(' ')}`);
  try {
    const { stdout, stderr } = await execFileAsync('npm', args, { maxBuffer: 16 * 1024 * 1024, ...options });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  } catch (error) {
    const out = `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`;
    throw new Error(`${label} failed\n${out}`);
  }
}
async function writeFailure(slug, message) {
  const dir = path.join('articles', slug);
  const metadataPath = path.join(dir, 'metadata.json');
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    Object.assign(metadata, {
      wordpress_draft: false,
      post_to_wp: false,
      wordpress_status: 'DISABLED',
      delivery_mode: 'manual_copy',
      primary_output: 'article-decorated.html',
      copy_ready: false,
      external_write_performed: false,
      updated_at: new Date().toISOString()
    });
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
  } catch {}
  const report = `# 新規記事完了処理エラー\n\n- slug: ${slug}\n- result: FAIL\n- reason: ${message}\n- next_action: エラーを修正し、同じslugで \`npm run finish -- --slug ${slug}\` を再実行してください。\n- external_write_performed: false\n`;
  await writeFile(path.join(dir, 'check-report.md'), report, 'utf8').catch(() => {});
}

async function main() {
  const slug = argvValue(process.argv, 'slug');
  if (!slug) fail('Usage: npm run finish -- --slug <slug>');
  try {
    await run('decorate', ['run', 'decorate', '--', '--slug', slug]);
    await run('quality check', ['run', 'check', '--', '--slug', slug]);
    await run('decoration check', ['run', 'check:decoration', '--', '--slug', slug]);

    const metadata = JSON.parse(await readFile(path.join('articles', slug, 'metadata.json'), 'utf8'));
    if (metadata.status !== 'draft') fail('metadata.status must be draft');
    if (metadata.copy_ready !== true) fail('metadata.copy_ready must be true after quality checks');
    const relativeCopyPath = path.join('articles', slug, 'article-decorated.html');
    const content = await readFile(relativeCopyPath, 'utf8');
    if (!content.trim()) fail('article-decorated.html is empty');
    console.log(`\nCompleted local-only article workflow for ${slug}.`);
    console.log(`Copy source (relative): ${relativeCopyPath}`);
    console.log(`Copy source (absolute): ${path.resolve(relativeCopyPath)}`);
    console.log('WordPress connection: disabled');
    console.log('External write performed: false');
  } catch (error) {
    await writeFailure(slug, error.message);
    console.error(error.message);
    process.exit(1);
  }
}

main();
