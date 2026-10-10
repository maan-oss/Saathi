#!/usr/bin/env node
// Copies the file store (the JSON files in DATA_DIR) into the Supabase project, so the app can switch data layers.
//
//   node scripts/import-to-supabase.js --from /path/to/data            dry run: counts only, writes nothing
//   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/import-to-supabase.js --from /path/to/data --apply
//
// Safe to run again: every row is written by key, so a second run changes nothing it already wrote.
// It refuses to write into a project that already holds people or payments, because the file copy may be older than
// what the app has written since. Use --overwrite only when you have decided the files are the truth.
//
// What is kept, field for field: each person's record, including its last-activity time (so the idle clock and
// the privacy sweep are not reset), wallet, payments, daily spend and counters, funnel totals, handoffs, reviewed
// translations and settings. Not copied, on purpose: link codes (five minutes long), rate limits and the duplicate-
// message list (all short-lived). Trial timestamps were never stored, so they are written as 0.
//
// Before cutover: stop writes to the file store (put the app in maintenance, or stop it), run the dry run, run with
// --apply, run it once more to confirm nothing changes, then check the counts printed at the end match.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SupabaseStore } from '../src/supastore.js';

const FILES = {
  users: 'users.json',
  ledger: 'ledger.json',
  payments: 'payments.json',
  trials: 'trials.json',
  translations: 'translations.json',
  settings: 'settings.json',
  referrals: 'referrals.json',
  handoff: 'handoff.json',
  stats: 'stats.json',
};
const BATCH = 500;
const SAVE_TRIES = 5;

// Reads every store file. A missing file is an empty store; a file that cannot be parsed stops the import.
export function readSource(dir) {
  const out = {};
  for (const [key, file] of Object.entries(FILES)) {
    const p = join(dir, file);
    if (!existsSync(p)) {
      out[key] = null;
      continue;
    }
    try {
      out[key] = JSON.parse(readFileSync(p, 'utf8'));
    } catch (e) {
      throw new Error(`${p} cannot be read (${e.message}). Fix or restore it before importing.`);
    }
  }
  return out;
}

// Turns the file store's shapes into table rows. Pure: no network.
export function plan(src) {
  const users = Object.entries(src.users || {});
  const spend = [];
  const userDaily = [];
  for (const [day, d] of Object.entries(src.ledger?.days || {})) {
    spend.push({ day, llm_inr: d.llmInr || 0, msg_inr: d.msgInr || 0 });
    for (const [uid, x] of Object.entries(d.users || {})) userDaily.push({ day, user_id: uid, llm: x.llm || 0, inbound: x.inbound || 0 });
  }
  const payments = Object.entries(src.payments || {});
  const trials = Object.keys(src.trials || {});
  const referrals = Object.entries(src.referrals?.byUser || {}).map(([user_id, code]) => ({ code, user_id }));
  const handoffs = Array.isArray(src.handoff) ? src.handoff : [];
  const stats = [];
  for (const [day, d] of Object.entries(src.stats?.days || {})) {
    for (const [event, n] of Object.entries(d.events || {})) stats.push({ day, event, source: '', n });
    for (const [key, n] of Object.entries(d.sources || {})) {
      const cut = key.indexOf('|');
      stats.push({ day, event: key.slice(0, cut), source: key.slice(cut + 1), n });
    }
  }
  const translations = Object.entries(src.translations || {});
  const settingsAll = Object.entries(src.settings || {});
  const settings = settingsAll.filter(([k, v]) => k !== 'linkcodes' && v !== undefined && v !== null && v !== '');
  const skipped = [];
  if (src.settings && 'linkcodes' in src.settings) skipped.push('linkcodes (short-lived link codes)');
  return { users, spend, userDaily, payments, trials, referrals, handoffs, stats, translations, settings, skipped };
}

// The row counts the import will write, by table.
export function summary(p) {
  return {
    users: p.users.length,
    spend_daily: p.spend.length,
    user_daily: p.userDaily.length,
    payments: p.payments.length,
    trials: p.trials.length,
    referral_codes: p.referrals.length,
    handoffs: p.handoffs.length,
    stats_daily: p.stats.length,
    translations: p.translations.length,
    settings: p.settings.length,
  };
}

async function upsert(store, table, rows, onConflict, mode = 'merge') {
  for (let i = 0; i < rows.length; i += BATCH) {
    await store._req('POST', table, {
      query: { on_conflict: onConflict },
      body: rows.slice(i, i + BATCH),
      prefer: `resolution=${mode}-duplicates,return=minimal`,
    });
  }
  return rows.length;
}

