import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../src/llm.js';
import { diagnose } from '../src/doctor.js';

const cfg = { openrouterKey: 'sk-or-test', openrouterModel: 'stealth/space-bunny-alpha', openrouterFallbacks: ['openrouter/free'], openrouterBase: 'https://or.test', anthropicKey: 'ak', model: 'm' };

function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url: String(url), opts, body: opts?.body ? JSON.parse(opts.body) : null }); return handler(calls.length, calls.at(-1)); };
  return { calls, restore: () => (globalThis.fetch = real) };
}
const ok = (obj) => new Response(JSON.stringify(obj), { status: 200 });

test('openrouter: used when its key is set, free router by default, OpenAI-shaped request, think-tags stripped', async () => {
  const s = stubFetch(() => ok({ choices: [{ message: { content: '<think>hmm</think>Hello there' } }], usage: { prompt_tokens: 10, completion_tokens: 3 } }));
  try {
    const llm = createLlm(cfg);
    assert.equal(llm.enabled, true);
    assert.equal(llm.provider, 'openrouter');
    const r = await llm.answer('be kind', 'hi?');
    assert.equal(r.text, 'Hello there');
    assert.deepEqual(r.usage, { in: 10, out: 3 });
    const c = s.calls[0];
    assert.equal(c.url, 'https://or.test/api/v1/chat/completions');
    assert.equal(c.opts.headers.authorization, 'Bearer sk-or-test');
    assert.equal(c.body.model, 'stealth/space-bunny-alpha');
    assert.deepEqual(c.body.models, ['stealth/space-bunny-alpha', 'openrouter/free']);
    assert.equal(c.body.messages[0].role, 'system');
  } finally { s.restore(); }
});

test('openrouter: photos and PDFs go as image_url / file, and the JSON reply is parsed', async () => {
  const s = stubFetch(() => ok({ choices: [{ message: { content: '{"type":"aadhaar","readable":true,"fields":{"name":"ASHA","dob":"01/02/1990"}}' } }] }));
  try {
    const llm = createLlm(cfg);
    const r = await llm.checkDocument(Buffer.from('img'), 'image/jpeg');
    assert.equal(r.name, 'ASHA');
    const part = s.calls[0].body.messages[1].content[0];
    assert.equal(part.type, 'image_url');
    assert.match(part.image_url.url, /^data:image\/jpeg;base64,/);
    await llm.checkDocument(Buffer.from('pdf'), 'application/pdf');
    assert.equal(s.calls[1].body.messages[1].content[0].type, 'file');
  } finally { s.restore(); }
});

test('openrouter: a busy free model is retried once, then reported', async () => {
  let n = 0;
  const s = stubFetch(() => (++n === 1 ? new Response('busy', { status: 429 }) : ok({ choices: [{ message: { content: 'fine' } }] })));
  try {
    assert.equal((await createLlm(cfg).answer('s', 'q')).text, 'fine');
    assert.equal(n, 2);
  } finally { s.restore(); }
  const s2 = stubFetch(() => new Response('down', { status: 503 }));
  try { await assert.rejects(() => createLlm(cfg).answer('s', 'q'), /LLM 503/); } finally { s2.restore(); }
});

test('anthropic still works when only its key is set', async () => {
  const s = stubFetch(() => ok({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 5, output_tokens: 1 } }));
  try {
    const llm = createLlm({ anthropicKey: 'ak', model: 'm' });
    assert.equal(llm.provider, 'anthropic');
    assert.equal((await llm.answer('s', 'q')).text, 'hi');
  } finally { s.restore(); }
});

test('doctor checks the OpenRouter key', async () => {
  const rows = await diagnose({ ...cfg, vaultKey: 'x'.repeat(30), hashSalt: 'y'.repeat(30), adminKey: 'a', verifyToken: 'v'.repeat(20), appSecret: 's' }, async (url) => (String(url).includes('/auth/key') ? ok({ data: {} }) : new Response('', { status: 404 })));
  assert.ok(rows.some((r) => r.s.trim() === 'OK' && /OpenRouter key works/.test(r.t)));
});

import { tidyAnswer } from '../src/llm.js';
test('free-model Markdown is turned into what the chat understands', () => {
  const out = tidyAnswer('## Docs\n\nYou need **ID proof** and __a photo__.  \n\n- Aadhaar\n* Passport\n1) Sign\n\n\n\nDone `now`');
  assert.equal(out, '*Docs*\n\nYou need *ID proof* and _a photo_.\n\n• Aadhaar\n• Passport\n1. Sign\n\nDone now');
});

test('a key set while running turns the AI on and off without a restart', async () => {
  const { createLlm } = await import('../src/llm.js');
  const cfg = { openrouterKey: '', anthropicKey: '', llmInUsdPerM: 1, llmOutUsdPerM: 5 };
  const l = createLlm(cfg);
  assert.equal(l.enabled, false);
  l.setKey('sk-or-v1-testtesttesttesttest');
  assert.equal(l.enabled, true);
  assert.equal(l.provider, 'openrouter');
  assert.equal(cfg.llmInUsdPerM, 0);
  l.setKey('');
  assert.equal(l.enabled, false);
});
