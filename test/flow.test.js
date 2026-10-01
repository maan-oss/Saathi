import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { CostGuard } from '../src/costguard.js';
import { createBot } from '../src/flow.js';
import { createVault } from '../src/vault.js';
import { plain } from '../src/rich.js';
import { setup } from './helpers.js';

async function toEpanStep1(say) {
  await say('hi');
  await say('1'); // English
  await say('1'); // Government services
  await say('1'); // New PAN card
  await say('2'); // no PAN yet
  await say('1'); // adult
  return say('1'); // mobile linked
}

test('new user gets a bilingual welcome with language buttons, then a list menu', async () => {
  const { run, say, done } = setup();
  const r = await run({ type: 'text', text: 'hi' });
  assert.equal(r.replies[0].kind, 'buttons');
  assert.match(plain(r.replies[0]), /हिंदी/);
  const menu = (await run({ type: 'text', text: '1' })).replies[0];
  assert.equal(menu.kind, 'list');
  assert.equal(menu.rows.length, 10);
  assert.match(plain(menu), /Government services/);
  done();
});

test('happy path: instant e-PAN, all steps, then done', async () => {
  const { say, done } = setup();
  const route = await toEpanStep1(say);
  assert.match(route, /instant e-PAN/i);
  assert.match(route, /Never send your OTP/);
  assert.match(route, /Step 1\/5/);
  assert.match(await say('next'), /Step 2\/5/);
  assert.match(await say('back'), /Step 1\/5/);
  assert.match(await say('back'), /already at the first step/);
  for (let i = 2; i <= 5; i++) assert.match(await say('next'), new RegExp(`Step ${i}/5`));
  assert.match(await say('next'), /That's it/);
  done();
});

test('steps come with Next / Back / Menu buttons and taps work', async () => {
  const { say, tap, done } = setup();
  await toEpanStep1(say);
  const r = await tap('next');
  const card = r.at(-1);
  assert.equal(card.kind, 'buttons');
  assert.deepEqual(card.buttons.map((b) => b.id), ['next', 'back', 'menu']);
  assert.match(plain(card), /Step 2\/5/);
  done();
});

test('minor or no Aadhaar-linked mobile goes to the full form route', async () => {
  const { say, done } = setup();
  await say('hi');
  await say('1');
  await say('1');
  await say('1');
  await say('2');
  const minor = await say('2'); // not 18
  assert.match(minor, /parent or guardian/);
  assert.match(minor, /Step 1\/7/);
  await say('menu');
  await say('1');
  await say('1');
  await say('2');
  await say('1');
  const noMobile = await say('2');
  assert.match(noMobile, /Step 1\/7/);
  assert.doesNotMatch(noMobile, /parent or guardian/);
  done();
});

test('already has a PAN: no application route', async () => {
  const { say, done } = setup();
  await say('hi');
  await say('1');
  await say('1');
  await say('1');
  assert.match(await say('1'), /don't need a new one/);
  done();
});

test('Hindi works end to end', async () => {
  const { say, done } = setup();
  await say('hi');
  assert.match(await say('2'), /आपको क्या चाहिए/);
  await say('1');
  await say('1');
  await say('2');
  await say('1');
  const route = await say('हाँ');
  assert.match(route, /स्टेप 1\/5/);
  assert.match(route, /OTP/);
  done();
});

test('free-form question uses the AI, records cost, and charges 50 paise from the welcome credit (500)', async () => {
  const { say, calls, guard, wallet, done } = setup();
  await toEpanStep1(say);
  assert.equal(wallet(), 500);
  const answer = await say('what if I lost my phone?');
  assert.equal(answer, 'AI answer');
  assert.equal(calls.answer, 1);
  assert.ok(guard.todayInr() > 0);
  assert.equal(wallet(), 450);
  done();
});

test('when AI budget is exhausted the scripted guide still works, the AI is not called, nothing is charged', async () => {
  const { say, calls, guard, wallet, done } = setup({ dailyBudgetInr: 100 });
  await toEpanStep1(say);
  guard.recordLlm('other', { in: 0, out: 160_000 }); // pushes past 70%
  const busy = await say('what is the fee?');
  assert.match(busy, /Tap \*Next\*/);
  assert.equal(calls.answer, 0);
  assert.equal(wallet(), 500);
  assert.match(await say('next'), /Step 2\/5/);
  done();
});

test('AI failure degrades gracefully and refunds', async () => {
  const { say, wallet, done } = setup({}, { async answer() { throw new Error('boom'); } });
  await say('hi');
  await say('1');
  await say('6'); // ask a question
  assert.match(await say('anything'), /can't answer that right now/);
  assert.equal(wallet(), 500);
  done();
});

test('docs command and agent handoff work anywhere', async () => {
  const { say, run, done } = setup();
  await say('hi');
  await say('1');
  assert.match(await say('docs'), /pick a service first/i);
  await say('1'); // Government services
  await say('1'); // New PAN card
  assert.match(await say('docs'), /ID proof/);
  assert.match(await say('fees'), /₹91 plus GST/);
  const res = await run({ type: 'text', text: 'agent' });
  assert.ok(res.handoff);
  assert.equal(res.handoff.svc, 'pan');
  done();
});

test('delete asks first when there is a balance, then wipes everything', async () => {
  const { say, store, done } = setup();
  await say('hi');
  await say('1');
  assert.match(await say('delete'), /erases your profile/);
  assert.ok(store.getUser('u1'));
  assert.match(await say('yes'), /deleted everything/);
  assert.equal(store.getUser('u1'), null);
  done();
});

test('delete is immediate when nothing of value is held; welcome credit is not given twice', async () => {
  const { say, store, wallet, done } = setup();
  await say('hi');
  await say('1');
  const u = store.getUser('u1');
  u.wallet.paise = 0;
  store.putUser('u1', u);
  assert.match(await say('delete'), /deleted everything/);
  await say('hi');
  assert.equal(wallet(), 0); // same person came back: no second welcome credit
  done();
});

test('photo check is off by default', async () => {
  const { run, calls, done } = setup();
  await run({ type: 'text', text: 'hi' });
  await run({ type: 'text', text: '1' });
  const res = await run({ type: 'image', mediaId: 'm1' });
  assert.match(plain(res.replies[0]), /can't check photos yet/);
  assert.equal(calls.check, 0);
  done();
});

test('scan needs consent, charges 100 paise, and offers to save; saved data is encrypted on disk', async () => {
  const { run, tap, say, wallet, calls, dir, store, done } = setup({ docCheck: true });
  await say('hi');
  await say('1');
  const ask = await run({ type: 'image', mediaId: 'm1' });
  assert.match(plain(ask.replies[0]), /not saved/);
  assert.equal(calls.check, 0);
  await say('yes');
  const res = await run({ type: 'image', mediaId: 'm2' });
  const card = res.replies[0];
  assert.match(plain(card), /readable aadhaar/i);
  assert.match(plain(card), /Asha Devi/); // name tidied from ALL CAPS
  assert.match(plain(card), /01\/02\/1990/);
  assert.deepEqual(card.buttons.map((b) => b.id), ['save', 'once', 'discard']);
  assert.equal(calls.check, 1);
  assert.equal(wallet(), 400);
  assert.match((await tap('save')).map(plain).join(''), /Saved, encrypted/);
  const onDisk = readFileSync(join(dir, 'users.json'), 'utf8');
  assert.doesNotMatch(onDisk, /Asha|Gandhi|302001|01\/02\/1990/);
  assert.ok(store.getUser('u1').vault.startsWith('v1.'));
  done();
});

test('unclear photo asks for a retake and is not charged', async () => {
  const { run, say, wallet, done } = setup({ docCheck: true }, {
    async checkDocument() {
      return { type: 'aadhaar', readable: false, issues: ['blurry', 'glare'], usage: { in: 1, out: 1 } };
    },
  });
  await say('hi');
  await say('1');
  await run({ type: 'image', mediaId: 'm1' });
  await say('yes');
  const res = await run({ type: 'image', mediaId: 'm2' });
  assert.match(plain(res.replies[0]), /isn't clear enough \(blurry, glare\)/);
  assert.match(plain(res.replies[0]), /not charged/);
  assert.equal(wallet(), 500);
  done();
});

test('voice notes and other media get a polite reply', async () => {
  const { run, say, done } = setup();
  await say('hi');
  await say('1');
  const res = await run({ type: 'other' });
  assert.match(plain(res.replies[0]), /can read text/);
  done();
});

test('spammy user is silently capped', async () => {
  const { run, done } = setup({ perUserDailyMsgs: 3 });
  for (let i = 0; i < 3; i++) await run({ type: 'text', text: 'hi' }, 'spam');
  const res = await run({ type: 'text', text: 'hi' }, 'spam');
  assert.deepEqual(res.replies, []);
  done();
});

// ---------------- money ----------------

test('after the free daily messages and with no balance, the guide shows a paywall and does not advance', async () => {
  const { say, tap, store, done } = setup({ rates: { trialPaise: 0, freeMsgsPerDay: 3 } });
  await say('hi');
  await say('1'); // language (free state)
  await say('1'); // menu: services   (free 1)
  await say('1'); // New PAN card     (free 2)
  await say('2'); // no pan           (free 3)
  const blocked = await tap('1'); // the adult question would be msg 4
  const card = blocked.at(-1);
  assert.deepEqual(card.buttons.map((b) => b.id), ['topup', 'pack', 'menu']);
  assert.match(plain(card), /costs ₹0.15 and your balance is ₹0/);
  assert.equal(store.getUser('u1').state, 'svc_q'); // did not move on
  assert.equal(store.getUser('u1').ans.adult, undefined);
  done();
});

test('top up: link is created, credit lands once, duplicates and wrong amounts are refused', async () => {
  const { say, tap, tapText, links, bot, store, wallet, done } = setup();
  await say('hi');
  await say('1');
  const list = (await tap('topup'))[0];
  assert.equal(list.kind, 'list');
  assert.deepEqual(list.rows.map((r) => r.id), ['pay_2000', 'pay_5000', 'pay_10000', 'pay_20000']);
  const msg = await tapText('pay_5000');
  assert.match(msg, /https:\/\/pay\.test\//);
  assert.equal(links[0].paise, 5000);
  const ref = links[0].ref;
  assert.deepEqual(await bot.creditPayment({ ref, paymentId: 'pay_X', paise: 4000 }), { ok: false, reason: 'amount_mismatch' });
  assert.equal(wallet(), 500);
  const ok = await bot.creditPayment({ ref, paymentId: 'pay_X', paise: 5000 });
  assert.equal(ok.ok, true);
  assert.equal(ok.balance, 5500);
  const again = await bot.creditPayment({ ref, paymentId: 'pay_X', paise: 5000 });
  assert.equal(again.ok, false);
  assert.equal(wallet(), 5500);
  assert.equal((await bot.creditPayment({ ref: 'nope', paymentId: 'p', paise: 1 })).reason, 'unknown_ref');
  assert.equal(store.getPayment(ref).status, 'paid');
  done();
});

test('top up says so plainly when payments are not configured', async () => {
  const { say, tapText, done } = setup({}, {}, { payments: false });
  await say('hi');
  await say('1');
  assert.match(await tapText('pay_5000'), /Top-ups are not open yet/);
  done();
});

test('PAN pack: needs confirmation, is paid from the wallet, then guide messages, scans and sheets stop costing', async () => {
  const { say, tap, tapText, store, wallet, run, done } = setup({ docCheck: true, rates: { freeMsgsPerDay: 0 } });
  await say('hi');
  await say('1');
  let u = store.getUser('u1');
  u.wallet.paise = 5000;
  u.docConsent = true;
  store.putUser('u1', u);
  assert.match(await tapText('pack'), /Saathi pack, ₹49/);
  assert.equal(wallet(), 5000); // nothing charged yet
  assert.match(await tapText('confirm_pack'), /Saathi pack is active/);
  assert.equal(wallet(), 100);
  await say('1'); // guide messages are free now
  await say('1');
  await say('2');
  await say('1');
  assert.equal(wallet(), 100);
  await run({ type: 'image', mediaId: 'm' }); // scan from the pack
  assert.equal(wallet(), 100);
  assert.equal(store.getUser('u1').packs[0].scans, 7);
  done();
});

test('pack with too little money sends the user to top up', async () => {
  const { say, tap, done } = setup();
  await say('hi');
  await say('1');
  await tap('pack');
  const r = await tap('confirm_pack');
  assert.match(r.map(plain).join(''), /pack costs ₹49 and your balance is ₹5/);
  assert.equal(r.at(-1).kind, 'list');
  done();
});

// ---------------- profile, forms, sheet ----------------

async function fillByText(say, tap) {
  await tap('fill');
  assert.match(await say('asha devi'), /date of birth/i);
  assert.match(await say('31/02/1990'), /doesn't look right/); // impossible date
  assert.match(await say('5 Feb 1990'), /father/i);
  await say('Ram Lal');
  const g = await tap('female'); // gender buttons
  await say('12 Gandhi Road, Jaipur');
  return say('302001');
}

test('fill by text: validates each answer, then offers to save (encrypted), profile shows it', async () => {
  const { say, tap, tapText, store, dir, done } = setup();
  await say('hi');
  await say('1');
  const last = await fillByText(say, tap);
  assert.match(last, /Got it/);
  assert.match(last, /Save these details/);
  assert.match(await tapText('save'), /Saved, encrypted/);
  const shown = await tapText('profile');
  assert.match(shown, /Asha Devi/);
  assert.match(shown, /05\/02\/1990/);
  assert.match(shown, /Female/);
  assert.doesNotMatch(readFileSync(join(dir, 'users.json'), 'utf8'), /Asha|Jaipur|302001/);
  assert.equal(store.getUser('u1').pending, undefined);
  done();
});

test('form (WhatsApp Flow) path: sends a form with saved values, cleans what comes back, re-asks on bad values', async () => {
  const { say, tap, run, done } = setup({ flowsEnabled: true });
  await say('hi');
  await say('1');
  const form = (await tap('fill'))[0];
  assert.equal(form.kind, 'form');
  assert.deepEqual(form.fields.map((f) => f.key), ['full_name', 'dob', 'father_name', 'gender', 'state', 'address', 'pincode', 'mother_name', 'mobile', 'email']);
  const bad = await run({ type: 'form', id: 'details', values: { full_name: 'asha devi', dob: '1990-02-05', father_name: 'Ram Lal', gender: 'female', address: '12 Gandhi Road, Jaipur', pincode: '3020' } });
  assert.match(plain(bad.replies[0]), /PIN code/);
  assert.equal(bad.replies.at(-1).kind, 'form');
  assert.equal(bad.replies.at(-1).values.full_name, 'Asha Devi'); // good fields were kept and shown back
  const ok = await run({ type: 'form', id: 'details', values: { pincode: '302001' } });
  assert.match(ok.replies.map(plain).join('\n'), /Save these details/);
  done();
});

test('sheet: copy-ready rows, charged 300 paise from the welcome credit, then a second sheet asks for money', async () => {
  const { say, tap, run, wallet, done } = setup();
  await say('hi');
  await say('1');
  await fillByText(say, tap);
  await tap('save');
  const pick = await tap('sheet'); // no service chosen yet: asks which form
  assert.equal(pick.at(-1).kind, 'list');
  const r = await tap('1'); // New PAN card
  const sheet = r.find((x) => x.kind === 'sheet');
  assert.ok(sheet);
  assert.deepEqual(sheet.rows.map((x) => x.key), ['full_name', 'dob', 'father_name', 'gender', 'address', 'pincode']);
  assert.match(sheet.text, /Never type your Aadhaar number here/);
  assert.equal(wallet(), 200);
  const again = await tap('sheet');
  assert.equal(again.some((x) => x.kind === 'sheet'), false);
  assert.match(again.map(plain).join(''), /costs ₹3 and your balance is ₹2/);
  done();
});

test('sheet with no details yet asks for them, and builds itself after a scan is saved', async () => {
  const { say, tap, run, done } = setup({ docCheck: true });
  await say('hi');
  await say('1');
  await tap('sheet');
  const none = await tap('1');
  assert.deepEqual(none.at(-1).buttons.map((b) => b.id), ['fill', 'scan', 'menu']);
  await say('scan');
  await say('x'); // any text keeps state
  const u1 = await run({ type: 'image', mediaId: 'm' });
  await say('yes');
  await run({ type: 'image', mediaId: 'm' });
  const saved = await tap('save');
  assert.ok(saved.some((x) => x.kind === 'sheet'));
  done();
});

test('use once does not keep anything after the sheet', async () => {
  const { say, tap, run, store, done } = setup({ docCheck: true });
  await say('hi');
  await say('1');
  await store.getUser('u1');
  const u = store.getUser('u1');
  u.docConsent = true;
  store.putUser('u1', u);
  await run({ type: 'image', mediaId: 'm' });
  await tap('once');
  await tap('sheet');
  const r = await tap('1');
  assert.ok(r.some((x) => x.kind === 'sheet'));
  const after = store.getUser('u1');
  assert.equal(after.vault, undefined);
  assert.equal(after.pending, undefined);
  done();
});

test('forget erases the profile but keeps the wallet', async () => {
  const { say, tap, tapText, store, wallet, done } = setup();
  await say('hi');
  await say('1');
  await fillByText(say, tap);
  await tap('save');
  assert.match(await tapText('forget'), /Erase your saved profile/);
  assert.match(await tapText('forget_yes'), /Erased your saved profile/);
  assert.equal(store.getUser('u1').vault, undefined);
  assert.equal(wallet(), 500);
  assert.match(await tapText('profile'), /don't have your details yet/);
  done();
});

test('saved details are never sent to the AI', async () => {
  const { say, tap, calls, done } = setup();
  await say('hi');
  await say('1');
  await fillByText(say, tap);
  await tap('save');
  await say('6');
  await say('how much is the fee?');
  assert.equal(calls.answer, 1);
  assert.doesNotMatch(calls.systems[0], /Asha|Ram Lal|302001|Gandhi/);
  done();
});

test('wallet screen shows the balance and the pack price once each, with no doubled amount', async () => {
  const { say, tapText, done } = setup();
  await say('hi');
  await say('1');
  const t = await tapText('wallet');
  assert.match(t, /Your wallet: ₹5\b(?!₹)/);
  assert.match(t, /Saathi pack ₹49/);
  assert.doesNotMatch(t, /₹5₹/);
  done();
});
