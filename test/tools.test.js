import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, DOCUMENT } from './helpers.js';
import { createTools, ToolError } from '../src/tools.js';
import { createLinks, LinkError, normCode } from '../src/link.js';
import { createVault } from '../src/vault.js';

import { credit } from '../src/billing.js';
const seed = (r) => { const u = { state: 'menu', trialGiven: true }; credit(u, 500, 'test', 'test'); r.store.putUser('u1', u); };

function rig(over = {}, llm = {}) {
  const t = setup({ docCheck: true, hashSalt: 'salt', ...over }, llm);
  const vault = createVault('test-key');
  const config = { docCheck: true, hashSalt: 'salt', dailyBudgetInr: 100, monthlyBudgetInr: 1000, perUserDailyLlm: 8, ...over };
  const llmObj = { enabled: true, checkDocument: async () => ({ ...DOCUMENT }), ...llm };
  const tools = createTools({ store: t.store, vault, llm: llmObj, guard: t.guard, config });
  const links = createLinks({ store: t.store, config, vault });
  const code = async (p) => { try { await p; return null; } catch (e) { return e.code; } };
  return { ...t, tools, links, vault, run: (uid, op, a) => tools.run(uid, op, a), code };
}

test('tools: locker add, reveal, mask, remove', async () => {
  const r = rig();
  const list = await r.run('u1', 'locker.add', { type: 'pan', number: 'abcpe1234f' });
  assert.equal(list.docs[0].type, 'pan');
  assert.match(list.docs[0].masked, /\*|•|·/);
  assert.doesNotMatch(JSON.stringify(list), /ABCPE1234F/);
  assert.equal((await r.run('u1', 'locker.reveal', { type: 'pan' })).copy, 'ABCPE1234F');
  assert.equal(await r.code(r.run('u1', 'locker.add', { type: 'pan', number: '123' })), 'bad_number');
  assert.equal(await r.code(r.run('u1', 'locker.add', { type: 'nope', number: '1' })), 'bad_type');
  assert.equal((await r.run('u1', 'locker.remove', { type: 'pan' })).docs.length, 0);
  assert.equal(await r.code(r.run('u1', 'locker.reveal', { type: 'pan' })), 'not_found');
  r.done();
});

test('tools: nothing personal is stored unsealed', async () => {
  const r = rig();
  await r.run('u1', 'locker.add', { type: 'pan', number: 'ABCPE1234F' });
  await r.run('u1', 'details.set', { values: { full_name: 'Asha Devi' } });
  assert.doesNotMatch(JSON.stringify(r.store.getUser('u1')), /ABCPE1234F|Asha/);
  r.done();
});

test('tools: details validate and round-trip', async () => {
  const r = rig();
  const set = await r.run('u1', 'details.set', { values: { full_name: 'Asha Devi', pincode: '302001' } });
  assert.equal(set.bad.length, 0);
  const bad = await r.run('u1', 'details.set', { values: { pincode: '12' } });
  assert.ok(bad.bad.includes('pincode'));
  const got = await r.run('u1', 'details.get');
  assert.equal(got.fields.find((f) => f.key === 'full_name').value, 'Asha Devi');
  r.done();
});

test('tools: reminders add, dedupe, remove, reject past dates', async () => {
  const r = rig();
  const soon = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  let l = await r.run('u1', 'reminders.add', { label: 'Licence', due: soon });
  assert.equal(l.items.length, 1);
  l = await r.run('u1', 'reminders.add', { label: 'Licence', due: soon });
  assert.equal(l.items.length, 1);
  assert.equal(await r.code(r.run('u1', 'reminders.add', { label: 'Old', due: '2001-01-01' })), 'bad_date');
  assert.equal(await r.code(r.run('u1', 'reminders.add', { label: '', due: soon })), 'bad_label');
  l = await r.run('u1', 'reminders.remove', { id: l.items[0].id });
  assert.equal(l.items.length, 0);
  r.done();
});

