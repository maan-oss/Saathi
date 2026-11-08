import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { setup } from './helpers.js';
import { createWeb, createWebMedia } from '../src/web.js';
import { createConverse } from '../src/converse.js';
import { createVault } from '../src/vault.js';
import { createLinks } from '../src/link.js';

async function boot() {
  const t = setup({}, {}, {});
  const media = createWebMedia();
  const converse = createConverse({ store: t.store, bot: t.bot });
  const enqueue = (id, fn) => Promise.resolve().then(fn).catch(() => {});
  const config = { hashSalt: 'salt', trustProxy: false };
  const vault = createVault('test-key');
  const links = createLinks({ store: t.store, config, vault });
  const web = createWeb({ store: t.store, config, media, converse, enqueue, shell: { whatsappNumber: '919876543210' }, llm: { enabled: true }, vault, guard: t.guard, links });
  const server = http.createServer((req, res) => {
    web.handle(req, res, new URL(req.url, 'http://x')).then((d) => { if (!d) { res.statusCode = 404; res.end('nf'); } });
  });
  await new Promise((r) => server.listen(0, r));
  return { port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

test('static text: brotli or gzip when the browser accepts it, same bytes once decoded; images stay as they are', async () => {
  const s = await boot();
  try {
    const plain = await get(s.port, '/app.js');
    assert.equal(plain.status, 200);
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(plain.headers['content-length'], String(plain.body.length));

    const br = await get(s.port, '/app.js', { 'accept-encoding': 'gzip, deflate, br' });
    assert.equal(br.headers['content-encoding'], 'br');
    assert.equal(br.headers.vary, 'accept-encoding');
    assert.ok(br.body.length < plain.body.length / 2, 'brotli is much smaller');
    assert.deepEqual(zlib.brotliDecompressSync(br.body), plain.body);

    const gz = await get(s.port, '/app.js', { 'accept-encoding': 'gzip' });
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.deepEqual(zlib.gunzipSync(gz.body), plain.body);

    const png = await get(s.port, '/og.png', { 'accept-encoding': 'gzip, br' });
    assert.equal(png.headers['content-encoding'], undefined);
  } finally { await s.close(); }
});
