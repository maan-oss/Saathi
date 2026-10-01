import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plain } from '../src/rich.js';
import { setup } from './helpers.js';
import { createStt, oggOpusSeconds } from '../src/stt.js';
import { createTranslator, validTranslation, collectItems } from '../src/translate.js';
import { createScheduler, whenText } from '../src/scheduler.js';
import { parseFutureDate, makeReminder, dueNotices, pruneReminders, daysUntil, fmtDue, istDate } from '../src/reminders.js';
import * as i18n from '../src/i18n.js';
import { parseInbound, buildPayloads } from '../src/whatsapp.js';
import { createVault } from '../src/vault.js';

const D = 86400000;
const ddmmyyyy = (ms) => {
  const [y, m, d] = istDate(ms).split('-');
  return `${d}/${m}/${y}`;
};

// A minimal Ogg/Opus file of a given length, enough for the duration reader.
function fakeOgg(seconds) {
  const b = Buffer.alloc(140);
  b.write('OggS', 0, 'latin1');
  b.write('OpusHead', 28, 'latin1');
  b.writeUInt16LE(312, 28 + 10);
  b.write('OggS', 100, 'latin1');
  b.writeBigUInt64LE(BigInt(Math.round(seconds * 48000) + 312), 106);
  return b;
}

// ---------------- inbound shapes ----------------

test('voice notes and documents are parsed from WhatsApp webhooks', () => {
  assert.deepEqual(parseInbound({ type: 'audio', audio: { id: 'A1', mime_type: 'audio/ogg; codecs=opus', voice: true } }), { type: 'voice', mediaId: 'A1', mime: 'audio/ogg; codecs=opus' });
  assert.deepEqual(parseInbound({ type: 'document', document: { id: 'D1', mime_type: 'Application/PDF', filename: 'x.pdf' } }), { type: 'document', mediaId: 'D1', mime: 'application/pdf', filename: 'x.pdf' });
  assert.equal(parseInbound({ type: 'sticker' }).type, 'other');
});

test('a template payload has the Cloud API shape', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  try {
    const { createWhatsApp } = await import('../src/whatsapp.js');
    const wa = createWhatsApp({ graphBase: 'http://x', graphVersion: 'v21.0', phoneId: 'P', whatsappToken: 'T', dryRun: false });
    assert.equal(await wa.sendTemplate('9199', { name: 'saathi_reminder', lang: 'en', params: ['Licence', 'in 7 days', '05 Feb 2027'] }), true);
  } finally {
    globalThis.fetch = orig;
  }
  assert.equal(calls[0].url, 'http://x/v21.0/P/messages');
  assert.deepEqual(calls[0].body.template, {
    name: 'saathi_reminder',
    language: { code: 'en' },
    components: [{ type: 'body', parameters: [{ type: 'text', text: 'Licence' }, { type: 'text', text: 'in 7 days' }, { type: 'text', text: '05 Feb 2027' }] }],
  });
});

// ---------------- speech to text ----------------

test('ogg/opus duration is read from the file, other data is left alone', () => {
  assert.equal(Math.round(oggOpusSeconds(fakeOgg(12))), 12);
  assert.equal(oggOpusSeconds(Buffer.from('not audio at all, just some bytes here, really not audio, long enough for the check')), null);
});

