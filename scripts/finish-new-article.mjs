import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { argvValue } from './workflow-utils.mjs';
import { redact } from './wordpress-utils.mjs';

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
    throw new Error(`${label} failed\n${redact(out)}`);
  }
}
async function writeFailure(slug, message) {
  const dir = path.join('articles', slug);
  const report = `# 新規記事完了処理エラー\n\n- slug: ${slug}\n- result: FAIL\n- reason: ${redact(message)}\n- next_action: エラーを修正し、同じslugで \`npm run finish -- --slug ${slug}\` を再実行してください。\n`;
  await writeFile(path.join(dir, 'check-report.md'), report, 'utf8').catch(() => {});
}

async function main() {
  const slug = argvValue(process.argv, 'slug');
  if (!slug) fail('Usage: npm run finish -- --slug <slug>');
  try {
    await run('decorate', ['run', 'decorate', '--', '--slug', slug]);
    await run('quality check', ['run', 'check', '--', '--slug', slug], { env: { ...process.env, ARTICLE_CHECK_SKIP_WP_AUTOSYNC: '1' } });
    await run('decoration check', ['run', 'check:decoration', '--', '--slug', slug]);

    const metadata = JSON.parse(await readFile(path.join('articles', slug, 'metadata.json'), 'utf8'));
    if (metadata.status !== 'draft') fail('metadata.status must be draft');
    if (metadata.post_to_wp !== true) {
      console.log('post_to_wp is not true; WordPress draft posting is intentionally skipped.');
      return;
    }

    const hasWpEnv = process.env.FINISH_ENABLE_WP_SYNC === '1' && Boolean((process.env.WP_SITE_URL || process.env.WP_REST_ROOT) && process.env.WP_USERNAME && (process.env.WP_APPLICATION_PASSWORD || process.env.WP_APP_PASSWORD));
    if (!hasWpEnv) {
      await run('wordpress draft dry-run', ['run', 'wp:draft', '--', '--slug', slug, '--dry-run']);
      console.log(`
Completed local-only article workflow for ${slug}; WordPress draft sync skipped because WP env is not set.`);
      return;
    }
    await run('wordpress doctor', ['run', 'wp:doctor']);
    await run('wordpress draft', ['run', 'wp:draft', '--', '--slug', slug, '--confirm', '--adopt-existing']);
    console.log(`
Completed article workflow and WordPress draft sync for ${slug}`);
  } catch (error) {
    await writeFailure(slug, error.message);
    console.error(redact(error.message));
    process.exit(1);
  }
}

main();
