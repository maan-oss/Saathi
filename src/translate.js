// Makes the bot speak more languages. English and Hindi are hand-written. For any other language the bot's texts
// (messages.js and services.js) are translated by the AI once, checked, saved in translations.json and reused.
//
// Every translated text is checked before it is trusted: same {placeholders}, same number of *bold* markers,
// within the length WhatsApp allows for buttons and list rows. A text that fails twice is left out and the bot shows
// the English for it. If fewer than 90% pass, the language is not switched on at all.
//
// !! These are machine translations. Have a native speaker read them before you rely on them: fix
// data/translations.json by hand and add "reviewed": true, and the bot will never overwrite that record.

import { allMessages } from './messages.js';
import { translatableStrings } from './services.js';
import * as i18n from './i18n.js';

const SKIP_KEYS = new Set(['welcome', 'btn_english', 'btn_hindi', 'lang_pick']);
const BUTTON_KEYS = /^(btn_|menu_btn|svc_btn|topup_btn|lang_more_btn|remind_type_btn|form_cta)/;
const BATCH = 20;
const CONCURRENCY = 4;
const PASS_RATE = 0.9;

const tokens = (s) => (String(s).match(/\{[A-Za-z0-9_]+\}/g) || []).sort().join(',');
const stars = (s) => (String(s).match(/\*/g) || []).length;

export function validTranslation(item, out) {
  if (typeof out !== 'string' || !out.trim()) return false;
  if (tokens(out) !== tokens(item.en)) return false;
  if (stars(out) !== stars(item.en)) return false;
  if (/\bundefined\b|\bnull\b/.test(out) && !/\bundefined\b|\bnull\b/.test(item.en)) return false;
  return out.length <= (item.max || item.en.length * 3 + 40);
}

/** Every text to translate, as [{ k, en, max? }]. Array texts (menu rows) are split into cells `key#row#col`. */
export function collectItems() {
  const items = [];
  for (const [key, v] of Object.entries(allMessages.en)) {
    if (SKIP_KEYS.has(key)) continue;
    if (typeof v === 'string') items.push({ k: `m:${key}`, en: v, max: BUTTON_KEYS.test(key) ? 20 : undefined });
    else if (Array.isArray(v))
      v.forEach((row, i) => {
        if (row[1]) items.push({ k: `m:${key}#${i}#1`, en: row[1], max: 24 });
        if (row[2]) items.push({ k: `m:${key}#${i}#2`, en: row[2], max: 72 });
      });
  }
  for (const s of translatableStrings()) items.push({ k: `s:${i18n.hashStr(s.en)}`, en: s.en, max: s.max });
  return items;
}

function assemble(items, results) {
  const messages = {};
  const strings = {};
  const cells = {};
  for (const it of items) {
    const out = results.get(it.k);
    if (out === undefined) continue;
    if (it.k.startsWith('s:')) strings[it.k.slice(2)] = out;
    else if (it.k.includes('#')) cells[it.k.slice(2)] = out;
    else messages[it.k.slice(2)] = out;
  }
  // rebuild the row arrays, keeping English for any cell that is missing
  for (const [key, v] of Object.entries(allMessages.en)) {
    if (!Array.isArray(v)) continue;
    messages[key] = v.map((row, i) => [row[0], cells[`${key}#${i}#1`] ?? row[1], cells[`${key}#${i}#2`] ?? row[2]]);
  }
  return { messages, strings };
}

export function createTranslator({ llm, store, guard, config = {} }) {
  const inflight = new Map();
  const isOn = () => Boolean(llm?.enabled);

  async function loadCached() {
    let n = 0;
    for (const l of i18n.LANGS) {
      const rec = await store.getTranslation(l.code);
      if (rec?.messages) {
        i18n.register(l.code, rec);
        n++;
      }
    }
    return n;
  }

  async function translateAll(code, log = () => {}) {
    const langName = i18n.langDef(code).en;
    const items = collectItems();
    const results = new Map();
    const byKey = new Map(items.map((i) => [i.k, i]));

    async function attempt(batch) {
      const { map, usage } = await llm.translate(langName, batch);
      await guard?.recordLlm?.('translate', usage);
      const failed = [];
      for (const it of batch) {
        const out = map[it.k];
        if (validTranslation(it, out)) results.set(it.k, out.trim());
        else failed.push(it);
      }
      return failed;
    }

    const batches = [];
    for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));
    let next = 0;
    let done = 0;
    const retry = [];
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < batches.length) {
          const b = batches[next++];
          try {
            retry.push(...(await attempt(b)));
          } catch (e) {
            console.error(`translate ${code} batch failed:`, e.message);
            retry.push(...b);
          }
          log(`${code}: ${++done}/${batches.length} batches`);
        }
      }),
    );
    // one more try for whatever failed, in small groups
    for (let i = 0; i < retry.length; i += 8) {
      try {
        await attempt(retry.slice(i, i + 8));
      } catch (e) {
        console.error(`translate ${code} retry failed:`, e.message);
      }
    }
    const ok = results.size / items.length;
    log(`${code}: ${results.size}/${items.length} texts passed the checks (${Math.round(ok * 100)}%)`);
    if (ok < PASS_RATE) return { ok: false, rate: ok };
    const data = assemble(items, results);
    return { ok: true, rate: ok, data, missing: items.length - results.size };
  }

  return {
    get enabled() {
      return isOn();
    },
    loadCached,
    translateAll,
    /** Makes sure a language is ready. Returns true when it is. Safe to call at once from many people. */
    async ensure(code) {
      if (i18n.isReady(code)) return true;
      if (!i18n.langDef(code) || !isOn()) return false;
      const cached = await store.getTranslation(code);
      if (cached?.messages) {
        i18n.register(code, cached);
        return true;
      }
      if (!inflight.has(code)) {
        inflight.set(
          code,
          (async () => {
            try {
              const r = await translateAll(code);
              if (!r.ok) return false;
              const rec = { ...r.data, machine: true, at: Date.now(), missing: r.missing };
              await store.putTranslation(code, rec);
              i18n.register(code, rec);
              return true;
            } finally {
              inflight.delete(code);
            }
          })(),
        );
      }
      return inflight.get(code);
    },
  };
}
