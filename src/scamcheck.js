// Scam shield. Pure functions, no network, no AI, no cost. Three jobs:
//   analyze(text)        is this link / message a known kind of trap?
//   sensitiveKind(text)  is someone typing an Aadhaar, card, PAN number or OTP into the chat?
//   redact(text)         the same text with those numbers hidden (used before anything is logged)
//
// The rule for links is strict on purpose. Indian government services live on .gov.in and .nic.in sites. The only
// non-government addresses we call official are the two PAN partners (Protean, UTIITSL). Everything else is
// "not confirmed", and anything that imitates an official name without being official is called out as a trap.

export const OFFICIAL_SUFFIXES = ['gov.in', 'nic.in', 'utiitsl.com', 'proteantech.in'];
export const PAYMENT_HOSTS = ['razorpay.com', 'rzp.io']; // Saathi's own top-up links come from here
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'ow.ly', 'buff.ly', 'tiny.cc', 'wa.me', 't.me', 'rebrand.ly', 'lnkd.in', 'bl.ink', 'v.gd']);
const RISKY_TLDS = new Set(['xyz', 'top', 'click', 'live', 'icu', 'cyou', 'cfd', 'sbs', 'buzz', 'vip', 'rest', 'tk', 'ml', 'ga', 'cf', 'gq', 'pw', 'site', 'online', 'shop', 'work', 'life', 'today', 'help', 'support', 'link', 'loan', 'win', 'bid']);
const KNOWN_TLDS = 'com|in|org|net|co|gov|nic|edu|info|biz|io|me|app|cc|us|uk|ru|cn|ly|to|ws|' + [...RISKY_TLDS].join('|');

// Words that make a non-official address look official. Short ones must match a whole part of the name.
const BRAND_LONG = ['aadhaar', 'aadhar', 'uidai', 'incometax', 'income-tax', 'passport', 'parivahan', 'sarathi', 'voter', 'digilocker', 'umang', 'nsdl', 'protean', 'utiitsl', 'echallan', 'epfo', 'sarkari', 'mparivahan', 'indiagov', 'govt', 'egov'];
const BRAND_SHORT = ['pan', 'gst', 'eci', 'itr', 'rto', 'epic', 'gov', 'kyc', 'epan', 'e-pan', 'nic', 'dl'];

const URL_RE = new RegExp(String.raw`(?:https?:\/\/|www\.)[^\s<>"'()]+|(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:${KNOWN_TLDS})(?![a-z0-9-])(?:\/[^\s<>"'()]*)?`, 'gi');

export function extractUrls(text) {
  const out = [];
  for (const m of String(text || '').matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/g, '');
    if (url.length > 3 && !out.includes(url)) out.push(url);
  }
  return out.slice(0, 5);
}

