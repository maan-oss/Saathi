// The Supabase import (scripts/import-to-supabase.js). The fixture is written by the real file store, so the importer
// is tested against the formats the app actually writes. Supabase itself is a fake that records every request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { SupabaseStore } from '../src/supastore.js';
import { readSource, plan, summary, apply, checkTarget, verify } from '../scripts/import-to-supabase.js';

const SAVED_AT = 1700000000000;

function fixture() {
  const dir = mkdtempSync(join(process.cwd(), '.test-'));
  const store = new Store(dir, () => SAVED_AT);
  store.putUser('u1', { state: 'menu', lang: 'hi', wallet: { paise: 500, refs: [], history: [] }, reminders: [{ id: 'r1', label: 'Licence', due: '2030-01-01', sent: { 30: false } }] });
  store.putUser('u2', { state: 'menu', linkTo: 'u1' });
  store.putPayment('sv_1', { userId: 'u1', paise: 5000, status: 'paid', paymentId: 'pay_1', ts: 1699999999000 });
  store.markTrial('u1');
  store.refCodeFor('u1');
  store.setSetting('motd', 'hello');
  store.setSetting('linkcodes', { abc: { uid: 'u1', kind: 'device', exp: 1 } });
  store.spendAdd('2026-10-10', 1.5, 2);
  store.bumpUserDay('2026-10-10', 'u1', 2, 1);
  store.countEvent('topup_paid', 'pack', SAVED_AT);
  store.appendHandoff({ phone: '919000000001', svc: 'pan', status: 'open', thread: [{ ts: 1, dir: 'in', text: 'help' }] });
  store.putTranslation('hi', { text: { a: 'b' }, reviewed: true });
  return { dir, store, done: () => rmSync(dir, { recursive: true, force: true }) };
}

// A stand-in for Supabase's REST API. Records each request; reports `counts` for row-count reads.
function fakeProject(counts = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    const last = u.pathname.split('/').pop();
    const rpc = u.pathname.includes('/rpc/') ? last : null;
    calls.push({
      table: rpc ? null : last,
      rpc,
      method: opts.method,
      query: Object.fromEntries(u.searchParams),
      prefer: opts.headers?.prefer,
      body: opts.body ? JSON.parse(opts.body) : undefined,
    });
    if (rpc === 'save_user') return new Response('1', { status: 200 });
    if (opts.headers?.range === '0-0') return new Response('[]', { status: 200, headers: { 'content-range': `0-0/${counts[last] ?? 0}` } });
    if (opts.method === 'GET') return new Response('[]', { status: 200 });
    return new Response('', { status: 201 });
  };
  const target = new SupabaseStore({ url: 'https://example.supabase.co', key: 'sb_secret_test', fetchImpl, now: () => SAVED_AT });
  return { calls, target };
}

test('the dry run counts what the files hold, and skips link codes', () => {
  const f = fixture();
  try {
    const p = plan(readSource(f.dir));
    assert.deepEqual(summary(p), {
      users: 2, spend_daily: 1, user_daily: 1, payments: 1, trials: 1, referral_codes: 1,
      handoffs: 1, stats_daily: 2, translations: 1, settings: 1,
    });
    assert.deepEqual(p.settings.map(([k]) => k), ['motd']);
    assert.match(p.skipped.join(), /linkcodes/);
  } finally {
    f.done();
  }
});

test('each person is saved with their own last-activity time, wallet and link', async () => {
  const f = fixture();
  try {
    const proj = fakeProject();
    await apply(proj.target, plan(readSource(f.dir)));
    const saves = proj.calls.filter((c) => c.rpc === 'save_user');
    assert.equal(saves.length, 2);
    const u1 = saves.find((c) => c.body.p_id === 'u1').body;
    assert.equal(u1.p_expected, 0, 'a new record');
    assert.equal(u1.p_updated, SAVED_AT, 'the import is not activity, so the clock keeps the file time');
    assert.equal(u1.p_wallet, 500);
    assert.equal(u1.p_doc.reminders[0].id, 'r1');
    assert.equal(saves.find((c) => c.body.p_id === 'u2').body.p_link, 'u1');
  } finally {
    f.done();
  }
});

test('the other tables get their rows by key, and link codes are never written', async () => {
  const f = fixture();
  try {
    const proj = fakeProject();
    await apply(proj.target, plan(readSource(f.dir)));
    const rowsFor = (table) => proj.calls.filter((c) => c.table === table && c.method === 'POST');
    assert.deepEqual(rowsFor('spend_daily')[0].body, [{ day: '2026-10-10', llm_inr: 1.5, msg_inr: 2 }]);
    assert.equal(rowsFor('spend_daily')[0].query.on_conflict, 'day');
    assert.match(rowsFor('spend_daily')[0].prefer, /merge-duplicates/);
    assert.deepEqual(rowsFor('user_daily')[0].body, [{ day: '2026-10-10', user_id: 'u1', llm: 2, inbound: 1 }]);
    const stats = rowsFor('stats_daily')[0].body;
    assert.deepEqual(stats.map((r) => [r.event, r.source, r.n]).sort(), [['topup_paid', '', 1], ['topup_paid', 'pack', 1]]);
    assert.equal(rowsFor('payments')[0].body[0].ts_ms, 1699999999000);
    assert.equal(rowsFor('referral_codes')[0].query.on_conflict, 'code');
    assert.match(rowsFor('referral_codes')[0].prefer, /ignore-duplicates/, 'an existing code is never reassigned');
    assert.deepEqual(rowsFor('settings')[0].body, [{ key: 'motd', value: 'hello' }]);
    assert.equal(JSON.stringify(proj.calls).includes('linkcodes'), false);
    assert.equal(rowsFor('handoffs')[0].body[0].phone, '919000000001');
  } finally {
    f.done();
  }
});

test('the import refuses a project that already holds people, unless told to overwrite', async () => {
  const busy = fakeProject({ users: 3, payments: 0 });
  await assert.rejects(checkTarget(busy.target), /already holds 3 people/);
  assert.deepEqual(await checkTarget(busy.target, { overwrite: true }), { users: 3, payments: 0 });
  const empty = fakeProject({});
  assert.deepEqual(await checkTarget(empty.target), { users: 0, payments: 0 });
});

test('verify passes only when the project holds at least the files\' rows', async () => {
  const want = { users: 2, payments: 1 };
  const short = await verify(fakeProject({ users: 1, payments: 1 }).target, want);
  assert.equal(short.ok, false);
  assert.equal(short.rows.find((r) => r.table === 'users').ok, false);
  const full = await verify(fakeProject({ users: 2, payments: 1 }).target, want);
  assert.equal(full.ok, true);
});

test('an unreadable file stops the import with the file named', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.dir, 'users.json'), '{not json');
    assert.throws(() => readSource(f.dir), /users\.json cannot be read/);
  } finally {
    f.done();
  }
});
