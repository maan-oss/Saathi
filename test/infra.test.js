import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createVault } from '../src/vault.js';
import { Store } from '../src/store.js';
import { buildPayloads, parseInbound } from '../src/whatsapp.js';
import { R, plain } from '../src/rich.js';
import { validStripeSignature, parsePaidEvent, createPayments } from '../src/payments.js';
import { allMessages } from '../src/messages.js';

test('vault round-trips, uses fresh IVs, and refuses tampering or the wrong key', async () => {
  const v = createVault('k1');
  const a = await v.seal({ full_name: 'Asha Devi' });
  const b = await v.seal({ full_name: 'Asha Devi' });
  assert.notEqual(a, b);
  assert.deepEqual(await v.open(a), { full_name: 'Asha Devi' });
  assert.equal(await createVault('k2').open(a), null);
  const parts = a.split('.');
  parts[3] = Buffer.from('tampered').toString('base64url');
  assert.equal(await v.open(parts.join('.')), null);
  assert.equal(await v.open('garbage'), null);
  assert.doesNotMatch(a, /Asha/);
});

test('sweep: idle sessions reset, accounts with a profile or money survive until the longer limit', () => {
  const dir = mkdtempSync(join(process.cwd(), '.test-'));
  const s = new Store(dir);
  const old = Date.now() - 3 * 86400000;
  const put = (id, u) => {
    s.putUser(id, u);
    s.users[id].updated = old;
  };
  put('plain', { state: 'steps', lang: 'en', route: 'epan', step: 2 });
  put('rich', { state: 'steps', lang: 'en', route: 'epan', step: 2, wallet: { paise: 500, refs: [], history: [] } });
  put('vaulted', { state: 'steps', lang: 'en', vault: 'v1.x.y.z', pending: 'v1.a.b.c' });
  s.sweep(24 * 3600000, 180 * 86400000);
  assert.equal(s.getUser('plain'), null);
  assert.equal(s.getUser('rich').route, undefined);
  assert.equal(s.getUser('rich').wallet.paise, 500);
  assert.equal(s.getUser('vaulted').pending, undefined);
  assert.equal(s.getUser('vaulted').vault, 'v1.x.y.z');
  s.users.rich.updated = Date.now() - 200 * 86400000;
  s.sweep(24 * 3600000, 180 * 86400000);
  assert.equal(s.getUser('rich'), null);
  rmSync(dir, { recursive: true, force: true });
});

test('rich replies flatten to numbered text', () => {
  assert.equal(plain(R.buttons('Sure?', [{ id: 'a', title: 'Yes' }, { id: 'b', title: 'No' }])), 'Sure?\n1. Yes\n2. No');
  assert.equal(plain('hi'), 'hi');
});

test('WhatsApp payloads: buttons, list and flow follow the API shapes and limits', () => {
  const [b] = buildPayloads('9199', R.buttons('Pick', [{ id: 'x', title: 'A very long button title indeed' }, { id: 'y', title: 'No' }]));
  assert.equal(b.type, 'interactive');
  assert.equal(b.interactive.type, 'button');
  assert.deepEqual(b.interactive.action.buttons[0], { type: 'reply', reply: { id: 'x', title: 'A very long button…' } });

  const many = R.buttons('Pick', [1, 2, 3, 4].map((n) => ({ id: `i${n}`, title: `T${n}` })));
  assert.equal(buildPayloads('9199', many)[0].interactive.type, 'list'); // 4 buttons become a list

  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, title: 'Title that is longer than twenty four chars', description: 'd'.repeat(100) }));
  const [l] = buildPayloads('9199', R.list('Menu', 'A button label that is too long', rows));
  const list = l.interactive.action;
  assert.equal(list.sections[0].rows.length, 10);
  assert.ok(list.sections[0].rows[0].title.length <= 24);
  assert.ok(list.sections[0].rows[0].description.length <= 72);
  assert.ok(list.button.length <= 20);

  const f = R.form('details', 'Fill in', 'Fill details', [{ key: 'full_name' }, { key: 'pincode' }], { full_name: 'Asha Devi' });
  const [flow] = buildPayloads('9199', f, { detailsFlowId: 'FLOW1' });
  assert.equal(flow.interactive.type, 'flow');
  const p = flow.interactive.action.parameters;
  assert.equal(p.flow_id, 'FLOW1');
  assert.equal(p.flow_action, 'navigate');
  assert.deepEqual(p.flow_action_payload, { screen: 'DETAILS', data: { full_name: 'Asha Devi', pincode: '' } });
  assert.equal(buildPayloads('9199', f, {})[0].type, 'text'); // no flow configured: plain text
});

test('a body over 1024 characters goes out as text first, then the buttons', () => {
  const out = buildPayloads('9199', R.buttons('x'.repeat(1500), [{ id: 'n', title: 'Next' }]));
  assert.equal(out.length, 2);
  assert.equal(out[0].type, 'text');
  assert.equal(out[1].type, 'interactive');
});

test('inbound: text, image, button tap, list tap and flow answers', () => {
  assert.deepEqual(parseInbound({ type: 'text', text: { body: 'hi' } }), { type: 'text', text: 'hi' });
  assert.deepEqual(parseInbound({ type: 'image', image: { id: 'M1' } }), { type: 'image', mediaId: 'M1' });
  assert.deepEqual(parseInbound({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'next', title: 'Next' } } }), { type: 'reply', id: 'next', title: 'Next' });
  assert.deepEqual(parseInbound({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: '4', title: 'Scan' } } }), { type: 'reply', id: '4', title: 'Scan' });
  const flow = parseInbound({ type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { response_json: JSON.stringify({ flow_token: 'saathi-details', full_name: 'Asha' }) } } });
  assert.deepEqual(flow, { type: 'form', id: 'details', values: { full_name: 'Asha' } });
  assert.equal(parseInbound({ type: 'audio', audio: { id: 'A1', mime_type: 'audio/ogg' } }).type, 'voice');
  assert.deepEqual(parseInbound({ type: 'sticker' }), { type: 'other' });
});

