import http from 'node:http';
import crypto from 'node:crypto';
import { config } from './config.js';
import { Store } from './store.js';
import { CostGuard } from './costguard.js';
import { createLlm } from './llm.js';
import { createWhatsApp, parseInbound } from './whatsapp.js';
import { createBot } from './flow.js';
import { createVault } from './vault.js';
import { createPayments, validStripeSignature, parsePaidEvent } from './payments.js';
import { t } from './messages.js';
import { inr, credit } from './billing.js';
import { createConverse } from './converse.js';
import { createWeb, createWebMedia, isWebKey } from './web.js';
import { diagnose } from './doctor.js';
import { SETUP_HTML } from './setup-page.js';
import { createStt } from './stt.js';
import { createTranslator } from './translate.js';
import { createScheduler } from './scheduler.js';
import { INBOX_HTML } from './inbox.js';
import { createLiveFacts } from './livefacts.js';
import { createLinks } from './link.js';
import { R } from './rich.js';

const store = new Store(config.dataDir);
const guard = new CostGuard(store, config);
const llm = createLlm(config);
const wa = createWhatsApp(config);
const vault = createVault(config.vaultKey);
const payments = config.paymentsPaused ? null : createPayments(config);
const stt = createStt(config);
// A key pasted into the admin page is kept sealed (AES-GCM, key from VAULT_KEY) and re-applied at every start.
const aiKeySource = () => (store.getSetting('aiKey') ? 'saved' : process.env.OPENROUTER_API_KEY ? 'env' : 'none');
{
  const sealed = store.getSetting('aiKey');
  if (sealed) vault.open(sealed).then((o) => { if (o?.key) llm.setKey(o.key); });
}
const links = createLinks({ store, config, vault });
const translator = createTranslator({ llm, store, guard, config });
translator.loadCached();
const webMedia = createWebMedia();
const downloadMedia = (id) => (String(id).startsWith('web_') ? webMedia.take(id) : wa.downloadMedia(id));
const bot = createBot({ store, guard, llm, config, downloadMedia, vault, payments, stt, translator });
const converse = createConverse({ store, bot });

// We never key stored state by raw phone number.
const hashPhone = (phone) => crypto.createHmac('sha256', config.hashSalt).update(phone).digest('hex').slice(0, 24);

// Process one user's messages strictly in order (two quick messages must not race on state).
const queues = new Map();
function enqueue(userId, fn) {
  const prev = queues.get(userId) || Promise.resolve();
  const next = prev.then(fn).catch((e) => console.error('message error:', e)).finally(() => {
    if (queues.get(userId) === next) queues.delete(userId);
  });
  queues.set(userId, next);
}

async function sendReplies(phone, replies) {
  for (const reply of replies) {
    if (!guard.msgAllowed()) {
      console.warn('Spend cap reached: not sending. Stats:', guard.stats());
      break;
    }
    const n = await wa.send(phone, reply);
    for (let i = 0; i < n; i++) guard.recordMsg();
    if (!n) break;
  }
}

async function processMessage(msg) {
  if (!msg?.id || !msg.from || store.seenBefore(msg.id)) return;
  const phone = msg.from;
  const phoneUid = hashPhone(phone);
  const input = parseInbound(msg);

  // "LINK ABCD-EFGH" joins this phone to a Saathi account made in the app. It needs a Yes from this same phone.
  const txt = input.type === 'text' ? String(input.text || '') : '';
  const lm = /^\s*link[\s:]+([A-Za-z0-9\- ]{8,14})\s*$/i.exec(txt);
  const linkTap = input.type === 'reply' && (input.id === 'link_yes' || input.id === 'link_no') && links.waPendingFor(phoneUid);
  if (lm || linkTap) {
    return enqueue(phoneUid, async () => {
      try {
        if (lm) {
          links.waStart(lm[1], phoneUid);
          await sendReplies(phone, [R.buttons('Someone asked to link this WhatsApp to a Saathi account in the app. Only say Yes if that was you.\n\nक्या यह आपने किया? तभी हाँ कहें।', [{ id: 'link_yes', title: 'Yes, link / हाँ' }, { id: 'link_no', title: 'No / नहीं' }])]);
        } else if (input.id === 'link_yes') {
          await links.waConfirm(phoneUid, phone);
          await sendReplies(phone, ['Linked. Your reminders will come here, and your locker, details and wallet are shared with the app.\n\nजुड़ गया। रिमाइंडर यहीं आएंगे, और लॉकर, विवरण और वॉलेट ऐप के साथ साझा हैं।']);
        } else {
          links.waCancel(phoneUid);
          await sendReplies(phone, ['Cancelled. Nothing was linked.\n\nरद्द किया। कुछ नहीं जुड़ा।']);
        }
      } catch (e) {
        await sendReplies(phone, [e.code === 'slow_down' ? 'Too many tries. Please try again in an hour.' : 'That code is not valid or has expired. Make a new one in the app under Devices and sync.\n\nयह कोड सही नहीं है या पुराना हो गया है।']);
      }
    });
  }

  const userId = links.resolve(phoneUid);
  enqueue(userId, async () => {
    const { replies } = await converse({ key: phone, userId, input, ctx: { phone, early: (r) => sendReplies(phone, r) } });
    await sendReplies(phone, replies);
  });
}

