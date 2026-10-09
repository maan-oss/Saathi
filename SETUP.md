# Setup: from zero to a working Saathi

Read this once from top to bottom. Each step says who does it. **You** do the accounts, ID checks, money and keys. The code is already finished.

**Never paste a secret key into chat or into a file in the repo.** Paste it into the host's environment variables (step 2) and nowhere else.

## 0. What you need

- This folder pushed to a **private** GitHub repo.
- A phone number that is not on WhatsApp (a new SIM is fine), a card, and your ID.
- For payments: an Australian bank account and an **ABN**. Stripe asks for an ABN on Australian accounts; sole traders can get one free at abr.gov.au. Confirm on Stripe's sign-up form.

## 1. Check the code (2 minutes, free)

```
npm test           # the test suite, all against fakes
npm run simulate   # chat with the bot in the terminal
```

Needs Node 20 or newer. There are no dependencies to install.

## 2. Host it on Render (about 15 minutes)

Use **Render**, not Vercel. The bot keeps saved details and wallet balances on a disk. Vercel has no disk that survives a restart, so anything saved there is lost. Vercel is fine for previews only.

1. Render > **New > Blueprint**, pick the repo. Render reads `render.yaml`: a Docker build, a 1 GB disk at `/data`, a health check on `/health`.
2. Render asks for the secrets in the table below. Paste them there.
3. After the first deploy, copy the service address (for example `https://saathi-xxxx.onrender.com`) into `PUBLIC_URL`. Stripe uses it to send people back after a payment.
4. Open `https://YOUR-URL/health`. It should say `ok`.

| Variable | What it is | Where it comes from |
|---|---|---|
| `PUBLIC_URL` | Your service address, `https://…` | Render shows it |
| `VERIFY_TOKEN` | Any long random string | Make one up |
| `APP_SECRET` | Meta app secret | Meta > App settings > Basic |
| `HASH_SALT`, `VAULT_KEY`, `ADMIN_KEY` | Long random strings | Make them up, e.g. `openssl rand -hex 32`. Never change `HASH_SALT`. Back up `VAULT_KEY`. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | WhatsApp access | Step 3 |
| `WHATSAPP_NUMBER` | Your number, digits with country code | Your number, e.g. `919876543210` |
| `OPENROUTER_API_KEY` | Free AI answers | openrouter.ai/keys (step 4) |
| `ANTHROPIC_API_KEY` | Optional paid AI | console.anthropic.com |
| `STRIPE_SECRET_KEY` | Stripe secret key | Step 5 |
| `STRIPE_WEBHOOK_SECRET` | Stripe signing secret | Step 5 |
| `SARVAM_API_KEY`, `OPENAI_API_KEY` | Voice notes (optional) | dashboard.sarvam.ai, platform.openai.com |
| `DETAILS_FLOW_ID` | WhatsApp Flow id (optional) | Step 3 |

Keep `DOC_CHECK=0` until your privacy page is live (step 7).

## 3. WhatsApp (Meta) (about 30 minutes, plus approval waits)

1. developers.facebook.com > **My Apps > Create App** > type **Business** > add the **WhatsApp** product.
2. **WhatsApp > API Setup** gives you a free test number. Copy its **Phone number ID** into `WHATSAPP_PHONE_ID`.
3. **WhatsApp > Configuration > Edit**: Callback URL `https://YOUR-URL/webhook`, Verify token = your `VERIFY_TOKEN`. Then subscribe to the **messages** field.
4. **App settings > Basic**: copy the **App secret** into `APP_SECRET`.
5. **Permanent token:** business.facebook.com > Settings > **System users** > add one (Admin) > **Assign assets** (your app, full control) > **Generate token** with `whatsapp_business_messaging` and `whatsapp_business_management`, no expiry. Put it in `WHATSAPP_TOKEN`. The 24-hour token on API Setup stops working the next day.
6. Test first: message the test number "hi" from your own phone.
7. **Your real number:** WhatsApp > API Setup > **Add phone number**. This needs **Business verification** (Settings > Security Center), which takes days.
8. **Reminder templates** (WhatsApp Manager > Message templates, category **Utility**). Create both:
   - `saathi_reminder`, English: `Reminder from Saathi: your {{1}} is due {{2}} ({{3}}). Reply MENU anytime for help.` Samples: `driving licence`, `in 7 days`, `12 Nov 2026`
   - `saathi_reminder_hi`, Hindi: `साथी की ओर से याद दिलाना: आपका {{1}} {{2}} है ({{3}})। मदद के लिए कभी भी MENU लिखें।` Samples: `ड्राइविंग लाइसेंस`, `7 दिन बाद`, `12 Nov 2026`
   - Until they are approved, reminders reach only people who messaged in the last 23 hours.
