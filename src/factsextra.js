// Extra checked facts the assistant needs for the questions people really ask (fees, deadlines, validity, limits).
// Each line is one plain fact. Prices and dates were checked against official pages and news of official notices on
// 2026-09-30. `livefacts.js` layers anything newer it can read from the official pages on top of these at runtime.
// Keep every line short and specific: the AI copies numbers from here, so a wrong number here is a wrong answer.
export const EXTRA_FACTS = {
  pan: [
    'PAN-Aadhaar link: linking is compulsory. A PAN that is not linked is inoperative (for example refunds are held with no interest, TDS is higher, KYC and some banking or investing steps can stop). The Income Tax portal charges Rs 1,000 as the fee for delay when linking now. Pay it on incometax.gov.in under e-Pay Tax (Other Receipts, code 500), wait a few days for the payment to show, then link with PAN, Aadhaar and the OTP on the Aadhaar mobile. After linking, the PAN normally becomes operative again within about 30 days. Names and dates of birth must match on both. Check the status on incometax.gov.in under Link Aadhaar Status. Exempt: non-residents, people aged 80 or more, and residents of Assam, Jammu and Kashmir and Meghalaya (under the older exemptions). An e-PAN issued through Aadhaar OTP is already linked.',
    'PAN correction or reprint costs about Rs 50 for an Indian address (Protean or UTIITSL show the exact amount before payment). A reprinted card usually arrives by post in about 15 working days. The e-PAN PDF can be downloaded free with Aadhaar OTP.',
    'Minors can have a PAN. A parent or guardian applies for them and signs for them. The child must apply again with their own signature after turning 18.',
    'PAN never expires. It is one number for life. There is no renewal.',
    'Lost PAN: you do not need a new number. Use the free e-PAN download if your Aadhaar mobile is linked, or ask for a reprint.',
    'Name or date of birth change on PAN: apply for a correction on Protean or UTIITSL with proof (for example Aadhaar, passport, birth certificate, marriage certificate for a name change after marriage). The details must match your Aadhaar if you want the two to link.',
  ],
  aadhaar: [
    'Aadhaar PVC card costs Rs 75 including GST and speed post since 1 January 2026 (it was Rs 50). Order it on myaadhaar.uidai.gov.in or in the mAadhaar app with the Aadhaar number and OTP. It usually arrives within about 5 working days of dispatch. It is as valid as the paper letter.',
    'Aadhaar has no expiry. A biometric update is mandatory at ages 5 and 15 (free for children, see the fee note). UIDAI also encourages a document update after 10 years.',
    'Download e-Aadhaar free on myaadhaar.uidai.gov.in with Aadhaar and OTP (or with the enrolment number). Locking your biometrics is free on the same portal.',
    'Link mobile to Aadhaar: only at an Aadhaar Seva Kendra (biometric check). Fee is Rs 75. Email and address can be added online.',
    'Aadhaar address update online is possible with a valid address proof, and a head of family route exists for family members without their own proof. Only documents UIDAI lists are accepted.',
  ],
  dl: [
    'Learner licence: central fee about Rs 200 in total (Rs 150 application plus Rs 50 test), paid on sarathi.parivahan.gov.in. States add small extra charges. It is valid 6 months and the test is a computer test of road signs and rules. Minimum age is 18, or 16 for a gearless two-wheeler up to 50 cc with a guardian\'s consent. Retest fee Rs 50.',
    'Permanent driving licence: after 30 days of holding a learner licence (and within 180 days) you book a driving test slot. Central fees: application Rs 200 and driving test Rs 300 (retest Rs 300). Total is about Rs 500 plus state charges, which is why the site total can be higher.',
    'Other central fees: duplicate licence Rs 200; change of address or details Rs 200; add another vehicle class Rs 500; international driving permit Rs 1,000; renewal Rs 200; late renewal Rs 300 plus Rs 1,000 per year after the first year. State charges are extra and the portal shows the final amount.',
    'Validity of a private-vehicle licence: 20 years or until age 40, whichever is earlier; after that it is renewed for 5 years at a time. A transport licence is valid 3 years (5 years for hazardous goods is a special rule).',
    'Documents for a learner licence: age proof, address proof, passport photo, signature, and Form 1 (medical self-declaration; Form 1A medical certificate if over 40 or for a transport vehicle). Aadhaar can be used for both age and address where the state allows the Aadhaar route.',
    'Sarathi services can be done in most states without visiting the RTO (faceless services with Aadhaar authentication), but the driving test slot is at the RTO or an accredited driving centre.',
  ],
  passport: [
    'Passport fees from 1 July 2026 (first increase since 2012): 36 pages normal Rs 2,500; 36 pages Tatkaal Rs 5,000; 60 pages normal Rs 3,500; 60 pages Tatkaal Rs 6,000. Lost or damaged: 36 pages Rs 5,000 (Tatkaal Rs 7,500); 60 pages Rs 6,000 (Tatkaal Rs 8,500). Minor under 18: 36 pages normal Rs 1,750, Tatkaal Rs 4,250; minor lost or damaged Rs 4,250 (Tatkaal Rs 6,750). Police clearance certificate Rs 750. Certificate of Identity Rs 1,000. These apply to applications submitted on or after 1 July 2026. The portal Fee Calculator shows the exact amount.',
    'Passport validity: 10 years for adults; minors under 15 get 5 years or until 18; ages 15 to 18 can choose 10 years or until 18.',
    'Renewal is the same form as fresh (Apply for Fresh Passport or Re-issue). You can apply up to a year before expiry. Keep the old passport for the visit.',
    'Police verification: Tatkaal and normal both get police verification, either before or after issue depending on the case.',
  ],
  voter: [
    'Voter ID (EPIC) is free. There is no fee for Form 6, Form 8 or downloading the e-EPIC. Anyone asking money for it is not official.',
    'A voter can vote only where they are enrolled. The e-EPIC is a PDF that is valid ID, same as the plastic card. To download it you need your EPIC number or reference number and the mobile registered with the ECI portal.',
    'Aadhaar linking with voter ID is voluntary (Form 6B), not compulsory.',
  ],
  gst: [
    'GST registration is free on the portal. Voluntary registration is allowed below the threshold. Threshold: Rs 20 lakh for services (Rs 10 lakh in special category states) and Rs 40 lakh for goods (Rs 20 lakh in some special category states).',
    'Composition scheme: available to small goods traders (turnover up to Rs 1.5 crore, lower limits in some states) and some service providers (up to Rs 50 lakh); pays a small fixed percentage of turnover and cannot claim input tax credit. Confirm limits on gst.gov.in.',
    'Late fee for filing GST returns is Rs 50 a day (Rs 20 for nil returns) with a cap, plus 18 percent interest on unpaid tax; the returns are GSTR-1 and GSTR-3B.',
    'GSTIN is 15 characters: state code (2 digits), PAN (10 characters), entity number, Z, checksum.',
  ],
  income: [
    'Income certificate: the fee is set by each state and is usually small (roughly Rs 10 to Rs 60 on the state portal, plus a kiosk or CSC service charge where you use one). Many states let you apply free on the portal. The portal shows the exact amount before you pay. Processing is usually about 7 to 21 days depending on the state. Validity is usually 6 months to 1 year, so apply close to when you need it.',
    'Income certificate is issued by the Tehsildar, SDM or Revenue Department. Supporting documents: Aadhaar, address proof, ration card, and a self-declaration or salary slip.',
  ],
  caste: [
    'Caste certificate: the fee is set by each state, usually small (roughly Rs 10 to Rs 60) plus any CSC service charge; the portal shows the exact amount. Processing is usually about 7 to 30 days. SC and ST certificates are generally valid for life; OBC non-creamy-layer certificates are usually valid for one financial year (some states accept 3 years), so renew when you apply for a job or admission.',
    'For central government jobs and admissions an OBC candidate needs an OBC non-creamy-layer certificate. The creamy-layer income limit is Rs 8 lakh a year (set in 2017; it has been under review, so confirm the current limit).',
  ],
};

/** The lines for one service id (empty when there are none). */
export const extraFor = (id) => EXTRA_FACTS[id] || [];
