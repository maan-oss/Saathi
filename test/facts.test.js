import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { credit } from '../src/billing.js';
import { crossFacts, serviceFacts, serviceById, setLiveFacts } from '../src/services.js';
import { createLiveFacts, grounded, pageText } from '../src/livefacts.js';

test('facts: the fee questions people ask are answerable from the facts', () => {
  const all = crossFacts();
  for (const needle of ['Rs 75', 'Rs 1,000', 'Rs 2,500', 'Rs 5,000', 'Rs 200', 'Rs 91', 'inoperative', '1 July 2026', 'Rs 750']) assert.ok(all.includes(needle), needle);
  assert.ok(serviceFacts(serviceById('aadhaar')).includes('PVC'));
});

test('facts: a question with no service still gets the full facts (never just a one-line overview)', async () => {
  const t = setup({}, {});
  const u = { state: 'menu', lang: 'en', trialGiven: true }; credit(u, 500, 'test', 'test'); t.store.putUser('w1', u);
  await t.run({ type: 'text', text: 'what is the penalty for not linking my card with the number thing' }, 'w1', { channel: 'web', ai: true });
  const sys = t.calls.systems.join('\n');
  assert.match(sys, /Rs 75/);
  assert.match(sys, /Answer first, with exact amounts/);
  t.done();
});

test('livefacts: keeps only lines whose numbers are on the page, and shows them to the assistant', async () => {
  const t = setup({}, {});
  const html = '<html><body><script>x=1</script>' + '<p>The fee for a new widget is Rs 999 from 1 January 2027.</p>'.repeat(20) + '</body></html>';
  const llm = { enabled: true, async answer() { return { text: '- The widget fee is Rs 999 from 1 January 2027.\n- The widget fee is Rs 123 from 5 May 2030.\nMore text that is long enough to be a line but has no numbers here.' }; } };
  const lf = createLiveFacts({ store: t.store, llm, fetchFn: async () => ({ ok: true, text: async () => html }), sources: { pan: ['https://example.gov.in/a'] }, log: { error() {} } });
  const r = await lf.refresh({ force: true });
  assert.equal(r.checked, 1);
  const f = serviceFacts(serviceById('pan'));
  assert.match(f, /LATEST READ FROM OFFICIAL PAGES/);
  assert.match(f, /Rs 999/);
  assert.doesNotMatch(f, /Rs 123/);
  setLiveFacts({});
  t.done();
});

test('livefacts: unreadable pages and AI failures change nothing', async () => {
  const t = setup({}, {});
  const bad = createLiveFacts({ store: t.store, llm: { enabled: true, answer: async () => { throw new Error('x'); } }, fetchFn: async () => { throw new Error('blocked'); }, sources: { pan: ['https://x.gov.in'] }, log: { error() {} } });
  await bad.refresh({ force: true });
  assert.doesNotMatch(serviceFacts(serviceById('pan')), /LATEST READ/);
  assert.equal(grounded('Fee is Rs 50', 'Rs 50'), true);
  assert.equal(grounded('Fee is Rs 51', 'Rs 50'), false);
  assert.match(pageText('<style>a{}</style><b>Hi&nbsp;there</b>'), /^Hi there$/);
  setLiveFacts({});
  t.done();
});
