import test from 'node:test';
import assert from 'node:assert/strict';
import { charge, refund, credit, buyPack, grantTrial, activePack, balance, inr } from '../src/billing.js';

const cfg = { rates: { trialPaise: 500, freeMsgsPerDay: 2 } };
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 1, 6, 0, 0); // 11:30 IST

test('money is formatted from whole paise', () => {
  assert.equal(inr(4900), '₹49');
  assert.equal(inr(15), '₹0.15');
  assert.equal(inr(250), '₹2.50');
  assert.equal(inr(0), '₹0');
});

test('welcome credit is given once', () => {
  const u = {};
  assert.equal(grantTrial(u, cfg), 500);
  assert.equal(grantTrial(u, cfg), 0);
  assert.equal(balance(u), 500);
});

test('messages: free allowance per IST day, then paid, and the counter resets next day', () => {
  const u = { wallet: { paise: 30, refs: [], history: [] } };
  assert.equal(charge(u, cfg, 'msg', T0).paid, 'free');
  assert.equal(charge(u, cfg, 'msg', T0).paid, 'free');
  assert.equal(charge(u, cfg, 'msg', T0).paid, 'wallet');
  assert.equal(balance(u), 15);
  assert.equal(charge(u, cfg, 'msg', T0).paid, 'wallet');
  const blocked = charge(u, cfg, 'msg', T0);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.need, 15);
  assert.equal(balance(u), 0);
  assert.equal(charge(u, cfg, 'msg', T0 + DAY).paid, 'free'); // new day
});

test('a failed charge changes nothing', () => {
  const u = { wallet: { paise: 40, refs: [], history: [] } };
  const before = JSON.stringify(u);
  assert.equal(charge(u, cfg, 'ai', T0).ok, false);
  assert.equal(JSON.stringify(u), before);
});

test('ai, scan and sheet come off the wallet at the rate card and refunds put it back exactly', () => {
  const u = { wallet: { paise: 1000, refs: [], history: [] } };
  const a = charge(u, cfg, 'ai', T0);
  const s = charge(u, cfg, 'scan', T0);
  const h = charge(u, cfg, 'sheet', T0);
  assert.equal(balance(u), 1000 - 50 - 100 - 300);
  refund(u, s, 'scan');
  refund(u, a, 'ai');
  assert.equal(balance(u), 1000 - 300);
  assert.ok(Number.isInteger(balance(u)));
});

test('credit is idempotent per payment reference and rejects bad amounts', () => {
  const u = {};
  assert.equal(credit(u, 5000, 'pay_1').ok, true);
  assert.equal(credit(u, 5000, 'pay_1').duplicate, true);
  assert.equal(credit(u, 0, 'pay_2').ok, false);
  assert.equal(credit(u, -100, 'pay_3').ok, false);
  assert.equal(credit(u, 10.5, 'pay_4').ok, false);
  assert.equal(balance(u), 5000);
});

test('pack: buys at a fixed price, covers msgs/scans/ai/sheets until its allowance or expiry, then per-item pricing returns', () => {
  const u = { wallet: { paise: 5100, refs: [], history: [] } };
  assert.equal(buyPack(u, cfg, 'pan_pack', T0).ok, true);
  assert.equal(balance(u), 200);
  assert.ok(activePack(u, T0 + DAY));
  for (let i = 0; i < 50; i++) assert.equal(charge(u, { rates: { freeMsgsPerDay: 0 } }, 'msg', T0).paid, 'pack');
  assert.equal(charge(u, cfg, 'sheet', T0).paid, 'pack');
  for (let i = 0; i < 8; i++) assert.equal(charge(u, cfg, 'scan', T0).paid, 'pack');
  assert.equal(charge(u, cfg, 'scan', T0).paid, 'wallet'); // 9th scan is paid
  assert.equal(balance(u), 100);
  assert.equal(activePack(u, T0 + 8 * DAY), null); // expired after 7 days
  assert.equal(charge(u, { rates: { freeMsgsPerDay: 0 } }, 'msg', T0 + 8 * DAY).paid, 'wallet');
});

test('pack refuses when the wallet is short and takes nothing', () => {
  const u = { wallet: { paise: 4899, refs: [], history: [] } };
  const r = buyPack(u, cfg, 'pan_pack', T0);
  assert.equal(r.ok, false);
  assert.equal(r.need, 1);
  assert.equal(balance(u), 4899);
});
