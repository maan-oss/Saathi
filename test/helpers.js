import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { CostGuard } from '../src/costguard.js';
import { createBot } from '../src/flow.js';
import { createVault } from '../src/vault.js';
import { plain } from '../src/rich.js';

const cfg = {
  dailyBudgetInr: 100,
  monthlyBudgetInr: 1000,
  perUserDailyLlm: 8,
  perUserDailyMsgs: 150,
  waMsgInr: 0.14,
  llmInUsdPerM: 1,
  llmOutUsdPerM: 5,
  usdInr: 90,
  docCheck: false,
};

const DOC = {
  type: 'aadhaar',
  readable: true,
  issues: [],
  fields: { name: 'ASHA DEVI', dob: '01/02/1990', father_name: 'Ram Lal', gender: 'female', address: '12 Gandhi Road, Jaipur, Rajasthan', pincode: '302001' },
  usage: { in: 1500, out: 100 },
};

export const DOCUMENT = DOC;

export function setup(overrides = {}, llmOverrides = {}, opts = {}) {
  const dir = mkdtempSync(join(process.cwd(), '.test-'));
  const store = new Store(dir);
  const config = { ...cfg, ...overrides };
  const guard = new CostGuard(store, config);
  const calls = { answer: 0, check: 0, systems: [] };
  const llm = {
    enabled: true,
    async answer(system, question) {
      calls.answer++;
      calls.systems.push(system + '\n' + question);
      return { text: 'AI answer', usage: { in: 800, out: 60 } };
    },
    async checkDocument() {
      calls.check++;
      return { ...DOC };
    },
    ...llmOverrides,
  };
  const links = [];
  const payments = opts.payments === false ? null : { async createLink(x) { links.push(x); return { url: `https://pay.test/${x.ref}`, id: 'plink_1' }; } };
  const bot = createBot({
    store,
    guard,
    llm,
    config,
    vault: createVault('test-key'),
    payments,
    stt: opts.stt ?? null,
    translator: opts.translator ?? null,
    downloadMedia: opts.downloadMedia ?? (async () => ({ buffer: Buffer.from('x'), mime: 'image/jpeg' })),
  });
  const run = async (input, user = 'u1', ctx = {}) => bot.handle(user, input, ctx);
  const say = async (text, user = 'u1') => (await run({ type: 'text', text }, user)).replies.map(plain).join('\n---\n');
  const tap = async (id, user = 'u1') => (await run({ type: 'reply', id, title: id }, user)).replies;
  const tapText = async (id, user = 'u1') => (await tap(id, user)).map(plain).join('\n---\n');
  const wallet = (user = 'u1') => store.getUser(user).wallet?.paise ?? 0;
  return { bot, store, guard, calls, links, run, say, tap, tapText, wallet, dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

