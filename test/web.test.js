import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setup } from './helpers.js';
import { createWeb, createWebMedia, limiter, isWebKey } from '../src/web.js';
import { createConverse } from '../src/converse.js';
import { createVault } from '../src/vault.js';
import { createLinks } from '../src/link.js';

const SID = 'a'.repeat(32);
const SID2 = 'b'.repeat(32);

async function boot(over = {}, opts = {}) {
  const t = setup(over.bot || {}, {}, opts);
  const media = createWebMedia();
  const converse = createConverse({ store: t.store, bot: t.bot });
  const queues = new Map();
  const enqueue = (id, fn) => {
    const prev = queues.get(id) || Promise.resolve();
    const next = prev.then(fn).catch(() => {});
    queues.set(id, next);
  };
  const config = { hashSalt: 'salt', trustProxy: false, webMsgsPerMin: 1000, webMsgsPerMinIp: 1000, webUploadsPerMin: 1000, webUploadsPerMinIp: 1000, webNewPerIpPerDay: 5, ...(over.config || {}) };
  const vault = createVault('test-key');
  const links = createLinks({ store: t.store, config, vault });
  const web = createWeb({ store: t.store, config, media, converse, enqueue, shell: { whatsappNumber: '919876543210', voice: true, pay: true }, llm: { enabled: true }, vault, guard: t.guard, links });
  const server = http.createServer((req, res) => {
    web.handle(req, res, new URL(req.url, 'http://x')).then((d) => { if (!d) { res.statusCode = 404; res.end('nf'); } });
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', sid = SID, body, headers = {} } = {}) => {
    const h = { ...(sid ? { 'x-session': sid } : {}), ...(method !== 'GET' ? { 'x-saathi': '1' } : {}), ...headers };
    let payload = body;
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
    const r = await fetch(base + path, { method, headers: h, body: payload });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, headers: r.headers, text, json };
  };
  const say = async (text, sid = SID) => (await call('/app/api/message', { method: 'POST', sid, body: { type: 'text', text } })).json;
  return { ...t, web, media, call, say, base, close: () => { server.closeAllConnections?.(); server.close(); t.done(); } };
}

test('web: serves the app with strict security headers, and the files exist', async () => {
  const w = await boot();
  const r = await w.call('/app', { sid: null });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.doesNotMatch(r.headers.get('content-security-policy'), /unsafe-inline|unsafe-eval/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.text, /Saathi/);
  for (const p of ['/app.js', '/tools.js', '/style.css', '/site.css', '/site.js', '/og.png', '/robots.txt', '/manifest.webmanifest', '/sw.js', '/logo.svg', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']) {
    assert.equal((await w.call(p, { sid: null })).status, 200, p);
  }
  assert.equal((await w.call('/nope', { sid: null })).status, 404);
  const m = JSON.parse((await w.call('/manifest.webmanifest', { sid: null })).text);
  assert.equal(m.display, 'standalone');
  w.close();
});

test('web: talking works end to end and returns rich replies, wallet and no personal ids', async () => {
  const w = await boot();
  const a = await w.say('hi');
  // On the web a typed message is answered by the AI straight away, not with a language menu.
  assert.ok(a.replies.length >= 1);
  assert.match(a.wallet.balance, /₹/);
  assert.equal(a.human, null);
  const b = (await w.call('/app/api/message', { method: 'POST', body: { type: 'text', text: 'menu' } })).json;
  assert.ok(b.replies.length >= 1);
  // The stored user id is a hash of the session, never the session id itself.
  const users = JSON.stringify(w.store.users);
  assert.ok(!users.includes(SID));
  w.close();
});

test('web: cross-site requests are refused (custom header) and bad sessions rejected', async () => {
  const w = await boot();
  const noHdr = await fetch(w.base + '/app/api/message', { method: 'POST', headers: { 'x-session': SID }, body: '{"type":"text","text":"hi"}' });
  assert.equal(noHdr.status, 403);
  const noSid = await w.call('/app/api/message', { method: 'POST', sid: null, body: { type: 'text', text: 'hi' } });
  assert.equal(noSid.status, 400);
  const shortSid = await w.call('/app/api/message', { method: 'POST', sid: 'abc', body: { type: 'text', text: 'hi' } });
  assert.equal(shortSid.status, 400);
  const evil = await w.call('/app/api/message', { method: 'POST', sid: '../../etc/passwd'.padEnd(40, 'a'), body: { type: 'text', text: 'hi' } });
  assert.equal(evil.status, 400);
  assert.equal((await w.call('/app/api/message', { method: 'POST', body: { type: 'wat' } })).status, 400);
  assert.equal((await w.call('/app/api/message', { method: 'POST', body: { type: 'text', text: '   ' } })).status, 400);
  w.close();
});

test('web: links are marked, so a scam link can never be tapped', async () => {
  const w = await boot();
  await w.say('hi');
  await w.call('/app/api/message', { method: 'POST', body: { type: 'reply', id: '1', title: 'English' } });
  const r = await w.say('urgent pay at http://pan-card-apply.xyz/kyc');
  const withLinks = r.replies.filter((x) => x.links);
  assert.ok(withLinks.length, 'a reply carries link info');
  const kinds = Object.values(Object.assign({}, ...withLinks.map((x) => x.links))).map((l) => l.kind);
  assert.ok(kinds.includes('trap') || kinds.includes('unknown'));
  assert.ok(!kinds.includes('official') || withLinks.some((x) => Object.entries(x.links).some(([u, l]) => l.kind === 'official' && /gov\.in|nic\.in/.test(u))));
  // The client only makes official/payment links tappable; assert the server never labels the trap official.
  for (const x of withLinks) for (const [u, l] of Object.entries(x.links)) if (/pan-card-apply/.test(u)) assert.notEqual(l.kind, 'official');
  w.close();
});

test('web: uploads are type-checked, size-capped, owned by the session, and used once', async () => {
  const w = await boot();
  const bad = await w.call('/app/api/upload', { method: 'POST', body: Buffer.from('MZ'), headers: { 'content-type': 'application/x-msdownload' } });
  assert.equal(bad.status, 415);
  const big = await w.call('/app/api/upload', { method: 'POST', body: Buffer.alloc(7 * 1024 * 1024), headers: { 'content-type': 'image/jpeg' } });
  assert.ok([413, 400].includes(big.status));
  const ok = await w.call('/app/api/upload', { method: 'POST', body: Buffer.from('imgbytes'), headers: { 'content-type': 'image/jpeg' } });
  assert.equal(ok.status, 200);
  assert.match(ok.json.mediaId, /^web_[a-f0-9]{32}$/);
  // Another person cannot use it.
  const steal = await w.call('/app/api/message', { method: 'POST', sid: SID2, body: { type: 'image', mediaId: ok.json.mediaId } });
  assert.equal(steal.status, 400);
  // The owner can, once.
  const use = await w.call('/app/api/message', { method: 'POST', body: { type: 'image', mediaId: ok.json.mediaId, mime: 'image/jpeg' } });
  assert.equal(use.status, 200);
  await assert.rejects(() => w.media.take(ok.json.mediaId));
  w.close();
});

test('web: rate limits stop floods', async () => {
  const w = await boot({ config: { webMsgsPerMin: 3 } });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await w.call('/app/api/message', { method: 'POST', body: { type: 'text', text: 'hi' } })).status);
  assert.deepEqual(codes.slice(0, 3), [200, 200, 200]);
  assert.equal(codes[4], 429);
  const l = limiter(2, 1000);
  assert.deepEqual([l('a'), l('a'), l('a'), l('b')], [true, true, false, true]);
  w.close();
});

