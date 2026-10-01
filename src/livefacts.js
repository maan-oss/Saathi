// Keeps the assistant's facts current. Every few hours the server reads the official pages listed below, asks the AI
// to pull out only fees, deadlines and rule changes that the page actually states, throws away any line whose
// numbers are not literally on the page, and adds the rest to what the assistant knows (marked "latest read").
// A page that cannot be read (many government sites block robots) is skipped; the checked facts still stand.
import { setLiveFacts } from './services.js';

export const SOURCES = {
  pan: [
    'https://www.incometax.gov.in/iec/foportal/help/how-to-link-aadhaar',
    'https://www.incometax.gov.in/iec/foportal/help/e-pan',
  ],
  aadhaar: ['https://uidai.gov.in/en/my-aadhaar/update-aadhaar', 'https://uidai.gov.in/en/my-aadhaar/get-aadhaar'],
  dl: ['https://parivahan.gov.in/parivahan/en/content/driving-licence'],
  passport: ['https://www.passportindia.gov.in/AppOnlineProject/online/procFeeStructure'],
  voter: ['https://voters.eci.gov.in/'],
  gst: ['https://www.gst.gov.in/', 'https://tutorial.gst.gov.in/userguide/registration/index.htm'],
};

const DAY = 24 * 3600 * 1000;
const STALE = 20 * 3600 * 1000;
const SYSTEM =
  'You read the text of an official Indian government web page. List up to 6 short facts (one per line, starting with "- ") about CURRENT fees in rupees, deadlines with dates, validity periods, limits, or recent changes that the text explicitly states. ' +
  'Use ONLY numbers and dates that appear in the text. Do not add anything from memory. If the text has no such facts, reply exactly NONE.';

const numbersIn = (s) => (String(s).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ''));

/** True when every number in `line` is literally in `source`. */
export function grounded(line, source) {
  const have = new Set(numbersIn(source));
  return numbersIn(line).every((n) => have.has(n));
}

export function pageText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8377;|&#x20b9;/gi, 'Rs')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createLiveFacts({ store, llm, fetchFn = globalThis.fetch, sources = SOURCES, log = console }) {
  const get = () => store.getSetting('livefacts') || {};

  async function readPage(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12_000);
    try {
      const r = await fetchFn(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; SaathiFactsBot/1.0)', accept: 'text/html' } });
      if (!r.ok) return '';
      const buf = (await r.text()).slice(0, 600_000);
      return pageText(buf);
    } catch {
      return '';
    } finally {
      clearTimeout(t);
    }
  }

  async function refreshOne(id) {
    const items = [];
    for (const url of sources[id] || []) {
      const text = await readPage(url);
      if (text.length < 400) continue;
      let out;
      try {
        out = (await llm.answer(SYSTEM, text.slice(0, 14_000), { max: 450 })).text || '';
      } catch (e) {
        log.error?.('livefacts llm:', e.message);
        continue;
      }
      if (/^\s*none\b/i.test(out)) continue;
      for (const line of out.split('\n').map((l) => l.replace(/^[-*•\s]+/, '').trim()).filter((l) => l.length > 15 && l.length < 400)) {
        if (grounded(line, text)) items.push({ url, text: `${line} (source: ${new URL(url).host})` });
      }
    }
    return items.slice(0, 8);
  }

  async function refresh({ force = false } = {}) {
    if (!llm?.enabled) return { skipped: 'ai_off' };
    const cur = get();
    const next = { ...cur };
    let done = 0;
    for (const id of Object.keys(sources)) {
      if (!force && cur[id] && Date.now() - cur[id].ts < STALE) continue;
      const items = await refreshOne(id);
      // Keep older good items when a page could not be read this time (but not for more than a week).
      if (items.length) next[id] = { ts: Date.now(), items };
      else if (cur[id] && Date.now() - cur[id].ts < 7 * DAY) next[id] = cur[id];
      done++;
    }
    store.setSetting('livefacts', next);
    setLiveFacts(next);
    return { checked: done, services: Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.items.length])) };
  }

  return {
    refresh,
    /** Loads what was saved, then refreshes in the background when it is old. Never throws. */
    start({ every = 6 * 3600 * 1000 } = {}) {
      setLiveFacts(get());
      const run = () => refresh().catch((e) => log.error?.('livefacts:', e.message));
      setTimeout(run, 20_000).unref?.();
      const t = setInterval(run, every);
      t.unref?.();
    },
    status: () => Object.fromEntries(Object.entries(get()).map(([k, v]) => [k, { at: new Date(v.ts).toISOString(), lines: v.items.length }])),
  };
}
