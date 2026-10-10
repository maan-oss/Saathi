import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanSource, isBot, parseClientEvent, EVENTS } from '../src/analytics.js';
import { Store } from '../src/store.js';
import { setup } from './helpers.js';
import { createWeb, createWebMedia } from '../src/web.js';
import { createConverse } from '../src/converse.js';
import { createVault } from '../src/vault.js';
import { createLinks } from '../src/link.js';

const DAY = 86400000;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const fresh = () => mkdtempSync(join(tmpdir(), 'saathi-stats-'));

test('analytics: a source is one of a short fixed list; empty is direct and anything else is other', () => {
  assert.equal(cleanSource(''), 'direct');
  assert.equal(cleanSource(undefined), 'direct');
  assert.equal(cleanSource(' Meta '), 'meta');
  assert.equal(cleanSource('google'), 'google');
  assert.equal(cleanSource('<script>alert(1)</script>'), 'other');
  assert.equal(cleanSource('x'.repeat(500)), 'other');
});

test('analytics: bots, empty agents and command-line tools are recognised', () => {
  assert.equal(isBot(''), true);
  assert.equal(isBot(undefined), true);
  assert.equal(isBot('Googlebot/2.1 (+http://www.google.com/bot.html)'), true);
  assert.equal(isBot('curl/8.4.0'), true);
  assert.equal(isBot('Mozilla/5.0 HeadlessChrome/120.0'), true);
  assert.equal(isBot('facebookexternalhit/1.1'), true);
  assert.equal(isBot(UA), false);
});

test('analytics: the beacon takes only the two landing events, a short body, and a clean source', () => {
  assert.deepEqual(parseClientEvent('{"event":"landing_view","source":"Meta"}'), { event: 'landing_view', source: 'meta' });
  assert.deepEqual(parseClientEvent('{"event":"app_open"}'), { event: 'app_open', source: 'direct' });
  assert.equal(parseClientEvent('{"event":"topup_paid","source":"pack"}'), null, 'top-ups are counted on the server only');
  assert.equal(parseClientEvent('{"event":"__proto__"}'), null);
  assert.equal(parseClientEvent('not json'), null);
  assert.equal(parseClientEvent('[]'), null);
  assert.equal(parseClientEvent('null'), null);
  assert.equal(parseClientEvent(`{"event":"landing_view","pad":"${'x'.repeat(300)}"}`), null);
  assert.equal(parseClientEvent(42), null);
  assert.deepEqual([...EVENTS].sort(), ['app_open', 'landing_view', 'topup_paid', 'topup_started']);
});

test('analytics: daily totals per event and per source, kept across a restart', () => {
  const dir = fresh();
  try {
    const now = Date.parse('2026-10-10T12:00:00Z');
    const s = new Store(dir);
    s.countEvent('landing_view', 'meta', now);
    s.countEvent('landing_view', 'meta', now);
    s.countEvent('landing_view', 'direct', now);
    s.countEvent('app_open', '', now);
    const f = new Store(dir).funnel(3, now);
    assert.deepEqual(f.map((d) => d.day), ['2026-10-08', '2026-10-09', '2026-10-10']);
    const today = f[2];
    assert.equal(today.events.landing_view, 3);
    assert.equal(today.events.app_open, 1);
    assert.equal(today.sources['landing_view|meta'], 2);
    assert.equal(today.sources['landing_view|direct'], 1);
    assert.equal(Object.keys(today.sources).some((k) => k.startsWith('app_open|')), false, 'no source key without a source');
    assert.deepEqual(f[0].events, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('analytics: days older than 90 are dropped when the next count is saved', () => {
  const dir = fresh();
  try {
    const now = Date.parse('2026-10-10T12:00:00Z');
    const s = new Store(dir);
    s.countEvent('landing_view', 'meta', now - 91 * DAY);
    s.countEvent('landing_view', 'meta', now - 89 * DAY);
    s.countEvent('landing_view', 'meta', now);
    assert.deepEqual(Object.keys(s.stats.days).sort(), [dayOf(now - 89 * DAY), dayOf(now)].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function boot() {
  const t = setup({}, {}, {});
  const media = createWebMedia();
  const converse = createConverse({ store: t.store, bot: t.bot });
  const enqueue = (id, fn) => { Promise.resolve().then(fn).catch(() => {}); };
  const config = { hashSalt: 'salt', trustProxy: false, webMsgsPerMin: 1000, webMsgsPerMinIp: 1000, webUploadsPerMin: 1000, webUploadsPerMinIp: 1000, webNewPerIpPerDay: 5 };
  const vault = createVault('test-key');
  const links = createLinks({ store: t.store, config, vault });
  const web = createWeb({ store: t.store, config, media, converse, enqueue, shell: { whatsappNumber: '919876543210', voice: true, pay: true }, llm: { enabled: true }, vault, guard: t.guard, links });
  const server = http.createServer((req, res) => {
    web.handle(req, res, new URL(req.url, 'http://x')).then((d) => { if (!d) { res.statusCode = 404; res.end('nf'); } });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const beacon = (body, headers = {}) => fetch(base + '/app/api/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-saathi': '1', 'user-agent': UA, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const today = () => t.store.funnel(1)[0];
  return { ...t, base, beacon, today, close: () => { server.closeAllConnections?.(); server.close(); t.done(); } };
}

test('analytics: the live beacon counts a landing view and an app open, and refuses anything else', async () => {
  const w = await boot();
  try {
    assert.equal((await w.beacon({ event: 'landing_view', source: 'Meta' })).status, 204);
    assert.equal((await w.beacon({ event: 'app_open', source: 'google' })).status, 204);
    assert.equal(w.today().events.landing_view, 1);
    assert.equal(w.today().events.app_open, 1);
    assert.equal(w.today().sources['landing_view|meta'], 1);
    assert.equal((await w.beacon({ event: 'topup_paid' })).status, 400);
    assert.equal((await w.beacon('nonsense')).status, 400);
    assert.equal(w.today().events.topup_paid, undefined, 'a page cannot inflate paid top-ups');
  } finally {
    w.close();
  }
});

test('analytics: bots and browsers with no agent are answered but not counted; a request without the header is refused', async () => {
  const w = await boot();
  try {
    assert.equal((await w.beacon({ event: 'landing_view' }, { 'user-agent': 'Googlebot/2.1' })).status, 204);
    assert.equal((await w.beacon({ event: 'landing_view' }, { 'user-agent': '' })).status, 204);
    assert.equal(w.today().events.landing_view, undefined);
    const noHeader = await fetch(w.base + '/app/api/event', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify({ event: 'landing_view' }) });
    assert.equal(noHeader.status, 403);
    assert.equal(w.today().events.landing_view, undefined);
  } finally {
    w.close();
  }
});

test('analytics: at most 120 beacons a minute from one address', async () => {
  const w = await boot();
  try {
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await w.beacon({ event: 'landing_view' })).status;
    assert.equal(last, 429);
    assert.equal(w.today().events.landing_view, 120);
  } finally {
    w.close();
  }
});
