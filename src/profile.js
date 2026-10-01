// The saved profile ("who you are"): what government forms commonly ask for, nothing more.
// The profile holds what forms commonly ask for. ID numbers live separately in the locker (src/locker.js).

import { findState } from './states.js';

export const FIELDS = [
  { key: 'full_name', type: 'text', label: { en: 'Full name (as on Aadhaar)', hi: 'पूरा नाम (आधार जैसा)' } },
  { key: 'dob', type: 'date', label: { en: 'Date of birth', hi: 'जन्मतिथि' } },
  { key: 'father_name', type: 'text', label: { en: "Father's name", hi: 'पिता का नाम' } },
  { key: 'gender', type: 'choice', options: ['male', 'female', 'other'], label: { en: 'Gender', hi: 'लिंग' } },
  { key: 'state', type: 'text', label: { en: 'State', hi: 'राज्य' } },
  { key: 'address', type: 'longtext', label: { en: 'Address', hi: 'पता' } },
  { key: 'pincode', type: 'pin', label: { en: 'PIN code', hi: 'पिन कोड' } },
  { key: 'mother_name', type: 'text', label: { en: "Mother's name", hi: 'माता का नाम' } },
  { key: 'mobile', type: 'phone', label: { en: 'Mobile number', hi: 'मोबाइल नंबर' } },
  { key: 'email', type: 'email', label: { en: 'Email', hi: 'ईमेल' } },
];

export const GENDER = {
  male: { en: 'Male', hi: 'पुरुष' },
  female: { en: 'Female', hi: 'महिला' },
  other: { en: 'Other', hi: 'अन्य' },
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function validDate(d, m, y, now) {
  if (y < 1900 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (dt.getTime() > now) return null;
  const p = (n, w) => String(n).padStart(w, '0');
  return `${p(d, 2)}/${p(m, 2)}/${p(y, 4)}`;
}

/** Accepts DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD (WhatsApp date picker), "5 Feb 1990". Returns DD/MM/YYYY or null. */
export function normDob(input, now = Date.now()) {
  const s = String(input ?? '').trim();
  let m = s.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/);
  if (m) return validDate(+m[1], +m[2], +m[3], now);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDate(+m[3], +m[2], +m[1], now);
  m = s.toLowerCase().match(/^(\d{1,2})\s*([a-z]{3})[a-z]*\.?,?\s*(\d{4})$/);
  if (m && MONTHS.includes(m[2])) return validDate(+m[1], MONTHS.indexOf(m[2]) + 1, +m[3], now);
  return null;
}

export function ageYears(dobDDMMYYYY, now = Date.now()) {
  const m = String(dobDDMMYYYY).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const n = new Date(now);
  let a = n.getUTCFullYear() - +m[3];
  if (n.getUTCMonth() + 1 < +m[2] || (n.getUTCMonth() + 1 === +m[2] && n.getUTCDate() < +m[1])) a--;
  return a;
}

const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Validate one field. Returns the clean value, or null if it is not acceptable. */
export function normField(key, value, now = Date.now()) {
  const v = tidy(value);
  switch (key) {
    case 'full_name':
    case 'father_name':
    case 'mother_name': {
      if (v.length < 2 || v.length > 80) return null;
      if (/\d/.test(v)) return null;
      // Only fix names typed all lower or all upper case; leave mixed case alone.
      if (v === v.toLowerCase() || v === v.toUpperCase()) return v.toLowerCase().replace(/(^|[\s'-])(\S)/g, (_, a, b) => a + b.toUpperCase());
      return v;
    }
    case 'dob':
      return normDob(value, now);
    case 'gender': {
      const g = v.toLowerCase();
      if (['male', 'm', 'पुरुष'].includes(g)) return 'male';
      if (['female', 'f', 'महिला'].includes(g)) return 'female';
      if (['other', 'o', 'transgender', 'अन्य'].includes(g)) return 'other';
      return null;
    }
    case 'state':
      return findState(v)?.name || null;
    case 'address':
      return v.length >= 8 && v.length <= 250 ? v : null;
    case 'pincode': {
      const d = v.replace(/\s/g, '');
      return /^[1-9]\d{5}$/.test(d) ? d : null;
    }
    case 'mobile': {
      const d = v.replace(/[\s-]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '');
      return /^[6-9]\d{9}$/.test(d) ? d : null;
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 100 ? v.toLowerCase() : null;
    default:
      return null;
  }
}

/** Clean a bag of values: keeps only known fields that pass validation. Returns { clean, bad: [keys] }. */
export function normAll(values = {}, now = Date.now()) {
  const clean = {};
  const bad = [];
  for (const f of FIELDS) {
    const raw = values[f.key];
    if (raw === undefined || raw === null || tidy(raw) === '') continue;
    const n = normField(f.key, raw, now);
    if (n === null) bad.push(f.key);
    else clean[f.key] = n;
  }
  return { clean, bad };
}

/** Keys still empty. Pass `wanted` (a service's sheet keys) to look only at what that form needs. */
export const missingKeys = (profile, wanted = null) =>
  FIELDS.filter((f) => (!wanted || wanted.includes(f.key)) && !profile[f.key]).map((f) => f.key);
export const fieldDef = (key) => FIELDS.find((f) => f.key === key);
export const shown = (f, value, lang) => (f.key === 'gender' ? GENDER[value]?.[lang] || value : value);

/** Maps what the AI reads off a document to our field keys. Never includes ID numbers. */
export function fromExtraction(r = {}) {
  const f = r.fields || {};
  return {
    full_name: f.name ?? f.full_name ?? r.name,
    dob: f.dob ?? r.dob,
    father_name: f.father_name,
    gender: f.gender,
    address: f.address,
    pincode: f.pincode,
  };
}
