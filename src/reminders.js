// Reminders for dates you can't afford to miss (licence and passport expiry, ITR, anything custom).
// Pure functions only: the flow creates reminders, the server's scheduler calls dueNotices() every hour.
//
// A reminder is { id, type, label, due: 'YYYY-MM-DD', sent: { 30, 7, 0 } }.
// Notices go out 30 days before, 7 days before and on the day. If a reminder is created with less time left,
// the ones already passed are marked sent so it never fires several at once.

export const MAX_REMINDERS = 5;
export const MILESTONES = [30, 7, 0];
const DAY = 86400000;
const IST = 5.5 * 3600 * 1000;

export const istDate = (ms = Date.now()) => new Date(ms + IST).toISOString().slice(0, 10);
const dayNumber = (ymd) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY);
export const daysUntil = (due, now = Date.now()) => dayNumber(due) - dayNumber(istDate(now));

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function ymd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || y < 1900) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** DD/MM/YYYY (also - . and space), YYYY-MM-DD, "5 Feb 2027". Returns 'YYYY-MM-DD' for today or a future date within 20 years, else null. */
export function parseFutureDate(input, now = Date.now()) {
  const s = String(input ?? '').trim();
  let out = null;
  let m = s.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/);
  if (m) out = ymd(+m[3], +m[2], +m[1]);
  if (!out && (m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) out = ymd(+m[1], +m[2], +m[3]);
  if (!out && (m = s.toLowerCase().match(/^(\d{1,2})\s*([a-z]{3})[a-z]*\.?,?\s*(\d{4})$/)) && MONTHS.includes(m[2])) out = ymd(+m[3], MONTHS.indexOf(m[2]) + 1, +m[1]);
  if (!out) return null;
  const d = daysUntil(out, now);
  return d >= 0 && d <= 366 * 20 ? out : null;
}

export function fmtDue(due) {
  const [y, m, d] = due.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
}

/** Build a reminder. Milestones that are already behind are marked sent. */
export function makeReminder({ id, type, label, due, note, repeat }, now = Date.now()) {
  const left = daysUntil(due, now);
  const sent = {};
  for (const m of MILESTONES) sent[m] = left < m;
  // Created within a milestone window but not past it (e.g. 20 days left): the 30-day notice is skipped too.
  const r = { id, type, label, due, sent, made: now };
  if (note) r.note = note;
  if (repeat === 'yearly') r.repeat = 'yearly';
  return r;
}

/** The same date one year on (29 Feb becomes 28 Feb in a common year). */
export function nextYear(due) {
  const [y, m, d] = due.split('-').map(Number);
  return ymd(y + 1, m, d) || ymd(y + 1, m, d - 1);
}

/** Move a yearly reminder to its next date, keeping id, label and note, with fresh notices. Rolls until the date is not in the past. */
export function rollReminder(r, now = Date.now()) {
  let due = r.due;
  do due = nextYear(due); while (daysUntil(due, now) < 0);
  return { ...makeReminder({ ...r, due }, now), made: r.made || now };
}

/** Roll yearly reminders whose date passed more than a week ago. Returns how many moved. */
export function rollYearly(u, now = Date.now()) {
  let n = 0;
  u.reminders = (u.reminders || []).map((r) => {
    if (r.repeat !== 'yearly' || daysUntil(r.due, now) >= -7) return r;
    n++;
    return rollReminder(r, now);
  });
  return n;
}

/**
 * What should be sent right now for this user. Returns [{ id, label, due, days, milestone }].
 * If several milestones are due (a bot that was off for a while) only the most urgent one is sent.
 * Mutates r.sent so the same notice is never sent twice; the caller saves the user afterwards.
 */
export function dueNotices(u, now = Date.now()) {
  const out = [];
  if ((u.reminders || []).some((r) => r.repeat === 'yearly')) rollYearly(u, now);
  for (const r of u.reminders || []) {
    const days = daysUntil(r.due, now);
    if (days < 0) continue;
    const due = MILESTONES.filter((m) => days <= m && !r.sent[m]);
    if (!due.length) continue;
    const milestone = Math.min(...due);
    for (const m of due) r.sent[m] = true;
    out.push({ id: r.id, label: r.label, due: r.due, days, milestone });
  }
  return out;
}

/** Drop reminders whose date passed more than a week ago; yearly ones move to next year instead. Returns how many changed. */
export function pruneReminders(u, now = Date.now()) {
  const before = (u.reminders || []).length;
  if (!before) return 0;
  const rolled = rollYearly(u, now);
  u.reminders = u.reminders.filter((r) => daysUntil(r.due, now) >= -7);
  if (!u.reminders.length) delete u.reminders;
  return before - (u.reminders || []).length + rolled;
}
