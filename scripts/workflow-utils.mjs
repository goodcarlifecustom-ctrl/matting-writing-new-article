import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_PROFILE_PATH = path.join(rootDir, 'config/site-profile.json');
export function loadSiteProfileSync() {
  return existsSync(SITE_PROFILE_PATH) ? JSON.parse(readFileSync(SITE_PROFILE_PATH, 'utf8')) : {};
}
export const SITE_PROFILE = loadSiteProfileSync();
export const DEFAULT_CATEGORY = SITE_PROFILE.default_category || '未分類';
export const DEFAULT_TARGET_MEDIA = ensureTrailingSlash(SITE_PROFILE.site_url || 'https://writing-corp.co.jp/matting');
export const DEFAULT_REST_ROOT = SITE_PROFILE.rest_root || 'https://writing-corp.co.jp/matting/wp-json/';

export function ensureTrailingSlash(value='') { return String(value).replace(/\/+$/,'') + '/'; }
export function normalizeMediaUrl(value='') { try { const u = new URL(value); u.hash=''; u.search=''; u.pathname=u.pathname.replace(/\/+$/,'') + '/'; return u.toString(); } catch { return ensureTrailingSlash(value); } }
export function assertAllowedTargetMedia(value) {
  const normalized = normalizeMediaUrl(value || DEFAULT_TARGET_MEDIA);
  const allowed = (SITE_PROFILE.allowed_target_media?.length ? SITE_PROFILE.allowed_target_media : [DEFAULT_TARGET_MEDIA]).map(normalizeMediaUrl);
  if (!allowed.includes(normalized)) throw new Error(`target_media must be ${DEFAULT_TARGET_MEDIA}. Refusing to create an article for: ${value}`);
  return normalized;
}
export function argvValue(argv, name) { const candidates = [`--${name}`, `--${name.replace(/_/g, '-')}`]; for (const flag of candidates) { const i = argv.indexOf(flag); if (i >= 0) return argv[i + 1]; } return undefined; }
export function normalizeSpaces(value = '') { return String(value).normalize('NFKC').replace(/[\u3000\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); }
export function parseScalar(text, key) { const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, 'm')); if (!m) return undefined; let v = m[1].trim(); if (v === '') return ''; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return v; }
export function parseList(text, key) { const scalar = parseScalar(text, key); if (scalar && scalar !== '[]') return scalar.split(',').map((v) => v.trim()).filter(Boolean); const lines = text.split(/\r?\n/); const out = []; let inList = false; for (const line of lines) { if (new RegExp(`^${key}:\\s*$`).test(line)) { inList = true; continue; } if (inList && /^\s*-\s*/.test(line)) out.push(line.replace(/^\s*-\s*/, '').replace(/^[ '\"]+|[ '\"]+$/g, '').trim()); else if (inList && /^\S/.test(line)) break; } return out; }
export async function loadInput(path) { return path && existsSync(path) ? await readFile(path, 'utf8') : ''; }
export function normalizeRelatedKeywords(value, mainKeyword = '') { const raw = Array.isArray(value) ? value : String(value ?? '').split(','); const main = normalizeSpaces(mainKeyword); const seen = new Set(); const out = []; for (const item of raw) { const normalized = normalizeSpaces(item); if (!normalized || normalized === main || seen.has(normalized)) continue; seen.add(normalized); out.push(normalized); } return out; }
export function normalizeBoolean(value, fallback = false) { if (value === undefined || value === null || value === '') return Boolean(fallback); if (typeof value === 'boolean') return value; const v = String(value).trim().toLowerCase(); return ['true', '1', 'yes', 'y', 'on'].includes(v); }
export function postToWpFromInputs({ wordpressDraft, postToWp }) { const hasWordPressDraft = wordpressDraft !== undefined && wordpressDraft !== null && wordpressDraft !== ''; const hasPostToWp = postToWp !== undefined && postToWp !== null && postToWp !== ''; const draftValue = hasWordPressDraft ? normalizeBoolean(wordpressDraft, true) : undefined; const postValue = hasPostToWp ? normalizeBoolean(postToWp, true) : undefined; if (hasWordPressDraft && hasPostToWp && draftValue !== postValue) throw new Error('wordpress_draft and post_to_wp must match when both are provided.'); return hasWordPressDraft ? draftValue : hasPostToWp ? postValue : true; }
export function yamlString(value) { return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }
export function yamlList(values) { return values.length ? values.map((v) => `  - ${yamlString(v)}`).join('\n') : '[]'; }
export function slugFromKeyword(keyword = '') { let text = normalizeSpaces(keyword).toLowerCase(); const dictionary = [['マッチングアプリ','matching-app'],['出会い系','dating-app'],['出会い','dating'],['セフレ','casual-partner'],['風俗','adult-service'],['ナンパ','pickup'],['ハッピーメール','happymail'],['安全','safety'],['注意点','cautions'],['料金','price'],['比較','comparison'],['評判','reviews'],['口コミ','reviews'],['おすすめ','recommended'],['初心者','beginner']]; for (const [from,to] of dictionary) text = text.split(from.toLowerCase()).join(` ${to} `).split(from).join(` ${to} `); const words = text.normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean); if (!words.length) return ''; return [...new Set(words)].slice(0,5).join('-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, ''); }
export function isUnresolved(value) { if (value === null || value === undefined) return true; const v = String(value).trim().toLowerCase(); return v === '' || v === 'auto' || v === 'null' || v === 'undefined'; }
