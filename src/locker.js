// The document locker: ID numbers and expiry dates a person chooses to keep, so they can ask "what's my PAN?"
// or "when does my licence expire?" and get the exact saved value, not an AI guess.
//
// Everything here is pure. The flow seals the result with the vault (AES-256-GCM) before it touches disk.
// Numbers are only ever revealed after the person taps Unlock, and never go to the AI model when answering.

export const TYPES = {
  pan: { en: 'PAN card', hi: 'पैन कार्ड', icon: '🪪', expiry: false, kw: ['pan', 'पैन'] },
  aadhaar: { en: 'Aadhaar', hi: 'आधार', icon: '🆔', expiry: false, kw: ['aadhaar', 'aadhar', 'adhar', 'आधार'] },
  driving_licence: { en: 'Driving licence', hi: 'ड्राइविंग लाइसेंस', icon: '🚗', expiry: true, kw: ['driving licence', 'driving license', 'licence', 'license', 'dl', 'लाइसेंस', 'ड्राइविंग'] },
  passport: { en: 'Passport', hi: 'पासपोर्ट', icon: '🛂', expiry: true, kw: ['passport', 'पासपोर्ट'] },
  voter_id: { en: 'Voter ID', hi: 'वोटर आईडी', icon: '🗳️', expiry: false, kw: ['voter', 'epic', 'वोटर'] },
  gst: { en: 'GSTIN', hi: 'जीएसटीआईएन', icon: '🧾', expiry: false, kw: ['gstin', 'gst', 'जीएसटी'] },
};
export const TYPE_IDS = Object.keys(TYPES);
export const typeName = (id, lang = 'en') => (TYPES[id] ? TYPES[id][lang] || TYPES[id].en : id);

// ---- number checks ------------------------------------------------------------
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
function verhoeff(s) {
  let c = 0;
  [...s].reverse().forEach((ch, i) => { c = D[c][P[i % 8][Number(ch)]]; });
  return c === 0;
}

/** Cleans and validates one ID number. Returns the tidy value, or null when it does not look real. */
export function normNumber(type, value) {
  const raw = String(value ?? '').toUpperCase().replace(/[\s\-.]/g, '');
  if (!raw) return null;
  switch (type) {
    case 'pan': return /^[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]$/.test(raw) ? raw : null;
    case 'aadhaar': return /^[2-9]\d{11}$/.test(raw) && verhoeff(raw) ? raw : null;
    case 'driving_licence': return /^[A-Z]{2}\d{2}\d{4,11}$/.test(raw) ? raw : null;
    case 'passport': return /^[A-PR-WY][1-9]\d{6}$/.test(raw) ? raw : null;
    case 'voter_id': return /^[A-Z]{3}\d{7}$/.test(raw) ? raw : null;
    case 'gst': return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(raw) ? raw : null;
    default: return null;
  }
}

/** How a number is written when shown: Aadhaar in fours, the rest as they are. */
export function showNumber(type, n) {
  if (type === 'aadhaar') return String(n).replace(/(\d{4})(?=\d)/g, '$1 ');
  if (type === 'driving_licence' && /^[A-Z]{2}\d{2}\d+$/.test(n)) return `${n.slice(0, 4)} ${n.slice(4)}`;
  return String(n);
}

/** ••••• 4-character preview for the locked card. */
export const maskNumber = (n) => (String(n).length > 4 ? '•'.repeat(Math.min(String(n).length - 4, 8)) + String(n).slice(-4) : '••••');

// ---- dates ---------------------------------------------------------------------
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function ymd(y, m, d) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** Any date a licence or passport carries, past or future. Returns 'YYYY-MM-DD' or null. */
export function normExpiry(input) {
  const s = String(input ?? '').trim();
  let m = s.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = s.toLowerCase().match(/^(\d{1,2})\s*([a-z]{3})[a-z]*\.?,?\s*(\d{4})$/)) && MONTHS.includes(m[2])) return ymd(+m[3], MONTHS.indexOf(m[2]) + 1, +m[1]);
  return null;
}
export function fmtDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
}
const IST = 5.5 * 3600 * 1000;
const dayNo = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
export const daysLeft = (iso, now = Date.now()) => dayNo(iso) - dayNo(new Date(now + IST).toISOString().slice(0, 10));

// ---- questions -----------------------------------------------------------------
const FIELD_KW = {
  expiry: [/\bexpir\w*/i, /\bvalid(ity)?\b/i, /\brenew\w*/i, /\bkab\b/i, /\bdue\b/i, /खत्म/, /एक्सपायर/, /वैध/],
  number: [/\bnumber\b/i, /\bno\.?\b/i, /\bnum\b/i, /\bid\b/i, /\bnambar\b/i, /नंबर/, /संख्या/],
  dob: [/\b(dob|birthday|birth date|date of birth|janm)\b/i, /जन्म/],
  name: [/\bname\b/i, /नाम/],
};
const ME = /\b(my|mine|mera|meri|mere)\b|मेरा|मेरी|मेरे/i;
const ASK = /\b(what|whats|what's|which|show|tell|give|remember|recall|find|when|do you|kya|kab|batao|bata do|dikhao)\b|क्या|कब|बताओ|बताइए|दिखाओ|\?/i;

export function detectType(text) {
  const t = ` ${String(text).toLowerCase()} `;
  let best = null;
  let len = 0;
  for (const [id, def] of Object.entries(TYPES)) {
    for (const k of def.kw) {
      const hit = /^[a-z ]+$/.test(k) ? new RegExp(`\\b${k}\\b`).test(t) : t.includes(k);
      if (hit && k.length > len) { best = id; len = k.length; }
    }
  }
  return best;
}

/**
 * "what's my PAN", "when does my licence expire", "mera passport number". Returns { type, field } or null.
 * Only fires when the sentence is clearly about the person's OWN document and asks for a detail.
 */
export function detectQuestion(text) {
  const s = String(text || '').trim();
  if (s.length < 4 || s.length > 120) return null;
  if (!ME.test(s) || !ASK.test(s)) return null;
  const type = detectType(s);
  if (!type) return null;
  let field = null;
  for (const f of ['expiry', 'dob', 'name', 'number']) if (FIELD_KW[f].some((re) => re.test(s))) { field = f; break; }
  // "what's my PAN?" with no field word means the number.
  return { type, field: field || 'number' };
}
