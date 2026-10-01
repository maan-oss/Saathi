import { istDay } from './costguard.js';

// Money is always whole paise (integers). Never floats.
//
// Rate card (all placeholders, set in .env):
//   msg    a normal guide message. First `freeMsgsPerDay` each day are free, then `msgPaise` each.
//   ai     one AI answer
//   scan   one document scan
//   sheet  one prepared application sheet
//   voice  one voice note turned into text
//   remind one reminder set
// Packs are fixed-price bundles for a preselected task. While a pack is active its included
// things are not charged per message.

export const DEFAULT_RATES = {
  trialPaise: 500,
  freeMsgsPerDay: 40,
  freeAiPerDay: 0, // free AI answers per day (the production config turns some on)
  msgPaise: 15,
  aiPaise: 50,
  scanPaise: 100,
  sheetPaise: 300,
  voicePaise: 50,
  remindPaise: 200,
  topups: [2000, 5000, 10000, 20000],
  packs: {
    pack_quick: { id: 'pack_quick', name: 'Quick pack', paise: 2900, days: 3, scans: 3, ai: 20, voice: 8, remind: 3 },
    pan_pack: { id: 'pan_pack', name: 'Saathi pack', paise: 4900, days: 7, scans: 8, ai: 40, voice: 20, remind: 5 },
    pack_month: { id: 'pack_month', name: 'Saathi Plus', paise: 14900, days: 30, scans: 40, ai: 300, voice: 100, remind: 25 },
  },
};

export const inr = (paise) => {
  const r = paise / 100;
  return '₹' + (Number.isInteger(r) ? String(r) : r.toFixed(2));
};

const rate = (cfg, kind) => {
  const r = { ...DEFAULT_RATES, ...(cfg.rates || {}) };
  return { msg: r.msgPaise, ai: r.aiPaise, scan: r.scanPaise, sheet: r.sheetPaise, voice: r.voicePaise, remind: r.remindPaise }[kind];
};
export const rates = (cfg) => ({ ...DEFAULT_RATES, ...(cfg.rates || {}) });

function wallet(u) {
  if (!u.wallet) u.wallet = { paise: 0, refs: [], history: [] };
  return u.wallet;
}
export const balance = (u) => (u.wallet ? u.wallet.paise : 0);

function log(u, entry) {
  const w = wallet(u);
  w.history.push({ ...entry, bal: w.paise });
  if (w.history.length > 30) w.history.shift();
}

/** One-time welcome credit. */
export function grantTrial(u, cfg, now = Date.now()) {
  if (u.trialGiven) return 0;
  u.trialGiven = true;
  const p = rates(cfg).trialPaise;
  if (p > 0) {
    wallet(u).paise += p;
    log(u, { ts: now, what: 'welcome credit', paise: p });
  }
  return p;
}

export function activePack(u, now = Date.now()) {
  return (u.packs || []).find((p) => p.until > now) || null;
}

export function freeAiLeft(u, cfg, now = Date.now()) {
  const cap = rates(cfg).freeAiPerDay || 0;
  if (!cap) return 0;
  const day = istDay(now);
  if (!u.freeAi || u.freeAi.day !== day) u.freeAi = { day, n: 0 };
  return Math.max(0, cap - u.freeAi.n);
}

export function freeLeft(u, cfg, now = Date.now()) {
  const day = istDay(now);
  if (!u.free || u.free.day !== day) u.free = { day, n: 0 };
  return Math.max(0, rates(cfg).freeMsgsPerDay - u.free.n);
}

/**
 * Try to pay for one thing. Returns { ok, paid, paise, need? }.
 *   paid: 'free' | 'pack' | 'wallet'
 * On ok:false nothing was changed (the caller shows a paywall).
 */
export function charge(u, cfg, kind, now = Date.now()) {
  const pack = activePack(u, now);

  if (kind === 'msg') {
    if (pack) return { ok: true, paid: 'pack', paise: 0 };
    if (freeLeft(u, cfg, now) > 0) {
      u.free.n++;
      return { ok: true, paid: 'free', paise: 0 };
    }
  } else if (kind === 'ai' && freeAiLeft(u, cfg, now) > 0) {
    u.freeAi.n++;
    return { ok: true, paid: 'free', paise: 0 };
  } else if (pack) {
    if (kind === 'sheet') return { ok: true, paid: 'pack', paise: 0 };
    if (kind === 'scan' && pack.scans > 0) {
      pack.scans--;
      return { ok: true, paid: 'pack', paise: 0, packUsed: 'scans' };
    }
    for (const k of ['ai', 'voice', 'remind']) {
      if (kind === k && pack[k] > 0) {
        pack[k]--;
        return { ok: true, paid: 'pack', paise: 0, packUsed: k };
      }
    }
  }

  const price = rate(cfg, kind);
  const w = wallet(u);
  if (w.paise < price) return { ok: false, need: price - w.paise, price };
  w.paise -= price;
  log(u, { ts: now, what: kind, paise: -price });
  return { ok: true, paid: 'wallet', paise: price };
}

/** Undo a charge when we could not deliver (AI failed, photo unreadable). */
export function refund(u, res, kind) {
  if (!res || !res.ok) return;
  if (res.paid === 'wallet') {
    wallet(u).paise += res.paise;
    log(u, { ts: Date.now(), what: `refund ${kind}`, paise: res.paise });
  } else if (res.paid === 'pack' && res.packUsed) {
    const pack = activePack(u);
    if (pack) pack[res.packUsed]++;
  } else if (res.paid === 'free' && kind === 'msg' && u.free) u.free.n = Math.max(0, u.free.n - 1);
  else if (res.paid === 'free' && kind === 'ai' && u.freeAi) u.freeAi.n = Math.max(0, u.freeAi.n - 1);
}

/** Add money. Idempotent: the same ref (payment id) never credits twice. */
export function credit(u, paise, ref, what = 'top-up') {
  const w = wallet(u);
  if (ref && w.refs.includes(ref)) return { ok: false, duplicate: true, balance: w.paise };
  if (!Number.isInteger(paise) || paise <= 0) return { ok: false, balance: w.paise };
  w.paise += paise;
  if (ref) {
    w.refs.push(ref);
    if (w.refs.length > 50) w.refs.shift();
  }
  log(u, { ts: Date.now(), what, paise });
  return { ok: true, balance: w.paise };
}

/** Buy a fixed-price pack from the wallet. */
export function buyPack(u, cfg, id, now = Date.now()) {
  const def = rates(cfg).packs[id];
  if (!def) return { ok: false, reason: 'unknown' };
  const w = wallet(u);
  if (w.paise < def.paise) return { ok: false, reason: 'funds', need: def.paise - w.paise };
  w.paise -= def.paise;
  log(u, { ts: now, what: `pack ${id}`, paise: -def.paise });
  u.packs = (u.packs || []).filter((p) => p.until > now);
  u.packs.push({ id, until: now + def.days * 86400000, scans: def.scans, ai: def.ai, voice: def.voice || 0, remind: def.remind || 0 });
  return { ok: true, pack: def };
}