// Stripe tells us a checkout was paid. Credit the wallet once, then tell the user.
function processPayment(paid) {
  const rec = store.getPayment(paid.ref);
  if (!rec) return console.warn('payment for unknown ref', paid.ref);
  enqueue(rec.userId, async () => {
    const r = await bot.creditPayment(paid);
    if (!r.ok) return console.warn('payment not credited:', r.reason, paid.ref);
    // The referrer's share goes through their own queue, so their balance is never written twice at once.
    if (r.referral?.paise > 0 && r.referral.referrerId !== rec.userId) {
      enqueue(r.referral.referrerId, async () => creditReferrer(r.referral));
    }
    if (r.phone) await sendReplies(r.phone, [t(r.lang, 'topup_ok', { amt: inr(r.paise), bal: inr(r.balance) })]);
    // Receipt: the phone the person typed at Stripe gets Stripe's own receipt link. The number is not kept.
    const phone = paid.phone || r.phone;
    if (phone && payments) {
      const url = await payments.receiptUrl(paid.paymentId).catch(() => null);
      if (url) await sendReplies(phone, [`Thanks. Your payment of ${inr(r.paise)} is in your wallet.\nReceipt: ${url}\n\nधन्यवाद। आपका भुगतान वॉलेट में जुड़ गया है।\nरसीद: ${url}`]);
    }
  });
}

function creditReferrer({ referrerId, paise, paymentId }) {
  const u = store.getUser(referrerId);
  if (!u) return; // the referrer has left; nothing to pay
  const r = credit(u, paise, 'ref:' + paymentId, 'referral');
  if (r.ok) store.putUser(referrerId, u);
}

function readBody(req, res, cb) {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > 1_000_000) req.destroy();
    else chunks.push(c);
  });
  req.on('end', () => cb(Buffer.concat(chunks)));
}