test('web: the welcome credit is capped per address so scripts cannot farm it', async () => {
  const w = await boot({ config: { webNewPerIpPerDay: 2 } });
  const paise = [];
  for (let i = 0; i < 4; i++) {
    const sid = String(i).repeat(32);
    await w.say('hi', sid);
    paise.push(w.store.getUser(w.web.uidOf(sid)).wallet?.paise ?? 0);
  }
  assert.ok(paise[0] > 0 && paise[1] > 0);
  assert.equal(paise[2], 0);
  assert.equal(paise[3], 0);
  w.close();
});

test('web: there is no talk-to-a-person route on the web, and no handoff is stored', async () => {
  const w = await boot();
  await w.say('hi');
  await w.say('agent');
  assert.equal(w.store.listHandoffs().length, 0);
  const p = await w.call('/app/api/poll?since=0');
  assert.equal(p.status, 200);
  w.close();
});

test('web: reminders explain they need WhatsApp, and the details form is asked one field at a time', async () => {
  const w = await boot({ bot: { detailsFlowId: 'flow1', flowsEnabled: true } });
  await w.say('hi');
  await w.call('/app/api/message', { method: 'POST', body: { type: 'reply', id: '1', title: 'English' } });
  const kinds = new Set();
  for (const id of ['pan', '1', '1', '1', '1']) {
    const r = (await w.call('/app/api/message', { method: 'POST', body: { type: 'reply', id, title: id } })).json;
    for (const x of r?.replies || []) kinds.add(x.kind || 'text');
  }
  assert.ok(!kinds.has('form'), 'no WhatsApp Flow form on the web');
  w.close();
});

test('web: landing page at / , app at /app, and the config feeds the pricing chart', async () => {
  const w = await boot();
  const home = await w.call('/', { sid: null });
  assert.equal(home.status, 200);
  assert.match(home.text, /Government forms/);
  assert.match(home.text, /not affiliated with or endorsed by any government/);
  assert.doesNotMatch(home.text, /<script>(?!\s*<)/);
  const app = await w.call('/app', { sid: null });
  assert.match(app.text, /id="composer"|composer/);
  const cfg = JSON.parse((await w.call('/app/api/config', { sid: null })).text);
  assert.ok(cfg.prices === null || (Number.isFinite(cfg.prices.msgPaise) && cfg.prices.pack));
  assert.match((await w.call('/robots.txt', { sid: null })).text, /Disallow: \/admin/);
  w.close();
});

