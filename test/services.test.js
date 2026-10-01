import test from 'node:test';
import assert from 'node:assert/strict';
import { plain } from '../src/rich.js';
import { allMessages } from '../src/messages.js';
import { SERVICES, serviceById, baseService, matchState, portalLine, matchOption, nextQuestion, detectService, serviceFacts, translatableStrings, L10 } from '../src/services.js';
import { normField } from '../src/profile.js';
import { setup } from './helpers.js';

test('registry: every service has complete English and Hindi, and fits WhatsApp limits', () => {
  assert.equal(SERVICES.length, 9);
  const ids = new Set();
  for (const s of SERVICES) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    for (const lang of ['en', 'hi']) {
      assert.ok(s.name[lang] && s.name[lang].length <= 24, `${s.id} name ${lang}: ${s.name[lang]}`);
      assert.ok(s.blurb[lang] && s.blurb[lang].length <= 72, `${s.id} blurb ${lang}: ${s.blurb[lang]}`);
    }
    for (const q of s.intake) {
      assert.ok(q.en && q.hi, `${s.id}.${q.key} question text`);
      for (const o of q.options || []) {
        assert.ok(o[1].length <= 20, `${s.id} option ${o[1]}`);
        assert.ok(o[2].length <= 20, `${s.id} option hi ${o[2]}`);
      }
      if (q.type === 'opts') assert.ok(q.options.length <= 3, `${s.id}.${q.key} needs at most 3 buttons`);
    }
    for (const [rid, r] of Object.entries(s.routes)) {
      if (r.kind === 'info') {
        assert.ok(r.text.en && r.text.hi, `${s.id}.${rid}`);
        continue;
      }
      assert.ok(r.intro.en.includes('{n}') && r.intro.hi.includes('{n}'), `${s.id}.${rid} intro needs {n}`);
      assert.ok(r.steps.length >= 3, `${s.id}.${rid} steps`);
      for (const st of r.steps) {
        assert.ok(st.en && st.hi, `${s.id}.${rid} step needs both languages`);
        assert.ok(st.en.length < 1000 && st.hi.length < 1000, `${s.id}.${rid} step too long for a card`);
      }
    }
    if (!s.alias && s.intake.length + 0 >= 0 && s.id !== 'pan_fix') {
      for (const k of ['docs', 'fee', 'after', 'sheetName', 'self']) assert.ok(s[k]?.en && s[k]?.hi, `${s.id}.${k}`);
      assert.ok(s.sheet.length >= 5);
      for (const k of s.sheet) assert.ok(normField(k, k === 'mobile' ? '9876543210' : k === 'email' ? 'a@b.co' : k === 'dob' ? '01/01/1990' : k === 'pincode' ? '302001' : k === 'gender' ? 'male' : 'Some Value Here') !== null, `${s.id} sheet key ${k}`);
    }
  }
});

test('registry: pick() always lands on a route that exists, for every combination of answers', () => {
  for (const s of SERVICES) {
    const values = s.intake.map((q) => (q.type === 'yn' ? ['y', 'n'] : q.type === 'opts' ? q.options.map((o) => o[0]) : ['mh', 'other']));
    const walk = (i, ans) => {
      if (i === s.intake.length) {
        const q = nextQuestion(s, ans);
        assert.equal(q, null);
        const { route } = s.pick(ans);
        assert.ok(s.routes[route], `${s.id}: ${JSON.stringify(ans)} -> ${route}`);
        return;
      }
      const q = s.intake[i];
      if (q.when && !q.when(ans)) return walk(i + 1, ans);
      for (const v of values[i]) walk(i + 1, { ...ans, [q.key]: v });
    };
    walk(0, {});
  }
});

test('menu and button titles in every message table respect WhatsApp limits', () => {
  for (const lang of ['en', 'hi']) {
    for (const [k, v] of Object.entries(allMessages[lang])) {
      if (/^(btn_|menu_btn|svc_btn|topup_btn|lang_more_btn|remind_type_btn)/.test(k) && typeof v === 'string') assert.ok(v.replace(/\{\w+\}/g, '₹49').length <= 20, `${lang}.${k}: ${v}`);
      if (Array.isArray(v)) for (const [id, title, desc] of v) {
        assert.ok(title.length <= 24, `${lang}.${k} ${title}`);
        assert.ok(desc.length <= 72, `${lang}.${k} ${desc}`);
      }
    }
  }
});

