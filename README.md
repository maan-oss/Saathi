# Saathi: WhatsApp helper for Indian government paperwork

Saathi lives inside WhatsApp: no app, no website. A person chats, taps buttons and lists, sends a photo, PDF or voice note, and gets guided step by step. It also keeps their details encrypted so they never type them twice. It **guides and prepares. It does not log in to government portals for anyone**: OTP and captcha always stay with the person.

## What it does

- **9 kinds of paperwork** (data in `src/services.js`): new PAN, PAN correction / reprint, driving licence, Aadhaar update, voter ID, passport, GST registration, income certificate, caste certificate. Each asks 1 to 3 quick questions, picks the right route, and walks through the steps. State-specific portals are looked up from the person's state.
- **Reads documents:** photo or PDF, only after consent. It pulls out name, date of birth, address, ID number and expiry. Nothing is kept unless the person taps Save; the photo itself is never kept.
- **Locker** (`src/locker.js`): encrypted PAN, Aadhaar, licence, passport, voter ID and GSTIN numbers with expiry dates. Hidden behind an Unlock tap (30-second auto-hide on the web). "What's my PAN?" and "when does my licence expire?" are answered from the saved value, not by the AI. Numbers are checked (PAN pattern, Aadhaar checksum, and so on) before saving. Legal note: holding ID numbers brings India's DPDP Act duties (consent, purpose, deletion, breach notice); get advice before launch.
- **Voice notes** (Hindi, English and other Indian languages) are turned into text and treated like typed messages. Sarvam first, OpenAI as fallback.
- **Remembers you:** an encrypted profile (AES-256-GCM). One tap to erase (`forget`, `delete`).
- **Prepared sheet:** the exact details each form asks for, ready to copy, per service.
- **Reminders:** licence renewal, passport expiry, ITR, or anything custom. Messages at 30 days, 7 days and on the day. After WhatsApp's 24-hour window it uses an approved template.
- **11 languages:** English and Hindi are hand-written. Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi and Odia are machine-translated once, checked automatically, and cached.
- **Wallet, per-message pricing and packs:** the price is always shown before a charge. One preselected pack ("Saathi pack": scans, AI answers, voice notes, reminders).
- **Human handoff and operator inbox** at `/admin/inbox?key=ADMIN_KEY`: read the thread, reply (works inside WhatsApp's 24-hour window), close. The bot stays quiet while a person is handling it.
- **Spend protection** on every AI and message cost (see below).

## What it deliberately does NOT do

- Log in to portals, solve captchas, or submit forms for anyone.
- Send anything to an AI without consent, or reveal a locker number without an Unlock tap.
- Charge without showing the price first.

## Run it (no WhatsApp needed)

```
node --version        # 20 or newer, no npm install needed
npm test              # about 130 tests
npm run simulate      # chat in the terminal (/img, /pdf, /voice <path> work too)
npm run build:demo    # rebuild demo/saathi-app.html
```

## Put it on WhatsApp

**Follow `SETUP.md`**: `npm run setup` (makes your secrets), `npm run doctor` (checks every connection and says what is missing), and ready-made deploy files (`render.yaml`, `fly.toml`). The list below is the short version.

1. Meta developer account, WhatsApp Business app, a phone number. Copy the token and phone id into `.env` (see `.env.example`).
2. Deploy (`Dockerfile` included, with ffmpeg for long voice notes). Point the Meta webhook at `https://YOUR-DOMAIN/webhook`, verify token from `.env`, and set `APP_SECRET`.
3. **Reminder templates:** create and get approved two utility templates, `saathi_reminder` (English) and `saathi_reminder_hi` (Hindi). Body variables: {{1}} what, {{2}} when, {{3}} date. Without them, reminders only reach people who messaged in the last 23 hours.
4. **Payments:** Razorpay keys, and a webhook at `/razorpay` for `payment_link.paid`.
5. **Voice:** `SARVAM_API_KEY` and/or `OPENAI_API_KEY`.
6. **Details form:** `DETAILS_FLOW_ID` (needs Meta business verification). Without it the bot asks one question at a time.
7. **Languages:** `node scripts/translate.js` pre-generates all of them (about 350 short texts each, small cost). Otherwise the first person to pick a language waits a moment while it is created. To fix a translation, edit `data/translations.json` and add `"reviewed": true`; it is then never overwritten.
8. **Reminders run hourly** inside the server. `POST /admin/run-reminders?key=...` runs them now.

New settings (all in `.env.example`): `SARVAM_API_KEY`, `SARVAM_BASE`, `SARVAM_MODEL`, `OPENAI_API_KEY`, `OPENAI_BASE`, `OPENAI_STT_MODEL`, `STT_INR_PER_HOUR`, `REMINDER_TEMPLATE`, `VOICE_PAISE`, `REMIND_PAISE`.

## Will it burn money? No, by design

| Protection | Default | What happens |
|---|---|---|
| AI cutoff | 70% of daily / monthly budget | AI answers stop. The scripted guide keeps working. |
| Hard stop | 100% of daily / monthly budget | Bot stops sending. |
| Daily budget | ₹300 | |
| Monthly budget | ₹6,000 (about US$67) | **Your worst case for the bot itself.** |
| Per user | 8 AI calls/day, 150 messages/day | Stops one person spamming. |

Change the numbers in `.env`. Tests prove the caps hold (`test/costguard.test.js`).

### What each user costs (my estimates, using the rates I found)

| Item | Cost |
|---|---|
| Full guide, 12 WhatsApp messages | ₹0 up to 1,000 messages/month per number, then about ₹0.14 each incl. GST = **about ₹1.70 worst case** |
| One AI answer (Haiku 4.5, about 1,400 tokens in, 140 out) | **about ₹0.19** |
| One photo check | **about ₹0.21** |
| Hosting | roughly ₹0 to ₹500/month (estimate, not checked) |

So a typical free user costs **about ₹2 to ₹3**. At the default cap that is roughly **2,000 to 3,000 free guides a month**.

Heads up on WhatsApp pricing: sources I found say that from **1 October 2026** Meta charges for service replies (₹0.115 each, first 1,000 per number per month free). The bot counts every outbound message as billable to stay conservative.

## How to sell it

I have **not** checked what agents or DigiDocs charge, so treat these as prices to test, not facts.

- **Free:** the guide. It is your marketing and costs about ₹2 per person, capped.
- **₹99, "Check before you pay":** a person reviews screenshots of the filled form or documents before the user hits Pay, and follows up after submission. Cheap to run if one person handles many chats.
- **₹199 to ₹299, "Done with you":** a local CSC / cyber cafe partner sits with the user (or does it on their device) and you share the fee. This is where money is made, and where most of the work is.

Illustrative math, not a forecast: 2,400 free users a month, 5% pay ₹199 = 120 × ₹199 = ₹23,880, minus partner share and your time. Test with 20 real people first and see if anyone pays.

Ways to keep the free tier from costing you: the caps above; a "sponsored by local CSC partner" line (a partner pays per lead, an idea to test); and never turning the AI on for users who don't need it (already the default).

## Before you show this to real people (must do)

1. **Finish verifying the facts in `src/services.js` and `src/knowledge.js`** (see the list of unconfirmed facts below). For PAN: The instant e-PAN steps, eligibility and the ₹91 + GST fee were checked against Income Tax Department pages on 2026-09-30. Still unconfirmed from an official page: Form 93 from 1 April 2026, correction and reprint fees, and the exact screens on the Protean / UTIITSL form. Re-check whenever the portals change.
2. **Have someone in India try each step on a real phone.**
3. **Keep `DOC_CHECK=0`** until `/privacy` is hosted on your own domain and linked from your WhatsApp profile. Photos of IDs go to an AI service, so India's DPDP Act notice and consent matter. I'm not a lawyer, so get one to look at it.
4. Add "not affiliated with the Government of India / Income Tax Department" to your WhatsApp business profile.
5. Set `APP_SECRET`, `HASH_SALT`, `ADMIN_KEY`.
6. The AI path has only been tested with fakes. Put your key in and run `npm run simulate` yourself first.

## What the tests prove

About 130 tests, all against fakes: every service walked end to end in English and Hindi, the money maths (whole paise, refunds, idempotent top-ups), the spend caps, the vault, webhook signatures, voice, PDFs, translation checks, reminders and the scheduler, and a real server process with fake Meta, Anthropic, Razorpay and Sarvam servers (including the operator inbox).

## Not tested, be honest with yourself

- Nothing has run against the live Anthropic, Meta, Razorpay, Sarvam or OpenAI services. The request shapes come from their public docs and third-party notes (Meta's own docs were unreachable), so expect small fixes on first contact. That includes the reminder template payload and the Flow JSON.
- Machine translations need a native speaker to read them before you rely on them.
- Facts flagged as unconfirmed in `src/services.js` (shown to users as "not confirmed"): Form 93 for PAN; whether the free Aadhaar biometric update window for ages 7-15 (30 Sep 2026) has passed; passport fees (from a June 2026 booklet, check the official Fee Calculator); the driving licence grace period (official pages disagree); income and caste certificate fees, validity and documents (they vary by state); whether voter ID is free; GST fee (expected nil).
- Legal review is needed before real users: holding customer money in a wallet (RBI rules on prepaid instruments) and the DPDP Act notice and consent.
- I could not create your Meta, Razorpay or Anthropic accounts or deploy it. That part is yours.

## Files

- `src/services.js`: all paperwork data (edit here to add or fix a service)
- `src/flow.js`: the conversation engine · `src/messages.js`: English and Hindi texts · `src/i18n.js`, `src/translate.js`: other languages
- `src/stt.js`: voice · `src/reminders.js`, `src/scheduler.js`: reminders · `src/inbox.js`: operator inbox page
- `src/billing.js`, `src/costguard.js`: money and spend caps · `src/vault.js`, `src/profile.js`: saved details
- `src/server.js`, `src/whatsapp.js`, `src/llm.js`, `src/store.js`: plumbing
- `scripts/`: simulate, translate, build-demo · `demo/`: shim.js for the in-page preview · `test/`: tests


## Web app, scam shield, transparency (v4)

- **Web app** at `/`: the same bot for people without WhatsApp. Installable (PWA), light and dark, photos, PDFs, voice, copy-ready sheets. No accounts or cookies: the browser keeps a random id and the server stores only a salted hash of it. Links are tappable only when official (`.gov.in`, `.nic.in`, the two PAN partners) or our Razorpay page; anything else is shown as text with a warning. Every write needs a custom header (blocks cross-site requests), strict CSP, per-person and per-address rate limits, uploads held in memory for 10 minutes and dropped after use.
- **Scam shield** (`src/scamcheck.js`): paste any link, SMS or offer and get a verdict; typed Aadhaar, card, PAN numbers and OTPs are caught and never stored or passed on.
- **Transparency**: `sources` shows where each fact comes from and when it was last checked; `history` lists every charge.
- **Setup console** at `/admin/setup?key=...`.
- What it deliberately does not do: log in to government portals or type into them for you. OTP, captcha and Aadhaar consent belong to the person. It prepares copy-ready sheets instead.
- **AI provider**: `OPENROUTER_API_KEY` (free `stealth/space-bunny-alpha`, fallback `openrouter/free`) or `ANTHROPIC_API_KEY`.
- **Preview page**: `npm run build:demo` makes `demo/saathi-app.html`, the real web app with the real bot inside the page.

## Real tool pages, linking and sync (v4)

The web app is no longer chat-only. The sidebar opens real pages, each with its own screen and no chat needed:
Scan a document (animated scanner), My locker, My details, Reminders, Applications, Photo resizer, Is this real?, per-service guides, Wallet, Devices and sync, Settings, Help. Saathi in chat points to these pages with buttons ("Scan a document", "Open my locker") instead of answering everything in text.

- **Every chat opens fresh** with just a greeting. Old chats stay in the sidebar history.
- **Tools** live in `src/tools.js` (server) and `web/tools.js` (pages). Everything personal is sealed with the vault before it is saved. Nothing personal reaches the AI except the photo you choose to scan.
- **Linking a phone or computer** (`src/link.js`): a one-time 8-character code, valid 5 minutes, stored only as a keyed hash, guess-limited, confirmed on the joining device. WhatsApp links need the code and a "Yes" from that phone. Any device can be removed at once. Up to 5 devices.
- **Sync**: locker, details, reminders, applications, checklist ticks and wallet follow the account to every linked device. Chats sync only if switched on (stored sealed, deleted chats stay deleted).
- **Token savings**: fee/document questions are answered from the verified data with no AI call; repeated questions are cached; prompts carry only the relevant service; the chat no longer appends a "Menu" prompt to replies.
- Tests: `node --test test/tools.test.js` (tools and linking), plus the existing suites (run one file at a time).

## Keeping facts current (v4.1)

- `src/factsextra.js`: checked fees, deadlines and validity for every service (PAN-Aadhaar link fee, Aadhaar PVC Rs 75, passport fees from 1 July 2026, learner licence and all central DL fees, GST, certificates).
- `src/livefacts.js`: every 6 hours the server reads the official pages, keeps only lines whose numbers are literally on the page, and the assistant treats those as newer than the checked facts. Pages that block robots are skipped. Force a refresh with `/admin/refresh-facts?key=ADMIN_KEY`. Off on Vercel (no long-running process); edit `factsextra.js` there and redeploy.
- Questions that name no service now get every service's facts (not a one-line overview), and questions that name two get both.

## Latest
- States are matched by typo-tolerant search first, then the AI. A made-up place gets "I don't know a state like that".
- Onboarding has an About-you step (name, birth date, gender, state), stored encrypted and used to fill forms.
- "Give me all info needed for PAN" returns one card: documents, fee, your details. Private values stay locked behind Show and Copy, are fetched on demand and are never in the chat history.
- Guides are workspaces: a route finder, tickable steps that are saved and synced, a document checklist that knows what is in your locker, a fee calculator built from the official tables, and a "what this form needs" panel. Tools (Today hub, reminders, applications, locker, details) are full tools too.
