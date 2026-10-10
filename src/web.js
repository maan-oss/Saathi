// The Saathi web app: the same bot as WhatsApp, for people who do not use WhatsApp (or want to try it first).
// This file is only the channel. All the guiding, billing, scam checks and privacy rules stay in flow.js.
//
// Safety choices (each one is tested):
//  - No cookies and no accounts. The browser keeps a random session id; we store only a salted hash of it.
//  - Every POST needs a custom header, which browsers will not send cross-site, so other websites cannot make requests for you.
//  - Links in replies are only clickable when they are official (.gov.in, .nic.in, the two PAN partners) or our own payment page.
//    Anything else is shown as plain text with a warning, so a bad link can never be one tap away.
//  - Per-address limits on messages, uploads and new welcome credits; uploads are held in memory for 10 minutes and never saved.
//  - Strict content-security-policy: scripts and styles only from our own server.
import { createTools, ToolError } from './tools.js';
import { LinkError } from './link.js';
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyUrl, extractUrls, analyze, sensitiveKind } from './scamcheck.js';
import { t } from './messages.js';
import { SERVICES, LAST_VERIFIED, L10 } from './services.js';
import { balance, activePack, inr, freeLeft, freeAiLeft, grantTrial, rates, MIN_TOPUP_PAISE } from './billing.js';
import { SHIPPED_LANGS, langDef } from './i18n.js';
import { uiDict } from './uistrings.js';

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const MAX_UPLOAD = 6 * 1024 * 1024;
const MEDIA_TTL = 10 * 60 * 1000;

const STATIC = {
  '/fonts/instrument.woff2': ['fonts/instrument-sans-latin-standard-normal.woff2', 'font/woff2'],
  '/fonts/bricolage.woff2': ['fonts/bricolage-grotesque-latin-wght-normal.woff2', 'font/woff2'],
  '/': ['site.html', 'text/html; charset=utf-8'],
  '/app': ['index.html', 'text/html; charset=utf-8'],
  '/site.css': ['site.css', 'text/css; charset=utf-8'],
  '/site.js': ['site.js', 'text/javascript; charset=utf-8'],
  '/sky.js': ['sky.js', 'text/javascript; charset=utf-8'],
  '/og.png': ['og.png', 'image/png'],
  '/robots.txt': ['robots.txt', 'text/plain; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/screens.js': ['screens.js', 'text/javascript; charset=utf-8'],
  '/tools.js': ['tools.js', 'text/javascript; charset=utf-8'],
  '/guides.js': ['guides.js', 'text/javascript; charset=utf-8'],
  '/hark.js': ['hark.js', 'text/javascript; charset=utf-8'],
  '/hark.css': ['hark.css', 'text/css; charset=utf-8'],
  '/guides.css': ['guides.css', 'text/css; charset=utf-8'],
  '/polish.css': ['polish.css', 'text/css; charset=utf-8'],
  '/welcome.css': ['welcome.css', 'text/css; charset=utf-8'],
  '/screens.css': ['screens.css', 'text/css; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/favicon.ico': ['icon-192.png', 'image/png'],
  '/logo.svg': ['logo.svg', 'image/svg+xml'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png'],
  '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png'],
};

const LOGOS = new Map();
export const CSP = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";

export const isWebKey = (phoneKey) => typeof phoneKey === 'string' && phoneKey.startsWith('web:');

/** Uploads from the browser (photos, PDFs, voice notes). Held in memory only, gone after use or 10 minutes. */
export function createWebMedia() {
  const items = new Map();
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of items) if (v.exp < now) items.delete(k);
  };
  return {
    put(uid, buffer, mime) {
      sweep();
      const id = 'web_' + crypto.randomBytes(16).toString('hex');
      items.set(id, { uid, buffer, mime, exp: Date.now() + MEDIA_TTL });
      return id;
    },
    owns: (id, uid) => items.get(id)?.uid === uid,
    drop: (id) => items.delete(id),
    async take(id) {
      const v = items.get(id);
      items.delete(id);
      if (!v || v.exp < Date.now()) throw new Error('upload expired');
      return { buffer: v.buffer, mime: v.mime };
    },
    get size() {
      return items.size;
    },
  };
}

