# Saathi: help with Indian government paperwork

Saathi guides people through PAN, Aadhaar, driving licence, passport, voter ID, GST and certificates, step by step, in their language. It works on WhatsApp and in a web app. It does not log in to government portals for anyone, never asks for an OTP, and always shows the price before a charge.

To put it online, read **[SETUP.md](SETUP.md)**.

## What the code keeps

- It never logs in, solves a captcha or submits a form on a government site. The person does the final steps.
- It never asks for an OTP, PIN or password. The scam checker flags them if someone pastes them in.
- Every charge shows its price first.
- Spend caps stop AI and message costs (below).

## Run it locally

Needs Node 20 or newer. There are no dependencies to install.

```
npm test            # the test suite
npm run simulate    # chat with the bot in the terminal
```

## Files

- `src/flow.js`: the conversation. `src/services.js`: the paperwork data (edit here to add or fix a service).
- `src/messages.js`: English and Hindi texts. `src/ui/*.json`: other languages. `src/ui-hi.js`: Hindi web app strings.
- `src/payments.js`: Stripe Checkout and its webhook. `src/billing.js`: wallet and packs.
- `src/server.js`: routes and webhooks. `src/store.js`: JSON storage in `DATA_DIR`. `src/vault.js`: encryption of saved details.
- `src/costguard.js`: spend caps. `src/scamcheck.js`: the scam shield. `src/tools.js`, `src/link.js`: web tool pages and device linking.
- `src/livefacts.js`, `src/factsextra.js`: fees and deadlines checked against official pages.
- `web/`: the landing page (`site.*`, `sky.js`, served at `/`) and the web app (`index.html`, served at `/app`).
- `api/index.js`: Vercel entry point (preview only, see SETUP.md). `render.yaml`, `Dockerfile`, `.dockerignore`: the Render deployment.
- `flows/details.flow.json`: the WhatsApp Flow for the details form, uploaded to Meta.
- `assets/saathi-profile.png`: the WhatsApp profile photo.
- `scripts/`: setup, doctor, simulate, translate. `test/`: the tests.

## Money

- A wallet holds rupee balances (kept in paise). People top up through Stripe Checkout in INR. The webhook credits the wallet once per payment, even if Stripe retries it.
- Packs are paid from the wallet. If the balance is short, the person pays the difference and the pack starts by itself.

## Spend caps (defaults)

| Protection | Default |
|---|---|
| AI cutoff | 70% of the daily or monthly budget. AI answers stop; the scripted guide keeps working. |
| Hard stop | 100% of the daily or monthly budget. The bot stops sending. |
| Daily budget | ₹300 (`DAILY_BUDGET_INR`) |
| Monthly budget | ₹6,000 (`MONTHLY_BUDGET_INR`) |
| Per person | 8 AI calls and 150 messages a day |

`test/costguard.test.js` checks that the caps hold.

## Not verified yet

- Nothing has run against live Meta, Stripe, OpenRouter or Sarvam accounts. Expect small fixes on first contact.
- Machine translations need a native speaker before you rely on them. The two payment lines that mentioned UPI were removed from the translations, so they show in English until `npm run translate` runs with a key.
- Fees, deadlines and document lists are checked at a point in time. Re-check them when a portal changes.
- Legal review is needed before real users: the wallet (RBI rules on prepaid instruments) and the DPDP Act notice and consent.
