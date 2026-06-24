import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { argvValue, DEFAULT_CATEGORY, loadInput, normalizeRelatedKeywords, normalizeSpaces, parseList, parseScalar, postToWpFromInputs, slugFromKeyword, yamlList, yamlString } from './workflow-utils.mjs';

function valueFrom(inputText, cliName, yamlKey = cliName) { return argvValue(process.argv, cliName) ?? parseScalar(inputText, yamlKey); }
function mustSlug(slug) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug); }
function requiredValue(inputText, key, label = key) { const value = normalizeSpaces(valueFrom(inputText, key) ?? ''); if (!value) { console.error(`${label} is required.`); process.exit(1); } return value; }
function requiredInt(inputText, key) { const raw = normalizeSpaces(valueFrom(inputText, key) ?? ''); if (!/^\d+$/.test(raw)) { console.error(`${key} is required and must be a number.`); process.exit(1); } const n = Number(raw); if (!Number.isSafeInteger(n) || n <= 0) { console.error(`${key} must be a positive safe integer.`); process.exit(1); } return n; }

const inputFile = argvValue(process.argv, 'input');
const inputText = await loadInput(inputFile);
const mainKeyword = normalizeSpaces(valueFrom(inputText, 'main_keyword') ?? valueFrom(inputText, 'keyword') ?? '');
if (!mainKeyword) { console.error('main_keyword is required. keyword remains supported as a backward-compatible alias.'); process.exit(1); }
const relatedRaw = argvValue(process.argv, 'related_keywords') ?? argvValue(process.argv, 'related-keywords') ?? parseList(inputText, 'related_keywords');
const relatedKeywords = normalizeRelatedKeywords(relatedRaw, mainKeyword);
if (!relatedKeywords.length) { console.error('related_keywords is required as a YAML list or comma-separated string.'); process.exit(1); }
const wordpressDraft = argvValue(process.argv, 'wordpress_draft') ?? argvValue(process.argv, 'wordpress-draft') ?? parseScalar(inputText, 'wordpress_draft') ?? 'true';
let postToWp;
try { postToWp = postToWpFromInputs({ wordpressDraft, postToWp: parseScalar(inputText, 'post_to_wp') ?? argvValue(process.argv, 'post_to_wp') }); }
catch (e) { console.error(e.message); process.exit(1); }
const targetMedia = requiredValue(inputText, 'target_media');
const articleType = requiredValue(inputText, 'article_type');
const persona = requiredValue(inputText, 'persona', '想定読者/persona');
const articlePurpose = requiredValue(inputText, 'article_purpose');
const minWordCount = requiredInt(inputText, 'min_word_count');
const targetWordCount = requiredInt(inputText, 'target_word_count');
const maxWordCount = requiredInt(inputText, 'max_word_count');
if (!(minWordCount <= targetWordCount && targetWordCount <= maxWordCount)) { console.error('word counts must satisfy min_word_count <= target_word_count <= max_word_count.'); process.exit(1); }
const status = normalizeSpaces(valueFrom(inputText, 'status') ?? 'draft');
if (status !== 'draft') { console.error('status is managed by this workflow and must be draft.'); process.exit(1); }
const providedSlug = normalizeSpaces(valueFrom(inputText, 'slug') || '');
const slug = providedSlug || slugFromKeyword(mainKeyword) || 'auto';
if (slug === 'auto') { console.error('Could not generate a meaningful slug. Provide --slug after keyword analysis.'); process.exit(1); }
if (!mustSlug(slug)) { console.error('slug must contain only lowercase letters, numbers, and hyphens.'); process.exit(1); }
const dir = path.join('articles', slug);
if (existsSync(dir)) { console.error(`Article directory already exists: ${dir}. Refusing to overwrite or choose another slug.`); process.exit(1); }
await mkdir(path.dirname(dir), { recursive: true });
await mkdir(dir, { recursive: false });
const now = new Date().toISOString();
const title = valueFrom(inputText, 'title') || 'auto';
const category = valueFrom(inputText, 'category') || DEFAULT_CATEGORY;
const referenceUrls = parseList(inputText, 'reference_urls');
const notes = valueFrom(inputText, 'notes') || parseScalar(inputText, 'notes') || '';
const inputYml = [
  `main_keyword: ${yamlString(mainKeyword)}`,
  'related_keywords:', yamlList(relatedKeywords),
  'search_intent: auto', 'explicit_needs: auto', 'latent_needs: auto', `persona: ${yamlString(persona)}`, `article_type: ${yamlString(articleType)}`, `article_purpose: ${yamlString(articlePurpose)}`,
  `title: ${yamlString(title)}`, `slug: ${yamlString(slug)}`, 'meta_description: auto', `min_word_count: ${minWordCount}`, `target_word_count: ${targetWordCount}`, `max_word_count: ${maxWordCount}`,
  `category: ${yamlString(category)}`, `target_media: ${yamlString(targetMedia)}`,
  'reference_urls:', yamlList(referenceUrls),
  `wordpress_draft: ${postToWp ? 'true' : 'false'}`, `post_to_wp: ${postToWp ? 'true' : 'false'}`, 'status: draft', `created_at: ${yamlString(now)}`, `notes: ${yamlString(notes)}`
].join('\n') + '\n';
await writeFile(path.join(dir, 'input.yml'), inputYml, 'utf8');
const metadata = { title: title === 'auto' ? null : title, slug, meta_description: null, target_keyword: mainKeyword, related_keywords: relatedKeywords, search_intent: null, persona, article_type: articleType, article_purpose: articlePurpose, min_char_count: minWordCount, target_char_count: targetWordCount, max_char_count: maxWordCount, min_word_count: minWordCount, target_word_count: targetWordCount, max_word_count: maxWordCount, status: 'draft', wordpress_draft: postToWp, post_to_wp: postToWp, wordpress_draft_id: null, wordpress_draft_url: null, created_at: now, updated_at: now, research_date: null, notes };
await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n', 'utf8');
const decoration = { version: 1, enabled: true, outline: { enabled: true, title: '【この記事でわかること】' }, section_navigation: { enabled: true, minimum_h3: 3, default_title: 'この章でわかること', overrides: [] }, list_boxes: [], markers: [] };
await writeFile(path.join(dir, 'decoration.json'), JSON.stringify(decoration, null, 2) + '\n', 'utf8');
const research = `# research.md\n\n## メインキーワード\n\n${mainKeyword}\n\n## 関連キーワード\n\n${relatedKeywords.map((k)=>`- ${k}`).join('\n')}\n\n## 検索意図\n\nauto\n\n## 顕在ニーズ\n\nauto\n\n## 潜在ニーズ\n\nauto\n\n## ペルソナ\n\nauto\n\n## 記事タイプ\n\nauto\n\n## タイトル案3案\n\nauto\n\n## 採用タイトル\n\nauto\n\n## 目標文字数\n\nauto\n\n## 競合調査\n\n未実施。\n\n## 一次情報\n\n未確認。\n\n## 選定基準\n\nauto\n\n## 見出し構成の根拠\n\nauto\n\n## 外部リンク一覧\n\n未設定。\n\n## 内部リンク一覧\n\n未設定。\n\n## 情報確認日\n\n未確認。\n\n## 未確認事項\n\n- キーワード分析、競合調査、一次情報確認は未実施です。\n\n## 執筆上の注意点\n\n- 架空の口コミ、料金、順位、保証表現を書かない。\n`;
await writeFile(path.join(dir, 'research.md'), research, 'utf8');
for (const file of ['serp.md','headings.csv','heading-analysis.md','heading-plan.md','draft.md','article.html','article-linked.html','article-decorated.html','external-links.md','wp-result.md','check-report.md']) await writeFile(path.join(dir, file), '', 'utf8');
console.log(`Created ${dir}`);