9. **Optional details form:** create a WhatsApp Flow and upload `flows/details.flow.json` to it. Put the Flow's id in `DETAILS_FLOW_ID`. Without it, the bot asks one question at a time.
10. **Profile:** name "Saathi", photo `assets/saathi-profile.png`, description "Independent helper. Not affiliated with the Government of India.", and the link to `/privacy`.

## 4. AI (free, 5 minutes)

openrouter.ai > **Keys** > create one > `OPENROUTER_API_KEY`. The bot uses `stealth/space-bunny-alpha` and falls back to `openrouter/free`. Free models may keep what they are sent, so the bot never sends saved details to the AI, and photo ID checks stay off (`DOC_CHECK=0`).

Paid Claude is optional: `ANTHROPIC_API_KEY`, used only when no OpenRouter key is set.

## 5. Payments (Stripe) (about an hour; ID checks take days)

The wallet is in rupees. Stripe charges buyers in **INR** through its hosted checkout page, and pays out to your Australian bank in AUD.

Stripe's published Australian rates (check them before you rely on them): cards from Australia 1.65% + A$0.30; international cards 3.5% + A$0.30; plus 2% when a currency conversion is needed. Stripe is a payment processor, not a merchant of record: GST and tax are your responsibility.

1. **stripe.com/au > Create account.** It starts in **test mode**. Stay there until the test in step 5 works.
2. **Developers > API keys:** copy the **Secret key** (`sk_test_…`) into Render as `STRIPE_SECRET_KEY`.
3. **Developers > Webhooks > Add endpoint:** URL `https://YOUR-URL/stripe`. Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy the **Signing secret** (`whsec_…`) into Render as `STRIPE_WEBHOOK_SECRET`.
4. Render restarts with the new values. Open `https://YOUR-URL/admin/setup?key=YOUR_ADMIN_KEY`. The Payments line should say "Stripe key works (TEST mode)".
5. **Test:** in the web app, open Wallet > Top up, pay with the test card `4242 4242 4242 4242`, any future date, any CVC. The balance should rise within seconds. If it does not, open the endpoint in Stripe's dashboard and read the failed deliveries. If Stripe refuses the INR charge, tell the developer, because the price setup needs a change.
6. **Go live:** finish Stripe's identity and bank checks. Put the live secret key (`sk_live_…`) in `STRIPE_SECRET_KEY`. Add the same endpoint in live mode and put its new signing secret in `STRIPE_WEBHOOK_SECRET`.
   The live catalog is already in the Saathi account: "Saathi wallet top-up" (₹50, ₹100, ₹200, ₹500), "Saathi Quick pack" (₹29), "Saathi pack" (₹49) and "Saathi Plus" (₹149). Their price IDs are in `LIVE_PRICES` in `src/payments.js`. A live key charges those prices; a test key charges the same amounts inline. If you change a price in Stripe, change it in that file too.

Know the limits before launch:
- Buyers pay by card. As far as I know, UPI is not offered through Stripe to an Australian account. Check Stripe's current list.
- A top-up balance people can spend later is a **prepaid wallet**, and Indian rules on prepaid instruments (RBI) may apply. Get advice before taking real money. The safe start is fixed packs with small balances.
- Stripe does not send a share of takings to ad accounts. Moving money into ads is a manual step for now.

## 6. Voice notes (optional, 3 minutes)

`SARVAM_API_KEY` from dashboard.sarvam.ai, or `OPENAI_API_KEY` as the fallback.

## 7. Go-live checklist

- The admin setup page shows no FIX lines. Run `npm run doctor` locally as well.
- Message the number from a second phone: pick a language, open a service, send a photo, send a voice note, top up with the test card, set a reminder.
- Open `https://YOUR-URL/` on a phone and add it to the home screen.
- Open `https://YOUR-URL/admin/inbox?key=YOUR_ADMIN_KEY` and answer a test "agent" request.
- Set `DOC_CHECK=1` only after `/privacy` is public and linked from your WhatsApp profile.
- Back up `VAULT_KEY` and the Render disk. Lose `VAULT_KEY` and saved profiles cannot be opened.
- Have a lawyer read the privacy notice (India's DPDP Act) and the wallet setup.

## Local commands

| Command | What it does |
|---|---|
| `npm test` | Runs the test suite |
| `npm run simulate` | Chat with the bot in the terminal |
| `npm run doctor` | Checks each connection using your `.env` |
| `npm run setup` | Writes `.env` with generated secrets and asks for keys. Local only. Never commit `.env`. |
| `npm run translate` | Pre-generates the machine-translated languages (needs an AI key) |

## Ongoing

- Spend so far: `/admin/stats?key=ADMIN_KEY`. People waiting for a human: `/admin/inbox?key=ADMIN_KEY`.
- Reminders run inside the server every hour.
- To fix a translation, edit `data/translations.json` and add `"reviewed": true`. It will not be overwritten.
