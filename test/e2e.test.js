// End to end: the real server process, real HTTP, signed webhooks, and fake Meta / Anthropic / Stripe servers.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_SECRET = 'app-secret';
const STRIPE_SECRET = 'whsec_e2e';
const PHONE = '919812345678';
const sent = []; // every WhatsApp message the bot sent
const stripeSessions = [];
const anthropicCalls = [];
let sttCalls = 0;
let mock, mockPort, server, serverPort, dataDir;

const listen = (handler) => new Promise((res) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
const readBody = (req) => new Promise((res) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => res(Buffer.concat(c).toString())); });
const json = (res, obj, code = 200) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };

const DOC = { type: 'aadhaar', readable: true, issues: [], fields: { name: 'ASHA DEVI', dob: '05/02/1990', father_name: 'Ram Lal', gender: 'female', address: '12 Gandhi Road, Jaipur, Rajasthan', pincode: '302001' } };

before(async () => {
  mock = await listen(async (req, res) => {
    const body = await readBody(req);
    const u = req.url;
    if (u === '/v21.0/PHONEID/messages') {
      assert.equal(req.headers.authorization, 'Bearer WA_TOKEN');
      sent.push(JSON.parse(body));
      return json(res, { messages: [{ id: 'wamid.out' }] });
    }
    if (u === '/v21.0/MEDIA1') return json(res, { url: `http://127.0.0.1:${mockPort}/file/MEDIA1`, mime_type: 'image/jpeg' });
    if (u === '/file/MEDIA1') { assert.equal(req.headers.authorization, 'Bearer WA_TOKEN'); res.setHeader('content-type', 'image/jpeg'); return void res.end(Buffer.from('fakejpegbytes')); }
    if (u === '/v21.0/VOICE1') return json(res, { url: `http://127.0.0.1:${mockPort}/file/VOICE1`, mime_type: 'audio/ogg' });
    if (u === '/file/VOICE1') { res.setHeader('content-type', 'audio/ogg'); return void res.end(Buffer.from('fake-voice-bytes')); }
    if (u === '/v21.0/PDF1') return json(res, { url: `http://127.0.0.1:${mockPort}/file/PDF1`, mime_type: 'application/pdf' });
    if (u === '/file/PDF1') { res.setHeader('content-type', 'application/pdf'); return void res.end(Buffer.from('%PDF-1.4 fake')); }
    if (u === '/speech-to-text') {
      assert.equal(req.headers['api-subscription-key'], 'sarvam-key');
      sttCalls++;
      return json(res, { transcript: 'menu' });
    }
    if (u === '/v1/messages') {
      const b = JSON.parse(body);
      assert.equal(req.headers['x-api-key'], 'sk-test');
      anthropicCalls.push(b);
      const hasImage = Array.isArray(b.messages[0].content) && b.messages[0].content.some((c) => c.type === 'image' || c.type === 'document');
      return json(res, { content: [{ type: 'text', text: hasImage ? JSON.stringify(DOC) : 'You can fix that on the official site.' }], usage: { input_tokens: 900, output_tokens: 80 } });
    }
    if (u === '/v1/checkout/sessions') {
      assert.equal(req.headers.authorization, 'Bearer sk_test_e2e');
      const f = new URLSearchParams(body);
      const ref = f.get('client_reference_id');
      stripeSessions.push({ ref, currency: f.get('line_items[0][price_data][currency]'), amount: Number(f.get('line_items[0][price_data][unit_amount]')) });
      return json(res, { id: `cs_${ref}`, url: `https://checkout.test/${ref}` });
    }
    json(res, { error: 'not found' }, 404);
  });
  mockPort = mock.address().port;
  dataDir = mkdtempSync(join(process.cwd(), '.test-e2e-'));
  serverPort = 30000 + Math.floor(Math.random() * 20000);
  server = spawn('node', ['src/server.js'], {
    env: {
      ...process.env,
      PORT: String(serverPort), DATA_DIR: dataDir,
      WHATSAPP_TOKEN: 'WA_TOKEN', WHATSAPP_PHONE_ID: 'PHONEID', VERIFY_TOKEN: 'verify-me', APP_SECRET, HASH_SALT: 'salt', VAULT_KEY: 'vault-key',
      GRAPH_BASE: `http://127.0.0.1:${mockPort}`, ANTHROPIC_BASE: `http://127.0.0.1:${mockPort}`, STRIPE_BASE: `http://127.0.0.1:${mockPort}`,
      ANTHROPIC_API_KEY: 'sk-test', DOC_CHECK: '1', STRIPE_SECRET_KEY: 'sk_test_e2e', STRIPE_WEBHOOK_SECRET: STRIPE_SECRET, PUBLIC_URL: `http://127.0.0.1:${serverPort}`,
      SARVAM_API_KEY: 'sarvam-key', SARVAM_BASE: `http://127.0.0.1:${mockPort}`, DETAILS_FLOW_ID: 'FLOW1', ADMIN_KEY: 'adm', DAILY_BUDGET_INR: '300',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  server.stdout.on('data', (d) => (out += d));
  server.stderr.on('data', (d) => (out += d));
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${serverPort}/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start: ' + out);
});

after(async () => {
  server?.kill();
  mock?.close();
  await new Promise((r) => setTimeout(r, 100));
  rmSync(dataDir, { recursive: true, force: true });
});

const url = (p) => `http://127.0.0.1:${serverPort}${p}`;
let n = 0;
async function post(message, { sign = true } = {}) {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: `wamid.in${++n}`, from: PHONE, ...message }] } }] }] });
  const sig = 'sha256=' + crypto.createHmac('sha256', sign ? APP_SECRET : 'wrong').update(body).digest('hex');
  return fetch(url('/webhook'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body });
}
async function until(cond, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error('timed out waiting');
}
// send a user message and return the messages the bot sent back
async function say(message, expect = 1) {
  const before = sent.length;
  const r = await post(message);
  assert.equal(r.status, 200);
  await until(() => sent.length >= before + expect);
  await new Promise((r2) => setTimeout(r2, 60)); // let any extra messages land
  return sent.slice(before);
}
const text = (t) => ({ type: 'text', text: { body: t } });
const tap = (id, title = id) => ({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title } } });
const pick = (id, title = id) => ({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id, title } } });
const flat = (msgs) => msgs.map((m) => m.text?.body || m.interactive?.body?.text || '').join('\n');

