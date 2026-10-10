// Extra languages. English and Hindi are hand-written (messages.js, services.js). Every other language is a
// machine translation that is made once, checked, cached (see translate.js) and registered here.
// Nothing here calls the network: it only holds what has been registered.

export const LANGS = [
  // shipped: a full set of translations ships in src/ui/<code>.json (checked by test/languages.test.js). Only these
  // are offered in the app and on WhatsApp lists, because they work without a live AI.
  { code: 'ta', native: 'தமிழ்', en: 'Tamil', shipped: true },
  { code: 'te', native: 'తెలుగు', en: 'Telugu', shipped: true },
  { code: 'bn', native: 'বাংলা', en: 'Bengali', shipped: true },
  { code: 'mr', native: 'मराठी', en: 'Marathi', shipped: true },
  { code: 'gu', native: 'ગુજરાતી', en: 'Gujarati', shipped: true },
  { code: 'kn', native: 'ಕನ್ನಡ', en: 'Kannada', shipped: true },
  { code: 'ml', native: 'മലയാളം', en: 'Malayalam', shipped: true },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', en: 'Punjabi', shipped: true },
  // Not shipped: they have no translations yet, so they need a live AI and are not offered in the lists. Typing the
  // name on WhatsApp still tries the AI.
  { code: 'or', native: 'ଓଡ଼ିଆ', en: 'Odia' },
  { code: 'ur', native: 'اردو', en: 'Urdu' },
  { code: 'as', native: 'অসমীয়া', en: 'Assamese' },
  { code: 'ne', native: 'नेपाली', en: 'Nepali' },
  { code: 'mai', native: 'मैथिली', en: 'Maithili' },
  { code: 'kok', native: 'कोंकणी', en: 'Konkani' },
  { code: 'sa', native: 'संस्कृतम्', en: 'Sanskrit', beta: true },
  { code: 'sd', native: 'سنڌي', en: 'Sindhi', beta: true },
  { code: 'ks', native: 'كٲشُر', en: 'Kashmiri', beta: true },
  { code: 'doi', native: 'डोगरी', en: 'Dogri', beta: true },
  { code: 'brx', native: 'बड़ो', en: 'Bodo', beta: true },
  { code: 'sat', native: 'ᱥᱟᱱᱛᱟᱲᱤ', en: 'Santali', beta: true },
  { code: 'mni', native: 'ꯃꯩꯇꯩꯂꯣꯟ', en: 'Manipuri', beta: true },
];
// The languages offered in lists: the web app's picker and the WhatsApp "more languages" list (10 rows at most).
export const SHIPPED_LANGS = LANGS.filter((l) => l.shipped);
export const WA_LANGS = SHIPPED_LANGS.slice(0, 9);
export const langDef = (code) => LANGS.find((l) => l.code === code) || null;

/** Match what someone typed to a language code: the code, the English name, or the native name. */
export function matchLang(text, codes = true) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return null;
  const l = LANGS.find((x) => (codes && s === x.code) || s === x.en.toLowerCase() || s === x.native.toLowerCase());
  return l ? l.code : null;
}

// A short stable hash of an English string. Translations of the long service texts are keyed by it.
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const store = {}; // code -> { messages: {key: value}, strings: {hash: value} }

export function register(code, data) {
  store[code] = { messages: data.messages || {}, strings: data.strings || {} };
}
export const isReady = (code) => code === 'en' || code === 'hi' || Boolean(store[code]);
export const message = (code, key) => store[code]?.messages?.[key];
export const string = (code, en) => (en == null ? undefined : store[code]?.strings?.[hashStr(en)]);