test('Sarvam is called first with the right request; OpenAI takes over when it fails', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, headers: init.headers, form: init.body });
    if (url.includes('sarvam')) return calls.sarvamFail ? { ok: false, status: 500, text: async () => 'boom' } : { ok: true, json: async () => ({ transcript: 'मुझे लाइसेंस रिन्यू करना है' }) };
    return { ok: true, json: async () => ({ text: 'renew my licence' }) };
  };
  const stt = createStt({ sarvamKey: 'sk-sarvam', sarvamBase: 'https://api.sarvam.test', openaiKey: 'sk-openai', openaiBase: 'https://api.openai.test' }, fetchFn);
  assert.equal(stt.enabled, true);
  const a = await stt.transcribe(fakeOgg(6), 'audio/ogg; codecs=opus');
  assert.equal(a.provider, 'sarvam');
  assert.equal(a.text, 'मुझे लाइसेंस रिन्यू करना है');
  assert.equal(calls[0].url, 'https://api.sarvam.test/speech-to-text');
  assert.equal(calls[0].headers['api-subscription-key'], 'sk-sarvam');
  assert.equal(calls[0].form.get('language_code'), 'unknown');
  assert.equal(calls[0].form.get('model'), 'saaras:v4');
  assert.ok(calls[0].form.get('file'));
  calls.sarvamFail = true;
  const b = await stt.transcribe(fakeOgg(6), 'audio/ogg');
  assert.equal(b.provider, 'openai');
  assert.equal(b.text, 'renew my licence');
  assert.match(calls.at(-1).url, /audio\/transcriptions$/);
  assert.equal(calls.at(-1).headers.authorization, 'Bearer sk-openai');
});

test('a voice note over 90 seconds is refused before any provider is called; no keys means off', async () => {
  let called = 0;
  const stt = createStt({ sarvamKey: 'k' }, async () => { called++; return { ok: true, json: async () => ({}) }; });
  await assert.rejects(() => stt.transcribe(fakeOgg(120), 'audio/ogg'), (e) => e.code === 'too_long');
  assert.equal(called, 0);
  assert.equal(createStt({}).enabled, false);
});

// ---------------- voice through the engine ----------------

const fakeStt = (impl) => ({ enabled: true, transcribe: impl });

test('voice note: transcribed, charged 50 paise, echoed back, then handled exactly like typed text', async () => {
  const { say, run, wallet, guard, done } = setup({}, {}, { stt: fakeStt(async () => ({ text: 'services', seconds: 8 })) });
  await say('hi');
  await say('1');
  const before = wallet();
  const res = await run({ type: 'voice', mediaId: 'v1' });
  const all = res.replies.map(plain).join('\n');
  assert.match(all, /I heard: "services"/);
  assert.equal(res.replies.at(-1).kind, 'list');
  assert.match(plain(res.replies.at(-1)), /New PAN card/);
  assert.equal(wallet(), before - 50);
  assert.ok(guard.todayInr() > 0); // speech cost was counted
  done();
});