test('state matching, option matching, service detection', () => {
  assert.equal(matchState('Maharashtra').id, 'mh');
  assert.equal(matchState('  बिहार ').id, 'br');
  assert.equal(matchState('I live in Tamil Nadu').id, 'tn');
  assert.equal(matchState('UP').id, 'up');
  assert.equal(matchState('Atlantis'), null);
  assert.match(portalLine('mh', 'en'), /aaplesarkar/);
  assert.match(portalLine('other', 'en'), /e-District/);
  const q = serviceById('dl').intake[0];
  assert.equal(matchOption(q, '3', 'en'), 'dup');
  assert.equal(matchOption(q, 'Lost or damaged', 'en'), 'dup');
  assert.equal(matchOption(q, 'खोया या खराब', 'hi'), 'dup');
  assert.equal(matchOption(q, 'banana', 'en'), null);
  assert.equal(detectService('how do I renew my driving licence?').id, 'dl');
  assert.equal(detectService('fee for tatkaal passport').id, 'passport');
  assert.equal(detectService('is my aadhaar linked to pan').id, 'pan');
  assert.equal(detectService('update address on aadhaar').id, 'aadhaar');
  assert.equal(detectService('OBC non creamy layer').id, 'caste');
  assert.equal(detectService('what is the weather'), null);
  assert.equal(baseService('pan_fix').id, 'pan');
});

test('AI facts carry the doubts: unverified items are listed so the AI says it is unsure', () => {
  const f = serviceFacts(serviceById('passport'));
  assert.match(f, /NOT CONFIRMED/);
  assert.match(f, /Fee Calculator/);
  assert.match(serviceFacts(serviceById('income')), /Do not quote a number/);
  assert.doesNotMatch(serviceFacts(serviceById('dl')), /\*/); // markdown stripped
});

test('translatable strings are unique, sized, and include the notes from pick()', () => {
  const list = translatableStrings();
  assert.ok(list.length > 100);
  assert.equal(new Set(list.map((x) => x.en)).size, list.length);
  assert.ok(list.some((x) => /under 18 both parents sign/.test(x.en)), 'passport minor note');
  assert.ok(list.some((x) => /e-commerce site/.test(x.en)), 'gst note');
  for (const x of list) if (x.max) assert.ok(x.en.length <= x.max, `${x.en} exceeds ${x.max}`);
});

// ---------------- through the real engine ----------------

async function open(say) {
  await say('hi');
  await say('1'); // English
  return say('1'); // Government services
}

const CASES = [
  // [service number, answers, expected step count, must appear in route text, must appear in first step]
  [3, ['1'], 7, /Sarathi/i, /sarathi\.parivahan\.gov\.in/],
  [3, ['2'], 7, /driving test/i, /sarathi\.parivahan\.gov\.in/],
  [3, ['3'], 6, /duplicate/i, /sarathi\.parivahan\.gov\.in/],
  [4, ['1'], 6, /free.*14 June 2027/s, /myaadhaar\.uidai\.gov\.in/],
  [4, ['2'], 5, /Seva Kendra/, /bookappointment\.uidai\.gov\.in/],
  [4, ['3'], 4, /Aadhaar app/, /Aadhaar app/],
  [5, ['1'], 6, /Form 6/, /voters\.eci\.gov\.in/],
  [5, ['2'], 5, /Form 8/, /voters\.eci\.gov\.in/],
  [5, ['3'], 3, /1950/, /electoralsearch/],
  [6, ['1', '2'], 8, /first passport/i, /passportindia\.gov\.in/],
  [6, ['2', '2'], 8, /renewal or reissue/i, /passportindia\.gov\.in/],
  [6, ['3', '2'], 8, /lost, stolen or damaged/i, /passportindia\.gov\.in/],
  [7, ['1'], 8, /No fee is charged/, /gst\.gov\.in/],
  [8, ['Maharashtra'], 5, /Aaple Sarkar/, /aaplesarkar\.mahaonline\.gov\.in/],
  [9, ['Bihar', '1'], 5, /serviceonline\.bihar\.gov\.in/, /serviceonline\.bihar\.gov\.in/],
  [9, ['Bihar', '3'], 5, /non-creamy-layer/i, /serviceonline\.bihar\.gov\.in/],
];