test('webhook handshake and signature checks', async () => {
  assert.equal(await (await fetch(url('/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc'))).text(), 'abc');
  assert.equal((await fetch(url('/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc'))).status, 403);
  assert.equal((await post(text('hi'), { sign: false })).status, 401);
  assert.equal(sent.length, 0);
});

test('hello: bilingual welcome arrives as real reply buttons, the same message twice is answered once', async () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: 'dup1', from: PHONE, type: 'text', text: { body: 'hi' } }] } }] }] });
  const sig = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  const send = () => fetch(url('/webhook'), { method: 'POST', headers: { 'x-hub-signature-256': sig, 'content-type': 'application/json' }, body });
  await send(); await send();
  await until(() => sent.length >= 1);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.equal(m.to, PHONE);
  assert.equal(m.interactive.type, 'button');
  assert.deepEqual(m.interactive.action.buttons.map((b) => b.reply.id), ['1', '2', '3']);
});

test('English button opens the list menu; picking scan explains the price', async () => {
  const [menu] = await say({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: '1', title: 'English' } } });
  assert.equal(menu.interactive.type, 'list');
  assert.equal(menu.interactive.action.sections[0].rows.length, 10);
  const [scan] = await say(pick('2', 'Scan a document'));
  assert.match(scan.text.body, /₹1 per scan/);
});

test('photo: consent, download from Meta, read by the AI, save encrypted, then the sheet', async () => {
  const [consent] = await say({ type: 'image', image: { id: 'MEDIA1' } });
  assert.equal(consent.interactive.type, 'button');
  assert.match(consent.interactive.body.text, /not saved/);
  assert.equal(anthropicCalls.length, 0);
  await say(tap('1', 'Yes, allow'));
  const [found] = await say({ type: 'image', image: { id: 'MEDIA1' } });
  assert.equal(anthropicCalls.length, 1);
  const img = anthropicCalls[0].messages[0].content.find((c) => c.type === 'image');
  assert.equal(img.source.data, Buffer.from('fakejpegbytes').toString('base64'));
  assert.match(found.interactive.body.text, /Asha Devi/);
  assert.deepEqual(found.interactive.action.buttons.map((b) => b.reply.id), ['save', 'once', 'discard']);
  const saved = await say(tap('save', 'Save'));
  assert.match(flat(saved), /Saved, encrypted/);

  const users = readFileSync(join(dataDir, 'users.json'), 'utf8');
  assert.doesNotMatch(users, /Asha|Jaipur|302001|Ram Lal/);
  assert.doesNotMatch(users, new RegExp(PHONE));

  const [which] = await say(text('sheet')); // no service picked yet: asks which form
  assert.equal(which.interactive.type, 'list');
  const sheet = await say(pick('1', 'New PAN card'), 2);
  assert.match(sheet[0].text.body, /Asha Devi/);
  assert.match(sheet[0].text.body, /05\/02\/1990/);
  assert.match(sheet[0].text.body, /Never type your Aadhaar number here/);
});

