import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { referralBonus, REFERRAL_WINDOW_MS } from '../src/billing.js';
import { createPayments, parsePaidEvent } from '../src/payments.js';

const DAY = 86400000;

test('referral share: 30% in the first month, 10% after, rounded down, nothing for bad amounts', () => {
  const now = Date.now();
  assert.equal(referralBonus(10000, now, now), 3000);
  assert.equal(referralBonus(10000, now - (REFERRAL_WINDOW_MS - DAY), now), 3000);
  assert.equal(referralBonus(10000, now - (REFERRAL_WINDOW_MS + DAY), now), 1000);
  assert.equal(referralBonus(1999, now, now), 599); // 30% of 19.99 is 5.997 rupees, rounded down to paise
  assert.equal(referralBonus(0, now, now), 0);
  assert.equal(referralBonus(12.5, now, now), 0);
});

test('referral codes: one per person, random, looked up both ways, removed with the account', () => {
  const dir = mkdtempSync(join(process.cwd(), '.test-ref-'));
  try {
    const store = new Store(dir);
    const a = store.refCodeFor('user-a');
    assert.match(a, /^[A-Z2-9]{6}$/);
    assert.equal(store.refCodeFor('user-a'), a, 'same code every time');
    assert.equal(store.userForRefCode(a.toLowerCase()), 'user-a', 'case does not matter');
    assert.equal(store.userForRefCode('NOPE00'), null);
    store.putUser('user-a', { wallet: { paise: 0, refs: [] } });
    store.deleteUser('user-a');
    assert.equal(store.userForRefCode(a), null, 'a removed account leaves no code behind');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a paid Checkout event carries the phone typed at Stripe, digits only', () => {
  const body = { type: 'checkout.session.completed', data: { object: { payment_status: 'paid', currency: 'inr', client_reference_id: 'r1', payment_intent: 'pi_1', amount_total: 5000, customer_details: { phone: '+91 98765 43210' } } } };
  assert.equal(parsePaidEvent(body).phone, '919876543210');
  body.data.object.customer_details = {};
  assert.equal(parsePaidEvent(body).phone, null);
});

test('checkout asks for a phone number, and the receipt link comes from the paid payment', async () => {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body || '' });
    if (String(url).includes('/v1/checkout/sessions')) return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/x' }), { status: 200 });
    return new Response(JSON.stringify({ latest_charge: { receipt_url: 'https://pay.stripe.com/receipts/x' } }), { status: 200 });
  };
  const p = createPayments({ stripeSecretKey: 'sk_test_x', publicUrl: 'https://example.test' }, fetchFn);
  await p.createLink({ ref: 'r1', paise: 5000, note: 'Saathi wallet top-up' });
  assert.match(calls[0].body, /phone_number_collection%5Benabled%5D=true/);
  const url = await p.receiptUrl('pi_1');
  assert.equal(url, 'https://pay.stripe.com/receipts/x');
  assert.match(calls[1].url, /\/v1\/payment_intents\/pi_1\?expand%5B%5D=latest_charge|expand\[\]=latest_charge/);
});