test('voice note with nothing audible, a failure, or a note that is too long is refunded', async () => {
  for (const [impl, re] of [
    [async () => ({ text: '  ', seconds: 3 }), /couldn't hear anything clear/],
    [async () => { throw new Error('down'); }, /couldn't listen/],
    [async () => { throw Object.assign(new Error('long'), { code: 'too_long' }); }, /too long/],
  ]) {
    const { say, run, wallet, done } = setup({}, {}, { stt: fakeStt(impl) });
    await say('hi');
    await say('1');
    const before = wallet();
    const res = await run({ type: 'voice', mediaId: 'v1' });
    assert.match(plain(res.replies[0]), re);
    assert.equal(wallet(), before);
    done();
  }
});

test('voice notes are politely declined when speech-to-text is off, and when the AI budget is used up', async () => {
  let s = setup();
  await s.say('hi');
  await s.say('1');
  assert.match(plain((await s.run({ type: 'voice', mediaId: 'v' })).replies[0]), /not switched on/);
  s.done();
  s = setup({ dailyBudgetInr: 100 }, {}, { stt: fakeStt(async () => ({ text: 'menu' })) });
  await s.say('hi');
  await s.say('1');
  s.guard.recordLlm('other', { in: 0, out: 160_000 });
  const before = s.wallet();
  assert.match(plain((await s.run({ type: 'voice', mediaId: 'v' })).replies[0]), /paused for today/);
  assert.equal(s.wallet(), before);
  s.done();
});

test('the Saathi pack covers voice notes', async () => {
  const { say, tap, run, store, wallet, done } = setup({}, {}, { stt: fakeStt(async () => ({ text: 'menu', seconds: 3 })) });
  await say('hi');
  await say('1');
  const u = store.getUser('u1');
  u.wallet.paise = 5000;
  store.putUser('u1', u);
  await tap('pack');
  await tap('confirm_pack');
  const left = wallet();
  await run({ type: 'voice', mediaId: 'v' });
  assert.equal(wallet(), left);
  assert.equal(store.getUser('u1').packs[0].voice, 19);
  done();
});

// ---------------- PDFs ----------------

const pdf = (extra = 0) => ({ downloadMedia: async () => ({ buffer: Buffer.alloc(2000 + extra, 1), mime: 'application/pdf' }) });

test('a PDF is read like a photo: same consent, same price, sent to the AI as a PDF', async () => {
  const seen = [];
  const { say, run, wallet, done } = setup({ docCheck: true }, { async checkDocument(buf, mime) { seen.push(mime); return { type: 'aadhaar', readable: true, issues: [], fields: { name: 'ASHA DEVI', dob: '01/02/1990' }, usage: { in: 1, out: 1 } }; } }, pdf());
  await say('hi');
  await say('1');
  const ask = await run({ type: 'document', mediaId: 'd1', mime: 'application/pdf' });
  assert.match(plain(ask.replies[0]), /not saved/);
  await say('yes');
  const res = await run({ type: 'document', mediaId: 'd1', mime: 'application/pdf' });
  assert.match(plain(res.replies[0]), /Asha Devi/);
  assert.deepEqual(seen, ['application/pdf']);
  assert.equal(wallet(), 400);
  done();
});

test('a Word file gets a polite no; a PDF over 5 MB is refused and not charged', async () => {
  let s = setup({ docCheck: true }, {}, pdf());
  await s.say('hi');
  await s.say('1');
  assert.match(plain((await s.run({ type: 'document', mediaId: 'd', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).replies[0]), /can read text/);
  s.done();
  s = setup({ docCheck: true }, {}, pdf(6 * 1024 * 1024));
  await s.say('hi');
  await s.say('1');
  const u = s.store.getUser('u1');
  u.docConsent = true;
  s.store.putUser('u1', u);
  const res = await s.run({ type: 'document', mediaId: 'd', mime: 'application/pdf' });
  assert.match(plain(res.replies[0]), /too big/);
  assert.equal(s.wallet(), 500);
  s.done();
});

// ---------------- languages ----------------

test('validTranslation guards placeholders, bold markers and length', () => {
  const item = { en: 'Pay *{amt}* now', max: undefined };
  assert.equal(validTranslation(item, 'Pagar *{amt}* ahora'), true);
  assert.equal(validTranslation(item, 'Pagar *{amount}* ahora'), false);
  assert.equal(validTranslation(item, 'Pagar {amt} ahora'), false);
  assert.equal(validTranslation(item, ''), false);
  assert.equal(validTranslation({ en: 'Menu', max: 6 }, 'A very long title'), false);
  assert.equal(validTranslation({ en: 'Menu', max: 20 }, 'Mènu'), true);
  assert.equal(validTranslation(item, 'x'.repeat(200)), false);
});

test('every text to translate is collected once with WhatsApp limits', () => {
  const items = collectItems();
  assert.ok(items.length > 300);
  assert.equal(new Set(items.map((i) => i.k)).size, items.length);
  assert.ok(items.filter((i) => i.k.startsWith('m:menu_rows#')).length === 20);
  assert.ok(!items.some((i) => i.k === 'm:welcome'));
  const btn = items.find((i) => i.k === 'm:btn_next');
  assert.equal(btn.max, 20);
});

function fakeLlm(mode = 'ok') {
  let calls = 0;
  return {
    enabled: true,
    get calls() { return calls; },
    async translate(lang, items) {
      calls++;
      if (mode === 'down') throw new Error('api down');
      const map = {};
      for (const it of items) {
        const pre = `${lang.slice(0, 2).toLowerCase()}:`;
        map[it.k] = mode === 'bad' ? '???' : it.max && it.en.length + pre.length > it.max ? it.en : pre + it.en;
      }
      return { map, usage: { in: 100, out: 100 } };
    },
  };
}

test('a language is translated once, saved, registered, and used for menus and service texts', async () => {
  const { store, guard, done } = setup();
  const llm = fakeLlm();
  const tr = createTranslator({ llm, store, guard });
  const [a, b] = await Promise.all([tr.ensure('ta'), tr.ensure('ta')]); // two people at once
  assert.equal(a && b, true);
  const calls = llm.calls;
  assert.ok(calls >= 15);
  assert.equal(await tr.ensure('ta'), true);
  assert.equal(llm.calls, calls); // cached
  assert.equal(store.getTranslation('ta').machine, true);
  assert.equal(i18n.isReady('ta'), true);
  const { t, tr: raw } = await import('../src/messages.js');
  assert.match(t('ta', 'safety'), /^ta:/);
  assert.match(raw('ta', 'menu_rows')[0][1], /^ta:|Government services/);
  const { serviceById, L10 } = await import('../src/services.js');
  assert.match(L10(serviceById('dl').routes.renew.steps[0], 'ta'), /^ta:/);
  assert.equal(L10(serviceById('dl').routes.renew.steps[0], 'en'), serviceById('dl').routes.renew.steps[0].en);
  // a second store instance loads the saved file
  const { Store } = await import('../src/store.js');
  const again = new Store(store.dir);
  assert.equal(again.getTranslation('ta').machine, true);
  done();
});

test('a language that fails the checks is not switched on, and the person stays in English', async () => {
  for (const mode of ['bad', 'down']) {
    const { say, tap, done, store } = setup({}, {}, { translator: createTranslator({ llm: fakeLlm(mode), store: { getTranslation: () => null, putTranslation: () => {} }, guard: null }) });
    await say('hi');
    const more = await tap('3'); // More languages
    assert.equal(more.at(-1).kind, 'list');
    assert.equal(more.at(-1).rows.length, 9);
    const r = (await tap('2')).map(plain).join('\n'); // Telugu
    assert.match(r, /couldn't set up Telugu/);
    assert.equal(store.getUser('u1').lang, 'en');
    assert.equal(i18n.isReady('te'), false);
    done();
  }
});

test('picking Gujarati sends a wait message straight away, then the menu in Gujarati', async () => {
  const { store, guard, say, tap, run, done } = setup();
  const tr = createTranslator({ llm: fakeLlm(), store, guard });
  const early = [];
  const s2 = setup({}, {}, { translator: tr });
  await s2.say('hi');
  await s2.tap('3');
  const res = await s2.run({ type: 'reply', id: '5', title: 'ગુજરાતી' }, 'u1', { early: async (r) => early.push(...r) });
  assert.match(early[0], /Setting up Gujarati/);
  const all = res.replies.map(plain).join('\n');
  assert.match(all, /Language set to ગુજરાતી/);
  assert.equal(res.replies.at(-1).kind, 'list');
  assert.match(res.replies.at(-1).rows[1].title, /^gu:|Scan a document/);
  assert.equal(s2.store.getUser('u1').lang, 'gu');
  // AI answers are asked for in that language
  const q = await s2.say('6');
  await s2.say('how do I renew my licence');
  assert.match(s2.calls.systems[0], /Gujarati/);
  done(); s2.done();
});

test('typing a language name switches to it; a person named "Tamil" in a form is not switched', async () => {
  const { store, guard, say, tap, done } = setup();
  const s2 = setup({}, {}, { translator: createTranslator({ llm: fakeLlm(), store, guard }) });
  await s2.say('hi');
  await s2.say('1');
  const out = await s2.say('marathi');
  assert.match(out, /Language set to मराठी/);
  await s2.say('language');
  await s2.say('1');
  await s2.tap('fill');
  const asked = await s2.say('Tamil'); // this is a name, not a language
  assert.match(asked, /date of birth/i);
  assert.equal(s2.store.getUser('u1').lang, 'en');
  done(); s2.done();
});

// ---------------- reminders: rules ----------------

test('reminder dates: parsing, milestones, no duplicate sends', () => {
  const now = Date.parse('2026-09-30T06:00:00Z');
  assert.equal(parseFutureDate('05/02/2027', now), '2027-02-05');
  assert.equal(parseFutureDate('2027-02-05', now), '2027-02-05');
  assert.equal(parseFutureDate('5 Feb 2027', now), '2027-02-05');
  assert.equal(parseFutureDate('30/09/2026', now), '2026-09-30'); // today is fine
  assert.equal(parseFutureDate('29/09/2026', now), null); // past
  assert.equal(parseFutureDate('31/02/2027', now), null);
  assert.equal(parseFutureDate('05/02/2100', now), null); // absurdly far
  assert.equal(parseFutureDate('soon', now), null);
  assert.equal(fmtDue('2027-02-05'), '05 Feb 2027');

  const r = makeReminder({ id: 'a', type: 'dl', label: 'Licence', due: '2026-12-15' }, now); // 76 days away
  const u = { reminders: [r] };
  assert.deepEqual(dueNotices(u, now), []);
  let n = dueNotices(u, Date.parse('2026-11-16T06:00:00Z')); // 29 days left
  assert.equal(n.length, 1);
  assert.equal(n[0].milestone, 30);
  assert.deepEqual(dueNotices(u, Date.parse('2026-11-16T09:00:00Z')), []); // same day again: nothing
  n = dueNotices(u, Date.parse('2026-12-10T06:00:00Z')); // 5 days
  assert.equal(n[0].milestone, 7);
  n = dueNotices(u, Date.parse('2026-12-15T06:00:00Z'));
  assert.equal(n[0].milestone, 0);
  assert.equal(n[0].days, 0);
  assert.deepEqual(dueNotices(u, Date.parse('2026-12-16T06:00:00Z')), []); // after the date: never
});

test('a bot that was off for weeks sends only the most urgent notice, and a reminder made late skips old ones', () => {
  const now = Date.parse('2026-09-30T06:00:00Z');
  const u = { reminders: [makeReminder({ id: 'a', type: 'dl', label: 'X', due: '2026-10-03' }, now)] }; // 3 days left when made
  assert.deepEqual(dueNotices(u, now), []); // 30 and 7 already behind, day-of not yet
  const w = { reminders: [{ id: 'b', type: 'dl', label: 'Y', due: '2026-10-20', sent: { 30: false, 7: false, 0: false } }] };
  const n = dueNotices(w, now); // 20 days left: only the 30-day notice
  assert.equal(n.length, 1);
  const c = { reminders: [{ id: 'c', type: 'dl', label: 'Z', due: '2026-10-01', sent: { 30: false, 7: false, 0: false } }] };
  const m = dueNotices(c, now); // 1 day left and nothing sent: one message (the 7-day one, the most urgent milestone due), not two
  assert.equal(m.length, 1);
  assert.equal(m[0].milestone, 7);
  assert.deepEqual(dueNotices(c, now), []); // and never again
});

test('old reminders are pruned a week after their date', () => {
  const now = Date.parse('2026-09-30T06:00:00Z');
  const u = { reminders: [{ id: 'a', due: '2026-09-20', sent: {} }, { id: 'b', due: '2026-09-27', sent: {} }] };
  assert.equal(pruneReminders(u, now), 1);
  assert.deepEqual(u.reminders.map((r) => r.id), ['b']);
});

// ---------------- reminders: through the engine ----------------

const PHONE = '919812345678';
async function toReminders(s) {
  await s.say('hi');
  await s.say('1');
  return s.run({ type: 'text', text: 'remind' }, 'u1', { phone: PHONE });
}

test('set a licence reminder: type, date, charged 200 paise, phone kept encrypted', async () => {
  const s = setup();
  const card = (await toReminders(s)).replies.at(-1);
  assert.deepEqual(card.buttons.map((b) => b.id), ['remind_add', 'menu']);
  const list = (await s.run({ type: 'reply', id: 'remind_add' }, 'u1', { phone: PHONE })).replies.at(-1);
  assert.equal(list.kind, 'list');
  assert.deepEqual(list.rows.map((r) => r.id), ['dl', 'passport', 'itr', 'custom']);
  assert.match(plain((await s.run({ type: 'reply', id: 'dl' }, 'u1', { phone: PHONE })).replies[0]), /What is the date/);
  assert.match(plain((await s.run({ type: 'text', text: 'tomorrow-ish' }, 'u1', { phone: PHONE })).replies[0]), /future date/);
  const due = ddmmyyyy(Date.now() + 40 * D);
  const done = (await s.run({ type: 'text', text: due }, 'u1', { phone: PHONE })).replies.map(plain).join('\n');
  assert.match(done, /Reminder set: \*Licence expiry\*/);
  assert.equal(s.wallet(), 300);
  const u = s.store.getUser('u1');
  assert.equal(u.reminders.length, 1);
  assert.equal(u.reminders[0].sent[30], false); // 40 days away: the 30-day notice is still to come
  assert.ok(u.phoneSealed.startsWith('v1.'));
  const disk = readFileSync(join(s.dir, 'users.json'), 'utf8');
  assert.doesNotMatch(disk, new RegExp(PHONE));
  assert.equal((await createVault('test-key').open(u.phoneSealed)).phone, PHONE);
  s.done();
});

test('custom reminder asks for a name; remove works; the limit is 5; no phone means no reminders', async () => {
  const s = setup({ rates: { trialPaise: 100000 } });
  await toReminders(s);
  const ctx = { phone: PHONE };
  const go = (input) => s.run(input, 'u1', ctx);
  await go({ type: 'reply', id: 'remind_add' });
  await go({ type: 'reply', id: 'custom' });
  assert.match(plain((await go({ type: 'text', text: 'Mom\'s licence' })).replies[0]), /What is the date/);
  await go({ type: 'text', text: ddmmyyyy(Date.now() + 100 * D) });
  assert.equal(s.store.getUser('u1').reminders[0].label, "Mom's licence");
  for (let i = 0; i < 4; i++) {
    await go({ type: 'text', text: 'remind' });
    await go({ type: 'reply', id: 'remind_add' });
    await go({ type: 'reply', id: 'passport' });
    await go({ type: 'text', text: ddmmyyyy(Date.now() + (50 + i) * D) });
  }
  assert.equal(s.store.getUser('u1').reminders.length, 5);
  await go({ type: 'text', text: 'remind' });
  assert.match((await go({ type: 'reply', id: 'remind_add' })).replies.map(plain).join(''), /up to 5 reminders/);
  const rm = await go({ type: 'reply', id: 'remind_remove' });
  assert.equal(rm.replies.at(-1).kind, 'list');
  assert.match(plain((await go({ type: 'reply', id: '1' })).replies[0]), /Removed/);
  assert.equal(s.store.getUser('u1').reminders.length, 4);
  s.done();

  const t = setup();
  await t.say('hi');
  await t.say('1');
  const noPhone = await t.run({ type: 'reply', id: 'remind_add' }); // simulator / terminal: no phone number
  assert.match(plain(noPhone.replies[0]), /don't have a phone number/);
  t.done();
});

test('with no money and no pack the reminder shows the paywall before asking for a date', async () => {
  const s = setup({ rates: { trialPaise: 0 } });
  await toReminders(s);
  const r = await s.run({ type: 'reply', id: 'remind_add' }, 'u1', { phone: PHONE });
  const card = r.replies.at(-1);
  assert.deepEqual(card.buttons.map((b) => b.id), ['topup', 'pack', 'menu']);
  assert.match(plain(card), /costs ₹2/);
  s.done();
});

test('the guide offers a reminder at the end of licence and passport steps', async () => {
  const s = setup({ rates: { trialPaise: 100000 } });
  await s.say('hi');
  await s.say('1');
  await s.say('1');
  await s.say('3');
  await s.say('1');
  for (let i = 0; i < 6; i++) await s.say('next');
  const end = (await s.tap('next')).at(-1);
  assert.deepEqual(end.buttons.map((b) => b.id), ['remind', 'agent', 'menu']);
  s.done();
});

test('delete removes reminders and the sealed phone with everything else', async () => {
  const s = setup();
  await toReminders(s);
  await s.run({ type: 'reply', id: 'remind_add' }, 'u1', { phone: PHONE });
  await s.run({ type: 'reply', id: 'dl' }, 'u1', { phone: PHONE });
  await s.run({ type: 'text', text: ddmmyyyy(Date.now() + 40 * D) }, 'u1', { phone: PHONE });
  await s.say('delete');
  await s.say('yes');
  assert.equal(s.store.getUser('u1'), null);
  s.done();
});

// ---------------- reminders: the scheduler ----------------

test('scheduler: text inside the 24-hour window, template outside it, retried if WhatsApp refuses', async () => {
  const s = setup();
  const vault = createVault('test-key');
  const now = Date.now();
  const mk = async (id, lastInbound, lang = 'en') => {
    s.store.putUser(id, {
      state: 'menu', lang, lastInboundAt: lastInbound, phoneSealed: await vault.seal({ phone: `91${id}` }),
      reminders: [makeReminder({ id: 'r1', type: 'dl', label: 'Licence expiry', due: istDate(now + 7 * D) }, now - 30 * D)],
    });
  };
  await mk('1000000001', now - 3600 * 1000);
  await mk('1000000002', now - 30 * 3600 * 1000);
  await mk('1000000003', now - 30 * 3600 * 1000, 'hi');
  const sent = { text: [], tpl: [] };
  let refuse = false;
  const wa = {
    async send(to, text) { if (refuse) return 0; sent.text.push([to, text]); return 1; },
    async sendTemplate(to, t) { if (refuse) return false; sent.tpl.push([to, t]); return true; },
  };
  const sch = createScheduler({ store: s.store, vault, wa, guard: s.guard, config: { reminderTemplate: 'saathi_reminder' }, enqueue: (id, fn) => Promise.resolve().then(fn) });
  assert.equal(await sch.run(now), 3);
  assert.equal(sent.text.length, 1);
  assert.equal(sent.text[0][0], '911000000001');
  assert.match(sent.text[0][1], /Licence expiry\* is in 7 days/);
  assert.deepEqual(sent.tpl.map(([, t]) => [t.name, t.lang]), [['saathi_reminder', 'en'], ['saathi_reminder_hi', 'hi']]);
  assert.deepEqual(sent.tpl[0][1].params, ['Licence expiry', 'in 7 days', fmtDue(istDate(now + 7 * D))]);
  assert.equal(await sch.run(now + 3600 * 1000), 0); // nothing twice
  // refused sends are not marked as sent
  await mk('1000000004', now - 3600 * 1000);
  refuse = true;
  assert.equal(await sch.run(now), 0);
  assert.equal(s.store.getUser('1000000004').reminders[0].sent[7], false);
  refuse = false;
  assert.equal(await sch.run(now), 1);
  assert.equal(s.store.getUser('1000000004').reminders[0].sent[7], true);
  assert.match(whenText('hi', 0), /आज/);
  s.done();
});

test('scheduler stops at the spend cap and never touches users without reminders', async () => {
  const s = setup({ dailyBudgetInr: 0.1 });
  const vault = createVault('test-key');
  s.store.putUser('1000000009', { state: 'menu', lang: 'en', lastInboundAt: Date.now(), phoneSealed: await vault.seal({ phone: '91x' }), reminders: [makeReminder({ id: 'r', type: 'dl', label: 'L', due: istDate(Date.now() + 5 * D) }, Date.now() - 30 * D)] });
  s.store.putUser('1000000010', { state: 'menu', lang: 'en' });
  s.guard.recordMsg(); s.guard.recordMsg();
  let n = 0;
  const wa = { async send() { n++; return 1; }, async sendTemplate() { n++; return true; } };
  const sch = createScheduler({ store: s.store, vault, wa, guard: s.guard, config: { reminderTemplate: 't' }, enqueue: (id, fn) => Promise.resolve().then(fn) });
  assert.equal(await sch.run(), 0);
  assert.equal(n, 0);
  s.done();
});