test('tools: extras keep applications, ticks and prefs; junk is trimmed', async () => {
  const r = rig();
  const e = await r.run('u1', 'extras.set', { apps: [{ title: 'PAN correction', ref: 'ACK123', status: 'weird' }], checks: { pan: [0, 2] }, prefs: { syncChats: true } });
  assert.equal(e.apps[0].status, 'preparing');
  assert.equal(e.prefs.syncChats, true);
  const g = await r.run('u1', 'extras.get');
  assert.equal(g.apps[0].ref, 'ACK123');
  assert.equal(g.v, 1);
  r.done();
});

test('tools: chat sync is off until asked, stored sealed, and can be cleared', async () => {
  const r = rig();
  assert.equal((await r.run('u1', 'chats.get')).blob, null);
  await r.run('u1', 'chats.put', { blob: '{"list":[{"id":"x","items":[{"text":"secret question"}]}]}' });
  assert.doesNotMatch(JSON.stringify(r.store.getUser('u1')), /secret question/);
  assert.match((await r.run('u1', 'chats.get')).blob, /secret question/);
  await r.run('u1', 'chats.put', { blob: '' });
  assert.equal((await r.run('u1', 'chats.get')).blob, null);
  r.done();
});

test('tools: scan needs consent, charges, saves nothing until asked, then saves to locker and details', async () => {
  const r = rig({ freeAiPerDay: 0 }, { checkDocument: async () => ({ type: 'pan', readable: true, issues: [], number: 'ABCPE1234F', fields: DOCUMENT.fields, usage: { in: 10, out: 10 } }) });
  seed(r);
  assert.equal(await r.code(r.run('u1', 'scan', { buffer: Buffer.from('x'), mime: 'image/jpeg' })), 'consent');
  const res = await r.run('u1', 'scan', { buffer: Buffer.from('x'), mime: 'image/jpeg', consent: true });
  assert.ok(res.scanId);
  assert.ok(res.fields.length > 0);
  assert.equal((await r.run('u1', 'locker.list')).docs.length, 0);
  const s = await r.run('u1', 'scan.save', { scanId: res.scanId, locker: true, details: true });
  assert.equal(s.saved, 2);
  assert.equal((await r.run('u1', 'locker.list')).docs[0].type, 'pan');
  assert.equal((await r.run('u1', 'details.get')).fields.find((f) => f.key === 'full_name').value, 'Asha Devi');
  assert.equal(await r.code(r.run('u1', 'scan.save', { scanId: res.scanId, locker: true })), 'expired');
  r.done();
});

test('tools: an unreadable scan is refunded', async () => {
  const r = rig({}, { checkDocument: async () => ({ type: 'not_a_document', readable: false, issues: ['blurry'], usage: { in: 1, out: 1 } }) });
  seed(r);
  const before = 500;
  assert.equal(await r.code(r.run('u1', 'scan', { buffer: Buffer.from('x'), mime: 'image/jpeg', consent: true })), 'unclear');
  const u = r.store.getUser('u1');
  assert.ok((u.wallet?.paise ?? 0) >= before);
  r.done();
});

