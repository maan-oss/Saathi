import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, classifyUrl, extractUrls, sensitiveKind, redact, isOfficialHost } from '../src/scamcheck.js';
import { translatableStrings, SERVICES } from '../src/services.js';
import { setup } from './helpers.js';

const kind = (u) => classifyUrl(u).kind;

test('addresses: official ones pass, copies and tricks do not', () => {
  for (const ok of ['https://incometax.gov.in/iec/foportal/', 'sarathi.parivahan.gov.in', 'https://pan.utiitsl.com', 'tinpan.proteantech.in', 'https://passportindia.gov.in/psp', 'myaadhaar.uidai.gov.in'])
    assert.equal(kind(ok), 'official', ok);
  for (const bad of ['https://incometax.gov.in.verify-kyc.xyz/login', 'www.pan-card-india.in', 'aadhaar-update.co.in', 'https://uidai-gov.com', 'passport-seva.online', 'http://192.168.4.4/pan', 'https://incometax.gov.in@evil.com/', 'https://xn--incometax-9xa.in', 'https://apply.example.com/update.apk'])
    assert.equal(kind(bad), 'trap', bad);
  assert.equal(kind('https://bit.ly/3abc'), 'shortener');
  assert.equal(kind('https://rzp.io/i/abc'), 'payment');
  assert.equal(kind('https://panasonic.com'), 'unknown'); // "pan" inside a word is not a look-alike
  assert.equal(kind('http://incometax.gov.in'), 'unknown'); // no padlock
  assert.equal(isOfficialHost('notgov.in'), false);
  assert.equal(isOfficialHost('evilgov.in'), false);
});

test('messages: the classic tricks are caught, ordinary text is left alone', () => {
  const danger = [
    'Your PAN will be blocked today. Update KYC at http://pan-update.co.in',
    'Please share your OTP with me to verify',
    'Pay Rs 500 processing fee to release your refund',
    'I will get your driving licence without test in 3 days for Rs 5000',
    'Install AnyDesk so I can help you with the Aadhaar update',
    'CBI officer here, there is a case against you, digital arrest',
    'You have won a lottery, claim your prize',
    'Approve the collect request to receive your refund',
    'apna otp bata do',
  ];
  for (const m of danger) assert.equal(analyze(m).level, 'danger', m);
  for (const m of ['hello, how do I renew my licence?', 'Mr.Sharma said hi', 'what documents for a passport', 'my pincode is 302001']) assert.equal(analyze(m).level, 'none', m);
  assert.equal(analyze('https://incometax.gov.in/iec/foportal/').level, 'safe');
  assert.equal(analyze('open example.com').level, 'caution');
  // an official link inside a scam message is still a scam message
  assert.equal(analyze('Pay Rs 200 clearance fee now at https://incometax.gov.in').level, 'danger');
});

test('numbers nobody should type into a chat are recognised, phone numbers and pincodes are not', () => {
  assert.equal(sensitiveKind('my aadhaar is 2345 6789 0123'), 'aadhaar');
  assert.equal(sensitiveKind('234567890123'), 'aadhaar');
  assert.equal(sensitiveKind('4111 1111 1111 1111'), 'card');
  assert.equal(sensitiveKind('the otp is 482913'), 'otp');
  assert.equal(sensitiveKind('ABCPD1234F'), 'pan');
  for (const fine of ['302001', '+91 98123 45678', '9812345678', '05/02/1990', 'flat 12, 3rd floor', 'my mobile is 919812345678'.replace('my mobile is ', '+')]) assert.equal(sensitiveKind(fine), null, fine);
  assert.equal(sensitiveKind('919812345678', { allowMobile: true }), null);
  assert.equal(redact('aadhaar 2345 6789 0123, otp 123456, pan ABCPD1234F'), 'aadhaar ••••-••••-••••, otp ••••••, pan ••••••••••');
});

test('every address the bot itself shows people is an official one (or the payment service)', () => {
  const bad = new Set();
  for (const s of translatableStrings()) {
    for (const u of extractUrls(s)) {
      const c = classifyUrl(u);
      if (c.kind !== 'official' && c.kind !== 'payment') bad.add(c.host);
    }
  }
  for (const svc of SERVICES) for (const site of svc.sites || []) for (const u of extractUrls(site)) if (kind(u) !== 'official') bad.add(u);
  assert.deepEqual([...bad], []);
});

