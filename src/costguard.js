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
 * The totals and per-person counts live in the store, so every instance sees the same numbers. Each change is one
 * atomic write (see supastore.js). Worst-case monthly spend = monthlyBudgetInr (+ a few rupees of overshoot).
 */
export class CostGuard {
  constructor(store, cfg, clock = () => Date.now()) {
    this.store = store;
    this.cfg = cfg;
    this.clock = clock;
  }

  _day() {
    return istDay(this.clock());
  }

  async todayInr() {
    return (await this.store.spendSnapshot(this._day())).todayInr;
  }

  async monthInr() {
    return (await this.store.spendSnapshot(this._day())).monthInr;
  }

  /** Count an inbound message; false means this user is over their daily cap. */
  async allowInbound(userId) {
    const me = await this.store.bumpUserDay(this._day(), userId, 0, 1);
    return me.inbound <= this.cfg.perUserDailyMsgs;
  }

  async llmAllowed(userId) {
    const day = this._day();
    const [me, s] = await Promise.all([this.store.bumpUserDay(day, userId, 0, 0), this.store.spendSnapshot(day)]);
    return me.llm < this.cfg.perUserDailyLlm && s.todayInr < this.cfg.dailyBudgetInr * 0.7 && s.monthInr < this.cfg.monthlyBudgetInr * 0.7;
  }

  async msgAllowed() {
    const s = await this.store.spendSnapshot(this._day());
    return s.todayInr < this.cfg.dailyBudgetInr && s.monthInr < this.cfg.monthlyBudgetInr;
  }

  async recordLlm(userId, usage = { in: 0, out: 0 }) {
    const usd = (usage.in * this.cfg.llmInUsdPerM + usage.out * this.cfg.llmOutUsdPerM) / 1e6;
    const inr = usd * this.cfg.usdInr;
    const day = this._day();
    await Promise.all([this.store.spendAdd(day, inr, 0), this.store.bumpUserDay(day, userId, 1, 0)]);
    return inr;
  }

  /** Speech-to-text cost, counted against the same daily and monthly budget as AI answers. */
  async recordStt(userId, seconds = 0) {
    const inr = (Math.max(0, seconds) / 3600) * (this.cfg.sttInrPerHour ?? 30);
    const day = this._day();
    await Promise.all([this.store.spendAdd(day, inr, 0), this.store.bumpUserDay(day, userId, 1, 0)]);
    return inr;
  }

  async recordMsg() {
    await this.store.spendAdd(this._day(), 0, this.cfg.waMsgInr);
  }

  async stats() {
    const day = this._day();
    const s = await this.store.spendSnapshot(day);
    return {
      day,
      todayInr: round(s.todayInr),
      llmInr: round(s.llmInr),
      msgInr: round(s.msgInr),
      monthInr: round(s.monthInr),
      dailyBudgetInr: this.cfg.dailyBudgetInr,
      monthlyBudgetInr: this.cfg.monthlyBudgetInr,
      activeUsersToday: s.activeUsers,
      llmEnabledNow: s.todayInr < this.cfg.dailyBudgetInr * 0.7 && s.monthInr < this.cfg.monthlyBudgetInr * 0.7,
      messagingEnabledNow: s.todayInr < this.cfg.dailyBudgetInr && s.monthInr < this.cfg.monthlyBudgetInr,
    };
  }
}

const round = (n) => Math.round(n * 100) / 100;
