import test from 'node:test';
import assert from 'node:assert/strict';
import { uiKeys, uiDict } from '../src/uistrings.js';
import { LANGS, SHIPPED_LANGS, WA_LANGS } from '../src/i18n.js';

const noStore = { getSetting: () => ({}) };

// The languages a person can pick (web picker and WhatsApp list) are the ones that work without a live AI.
// Adding one here means its translations are shipped in src/ui/<code>.json and cover most of the app.
test('languages: the lists offer exactly the shipped languages', () => {
  assert.deepEqual(SHIPPED_LANGS.map((l) => l.code), ['ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa']);
  assert.ok(WA_LANGS.every((l) => l.shipped), 'WhatsApp list has only shipped languages');
  assert.ok(WA_LANGS.length <= 9, 'WhatsApp list fits its rows');
  assert.ok(LANGS.filter((l) => !l.shipped).length > 0, 'unshipped languages stay available for typed names');
});

test('languages: every offered language covers most of the app from its shipped translations, without AI', async () => {
  const keys = uiKeys();
  for (const l of SHIPPED_LANGS) {
    const shipped = await uiDict(l.code, { llm: { enabled: false }, store: noStore });
    const n = Object.keys(shipped).length;
    assert.ok(n >= keys.length * 0.9, `${l.en} covers ${n} of ${keys.length} app strings without AI`);
  }
});
