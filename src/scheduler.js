// Sends due reminders. Runs from the server every hour.
//
// WhatsApp only lets a business send free-form text inside 24 hours of the person's last message. Outside
// that window a pre-approved *template* is required. So:
//   inside the window  -> plain text in the person's language
//   outside the window -> the template (config.reminderTemplate, plus "_hi" for Hindi), 3 variables:
//                         {{1}} what, {{2}} when ("in 7 days", "today"), {{3}} the date
// A reminder is only marked as sent after WhatsApp accepted the message, so a failed send is tried again next hour.
//
// The phone number lives in the person's encrypted vault record (u.phoneSealed), put there when they set the
// first reminder. It is deleted with the account.

import { t } from './messages.js';
import { dueNotices, pruneReminders, fmtDue } from './reminders.js';

const WINDOW_MS = 23 * 3600 * 1000; // a safety margin inside WhatsApp's 24 hours

export function whenText(lang, days) {
  return days <= 0 ? t(lang, 'remind_when_0') : days === 1 ? t(lang, 'remind_when_1') : t(lang, 'remind_when_n', { n: days });
}

export function createScheduler({ store, vault, wa, guard, config, enqueue }) {
  // Applies `change` to the person's latest record and saves it. If another instance saved first (a conflict), reads
  // the record again and applies the change again, so no change is lost and nothing is sent twice.
  async function saveLatest(userId, change) {
    for (let attempt = 1; ; attempt++) {
      const fresh = await store.getUser(userId);
      if (!fresh || !change(fresh)) return false;
      try {
        await store.putUser(userId, fresh);
        return true;
      } catch (e) {
        if (e?.code !== 'conflict' || attempt >= 4) throw e;
      }
    }
  }

  async function remindOne(userId, now) {
    const stored = await store.getUser(userId);
    if (!stored?.reminders?.length) return 0;
    const work = structuredClone(stored);
    const notices = dueNotices(work, now);
    if (!notices.length) return 0;
    const phone = stored.phoneSealed ? (await vault.open(stored.phoneSealed))?.phone : null;
    if (!phone) return 0;
    const lang = stored.lang || 'en';
    const inWindow = now - (stored.lastInboundAt || 0) < WINDOW_MS;
    let sent = 0;
    const sentIds = new Set();
    for (const n of notices) {
      if (!(await guard.msgAllowed())) break;
      const when = whenText(lang, n.days);
      const date = fmtDue(n.due);
      let ok;
      if (inWindow) ok = (await wa.send(phone, t(lang, 'remind_msg', { label: n.label, when, date }))) > 0;
      else {
        const tplLang = lang === 'hi' ? 'hi' : 'en';
        const name = tplLang === 'hi' ? `${config.reminderTemplate}_hi` : config.reminderTemplate;
        ok = await wa.sendTemplate(phone, { name, lang: tplLang, params: [n.label, whenText(tplLang, n.days), date] });
      }
      if (ok) {
        await guard.recordMsg();
        sentIds.add(n.id);
        sent++;
      }
    }
    // Save only what really went out. The person may have chatted meanwhile, so the save works on their latest record.
    if (sentIds.size) {
      await saveLatest(userId, (fresh) => {
        if (!fresh.reminders) return false;
        for (const r of fresh.reminders) {
          const w = work.reminders.find((x) => x.id === r.id);
          if (w && sentIds.has(r.id)) r.sent = w.sent;
        }
        return true;
      });
    }
    return sent;
  }

  return {
    /** One pass over every user with reminders. Returns how many messages went out. */
    async run(now = Date.now()) {
      let total = 0;
      for (const [id, u] of await store.listUsersWithReminders()) {
        if (!u.reminders?.length) continue;
        await new Promise((resolve) => {
          enqueue(id, async () => {
            try {
              await saveLatest(id, (fresh) => pruneReminders(fresh, now));
              total += await remindOne(id, now);
            } finally {
              resolve();
            }
          });
        });
      }
      return total;
    },
  };
}
