import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { CostGuard } from '../src/costguard.js';

const baseCfg = {
  dailyBudgetInr: 100,
  monthlyBudgetInr: 1000,
  perUserDailyLlm: 3,
  perUserDailyMsgs: 5,
  waMsgInr: 0.14,
  llmInUsdPerM: 1,
  llmOutUsdPerM: 5,
  usdInr: 90,
};

function setup(cfg = {}, clock) {
  const dir = mkdtempSync(join(process.cwd(), '.test-'));
  const store = new Store(dir);
  const guard = new CostGuard(store, { ...baseCfg, ...cfg }, clock);
  return { guard, store, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('LLM cost is computed from tokens', async () => {
  const { guard, done } = setup();
  const inr = await guard.recordLlm('u', { in: 1_000_000, out: 1_000_000 });
  assert.equal(Math.round(inr), 540); // (1 + 5) USD * 90
  done();
});

test('AI stops at 70% of the daily budget but messaging keeps going', async () => {
  const { guard, done } = setup();
  assert.equal(await guard.llmAllowed('u'), true);
  // burn ~71 INR of AI spend across different users so the per-user cap is not what stops it
  await guard.recordLlm('a', { in: 0, out: 158_000 }); // 0.79 USD * 90 = ~71 INR
  assert.equal(await guard.llmAllowed('b'), false);
  assert.equal(await guard.msgAllowed(), true);
  done();
});

test('messaging hard-stops at 100% of the daily budget', async () => {
  const { guard, done } = setup();
  let sent = 0;
  while (await guard.msgAllowed() && sent < 10_000) {
    await guard.recordMsg();
    sent++;
  }
  assert.ok(sent < 10_000, 'must stop');
  const today = await guard.todayInr();
  assert.ok(today >= 100 && today < 100.2, `stopped at ${today}`);
  done();
});

test('per-user AI call cap', async () => {
  const { guard, done } = setup();
  for (let i = 0; i < 3; i++) {
    assert.equal(await guard.llmAllowed('u'), true);
    await guard.recordLlm('u', { in: 10, out: 10 });
  }
  assert.equal(await guard.llmAllowed('u'), false);
  assert.equal(await guard.llmAllowed('someone-else'), true);
  done();
});

test('per-user inbound cap', async () => {
  const { guard, done } = setup();
  for (let i = 0; i < 5; i++) assert.equal(await guard.allowInbound('u'), true);
  assert.equal(await guard.allowInbound('u'), false);
  done();
});

test('monthly cap stops everything even on a fresh day', async () => {
  let now = Date.parse('2026-10-05T06:00:00Z');
  const { guard, done } = setup({ dailyBudgetInr: 100, monthlyBudgetInr: 150 }, () => now);
  while (await guard.msgAllowed()) await guard.recordMsg(); // day 1: hits daily cap (100)
  now += 24 * 3600 * 1000; // day 2
  assert.equal(await guard.msgAllowed(), true);
  while (await guard.msgAllowed()) await guard.recordMsg(); // stops at monthly cap (150)
  const month = await guard.monthInr();
  assert.ok(month >= 150 && month < 150.2);
  now += 24 * 3600 * 1000; // day 3, same month
  assert.equal(await guard.msgAllowed(), false);
  done();
});

test('a new month resets the monthly total', async () => {
  let now = Date.parse('2026-10-31T06:00:00Z');
  const { guard, done } = setup({ dailyBudgetInr: 100, monthlyBudgetInr: 100 }, () => now);
  while (await guard.msgAllowed()) await guard.recordMsg();
  assert.equal(await guard.msgAllowed(), false);
  now = Date.parse('2026-11-02T06:00:00Z');
  assert.equal(await guard.msgAllowed(), true);
  done();
});
