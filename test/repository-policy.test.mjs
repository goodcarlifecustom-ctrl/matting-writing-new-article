import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('repository exposes no WordPress connection or posting executable', () => {
  for (const file of [
    '.env.example',
    'rules/06-wordpress-draft.md',
    'scripts/check-wordpress-connection.mjs',
    'scripts/post-wordpress-draft.mjs',
    'scripts/post-wp-draft.mjs',
    'scripts/wordpress-utils.mjs'
  ]) assert.equal(existsSync(path.join(root, file)), false, `${file} must stay removed`);

  const pkg = JSON.parse(read('package.json'));
  for (const command of ['post', 'wp:draft', 'wp:doctor']) {
    assert.equal(Object.hasOwn(pkg.scripts, command), false, `${command} must not be exposed`);
  }
  for (const dependency of ['dotenv', 'undici']) {
    assert.equal(Object.hasOwn(pkg.dependencies, dependency), false, `${dependency} must stay removed`);
  }

  const executableSource = readdirSync(path.join(root, 'scripts'))
    .filter((file) => file.endsWith('.mjs'))
    .map((file) => read(`scripts/${file}`))
    .join('\n');
  for (const credentialName of [
    'WP_SITE_URL',
    'WP_REST_ROOT',
    'WP_USERNAME',
    'WP_APPLICATION_PASSWORD',
    'WP_APP_PASSWORD',
    'FINISH_ENABLE_WP_SYNC'
  ]) assert.doesNotMatch(executableSource, new RegExp(credentialName), `${credentialName} must never be read by scripts`);
});

test('repository policy keeps target_media optional and manual-copy delivery enabled', () => {
  const profile = JSON.parse(read('config/site-profile.json'));
  assert.equal(profile.site_url, 'https://matching.writing-corp.co.jp/');
  assert.equal(profile.wordpress_enabled, false);
  assert.equal(profile.output_mode, 'manual_copy');
  assert.equal(profile.primary_output, 'article-decorated.html');
  assert.equal(profile.target_media_policy.required, false);
  assert.equal(profile.target_media_policy.mismatch_action, 'continue_without_site_context');

  const policyFiles = [
    'AGENTS.md',
    'README.md',
    'prompt.md',
    'rules/00-site-profile.md',
    ...readdirSync(path.join(root, 'rules'))
      .filter((file) => /^(?:0[0-5]|99)-.*\.md$/.test(file))
      .map((file) => `rules/${file}`)
  ];
  const legacyMedia = ['https://writing-corp.co.jp', '/matting/'].join('');
  for (const file of [...new Set(policyFiles)]) {
    const content = read(file);
    assert.doesNotMatch(content, new RegExp(legacyMedia.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${file} must not enforce the legacy media`);
  }
});