export function hostOf(url) {
  let s = url.trim();
  const hadScheme = /^https?:\/\//i.test(s);
  const scheme = hadScheme ? s.slice(0, s.indexOf(':')).toLowerCase() : '';
  s = s.replace(/^https?:\/\//i, '').replace(/^\/\//, '');
  const authority = s.split(/[/?#]/)[0];
  const userinfo = authority.includes('@');
  let host = authority.split('@').pop().replace(/:\d+$/, '').toLowerCase().replace(/\.+$/, '');
  if (host.startsWith('[')) host = host.replace(/^\[|\]$/g, '');
  return { host, userinfo, scheme, path: s.slice(authority.length) };
}

const endsWithDomain = (host, d) => host === d || host.endsWith('.' + d);
export const isOfficialHost = (host) => OFFICIAL_SUFFIXES.some((d) => endsWithDomain(host, d));

/** One address -> { url, host, kind, reasons[] }. kind: official | payment | shortener | trap | unknown */
export function classifyUrl(url) {
  const { host, userinfo, scheme, path } = hostOf(url);
  const reasons = [];
  let kind = 'unknown';
  if (userinfo) reasons.push('userinfo');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) reasons.push('ip');
  if (host.split('.').some((p) => p.startsWith('xn--'))) reasons.push('punycode');
  if (/\.apk(\?|$)/i.test(path) || /\.apk$/i.test(host)) reasons.push('apk');
  if (scheme === 'http') reasons.push('no_https');
  if (reasons.some((r) => ['userinfo', 'ip', 'punycode', 'apk'].includes(r))) kind = 'trap';
  else if (PAYMENT_HOSTS.some((d) => endsWithDomain(host, d))) kind = 'payment';
  else if (SHORTENERS.has(host)) {
    kind = 'shortener';
    reasons.push('shortener');
  } else if (isOfficialHost(host)) kind = 'official';
  else {
    const labels = host.split('.');
    const tld = labels[labels.length - 1];
    const body = labels.slice(0, -1).join('.');
    const parts = body.split(/[-.]/);
    const brand = BRAND_LONG.some((b) => body.includes(b)) || BRAND_SHORT.some((b) => parts.includes(b) || body.split('.').includes(b));
    if (brand) {
      kind = 'trap';
      reasons.push('lookalike');
    } else {
      reasons.push('unknown_site');
      if (RISKY_TLDS.has(tld)) reasons.push('risky_tld');
    }
  }
  if (kind === 'official' && scheme === 'http') kind = 'unknown'; // an official name over plain http is not something to trust
  return { url, host, kind, reasons };
}

// ---- wording rules (English, Hindi and Hinglish) -----------------------------------------
const RULES = [
  { code: 'share_otp', level: 2, re: /\b(share|send|tell|give|forward|read out|batao|bata do|bhejo|de do)\b[^.\n]{0,30}\b(otp|pin|cvv|password|passcode|upi pin)\b|\b(otp|pin|cvv)\b[^.\n]{0,20}\b(share|send|tell|give|batao|bata|bhejo|bhej|de do|dedo)\b|ओटीपी[^.\n]{0,20}(बताओ|बताएं|भेजो|दो|शेयर)/i },
  { code: 'threat', level: 2, re: /\b(pan|aadhaar|aadhar|account|sim|licen[cs]e|passport|gst|kyc)\b[^.\n]{0,50}\b(block(ed)?|suspend(ed)?|deactivat\w*|cancel(led)?|invalid|banned|will expire)\b[^.\n]{0,60}\b(today|immediately|urgent\w*|within \d+ ?(hours?|hrs?)|24 ?(hours?|hrs?)|last chance|now)\b/i },
  { code: 'threat_soft', level: 1, re: /\b(pan|aadhaar|aadhar|account|sim|licen[cs]e|passport|gst|kyc)\b[^.\n]{0,50}\b(block(ed)?|suspend(ed)?|deactivat\w*|invalid|banned)\b/i },
  { code: 'fee_to_release', level: 2, re: /\b(pay|deposit|send|transfer)\b[^.\n]{0,40}(₹|rs\.?|inr)\s?\d[^.\n]{0,60}\b(processing|verification|clearance|customs|release|refund|penalty|fine|challan|token|advance|registration)\b|\b(processing|verification|clearance|customs|release|advance) (fee|charge)s?\b[^.\n]{0,40}(₹|rs\.?|inr)\s?\d/i },
  { code: 'prize', level: 2, re: /\b(lottery|jackpot|lucky draw|you (have )?won|cash ?back of|claim (your )?(prize|reward|refund)|refund of (₹|rs))/i },
  { code: 'remote_access', level: 2, re: /\b(anydesk|teamviewer|quick ?support|rustdesk|screen ?shar\w*|alpemix|ammyy)\b/i },
  { code: 'arrest', level: 2, re: /\b(digital arrest|cbi (officer|case|notice)|ed (officer|notice)|narcotics|(police|cyber ?crime|customs)[^.\n]{0,40}(arrest|case against|warrant)|parcel[^.\n]{0,40}(drugs|seized|illegal)|fedex[^.\n]{0,40}(drugs|seized))\b/i },
  { code: 'install_app', level: 2, re: /\b(download|install)\b[^.\n]{0,40}\b(apk|this app|the app)\b[^.\n]{0,60}\b(update|kyc|verify|verification|claim|refund)\b|\.apk\b/i },
  { code: 'upi_trick', level: 2, re: /\b(collect request|accept the request|approve the request|scan (this )?qr[^.\n]{0,30}(receive|refund|get money)|send (me )?(₹|rs\.?|money)[^.\n]{0,20}(verify|test))/i },
  { code: 'no_test', level: 2, re: /\b(licen[cs]e|passport|pan)\b[^.\n]{0,40}\b(without (a )?(test|exam|appointment|police verification|documents)|100 ?% guarantee|guaranteed in \d+)\b|\bwithout (driving )?test\b|\bno need to (go|visit|appear)\b/i },
  { code: 'agent_offer', level: 1, re: /\b(i|we) (can|will) (get|do|arrange)\b[^.\n]{0,40}\b(licen[cs]e|passport|pan|aadhaar|certificate)\b[^.\n]{0,40}\b(for|in)\b[^.\n]{0,20}(₹|rs\.?|\d+ ?days?)|\bagent\b[^.\n]{0,30}\b(will|can) (get|do|arrange)\b/i },
  { code: 'send_docs', level: 1, re: /\b(send|share|whatsapp|upload)\b[^.\n]{0,30}\b(your |ur )?(aadhaar|aadhar|pan card|passport|documents?|selfie|photo)\b[^.\n]{0,40}\b(to (this|my|the) number|on (this )?whatsapp|to verify|for verification|here)\b/i },
  { code: 'urgency', level: 1, re: /\b(act now|last date (is )?today|expires? today|final (notice|warning)|within (1|2|3|24|48) ?(hours?|hrs?)|immediately or|urgent action)\b/i },
  { code: 'kyc_link', level: 1, re: /\b(update|complete|verify)\b[^.\n]{0,15}\b(your )?(re-?)?kyc\b/i },
];

/**
 * Looks at a message and answers { level, urls[], reasons[] }.
 *   level: 'none' (nothing to check) | 'safe' | 'caution' | 'danger'
 * reasons are codes; the bot turns each into a plain sentence in the person's language.
 */
export function analyze(text) {
  const t = String(text || '');
  const urls = extractUrls(t).map(classifyUrl);
  const reasons = new Set();
  let score = 0; // 0 fine, 1 caution, 2 danger
  for (const u of urls) {
    for (const r of u.reasons) reasons.add(r);
    if (u.kind === 'trap') score = Math.max(score, 2);
    else if (u.kind === 'shortener' || u.kind === 'unknown') score = Math.max(score, 1);
    if (u.reasons.includes('no_https')) score = Math.max(score, 1);
  }
  for (const rule of RULES) {
    if (rule.re.test(t)) {
      if (rule.code === 'threat_soft' && reasons.has('threat')) continue;
      reasons.add(rule.code);
      score = Math.max(score, rule.level);
    }
  }
  if (reasons.has('threat')) reasons.delete('threat_soft');
  if (reasons.has('risky_tld') && score < 1) score = 1;
  const allOfficial = urls.length > 0 && urls.every((u) => u.kind === 'official' || u.kind === 'payment');
  let level = score >= 2 ? 'danger' : score === 1 ? 'caution' : urls.length ? (allOfficial ? 'safe' : 'caution') : 'none';
  return { level, urls, reasons: [...reasons] };
}


// ---- numbers nobody should type into a chat ---------------------------------------------
const luhn = (digits) => {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};
const AADHAAR_RE = /(?<!\d)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;
const CARD_RE = /(?<!\d)\d(?:[\s-]?\d){12,18}(?!\d)/g;
const PAN_RE = /\b[A-Za-z]{3}[PCHFATBLJG][A-Za-z]\d{4}[A-Za-z]\b/g;
const OTP_RE = /\b(otp|one time password|verification code|ओटीपी)\b\D{0,15}\d{4,8}\b/gi;

const looksLikeMobile = (raw) => {
  const d = raw.replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') && /[6-9]/.test(d[2]);
};

/** Returns 'aadhaar' | 'card' | 'pan' | 'otp' | null. `allowMobile` is true while the bot itself is asking for a phone number. */
export function sensitiveKind(text, { allowMobile = false } = {}) {
  const t = String(text || '');
  if (OTP_RE.test(t)) {
    OTP_RE.lastIndex = 0;
    return 'otp';
  }
  OTP_RE.lastIndex = 0;
  for (const m of t.matchAll(CARD_RE)) {
    const d = m[0].replace(/\D/g, '');
    if (d.length >= 13 && d.length <= 19 && luhn(d)) return 'card';
  }
  for (const m of t.matchAll(AADHAAR_RE)) {
    if (allowMobile && looksLikeMobile(m[0])) continue;
    if (/^\+/.test(t.trim()) && looksLikeMobile(m[0])) continue;
    return 'aadhaar';
  }
  if (PAN_RE.test(t)) {
    PAN_RE.lastIndex = 0;
    return 'pan';
  }
  PAN_RE.lastIndex = 0;
  return null;
}

/** Hides ID, card and OTP numbers so they never reach a log or an operator's screen. */
export function redact(text) {
  return String(text || '')
    .replace(OTP_RE, (m) => m.replace(/\d/g, '•'))
    .replace(CARD_RE, (m) => (luhn(m.replace(/\D/g, '')) ? '••••••••••••' : m))
    .replace(AADHAAR_RE, '••••-••••-••••')
    .replace(PAN_RE, '••••••••••');
}
