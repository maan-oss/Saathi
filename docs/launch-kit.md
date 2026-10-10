# Saathi launch kit

Drafts only. Nothing here is posted, sent or bought. Every price and limit below comes from the live app config (`/app/api/config`) and the landing page, so the marketing says the same as the product.

## 1. Blockers before any paid or public push

These need you or an approval. Nothing below works around them.

1. **Business details.** Operator on the site: Maan Ghori, 47 Prominence Street, Pallara QLD, Australia. Contact gethelp.saathi@gmail.com. **Still missing: ABN** (needed if you trade as a business). Add the same details in Stripe's business settings (you do this in Stripe, not in the app).
2. **Terms and refund policy.** Live at `/terms` and `/refund`, written from what the app actually does. Have a consumer-law reviewer read them. Two choices are mine and can be changed: the 14-day window for packs, and "reply within 2 business days" (an aim, not a promise).
3. **WhatsApp number approved by Meta.** The site hides WhatsApp until it is approved. Until then every link goes to `https://getsaathi.in/app`.
4. **A real live payment test.** One ₹50 top-up, then refund it if you want. I could not run this (the checkout step was blocked).
5. **Render disk confirmed.** In Render, `saathi-data` must be mounted at `/data`. The admin setup page shows "Data on its own disk".
6. **Analytics decision.** Nothing is installed, so you can't see where sign-ups come from. See section 6.
7. **Production deploy.** Done: `main` carries the current code and is live on getsaathi.in.

## 2. Positioning

**One line:** Saathi walks you through Indian government forms step by step: what to keep ready, what it costs and which official page to use. In English or Hindi. It never asks for your OTP.

**Who it is for:** people doing a government form for the first time, and people helping a parent or relative with one. Services: PAN, driving licence, Aadhaar, voter ID, passport, GST registration, income and caste certificates.

**What is true today (use these):**
- It shows the documents to keep ready, the fee and the official link before you start.
- It never asks for an OTP, PIN, password or card number. You finish on the official site.
- It is an independent helper and is not affiliated with any government body.
- Free to start: a welcome credit of ₹5, 40 free messages and 15 free AI answers a day.
- Packs: Quick pack ₹50 (3 days), Saathi pack ₹50 (7 days), Saathi Plus ₹149 (30 days). Top-ups ₹50 to ₹500.
- Support: gethelp.saathi@gmail.com. Privacy: getsaathi.in/privacy.

**Do not say** (any channel):
- "official", "government-approved", "govt partner", "authorised" or any wording that implies a government link.
- "guaranteed approval", "fastest", "best", "No.1", or any claim about processing time.
- Testimonials, reviews or user numbers. We have none yet. Collect real ones with permission first.
- That WhatsApp is available, until Meta approves the number.
- Anything that suggests Saathi collects OTPs or card details.

## 3. Channels, in order

1. **Search (organic).** One page per service: PAN, driving licence, passport, Aadhaar update, voter ID, GST. Each shows the checklist, the fee and the official link. *Not built yet. This is the biggest gap.*
2. **WhatsApp**, after Meta approval. Share the link. Send nothing in bulk without the person's opt-in.
3. **Social posts** (drafts below), 3 a week.
4. **Paid ads: Google is closed; Meta is untested.**
   - **Google:** Ads for government-document services need a government provider or an authorised non-government provider. An authorised provider must be linked from an official government website that names it as authorised. Commercial contracts, licences and registry entries do not count. India is excluded only for "regional identification numbers" (for example ration cards), not for PAN, passport, driving licence, Aadhaar, voter ID or GST. Saathi is not authorised, so Google Ads for these services cannot run. Source: https://support.google.com/adspolicy/answer/13156083?hl=en
   - **Meta:** the India rules Meta has published cover investment products and real-money gaming, not government-document help. I found nothing that blocks this category, but Meta reviews every ad, so only a small test shows the answer. No spend until you approve a budget.

## 4. Social drafts (not posted)

**EN, 1.** Before you start a government form, know what to keep ready and what it costs. Saathi shows the checklist, the fee and the official page first. It never asks for your OTP. Saathi is an independent helper, not a government service. getsaathi.in

**EN, 2.** You never need to give a helper your OTP. Saathi never asks for an OTP, PIN, password or card number. You finish on the official site, every time.

**EN, 3.** Driving licence, passport, voter ID, GST: each has its own checklist. Tell Saathi what you need and it shows what to keep ready, what it costs and where to go. getsaathi.in

**EN, 4.** Free to try: a small welcome credit and free messages every day. Packs start at ₹50. Independent helper, not a government service. getsaathi.in

**HI, 1.** सरकारी फ़ॉर्म भरने से पहले जानें कि कौन-से दस्तावेज़ तैयार रखने हैं, कितना शुल्क लगेगा और कौन-सा आधिकारिक पेज खोलना है। साथी एक स्वतंत्र सहायक है, सरकारी सेवा नहीं। यह कभी OTP नहीं मांगता। getsaathi.in

## 5. Launch email (draft, send only to people who opted in)

**Subject:** Saathi is live: government forms, step by step

Hi,

Saathi is live. It shows you what to keep ready for a government form, what it costs and which official page to use. It works in English and Hindi, and it never asks for your OTP or card number.

Try it at getsaathi.in/app. New people get a small welcome credit and some free messages each day.

Saathi is an independent helper and is not affiliated with any government body. Always confirm rules and fees on the official website.

Questions: gethelp.saathi@gmail.com

Axiom

## 6. Measurement

Track these events: landing view, app opened, first message, top-up started, top-up paid, back within 7 days. Options:
- **A. Server-side counters in our own store.** No third party, no cookies, fits the privacy promise. Recommended. Needs a build.
- **B. Vercel Web Analytics.** Easy, but a third-party script and a privacy-notice change. Needs enabling in the Vercel dashboard.
- **C. None.** Not recommended before launch.

## 7. Ad test copy (only if you approve a Meta test)

**Headline:** Know what to keep ready
**Text:** Saathi shows the documents, the fee and the official page for PAN, driving licence, passport and more. It never asks for your OTP. Independent helper, not a government service.
**Button:** Learn more

## 8. 14-day plan

- **Days 0–2:** clear the blockers in section 1.
- **Days 3–5:** build the service pages (search).
- **Days 6–9:** post 3 times a week; share the WhatsApp link once it is approved.
- **Days 10–14:** collect first users and feedback; ask permission before using any quote.