test('web: the public checker gives the same verdicts as the bot and stores nothing', async () => {
  const w = await boot();
  const post = async (text, h = { 'x-saathi': '1' }) => {
    const r = await fetch(w.base + '/app/api/check', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify({ text }) });
    return { status: r.status, body: await r.json() };
  };
  const bad = await post('Your PAN is blocked. Update now: pan-card-apply.xyz/kyc');
  assert.equal(bad.body.level, 'danger');
  assert.match(bad.body.advice, /1930/);
  assert.equal((await post('https://www.incometax.gov.in')).body.level, 'safe');
  assert.equal((await post('my pan is ABCPE1234F please check')).body.level, 'private');
  assert.equal((await post('hello', {})).status, 403, 'needs the custom header');
  assert.equal((await post('x')).status, 400);
  w.close();
});

test('web: the landing page can read real service facts, and the site and app are separate pages', async () => {
  const w = await boot();
  try {
    const j = JSON.parse((await w.call('/app/api/services', { sid: null })).text);
    assert.ok(j.verified && j.services.length >= 5);
    const pan = j.services.find((s) => /PAN/i.test(s.name));
    assert.ok(pan.fee && pan.docs.length && pan.sites.every((u) => /^https:\/\//.test(u)));
    assert.match((await w.call("/", { sid: null })).text, /id="services"/);
    assert.match((await w.call('/app', { sid: null })).text, /id="onboard"/);
  } finally { w.close(); }
});

test('web: typed messages get a real AI answer that follows the conversation, no language menu', async () => {
  const w = await boot();
  const r = (await w.call('/app/api/message', { method: 'POST', body: { type: 'text', text: 'and what is the fee?', ctx: { svc: 'pan', hist: [{ r: 'u', t: 'fix my PAN name' }, { r: 'a', t: 'Use the correction form.' }] } } })).json;
  assert.ok(r.replies.length >= 1);
  assert.notEqual(r.replies[0].kind, 'form');
  w.close();
});

test('web: the UI dictionary endpoint serves Hindi and rejects unknown languages', async () => {
  const w = await boot();
  const hi = await w.call('/app/api/ui?lang=hi', { sid: null });
  assert.equal(hi.status, 200);
  assert.ok(Object.keys(hi.json.strings).length > 200);
  assert.equal((await w.call('/app/api/ui?lang=zz', { sid: null })).status, 400);
  assert.deepEqual((await w.call('/app/api/ui?lang=en', { sid: null })).json.strings, {});
  w.close();
});

test('web: tool pages work through the route, and unknown ops are refused', async () => {
  const w = await boot();
  const t = (op, args, sid = SID) => w.call('/app/api/t', { method: 'POST', sid, body: { op, args } });
  const sum = await t('summary');
  assert.equal(sum.json.ok, true);
  assert.equal(sum.json.data.locker, 0);
  const add = await t('locker.add', { type: 'pan', number: 'ABCPE1234F' });
  assert.equal(add.json.ok, true);
  assert.doesNotMatch(add.text, /ABCPE1234F/);
  assert.equal((await t('locker.reveal', { type: 'pan' })).json.data.copy, 'ABCPE1234F');
  assert.equal((await t('locker.list', {}, SID2)).json.data.docs.length, 0);
  assert.equal((await t('nope')).status, 400);
  assert.equal((await w.call('/app/api/t', { method: 'POST', sid: SID, headers: { 'x-saathi': '' }, body: { op: 'summary' } })).status >= 400, true);
  w.close();
});

test('web: a second device links with a one-time code and then shares the account', async () => {
  const w = await boot();
  const t = (op, args, sid) => w.call('/app/api/t', { method: 'POST', sid, body: { op, args } });
  const l = (op, body, sid) => w.call('/app/api/link', { method: 'POST', sid, body: { op, ...body } });
  await t('locker.add', { type: 'pan', number: 'ABCPE1234F' }, SID);
  const c = (await l('new', {}, SID)).json.data.code;
  assert.equal((await l('join', { code: c }, SID2)).json.ok, false);
  assert.equal((await l('join', { code: c, confirm: true }, SID2)).json.ok, true);
  assert.equal((await t('locker.list', {}, SID2)).json.data.docs.length, 1);
  assert.equal((await l('join', { code: c, confirm: true }, 'c'.repeat(32))).json.ok, false);
  const devs = (await l('devices', {}, SID)).json.data.list;
  assert.equal(devs.length, 2);
  await l('remove', { id: devs.find((d) => !d.main).id }, SID);
  assert.equal((await t('locker.list', {}, SID2)).json.data.docs.length, 0);
  w.close();
});
