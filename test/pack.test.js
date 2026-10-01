import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { findState } from '../src/states.js';
import { credit } from '../src/billing.js';

test('states: typos, codes and sentences resolve; made-up places do not', () => {
  assert.equal(findState('Maharastra').name, 'Maharashtra');
  assert.equal(findState('up').name, 'Uttar Pradesh');
  assert.equal(findState('i live in tamilnadu').name, 'Tamil Nadu');
  assert.equal(findState('Narnia'), null);
  assert.equal(findState('Atlantis'), null);
});

test('pack: "all info for PAN" gives one card, never puts private values in the reply', async () => {
  const t = setup({}, {});
  const u = { state: 'menu', lang: 'en', trialGiven: true }; credit(u, 500, 'test', 'test'); t.store.putUser('w9', u);
  const web = { channel: 'web', ai: true };
  const res = await t.run({ type: 'text', text: 'give me all info needed for PAN' }, 'w9', web);
  const r = res.replies.find((x) => x && x.kind === 'pack');
  assert.ok(r, 'a pack card came back');
  assert.match(r.docs, /Aadhaar/);
  assert.ok(r.fee.length > 10);
  const dob = r.fields.find((f) => f.key === 'dob');
  assert.ok(dob.sens && dob.set === false);
  assert.equal(JSON.stringify(r).includes('1990'), false);
  assert.ok(r.ids.some((i) => i.type === 'aadhaar'));
  assert.equal(t.calls.systems.length, 0, 'answered without the AI');
  t.done();
});