test('Stripe: signature is HMAC-SHA256 over "timestamp.body" and must be recent; the paid event is parsed; other events are ignored', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', client_reference_id: 'sv_1', payment_status: 'paid', currency: 'inr', amount_total: 5000, payment_intent: 'pi_9' } } });
  const t = 1700000000;
  const sig = crypto.createHmac('sha256', 'whsec_x').update(`${t}.${body}`).digest('hex');
  const header = `t=${t},v1=${sig}`;
  assert.equal(validStripeSignature(body, header, 'whsec_x', t + 10), true);
  assert.equal(validStripeSignature(body + ' ', header, 'whsec_x', t + 10), false);
  assert.equal(validStripeSignature(body, header, 'other', t + 10), false);
  assert.equal(validStripeSignature(body, header, '', t + 10), false);
  assert.equal(validStripeSignature(body, header, 'whsec_x', t + 301), false); // older than five minutes
  assert.equal(validStripeSignature(body, `t=${t},v1=00`, 'whsec_x', t), false);
  assert.deepEqual(parsePaidEvent(JSON.parse(body)), { ref: 'sv_1', paymentId: 'pi_9', paise: 5000, phone: null });
  assert.equal(parsePaidEvent({ ...JSON.parse(body), type: 'checkout.session.expired' }), null);
  assert.equal(parsePaidEvent(JSON.parse(body.replace('"paid"', '"unpaid"'))), null);
  assert.equal(parsePaidEvent(JSON.parse(body.replace('"inr"', '"usd"'))), null);
});

test('Stripe Checkout request uses INR paise and our reference (fake network)', async () => {
  let seen;
  const p = createPayments({ stripeSecretKey: 'sk_test_x', publicUrl: 'https://saathi.example' }, async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_1', id: 'cs_1' }) };
  });
  const r = await p.createLink({ ref: 'sv_1', paise: 5000, note: 'n' });
  assert.equal(r.url, 'https://checkout.stripe.com/c/pay/cs_1');
  assert.equal(seen.url, 'https://api.stripe.com/v1/checkout/sessions');
  const form = new URLSearchParams(seen.init.body);
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '5000');
  assert.equal(form.get('line_items[0][price_data][currency]'), 'inr');
  assert.equal(form.get('client_reference_id'), 'sv_1');
  assert.equal(form.get('success_url'), 'https://saathi.example/app?topup=paid&pay=sv_1');
  assert.equal(form.get('cancel_url'), 'https://saathi.example/app?topup=cancelled&pay=sv_1');
  assert.equal(form.get('branding_settings[display_name]'), 'Saathi');
  assert.equal(seen.init.headers.authorization, 'Bearer sk_test_x');
  await assert.rejects(createPayments({ stripeSecretKey: 'k' }, async () => ({})).createLink({ ref: 'sv_2', paise: 100, note: 'n' }), /PUBLIC_URL/);
  assert.equal(createPayments({}), null);
});

test('every button title fits WhatsApp (20) and every list row fits (24 / 72), in both languages', () => {
  for (const [lang, table] of Object.entries(allMessages)) {
    for (const [key, val] of Object.entries(table)) {
      if (key.startsWith('btn_') && typeof val === 'string') {
        // {price} expands to at most "₹49" style text; measure with a realistic value
        const s = val.replace('{price}', '₹4900');
        assert.ok(s.length <= 20, `${lang}.${key} is ${s.length} chars: ${s}`);
      }
    }
    for (const [id, title, desc] of table.menu_rows) {
      assert.ok(title.length <= 24, `${lang} row ${id} title ${title.length}`);
      assert.ok(desc.length <= 72, `${lang} row ${id} desc`);
    }
    assert.ok(table.menu_btn.length <= 20);
  }
});

test('the person goes back to the origin they paid from, only if it is one of ours', async () => {
  const { returnBase } = await import('../src/payments.js');
  assert.equal(returnBase('https://saathi-site-acme-7340.vercel.app', 'https://saathi-acme-7340.vercel.app'), 'https://saathi-site-acme-7340.vercel.app');
  assert.equal(returnBase('https://saathi-acme-7340.vercel.app/', 'https://saathi-acme-7340.vercel.app'), 'https://saathi-acme-7340.vercel.app');
  assert.equal(returnBase('https://evil.example', 'https://saathi-acme-7340.vercel.app'), 'https://saathi-acme-7340.vercel.app');
  assert.equal(returnBase('not a url', 'https://saathi-acme-7340.vercel.app'), 'https://saathi-acme-7340.vercel.app');
  assert.equal(returnBase(undefined, 'https://saathi.example/'), 'https://saathi.example');
});

test('a Checkout refused for branding is retried plain, so a payment still starts', async () => {
  const calls = [];
  const p = createPayments({ stripeSecretKey: 'sk_test_x', publicUrl: 'https://saathi.example' }, async (url, init) => {
    calls.push(new URLSearchParams(init.body));
    if (calls.length === 1) return { ok: false, status: 400, json: async () => ({ error: { message: 'Invalid branding_settings[border_style]' } }) };
    return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_2', id: 'cs_2' }) };
  });
  const r = await p.createLink({ ref: 'sv_3', paise: 2000, note: 'n' });
  assert.equal(r.url, 'https://checkout.stripe.com/c/pay/cs_2');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].get('branding_settings[display_name]'), 'Saathi');
  assert.equal(calls[1].get('branding_settings[display_name]'), null);
});
