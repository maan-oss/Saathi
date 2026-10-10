// A save can be refused when another instance changed the same person's record first (ConflictError). These tests
// check that a refused save is read again and done again, so no money is lost and no reminder goes out twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { createScheduler } from '../src/scheduler.js';
import { makeReminder, istDate } from '../src/reminders.js';
import { SupabaseStore } from '../src/supastore.js';

const D = 86400000;
const conflict = () => Object.assign(new Error('the record was changed by another request'), { code: 'conflict' });

// Refuses the next `n` saves of any person, then behaves normally.
function refuseNext(store, n) {
  const real = store.putUser.bind(store);
  let left = n;
  store.putUser = (id, u) => {
    if (left-- > 0) throw conflict();
    return real(id, u);
  };
}

test('a reminder that went out is marked sent even when another instance saved the person first', async () => {
  const s = setup();
  const now = Date.now();
  const due = istDate(now + 7 * D);
  s.store.putUser('1000000001', {
    state: 'menu', lang: 'en', lastInboundAt: now, phoneSealed: 'sealed',
    reminders: [makeReminder({ id: 'r1', type: 'dl', label: 'Licence', due }, now - 30 * D)],
  });
  refuseNext(s.store, 1);
  let sends = 0;
  const wa = { async send() { sends++; return 1; }, async sendTemplate() { sends++; return true; } };
  const sch = createScheduler({ store: s.store, vault: { open: async () => ({ phone: '919000000001' }) }, wa, guard: s.guard, config: { reminderTemplate: 't' }, enqueue: (id, fn) => Promise.resolve().then(fn) });
  assert.equal(await sch.run(now), 1);
  assert.equal(s.store.getUser('1000000001').reminders[0].sent[7], true, 'the sent flag was saved after the retry');
  assert.equal(await sch.run(now + 3600 * 1000), 0, 'nothing is sent a second time');
  assert.equal(sends, 1);
  s.done();
});

test('a payment is credited once when the save conflicts, and a repeat webhook adds nothing', async () => {
  const s = setup();
  s.store.putUser('u1', { state: 'menu', lang: 'en' });
  s.store.putPayment('sv_conflict1', { userId: 'u1', paise: 5000, status: 'pending', ts: Date.now() });
  refuseNext(s.store, 2);
  const first = await s.bot.creditPayment({ ref: 'sv_conflict1', paymentId: 'pay_C1', paise: 5000 });
  assert.equal(first.ok, true);
  assert.equal(first.balance, 5000);
  assert.equal(s.store.getPayment('sv_conflict1').status, 'paid');
  const again = await s.bot.creditPayment({ ref: 'sv_conflict1', paymentId: 'pay_C1', paise: 5000 });
  assert.equal(again.ok, false);
  assert.equal(s.store.getUser('u1').wallet.paise, 5000);
  s.done();
});

test('a save that keeps conflicting gives up with the conflict, so the caller can see it', async () => {
  const s = setup();
  s.store.putUser('u2', { state: 'menu', lang: 'en' });
  s.store.putPayment('sv_conflict2', { userId: 'u2', paise: 2000, status: 'pending', ts: Date.now() });
  refuseNext(s.store, 100);
  await assert.rejects(s.bot.creditPayment({ ref: 'sv_conflict2', paymentId: 'pay_C2', paise: 2000 }), (e) => e.code === 'conflict');
  assert.equal(s.store.getPayment('sv_conflict2').status, 'pending');
  s.done();
});

test('SupabaseStore.kvTake reads and removes a row in one request, and returns null when it is gone', async () => {
  const calls = [];
  let body = [{ v: 'abc' }];
  const fake = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method, prefer: opts.headers.prefer });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const st = new SupabaseStore({ url: 'https://example.supabase.co', key: 'sb_secret_test', fetchImpl: fake, now: () => 1000 });
  assert.equal(await st.kvTake('linkcode:h'), 'abc');
  assert.equal(calls[0].method, 'DELETE');
  assert.match(calls[0].url, /\/rest\/v1\/kv\?k=eq\.linkcode%3Ah&expires_ms=gt\.1000&select=v$/);
  assert.equal(calls[0].prefer, 'return=representation');
  body = [];
  assert.equal(await st.kvTake('linkcode:h'), null);
  assert.equal(calls.length, 2);
});
