import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { createTools } from '../src/tools.js';
import { createVault } from '../src/vault.js';
import { SERVICES } from '../src/services.js';

function rig() {
  const t = setup({ hashSalt: 'salt' }, {});
  const tools = createTools({ store: t.store, vault: createVault('test-key'), llm: { enabled: false }, guard: t.guard, config: { hashSalt: 'salt' } });
  return { ...t, run: (op, a) => tools.run('g1', op, a), code: async (p) => { try { await p; return null; } catch (e) { return e.code; } } };
}
const GUIDES = ['pan', 'aadhaar', 'dl', 'passport', 'voter', 'gst', 'income', 'caste'];

test('guides: every guide loads in English and Hindi with documents, tips and a fee answer', async () => {
  const r = rig();
  for (const id of GUIDES) for (const lang of ['en', 'hi']) {
    const g = await r.run('guide.get', { id, lang });
    assert.ok(g.name && g.blurb, id);
    assert.ok(g.docs.length >= 4, `${id} docs`);
    assert.ok(g.tips.length >= 3, `${id} tips`);
    assert.ok(g.fee.length > 20, `${id} fee`);
    for (const d of g.docs) assert.ok(d.label && d.id, `${id} doc`);
    if (lang === 'hi') assert.match(g.docs[0].label, /[ऀ-ॿ]/, `${id} hindi doc`);
  }
  r.done();
});

test('guides: the route finder asks questions in order and ends on the right route', async () => {
  const r = rig();
  let x = await r.run('guide.route', { id: 'pan', lang: 'en', answers: {} });
  assert.equal(x.question.key, 'has_pan');
  x = await r.run('guide.route', { id: 'pan', lang: 'en', answers: { has_pan: 'n' } });
  assert.equal(x.question.key, 'adult');
  x = await r.run('guide.route', { id: 'pan', lang: 'en', answers: { has_pan: 'n', adult: 'y', mobile: 'y' } });
  assert.equal(x.route.id, 'epan');
  assert.equal(x.route.steps.length, 5);
  assert.doesNotMatch(x.route.intro, /\{n\}|\{note\}/);
  x = await r.run('guide.route', { id: 'pan', lang: 'en', answers: { has_pan: 'y' } });
  assert.equal(x.route.kind, 'info');
  // junk answers are ignored, not trusted
  x = await r.run('guide.route', { id: 'pan', lang: 'en', answers: { has_pan: '<script>' } });
  assert.equal(x.question.key, 'has_pan');
  // a misspelt state resolves and fills the portal into the steps
  x = await r.run('guide.route', { id: 'income', lang: 'en', answers: { state: 'Maharastra' } });
  assert.equal(x.route.kind, 'steps');
  assert.match(x.route.steps.join(' '), /Aaple Sarkar/);
  x = await r.run('guide.route', { id: 'income', lang: 'en', answers: { state: 'Narnia' } });
  assert.equal(x.question.key, 'state');
  assert.equal(await r.code(r.run('guide.route', { id: 'nope' })), 'unknown_service');
  r.done();
});

test('guides: the fee calculator adds up from the official tables', async () => {
  const r = rig();
  const fee = (id, sel) => r.run('guide.fee', { id, lang: 'en', sel });
  assert.deepEqual((await fee('pan', { kind: 'epan' })).total, [0, 0]);
  assert.deepEqual((await fee('pan', { kind: 'new' })).total, [107, 107]);
  assert.deepEqual((await fee('dl', { what: 'late', years: 3 })).total, [2300, 2300]);
  assert.deepEqual((await fee('dl', { what: 'renew', cls: true })).total, [700, 700]);
  assert.equal((await fee('dl', { what: 'dup' })).total, null);
  assert.deepEqual((await fee('passport', { book: 'p36', tatkal: true })).total, [5000, 5000]);
  assert.deepEqual((await fee('passport', { book: 'minor', rebate: true })).total, [1575, 1575]);
  assert.deepEqual((await fee('passport', { book: 'lost' })).total, [4250, 6000]);
  assert.deepEqual((await fee('aadhaar', { where: 'centre', what: 'bio', both: true })).total, [125, 125]);
  assert.deepEqual((await fee('aadhaar', { where: 'online' })).total, [0, 0]);
  assert.deepEqual((await fee('voter', {})).total, [0, 0]);
  // bad input falls back to defaults instead of throwing or producing nonsense
  assert.deepEqual((await fee('dl', { what: 'late', years: 9999 })).total, [300 + 1000 * 14, 300 + 1000 * 14]);
  assert.deepEqual((await fee('pan', { kind: 'hax' })).total, [0, 0]);
  assert.equal(await r.code(fee('income', {})), 'no_calc');
  r.done();
});

test('guides: progress is saved with your extras, cleaned, and shows on the hub summary', async () => {
  const r = rig();
  await r.run('extras.set', { guides: { pan: { route: 'epan', ans: { has_pan: 'n', adult: 'y' }, steps: [0, 1, 99, -1, 'x'], docs: ['id', 'photo'], fee: { kind: 'new', junk: { a: 1 } } }, notaservice: { steps: [1] } } });
  const g = (await r.run('extras.get')).guides;
  assert.deepEqual(Object.keys(g), ['pan']);
  assert.deepEqual(g.pan.steps.filter((n) => n >= 0 && n < 30), g.pan.steps);
  assert.ok(!g.pan.steps.includes(99));
  assert.deepEqual(g.pan.docs, ['id', 'photo']);
  const s = await r.run('summary');
  assert.equal(s.guides.pan.docs.length, 2);
  r.done();
});
