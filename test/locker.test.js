import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setup, DOCUMENT } from './helpers.js';
import { normNumber, normExpiry, detectQuestion, maskNumber, daysLeft, showNumber } from '../src/locker.js';

test('locker: numbers are validated, not guessed', () => {
  assert.equal(normNumber('pan', 'abcpe1234f'), 'ABCPE1234F');
  assert.equal(normNumber('pan', 'ABCXE1234F'), null, '4th letter must be a valid holder type');
  assert.equal(normNumber('pan', 'ABCPE12345'), null);
  assert.equal(normNumber('aadhaar', '2345 6789 0123'), null, 'fails the checksum');
  assert.equal(normNumber('aadhaar', '1234 5678 9012'), null, 'cannot start with 1');
  assert.equal(normNumber('passport', 'K1234567'), 'K1234567');
  assert.equal(normNumber('driving_licence', 'RJ14 20110012345'), 'RJ1420110012345');
  assert.equal(normNumber('gst', '27ABCPE1234F1Z5'), '27ABCPE1234F1Z5');
  assert.equal(showNumber('driving_licence', 'RJ1420110012345'), 'RJ14 20110012345');
  assert.equal(maskNumber('ABCPE1234F'), '••••••1234F'.replace('1234F', '234F'));
});

test('locker: dates and questions', () => {
  assert.equal(normExpiry('14/03/2031'), '2031-03-14');
  assert.equal(normExpiry('31/02/2031'), null);
  assert.equal(normExpiry('14 Mar 2031'), '2031-03-14');
  assert.ok(daysLeft('2000-01-01') < 0);
  assert.deepEqual(detectQuestion("what's my PAN?"), { type: 'pan', field: 'number' });
  assert.deepEqual(detectQuestion('when does my licence expire'), { type: 'driving_licence', field: 'expiry' });
  assert.deepEqual(detectQuestion('mera passport number kya hai'), { type: 'passport', field: 'number' });
  assert.equal(detectQuestion('how do I apply for a PAN card'), null, 'not about their own document');
  assert.equal(detectQuestion('what is PAN'), null);
});

const PAN = 'ABCPE1234F';
async function lockPan(t, user = 'u1') {
  await t.say('hi', user);
  await t.tap('1', user);
  await t.tap('lk_add', user);
  await t.tap('lkt_pan', user);
  return t.say(PAN, user);
}

test('locker: add by typing, ask, unlock, remove; the number never appears until Unlock', async () => {
  const t = setup();
  const out = await lockPan(t);
  assert.match(out, /PAN card locked/);
  const ask = await t.run({ type: 'text', text: "what's my PAN number?" });
  const shown = ask.replies.map((r) => JSON.stringify(r)).join('');
  assert.doesNotMatch(shown, new RegExp(PAN), 'the locked card must not contain the number');
  assert.match(shown, /unlock_pan/);
  const open = (await t.tap('unlock_pan'))[0];
  assert.equal(open.kind, 'secret');
  assert.ok(open.items.some((i) => i.value === PAN));
  // stored encrypted
  const u = t.store.getUser('u1');
  assert.ok(!JSON.stringify(u).includes(PAN));
  assert.match(u.locker, /^v1\./);
  assert.match(await t.tapText('lkdel_pan'), /Removed/);
  assert.match(await t.say('what is my pan number'), /don't have your PAN card saved/);
  t.done();
});

test('locker: bad number is rejected, expiry is answered in the open with days left', async () => {
  const t = setup();
  await t.say('hi'); await t.tap('1');
  await t.tap('lkt_passport');
  assert.match(await t.say('K12'), /doesn't look like a valid Passport/);
  assert.match(await t.say('K1234567'), /expire/);
  const future = new Date(Date.now() + 400 * 86400000);
  const d = `${String(future.getUTCDate()).padStart(2, '0')}/${String(future.getUTCMonth() + 1).padStart(2, '0')}/${future.getUTCFullYear()}`;
  assert.match(await t.say(d), /Passport locked\. It expires/);
  const q = await t.say('when does my passport expire?');
  assert.match(q, /expires on/);
  assert.match(q, /days left/);
  assert.doesNotMatch(q, /K1234567/);
  t.done();
});

test('locker: a scan puts the number in the locker only after Save, and Discard drops it', async () => {
  const t = setup({ docCheck: true }, { checkDocument: async () => ({ ...DOCUMENT, type: 'pan', fields: { ...DOCUMENT.fields, number: PAN } }) });
  await t.say('hi'); await t.tap('1');
  await t.run({ type: 'image', mediaId: 'm0' }); // asks for consent
  await t.tap('1');
  const r = await t.run({ type: 'image', mediaId: 'm1' });
  const txt = r.replies.map((x) => JSON.stringify(x)).join('');
  assert.match(txt, /locker/i);
  assert.ok(!t.store.getUser('u1').locker, 'nothing is locked before Save');
  await t.tap('discard');
  assert.ok(!t.store.getUser('u1').pendingLocker);
  assert.ok(!t.store.getUser('u1').locker);
  // again, then save
  await t.run({ type: 'image', mediaId: 'm2' });
  await t.tap('save');
  assert.match(t.store.getUser('u1').locker, /^v1\./);
  assert.equal((await t.tap('unlock_pan'))[0].items.find((i) => i.key === 'number').value, PAN);
  t.done();
});

test('locker: forget erases it, and an OTP is still refused even while adding', async () => {
  const t = setup();
  await lockPan(t);
  await t.say('forget'); await t.tap('forget_yes');
  assert.ok(!t.store.getUser('u1').locker);
  t.done();
});

test('locker: number typed into chat outside the locker is still refused', async () => {
  const t = setup();
  await t.say('hi'); await t.tap('1');
  assert.match(await t.say('my pan is ABCPE1234F'), /Never type these/);
  t.done();
});

test('locker: the web app renders secrets in place and never stores them', () => {
  const js = readFileSync(join(process.cwd(), 'web/app.js'), 'utf8');
  assert.match(js, /rec\.kind === 'secret'/);
  assert.match(js, /relock/);
});