test('link: a code works once, only the right way, and links a device', async () => {
  const r = rig();
  r.store.putUser('main', { state: 'menu', lang: 'hi', reminders: [] });
  const c = r.links.newDeviceCode('main', 'Laptop');
  assert.match(c.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.doesNotMatch(JSON.stringify(r.store.getSetting('linkcodes')), new RegExp(normCode(c.code)));
  assert.equal(await r.code(Promise.resolve().then(() => r.links.joinDevice('AAAA-AAAA', 'dev2'))), 'bad_code');
  r.links.joinDevice(c.code.toLowerCase(), 'dev2', 'Phone');
  assert.equal(r.links.resolve('dev2'), 'main');
  assert.equal(await r.code(Promise.resolve().then(() => r.links.joinDevice(c.code, 'dev3'))), 'bad_code');
  assert.equal(r.links.devices('main', 'dev2').list.length, 2);
  r.done();
});

test('link: expired codes fail, and you cannot join yourself', async () => {
  const r = rig();
  r.store.putUser('main', { state: 'menu' });
  const c = r.links.newDeviceCode('main');
  assert.equal(await r.code(Promise.resolve().then(() => r.links.joinDevice(c.code, 'main'))), 'same');
  const all = r.store.getSetting('linkcodes');
  for (const k of Object.keys(all)) all[k].exp = Date.now() - 1;
  r.store.setSetting('linkcodes', all);
  assert.equal(await r.code(Promise.resolve().then(() => r.links.joinDevice(c.code, 'dev2'))), 'bad_code');
  r.done();
});

test('link: removing a device cuts access at once; limit of 5', async () => {
  const r = rig();
  r.store.putUser('main', { state: 'menu' });
  for (let i = 0; i < 5; i++) r.links.joinDevice(r.links.newDeviceCode('main').code, 'd' + i);
  assert.equal(await r.code(Promise.resolve().then(() => r.links.newDeviceCode('main'))), 'too_many');
  r.links.removeDevice('main', 'd0');
  assert.equal(r.links.resolve('d0'), 'd0');
  assert.equal(r.links.resolve('d1'), 'main');
  r.links.signOutOthers('main', 'd1');
  assert.equal(r.links.resolve('d2'), 'd2');
  r.links.unlinkSelf('d1');
  assert.equal(r.links.resolve('d1'), 'd1');
  r.done();
});

test('link: WhatsApp needs the code and then a Yes; data from that number merges in', async () => {
  const r = rig();
  r.store.putUser('main', { state: 'menu', reminders: [] });
  r.store.putUser('wa1', { state: 'menu', wallet: { paise: 500 }, reminders: [{ id: 'r9', label: 'Passport', due: '2030-01-01' }] });
  const c = r.links.newWaCode('main');
  assert.equal(await r.code(Promise.resolve().then(() => r.links.waStart('WRONG-CODE', 'wa1'))), 'bad_code');
  r.links.waStart(c.code, 'wa1');
  assert.equal(r.links.waPendingFor('wa1'), true);
  await r.links.waConfirm('wa1', '919999999999');
  assert.equal(r.links.resolve('wa1'), 'main');
  const m = r.store.getUser('main');
  assert.equal(m.waLinked, true);
  assert.equal(m.reminders.length, 1);
  assert.ok(m.wallet.paise >= 500);
  assert.doesNotMatch(JSON.stringify(m), /919999999999/);
  r.links.unlinkWa('main');
  assert.equal(r.links.resolve('wa1'), 'wa1');
  r.done();
});

test('link: guessing codes over WhatsApp is rate limited', async () => {
  const r = rig();
  r.store.putUser('main', { state: 'menu' });
  r.links.newWaCode('main');
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push(await r.code(Promise.resolve().then(() => r.links.waStart('BAD' + i + 'XXXXX', 'wa1'))));
  assert.equal(codes.at(-1), 'slow_down');
  r.done();
});

// ---------------- v5: bigger tools ----------------
import { rollReminder, pruneReminders, dueNotices, makeReminder } from '../src/reminders.js';
const ymdIn = (n) => new Date(Date.now() + 5.5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

test('tools: reminders keep a note and repeat, update, and mark done (yearly rolls, others go)', async () => {
  const r = rig();
  const due = ymdIn(20);
  let l = await r.run('u1', 'reminders.add', { label: 'ITR', due, note: 'gather form 16', repeat: 'yearly' });
  assert.equal(l.items[0].note, 'gather form 16');
  assert.equal(l.items[0].repeat, 'yearly');
  const id = l.items[0].id;
  l = await r.run('u1', 'reminders.update', { id, label: 'ITR filing', note: '' });
  assert.equal(l.items[0].label, 'ITR filing');
  assert.equal(l.items[0].note, '');
  assert.equal(await r.code(r.run('u1', 'reminders.update', { id, due: '2001-01-01' })), 'bad_date');
  assert.equal(await r.code(r.run('u1', 'reminders.update', { id: 'nope', label: 'x' })), 'not_found');
  l = await r.run('u1', 'reminders.done', { id });
  assert.equal(l.items.length, 1);
  assert.ok(l.items[0].left > 300, 'rolled to next year');
  await r.run('u1', 'reminders.add', { label: 'One off', due });
  const one = (await r.run('u1', 'reminders.list')).items.find((x) => x.label === 'One off');
  l = await r.run('u1', 'reminders.done', { id: one.id });
  assert.equal(l.items.length, 1);
  r.done();
});

test('reminders: a new date resets notices, yearly ones roll instead of being pruned', () => {
  const now = Date.parse('2026-09-30T06:00:00Z');
  const y = { ...makeReminder({ id: 'y', type: 'custom', label: 'Insurance', due: '2026-09-15', repeat: 'yearly' }, Date.parse('2026-08-01T00:00:00Z')), sent: { 30: true, 7: true, 0: true } };
  const u = { reminders: [y, { id: 'z', due: '2026-09-15', sent: {} }] };
  assert.equal(pruneReminders(u, now), 2);
  assert.deepEqual(u.reminders.map((x) => x.id), ['y']);
  assert.equal(u.reminders[0].due, '2027-09-15');
  assert.deepEqual(u.reminders[0].sent, { 30: false, 7: false, 0: false });
  const rolled = rollReminder({ id: 'q', label: 'A', due: '2024-02-29', repeat: 'yearly', note: 'n' }, now);
  assert.match(rolled.due, /^2027-02-28$/);
  assert.equal(rolled.note, 'n');
  // still inside the one-week grace: nothing moves, and no notice is sent for a past date
  const g = { reminders: [{ id: 'g', due: '2026-09-27', repeat: 'yearly', sent: { 30: true, 7: true, 0: true } }] };
  assert.deepEqual(dueNotices(g, now), []);
  assert.equal(g.reminders[0].due, '2026-09-27');
});

test('tools: applications keep history, expected-by date and service; junk history is dropped', async () => {
  const r = rig();
  const hist = Array.from({ length: 12 }, (_, i) => ({ s: 'applied', ts: 1000 + i }));
  const e = await r.run('u1', 'extras.set', { apps: [{ title: 'PAN', svc: 'pan', due: '2026-12-01', hist: [{ s: 'bogus', ts: 1 }, ...hist] }, { title: 'B', due: 'soon' }] });
  assert.equal(e.apps[0].hist.length, 8);
  assert.ok(e.apps[0].hist.every((h) => h.s === 'applied'));
  assert.equal(e.apps[0].due, '2026-12-01');
  assert.equal(e.apps[0].svc, 'pan');
  assert.equal(e.apps[1].due, '');
  const many = await r.run('u1', 'extras.set', { apps: Array.from({ length: 40 }, (_, i) => ({ title: 'a' + i, note: 'x'.repeat(200) })) });
  assert.equal(many.apps.length, 30);
  r.done();
});

test('tools: locker.check validates without storing, details.readiness counts what each guide needs', async () => {
  const r = rig();
  assert.deepEqual(await r.run('u1', 'locker.check', { type: 'pan', number: 'abcpe 1234f' }), { ok: true, pretty: 'ABCPE1234F' });
  assert.equal((await r.run('u1', 'locker.check', { type: 'pan', number: 'ABC' })).ok, false);
  assert.equal((await r.run('u1', 'locker.check', { type: 'aadhaar', number: '' })).ok, false);
  assert.equal(await r.code(r.run('u1', 'locker.check', { type: 'zzz', number: '1' })), 'bad_type');
  assert.equal((await r.run('u1', 'locker.list')).docs.length, 0);
  let rd = await r.run('u1', 'details.readiness');
  assert.equal(rd.pan.have, 0);
  assert.ok(rd.pan.missing.includes('full_name'));
  await r.run('u1', 'details.set', { values: { full_name: 'Asha Devi', pincode: '302001' } });
  rd = await r.run('u1', 'details.readiness');
  assert.equal(rd.pan.have, 2);
  assert.equal(rd.pan.have + rd.pan.missing.length, rd.pan.total);
  r.done();
});

test('tools: summary returns what the hub needs in one call', async () => {
  const r = rig();
  await r.run('u1', 'locker.add', { type: 'passport', number: 'A1234567', expiry: ymdIn(30) });
  await r.run('u1', 'reminders.add', { label: 'Soon', due: ymdIn(3) });
  await r.run('u1', 'extras.set', { apps: [{ title: 'Old app', svc: 'pan', status: 'waiting', date: ymdIn(-20) }] });
  const s = await r.run('u1', 'summary');
  assert.equal(s.docs[0].type, 'passport');
  assert.equal(s.reminders[0].left, 3);
  assert.equal(s.appsList[0].since, 20);
  assert.deepEqual(s.guides, {});
  assert.doesNotMatch(JSON.stringify(s), /A1234567/);
  r.done();
});
