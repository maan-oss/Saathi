// Linking devices and WhatsApp to one account, safely.
//
// How it stays safe:
//  - A device shows a one-time code (8 characters from an alphabet without look-alikes, ~40 bits). It works once,
//    for 5 minutes, and is stored only as a keyed hash, so a leaked data file reveals no usable code.
//  - Guessing is capped per address, so the code cannot be brute-forced in its lifetime.
//  - The device that joins must confirm on its own screen; WhatsApp links need a second "Yes" reply from that phone.
//    WhatsApp itself proves the sender owns the number, so no one can link a number they do not control.
//  - Every linked device can be removed at any time, and removing it cuts its access immediately: a device is only
//    a small pointer record ("this device belongs to account X"), nothing more.
import crypto from 'node:crypto';
import { credit } from './billing.js';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL = 5 * 60 * 1000;
const MAX_DEVICES = 5;
const HOUR = 3600 * 1000;

export class LinkError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export const normCode = (c) => [...String(c || '').toUpperCase()].filter((ch) => ALPHA.includes(ch)).join('').slice(0, 8);
const pretty = (c) => c.slice(0, 4) + '-' + c.slice(4);

export function createLinks({ store, config, vault }) {
  const keyed = (code) => crypto.createHmac('sha256', config.hashSalt).update('link:' + code).digest('hex').slice(0, 32);
  // Each code is its own short-lived row in the shared store, keyed by its hash. Several instances can make and use
  // codes at the same time without overwriting each other, and a code can be taken once: taking it is one step, so
  // only the caller that gets it can use it. The store never holds the code itself.
  const codeKey = (h) => 'linkcode:' + h;
  const ofKey = (uid, kind) => 'linkof:' + uid + ':' + kind;
  const peekCode = (h) => store.kvGet(codeKey(h));
  const takeCode = (h) => store.kvTake(codeKey(h));
  // WhatsApp pending links ('link:' + phone uid) and attempt counts ('linktry:' + phone uid) live in the shared store.

  async function make(uid, kind) {
    const raw = Array.from({ length: 8 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('');
    const h = keyed(raw);
    // A new code replaces the person's previous code of the same kind.
    const old = await store.kvGet(ofKey(uid, kind));
    if (old) await store.kvDelete(codeKey(old));
    await store.kvSet(codeKey(h), { uid, kind }, TTL);
    await store.kvSet(ofKey(uid, kind), h, TTL);
    return { code: pretty(raw), exp: Date.now() + TTL };
  }

  return {
    /** The account this device really belongs to. A pointer whose account is gone is dropped. */
    async resolve(uid) {
      const u = await store.getUser(uid);
      if (!u?.linkTo) return uid;
      const p = await store.getUser(u.linkTo);
      if (!p) {
        await store.deleteUser(uid);
        return uid;
      }
      const now = Date.now();
      if (now - (u.updated || 0) > HOUR) await store.putUser(uid, u);
      if (now - (p.updated || 0) > HOUR) await store.putUser(u.linkTo, p);
      return u.linkTo;
    },

    async newDeviceCode(primary, label) {
      const p = await store.getUser(primary);
      if (!p) throw new LinkError('no_account');
      if ((p.devices || []).length >= MAX_DEVICES) throw new LinkError('too_many');
      if (!p.mainLabel) {
        p.mainLabel = String(label || 'First device').slice(0, 40);
        await store.putUser(primary, p);
      }
      return make(primary, 'device');
    },
    async newWaCode(primary) {
      if (!(await store.getUser(primary))) throw new LinkError('no_account');
      return make(primary, 'wa');
    },

    /** A device enters a code. `deviceUid` is the device's own id (not its account). */
    async joinDevice(code, deviceUid, label) {
      const c = normCode(code);
      if (c.length !== 8) throw new LinkError('bad_code');
      const k = keyed(c);
      const rec = await peekCode(k);
      if (!rec || rec.kind !== 'device') throw new LinkError('bad_code');
      const primary = rec.uid;
      if (primary === deviceUid) throw new LinkError('same');
      const p = await store.getUser(primary);
      if (!p) throw new LinkError('bad_code');
      const mine = await store.getUser(deviceUid);
      if (mine?.linkTo) throw new LinkError('already_linked');
      if (mine?.devices?.length) throw new LinkError('has_devices');
      if ((p.devices || []).length >= MAX_DEVICES) throw new LinkError('too_many');
      // Claim the code before linking: of two devices that enter it at the same moment, only one gets through.
      if (!(await takeCode(k))) throw new LinkError('bad_code');
      const now = Date.now();
      await store.putUser(deviceUid, { linkTo: primary, label: String(label || 'Device').slice(0, 40), added: now, state: 'menu', lang: p.lang || null });
      p.devices = [...(p.devices || []), { id: deviceUid, label: String(label || 'Device').slice(0, 40), added: now }];
      await store.putUser(primary, p);
      return { primary };
    },

    async devices(primary, thisDevice) {
      const p = await store.getUser(primary);
      if (!p) return { list: [], wa: false };
      const list = [];
      const ptrs = p.devices || [];
      const mainId = [primary, ...ptrs.map((d) => d.id)].find((id) => id === primary);
      list.push({ id: primary, label: p.mainLabel && p.mainLabel !== 'First device' ? p.mainLabel : 'Main device', main: true, current: thisDevice === primary });
      for (const d of ptrs) list.push({ id: d.id, label: d.label, added: d.added, current: d.id === thisDevice });
      return { list, wa: Boolean(p.waLinked), mainId };
    },

    async removeDevice(primary, id) {
      const p = await store.getUser(primary);
      if (!p) throw new LinkError('no_account');
      if (id === primary) throw new LinkError('is_main');
      const ptr = await store.getUser(id);
      if (ptr?.linkTo === primary) await store.deleteUser(id);
      p.devices = (p.devices || []).filter((d) => d.id !== id);
      await store.putUser(primary, p);
    },
    /** This device stops sharing the account. It starts fresh. */
    async unlinkSelf(deviceUid) {
      const u = await store.getUser(deviceUid);
      if (!u?.linkTo) throw new LinkError('is_main');
      const p = await store.getUser(u.linkTo);
      if (p) {
        p.devices = (p.devices || []).filter((d) => d.id !== deviceUid);
        await store.putUser(u.linkTo, p);
      }
      await store.deleteUser(deviceUid);
    },
    async signOutOthers(primary, thisDevice) {
      const p = await store.getUser(primary);
      if (!p) return;
      for (const d of p.devices || []) if (d.id !== thisDevice && (await store.getUser(d.id))?.linkTo === primary) await store.deleteUser(d.id);
      p.devices = (p.devices || []).filter((d) => d.id === thisDevice);
      await store.putUser(primary, p);
    },

    // ---- WhatsApp ----------------------------------------------------------------------------------
    /** The person sent "LINK CODE" from WhatsApp. Returns true when the code is valid and now waits for their Yes. */
    async waStart(code, phoneUid) {
      const now = Date.now();
      // Every attempt counts, valid or not: at most 6 an hour per phone.
      if (!(await store.rateHit('linktry:' + phoneUid, HOUR, 6))) throw new LinkError('slow_down');
      const c = normCode(code);
      const k = c.length === 8 ? keyed(c) : null;
      const rec = k ? await peekCode(k) : null;
      if (!rec || rec.kind !== 'wa') throw new LinkError('bad_code');
      await store.kvSet('link:' + phoneUid, { key: k, exp: now + TTL }, TTL);
      return true;
    },
    async waPendingFor(phoneUid) {
      const pend = await store.kvGet('link:' + phoneUid);
      return pend?.exp > Date.now() ? true : false;
    },
    async waCancel(phoneUid) {
      await store.kvDelete('link:' + phoneUid);
    },
    /** The person said Yes on WhatsApp. Joins that number to the account and moves any data it had into it. */
    async waConfirm(phoneUid, phone) {
      // Claim the pending link and its code in single steps: a second "Yes" (or a second instance) finds nothing
      // and cannot merge the same data twice.
      const pend = await store.kvTake('link:' + phoneUid);
      if (!pend || pend.exp < Date.now()) throw new LinkError('expired');
      const rec = await takeCode(pend.key);
      if (!rec || rec.kind !== 'wa') throw new LinkError('expired');
      const primary = rec.uid;
      const p = await store.getUser(primary);
      if (!p) throw new LinkError('expired');
      if (p.waLinked && p.waUid && p.waUid !== phoneUid) {
        // One phone per account: the old one is released first.
        const old = await store.getUser(p.waUid);
        if (old?.linkTo === primary) await store.deleteUser(p.waUid);
      }
      const w = await store.getUser(phoneUid);
      if (w && !w.linkTo) {
        if (!p.locker && w.locker) p.locker = w.locker;
        if (!p.vault && w.vault) { p.vault = w.vault; p.vaultConsent = w.vaultConsent; }
        if (!p.extras && w.extras) p.extras = w.extras;
        if ((w.reminders || []).length) {
          const have = new Set((p.reminders || []).map((r) => r.id));
          p.reminders = [...(p.reminders || []), ...w.reminders.filter((r) => !have.has(r.id))];
        }
        if ((w.packs || []).length) p.packs = [...(p.packs || []), ...w.packs];
        if (w.wallet?.paise > 0) credit(p, w.wallet.paise, 'merge:' + phoneUid, 'merged from WhatsApp');
        p.trialGiven = true;
        if (!p.lang && w.lang) p.lang = w.lang;
      }
      p.waLinked = true;
      p.waUid = phoneUid;
      p.phoneSealed = await vault.seal({ phone });
      await store.putUser(primary, p);
      await store.putUser(phoneUid, { linkTo: primary, wa: true, added: Date.now(), state: 'menu', lang: p.lang || null });
      return { primary };
    },
    async unlinkWa(primary) {
      const p = await store.getUser(primary);
      if (!p) throw new LinkError('no_account');
      if (p.waUid) {
        const ptr = await store.getUser(p.waUid);
        if (ptr?.linkTo === primary) await store.deleteUser(p.waUid);
      }
      delete p.waLinked;
      delete p.waUid;
      delete p.phoneSealed;
      await store.putUser(primary, p);
    },
  };
}
