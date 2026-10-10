#!/usr/bin/env node
// End-to-end check of the Supabase data layer (src/supastore.js) against a real project: every store method the app
// uses, through the real REST API. It writes rows under a unique tag and removes what it can.
//
// Run it against a STAGING project only. It refuses the production project.
//   SUPABASE_URL=https://<staging-ref>.supabase.co SUPABASE_SECRET_KEY=... node scripts/smoke-supabase.js
//
// Exit code 0 means every check passed.
import { SupabaseStore, ConflictError } from '../src/supastore.js';

const PROD_REF = 'edvtumklsjvcwipmqgfx';
const DAY = '2001-02-03'; // a day far from real use; staging only
const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
  throw new Error('stopped');
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([name, 'ok']);
  } catch (e) {
    results.push([name, `FAILED: ${e.message}`]);
  }
}
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};

async function main() {
  if (!url || !key) fail('Set SUPABASE_URL and SUPABASE_SECRET_KEY (a staging project).');
  if (url.includes(PROD_REF)) fail('This is the production project. The smoke test only runs against staging.');

  const store = new SupabaseStore({ url, key });
  const other = new SupabaseStore({ url, key }); // a second instance, to simulate another server
  const tag = 'smoke-' + Date.now().toString(36);
  const uid = tag + '-user';
  const ref = tag + '-ref';

  await check('settings: set, read, delete', async () => {
    await store.setSetting(tag + '-setting', { a: 1 });
    eq(await store.getSetting(tag + '-setting'), { a: 1 }, 'value');
    await store.setSetting(tag + '-setting', '');
    eq(await store.getSetting(tag + '-setting'), undefined, 'after delete');
  });

  await check('users: create, read back, save again', async () => {
    await store.putUser(uid, { state: 'menu', wallet: { paise: 100 } });
    const u = await store.getUser(uid);
    eq(u.state, 'menu', 'state');
    eq(u.wallet.paise, 100, 'paise');
    await store.putUser(uid, { ...u, state: 'docs' });
    eq((await store.getUser(uid)).state, 'docs', 'after save');
  });

  await check('users: a stale save is refused with ConflictError', async () => {
    await other.getUser(uid); // the other server reads version N
    await store.putUser(uid, { state: 'menu', wallet: { paise: 200 } }); // this server saves version N+1
    let refused = false;
    try {
      await other.putUser(uid, { state: 'stale', wallet: { paise: 0 } });
    } catch (e) {
      refused = e instanceof ConflictError && e.code === 'conflict';
    }
    eq(refused, true, 'stale save refused');
    eq((await store.getUser(uid)).wallet.paise, 200, 'the newer save was kept');
  });

  await check('referral code: made once, found by code', async () => {
    const code = await store.refCodeFor(uid);
    eq(await store.refCodeFor(uid), code, 'same code again');
    eq(await store.userForRefCode(code), uid, 'code finds the person');
  });

  await check('trial and payment records', async () => {
    await store.markTrial(uid);
    eq(await store.hadTrial(uid), true, 'trial marked');
    await store.putPayment(ref, { userId: uid, paise: 500, status: 'pending', ts: Date.now() });
    eq((await store.getPayment(ref)).status, 'pending', 'payment status');
  });

  await check('money: spend add and snapshot', async () => {
    const first = await store.spendAdd(DAY, 1.5, 2);
    const second = await store.spendAdd(DAY, 0.5, 1);
    eq(Math.round((second.llmInr - first.llmInr) * 10) / 10, 0.5, 'llm added');
    eq(Math.round((second.msgInr - first.msgInr) * 10) / 10, 1, 'msg added');
    const snap = await store.spendSnapshot(DAY);
    if (!(snap.todayInr >= second.llmInr + second.msgInr)) throw new Error('snapshot is below the day total');
  });

  await check('per-person daily counters', async () => {
    const a = await store.bumpUserDay(DAY, uid, 2, 1);
    const b = await store.bumpUserDay(DAY, uid, 1, 0);
    eq([b.llm - a.llm, b.inbound - a.inbound], [1, 0], 'counters add');
  });

  await check('funnel counts and per-source totals', async () => {
    const ev = tag + '-event';
    await store.countEvent(ev, 'src');
    const days = await store.funnel(1);
    const today = days[days.length - 1];
    eq(today.events[ev], 1, 'overall total');
    eq(today.sources[`${ev}|src`], 1, 'source total');
  });

  await check('message ids: a repeat is seen', async () => {
    eq(await store.seenBefore(tag + '-msg'), false, 'first time');
    eq(await store.seenBefore(tag + '-msg'), true, 'second time');
  });

  await check('rate limit: 2 per window', async () => {
    const hits = [await store.rateHit(tag + '-rl', 60000, 2), await store.rateHit(tag + '-rl', 60000, 2), await store.rateHit(tag + '-rl', 60000, 2)];
    eq(hits, [true, true, false], 'third hit refused');
  });

  await check('short-lived values: set, take once, expire', async () => {
    await store.kvSet(tag + '-kv', { a: 1 }, 60000);
    eq(await store.kvGet(tag + '-kv'), { a: 1 }, 'read');
    eq(await store.kvTake(tag + '-kv'), { a: 1 }, 'take');
    eq(await store.kvTake(tag + '-kv'), null, 'second take');
    await store.kvSet(tag + '-kx', 'gone', -1000);
    eq(await store.kvGet(tag + '-kx'), null, 'expired value');
  });

  await check('handoffs: open, update, prune closed', async () => {
    const h = await store.appendHandoff({ phone: tag, svc: 'pan', status: 'open', thread: [] });
    eq((await store.getHandoff(h.id)).phone, tag, 'phone');
    await store.updateHandoff(h.id, (x) => { x.status = 'closed'; x.closedAt = 1; });
    if ((await store.pruneHandoffs()) < 1) throw new Error('old closed handoff was not pruned');
  });

  await check('translations: a reviewed one is never overwritten', async () => {
    eq(await store.putTranslation(tag + '-lang', { reviewed: true, t: 'x' }), true, 'first write');
    eq(await store.putTranslation(tag + '-lang', { t: 'y' }), false, 'second write refused');
  });

  await check('a person can be deleted with their referral code', async () => {
    await store.deleteUser(uid);
    eq(await store.getUser(uid), null, 'user gone');
    eq(await store._codeOf(uid), null, 'referral code gone');
  });

  // Tidy the rows that have no delete method in the store. Staging only.
  await store._req('DELETE', 'payments', { query: { ref: `eq.${ref}` }, prefer: 'return=minimal' }).catch(() => {});

  for (const [name, status] of results) console.log(`${status === 'ok' ? 'ok    ' : 'FAIL  '} ${name}${status === 'ok' ? '' : ' - ' + status.slice(8)}`);
  const failed = results.filter(([, s]) => s !== 'ok').length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  if (e.message !== 'stopped') console.error(e.message);
  process.exitCode = 1;
});
