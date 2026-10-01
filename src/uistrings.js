// The web app's own words (buttons, headings, settings) in any language.
// Strings are written in English in the web files as T('...') / N('...') / data-t="...".
// Hindi is written by hand (ui-hi.js). Every other language is translated once by the AI, checked, and kept.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HI } from './ui-hi.js';
import { langDef } from './i18n.js';

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
let keys = null;

export function uiKeys() {
  if (keys) return keys;
  const found = new Set();
  const un = (x) => x.replace(/\\'/g, "'").replace(/\\n/g, '\n');
  for (const f of ['app.js', 'screens.js', 'tools.js', 'guides.js']) {
    const p = join(WEB_DIR, f);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf8');
    for (const m of src.matchAll(/\b(?:T|N)\(\s*'((?:[^'\\\n]|\\.)*)'/g)) found.add(un(m[1]));
  }
  const html = join(WEB_DIR, 'index.html');
  if (existsSync(html)) for (const m of readFileSync(html, 'utf8').matchAll(/data-t[pa]?="([^"]+)"/g)) found.add(m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
  keys = [...found].filter((k) => k.trim());
  return keys;
}

const holes = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
const good = (en, tr) => typeof tr === 'string' && tr.trim() && tr.length < en.length * 4 + 40 && holes(en) === holes(tr);

const inflight = new Map();

/** Returns { en: translation } for a language code. English needs nothing. Never throws. */
export async function uiDict(code, { llm, store }) {
  if (code === 'en') return {};
  const def = code === 'hi' ? { en: 'Hindi' } : langDef(code);
  if (!def) return {};
  const cacheKey = 'ui_' + code;
  const all = uiKeys();
  let have = {};
  try { have = store.getSetting?.(cacheKey) || {}; } catch { have = {}; }
  const out = {};
  if (code === 'hi') for (const k of all) if (good(k, HI[k])) out[k] = HI[k];
  for (const k of all) if (have[k] && good(k, have[k])) out[k] = have[k];
  const missing = all.filter((k) => !out[k]);
  if (!missing.length || !llm?.enabled) return out;
  if (inflight.has(code)) return inflight.get(code).then(() => uiDict(code, { llm, store }));
  const job = (async () => {
    const learned = {};
    for (let i = 0; i < missing.length; i += 45) {
      const chunk = missing.slice(i, i + 45);
      try {
        const { map } = await llm.translate(`${def.en}${code === 'hi' ? ' (Devanagari)' : ' (its own script)'}`, chunk.map((en, j) => ({ k: String(j), en, max: Math.max(12, Math.round(en.length * 2.2)) })));
        chunk.forEach((en, j) => { if (good(en, map[String(j)])) learned[en] = String(map[String(j)]).trim(); });
      } catch (e) {
        console.error('ui translate error:', e.message);
      }
    }
    if (Object.keys(learned).length) store.setSetting?.(cacheKey, { ...have, ...learned });
  })().finally(() => inflight.delete(code));
  inflight.set(code, job);
  await job;
  let after = {};
  try { after = store.getSetting?.(cacheKey) || {}; } catch { after = {}; }
  for (const k of all) if (!out[k] && after[k] && good(k, after[k])) out[k] = after[k];
  return out;
}
