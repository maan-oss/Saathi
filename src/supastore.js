// The Supabase data layer. Same methods as the file store in store.js, all async, and no new dependency:
// plain fetch against Supabase's REST API, with the atomic operations in SQL functions (see
// supabase/migrations/0001_saathi_data_layer.sql).
//
// Two things make this safe with several instances running at once:
//  - A user record is written with compare-and-set (save_user). If another instance changed it since it was read,
//    the write is refused with ConflictError, and the caller reads the record again and retries.
//  - Money and counters move through single statements (add_spend, bump_user_day, rate_hit), never read-then-write.
//
// Backups are Supabase's job here (point-in-time recovery or daily backups on the paid plan). backupIfDue() is a no-op.
import { randomBytes } from 'node:crypto';
import { sweepOne } from './retention.js';

export class ConflictError extends Error {
  constructor(msg = 'the record was changed by another request') {
    super(msg);
    this.name = 'ConflictError';
    this.code = 'conflict';
  }
}

const DAY = 86400000;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10); // UTC day, as the funnel has always used
const newRefCode = () => Array.from(randomBytes(6), (b) => ALPHA[b % ALPHA.length]).join('');

export class SupabaseStore {
  constructor({ url, key, now = () => Date.now(), fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
    if (!url || !key) throw new Error('The Supabase store needs the project URL and the secret key.');
    this.base = url.replace(/\/+$/, '') + '/rest/v1';
    this.host = new URL(url).host;
    this.key = key;
    this.now = now;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.versions = new Map(); // user id -> the version this process last read or wrote
  }

  storageInfo() {
    return { kind: 'supabase', dir: this.host, separateDisk: true };
  }

  // ---- transport ---------------------------------------------------------------------------------

  // Reads are retried on a dropped connection or a busy server. Writes are not: a retried insert or counter could
  // count twice. A 409 on an insert that is ignored on conflict is handled by the caller.
  async _req(method, table, { query, body, prefer, rpc } = {}) {
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    const url = rpc ? `${this.base}/rpc/${rpc}` : `${this.base}/${table}${qs}`;
    const headers = { apikey: this.key, accept: 'application/json' };
    // Legacy JWT keys also go in the Authorization header. The newer secret keys are not JWTs and go in apikey only.
    if (this.key.startsWith('eyJ')) headers.authorization = `Bearer ${this.key}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (prefer) headers.prefer = prefer;
    const label = `${method} ${rpc || table}`;
    const retries = method === 'GET' ? 2 : 0;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await this.fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        if (attempt < retries) {
          await sleep(150 * 2 ** attempt);
          continue;
        }
        throw new Error(`Supabase ${label} did not answer (${e.name})`);
      }
      if (res.ok) {
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(150 * 2 ** attempt);
        continue;
      }
      const detail = (await res.text().catch(() => '')).slice(0, 160);
      throw new Error(`Supabase ${label} returned ${res.status}: ${detail}`);
    }
  }

  _rpc(name, args) {
    return this._req('POST', null, { rpc: name, body: args });
  }

  // ---- settings ----------------------------------------------------------------------------------

  async getSetting(k) {
    const rows = await this._req('GET', 'settings', { query: { key: `eq.${k}`, select: 'value' } });
    return rows[0] ? rows[0].value : undefined;
  }

  async setSetting(k, v) {
    if (v === undefined || v === null || v === '') {
      await this._req('DELETE', 'settings', { query: { key: `eq.${k}` }, prefer: 'return=minimal' });
      return;
    }
    await this._req('POST', 'settings', { query: { on_conflict: 'key' }, body: { key: k, value: v }, prefer: 'resolution=merge-duplicates,return=minimal' });
  }

  // ---- users -------------------------------------------------------------------------------------

  async _versionOf(id) {
    const rows = await this._req('GET', 'users', { query: { id: `eq.${id}`, select: 'version' } });
    return rows[0] ? rows[0].version : 0;
  }

  async getUser(id) {
    const rows = await this._req('GET', 'users', { query: { id: `eq.${id}`, select: 'doc,version' } });
    if (!rows[0]) {
      this.versions.delete(id);
      return null;
    }
    this.versions.set(id, rows[0].version);
    return { ...rows[0].doc };
  }

  async putUser(id, user) {
    let expected = this.versions.get(id);
    if (expected === undefined) expected = await this._versionOf(id);
    const now = this.now();
    const doc = { ...user, updated: now };
    const version = await this._rpc('save_user', {
      p_id: id,
      p_doc: doc,
      p_expected: expected,
      p_updated: now,
      p_wallet: doc.wallet?.paise || 0,
      p_link: doc.linkTo || null,
    });
    if (version == null) {
      this.versions.delete(id);
      throw new ConflictError();
    }
    this.versions.set(id, version);
  }

  async deleteUser(id) {
    await this._req('DELETE', 'users', { query: { id: `eq.${id}` }, prefer: 'return=minimal' });
    this.versions.delete(id);
    await this._req('DELETE', 'referral_codes', { query: { user_id: `eq.${id}` }, prefer: 'return=minimal' });
  }

  // Users whose record holds reminders (the reminder check runs over these only).
  async listUsersWithReminders() {
    const out = [];
    let after = '';
    for (;;) {
      const rows = await this._req('GET', 'users', {
        query: { has_reminders: 'is.true', id: `gt.${after}`, order: 'id.asc', limit: '500', select: 'id,doc' },
      });
      for (const r of rows) out.push([r.id, r.doc]);
      if (rows.length < 500) return out;
      after = rows[rows.length - 1].id;
    }
  }

  // Forgets people who have been idle. Same rules as the file store (see retention.js). Walks the idle records in
  // pages, so the work per run is bounded by the batch size, not by the number of users.
  async sweep(idleMs, keepMs = idleMs, now = this.now()) {
    let n = 0;
    const cutoff = now - Math.min(idleMs, keepMs);
    const handle = async (row, mainExists) => {
      const doc = { ...row.doc };
      const r = sweepOne(doc, now, idleMs, keepMs, mainExists);
      if (r.op === 'none') return 0;
      if (r.op === 'delete') {
        await this.deleteUser(row.id);
        return r.n;
      }
      const version = await this._rpc('save_user', {
        p_id: row.id,
        p_doc: doc,
        p_expected: row.version,
        p_updated: row.updated_ms, // a cleanup is not activity, so the idle clock does not restart
        p_wallet: doc.wallet?.paise || 0,
        p_link: doc.linkTo || null,
      });
      this.versions.delete(row.id);
      // A refused write means someone was using the account just now: the next run looks at it again.
      return version == null ? 0 : r.n;
    };
    const mainExists = async (linkTo) => (await this._req('GET', 'users', { query: { id: `eq.${linkTo}`, select: 'id' } })).length > 0;

    // Pass 1: records idle past the cutoff.
    let after = '';
    for (;;) {
      const rows = await this._req('GET', 'users', {
        query: { updated_ms: `lt.${cutoff}`, id: `gt.${after}`, order: 'id.asc', limit: '500', select: 'id,doc,version,updated_ms' },
      });
      for (const row of rows) n += await handle(row, row.doc.linkTo ? await mainExists(row.doc.linkTo) : true);
      if (rows.length < 500) break;
      after = rows[rows.length - 1].id;
    }

    // Pass 2: linked-device pointers whose main account is gone, whatever their idle time (as the file store does).
    after = '';
    for (;;) {
      const rows = await this._req('GET', 'users', {
        query: { link_to: 'not.is.null', updated_ms: `gte.${cutoff}`, id: `gt.${after}`, order: 'id.asc', limit: '500', select: 'id,doc,version,updated_ms' },
      });
      for (const row of rows) n += await handle(row, await mainExists(row.doc.linkTo));
      if (rows.length < 500) break;
      after = rows[rows.length - 1].id;
    }
    return n;
  }

  // ---- referrals ---------------------------------------------------------------------------------

  async _codeOf(id) {
    const rows = await this._req('GET', 'referral_codes', { query: { user_id: `eq.${id}`, select: 'code' } });
    return rows[0] ? rows[0].code : null;
  }

  async refCodeFor(id) {
    const have = await this._codeOf(id);
    if (have) return have;
    for (let i = 0; i < 6; i++) {
      try {
        await this._req('POST', 'referral_codes', {
          query: { on_conflict: 'user_id' },
          body: { code: newRefCode(), user_id: id },
          prefer: 'resolution=ignore-duplicates,return=minimal',
        });
      } catch (e) {
        if (!/returned 409/.test(e.message)) throw e; // the code was taken by someone else: try another
      }
      const got = await this._codeOf(id);
      if (got) return got;
    }
    throw new Error('Could not make a referral code.');
  }

  async userForRefCode(code) {
    const c = String(code || '').trim().toUpperCase();
    if (!c) return null;
    const rows = await this._req('GET', 'referral_codes', { query: { code: `eq.${c}`, select: 'user_id' } });
    return rows[0] ? rows[0].user_id : null;
  }

  // ---- welcome credit, payments ------------------------------------------------------------------

  async hadTrial(id) {
    return (await this._req('GET', 'trials', { query: { user_id: `eq.${id}`, select: 'user_id' } })).length > 0;
  }

  async markTrial(id) {
    await this._req('POST', 'trials', { query: { on_conflict: 'user_id' }, body: { user_id: id, created_ms: this.now() }, prefer: 'resolution=ignore-duplicates,return=minimal' });
  }

  async putPayment(ref, rec) {
    await this._req('POST', 'payments', {
      query: { on_conflict: 'ref' },
      body: { ref, doc: rec, ts_ms: Number(rec.ts) || this.now() },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }

  async getPayment(ref) {
    const rows = await this._req('GET', 'payments', { query: { ref: `eq.${ref}`, select: 'doc' } });
    return rows[0] ? { ...rows[0].doc } : null;
  }

  // ---- money -------------------------------------------------------------------------------------

  // Adds to today's spend and returns the day's totals after the add.
  async spendAdd(day, llmInr, msgInr) {
    const [row] = await this._rpc('add_spend', { p_day: day, p_llm: llmInr, p_msg: msgInr });
    return { llmInr: Number(row.llm_inr), msgInr: Number(row.msg_inr) };
  }

  // Spend today and this month so far, plus how many people were active today.
  async spendSnapshot(day) {
    const [row] = await this._rpc('spend_snapshot', { p_day: day });
    return {
      todayInr: Number(row.today_inr),
      monthInr: Number(row.month_inr),
      llmInr: Number(row.llm_inr),
      msgInr: Number(row.msg_inr),
      activeUsers: Number(row.active_users),
    };
  }

  // Adds to one person's counters for the day. Returns their counts after the add.
  async bumpUserDay(day, userId, dLlm, dInbound) {
    const [row] = await this._rpc('bump_user_day', { p_day: day, p_user: userId, p_llm: dLlm, p_inbound: dInbound });
    return { llm: Number(row.llm), inbound: Number(row.inbound) };
  }

  // The ledger is written by the functions above, so there is nothing to save here.
  async saveLedger() {}

  // ---- counters and shared limits ----------------------------------------------------------------

  // Daily totals only. Counts are per event and per source; no person, address or id is kept.
  async countEvent(event, source = '', now = this.now()) {
    const day = dayOf(now);
    const calls = [this._rpc('bump_stat', { p_day: day, p_event: event, p_source: '' })];
    if (source) calls.push(this._rpc('bump_stat', { p_day: day, p_event: event, p_source: source }));
    await Promise.all(calls);
  }

  // The last `days` days, oldest first, with totals per event and per source.
  async funnel(days = 30, now = this.now()) {
    const keys = [];
    for (let i = days - 1; i >= 0; i--) keys.push(dayOf(now - i * DAY));
    const rows = await this._req('GET', 'stats_daily', { query: { day: `gte.${keys[0]}`, select: 'day,event,source,n' } });
    const byDay = new Map(keys.map((k) => [k, { events: {}, sources: {} }]));
    for (const r of rows) {
      const d = byDay.get(String(r.day));
      if (!d) continue;
      if (r.source) d.sources[`${r.event}|${r.source}`] = (d.sources[`${r.event}|${r.source}`] || 0) + Number(r.n);
      else d.events[r.event] = (d.events[r.event] || 0) + Number(r.n);
    }
    return keys.map((day) => ({ day, ...byDay.get(day) }));
  }

  // WhatsApp retries webhooks; a message id that was already recorded is a repeat.
  async seenBefore(messageId) {
    const rows = await this._req('POST', 'seen_messages', {
      query: { on_conflict: 'id' },
      body: { id: messageId, ts_ms: this.now() },
      prefer: 'resolution=ignore-duplicates,return=representation',
    });
    return rows.length === 0;
  }

  // Fixed-window rate limit shared by every instance. True while the person is within `max` in the window.
  async rateHit(key, windowMs, max) {
    return Boolean(await this._rpc('rate_hit', { p_key: key, p_window_ms: windowMs, p_max: max, p_now_ms: this.now() }));
  }

  // Short-lived values shared by every instance (WhatsApp link codes and similar).
  async kvGet(k) {
    const rows = await this._req('GET', 'kv', { query: { k: `eq.${k}`, expires_ms: `gt.${this.now()}`, select: 'v' } });
    return rows[0] ? rows[0].v : null;
  }

  async kvSet(k, v, ttlMs) {
    await this._req('POST', 'kv', {
      query: { on_conflict: 'k' },
      body: { k, v, expires_ms: this.now() + ttlMs },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }

  async kvDelete(k) {
    await this._req('DELETE', 'kv', { query: { k: `eq.${k}` }, prefer: 'return=minimal' });
  }

  // Removes rows nothing reads any more. Run hourly, next to the account sweep.
  async pruneOld(now = this.now()) {
    const cut = (ms) => dayOf(now - ms);
    const del = (table, query) => this._req('DELETE', table, { query, prefer: 'return=minimal' });
    await Promise.all([
      del('stats_daily', { day: `lt.${cut(90 * DAY)}` }),
      del('spend_daily', { day: `lt.${cut(120 * DAY)}` }),
      del('user_daily', { day: `lt.${cut(3 * DAY)}` }),
      del('seen_messages', { ts_ms: `lt.${now - 7 * DAY}` }),
      del('rate_hits', { window_start: `lt.${now - DAY}` }),
      del('kv', { expires_ms: `lt.${now}` }),
    ]);
  }

  // ---- operator inbox: people who asked for a human ----------------------------------------------
  // A handoff is { id, ts, phone, svc, route, step, lang, status: 'open'|'replied'|'closed', thread: [{ts, dir, text}] }.
  // The phone number and thread are kept only because the person asked for a human. Closed ones go after 30 days.

  _handoffRow(rec) {
    return { id: rec.id, phone: rec.phone, status: rec.status, ts_ms: Number(rec.ts) || 0, closed_ms: rec.closedAt ?? null, doc: rec };
  }

  async listHandoffs() {
    const rows = await this._req('GET', 'handoffs', { query: { select: 'doc', order: 'ts_ms.asc', limit: '500' } });
    return rows.map((r) => r.doc);
  }

  async getHandoff(id) {
    const rows = await this._req('GET', 'handoffs', { query: { id: `eq.${id}`, select: 'doc' } });
    return rows[0] ? rows[0].doc : null;
  }

  /** Newest handoff for this phone that is not closed. */
  async activeHandoff(phone) {
    const rows = await this._req('GET', 'handoffs', { query: { phone: `eq.${phone}`, status: 'neq.closed', select: 'doc', order: 'ts_ms.desc', limit: '1' } });
    return rows[0] ? rows[0].doc : null;
  }

  // Only written when the user explicitly asks for a human.
  async appendHandoff(entry) {
    const id = entry.id || `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const rec = { status: 'open', thread: [], ...entry, id };
    await this._req('POST', 'handoffs', { body: this._handoffRow(rec), prefer: 'return=minimal' });
    return rec;
  }

  async updateHandoff(id, fn) {
    const h = await this.getHandoff(id);
    if (!h) return null;
    fn(h);
    const row = this._handoffRow(h);
    await this._req('PATCH', 'handoffs', { query: { id: `eq.${id}` }, body: { status: row.status, closed_ms: row.closed_ms, doc: row.doc }, prefer: 'return=minimal' });
    return h;
  }

  async pruneHandoffs(maxAgeMs = 30 * DAY) {
    const cutoff = this.now() - maxAgeMs;
    const gone = await this._req('DELETE', 'handoffs', { query: { status: 'eq.closed', closed_ms: `lt.${cutoff}`, select: 'id' }, prefer: 'return=representation' });
    return gone.length;
  }

  // ---- translations ------------------------------------------------------------------------------
  // Edit a record's `reviewed` flag to keep a reviewed translation: the bot never overwrites one.

  async getTranslation(code) {
    const rows = await this._req('GET', 'translations', { query: { code: `eq.${code}`, select: 'doc' } });
    return rows[0] ? rows[0].doc : null;
  }

  async putTranslation(code, rec) {
    const have = await this.getTranslation(code);
    if (have?.reviewed) return false;
    await this._req('POST', 'translations', { query: { on_conflict: 'code' }, body: { code, doc: rec }, prefer: 'resolution=merge-duplicates,return=minimal' });
    return true;
  }

  // ---- backups -----------------------------------------------------------------------------------

  // Supabase keeps the backups (see the header). Nothing is copied from here.
  async backupIfDue() {
    return null;
  }
}