// One compare-and-set per person. The record keeps its own last-activity time: the import is not activity.
async function saveUser(store, id, u) {
  for (let attempt = 1; ; attempt++) {
    const expected = await store._versionOf(id);
    const version = await store._rpc('save_user', {
      p_id: id,
      p_doc: u,
      p_expected: expected,
      p_updated: Number(u.updated) || 0,
      p_wallet: u.wallet?.paise || 0,
      p_link: u.linkTo || null,
    });
    if (version != null) return version;
    if (attempt >= SAVE_TRIES) throw new Error(`person ${id} kept changing while it was being copied`);
  }
}

// Writes every row. Safe to repeat: rows are keyed, so a second run overwrites them with the same values.
export async function apply(store, p) {
  for (const [id, u] of p.users) await saveUser(store, id, u);
  await upsert(store, 'spend_daily', p.spend, 'day');
  await upsert(store, 'user_daily', p.userDaily, 'day,user_id');
  await upsert(store, 'payments', p.payments.map(([ref, rec]) => ({ ref, doc: rec, ts_ms: Number(rec.ts) || 0 })), 'ref');
  await upsert(store, 'trials', p.trials.map((user_id) => ({ user_id, created_ms: 0 })), 'user_id');
  // A code that is already there is kept as it is: a code belongs to one person and is never reassigned.
  await upsert(store, 'referral_codes', p.referrals, 'code', 'ignore');
  await upsert(store, 'handoffs', p.handoffs.map((h) => store._handoffRow(h)), 'id');
  await upsert(store, 'stats_daily', p.stats, 'day,event,source');
  await upsert(store, 'translations', p.translations.map(([code, doc]) => ({ code, doc })), 'code');
  await upsert(store, 'settings', p.settings.map(([key, value]) => ({ key, value })), 'key');
}

// The number of rows a table holds, read from the content-range header (no rows are downloaded).
export async function remoteCount(store, table) {
  const headers = { apikey: store.key, prefer: 'count=exact', range: '0-0' };
  if (store.key.startsWith('eyJ')) headers.authorization = `Bearer ${store.key}`;
  const res = await store.fetch(`${store.base}/${table}?select=*`, { headers, signal: AbortSignal.timeout(store.timeoutMs) });
  if (!res.ok) throw new Error(`Supabase count of ${table} returned ${res.status}. Has the 0001 migration been applied?`);
  return Number((res.headers.get('content-range') || '').split('/')[1]);
}

// Refuses to write into a project that already has people or payments, unless the caller says so.
export async function checkTarget(store, { overwrite = false } = {}) {
  const users = await remoteCount(store, 'users');
  const payments = await remoteCount(store, 'payments');
  if ((users > 0 || payments > 0) && !overwrite) {
    throw new Error(`The project already holds ${users} people and ${payments} payments. The files may be older than those. Pass --overwrite only if the files are the truth.`);
  }
  return { users, payments };
}

// Checks each table after the import: the project must hold at least as many rows as the files did.
export async function verify(store, expected) {
  const rows = [];
  let ok = true;
  for (const [table, want] of Object.entries(expected)) {
    const have = await remoteCount(store, table);
    const pass = have >= want;
    if (!pass) ok = false;
    rows.push({ table, files: want, project: have, ok: pass });
  }
  return { ok, rows };
}

function parseArgs(argv) {
  const out = { from: process.env.DATA_DIR || './data', apply: false, overwrite: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') out.from = argv[++i];
    else if (a === '--apply') out.apply = true;
    else if (a === '--overwrite') out.overwrite = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown option ${a}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('node scripts/import-to-supabase.js --from <DATA_DIR> [--apply] [--overwrite]');
    return 0;
  }
  const dir = resolve(args.from);
  const p = plan(readSource(dir));
  const counts = summary(p);
  console.log(`Files in ${dir}:`);
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(16)} ${n}`);
  for (const s of p.skipped) console.log(`  not copied: ${s}`);
  if (!args.apply) {
    console.log('\nDry run. Nothing was written. Add --apply to copy these rows into Supabase.');
    return 0;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY first.');
  const store = new SupabaseStore({ url, key });
  const before = await checkTarget(store, { overwrite: args.overwrite });
  console.log(`\nProject before: ${before.users} people, ${before.payments} payments. Writing...`);
  await apply(store, p);
  const { ok, rows } = await verify(store, counts);
  console.log('\nTable               files   project');
  for (const r of rows) console.log(`  ${r.table.padEnd(16)} ${String(r.files).padStart(6)} ${String(r.project).padStart(9)} ${r.ok ? '' : '  MISMATCH'}`);
  console.log(ok ? '\nCopied. Every table holds at least the rows in the files.' : '\nSome tables hold fewer rows than the files. Do not switch the app over yet.');
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    (code) => { process.exitCode = code; },
    (e) => { console.error(e.message); process.exitCode = 1; },
  );
}