for (const [num, answers, steps, introRe, firstRe] of CASES) {
  test(`service ${num} with answers [${answers}] runs ${steps} steps`, async () => {
    const { say, done, store } = setup({ rates: { trialPaise: 100000 } });
    await open(say);
    let out = await say(String(num));
    for (const a of answers) out = await say(a);
    assert.match(out, introRe);
    assert.match(out, new RegExp(`Step 1/${steps}\\b`));
    assert.match(out, /Never send your OTP/);
    assert.match(out, /You do these yourself/);
    // walk to the last step
    let text = out;
    for (let i = 2; i <= steps; i++) text = await say('next');
    assert.match(text, new RegExp(`Step ${steps}/${steps}`));
    if (firstRe) assert.match(out, firstRe);
    const end = await say('next');
    assert.match(end, /That's it/);
    assert.equal(store.getUser('u1').svc, serviceById(String(num) === '3' ? 'dl' : SERVICES[num - 1].id).id);
    done();
  });
}

test('a real state with no portal on file gets general steps and names the state', async () => {
  const { say, done } = setup();
  await open(say);
  await say('8');
  const out = await say('Goa');
  assert.match(out, /don't have a portal on file for Goa/);
  assert.match(out, /e-District/);
  assert.match(out, /Step 1\/5/);
  done();
});

test('a state that does not exist is said so, and the question is asked again', async () => {
  const { say, done } = setup();
  await open(say);
  await say('8');
  const out = await say('Atlantis');
  assert.match(out, /don't know a state like that/);
  assert.doesNotMatch(out, /Step 1\//);
  assert.match(await say('Rajasthan'), /Step 1\/5/);
  done();
});

test('a mistyped state is understood without the AI', async () => {
  const { say, calls, done } = setup();
  await open(say);
  await say('8');
  assert.match(await say('mahrashtra'), /Aaple Sarkar/);
  assert.equal(calls.answer, 0);
  done();
});

test('a city or an odd spelling goes to the AI, which places it or says it is not a place', async () => {
  let reply = 'Karnataka';
  const { say, done } = setup({}, { async answer() { return { text: reply, usage: { in: 50, out: 3 } }; } });
  await open(say);
  await say('8');
  assert.match(await say('Bangalore'), /Seva Sindhu/);
  done();
  reply = 'NONE';
  const b = setup({}, { async answer() { return { text: reply, usage: { in: 50, out: 3 } }; } });
  await open(b.say);
  await b.say('8');
  assert.match(await b.say('Narnia'), /don't know a state like that/);
  b.done();
});

test('bad answers to an intake question ask again instead of guessing', async () => {
  const { say, tap, done } = setup();
  await open(say);
  await say('3');
  assert.match(await say('banana'), /tap one of the choices/i);
  const card = (await tap('banana')).at(-1);
  assert.equal(card.kind, 'buttons');
  assert.deepEqual(card.buttons.map((b) => b.id), ['ok', 'old', 'dup']);
  assert.ok(card.buttons.every((b) => b.title.length <= 20));
  done();
});

test('passport for a child adds the parents note and PAN "info" routes go back to the menu', async () => {
  const { say, done } = setup();
  await open(say);
  await say('6');
  await say('1');
  const kid = await say('1'); // under 18
  assert.match(kid, /both parents sign a declaration/);
  await say('menu');
  await say('1');
  await say('1'); // PAN
  const have = await say('1'); // already has a PAN
  assert.match(have, /don't need a new one/);
  assert.match(have, /Government services/); // menu shown again
  done();
});

test('docs and fees follow the current service; Hindi service text works', async () => {
  const { say, done } = setup();
  await say('hi');
  await say('2'); // Hindi
  await say('1'); // सेवाएँ
  await say('3'); // driving licence
  await say('1');
  assert.match(await say('docs'), /Form 1A/);
  const fees = await say('fees');
  assert.match(fees, /₹200/);
  assert.match(fees, /Step 1\/7|स्टेप 1\/7/); // fee reply is followed by the current step again
  done();
});

test('the form sheet is per service and only lists what that form asks for', async () => {
  const { say, tap, done, store } = setup();
  await open(say);
  await tap('fill'); // service not chosen: uses the core details
  await say('asha devi');
  await say('05/02/1990');
  await say('Ram Lal');
  await tap('female');
  await say('12 Gandhi Road, Jaipur');
  await say('302001');
  await tap('save');
  await say('menu');
  await say('1');
  await say('6'); // passport
  await say('1');
  await say('2'); // adult
  const r = (await tap('sheet')).find((x) => x.kind === 'sheet');
  assert.ok(r);
  assert.deepEqual(r.rows.map((x) => x.key), ['full_name', 'dob', 'father_name', 'gender', 'address', 'pincode']);
  assert.match(r.title, /passport application/);
  assert.deepEqual(r.missing.sort(), ["Email", "Mobile number", "Mother's name"].sort());
  done();
});

test('filling missing details in the middle of a guide returns to the same step', async () => {
  const { say, tap, done } = setup({ rates: { trialPaise: 100000 } });
  await open(say);
  await say('4'); // Aadhaar
  await say('1');
  await say('next');
  await say('next');
  const before = await say('sheet');
  assert.match(before, /nothing to put on a sheet/i);
  await tap('fill');
  await say('asha devi');
  await say('05/02/1990');
  await tap('female');
  await say('12 Gandhi Road, Jaipur');
  await say('302001');
  await say('9876543210');
  const last = await say('asha@example.com');
  assert.match(last, /Got it/);
  const save = await tap('once');
  assert.match(save.map(plain).join(''), /Step 3\/6/);
  done();
});

test('mobile and email are validated', () => {
  assert.equal(normField('mobile', '+91 98765-43210'), '9876543210');
  assert.equal(normField('mobile', '09876543210'), '9876543210');
  assert.equal(normField('mobile', '12345'), null);
  assert.equal(normField('mobile', '5876543210'), null);
  assert.equal(normField('email', 'Asha@Example.COM'), 'asha@example.com');
  assert.equal(normField('email', 'nope'), null);
  assert.equal(normField('mother_name', 'sita devi'), 'Sita Devi');
});