test('free-form question goes to the AI without any saved detail in the prompt', async () => {
  await say(text('menu'));
  await say(pick('6', 'Ask a question'));
  const ans = await say(text('how do I fix my name spelling?'));
  assert.match(flat(ans), /official site/);
  const q = anthropicCalls.at(-1);
  assert.doesNotMatch(JSON.stringify(q), /Asha|Ram Lal|302001|Gandhi/);
});

test('details form goes out as a WhatsApp Flow with saved values, and its answer is understood', async () => {
  const [flow] = await say(text('fill'));
  assert.equal(flow.interactive.type, 'flow');
  const p = flow.interactive.action.parameters;
  assert.equal(p.flow_id, 'FLOW1');
  assert.equal(p.flow_action_payload.screen, 'DETAILS');
  assert.equal(p.flow_action_payload.data.full_name, 'Asha Devi');
  const reply = await say({ type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { response_json: JSON.stringify({ flow_token: 'saathi-details', full_name: 'Asha Devi', dob: '1990-02-05', father_name: 'Ram Lal', gender: 'female', address: '12 Gandhi Road, Jaipur, Rajasthan', pincode: '3020' }) } } }, 2);
  assert.match(flat(reply), /PIN code/); // bad PIN is refused
  assert.equal(reply.at(-1).interactive.type, 'flow'); // and the form comes back
});

