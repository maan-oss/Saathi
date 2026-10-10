import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, copyFileSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

// Every file the store keeps. The daily backup copies exactly these.
export const STORE_FILES = ['users.json', 'ledger.json', 'payments.json', 'trials.json', 'translations.json', 'settings.json', 'referrals.json', 'handoff.json', 'stats.json'];
const BACKUP_KEEP_DAYS = 14;

// What an account with a wallet balance keeps after its personal details are erased. Everything else is erased,
// so a new personal field is erased by default. wallet, packs and trialGiven hold the money and the welcome-credit
// check. devices, waUid and waLinked connect the account to the person's phone and other devices, so the balance
// can still be reached. referrerId and firstPaidAt are needed for referral and accounting records.
const KEEP_WITH_BALANCE = ['wallet', 'packs', 'devices', 'linkTo', 'waLinked', 'waUid', 'firstPaidAt', 'referrerId', 'trialGiven', 'lang', 'updated', 'state'];

// Per-session state, reset after the idle time.
const SESSION_RESET = ['svc', 'ans', 'route', 'step', 'pending', 'await', 'next', 'fillKeys', 'fillIdx', 'backTo', 'pickFor', 'remType', 'remLabel'];
const needsReset = (u) => u.state !== (u.lang ? 'menu' : 'new') || SESSION_RESET.some((k) => u[k] !== undefined);
const resetSession = (u) => {
  for (const k of SESSION_RESET) delete u[k];
  u.state = u.lang ? 'menu' : 'new';
};

