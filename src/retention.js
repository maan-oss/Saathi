// Retention rules for user records. Shared by the file store and the Supabase store, so both erase and reset
// people the same way. Pure: each function changes the record it is given and says what it did.

// What an account with a wallet balance keeps after its personal details are erased. Everything else is erased,
// so a new personal field is erased by default. wallet, packs and trialGiven hold the money and the welcome-credit
// check. devices, waUid and waLinked connect the account to the person's phone and other devices, so the balance
// can still be reached. referrerId and firstPaidAt are needed for referral and accounting records.
export const KEEP_WITH_BALANCE = ['wallet', 'packs', 'devices', 'linkTo', 'waLinked', 'waUid', 'firstPaidAt', 'referrerId', 'trialGiven', 'lang', 'updated', 'state'];

// Per-session state, reset after the idle time.
export const SESSION_RESET = ['svc', 'ans', 'route', 'step', 'pending', 'await', 'next', 'fillKeys', 'fillIdx', 'backTo', 'pickFor', 'remType', 'remLabel'];

export const needsReset = (u) => u.state !== (u.lang ? 'menu' : 'new') || SESSION_RESET.some((k) => u[k] !== undefined);

export function resetSession(u) {
  for (const k of SESSION_RESET) delete u[k];
  u.state = u.lang ? 'menu' : 'new';
}

// Erases everything on a balance-holding account except the keys it needs to keep the money reachable.
// Returns 1 if anything was erased, 0 if it was already clean (so the hourly run does not count it again).
export function eraseDetails(u, now) {
  const personal = Object.keys(u).filter((k) => !KEEP_WITH_BALANCE.includes(k));
  if (!personal.length) return 0;
  for (const k of personal) delete u[k];
  u.state = u.lang ? 'menu' : 'new';
  if (u.packs) u.packs = u.packs.filter((p) => p.until > now);
  return 1;
}

// An account with no wallet balance keeps its record while it still holds something worth keeping.
export function hasValue(u, now) {
  return Boolean(u.vault) || (u.packs || []).some((p) => p.until > now) || (u.reminders || []).length > 0 || (u.devices || []).length > 0 || Boolean(u.locker) || Boolean(u.extras);
}

/**
 * Decides what the hourly cleanup does to one record.
 *  - An account WITH a wallet balance is never deleted for inactivity. After keepMs without a message its
 *    personal details are erased. After idleMs its session state is reset.
 *  - A linked-device pointer belongs to its main account. It goes when that account is gone (mainExists false).
 *  - An account with no balance is deleted after keepMs without a message if it holds something (idleMs if not).
 * Returns { op: 'none' | 'reset' | 'erase' | 'delete', n } where n is what the cleanup count should go up by.
 */
export function sweepOne(u, now, idleMs, keepMs, mainExists = true) {
  const idle = now - (u.updated || 0);
  if ((u.wallet?.paise || 0) > 0) {
    if (idle > keepMs) return eraseDetails(u, now) ? { op: 'erase', n: 1 } : { op: 'none', n: 0 };
    if (idle > idleMs && needsReset(u)) {
      resetSession(u);
      return { op: 'reset', n: 1 };
    }
    return { op: 'none', n: 0 };
  }
  if (u.linkTo) return mainExists ? { op: 'none', n: 0 } : { op: 'delete', n: 1 };
  if (idle > (hasValue(u, now) ? keepMs : idleMs)) return { op: 'delete', n: 1 };
  if (idle > idleMs && needsReset(u)) {
    resetSession(u);
    return { op: 'reset', n: 1 };
  }
  return { op: 'none', n: 0 };
}
