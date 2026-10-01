const IST_OFFSET_MS = 5.5 * 3600 * 1000;

export function istDay(ts = Date.now()) {
  return new Date(ts + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The thing that keeps this from burning money.
 *
 *  - AI calls stop at 70% of the daily/monthly budget (the scripted flow keeps working for free).
 *  - Outbound WhatsApp messages stop at 100% of the daily/monthly budget.
 *  - Each user has a daily cap on AI calls and on inbound messages.
 *
 * Worst-case monthly spend = monthlyBudgetInr (+ a few rupees of overshoot).
 */
export class CostGuard {
  constructor(store, cfg, clock = () => Date.now()) {
    this.store = store;
    this.cfg = cfg;
    this.clock = clock;
  }

  _today() {
    const key = istDay(this.clock());
    const days = this.store.ledger.days;
    if (!days[key]) {
      days[key] = { llmInr: 0, msgInr: 0, users: {} };
      // keep ~40 days
      const keys = Object.keys(days).sort();
      while (keys.length > 40) delete days[keys.shift()];
    }
    return days[key];
  }

  _user(userId) {
    const d = this._today();
    if (!d.users[userId]) d.users[userId] = { llm: 0, inbound: 0 };
    return d.users[userId];
  }

  todayInr() {
    const d = this._today();
    return d.llmInr + d.msgInr;
  }

  monthInr() {
    const prefix = istDay(this.clock()).slice(0, 7);
    let sum = 0;
    for (const [k, d] of Object.entries(this.store.ledger.days)) {
      if (k.startsWith(prefix)) sum += d.llmInr + d.msgInr;
    }
    return sum;
  }

  /** Count an inbound message; false means this user is over their daily cap. */
  allowInbound(userId) {
    const u = this._user(userId);
    u.inbound++;
    this.store.saveLedger();
    return u.inbound <= this.cfg.perUserDailyMsgs;
  }

  llmAllowed(userId) {
    const u = this._user(userId);
    return (
      u.llm < this.cfg.perUserDailyLlm &&
      this.todayInr() < this.cfg.dailyBudgetInr * 0.7 &&
      this.monthInr() < this.cfg.monthlyBudgetInr * 0.7
    );
  }

  msgAllowed() {
    return this.todayInr() < this.cfg.dailyBudgetInr && this.monthInr() < this.cfg.monthlyBudgetInr;
  }

  recordLlm(userId, usage = { in: 0, out: 0 }) {
    const usd = (usage.in * this.cfg.llmInUsdPerM + usage.out * this.cfg.llmOutUsdPerM) / 1e6;
    const inr = usd * this.cfg.usdInr;
    const d = this._today();
    d.llmInr += inr;
    this._user(userId).llm++;
    this.store.saveLedger();
    return inr;
  }

  /** Speech-to-text cost, counted against the same daily and monthly budget as AI answers. */
  recordStt(userId, seconds = 0) {
    const inr = (Math.max(0, seconds) / 3600) * (this.cfg.sttInrPerHour ?? 30);
    this._today().llmInr += inr;
    this._user(userId).llm++;
    this.store.saveLedger();
    return inr;
  }

  recordMsg() {
    this._today().msgInr += this.cfg.waMsgInr;
    this.store.saveLedger();
  }

  stats() {
    const d = this._today();
    return {
      day: istDay(this.clock()),
      todayInr: round(this.todayInr()),
      llmInr: round(d.llmInr),
      msgInr: round(d.msgInr),
      monthInr: round(this.monthInr()),
      dailyBudgetInr: this.cfg.dailyBudgetInr,
      monthlyBudgetInr: this.cfg.monthlyBudgetInr,
      activeUsersToday: Object.keys(d.users).length,
      llmEnabledNow: this.todayInr() < this.cfg.dailyBudgetInr * 0.7 && this.monthInr() < this.cfg.monthlyBudgetInr * 0.7,
      messagingEnabledNow: this.msgAllowed(),
    };
  }
}

const round = (n) => Math.round(n * 100) / 100;
