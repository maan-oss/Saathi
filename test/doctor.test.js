import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../scripts/doctor.js';

const base = { vaultKey: 'v'.repeat(30), hashSalt: 's'.repeat(20), adminKey: 'a', verifyToken: 'tok', appSecret: 'x', graphBase: 'https://g', graphVersion: 'v21.0', anthropicBase: 'https://a', razorpayBase: 'https://r', model: 'm' };

test('doctor flags default secrets and missing integrations without calling anything', async () => {
  let calls = 0;
  const rows = await diagnose({ ...base, vaultKey: 'dev-vault-key-change-me', adminKey: '', appSecret: '' }, async () => { calls++; return { ok: true }; });
  assert.equal(calls, 0);
  const fix = rows.filter((r) => r.s === 'FIX').map((r) => r.t);
  assert.ok(fix.includes('VAULT_KEY') && fix.includes('ADMIN_KEY') && fix.includes('APP_SECRET') && fix.includes('WhatsApp'));
});

test('doctor checks the live connections and the webhook handshake', async () => {
  const seen = [];
  const f = async (url, init) => {
    seen.push(url);
    if (url.includes('/health')) return { ok: true, text: async () => 'ok' };
    if (url.includes('hub.challenge=doctor123')) return { ok: true, text: async () => 'doctor123' };
    if (url.endsWith('/privacy')) return { ok: true, text: async () => 'p' };
    if (url.startsWith('https://g/')) return { ok: true, json: async () => ({ display_phone_number: '+91 98', verified_name: 'Saathi' }) };
    if (url.startsWith('https://r/')) return { ok: false, status: 401, text: async () => 'bad key' };
    return { ok: true, json: async () => ({}) };
  };
  const rows = await diagnose({ ...base, whatsappToken: 't', phoneId: 'P', anthropicKey: 'k', razorpayKeyId: 'rzp_test_1', razorpayKeySecret: 's', razorpayWebhookSecret: 'w', publicUrl: 'https://me.example' }, f);
  const by = (t) => rows.find((r) => r.t.startsWith(t));
  assert.equal(by('WhatsApp token').s, 'OK ');
  assert.equal(by('Anthropic').s, 'OK ');
  assert.equal(by('Razorpay keys').s, 'FIX');
  assert.equal(by('Webhook handshake').s, 'OK ');
  assert.ok(seen.some((u) => u.includes('verify_token=tok')));
});
