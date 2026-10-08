// One-time setup wizard. Writes .env with strong random secrets and asks only for what a person has to supply.
//   npm run setup
import readline from 'node:readline/promises';
import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const rand = (n = 32) => crypto.randomBytes(n).toString('base64url');
const old = {};
if (existsSync('.env')) {
  for (const l of readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) old[m[1]] = m[2];
  }
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (label, key, hint = '', secretKeep = false) => {
  const cur = old[key];
  const shown = cur ? (secretKeep ? ' [keep current]' : ` [${cur}]`) : '';
  const v = (await rl.question(`${label}${hint ? ' (' + hint + ')' : ''}${shown}: `)).trim();
  return v || cur || '';
};

console.log('\nSaathi setup. Press Enter to skip anything you do not have yet, you can run this again.\n');
console.log('Guide for every step below: SETUP.md\n');

const env = {};
// Secrets we can make ourselves. NEVER change VAULT_KEY later: saved profiles could not be opened any more.
env.VERIFY_TOKEN = old.VERIFY_TOKEN || rand(16);
env.HASH_SALT = old.HASH_SALT || rand(24);
env.VAULT_KEY = old.VAULT_KEY || rand(32);
env.ADMIN_KEY = old.ADMIN_KEY || rand(20);

env.PUBLIC_URL = await ask('Your public https address, e.g. https://saathi.onrender.com', 'PUBLIC_URL', 'after you deploy, can be blank now');
console.log('\n-- WhatsApp (Meta developers > your app > WhatsApp > API Setup) --');
env.WHATSAPP_TOKEN = await ask('Permanent access token', 'WHATSAPP_TOKEN', 'system user token', true);
env.WHATSAPP_PHONE_ID = await ask('Phone number ID', 'WHATSAPP_PHONE_ID');
env.APP_SECRET = await ask('App secret (App settings > Basic)', 'APP_SECRET', '', true);
console.log('\n-- AI: answers, reading documents, translation --');
env.OPENROUTER_API_KEY = await ask('OpenRouter API key (free models work, openrouter.ai/keys)', 'OPENROUTER_API_KEY', 'blank to use Anthropic instead', true);
env.OPENROUTER_MODEL = old.OPENROUTER_MODEL || 'stealth/space-bunny-alpha';
if (!env.OPENROUTER_API_KEY) env.ANTHROPIC_API_KEY = await ask('Anthropic API key', 'ANTHROPIC_API_KEY', 'console.anthropic.com', true);
console.log('\n-- Payments (Stripe dashboard > Developers > API keys) --');
env.STRIPE_SECRET_KEY = await ask('Stripe secret key (sk_test_... to start, sk_live_... for real money)', 'STRIPE_SECRET_KEY', '', true);
env.STRIPE_WEBHOOK_SECRET = await ask('Stripe webhook signing secret (whsec_..., shown after you add the webhook)', 'STRIPE_WEBHOOK_SECRET', '', true);
console.log('\n-- Voice notes (optional) --');
env.SARVAM_API_KEY = await ask('Sarvam API key', 'SARVAM_API_KEY', 'dashboard.sarvam.ai', true);
env.OPENAI_API_KEY = await ask('OpenAI key, used only if Sarvam fails', 'OPENAI_API_KEY', '', true);
console.log('\n-- Safety --');
env.DAILY_BUDGET_INR = await ask('Most the bot may spend per day, in rupees', 'DAILY_BUDGET_INR') || '300';
env.MONTHLY_BUDGET_INR = await ask('Most per month, in rupees', 'MONTHLY_BUDGET_INR') || '6000';
env.DOC_CHECK = (await ask('Read ID photos and PDFs with AI? Only say yes once /privacy is public', 'DOC_CHECK', 'yes/no')) .match(/^(1|y)/i) ? '1' : old.DOC_CHECK === '1' ? '1' : '0';
rl.close();

if (existsSync('.env')) copyFileSync('.env', '.env.backup');
const keep = ['DETAILS_FLOW_ID', 'REMINDER_TEMPLATE', 'LLM_MODEL', 'DATA_DIR'];
for (const k of keep) if (old[k]) env[k] = old[k];
writeFileSync('.env', Object.entries(env).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });

console.log('\nWrote .env (a copy of the old one is in .env.backup).');
console.log('\nKeep these somewhere safe, you need them in the next steps:');
console.log(`  Webhook verify token (paste into Meta):  ${env.VERIFY_TOKEN}`);
console.log(`  Admin key (opens your inbox):            ${env.ADMIN_KEY}`);
console.log('  VAULT_KEY is in .env. Back it up. If you lose it, saved profiles can never be opened again.');
console.log('\nNext:  npm run doctor');
