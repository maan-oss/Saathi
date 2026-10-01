# Setup: from zero to a working WhatsApp number

Plan on about an hour of clicking, plus waiting for Meta's approvals. Do it in this order. Screens change; if a button has moved, search the name in quotes.

**What you need:** a phone number that is not already on WhatsApp (a new SIM is fine), a credit or debit card, and for real payments a bank account and PAN for Razorpay.

Once the server is running, open `https://YOUR-ADDRESS/admin/setup?key=YOUR_ADMIN_KEY`: the setup console shows what is connected, the exact values to paste into Meta and Razorpay (with copy buttons), the template text, and a button to send yourself a test message.

The same address, `https://YOUR-ADDRESS/`, is the **web app**: people without WhatsApp open it in any browser and can install it to their home screen. Same guide, same wallet rules, same scam protection. Set `WHATSAPP_NUMBER` to add a "Chat on WhatsApp" button, and `TRUST_PROXY=1` on Render or Fly.

Run `npm run setup` first. It makes your secret keys and writes `.env`. Run `npm run doctor` after each step: it tells you what is still missing.

## 1. Try it for free, no accounts (2 minutes)

`npm test` then `npm run simulate`. Or open the visual simulator. Nothing here costs anything.

## 2. Put the server on the internet (10 minutes)

WhatsApp can only talk to a public https address. Pick one:

- **Render (easiest):** put this folder on GitHub (private repo), Render > New > Blueprint > pick the repo. `render.yaml` sets everything up. Paste your secrets when asked. Your address is `https://saathi.onrender.com` (yours will differ).
- **Fly.io:** the commands are at the top of `fly.toml`.

It needs a small always-on server with a disk (about ₹600 to ₹1,000 a month). A free tier that sleeps will miss reminders and lose saved data.

Put your address in `.env` as `PUBLIC_URL=...`, then `npm run doctor`: it should show "Server is up" and "Webhook handshake works".

## 3. WhatsApp (Meta) (30 minutes, plus approval waits)

1. developers.facebook.com > **My Apps > Create App** > type **Business** > add the **WhatsApp** product.
2. **WhatsApp > API Setup** gives you a free **test number** and a 24-hour token. You can already message yourself with it. Copy the **Phone number ID**.
3. **Webhook:** WhatsApp > Configuration > Edit. Callback URL `https://YOUR-ADDRESS/webhook`, Verify token = the `VERIFY_TOKEN` from your `.env`. Then **subscribe to the `messages` field**.
4. **App secret:** App settings > Basic > Show. Put it in `.env` as `APP_SECRET`.
5. **Permanent token:** business.facebook.com > Settings > Users > **System users** > add one (Admin) > **Assign assets** (your app, full control) > **Generate token** with `whatsapp_business_messaging` and `whatsapp_business_management`, never expires. Put it in `.env` as `WHATSAPP_TOKEN`. The 24-hour token stops working the next day.
6. **Your real number:** WhatsApp > API Setup > **Add phone number**. This needs **Business verification** (Settings > Security Center). It takes a few days and needs your business documents.
7. **Business profile:** name "Saathi", a logo, category, and in the description "Independent helper. Not affiliated with the Government of India." Paste your `/privacy` link.
8. **Reminder templates** (WhatsApp Manager > Message templates > Create). Category **Utility**. Create both:

   - Name `saathi_reminder`, language English:
     `Reminder from Saathi: your {{1}} is due {{2}} ({{3}}). Reply MENU anytime for help.`
     Sample values: `driving licence`, `in 7 days`, `12 Nov 2026`
   - Name `saathi_reminder_hi`, language Hindi:
     `साथी की ओर से याद दिलाना: आपका {{1}} {{2}} है ({{3}})। मदद के लिए कभी भी MENU लिखें।`
     Sample values: `ड्राइविंग लाइसेंस`, `7 दिन बाद`, `12 Nov 2026`

   Until they are approved, reminders reach only people who messaged in the last 23 hours.
9. Optional: **WhatsApp Flows** for the details form. Set `DETAILS_FLOW_ID`. Skipping it is fine.

Test with the test number first. Send "hi" from your own phone.

**What Meta charges:** replies inside 24 hours, and the reminder templates, are the costs the spend counter tracks. Check Meta's current India price list; it changes.

## 4. AI (5 minutes)

Easiest and free: openrouter.ai > Keys > create one > `OPENROUTER_API_KEY`. The bot then uses `stealth/space-bunny-alpha` (free, fast, reads images), and falls back to `openrouter/free` if it is busy or retired. Change `OPENROUTER_MODEL` / `OPENROUTER_FALLBACKS` any time; slugs are on openrouter.ai/models.

**Privacy warning:** free and stealth models may keep and learn from what they are sent. The bot never sends saved details to the AI, but a photographed ID would go there. That is why `DOC_CHECK` stays off by default; turn it on only with a model whose data policy you accept. Free models are shared, so they are sometimes slow or busy (the bot retries once, then says to try again), the quality of the answers varies, and 

Prefer paid Claude: console.anthropic.com > API keys > `ANTHROPIC_API_KEY` (used only when no OpenRouter key is set). If you pick a paid OpenRouter model, set `LLM_IN_USD_PER_M` and `LLM_OUT_USD_PER_M` so the spend caps count it. The caps (`DAILY_BUDGET_INR`, `MONTHLY_BUDGET_INR`) stop AI use long before real money goes.

## 5. Payments (Razorpay) (10 minutes, KYC takes days)

1. razorpay.com > sign up > start in **Test mode** (no KYC needed, no real money).
2. Settings > **API keys** > generate. Put `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`. Test keys start `rzp_test_`, live keys `rzp_live_`.
3. Make sure **Payment Links** is on for your account.
4. Settings > **Webhooks** > add: URL `https://YOUR-ADDRESS/razorpay`, secret = any long random string (also put it in `.env` as `RAZORPAY_WEBHOOK_SECRET`), event **`payment_link.paid`** only.
5. Test: in WhatsApp type `wallet` > Top up > pay with Razorpay's test card 4111 1111 1111 1111 (any future date, any CVV). The balance should rise within seconds.
6. Complete KYC for live mode, swap in the `rzp_live_` keys.

**Read before taking real money:** a top-up balance that people can spend later is a prepaid wallet, and Indian rules on prepaid instruments (RBI) may apply. Get advice before you launch it. The safe way to start is to sell only fixed packs and keep the balance small.

## 6. Voice notes (optional, 3 minutes)

dashboard.sarvam.ai > API key > `SARVAM_API_KEY`. Or an OpenAI key as fallback.

## 7. Go live checklist

- `npm run doctor` shows no FIX lines.
- Message the number from a second phone: pick a language, open a service, send a photo, send a voice note, top up, set a reminder.
- Open `https://YOUR-ADDRESS/` on a phone, chat, attach a photo, and install it to the home screen.
- Open `https://YOUR-ADDRESS/admin/inbox?key=YOUR_ADMIN_KEY` and answer a test "agent" request.
- Turn on `DOC_CHECK=1` only after `/privacy` is public and linked in your WhatsApp profile.
- Back up `VAULT_KEY` and the `/data` disk. Lose the key and saved profiles cannot be opened.
- Have a lawyer glance at the privacy notice and the wallet.

## Everyday running

- Spend so far: `/admin/stats?key=ADMIN_KEY`. People waiting for a human: the inbox page.
- Reminders run by themselves every hour.
- To fix a translation, edit `data/translations.json` and add `"reviewed": true`.