// Minimal JSON-file store. Fine for a pilot (hundreds of users/day).
// Move to SQLite/Postgres when you outgrow it.
//
// Safety rules:
//  - Refuse to start if the data folder cannot be written. Nothing is saved to a folder that is not kept.
//  - Refuse to start if a data file exists but cannot be read. Otherwise the app would start empty and the
//    next save would overwrite the file with almost nothing.
//  - Keep a dated copy of every file in backups/ each day, for the last 14 days.
export class Store {
  constructor(dir) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this._checkWritable();
    this.users = this._load('users.json', {});
    this.ledger = this._load('ledger.json', { days: {} });
    this.payments = this._load('payments.json', {});
    this.trials = this._load('trials.json', {});
    this.translations = this._load('translations.json', {});
    this.settings = this._load('settings.json', {});
    this.referrals = this._load('referrals.json', { byUser: {}, byCode: {} });
    this.stats = this._load('stats.json', { days: {} });
    this.seen = [];
  }

  getSetting(k) {
    return this.settings[k];
  }

  setSetting(k, v) {
    if (v === undefined || v === null || v === '') delete this.settings[k];
    else this.settings[k] = v;
    this._save('settings.json', this.settings);
  }

  _checkWritable() {
    const probe = join(this.dir, '.write-check');
    try {
      writeFileSync(probe, String(Date.now()));
      unlinkSync(probe);
    } catch (e) {
      throw new Error(`Saathi data folder ${this.dir} cannot be written (${e.code || e.message}). Refusing to start so no data is lost. Check the disk in your host settings.`);
    }
  }

  // A missing file is a fresh install. A file that is there but cannot be read is an error, not an empty store.
  _load(file, fallback) {
    const p = join(this.dir, file);
    if (!existsSync(p)) return fallback;
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch (e) {
      throw new Error(`Saathi data file ${p} cannot be read (${e.message}). Refusing to start: saving now would overwrite it. Restore it from ${join(this.dir, 'backups')} or repair it by hand.`);
    }
  }

  _save(file, obj) {
    const p = join(this.dir, file);
    writeFileSync(p + '.tmp', JSON.stringify(obj));
    renameSync(p + '.tmp', p);
  }

  // Copies every store file into backups/YYYY-MM-DD/ and drops folders older than 14 days.
  // Returns the day it wrote, or null when today's copy already exists.
  backupIfDue(now = Date.now()) {
    const day = new Date(now).toISOString().slice(0, 10);
    const root = join(this.dir, 'backups');
    const dest = join(root, day);
    if (existsSync(dest)) return null;
    mkdirSync(dest, { recursive: true });
    for (const f of STORE_FILES) if (existsSync(join(this.dir, f))) copyFileSync(join(this.dir, f), join(dest, f));
    const cutoff = new Date(now - BACKUP_KEEP_DAYS * 86400000).toISOString().slice(0, 10);
    for (const name of readdirSync(root)) if (/^\d{4}-\d{2}-\d{2}$/.test(name) && name < cutoff) rmSync(join(root, name), { recursive: true, force: true });
    return day;
  }

  // Tells whether the data folder is its own disk. On Render a mounted disk at /data has a different device
  // from its parent folder. If they match, the folder lives on the container and is lost on a redeploy.
  storageInfo() {
    try {
      return { dir: this.dir, separateDisk: statSync(this.dir).dev !== statSync(dirname(resolve(this.dir))).dev };
    } catch {
      return { dir: this.dir, separateDisk: null };
    }
  }

  getUser(id) {
    return this.users[id] ? { ...this.users[id] } : null;
  }

  putUser(id, user) {
    this.users[id] = { ...user, updated: Date.now() };
    this._save('users.json', this.users);
  }

  deleteUser(id) {
    delete this.users[id];
    this._save('users.json', this.users);
    const code = this.referrals.byUser[id];
    if (code) {
      delete this.referrals.byUser[id];
      delete this.referrals.byCode[code];
      this._save('referrals.json', this.referrals);
    }
  }

  // Referral codes: one short code per person, and the person it belongs to. Codes are random, so they
  // cannot be guessed from an account id. Removed with the account.
  refCodeFor(id) {
    const have = this.referrals.byUser[id];
    if (have) return have;
    const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do code = Array.from(randomBytes(6), (b) => alpha[b % alpha.length]).join('');
    while (this.referrals.byCode[code]);
    this.referrals.byUser[id] = code;
    this.referrals.byCode[code] = id;
    this._save('referrals.json', this.referrals);
    return code;
  }

  userForRefCode(code) {
    return this.referrals.byCode[String(code || '').trim().toUpperCase()] || null;
  }

  // Privacy: forget people who have been idle. Session state goes after idleMs. People who saved a
  // profile or hold wallet money keep their account until keepMs of inactivity, then it goes too.
  // Cleanup, run hourly. Two rules:
  //  - An account with no wallet balance is deleted after keepMs without a message (idleMs if it holds nothing).
  //  - An account WITH a wallet balance is never deleted for inactivity. After keepMs without a message its
  //    personal details are erased (profile, saved details, locker, reminders, phone number, chat copy, consents).
  //    The balance, and what links the account to the person's devices and WhatsApp, stay until they use it or
  //    ask for a refund ("Talk to a human").
  sweep(idleMs, keepMs = idleMs, now = Date.now()) {
    let n = 0;
    for (const [id, u] of Object.entries(this.users)) {
      const idle = now - (u.updated || 0);
      if ((u.wallet?.paise || 0) > 0) {
        if (idle > keepMs) n += this._eraseDetails(u, now);
        else if (idle > idleMs && needsReset(u)) {
          resetSession(u);
          n++;
        }
        continue;
      }
      // A linked-device pointer belongs to its main account. It is kept while that account exists, and removed with it.
      if (u.linkTo) {
        if (!this.users[u.linkTo]) {
          delete this.users[id];
          n++;
        }
        continue;
      }
      const hasValue = Boolean(u.vault) || (u.packs || []).some((p) => p.until > now) || (u.reminders || []).length > 0 || (u.devices || []).length > 0 || Boolean(u.locker) || Boolean(u.extras);
      if (idle > (hasValue ? keepMs : idleMs)) {
        delete this.users[id];
        n++;
      } else if (idle > idleMs && needsReset(u)) {
        resetSession(u);
        n++;
      }
    }
    if (n) this._save('users.json', this.users);
    return n;
  }

  // Erases everything on a balance-holding account except the keys it needs to keep the money reachable.
  // Returns 1 if anything was erased, 0 if it was already clean (so the hourly run does not count it again).
  _eraseDetails(u, now) {
    const personal = Object.keys(u).filter((k) => !KEEP_WITH_BALANCE.includes(k));
    if (!personal.length) return 0;
    for (const k of personal) delete u[k];
    u.state = u.lang ? 'menu' : 'new';
    if (u.packs) u.packs = u.packs.filter((p) => p.until > now);
    return 1;
  }

  // Remembers (by scrambled ID only) that a welcome credit was given, so delete-and-return cannot farm it.
  hadTrial(id) {
    return Boolean(this.trials[id]);
  }

  markTrial(id) {
    this.trials[id] = 1;
    this._save('trials.json', this.trials);
  }

  // Payment records are kept (amount, date, reference) for accounts and tax. The phone number is only
  // held on a pending record so we can message "payment received", then removed.
  putPayment(ref, rec) {
    this.payments[ref] = rec;
    this._save('payments.json', this.payments);
  }

  getPayment(ref) {
    return this.payments[ref] ? { ...this.payments[ref] } : null;
  }

  saveLedger() {
    this._save('ledger.json', this.ledger);
  }

  // Daily totals only (see analytics.js). Counts are per event and per source; no person, address or id is kept.
  // Days older than 90 are dropped.
  countEvent(event, source = '', now = Date.now()) {
    const day = new Date(now).toISOString().slice(0, 10);
    const d = (this.stats.days[day] ||= { events: {}, sources: {} });
    d.events[event] = (d.events[event] || 0) + 1;
    if (source) {
      const k = `${event}|${source}`;
      d.sources[k] = (d.sources[k] || 0) + 1;
    }
    const cutoff = new Date(now - 90 * 86400000).toISOString().slice(0, 10);
    for (const k of Object.keys(this.stats.days)) if (k < cutoff) delete this.stats.days[k];
    this._save('stats.json', this.stats);
  }

  // The last `days` days, oldest first, with totals per event and per source.
  funnel(days = 30, now = Date.now()) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
      const d = this.stats.days[day] || { events: {}, sources: {} };
      out.push({ day, events: d.events, sources: d.sources });
    }
    return out;
  }

  // WhatsApp retries webhooks; ignore repeats.
  seenBefore(messageId) {
    if (this.seen.includes(messageId)) return true;
    this.seen.push(messageId);
    if (this.seen.length > 2000) this.seen.shift();
    return false;
  }

  // Machine translations of the bot's texts, one record per language. Edit translations.json by hand to
  // replace a machine translation with a reviewed one: the bot never overwrites a record marked reviewed.
  getTranslation(code) {
    return this.translations[code] || null;
  }

  putTranslation(code, rec) {
    if (this.translations[code]?.reviewed) return false;
    this.translations[code] = rec;
    this._save('translations.json', this.translations);
    return true;
  }

  // ---- operator inbox: people who asked for a human ---------------------------------------
  // A handoff is { id, ts, phone, svc, route, step, lang, status: 'open'|'replied'|'closed', thread: [{ts, dir, text}] }.
  // The phone number and thread are kept only because the person asked for a human. Closed ones go after 30 days.
  _handoffs() {
    return this._load('handoff.json', []);
  }

  listHandoffs() {
    return this._handoffs();
  }

  getHandoff(id) {
    return this._handoffs().find((h) => h.id === id) || null;
  }

  /** Newest handoff for this phone that is not closed. */
  activeHandoff(phone) {
    const list = this._handoffs();
    for (let i = list.length - 1; i >= 0; i--) if (list[i].phone === phone && list[i].status !== 'closed') return list[i];
    return null;
  }

  // Only written when the user explicitly asks for a human.
  appendHandoff(entry) {
    const list = this._handoffs();
    const rec = { id: entry.id || `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, status: 'open', thread: [], ...entry };
    list.push(rec);
    this._save('handoff.json', list.slice(-500));
    return rec;
  }

  updateHandoff(id, fn) {
    const list = this._handoffs();
    const h = list.find((x) => x.id === id);
    if (!h) return null;
    fn(h);
    this._save('handoff.json', list);
    return h;
  }

  pruneHandoffs(maxAgeMs = 30 * 86400000) {
    const list = this._handoffs();
    const keep = list.filter((h) => !(h.status === 'closed' && Date.now() - (h.closedAt || 0) > maxAgeMs));
    if (keep.length !== list.length) this._save('handoff.json', keep);
    return list.length - keep.length;
  }
}
