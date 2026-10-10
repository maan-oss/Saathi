import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';

const DAY = 86400000;
const HOUR = 3600000;
const NOW = Date.parse('2026-10-10T12:00:00Z');
const KEEP = 180 * DAY;
const IDLE = 24 * HOUR;

function fixture(users) {
  const dir = mkdtempSync(join(tmpdir(), 'saathi-retention-'));
  const s = new Store(dir);
  for (const [id, { age, ...u }] of Object.entries(users)) s.users[id] = { ...u, updated: NOW - age * DAY };
  return { s, dir };
}

test('retention: an account with no balance and nothing saved is deleted after a day idle', () => {
  const { s, dir } = fixture({ empty: { age: 2, lang: 'en', state: 'menu' } });
  try {
    assert.equal(s.sweep(IDLE, KEEP, NOW), 1);
    assert.equal(s.getUser('empty'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retention: saved details without a balance are kept up to 180 days, then the whole account is deleted', () => {
  const { s, dir } = fixture({
    recent: { age: 3, lang: 'en', state: 'menu', vault: 'v1.x.y.z' },
    old: { age: 181, lang: 'en', state: 'menu', vault: 'v1.x.y.z' },
  });
  try {
    s.sweep(IDLE, KEEP, NOW);
    assert.equal(s.getUser('recent').vault, 'v1.x.y.z');
    assert.equal(s.getUser('old'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retention: a balance is never deleted for inactivity, and personal details are erased after 180 days', () => {
  const rich = {
    age: 200,
    lang: 'en',
    state: 'steps',
    svc: 'epan',
    step: 3,
    route: 'epan',
    pending: 'v1.a.b.c',
    wallet: { paise: 4500, history: [{ ts: 1, what: 'top-up', paise: 5000, bal: 5000 }], refs: [] },
    packs: [{ id: 'pan_pack', until: NOW + 2 * DAY }, { id: 'pack_quick', until: NOW - 90 * DAY }],
    vault: 'v1.x.y.z',
    locker: 'v1.l',
    extras: 'v1.e',
    reminders: [{ id: 'r1', date: '2026-11-12' }],
    phoneSealed: 'v1.p',
    chatsSync: 'v1.c',
    vaultConsent: true,
    docConsent: true,
    freeAi: { day: '2026-10-01', n: 3 },
    devices: [{ id: 'dev1', label: 'Phone', added: 1 }],
    waUid: 'wa1',
    waLinked: true,
    firstPaidAt: 123,
    referrerId: 'ref1',
    trialGiven: true,
  };
  const { s, dir } = fixture({ rich });
  try {
    assert.equal(s.sweep(IDLE, KEEP, NOW), 1, 'one account was cleaned');
    const u = s.getUser('rich');
    assert.ok(u, 'the account is kept');
    // Money and what reaches it
    assert.equal(u.wallet.paise, 4500);
    assert.equal(u.wallet.history.length, 1);
    assert.deepEqual(u.packs.map((p) => p.id), ['pan_pack'], 'only packs still running are kept');
    assert.deepEqual(u.devices, [{ id: 'dev1', label: 'Phone', added: 1 }]);
    assert.equal(u.waUid, 'wa1');
    assert.equal(u.waLinked, true);
    assert.equal(u.firstPaidAt, 123);
    assert.equal(u.referrerId, 'ref1');
    assert.equal(u.trialGiven, true);
    assert.equal(u.lang, 'en');
    // Personal details and session state are gone
    for (const k of ['vault', 'locker', 'extras', 'reminders', 'phoneSealed', 'chatsSync', 'vaultConsent', 'docConsent', 'svc', 'step', 'route', 'pending', 'freeAi'])
      assert.equal(u[k], undefined, `${k} is erased`);
    assert.equal(u.state, 'menu');

    // The erasure is on disk, so a restart does not bring it back.
    const again = new Store(dir);
    assert.equal(again.getUser('rich').vault, undefined);
    assert.equal(again.getUser('rich').wallet.paise, 4500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retention: a cleaned balance account is not counted again on every hourly run', () => {
  const { s, dir } = fixture({ rich: { age: 200, lang: 'en', state: 'menu', vault: 'v1.x.y.z', wallet: { paise: 500, history: [] } } });
  try {
    assert.equal(s.sweep(IDLE, KEEP, NOW), 1);
    assert.equal(s.sweep(IDLE, KEEP, NOW + HOUR), 0);
    assert.equal(s.sweep(IDLE, KEEP, NOW + 2 * HOUR), 0);
    assert.equal(s.getUser('rich').wallet.paise, 500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retention: a balance account without a language goes back to the start, and is not counted again', () => {
  const { s, dir } = fixture({ nolang: { age: 200, state: 'steps', svc: 'epan', wallet: { paise: 500, history: [] } } });
  try {
    assert.equal(s.sweep(IDLE, KEEP, NOW), 1);
    assert.equal(s.getUser('nolang').state, 'new');
    assert.equal(s.getUser('nolang').svc, undefined);
    assert.equal(s.sweep(IDLE, KEEP, NOW + HOUR), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retention: a balance account is left alone before 180 days idle', () => {
  const { s, dir } = fixture({ mid: { age: 100, lang: 'en', state: 'menu', vault: 'v1.x.y.z', wallet: { paise: 100, history: [] } } });
  try {
    assert.equal(s.sweep(IDLE, KEEP, NOW), 0);
    assert.equal(s.getUser('mid').vault, 'v1.x.y.z');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
