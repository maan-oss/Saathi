// The tools behind the app's own pages: locker, details, reminders, applications, scan, synced extras.
// Everything here is a plain function of one person's record. No chat, no AI (except reading a scanned photo).
// The caller (web.js) runs each call inside that person's queue, so two calls never write at once.
import { TYPES, TYPE_IDS, normNumber, normExpiry, showNumber, maskNumber, daysLeft, fmtDate } from './locker.js';
import { findState, STATE_NAMES } from './states.js';
import { FIELDS, GENDER, normAll, fromExtraction } from './profile.js';
import { makeReminder, parseFutureDate, MAX_REMINDERS, daysUntil, rollReminder, rollYearly } from './reminders.js';
import { SERVICES } from './services.js';
import { charge, refund, grantTrial } from './billing.js';
import { ToolError } from './errors.js';
import { guideOps } from './guides.js';

export const MAX_APPS = 30;
export const MAX_WEB_REMINDERS = 12;
const MAX_EXTRAS_BYTES = 80_000;
const DAY_MS = 86_400_000;
const MAX_CHATS_BYTES = 220_000;
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const uuid = () => globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export { ToolError };

export function createTools({ store, vault, llm, guard, config }) {
  /** The person's record. `make` creates it (with the one-time welcome credit) the first time a tool needs to write. */
  function load(uid, make = false) {
    let u = store.getUser(uid);
    if (!u && make) {
      u = { state: 'new', lang: null };
      if (store.hadTrial?.(uid)) u.trialGiven = true;
      else {
        grantTrial(u, config);
        store.markTrial?.(uid);
      }
    }
    return u;
  }
  const open = async (sealed) => (sealed ? (await vault.open(sealed)) || {} : {});

  // ---- locker ------------------------------------------------------------------------------------------
  const lockerRows = (all) =>
    TYPE_IDS.filter((id) => all[id]).map((id) => ({
      type: id,
      name: TYPES[id].en,
      hi: TYPES[id].hi,
      hasNumber: Boolean(all[id].number),
      masked: all[id].number ? maskNumber(all[id].number) : null,
      expiry: all[id].expiry || null,
      left: all[id].expiry ? daysLeft(all[id].expiry) : null,
      saved: all[id].saved || 0,
    }));
  const lockerTypes = () => TYPE_IDS.map((id) => ({ type: id, name: TYPES[id].en, hi: TYPES[id].hi, expiry: TYPES[id].expiry }));

  async function mergeLocker(u, type, patch) {
    const all = await open(u.locker);
    all[type] = { ...(all[type] || {}), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v)), saved: Date.now() };
    u.locker = await vault.seal(all);
    return all;
  }

  const STATE_SYSTEM = `Which Indian state or union territory does the text name? Accept spelling mistakes, short forms, Hindi or other Indian scripts, and cities or districts (answer with their state or union territory). Reply with ONLY the official English name from this list, or NONE if it is not a place in India or you cannot tell: ${STATE_NAMES.join(', ')}.`;
  /** A state from what someone typed: the list first (free), then the AI for cities and odd spellings. Null when it is no place in India. */
  async function resolveState(uid, text) {
    const t = clip(text, 60);
    if (!t) return null;
    const f = findState(t);
    if (f) return f.name;
    if (!llm?.enabled || typeof llm.answer !== 'function' || !guard.llmAllowed(uid)) return null;
    try {
      const r = await llm.answer(STATE_SYSTEM, t, { max: 12 });
      guard.recordLlm(uid, r.usage);
      return findState(String(r.text || '').replace(/[*"'`.\n]/g, ' ').trim())?.name || null;
    } catch {
      return null;
    }
  }

  const ops = {
    ...guideOps(),
    async 'state.find'(uid, a) {
      const name = await resolveState(uid, a.text);
      return { name, hi: name ? findState(name)?.hi : null };
    },
    // ---- overview for the tools hub ----------------------------------------------------------------
    async summary(uid) {
      const u = load(uid);
      const empty = { locker: 0, soon: null, docs: [], reminders: [], apps: 0, appsList: [], guides: {}, details: { filled: 0, total: FIELDS.length }, devices: 0, wa: false };
      if (!u) return empty;
      const all = await open(u.locker);
      const rows = lockerRows(all);
      const soon = rows.filter((r) => r.left !== null && r.left >= 0).sort((a, b) => a.left - b.left)[0] || null;
      const prof = await open(u.vault);
      const ex = await open(u.extras);
      const now = Date.now();
      const guides = {};
      if (ex.guides && typeof ex.guides === 'object') {
        for (const [k, g] of Object.entries(ex.guides).slice(0, 12)) {
          if (g && typeof g === 'object') guides[clip(k, 24)] = { route: clip(g.route, 24), steps: Array.isArray(g.steps) ? g.steps.slice(0, 40) : [], docs: Array.isArray(g.docs) ? g.docs.slice(0, 40) : [], at: Number(g.at) || 0 };
        }
      }
      return {
        locker: rows.length,
        soon: soon ? { type: soon.type, name: soon.name, hi: soon.hi, left: soon.left } : null,
        docs: rows.map((r) => ({ type: r.type, expiry: r.expiry, left: r.left })),
        reminders: (u.reminders || []).map((r) => ({ id: r.id, label: r.label, due: r.due, left: daysUntil(r.due), repeat: r.repeat || null })).sort((a, b) => a.left - b.left).slice(0, 12),
        apps: (ex.apps || []).length,
        appsList: (ex.apps || []).map((a) => ({ id: a.id, svc: a.svc, title: a.title, status: a.status, date: a.date || '', since: a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? -daysUntil(a.date) : null })),
        guides,
        details: { filled: FIELDS.filter((f) => prof[f.key]).length, total: FIELDS.length },
        devices: (u.devices || []).length,
        wa: Boolean(u.waLinked),
        now,
      };
    },

    async 'locker.list'(uid) {
      const u = load(uid);
      return { docs: lockerRows(u ? await open(u.locker) : {}), types: lockerTypes() };
    },
    async 'locker.add'(uid, a) {
      const type = String(a.type || '');
      if (!TYPES[type]) throw new ToolError('bad_type');
      const number = a.number ? normNumber(type, a.number) : null;
      if (a.number && !number) throw new ToolError('bad_number');
      const expiry = a.expiry ? normExpiry(a.expiry) : null;
      if (a.expiry && !expiry) throw new ToolError('bad_date');
      if (!TYPES[type].expiry && a.expiry) throw new ToolError('no_expiry');
      if (!number && !expiry) throw new ToolError('empty');
      const u = load(uid, true);
      const all = await mergeLocker(u, type, { number, expiry });
      store.putUser(uid, u);
      return { docs: lockerRows(all), types: lockerTypes() };
    },
    /** Read-only format check while typing. Nothing is stored or logged. */
    async 'locker.check'(uid, a) {
      const type = String(a.type || '');
      if (!TYPES[type]) throw new ToolError('bad_type');
      const n = a.number ? normNumber(type, a.number) : null;
      return { ok: Boolean(n), pretty: n ? showNumber(type, n) : '' };
    },
    async 'locker.reveal'(uid, a) {
      const u = load(uid);
      const d = u ? (await open(u.locker))[a.type] : null;
      if (!d?.number) throw new ToolError('not_found');
      return { number: showNumber(a.type, d.number), copy: d.number };
    },
    async 'locker.remove'(uid, a) {
      const u = load(uid);
      if (!u?.locker) return ops['locker.list'](uid);
      const all = await open(u.locker);
      delete all[a.type];
      if (Object.keys(all).length) u.locker = await vault.seal(all);
      else delete u.locker;
      store.putUser(uid, u);
      return { docs: lockerRows(all), types: lockerTypes() };
    },

    // ---- details (the "form sheet" data) -----------------------------------------------------------
    async 'details.get'(uid) {
      const u = load(uid);
      const prof = u ? await open(u.vault) : {};
      const fields = FIELDS.map((f) => ({
        key: f.key,
        type: f.type,
        label: f.label,
        options: f.type === 'choice' ? f.options.map((o) => ({ id: o, en: GENDER[o].en, hi: GENDER[o].hi })) : undefined,
        value: prof[f.key] || '',
      }));
      return { fields, filled: fields.filter((f) => f.value).length, total: fields.length };
    },
    async 'details.set'(uid, a) {
      const values = a.values && typeof a.values === 'object' ? { ...a.values } : {};
      if (values.state && !findState(values.state)) values.state = (await resolveState(uid, values.state)) || values.state;
      const u = load(uid, true);
      const prof = await open(u.vault);
      const { clean, bad } = normAll(values);
      // An empty string clears a field.
      for (const f of FIELDS) if (Object.hasOwn(values, f.key) && String(values[f.key] ?? '').trim() === '') delete prof[f.key];
      Object.assign(prof, clean);
      if (Object.keys(prof).length) {
        u.vault = await vault.seal(prof);
        u.vaultConsent = true;
      } else delete u.vault;
      store.putUser(uid, u);
      return { bad, ...(await ops['details.get'](uid)) };
    },

    /** For each guide: how many of the details its form asks for are already saved. */
    async 'details.readiness'(uid) {
      const u = load(uid);
      const prof = u ? await open(u.vault) : {};
      const out = {};
      for (const s of SERVICES) {
        if (s.alias || !Array.isArray(s.sheet) || !s.sheet.length) continue;
        const missing = s.sheet.filter((k) => !prof[k]);
        out[s.id] = { have: s.sheet.length - missing.length, total: s.sheet.length, missing };
      }
      return out;
    },

    // ---- reminders ---------------------------------------------------------------------------------
    async 'reminders.list'(uid) {
      const u = load(uid);
      if (u?.reminders?.length && rollYearly(u)) store.putUser(uid, u);
      const items = (u?.reminders || []).map((r) => ({ id: r.id, label: r.label, due: r.due, left: daysUntil(r.due), note: r.note || '', repeat: r.repeat || null })).sort((a, b) => a.left - b.left);
      return { items, wa: Boolean(u?.phoneSealed), max: MAX_WEB_REMINDERS };
    },
    async 'reminders.add'(uid, a) {
      const label = clip(a.label, 40);
      const due = parseFutureDate(a.due);
      if (!label) throw new ToolError('bad_label');
      if (!due) throw new ToolError('bad_date');
      const u = load(uid, true);
      const list = (u.reminders || []).filter((r) => r.label !== label);
      if (list.length >= Math.max(MAX_REMINDERS, MAX_WEB_REMINDERS)) throw new ToolError('full');
      u.reminders = [...list, makeReminder({ id: 'r' + Date.now().toString(36) + uuid().slice(0, 3), type: 'custom', label, due, note: clip(a.note, 120), repeat: a.repeat === 'yearly' ? 'yearly' : null })];
      store.putUser(uid, u);
      return ops['reminders.list'](uid);
    },
    /** Change the name, date, note or repeat of one reminder. A new date starts its notices again. */
    async 'reminders.update'(uid, a) {
      const u = load(uid);
      const r = (u?.reminders || []).find((x) => x.id === a.id);
      if (!r) throw new ToolError('not_found');
      const label = a.label === undefined ? r.label : clip(a.label, 40);
      if (!label) throw new ToolError('bad_label');
      let due = r.due;
      if (a.due !== undefined && a.due !== r.due) {
        due = parseFutureDate(a.due);
        if (!due) throw new ToolError('bad_date');
      }
      const note = a.note === undefined ? r.note || '' : clip(a.note, 120);
      const repeat = a.repeat === undefined ? r.repeat : a.repeat === 'yearly' ? 'yearly' : null;
      if (u.reminders.some((x) => x.id !== r.id && x.label === label)) throw new ToolError('bad_label');
      const next = due === r.due ? { ...r, label, note: note || undefined, repeat: repeat || undefined } : { ...makeReminder({ id: r.id, type: r.type, label, due, note, repeat }), made: r.made };
      if (!next.note) delete next.note;
      if (!next.repeat) delete next.repeat;
      u.reminders = u.reminders.map((x) => (x.id === r.id ? next : x));
      store.putUser(uid, u);
      return ops['reminders.list'](uid);
    },
    /** Mark one as done. A yearly one moves to next year with fresh notices; any other is removed. */
    async 'reminders.done'(uid, a) {
      const u = load(uid);
      const r = (u?.reminders || []).find((x) => x.id === a.id);
      if (!r) return ops['reminders.list'](uid);
      if (r.repeat === 'yearly') u.reminders = u.reminders.map((x) => (x.id === r.id ? rollReminder(r) : x));
      else {
        u.reminders = u.reminders.filter((x) => x.id !== r.id);
        if (!u.reminders.length) delete u.reminders;
      }
      store.putUser(uid, u);
      return ops['reminders.list'](uid);
    },
    async 'reminders.remove'(uid, a) {
      const u = load(uid);
      if (u?.reminders) {
        u.reminders = u.reminders.filter((r) => r.id !== a.id);
        if (!u.reminders.length) delete u.reminders;
        store.putUser(uid, u);
      }
      return ops['reminders.list'](uid);
    },

    // ---- extras: applications, checklist ticks, preferences (sealed, synced across linked devices) --
    async 'extras.get'(uid) {
      const u = load(uid);
      const ex = u ? await open(u.extras) : {};
      return { apps: ex.apps || [], checks: ex.checks || {}, guides: ex.guides || {}, prefs: ex.prefs || {}, v: ex.v || 0 };
    },
    async 'extras.set'(uid, a) {
      const u = load(uid, true);
      const ex = await open(u.extras);
      if (Array.isArray(a.apps)) {
        ex.apps = a.apps.slice(0, MAX_APPS).map((x) => ({
          id: clip(x.id, 24) || uuid(),
          svc: clip(x.svc, 24),
          title: clip(x.title, 60),
          ref: clip(x.ref, 40),
          note: clip(x.note, 200),
          status: ['preparing', 'applied', 'waiting', 'done'].includes(x.status) ? x.status : 'preparing',
          date: clip(x.date, 12),
          due: /^\d{4}-\d{2}-\d{2}$/.test(String(x.due || '')) ? String(x.due) : '',
          hist: (Array.isArray(x.hist) ? x.hist : [])
            .filter((h) => h && ['preparing', 'applied', 'waiting', 'done'].includes(h.s) && Number.isFinite(Number(h.ts)))
            .slice(-8)
            .map((h) => ({ s: h.s, ts: Math.round(Number(h.ts)) })),
        }));
      }
      if (a.guides && typeof a.guides === 'object') {
        // Progress in each guide: which route, the answers, which steps and documents are ticked.
        const out = {};
        for (const [svc, g] of Object.entries(a.guides).slice(0, 12)) {
          if (!g || typeof g !== 'object' || !SERVICES.some((x) => x.id === svc)) continue;
          out[clip(svc, 24)] = {
            route: clip(g.route, 20),
            ans: Object.fromEntries(Object.entries(g.ans && typeof g.ans === 'object' ? g.ans : {}).slice(0, 6).map(([k, v]) => [clip(k, 20), clip(v, 40)])),
            steps: (Array.isArray(g.steps) ? g.steps : []).map((n) => Math.round(Number(n))).filter((n) => n >= 0 && n < 30).slice(0, 30),
            docs: (Array.isArray(g.docs) ? g.docs : []).map((n) => clip(n, 20)).filter(Boolean).slice(0, 30),
            fee: g.fee && typeof g.fee === 'object' ? Object.fromEntries(Object.entries(g.fee).slice(0, 6).map(([k, v]) => [clip(k, 20), typeof v === 'boolean' || typeof v === 'number' ? v : clip(v, 20)])) : undefined,
            at: Math.round(Number(g.at)) || Date.now(),
          };
        }
        ex.guides = out;
      }
      if (a.checks && typeof a.checks === 'object') {
        const out = {};
        for (const [svc, list] of Object.entries(a.checks).slice(0, 12)) if (Array.isArray(list)) out[clip(svc, 24)] = list.slice(0, 30).map((n) => clip(n, 80)).filter(Boolean);
        ex.checks = out;
      }
      if (a.prefs && typeof a.prefs === 'object') ex.prefs = { ...(ex.prefs || {}), ...Object.fromEntries(Object.entries(a.prefs).slice(0, 8).map(([k, v]) => [clip(k, 20), typeof v === 'boolean' ? v : clip(v, 40)])) };
      ex.v = (ex.v || 0) + 1;
      if (JSON.stringify(ex).length > MAX_EXTRAS_BYTES) throw new ToolError('too_big');
      u.extras = await vault.seal(ex);
      store.putUser(uid, u);
      return { apps: ex.apps || [], checks: ex.checks || {}, guides: ex.guides || {}, prefs: ex.prefs || {}, v: ex.v };
    },

    // ---- chats, only when the person turns sync on ---------------------------------------------------
    async 'chats.get'(uid) {
      const u = load(uid);
      return { blob: u?.chatsSync ? (await open(u.chatsSync)).blob || null : null };
    },
    async 'chats.put'(uid, a) {
      const blob = typeof a.blob === 'string' ? a.blob : '';
      if (blob.length > MAX_CHATS_BYTES) throw new ToolError('too_big');
      const u = load(uid, true);
      if (blob) u.chatsSync = await vault.seal({ blob });
      else delete u.chatsSync;
      store.putUser(uid, u);
      return { ok: true };
    },

    // ---- scan a document -------------------------------------------------------------------------------
    /** Reads one photo or PDF. Charges like the chat does and refunds when nothing usable came out. */
    async scan(uid, a) {
      const { buffer, mime } = a;
      if (!config.docCheck) throw new ToolError('off');
      if (!llm.enabled || !guard.llmAllowed(uid)) throw new ToolError('busy');
      if (!buffer || buffer.length > MAX_DOC_BYTES) throw new ToolError('too_big');
      const u = load(uid, true);
      if (!u.docConsent && !a.consent) throw new ToolError('consent');
      u.docConsent = true;
      const c = charge(u, config, 'scan');
      if (!c.ok) {
        store.putUser(uid, u);
        throw new ToolError('paywall', { need: c.need, price: c.price });
      }
      store.putUser(uid, u);
      let r;
      try {
        r = await llm.checkDocument(buffer, mime);
        guard.recordLlm(uid, r.usage);
      } catch (e) {
        console.error('scan error:', e.message);
        const v = load(uid, true);
        refund(v, c, 'scan');
        store.putUser(uid, v);
        throw new ToolError('failed');
      }
      const back = async (code, extra) => {
        const v = load(uid, true);
        refund(v, c, 'scan');
        store.putUser(uid, v);
        throw new ToolError(code, extra);
      };
      if (!r.readable || r.type === 'not_a_document') await back('unclear', { issues: r.issues || [] });
      const { clean: found } = normAll(fromExtraction(r));
      // What belongs in the locker: the number's own shape settles the type if the model was vague.
      let kind = String(r.type || '').replace('pan_card', 'pan');
      if (!TYPES[kind]) kind = TYPE_IDS.find((id) => normNumber(id, r.number ?? r.fields?.number)) || null;
      const number = kind ? normNumber(kind, r.number ?? r.fields?.number) : null;
      const expiry = kind && TYPES[kind].expiry ? normExpiry(r.expiry ?? r.fields?.expiry) : null;
      if (!Object.keys(found).length && !number && !expiry) await back('nofields', { type: kind });
      const v = load(uid, true);
      const scanId = uuid();
      v.pendingScan = await vault.seal({ id: scanId, kind, number, expiry, found, ts: Date.now() });
      store.putUser(uid, v);
      return {
        scanId,
        type: kind,
        typeName: kind ? TYPES[kind].en : String(r.type || 'document').replaceAll('_', ' '),
        typeHi: kind ? TYPES[kind].hi : null,
        issues: (r.issues || []).slice(0, 3),
        fields: Object.entries(found).map(([key, value]) => ({ key, label: FIELDS.find((f) => f.key === key)?.label, value })),
        locker: kind && (number || expiry) ? { type: kind, masked: number ? maskNumber(number) : null, expiry, left: expiry ? daysLeft(expiry) : null } : null,
      };
    },
    async 'scan.save'(uid, a) {
      const u = load(uid);
      const p = u?.pendingScan ? await open(u.pendingScan) : null;
      if (!p || p.id !== a.scanId || Date.now() - p.ts > 15 * 60 * 1000) throw new ToolError('expired');
      let saved = 0;
      if (a.locker && p.kind && (p.number || p.expiry)) {
        await mergeLocker(u, p.kind, { number: p.number, expiry: p.expiry });
        saved++;
      }
      if (a.details && Object.keys(p.found).length) {
        const prof = await open(u.vault);
        for (const [k, val] of Object.entries(p.found)) if (val) prof[k] = val;
        u.vault = await vault.seal(prof);
        u.vaultConsent = true;
        saved++;
      }
      delete u.pendingScan;
      store.putUser(uid, u);
      return { saved };
    },
    // Referrals. ref.code gives this person's invite code. ref.set attaches the person who invited them,
    // once, and only before their first top-up, so nobody can switch referrers after paying.
    async 'ref.code'(uid) {
      return { code: store.refCodeFor(uid) };
    },
    async 'ref.set'(uid, args = {}) {
      const u = store.getUser(uid);
      if (!u) return { done: false };
      const owner = store.userForRefCode(args.code);
      if (u.referrerId || u.firstPaidAt || !owner || owner === uid || !store.getUser(owner)) return { done: true, saved: false };
      u.referrerId = owner;
      store.putUser(uid, u);
      return { done: true, saved: true };
    },
  };
  return {
    ops,
    /** Runs one op by name. Throws ToolError for anything the person can fix. */
    async run(uid, op, args = {}) {
      const fn = ops[op];
      if (!fn) throw new ToolError('unknown_op');
      return fn(uid, args);
    },
    has: (op) => Object.hasOwn(ops, op),
  };
}

export { fmtDate };
