# Go live: the short version

Everything below is the minimum. `SETUP.md` has the long version with screenshots-in-words. You do the account steps (they need your login, OTP, ID and card); the code is finished.

## 0. One rule that makes WhatsApp and the web app stay in sync
Run **one** server that has a **disk**. Web and WhatsApp are the same engine reading the same data, so they only disagree if they run on different servers. Use Render or Fly (about ₹600 to ₹1,000 a month). Do not host the bot on Vercel: it has no persistent disk. Vercel is fine for the marketing site.

## 1. Deploy (10 min)
- Render: put the folder in a private GitHub repo, then Render > New > Blueprint (`render.yaml` does the rest).
- Fly: follow the commands at the top of `fly.toml`.
- Attach a 1 GB disk and set `DATA_DIR` to it. Set `TRUST_PROXY=1`.
- Run `npm run setup` once locally: it prints strong `VAULT_KEY`, `HASH_SALT`, `ADMIN_KEY`. Paste them into the host's env. Never change `HASH_SALT` later, and back up `VAULT_KEY`.

## 2. WhatsApp (Meta), about 30 min plus approval waits
1. developers.facebook.com > Create App (Business) > add WhatsApp.
2. Copy the Phone number ID into `WHATSAPP_PHONE_ID`. Pick any string for `VERIFY_TOKEN`. Copy the App secret into `APP_SECRET`.
3. Webhook: Callback `https://YOUR-HOST/webhook`, verify token as above, subscribe to `messages`.
4. Permanent token: Business settings > System users > generate (messaging + management) into `WHATSAPP_TOKEN`.
5. Add your real number (needs Business verification, takes days). Set `WHATSAPP_NUMBER` (digits only, with country code, e.g. 919876543210).
6. Create the two reminder templates from `SETUP.md` step 3.8.

## 3. Payments (Razorpay), 10 min plus KYC days
Test mode first: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Webhook URL `https://YOUR-HOST/razorpay`, event `payment_link.paid` only. Pay with test card 4111 1111 1111 1111. When KYC clears, swap in the live keys. Sell fixed packs, keep wallet balances small (RBI prepaid rules may apply; ask an adviser).

## 4. AI (free)
`OPENROUTER_API_KEY` from openrouter.ai. Leave `DOC_CHECK` off until your privacy page is public.

## 5. Check it
`npm run doctor` should show no FIX lines. Open `https://YOUR-HOST/admin/setup?key=ADMIN_KEY` for a live checklist with copy buttons and a test-message button.

## 6. Easiest way for people to use it
- Share one link: `https://wa.me/YOUR_NUMBER?text=Hi`. It opens WhatsApp with "Hi" ready to send. Put it in your Instagram bio, on posters (turn the link into a QR with any free QR maker) and in your website button.
- No WhatsApp? They open `https://YOUR-HOST/app` in any browser and can install it to the home screen.
- To use both: web app > Settings > Devices and sync > link WhatsApp, send the 8-character code to the bot, reply Yes. After that details, locker, reminders, wallet and chats are one account.

## What stays with you
Meta business verification, Razorpay KYC, the privacy-notice lawyer check, and the final test on a second phone.
