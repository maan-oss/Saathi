import { readFileSync, existsSync } from 'node:fs';

// Tiny .env loader (no dependencies).
if (existsSync('.env') && !process.env.NODE_TEST_CONTEXT) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = (/^["']/.test(m[2]) ? m[2] : m[2].replace(/\s+#.*$/, '')).replace(/^["']|["']$/g, '').trim();
  }
}

const num = (key, def) => {
  const v = process.env[key];
  return v === undefined || v === '' ? def : Number(v);
};
const flag = (key, def) => {
  const v = process.env[key];
  return v === undefined || v === '' ? def : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase());
};

export const config = {
  port: num('PORT', 3000),
  dataDir: process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/saathi-data' : './data'),

  // WhatsApp Cloud API
  whatsappToken: process.env.WHATSAPP_TOKEN || '',
  phoneId: process.env.WHATSAPP_PHONE_ID || '',
  verifyToken: process.env.VERIFY_TOKEN || 'change-me',
  appSecret: process.env.APP_SECRET || '', // set this in production: verifies webhook signatures
  hashSalt: process.env.HASH_SALT || 'dev-salt-change-me', // used to scramble phone numbers before storing state
  graphVersion: process.env.GRAPH_VERSION || 'v21.0',
  graphBase: process.env.GRAPH_BASE || 'https://graph.facebook.com', // overridden only in tests
  anthropicBase: process.env.ANTHROPIC_BASE || 'https://api.anthropic.com',
  stripeBase: process.env.STRIPE_BASE || 'https://api.stripe.com',

  // Encrypts saved profiles. Set a long random string in production.
  vaultKey: process.env.VAULT_KEY || 'dev-vault-key-change-me',

  // Stripe Checkout (optional: without it, top-ups are not offered)
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  // PAYMENTS_PAUSED=1 stops new top-ups and keeps the Stripe keys in place. Payments already made still reach the webhook.
  paymentsPaused: process.env.PAYMENTS_PAUSED === '1',

  // WhatsApp Flow id for the details form (optional: without it the bot asks one field at a time)
  detailsFlowId: process.env.DETAILS_FLOW_ID || '',

  // Voice notes: Sarvam is tried first (built for Indian languages); OpenAI is the fallback. Either key turns voice on.
  sarvamKey: process.env.SARVAM_API_KEY || '',
  sarvamModel: process.env.SARVAM_MODEL || 'saaras:v4',
  sarvamBase: process.env.SARVAM_BASE || 'https://api.sarvam.ai',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_STT_MODEL || 'whisper-1',
  openaiBase: process.env.OPENAI_BASE || 'https://api.openai.com',
  sttInrPerHour: num('STT_INR_PER_HOUR', 30), // Sarvam list price, used only for the spend counter

  // Approved WhatsApp template used for reminders sent after the 24-hour window has closed
  reminderTemplate: process.env.REMINDER_TEMPLATE || 'saathi_reminder',

  // LLM (only used for free-form questions and the optional photo check)
  // OpenRouter: one key, many models, including free ones. If set it is used instead of Anthropic.
  openrouterKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'stealth/space-bunny-alpha', // free, fast, reads images. Any slug from openrouter.ai/models works
  openrouterFallbacks: (process.env.OPENROUTER_FALLBACKS ?? 'openrouter/free').split(',').map((x) => x.trim()).filter(Boolean), // tried in order if the first is busy or gone (stealth models get retired)
  openrouterBase: process.env.OPENROUTER_BASE || 'https://openrouter.ai',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.LLM_MODEL || 'claude-haiku-4-5-20251001',
  llmInUsdPerM: num('LLM_IN_USD_PER_M', process.env.OPENROUTER_API_KEY ? 0 : 1), // free models cost nothing; set these if you pick a paid model
  llmOutUsdPerM: num('LLM_OUT_USD_PER_M', process.env.OPENROUTER_API_KEY ? 0 : 5),
  usdInr: num('USD_INR', 90),

  // Spend protection (all amounts in INR)
  dailyBudgetInr: num('DAILY_BUDGET_INR', 300),
  monthlyBudgetInr: num('MONTHLY_BUDGET_INR', 6000),
  perUserDailyLlm: num('PER_USER_DAILY_LLM_CALLS', 8),
  perUserDailyMsgs: num('PER_USER_DAILY_MSGS', 150),
  waMsgInr: num('WA_MSG_INR', 0.14), // Rs 0.115 + 18% GST, counted for every outbound message (conservative)

  // Features
  docCheck: flag('DOC_CHECK', false), // photo check is OFF until you have a privacy notice
  userIdleHours: num('USER_IDLE_HOURS', 24),
  accountKeepDays: num('ACCOUNT_KEEP_DAYS', 180), // saved profile / wallet kept this long after last message

  // Prices in paise (placeholders to test, not researched market prices)
  rates: {
    trialPaise: num('TRIAL_PAISE', 500),
    freeMsgsPerDay: num('FREE_MSGS_PER_DAY', 40),
    freeAiPerDay: num('FREE_AI_PER_DAY', 15),
    msgPaise: num('MSG_PAISE', 15),
    aiPaise: num('AI_PAISE', 50),
    scanPaise: num('SCAN_PAISE', 100),
    sheetPaise: num('SHEET_PAISE', 300),
    voicePaise: num('VOICE_PAISE', 50),
    remindPaise: num('REMIND_PAISE', 200),
    topups: [5000, 10000, 20000, 50000], // ₹50 is the floor (billing.js MIN_TOPUP_PAISE): the old ₹20 preset failed at Stripe in production
    packs: {
      pack_quick: { id: 'pack_quick', name: 'Quick pack', paise: num('QUICK_PACK_PAISE', 5000), days: 3, scans: 3, ai: 20, voice: 8, remind: 3 },
      pan_pack: { id: 'pan_pack', name: 'Saathi pack', paise: num('PAN_PACK_PAISE', 5000), days: 7, scans: 8, ai: 40, voice: 20, remind: 5 },
      pack_month: { id: 'pack_month', name: 'Saathi Plus', paise: num('PLUS_PACK_PAISE', 14900), days: 30, scans: 40, ai: 300, voice: 100, remind: 25 },
    },
  },
  adminKey: process.env.ADMIN_KEY || '',
  whatsappNumber: (process.env.WHATSAPP_NUMBER || '').replace(/\D/g, ''), // your public WhatsApp number with country code, for the web app's "Chat on WhatsApp" button
  trustProxy: flag('TRUST_PROXY', false), // true on Render/Fly: read the visitor's address from the proxy header
  webMsgsPerMin: num('WEB_MSGS_PER_MIN', 20), // per person
  webMsgsPerMinIp: num('WEB_MSGS_PER_MIN_IP', 120), // per network address (many people can share one)
  webUploadsPerMin: num('WEB_UPLOADS_PER_MIN', 10),
  webNewPerIpPerDay: num('WEB_NEW_PER_IP_PER_DAY', 20), // new people per address per day who get the welcome credit
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''), // your https address; only the doctor script uses it
};

config.flowsEnabled = Boolean(config.detailsFlowId);
config.dryRun = !config.whatsappToken || !config.phoneId;