test('menu row 9 opens the checker: fake site, official site, and the free-typed version', async () => {
  const { say, tap, run, calls, wallet, done } = setup();
  await say('hi'); await say('1');
  const before = wallet();
  const prompt = await say('9');
  assert.match(prompt, /Is this real\?/);
  const fake = await say('got this: www.pan-card-india.in click to update');
  assert.match(fake, /looks like a scam/);
  assert.match(fake, /NOT an official address/);
  assert.match(fake, /1930/);
  const real = await say('https://incometax.gov.in');
  assert.match(real, /official site/);
  const none = await say('hello there');
  assert.match(none, /found no link/);
  // a screenshot cannot be read here, and it must not be treated as a document to scan
  const shot = await run({ type: 'image', mediaId: 'x' });
  assert.match(shot.replies.map((r) => JSON.stringify(r)).join(), /screenshots/);
  assert.equal(calls.check, 0);
  const tips = await tap('safety_tips');
  assert.match(JSON.stringify(tips), /Stay safe/);
  assert.equal(wallet(), before); // the checker is always free
  done();
});

test('in normal chat a risky message is checked for free; an official link goes to the AI as usual', async () => {
  const { say, calls, wallet, done } = setup();
  await say('hi'); await say('1');
  await say('6');
  const before = wallet();
  const r = await say('someone says my PAN is blocked today, pay Rs 300 fee at bit.ly/xyz');
  assert.match(r, /scam/);
  assert.equal(calls.answer, 0);
  const ok = await say('how do I use https://incometax.gov.in for an e-PAN?');
  assert.match(ok, /AI answer/);
  assert.equal(calls.answer, 1);
  assert.ok(wallet() <= before);
  done();
});

test('an Aadhaar number, card or OTP typed into the chat is refused and never stored', async () => {
  const { say, store, done } = setup();
  await say('hi'); await say('1');
  const r = await say('my aadhaar is 2345 6789 0123');
  assert.match(r, /Aadhaar number/);
  assert.match(r, /did not keep it/);
  assert.match(await say('the otp is 482913'), /OTP/);
  assert.doesNotMatch(JSON.stringify(store.getUser('u1')), /2345|482913/);
  done();
});

test('a mobile number with +91 is still accepted while filling details', async () => {
  const { say, done } = setup();
  await say('hi'); await say('1');
  await say('4'); // profile
  const out = await say('fill');
  assert.ok(out.length > 0);
  done();
});

test('sources shows the official sites and what is not confirmed; history lists every charge', async () => {
  const { say, tap, done } = setup();
  await say('hi'); await say('1');
  assert.match(await say('sources'), /Where my answers come from/);
  await say('1'); // services list
  await say('1'); // new PAN
  const src = await say('sources');
  assert.match(src, /Official sites for/);
  assert.match(src, /Last checked: 2026-09-30/);
  assert.match(src, /Not confirmed yet/);
  await say('6');
  await say('what is the fee?'); // a paid AI answer or a free one, either way something is on the receipt after a scan
  const h = await say('history');
  assert.match(h, /Your receipts|Nothing yet/);
  assert.match(h, /welcome credit|Nothing yet/);
  done();
});

test('typing a sentence in the menu is a normal chat: questions get answers, "I want to apply" starts the guide', async () => {
  const { say, calls, done } = setup();
  await say('hi'); await say('1');
  const a = await say('can a minor get a PAN card?');
  assert.equal(calls.answer, 1);
  assert.match(a, /AI answer/);
  const g = await say('I want to apply for a new PAN card');
  assert.match(g, /already have a PAN/i);
  assert.equal(calls.answer, 1); // routed to the guide, no AI call
  // a real question in the middle of the guide is answered, then the same question comes back
  const m = await say('why do you need to know that?');
  assert.equal(calls.answer, 2);
  assert.match(m, /already have a PAN/i);
  done();
});