function validSignature(rawBody, header) {
  if (!config.appSecret) return !(process.env.VERCEL || process.env.NODE_ENV === 'production'); // open only on a dev machine
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', config.appSecret).update(rawBody).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

const same = (a, b) => { const x = crypto.createHash('sha256').update(String(a || '')).digest(); const y = crypto.createHash('sha256').update(String(b || '')).digest(); return crypto.timingSafeEqual(x, y); };
const adminOk = (req, url) => Boolean(config.adminKey) && (same(url.searchParams.get('key'), config.adminKey) || same(req.headers['x-admin-key'], config.adminKey));
const jsonOut = (res, code, obj) => {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
};
const WINDOW_MS = 23 * 3600 * 1000;

/** An operator answers a person who asked for a human. Only possible inside WhatsApp's 24-hour window. */
async function operatorReply(id, text) {
  const h = store.getHandoff(id);
  if (!h) return [404, { error: 'not_found' }];
  const msg = String(text || '').trim().slice(0, 1000);
  if (!msg) return [400, { error: 'empty' }];
  if (isWebKey(h.phone)) {
    // Web people read replies inside the app (it checks every few seconds), so there is no 24-hour window.
    store.updateHandoff(id, (x) => {
      x.status = 'replied';
      x.repliedAt = Date.now();
      x.unread = false;
      x.thread.push({ ts: Date.now(), dir: 'out', text: msg });
    });
    return [200, { ok: true }];
  }
  const user = store.getUser(hashPhone(h.phone));
  if (!user || Date.now() - (user.lastInboundAt || 0) > WINDOW_MS) return [409, { error: 'window_closed', hint: 'This person has not messaged in the last 24 hours, so WhatsApp only allows an approved template message.' }];
  if (!guard.msgAllowed()) return [429, { error: 'spend_cap' }];
  const n = await wa.send(h.phone, msg);
  if (!n) return [502, { error: 'send_failed' }];
  guard.recordMsg();
  store.updateHandoff(id, (x) => {
    x.status = 'replied';
    x.repliedAt = Date.now();
    x.unread = false;
    x.thread.push({ ts: Date.now(), dir: 'out', text: msg });
  });
  return [200, { ok: true }];
}

const PRIVACY = `Saathi privacy notice

What we do: Saathi guides you through government paperwork on WhatsApp: PAN, driving licence, Aadhaar, voter ID, passport, GST registration, and income and caste certificates.
What we keep: your place in the guide and your language, deleted after ${config.userIdleHours} hours of inactivity. If you choose to save your details (name, date of birth, parents' names, gender, address, PIN code, mobile number, email) they are stored encrypted until you type "forget" or ${config.accountKeepDays} days without a message. Your locker (only if you add to it): ID numbers such as PAN, licence or passport, and expiry dates, encrypted with a server key, hidden until you tap Unlock, erased with "forget". We can technically decrypt them with that key, so we never look and only the code that answers you does. We never store Aadhaar cards as photos, card numbers or OTPs. Your wallet balance and payment records (amount, date, reference) are kept for accounts. Everything under a scrambled ID, not your phone number. Type "delete" to erase it all.
Photos and PDFs: only read if you agree, only in memory, never saved. Voice notes: turned into text by a speech service (Sarvam or OpenAI), held in memory, never saved; the text is used only to answer you and is not kept.
Reminders: if you set one, we keep the date, its name and your phone number (encrypted) so we can message you before it, until it passes or you type "delete". The AI service reads the photo; your saved details are never sent to it.
Payments: made on Stripe's page. We never see your card details. While a payment is pending we hold your phone number to tell you it arrived.
If you ask for a human (type "agent"), we save your phone number and what you write to them so a person can reply. Closed conversations are deleted after 30 days.
AI: free-form questions, document reading and translation are processed by an AI service (${config.openrouterKey ? 'OpenRouter, which routes to a model provider; free models may keep what they are sent, so with a free model do not photograph documents you would not want a third party to see' : 'Anthropic'}). Other languages than English and Hindi are machine translated and may contain mistakes.
We never ask for your OTP or password. Do not share them with anyone.
`;

const web = createWeb({
  llm,
  store,
  config,
  media: webMedia,
  converse,
  enqueue,
  vault,
  guard,
  links,
  payments,
  shell: { whatsappNumber: config.whatsappNumber, voice: stt.enabled, pay: Boolean(payments) },
});

const server = http.createServer((req, res) => {
  res.setHeader('strict-transport-security', 'max-age=63072000; includeSubDomains; preload'); res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('referrer-policy', 'no-referrer');
  const url = new URL(req.url, 'http://localhost');

  // The web app (page, files and /app/api/*). Everything else below is WhatsApp, payments and the operator's pages.
  if (url.pathname === '/' || url.pathname === '/app' || url.pathname.startsWith('/app/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/photos/') || /^\/(app\.js|screens\.js|tools\.js|guides\.js|hark\.js|hark\.css|guides\.css|polish\.css|welcome\.css|screens\.css|site\.css|site\.js|sky\.js|og\.png|robots\.txt|style\.css|manifest\.webmanifest|sw\.js|logo\.svg|favicon\.ico|icon\.svg|icon-192\.png|icon-512\.png|apple-touch-icon\.png)$/.test(url.pathname)) {
    return void web.handle(req, res, url).then((done) => {
      if (!done && !res.writableEnded) {
        res.statusCode = 404;
        res.end('not found');
      }
    });
  }

  if (req.method === 'GET' && url.pathname === '/health') return void res.end('ok');
  if (req.method === 'GET' && url.pathname === '/privacy') {
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    return void res.end(PRIVACY);
  }

  if (req.method === 'GET' && url.pathname === '/admin/stats') {
    if (!adminOk(req, url)) {
      res.statusCode = 403;
      return void res.end('forbidden');
    }
    res.setHeader('content-type', 'application/json');
    return void res.end(JSON.stringify(guard.stats(), null, 2));
  }

  // Operator inbox: people who asked for a human. Contains phone numbers, so everything here needs the admin key.
  if (url.pathname.startsWith('/admin/') && !['/admin/stats'].includes(url.pathname) && !adminOk(req, url)) {
    res.statusCode = 403;
    return void res.end('forbidden');
  }
  if (req.method === 'GET' && url.pathname === '/admin/inbox') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    return void res.end(INBOX_HTML);
  }
  if (req.method === 'GET' && url.pathname === '/admin/handoffs') {
    const now = Date.now();
    const list = store
      .listHandoffs()
      .slice(-200)
      .reverse()
      .map((h) => {
        if (isWebKey(h.phone)) return { ...h, phone: 'Web app user', channel: 'web', canReply: true };
        const u = store.getUser(hashPhone(h.phone));
        return { ...h, canReply: Boolean(u && now - (u.lastInboundAt || 0) < WINDOW_MS) };
      });
    return void jsonOut(res, 200, list);
  }
  if (req.method === 'POST' && url.pathname === '/admin/reply') {
    return void readBody(req, res, async (raw) => {
      try {
        const b = JSON.parse(raw.toString('utf8'));
        const [code, out] = await operatorReply(b.id, b.text);
        jsonOut(res, code, out);
      } catch (e) {
        jsonOut(res, 400, { error: 'bad_request' });
      }
    });
  }
  if (req.method === 'POST' && url.pathname === '/admin/close') {
    return void readBody(req, res, (raw) => {
      try {
        const b = JSON.parse(raw.toString('utf8'));
        const h = store.updateHandoff(b.id, (x) => {
          x.status = 'closed';
          x.closedAt = Date.now();
          x.unread = false;
        });
        jsonOut(res, h ? 200 : 404, h ? { ok: true } : { error: 'not_found' });
      } catch {
        jsonOut(res, 400, { error: 'bad_request' });
      }
    });
  }
  if (req.method === 'GET' && url.pathname === '/admin/setup') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    return void res.end(SETUP_HTML);
  }
  if (req.method === 'GET' && url.pathname === '/admin/setup/status') {
    const base = config.publicUrl || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    return void diagnose({ ...config, publicUrl: base }).then((rows) =>
      jsonOut(res, 200, {
        rows,
        base,
        publicUrlSet: Boolean(config.publicUrl),
        webhook: `${base}/webhook`,
        stripeHook: `${base}/stripe`,
        verifyToken: config.verifyToken,
        privacy: `${base}/privacy`,
        app: `${base}/`,
        whatsappNumber: config.whatsappNumber,
        dryRun: config.dryRun,
        templates: [
          { name: config.reminderTemplate, lang: 'en', category: 'Utility', body: 'Reminder from Saathi: {{1}} is due on {{2}}. Reply here to continue.' },
        ],
        stats: guard.stats(),
      })
    );
  }
  if (req.method === 'POST' && url.pathname === '/admin/setup/test-send') {
    return void readBody(req, res, async (raw) => {
      try {
        const b = JSON.parse(raw.toString('utf8'));
        const to = String(b.to || '').replace(/\D/g, '');
        if (to.length < 10 || to.length > 15) return jsonOut(res, 400, { error: 'Enter the number with country code, digits only, like 919876543210.' });
        const ok = await wa.sendTemplate(to, { name: 'hello_world', lang: 'en_US' });
        jsonOut(res, ok ? 200 : 502, ok ? { ok: true } : { error: 'Meta refused it. Check the token and that this number is added as a test recipient.' });
      } catch {
        jsonOut(res, 400, { error: 'bad_request' });
      }
    });
  }
  if (req.method === 'GET' && url.pathname === '/admin/ai-key') {
    return void jsonOut(res, 200, { on: llm.enabled, provider: llm.enabled ? llm.provider : null, model: llm.provider === 'openrouter' ? config.openrouterModel : config.model, source: aiKeySource(), persistent: !process.env.VERCEL });
  }
  if (req.method === 'POST' && url.pathname === '/admin/ai-key') {
    return void readBody(req, res, async (raw) => {
      try {
        const b = JSON.parse(raw.toString('utf8'));
        const key = String(b.key || '').trim();
        if (!key) {
          store.setSetting('aiKey', null);
          llm.setKey(process.env.OPENROUTER_API_KEY || '');
          return jsonOut(res, 200, { ok: true, removed: true, on: llm.enabled });
        }
        if (!/^sk-or-[A-Za-z0-9_\-]{16,}$/.test(key)) return jsonOut(res, 400, { error: 'That does not look like an OpenRouter key. It starts with sk-or- and comes from openrouter.ai/keys.' });
        const before = config.openrouterKey;
        llm.setKey(key);
        try {
          await llm.answer('Reply with the single word OK.', 'Say OK');
        } catch (e) {
          llm.setKey(before);
          return jsonOut(res, 400, { error: 'OpenRouter did not accept that key (' + String(e.message).slice(0, 80) + '). Nothing was saved.' });
        }
        store.setSetting('aiKey', await vault.seal({ key }));
        jsonOut(res, 200, { ok: true, on: true, last4: key.slice(-4) });
      } catch {
        jsonOut(res, 400, { error: 'bad_request' });
      }
    });
  }
  if (url.pathname === '/admin/refresh-facts') {
    return void live.refresh({ force: true }).then((r) => jsonOut(res, 200, { ...r, status: live.status() }));
  }
  if (req.method === 'POST' && url.pathname === '/admin/run-reminders') {
    return void scheduler.run().then((n) => jsonOut(res, 200, { sent: n }));
  }

  // WhatsApp webhook verification handshake
  if (req.method === 'GET' && url.pathname === '/webhook') {
    if (
      url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === config.verifyToken
    ) {
      return void res.end(url.searchParams.get('hub.challenge') || '');
    }
    res.statusCode = 403;
    return void res.end('forbidden');
  }

  if (req.method === 'POST' && url.pathname === '/webhook') {
    return void readBody(req, res, (rawBody) => {
      if (!validSignature(rawBody, req.headers['x-hub-signature-256'])) {
        res.statusCode = 401;
        return void res.end('bad signature');
      }
      res.end('ok'); // reply fast; WhatsApp retries if we are slow
      try {
        const body = JSON.parse(rawBody.toString('utf8'));
        for (const entry of body.entry || [])
          for (const change of entry.changes || [])
            for (const msg of change.value?.messages || []) processMessage(msg);
      } catch (e) {
        console.error('bad webhook body:', e.message);
      }
    });
  }

  if (req.method === 'POST' && url.pathname === '/stripe') {
    return void readBody(req, res, (rawBody) => {
      if (!validStripeSignature(rawBody, req.headers['stripe-signature'], config.stripeWebhookSecret)) {
        res.statusCode = 401;
        return void res.end('bad signature');
      }
      res.end('ok');
      try {
        const paid = parsePaidEvent(JSON.parse(rawBody.toString('utf8')));
        if (paid) processPayment(paid);
      } catch (e) {
        console.error('bad stripe body:', e.message);
      }
    });
  }

  res.statusCode = 404;
  res.end('not found');
});

