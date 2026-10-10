# Meta ad test: package for approval

Status: prepared, not running. Nothing is posted, bought or sent. Google Ads is closed for these services (see launch-kit.md section 3), so Meta is the only paid channel.

## 1. What you need to do

1. Create or give me access to a Meta ad account in Meta Business Manager, with a payment method. Meta may also ask you to verify the business.
2. Approve the budget and one option from section 3.
3. Approve the copy in section 5. Changes are welcome; I'll check them against the do-not-say list in launch-kit.md section 2 first.

I will not set up or spend anything until you approve each of these.

## 2. Test design

- **Objective:** traffic to the website, not the app. The site is where the counts are kept.
- **Audience:** India, ages 18 to 55, English and Hindi. One broad ad set first. No targeting by religion, caste, health or politics.
- **Placements:** automatic (Facebook and Instagram feeds, Stories and Reels).
- **Length:** 5 days, then decide. Do not change the budget mid-test, so the numbers stay readable.
- **Links:** each ad goes to the home page or to one service page, tagged so the counts show the source (`utm_source=meta`).

## 3. Budget options (in your ad account's currency)

| Option | Per day | Days | Total | Notes |
|---|---|---|---|---|
| A (recommended) | ₹500 | 5 | ₹2,500 | Enough for a read on the broad ad set |
| B | ₹1,000 | 7 | ₹7,000 | Faster read, more risk if the copy is weak |
| C | ₹300 | 3 | ₹900 | Smallest test; a short read only |

The total is a hard stop. If the account reaches the approved total, it stops.

## 4. Links to use

Home page:
- `https://getsaathi.in/?utm_source=meta&utm_medium=paid&utm_campaign=test_broad&utm_content=ad1`

Service pages (live once this is deployed):
- PAN: `https://getsaathi.in/pan?utm_source=meta&utm_medium=paid&utm_campaign=test_pan&utm_content=ad1`
- Driving licence: `https://getsaathi.in/driving-licence?utm_source=meta&utm_medium=paid&utm_campaign=test_dl&utm_content=ad1`
- Passport: `https://getsaathi.in/passport?utm_source=meta&utm_medium=paid&utm_campaign=test_passport&utm_content=ad1`
- Aadhaar update: `https://getsaathi.in/aadhaar-update?utm_source=meta&utm_medium=paid&utm_campaign=test_aadhaar&utm_content=ad1`
- GST registration: `https://getsaathi.in/gst-registration?utm_source=meta&utm_medium=paid&utm_campaign=test_gst&utm_content=ad1`

Voter ID is left out of the first test (see section 7).

## 5. Ad copy (drafts)

**A. Know what to keep ready** (from launch-kit)
- Headline: Know what to keep ready
- Text: Saathi shows the documents, the fee and the official page for PAN, driving licence, passport and more. It never asks for your OTP. Independent helper, not a government service.
- Button: Learn more

**B. Before you start a form**
- Headline: Check the checklist first
- Text: Saathi tells you which documents to keep ready, what the fee is and which official site to use. It never asks for your OTP or card number. Independent helper, not a government service.
- Button: Learn more

**C. Your OTP stays with you**
- Headline: Never share your OTP
- Text: Saathi never asks for an OTP, PIN, password or card number. It helps you prepare, and you finish on the official site. Independent helper, not a government service.
- Button: Learn more

**D. Hindi**
- Headline: सरकारी फ़ॉर्म से पहले जानें
- Text: कौन-से दस्तावेज़ चाहिए, कितनी फीस लगेगी और कौन-सा आधिकारिक पेज खोलें। Saathi एक स्वतंत्र सहायक है, सरकारी सेवा नहीं। यह कभी OTP नहीं मांगता।
- Button: और जानें

Copy check: none of these say "official" about Saathi, "guaranteed", "fastest", "best", or anything about a government link. "Official" appears only for the site the user is sent to.

## 6. What to measure

Read these from `/admin/stats` (last 30 days, key required), per source `meta`:
- Landing views (`landing_view|meta`)
- App opens (`app_open|meta`)
- Top-ups started and paid (`topup_started`, `topup_paid`). These only come from the app, so they are the revenue signal, not the ad signal.

Decision rules, set before the test starts:
- **Stop an ad** if it spends its share of ₹1,000 (or the equivalent) with no app open.
- **Keep the copy that gets the most app opens per landing view** for the next round.
- **Scale only after** top-ups start to come from Meta traffic. A cheap click that never pays is not a result.

## 7. Risks

- **Meta review.** Every ad is reviewed. Ads about government documents can be rejected or held. If that happens, the reason is shown in Ads Manager and we change the copy, not the claim.
- **Voter ID and elections.** Ads about voter cards can fall under Meta's election and social-issue rules, which need extra checks in India. That is why voter ID is not in the first test.
- **Free-trial wording.** The welcome credit is small. Use "free to start" only if the ad account approves it; otherwise use "small welcome credit".

## 8. Organic posts (drafts, not posted)

Each post links to a service page with `utm_source=instagram` (or `facebook`), so the counts show what organic social brings.

1. Passport renewal: what to keep ready, and the fee calculator on passportindia.gov.in. Link: `/passport?utm_source=instagram`
2. Aadhaar update: documents, and the myAadhaar document update is free until 14 June 2027. Link: `/aadhaar-update?utm_source=instagram`
3. "Is it a scam?" post: the GST portal charges no registration fee, so anyone asking you to pay to "process" it is an agent. Link: `/gst-registration?utm_source=instagram`

Post three a week. Nothing is posted until you approve each one.

## 9. Message drafts (not sent)

Only to people you choose. Each message needs your approval before it goes.

- **To a friend or relative:** "I found a free helper that tells you what to keep ready for a government form and what it costs. It never asks for your OTP. getsaathi.in — it's independent, not a government site."
- **To a community or CSC centre owner:** "I run Saathi, a free helper for government forms (PAN, licence, passport, Aadhaar, voter ID, GST). It shows the documents and fee first and never asks for an OTP. Would you be willing to try it and tell me what's missing? gethelp.saathi@gmail.com"