/** A small in-memory limiter: at most `max` hits per `windowMs` for each key. */
export function limiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      hits.set(key, arr);
      return false;
    }
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return true;
  };
}

const ALLOWED_UPLOAD = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf|audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)|video\/(webm|mp4))(;.*)?$/i;

export function createWeb({ store, config, media, converse, enqueue, shell = {}, llm = null, vault = null, guard = null, links = null, payments = null }) {
  const tools = vault && guard ? createTools({ store, vault, llm, guard, config }) : null;
  const okTool = limiter(120, 60_000);
  const okToolIp = limiter(600, 60_000);
  const okReveal = limiter(20, 60_000);
  const okJoin = limiter(8, 900_000);
  // One phone network can put many real people behind one address, so the address limit is generous; the per-person limit is the tight one.
  const okMsgIp = limiter(config.webMsgsPerMinIp ?? 120, 60_000);
  const okMsgUser = limiter(config.webMsgsPerMin ?? 20, 60_000);
  const okUpIp = limiter(config.webUploadsPerMinIp ?? 40, 60_000);
  const okUpUser = limiter(config.webUploadsPerMin ?? 10, 60_000);
  const okPoll = limiter(60, 60_000);
  const okCheck = limiter(30, 60_000);
  const newUsersByIp = new Map(); // ip -> [timestamps], for the welcome-credit cap
  const fileCache = new Map();

  const rawUidOf = (sid) => 'w' + crypto.createHmac('sha256', config.hashSalt).update('web:' + sid).digest('hex').slice(0, 23);
  // A device linked to an account works on that account's record.
  const uidOf = (sid) => (links ? links.resolve(rawUidOf(sid)) : rawUidOf(sid));
  const validSid = (s) => typeof s === 'string' && /^[a-f0-9]{32,64}$/.test(s);

  function ipOf(req) {
    if (config.trustProxy) {
      const xf = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (xf.length) return xf[xf.length - 1]; // the address our own proxy saw, not one the visitor typed
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function headers(res, extra = {}) {
    res.setHeader('content-security-policy', CSP);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('permissions-policy', 'microphone=(self), camera=(self), geolocation=()');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
    res.setHeader('cross-origin-opener-policy', 'same-origin');
    res.setHeader('cross-origin-resource-policy', 'same-origin');
    res.setHeader('x-permitted-cross-domain-policies', 'none');
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  }
  const json = (res, code, obj) => {
    headers(res, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.statusCode = code;
    res.end(JSON.stringify(obj));
  };

  function readRaw(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          reject(Object.assign(new Error('too_big'), { code: 'too_big' }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  /** Marks each link in a reply: official (clickable), payment (clickable, labelled), or not (shown as text with a warning). */
  function annotate(reply) {
    const text = typeof reply === 'string' ? reply : reply.body || reply.text || '';
    const links = {};
    for (const url of extractUrls(text)) {
      const c = classifyUrl(url);
      links[url] = { kind: c.kind, host: c.host };
    }
    if (typeof reply === 'string') return Object.keys(links).length ? { kind: 'text', body: reply, links } : reply;
    return Object.keys(links).length ? { ...reply, links } : reply;
  }

  /** In the app, a "Menu" button is noise: the sidebar is always there. */
  function stripMenu(r) {
    if (!r || typeof r === 'string') return r;
    if (r.kind === 'buttons' && Array.isArray(r.buttons)) {
      const buttons = r.buttons.filter((b) => b.id !== 'menu');
      return buttons.length ? { ...r, buttons } : { ...r, kind: 'text', buttons: undefined };
    }
    return r;
  }

  function prices() {
    const r = config.rates;
    if (!r) return null;
    const pk = r.packs && r.packs.pan_pack;
    const packs = Object.values(r.packs || {}).map((x) => ({ id: x.id, name: x.name || x.id, paise: x.paise, days: x.days, scans: x.scans, ai: x.ai, voice: x.voice || 0, remind: x.remind || 0 }));
    return { packs, freeAiPerDay: r.freeAiPerDay || 0, trialPaise: r.trialPaise, freeMsgsPerDay: r.freeMsgsPerDay, msgPaise: r.msgPaise, aiPaise: r.aiPaise, scanPaise: r.scanPaise, sheetPaise: r.sheetPaise, voicePaise: r.voicePaise, remindPaise: r.remindPaise, pack: pk ? { paise: pk.paise, days: pk.days, scans: pk.scans, ai: pk.ai, voice: pk.voice, remind: pk.remind } : null };
  }

  function serveStatic(req, res, url) {
    // Photos for the landing page: only plain file names from web/photos, nothing else.
    const photo = /^\/photos\/([a-z0-9-]+\.jpg)$/.exec(url.pathname);
    // Animation libraries for the landing page, copied into web/vendor (no CDN; the CSP is 'self' only).
    const vendor = /^\/vendor\/([A-Za-z]+(?:\.min)?\.js)$/.exec(url.pathname);
    const ent = photo ? [`photos/${photo[1]}`, 'image/jpeg'] : vendor ? [`vendor/${vendor[1]}`, 'text/javascript; charset=utf-8'] : STATIC[url.pathname];
    if (!ent) return false;
    const [file, type] = ent;
    let buf = fileCache.get(file);
    if (!buf || process.env.SAATHI_DEV) {
      const p = join(WEB_DIR, file);
      if (!existsSync(p)) return false;
      buf = readFileSync(p);
      fileCache.set(file, buf);
    }
    let body = buf;
    if (file === 'index.html' || file === 'app.js') body = Buffer.from(buf.toString('utf8').replaceAll('__WA_NUMBER__', shell.whatsappNumber || ''));
    headers(res, { 'content-type': type, 'cache-control': (file === 'sw.js' || /\.(js|css|html)$/.test(file)) ? 'no-cache' : file.startsWith('fonts/') ? 'public, max-age=31536000, immutable' : file.startsWith('photos/') ? 'public, max-age=2592000' : 'public, max-age=300' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  /** The web app has its own language screen, so the bot's own "choose a language" step is answered for the person, quietly. */
  async function ensureLang(uid, key, code, base) {
    const u = store.getUser(uid);
    if (u && u.lang) return;
    const name = code === 'hi' ? 'hindi' : code === 'en' ? 'english' : (langDef(code)?.en || 'english').toLowerCase();
    await converse({ key, userId: uid, input: { type: 'text', text: 'hi' }, ctx: base });
    await converse({ key, userId: uid, input: { type: 'text', text: name }, ctx: base });
    const v = store.getUser(uid);
    if (v && !v.lang) { v.lang = 'en'; v.state = 'menu'; store.putUser(uid, v); }
  }

  async function message(req, res, sid) {
    const uid = uidOf(sid);
    const ip = ipOf(req);
    if (!okMsgIp(ip) || !okMsgUser(uid)) return json(res, 429, { error: 'slow_down' });
    let b;
    try {
      b = JSON.parse((await readRaw(req, 20_000)).toString('utf8'));
    } catch {
      return json(res, 400, { error: 'bad_request' });
    }
    let input;
    if (b.type === 'text') input = { type: 'text', text: String(b.text || '').slice(0, 2000) };
    else if (b.type === 'reply') input = { type: 'reply', id: String(b.id || '').slice(0, 200), title: String(b.title || '').slice(0, 100) };
    else if (['image', 'document', 'voice'].includes(b.type)) {
      const id = String(b.mediaId || '');
      if (!media.owns(id, uid)) return json(res, 400, { error: 'upload_expired' });
      input = { type: b.type, mediaId: id, mime: String(b.mime || '').toLowerCase().slice(0, 80), filename: String(b.filename || '').slice(0, 120) };
    } else return json(res, 400, { error: 'bad_request' });
    if (input.type === 'text' && !input.text.trim()) return json(res, 400, { error: 'empty' });
    // What the chat screen knows: which service the person opened, and the last few turns (kept on their device, not here).
    const wctx = { ai: true };
    if (b.ctx && typeof b.ctx === 'object') {
      if (typeof b.ctx.svc === 'string' && SERVICES.some((x) => x.id === b.ctx.svc)) wctx.svc = b.ctx.svc;
      if (Array.isArray(b.ctx.hist)) wctx.hist = b.ctx.hist.slice(-10).filter((h) => h && (h.r === 'u' || h.r === 'a') && typeof h.t === 'string').map((h) => ({ r: h.r, t: h.t.slice(0, 600) }));
    }
    const wantLang = typeof b.lang === 'string' && (b.lang === 'en' || b.lang === 'hi' || langDef(b.lang)) ? b.lang : 'en';

    // Welcome credit is once per person, and at most a few new people per address per day, so a script cannot farm it.
    let trial;
    if (!store.getUser(uid) && !store.hadTrial?.(uid)) {
      const now = Date.now();
      const arr = (newUsersByIp.get(ip) || []).filter((t) => now - t < 86400000);
      if (arr.length >= (config.webNewPerIpPerDay ?? 5)) trial = false;
      else {
        arr.push(now);
        newUsersByIp.set(ip, arr);
      }
    }

    const phoneKey = 'web:' + uid;
    const out = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: true }), 60_000);
      enqueue(uid, async () => {
        const pre = [];
        try {
          const base = { phone: null, channel: 'web', trial, early: (rs) => pre.push(...rs) };
          await ensureLang(uid, phoneKey, wantLang, base);
          if (b.fresh === true) {
            // A new chat starts from the top, whatever the last chat was doing.
            const f = store.getUser(uid);
            if (f && f.lang && f.state !== 'menu') {
              for (const k of ['svc', 'ans', 'route', 'step', 'pending', 'await', 'next', 'fillKeys', 'fillIdx', 'backTo', 'pickFor', 'remType', 'remLabel']) delete f[k];
              f.state = 'menu';
              store.putUser(uid, f);
            }
          }
          const r = await converse({ key: phoneKey, userId: uid, input, ctx: { ...base, ...wctx } });
          resolve({ ...r, pre });
        } catch (e) {
          console.error('web message error:', e);
          resolve({ error: true });
        } finally {
          clearTimeout(timer);
        }
      });
    });
    if (input.mediaId) media.drop(input.mediaId); // whatever the bot did with it, it is not kept
    if (out.error) return json(res, 504, { error: 'timeout' });
    const u = store.getUser(uid);
    const open = store.activeHandoff(phoneKey);
    return json(res, 200, {
      replies: [...out.pre, ...(out.replies || [])].filter((r) => r && (typeof r === 'string' ? r : true)).map(annotate).map(stripMenu),
      wallet: u ? walletInfo(u) : null,
      human: open ? { status: open.status } : null,
    });
  }

  // ---- add money and packs, from the app ----
  // The server makes the payment and returns Stripe's page. The app sends the person there straight away.
  // "Paid" is only ever said by the server, from Stripe's signed webhook, for this one payment (see payStatus).
  function ensureUser(uid) {
    let u = store.getUser(uid);
    if (u) return u;
    u = { state: 'new', lang: null };
    if (store.hadTrial?.(uid)) u.trialGiven = true;
    else { grantTrial(u, config); store.markTrial?.(uid); }
    store.putUser(uid, u);
    return u;
  }
  async function topupStart(req, res, sid) {
    if (!okCheck(ipOf(req))) return json(res, 429, { error: 'slow_down' });
    if (!payments) return json(res, 503, { error: 'payments_off' });
    let b = {};
    try { b = JSON.parse((await readRaw(req, 2_000)).toString('utf8')); } catch { return json(res, 400, { error: 'bad_request' }); }
    const paise = Number(b.paise);
    const rt = rates(config);
    const okAmount = rt.topups.includes(paise) || (Number.isInteger(paise) && paise % 100 === 0 && paise >= MIN_TOPUP_PAISE && paise <= 500000);
    const packId = typeof b.pack === 'string' && rt.packs[b.pack] ? b.pack : null;
    if (!okAmount || (b.pack && !packId)) return json(res, 400, { error: 'bad_amount' });
    const uid = uidOf(sid);
    const before = balance(ensureUser(uid)); // what the person has before this payment (a new person's welcome credit included)
    const ref = `sv_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
    store.putPayment(ref, { userId: uid, paise, status: 'pending', ts: Date.now(), before, ...(packId ? { packId } : {}) });
    try {
      const { url } = await payments.createLink({ ref, paise, note: packId ? 'Saathi pack' : 'Saathi wallet top-up', origin: b.origin, pack: Boolean(packId) });
      return json(res, 200, { url, ref });
    } catch (e) {
      console.error('payment link error:', e.message);
      store.putPayment(ref, { userId: uid, paise, status: 'failed', ts: Date.now(), ...(packId ? { packId } : {}) });
      return json(res, 502, { error: 'stripe' });
    }
  }
  /** Where a payment stands. Only the person who started it can read it. */
  function payStatus(url, res, sid) {
    const ref = String(url.searchParams.get('ref') || '');
    const rec = /^sv_[a-z0-9]+$/.test(ref) ? store.getPayment(ref) : null;
    if (!rec || rec.userId !== uidOf(sid)) return json(res, 404, { error: 'not_found' });
    const u = store.getUser(rec.userId);
    json(res, 200, { status: rec.status, paise: rec.paise, before: Number.isInteger(rec.before) ? rec.before : null, pack: rec.packId || null, wallet: u ? walletInfo(u) : null });
  }
  function walletInfo(u) {
    const pack = activePack(u);
    return {
      balance: inr(balance(u)),
      paise: balance(u),
      freeLeft: config.rates ? freeLeft(u, config) : null,
      freeAiLeft: config.rates ? freeAiLeft(u, config) : null,
      pack: pack ? { id: pack.id, name: config.rates?.packs?.[pack.id]?.name || 'Saathi pack', until: pack.until, scans: pack.scans, ai: pack.ai, voice: pack.voice || 0, remind: pack.remind || 0 } : null,
      history: (u.wallet?.history || []).slice(-25).reverse().map((e) => ({ ts: e.ts, what: String(e.what || ''), paise: e.paise, bal: e.bal })),
    };
  }
  function accountInfo(u) {
    return {
      lang: u.lang || null,
      hasProfile: Boolean(u.vault),
      hasLocker: Boolean(u.locker),
      reminders: (u.reminders || []).map((r) => ({ label: String(r.label || ''), due: r.due })),
    };
  }

  async function upload(req, res, sid) {
    const uid = uidOf(sid);
    if (!okUpIp(ipOf(req)) || !okUpUser(uid)) return json(res, 429, { error: 'slow_down' });
    const mime = String(req.headers['content-type'] || '').toLowerCase();
    if (!ALLOWED_UPLOAD.test(mime)) return json(res, 415, { error: 'unsupported_type' });
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_UPLOAD) return json(res, 413, { error: 'too_big' });
    try {
      const buf = await readRaw(req, MAX_UPLOAD);
      if (!buf.length) return json(res, 400, { error: 'empty' });
      return json(res, 200, { mediaId: media.put(uid, buf, mime.split(';')[0]), mime: mime.split(';')[0] });
    } catch (e) {
      return json(res, e.code === 'too_big' ? 413 : 400, { error: e.code || 'bad_request' });
    }
  }

  function poll(req, res, url, sid) {
    const uid = uidOf(sid);
    if (!okPoll(uid)) return json(res, 429, { error: 'slow_down' });
    const since = Number(url.searchParams.get('since') || 0);
    const h = store.activeHandoff('web:' + uid);
    if (!h) return json(res, 200, { human: null, msgs: [] });
    const msgs = (h.thread || []).filter((m) => m.dir === 'out' && m.ts > since).map((m) => ({ ts: m.ts, text: m.text }));
    return json(res, 200, { human: { status: h.status }, msgs });
  }


  const deviceLabel = (ua = '') => {
    const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const o = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    return o ? `${b} on ${o}` : b;
  };
  const inQueue = (uid, ms, fn) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ err: new Error('timeout') }), ms);
      enqueue(uid, async () => {
        try {
          resolve({ data: await fn() });
        } catch (e) {
          resolve({ err: e });
        } finally {
          clearTimeout(timer);
        }
      });
    });
  const fail = (res, e) => {
    if (e instanceof ToolError || e instanceof LinkError) return json(res, e.code === 'paywall' ? 402 : 400, { ok: false, error: e.code, ...(e.extra || {}) });
    console.error('tool error:', e?.message);
    return json(res, e?.message === 'timeout' ? 504 : 500, { ok: false, error: e?.message === 'timeout' ? 'timeout' : 'server_error' });
  };

  /** The app's own pages: locker, details, reminders, applications, scan, synced extras. */
  async function tool(req, res, sid) {
    const uid = uidOf(sid);
    if (!tools) return json(res, 404, { ok: false, error: 'no_tools' });
    if (!okTool(uid) || !okToolIp(ipOf(req))) return json(res, 429, { ok: false, error: 'slow_down' });
    let b;
    try {
      b = JSON.parse((await readRaw(req, 320_000)).toString('utf8'));
    } catch {
      return json(res, 400, { ok: false, error: 'bad_request' });
    }
    const op = String(b.op || '');
    const args = b.args && typeof b.args === 'object' ? b.args : {};
    if (!tools.has(op)) return json(res, 400, { ok: false, error: 'unknown_op' });
    if (op === 'locker.reveal' && !okReveal(uid)) return json(res, 429, { ok: false, error: 'slow_down' });
    let out;
    if (op === 'scan') {
      const id = String(args.mediaId || '');
      if (!media.owns(id, uid)) return json(res, 400, { ok: false, error: 'upload_missing' });
      let file;
      try {
        file = await media.take(id);
      } catch {
        return json(res, 400, { ok: false, error: 'upload_missing' });
      }
      out = await inQueue(uid, 90_000, () => tools.run(uid, 'scan', { buffer: file.buffer, mime: file.mime, consent: args.consent === true }));
    } else out = await inQueue(uid, 15_000, () => tools.run(uid, op, args));
    if (out.err) return fail(res, out.err);
    const u = store.getUser(uid);
    return json(res, 200, { ok: true, data: out.data, wallet: u ? walletInfo(u) : null });
  }

  /** Linking devices and WhatsApp. See link.js for why this is safe. */
  async function link(req, res, sid) {
    if (!links) return json(res, 404, { ok: false, error: 'no_link' });
    const raw = rawUidOf(sid);
    const primary = uidOf(sid);
    const ip = ipOf(req);
    if (!okTool(primary) || !okToolIp(ip)) return json(res, 429, { ok: false, error: 'slow_down' });
    let b;
    try {
      b = JSON.parse((await readRaw(req, 2_000)).toString('utf8'));
    } catch {
      return json(res, 400, { ok: false, error: 'bad_request' });
    }
    const op = String(b.op || '');
    const label = deviceLabel(String(req.headers['user-agent'] || ''));
    const view = () => {
      const d = links.devices(primary, raw);
      return { ...d, waNumber: shell.whatsappNumber || null };
    };
    const out = await inQueue(primary, 15_000, async () => {
      if (op === 'devices') {
        if (!store.getUser(primary)) return { list: [{ id: raw, label, main: true, current: true }], wa: false, waNumber: shell.whatsappNumber || null };
        return view();
      }
      if (op === 'new' || op === 'phone') {
        if (!store.getUser(primary)) store.putUser(primary, { state: 'new', lang: null });
        return op === 'new' ? links.newDeviceCode(primary, label) : { ...links.newWaCode(primary), number: shell.whatsappNumber || null };
      }
      if (op === 'join') {
        if (b.confirm !== true) throw new LinkError('confirm');
        if (!okJoin(ip)) throw new LinkError('slow_down');
        links.joinDevice(b.code, raw, label);
        return { joined: true };
      }
      if (op === 'remove') {
        links.removeDevice(primary, String(b.id || ''));
        return view();
      }
      if (op === 'unlink') {
        links.unlinkSelf(raw);
        return { unlinked: true };
      }
      if (op === 'signout_others') {
        links.signOutOthers(primary, raw);
        return view();
      }
      if (op === 'wa_unlink') {
        links.unlinkWa(primary);
        return view();
      }
      throw new LinkError('unknown_op');
    });
    if (out.err) return fail(res, out.err);
    return json(res, 200, { ok: true, data: out.data });
  }

  /** Called by the server for every request. Returns true when the request was for the web app. */
  async function handle(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/app/api/')) return (req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, url);
    // Browsers will not add this header on a cross-site request without asking us first, and we never approve.
    if (req.method !== 'GET' && req.headers['x-saathi'] !== '1') {
      json(res, 403, { error: 'forbidden' });
      return true;
    }
    if (p === '/app/api/config' && req.method === 'GET') {
      json(res, 200, { whatsapp: shell.whatsappNumber ? `https://wa.me/${shell.whatsappNumber}?text=Hi` : null, whatsappNumber: shell.whatsappNumber || null, voice: Boolean(shell.voice), pay: Boolean(shell.pay), link: Boolean(links), tools: Boolean(tools), privacy: '/privacy', prices: prices(), topups: config.rates?.topups || [], languages: [{ code: 'en', native: 'English', en: 'English' }, { code: 'hi', native: 'हिन्दी', en: 'Hindi' }, ...SHIPPED_LANGS.map((l) => ({ code: l.code, native: l.native, en: l.en }))] });
      return true;
    }
    // Site logos for the sources screen. Only real icons pass: a missing one is a 404 so the page shows a letter badge instead of a generic arrow.
    if (p === '/app/api/logo' && req.method === 'GET') {
      const h = String(url.searchParams.get('host') || '').toLowerCase();
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+){1,4}$/.test(h) || h.length > 80) { json(res, 400, { ok: false }); return true; }
      let hit = LOGOS.get(h);
      if (!hit) {
        try {
          const r = await fetch('https://icons.duckduckgo.com/ip3/' + h + '.ico', { signal: AbortSignal.timeout(5000) });
          const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
          hit = buf && buf.length > 80 && buf.length < 200000 ? { type: r.headers.get('content-type') || 'image/x-icon', buf } : { none: true };
        } catch { hit = { none: true }; }
        if (LOGOS.size > 300) LOGOS.clear();
        LOGOS.set(h, hit);
      }
      if (hit.none) { res.writeHead(404, { 'cache-control': 'public, max-age=86400' }); res.end(); return true; }
      res.writeHead(200, { 'content-type': hit.type, 'cache-control': 'public, max-age=604800', 'x-content-type-options': 'nosniff' }); res.end(hit.buf);
      return true;
    }
    // Public facts for the landing page: what each service needs, straight from the same data the bot uses.
    if (p === '/app/api/services' && req.method === 'GET') {
      const lq = String(url.searchParams.get('lang') || 'en');
      const lg = lq === 'en' || lq === 'hi' || langDef(lq) ? lq : 'en';
      const clean = (x) => String(x || '').replace(/\*/g, '').trim();
      const list = SERVICES.filter((sv) => sv.fee && sv.docs).map((sv) => ({
        id: sv.id,
        name: L10(sv.name, lg),
        blurb: L10(sv.blurb, lg) || '',
        fee: clean(L10(sv.fee, lg)),
        docs: clean(L10(sv.docs, lg)).split('\n').map((l) => l.trim()).filter(Boolean),
        sites: (sv.sites || []).map((u) => String(u).trim().split(/\s+/)[0]).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h)).map((h) => 'https://' + h),
        unverified: sv.unverified || [],
      }));
      json(res, 200, { verified: LAST_VERIFIED, services: list });
      return true;
    }
    // The public "Is this real?" checker on the landing page. Same rules as the bot, nothing stored, nothing opened.
    if (p === '/app/api/check' && req.method === 'POST') {
      if (!okCheck(ipOf(req))) return json(res, 429, { error: 'slow_down' }), true;
      let b;
      try { b = JSON.parse((await readRaw(req, 4_000)).toString('utf8')); } catch { return json(res, 400, { error: 'bad_request' }), true; }
      const text = String(b.text || '').slice(0, 1500).trim();
      if (text.length < 4) return json(res, 400, { error: 'empty' }), true;
      const lg = b.lang === 'hi' || (typeof b.lang === 'string' && langDef(b.lang)) ? b.lang : 'en';
      const sens = sensitiveKind(text);
      if (sens) return json(res, 200, { level: 'private', headline: t(lg, 'sensitive_warn', { what: t(lg, 'sensitive_k_' + sens) }), lines: [], advice: '' }), true;
      const a = analyze(text);
      const lines = a.urls.map((x) => ({ kind: x.kind, text: t(lg, 'scam_u_' + x.kind, { host: x.host.slice(0, 60) }) }));
      for (const r of a.reasons.filter((r) => r !== 'shortener' && r !== 'unknown_site')) lines.push({ kind: 'reason', text: t(lg, 'scam_r_' + r) });
      json(res, 200, { level: a.level, headline: t(lg, 'scam_v_' + a.level), lines, advice: a.level !== 'none' ? t(lg, 'scam_advice_' + a.level) : '' });
      return true;
    }
    if (p === '/app/api/ui' && req.method === 'GET') {
      const code = String(url.searchParams.get('lang') || 'en');
      if (!(code === 'en' || code === 'hi' || langDef(code))) return json(res, 400, { error: 'bad_lang' }), true;
      if (!okCheck(ipOf(req))) return json(res, 429, { error: 'slow_down' }), true;
      json(res, 200, { lang: code, strings: await uiDict(code, { llm, store }) });
      return true;
    }
    const sid = String(req.headers['x-session'] || '');
    if (!validSid(sid)) {
      json(res, 400, { error: 'no_session' });
      return true;
    }
    try {
      if (p === '/app/api/message' && req.method === 'POST') await message(req, res, sid);
      else if (p === '/app/api/upload' && req.method === 'POST') await upload(req, res, sid);
      else if (p === '/app/api/t' && req.method === 'POST') await tool(req, res, sid);
      else if (p === '/app/api/link' && req.method === 'POST') await link(req, res, sid);
      else if (p === '/app/api/poll' && req.method === 'GET') poll(req, res, url, sid);
      else if (p === '/app/api/topup' && req.method === 'POST') await topupStart(req, res, sid);
      else if (p === '/app/api/pay' && req.method === 'GET') payStatus(url, res, sid);
      else if (p === '/app/api/lang' && req.method === 'POST') {
        let b2 = {};
        try { b2 = JSON.parse((await readRaw(req, 1_000)).toString('utf8')); } catch { /* falls to bad_lang */ }
        const code = String(b2.code || '');
        if (!(code === 'en' || code === 'hi' || langDef(code))) return json(res, 400, { error: 'bad_lang' }), true;
        const uid = uidOf(sid);
        const key = 'web:' + uid;
        const done = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 90_000);
          enqueue(uid, async () => {
            try {
              const base = { phone: null, channel: 'web', early: () => {} };
              const had = store.getUser(uid);
              if (!had || !had.lang) await ensureLang(uid, key, code, base);
              else await converse({ key, userId: uid, input: { type: 'reply', id: 'lang_' + code, title: '' }, ctx: base });
              resolve(true);
            } catch (e) {
              console.error('web lang error:', e.message);
              resolve(false);
            } finally { clearTimeout(timer); }
          });
        });
        const u = store.getUser(uid);
        json(res, done ? 200 : 504, { ok: done, lang: u?.lang || null, account: u ? accountInfo(u) : null });
      } else if (p === '/app/api/me' && req.method === 'GET') {
        const u = store.getUser(uidOf(sid));
        json(res, 200, { wallet: u ? walletInfo(u) : null, account: u ? accountInfo(u) : null });
      } else json(res, 404, { error: 'not_found' });
    } catch (e) {
      console.error('web error:', e.message);
      if (!res.headersSent) json(res, 500, { error: 'server_error' });
    }
    return true;
  }

  return { handle, uidOf, annotate };
}
