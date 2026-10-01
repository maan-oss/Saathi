import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createVault } from '../src/vault.js';
import { Store } from '../src/store.js';
import { buildPayloads, parseInbound } from '../src/whatsapp.js';
import { R, plain } from '../src/rich.js';
import { validRazorpaySignature, parsePaidEvent, createPayments } from '../src/payments.js';
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

test('Razorpay: signature is HMAC-SHA256 of the raw body; the paid event is parsed; other events are ignored', () => {
  const body = JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: { entity: { reference_id: 'sv_1', amount_paid: 5000 } }, payment: { entity: { id: 'pay_9', amount: 5000 } } } });
  const sig = crypto.createHmac('sha256', 'whsec').update(body).digest('hex');
  assert.equal(validRazorpaySignature(body, sig, 'whsec'), true);
  assert.equal(validRazorpaySignature(body + ' ', sig, 'whsec'), false);
  assert.equal(validRazorpaySignature(body, sig, 'other'), false);
  assert.equal(validRazorpaySignature(body, sig, ''), false);
  assert.deepEqual(parsePaidEvent(JSON.parse(body)), { ref: 'sv_1', paymentId: 'pay_9', paise: 5000 });
  assert.equal(parsePaidEvent({ event: 'payment.failed' }), null);
});

test('Razorpay link request uses paise, INR and our reference (fake network)', async () => {
  let seen;
  const p = createPayments({ razorpayKeyId: 'id', razorpayKeySecret: 'sec' }, async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ short_url: 'https://rzp.io/x', id: 'plink_1' }) };
  });
  const r = await p.createLink({ ref: 'sv_1', paise: 5000, note: 'n' });
  assert.equal(r.url, 'https://rzp.io/x');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.amount, 5000);
  assert.equal(body.currency, 'INR');
  assert.equal(body.reference_id, 'sv_1');
  assert.match(seen.init.headers.authorization, /^Basic /);
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
