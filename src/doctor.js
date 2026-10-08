// Checks every connection and tells you exactly what is missing. Used by `npm run doctor` and the setup console.
// It only reads; it sends nothing to real users.
import { config } from './config.js';

const ok = (t, d = '') => ({ s: 'OK ', t, d });
const bad = (t, d) => ({ s: 'FIX', t, d });
const skip = (t, d) => ({ s: '-- ', t, d });
const short = async (r) => (await r.text()).slice(0, 140).replace(/\s+/g, ' ');

export async function diagnose(cfg = config, f = fetch) {
  const out = [];
  const weak = (v, d) => !v || String(v).startsWith('change-me') || String(v).startsWith('dev-') || v === d;

  // Secrets
  out.push(weak(cfg.vaultKey, 'dev-vault-key-change-me') ? bad('VAULT_KEY', 'still the default. Run npm run setup.') : ok('VAULT_KEY set'));
  out.push(weak(cfg.hashSalt, 'dev-salt-change-me') ? bad('HASH_SALT', 'still the default. Run npm run setup.') : ok('HASH_SALT set'));
  out.push(cfg.adminKey ? ok('ADMIN_KEY set') : bad('ADMIN_KEY', 'empty, so you cannot open the inbox. Run npm run setup.'));
  out.push(weak(cfg.verifyToken, 'change-me') ? bad('VERIFY_TOKEN', 'still the default.') : ok('VERIFY_TOKEN set'));

  // WhatsApp
  if (!cfg.whatsappToken || !cfg.phoneId) out.push(bad('WhatsApp', 'token or phone id missing. The bot runs in dry-run mode: nothing reaches WhatsApp.'));
  else {
    try {
      const r = await f(`${cfg.graphBase}/${cfg.graphVersion}/${cfg.phoneId}?fields=display_phone_number,verified_name,quality_rating`, { headers: { authorization: `Bearer ${cfg.whatsappToken}` } });
      if (r.ok) {
        const j = await r.json();
        out.push(ok('WhatsApp token works', `${j.display_phone_number || ''} ${j.verified_name || ''} quality: ${j.quality_rating || 'n/a'}`.trim()));
      } else out.push(bad('WhatsApp token', `Meta said ${r.status}: ${await short(r)}. Use a permanent system-user token, not the 24-hour one.`));
    } catch (e) {
      out.push(bad('WhatsApp', 'could not reach Meta: ' + e.message));
    }
  }
  out.push(cfg.appSecret ? ok('APP_SECRET set (webhook signatures are checked)') : bad('APP_SECRET', 'empty: anyone could post fake messages to your webhook. Meta app > Settings > Basic > App secret.'));

  // AI: OpenRouter (free models) or Anthropic
  if (cfg.openrouterKey) {
    try {
      const r = await f(`${cfg.openrouterBase || 'https://openrouter.ai'}/api/v1/auth/key`, { headers: { authorization: `Bearer ${cfg.openrouterKey}` } });
      out.push(r.ok ? ok('OpenRouter key works', [cfg.openrouterModel, ...(cfg.openrouterFallbacks || [])].filter(Boolean).join(' → ')) : bad('OpenRouter key', `${r.status}: ${await short(r)}`));
    } catch (e) {
      out.push(bad('OpenRouter', 'could not reach it: ' + e.message));
    }
  } else if (!cfg.anthropicKey) out.push(skip('AI', 'no OPENROUTER_API_KEY or ANTHROPIC_API_KEY: the guide works, but no free-form answers, no document reading, no extra languages.'));
  else {
    try {
      const r = await f(`${cfg.anthropicBase}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
      });
      out.push(r.ok ? ok('Anthropic key works', cfg.model) : bad('Anthropic key', `${r.status}: ${await short(r)}`));
    } catch (e) {
      out.push(bad('Anthropic', 'could not reach it: ' + e.message));
    }
  }

  if (cfg.openrouterKey && cfg.docCheck) out.push(bad('Document reading on a free model', 'free and stealth models on OpenRouter may keep and learn from what you send. Do not read ID photos with them: set DOC_CHECK=0 or pick a paid model whose data policy you accept.'));

  // Stripe
  if (!cfg.stripeSecretKey) out.push(skip('Payments', 'no Stripe secret key: top-ups are not offered, people use the free daily messages and welcome credit only.'));
  else {
    try {
      const r = await f(`${cfg.stripeBase}/v1/balance`, { headers: { authorization: `Bearer ${cfg.stripeSecretKey}` } });
      const mode = cfg.stripeSecretKey.startsWith('sk_test_') ? ' (TEST mode: no real money)' : cfg.stripeSecretKey.startsWith('sk_live_') ? ' (LIVE)' : '';
      out.push(r.ok ? ok('Stripe key works' + mode) : bad('Stripe key', `${r.status}: ${await short(r)}. Use the secret key (sk_test_... or sk_live_...) from the Stripe dashboard.`));
    } catch (e) {
      out.push(bad('Stripe', 'could not reach it: ' + e.message));
    }
    out.push(cfg.stripeWebhookSecret ? ok('STRIPE_WEBHOOK_SECRET set') : bad('STRIPE_WEBHOOK_SECRET', 'empty: paid top-ups would be rejected and nobody gets credited.'));
    if (!cfg.publicUrl) out.push(bad('Stripe return address', 'PUBLIC_URL is not set, so Stripe cannot send people back to Saathi.'));
  }

  // Voice
  out.push(cfg.sarvamKey || cfg.openaiKey ? ok('Voice notes on', [cfg.sarvamKey && 'Sarvam', cfg.openaiKey && 'OpenAI'].filter(Boolean).join(' + ')) : skip('Voice notes', 'no SARVAM_API_KEY or OPENAI_API_KEY: voice notes get a polite "please type".'));

  // The public address
  if (!cfg.publicUrl) out.push(skip('PUBLIC_URL', 'not set, so the webhook was not checked.'));
  else {
    try {
      const h = await f(`${cfg.publicUrl}/health`);
      out.push(h.ok ? ok('Server is up at ' + cfg.publicUrl) : bad('Server', `${cfg.publicUrl}/health answered ${h.status}`));
      const v = await f(`${cfg.publicUrl}/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(cfg.verifyToken)}&hub.challenge=doctor123`);
      out.push(v.ok && (await v.text()) === 'doctor123' ? ok('Webhook handshake works (Meta can verify it)') : bad('Webhook handshake', 'the deployed server has a different VERIFY_TOKEN than your .env.'));
      const p = await f(`${cfg.publicUrl}/privacy`);
      out.push(p.ok ? ok(`Privacy notice is public: ${cfg.publicUrl}/privacy`, 'paste this link into your WhatsApp business profile') : bad('Privacy notice', 'not reachable'));
    } catch (e) {
      out.push(bad('Server', `cannot reach ${cfg.publicUrl}: ${e.message}`));
    }
  }

  out.push(cfg.detailsFlowId ? ok('Details form (WhatsApp Flow) set') : skip('Details form', 'no DETAILS_FLOW_ID: the bot asks one question at a time instead. That is fine.'));
  out.push(cfg.docCheck ? ok('Document reading ON') : skip('Document reading', 'off (DOC_CHECK=0) until your privacy notice is public.'));
  return out;
}