const live = createLiveFacts({ store, llm });
if (!process.env.VERCEL && !process.env.NO_LIVE_FACTS) live.start();
const scheduler = createScheduler({ store, vault, wa, guard, config, enqueue });

if (!process.env.VERCEL) setInterval(() => {
  const n = store.sweep(config.userIdleHours * 3600 * 1000, config.accountKeepDays * 86400 * 1000);
  if (n) console.log(`swept ${n} idle users`);
  store.pruneHandoffs();
  scheduler.run().then((sent) => sent && console.log(`sent ${sent} reminders`)).catch((e) => console.error('reminder run failed:', e.message));
}, 3600 * 1000).unref();

// On Vercel the request handler is exported (api/index.js); everywhere else we listen on a port.
export default (req, res) => server.emit('request', req, res);
if (!process.env.VERCEL) server.listen(config.port, () => {
  console.log(`Saathi listening on :${config.port}`);
  if (!config.dryRun && (config.vaultKey.startsWith('dev-') || config.hashSalt.startsWith('dev-') || !config.appSecret)) console.error('⚠️  Live WhatsApp with default secrets or no APP_SECRET. Run: npm run doctor');
  console.log(config.dryRun ? '⚠️  DRY RUN: no WhatsApp credentials, replies are printed.' : 'WhatsApp: live');
  console.log(llm.enabled ? `AI: ${llm.provider === 'openrouter' ? 'OpenRouter ' + config.openrouterModel + (config.openrouterFallbacks.length ? ' (fallback ' + config.openrouterFallbacks.join(', ') + ')' : '') : config.model}` : 'AI: off (scripted guide only)');
  if (!config.dryRun && config.vaultKey === 'dev-vault-key-change-me') console.warn('⚠️  Set VAULT_KEY: saved profiles are encrypted with a public dev key.');
  console.log(payments ? 'Payments: Stripe' : 'Payments: off (no top-ups)');
  console.log(stt.enabled ? `Voice notes: on (${config.sarvamKey ? 'Sarvam' : 'OpenAI'}${config.sarvamKey && config.openaiKey ? ', OpenAI fallback' : ''})` : 'Voice notes: off (no SARVAM_API_KEY or OPENAI_API_KEY)');
  console.log(`Languages: English, हिंदी${translator.enabled ? ', plus 9 AI-translated on demand' : ''}`);
  console.log(`Web app: ${config.publicUrl || 'http://localhost:' + config.port}/`);
  console.log(`Details form: ${config.flowsEnabled ? 'WhatsApp Flow' : 'one question at a time'}`);
  console.log(`Spend caps: ₹${config.dailyBudgetInr}/day, ₹${config.monthlyBudgetInr}/month`);
});
