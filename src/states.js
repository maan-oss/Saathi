// Every Indian state and union territory, with the ways people write them (short forms, Hindi, old names, common
// misspellings). No dependencies, so profile.js and services.js can both use it.
// Each entry: [id, English name, Hindi name, ...aliases]. Ids for the twelve states that have a portal on file
// (see services.js) are kept as they were.
export const ALL_STATES = [
  ['ap', 'Andhra Pradesh', 'आंध्र प्रदेश', 'andhra', 'a.p.'],
  ['ar', 'Arunachal Pradesh', 'अरुणाचल प्रदेश', 'arunachal'],
  ['as', 'Assam', 'असम', 'asom'],
  ['br', 'Bihar', 'बिहार'],
  ['ct', 'Chhattisgarh', 'छत्तीसगढ़', 'chattisgarh', 'chhatisgarh', 'cg'],
  ['ga', 'Goa', 'गोवा'],
  ['gj', 'Gujarat', 'गुजरात', 'gujrat'],
  ['hr', 'Haryana', 'हरियाणा', 'hariyana'],
  ['hp', 'Himachal Pradesh', 'हिमाचल प्रदेश', 'himachal', 'hp'],
  ['jh', 'Jharkhand', 'झारखंड', 'jharkhand'],
  ['ka', 'Karnataka', 'कर्नाटक', 'karnatak', 'mysore state'],
  ['kl', 'Kerala', 'केरल', 'keralam', 'kerela'],
  ['mp', 'Madhya Pradesh', 'मध्य प्रदेश', 'm.p.'],
  ['mh', 'Maharashtra', 'महाराष्ट्र', 'maharastra', 'maharashtra state'],
  ['mn', 'Manipur', 'मणिपुर'],
  ['ml', 'Meghalaya', 'मेघालय'],
  ['mz', 'Mizoram', 'मिजोरम'],
  ['nl', 'Nagaland', 'नागालैंड'],
  ['od', 'Odisha', 'ओडिशा', 'orissa', 'odissa', 'उड़ीसा'],
  ['pb', 'Punjab', 'पंजाब'],
  ['rj', 'Rajasthan', 'राजस्थान', 'rajsthan', 'rajastan'],
  ['sk', 'Sikkim', 'सिक्किम'],
  ['tn', 'Tamil Nadu', 'तमिलनाडु', 'tamilnadu', 'tamil nadu state', 'madras state'],
  ['ts', 'Telangana', 'तेलंगाना', 'telengana', 'telangna'],
  ['tr', 'Tripura', 'त्रिपुरा'],
  ['up', 'Uttar Pradesh', 'उत्तर प्रदेश', 'u.p.'],
  ['uk', 'Uttarakhand', 'उत्तराखंड', 'uttaranchal', 'uttrakhand'],
  ['wb', 'West Bengal', 'पश्चिम बंगाल', 'bengal', 'paschim banga'],
  ['an', 'Andaman and Nicobar Islands', 'अंडमान और निकोबार द्वीप समूह', 'andaman', 'nicobar', 'andaman & nicobar'],
  ['ch', 'Chandigarh', 'चंडीगढ़'],
  ['dn', 'Dadra and Nagar Haveli and Daman and Diu', 'दादरा और नगर हवेली और दमन और दीव', 'daman and diu', 'dadra and nagar haveli', 'daman', 'diu', 'dadra'],
  ['dl', 'Delhi', 'दिल्ली', 'new delhi', 'nct of delhi', 'delhi ncr', 'ncr'],
  ['jk', 'Jammu and Kashmir', 'जम्मू और कश्मीर', 'jammu', 'kashmir', 'j&k', 'jammu & kashmir'],
  ['la', 'Ladakh', 'लद्दाख', 'leh'],
  ['ld', 'Lakshadweep', 'लक्षद्वीप'],
  ['py', 'Puducherry', 'पुडुचेरी', 'pondicherry', 'pondy'],
];

export const STATE_NAMES = ALL_STATES.map((s) => s[1]);

const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Edit distance, stopping early once it is clearly above `max`. */
export function distance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const NAMES = ALL_STATES.flatMap((s) => [s[1], s[2], ...s.slice(3)].map((n) => ({ id: s[0], n: norm(n) })));

/** Finds the state or union territory a text names. Forgives spelling slips, short forms and other scripts.
 *  Returns { id, name, hi } or null. Does not guess: a name that is not close to a real one is null. */
export function findState(text) {
  const s = norm(text);
  if (!s) return null;
  const pick = (id) => {
    const r = ALL_STATES.find((x) => x[0] === id);
    return r ? { id: r[0], name: r[1], hi: r[2] } : null;
  };
  const exact = NAMES.find((x) => x.n === s) || (s.length === 2 ? ALL_STATES.find((x) => x[0] === s) && { id: s } : null);
  if (exact) return pick(exact.id);
  // A sentence such as "i live in tamil nadu": the longest known name inside it wins.
  const inside = NAMES.filter((x) => x.n.length > 3 && (` ${s} `).includes(` ${x.n} `)).sort((a, b) => b.n.length - a.n.length)[0];
  if (inside) return pick(inside.id);
  // Spelling slips: one edit for short words, two for longer ones. Two states must not tie.
  const max = s.length >= 9 ? 2 : s.length >= 5 ? 1 : 0;
  if (!max) return null;
  const scored = NAMES.map((x) => ({ id: x.id, d: distance(s, x.n, max) })).filter((x) => x.d <= max).sort((a, b) => a.d - b.d);
  if (!scored.length) return null;
  const ids = new Set(scored.filter((x) => x.d === scored[0].d).map((x) => x.id));
  return ids.size === 1 ? pick(scored[0].id) : null;
}
