// Anonymous daily totals for the funnel: how many people open the site, tap into the app, start a top-up and pay.
// Nothing here is tied to a person. There is no cookie, no IP address and no account id in what is kept.
//
// Bot and spam protection, in order:
//  1. Only the four event names below are counted. Anything else is ignored.
//  2. The public beacon accepts two events only (landing_view, app_open). Top-ups are counted on the server,
//     so a page cannot inflate them.
//  3. The ad source is one of a short fixed list. Anything else counts as "other", so the source field cannot be
//     used to store text.
//  4. Requests from well-known bots and automation tools are not counted.
//  5. The web layer rate-limits the beacon per address (see web.js), and the body is capped at a few hundred bytes.

export const CLIENT_EVENTS = new Set(['landing_view', 'app_open']);
export const SERVER_EVENTS = new Set(['topup_started', 'topup_paid']);
export const EVENTS = [...CLIENT_EVENTS, ...SERVER_EVENTS];

const SOURCES = new Set(['meta', 'google', 'instagram', 'facebook', 'youtube', 'whatsapp', 'organic', 'direct', 'other', 'wallet', 'pack']);
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|curl|wget|python|go-http|java\/|okhttp|facebookexternalhit|monitor/i;

/** The ad or link source, from a utm_source value. Empty means direct. Unknown values are "other". */
export function cleanSource(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'direct';
  return SOURCES.has(s) ? s : 'other';
}

export function isBot(userAgent) {
  const ua = String(userAgent || '');
  return !ua || BOT_UA.test(ua);
}

/** Checks the body of a beacon. Returns { event, source } or null when it must be ignored. */
export function parseClientEvent(text) {
  if (typeof text !== 'string' || text.length > 300) return null;
  let b;
  try { b = JSON.parse(text); } catch { return null; }
  if (!b || typeof b !== 'object' || !CLIENT_EVENTS.has(b.event)) return null;
  return { event: b.event, source: cleanSource(b.source) };
}