test('top up: payment link created in paise, signed webhook credits the wallet once and notifies the user', async () => {
  const [list] = await say(text('topup'));
  assert.equal(list.interactive.type, 'list');
  const [link] = await say(pick('pay_5000', '₹50'));
  assert.equal(stripeSessions.length, 1);
  assert.equal(stripeSessions[0].amount, 5000);
  assert.equal(stripeSessions[0].currency, 'inr');
  assert.match(link.text.body, /https:\/\/checkout\.test\/sv_/);

  const ref = stripeSessions[0].ref;
  const event = JSON.stringify({ id: 'evt_E2E1', type: 'checkout.session.completed', data: { object: { id: `cs_${ref}`, client_reference_id: ref, payment_status: 'paid', currency: 'inr', amount_total: 5000, payment_intent: 'pi_E2E1' } } });
  const stripeHeader = (b, s = STRIPE_SECRET) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${crypto.createHmac('sha256', s).update(`${t}.${b}`).digest('hex')}`; };
  const hook = (b, s) => fetch(url('/stripe'), { method: 'POST', headers: { 'stripe-signature': stripeHeader(b, s), 'content-type': 'application/json' }, body: b });

  assert.equal((await hook(event, 'wrong')).status, 401);
  const before = sent.length;
  assert.equal((await hook(event)).status, 200);
  await until(() => sent.length >= before + 1);
  assert.match(sent.at(-1).text.body, /₹50 added to your wallet/);
  assert.equal(sent.at(-1).to, PHONE);
  await hook(event); // Stripe retries: must not credit twice
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(sent.length, before + 1);

  const [wallet] = await say(text('wallet'));
  assert.match(wallet.interactive.body.text, /Your wallet: ₹\d+/);
  const balance = Number(wallet.interactive.body.text.match(/₹(\d+)/)[1]);
  assert.ok(balance >= 50 && balance < 60, `balance was ${balance}`);
  const payments = JSON.parse(readFileSync(join(dataDir, 'payments.json'), 'utf8'));
  assert.equal(payments[ref].status, 'paid');
  assert.equal(payments[ref].phone, undefined); // number dropped once paid
});

test('voice note is transcribed by Sarvam and handled like typed text', async () => {
  const out = await say({ type: 'audio', audio: { id: 'VOICE1', mime_type: 'audio/ogg; codecs=opus' } }, 2);
  assert.equal(sttCalls, 1);
  assert.match(flat(out), /I heard/);
  assert.ok(out.some((m) => m.interactive?.type === 'list')); // "menu" opened the menu
});

test('a PDF is read by the AI as a document block', async () => {
  const before = anthropicCalls.length;
  await say(text('scan'), 1);
  const out = await say({ type: 'document', document: { id: 'PDF1', mime_type: 'application/pdf', filename: 'a.pdf' } }, 1);
  assert.ok(out.length >= 1);
  const call = anthropicCalls.slice(before).find((c) => Array.isArray(c.messages[0].content) && c.messages[0].content.some((x) => x.type === 'document'));
  assert.ok(call, 'a document block reached the AI');
});

test('reminder set for today is sent by the scheduler run, once', async () => {
  await say(text('menu'), 1);
  await say(pick('5', 'Reminders'), 1);
  const types = await say(tap('remind_add', 'Add one'), 1);
  const all = [];
  const step = async (m) => { const o = await say(m, 1); all.push(...o); return o; };
  await step(pick('custom', 'Something else'));
  await step(text('Test renewal'));
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  await step(text(today));
  const before = sent.length;
  const r1 = await (await fetch(url('/admin/run-reminders?key=adm'), { method: 'POST' })).json();
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(sent.length > before, 'a reminder message went out: ' + JSON.stringify({ r1, all: flat(all), types: flat(types) }));
  assert.match(flat(sent.slice(before)), /Test renewal/);
  const mid = sent.length;
  await fetch(url('/admin/run-reminders?key=adm'), { method: 'POST' });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sent.length, mid); // never twice
});

test('inbox: page, thread, reply reaches WhatsApp, bot stays quiet, menu brings it back, close', async () => {
  assert.equal((await fetch(url('/admin/inbox'))).status, 403);
  const page = await (await fetch(url('/admin/inbox?key=adm'))).text();
  assert.match(page, /<html/i);
  await say(text('agent'), 1);
  let list = await (await fetch(url('/admin/handoffs?key=adm'))).json();
  const h = list.find((x) => x.status === 'open');
  assert.ok(h && h.id && Array.isArray(h.thread));
  const post2 = (path, body) => fetch(url(path + '?key=adm'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const before = sent.length;
  const rep = await post2('/admin/reply', { id: h.id, text: 'Namaste, I can help with that.' });
  assert.equal(rep.status, 200);
  await until(() => sent.length > before);
  assert.match(flat(sent.slice(before)), /I can help with that/);
  // while a person is handling it the bot stays silent
  const quiet = sent.length;
  await post(text('ok thanks'));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(sent.length, quiet);
  list = await (await fetch(url('/admin/handoffs?key=adm'))).json();
  assert.ok(list.find((x) => x.id === h.id).thread.some((t) => t.dir === 'in' && /ok thanks/.test(t.text)));
  const back = await say(text('menu'), 1);
  assert.ok(back.length >= 1);
  assert.equal((await post2('/admin/close', { id: h.id })).status, 200);
  list = await (await fetch(url('/admin/handoffs?key=adm'))).json();
  assert.equal(list.find((x) => x.id === h.id).status, 'closed');
});

test('human handoff shows up in the operator inbox, behind the admin key', async () => {
  await say(text('agent'));
  assert.equal((await fetch(url('/admin/handoffs'))).status, 403);
  const list = await (await fetch(url('/admin/handoffs?key=adm'))).json();
  assert.equal(list[0].phone, PHONE);
  const stats = await (await fetch(url('/admin/stats?key=adm'))).json();
  assert.ok(stats.todayInr > 0);
  assert.ok(stats.llmInr > 0);
});

test('delete wipes the account', async () => {
  const [confirm] = await say(text('delete'));
  assert.match(confirm.interactive.body.text, /erases your profile/);
  const done = await say(tap('delete_yes', 'Yes, erase all'));
  assert.match(flat(done), /deleted everything/);
  const users = JSON.parse(readFileSync(join(dataDir, 'users.json'), 'utf8'));
  assert.deepEqual(users, {});
});
