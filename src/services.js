// The service registry: everything the bot knows about each piece of government paperwork.
// Deterministic, editable, no AI cost. Each service is plain data:
//
//   id, name{en,hi}, blurb{en,hi}          shown in the services list (name <= 24 chars, blurb <= 72)
//   intake[]                               questions that decide the route. type 'yn' | 'opts' | 'state'
//   pick(ans) -> { route, note? }          which route to use, plus an optional extra line for the intro
//   routes{ id: { intro, steps[], text? }} intro has {n} (step count) and {note}; kind 'info' has only text
//   docs, fee, after (all {en,hi})         documents list, fee line, what to do once the steps are done
//   sheet[]                                profile keys this service's form asks for
//   self{en,hi}                            what only the person can do (OTP, captcha, signing, visits)
//   sites[], facts[], unverified[]         official sites, plain-English facts and open doubts for the AI
//   remind                                 reminder types this service offers (see reminders.js)
//
// !! Government rules change. Re-verify before launch and whenever a portal changes.
// Research date: 2026-09-30. PAN was checked against Income Tax Department pages. The rest came from
// official pages where they loaded (UIDAI, Parivahan, Passport Seva PDFs, CBIC/GST, ECI forms) and are
// marked in `unverified` wherever an official page could not be opened or pages disagreed.

import { PAN } from './knowledge.js';
import * as i18n from './i18n.js';
import { extraFor } from './factsextra.js';
import { findState } from './states.js';

export const LAST_VERIFIED = '2026-09-30';

// ---------------------------------------------------------------- state portals (income / caste)
export const STATES = [
  { id: 'mh', names: ['maharashtra', 'महाराष्ट्र', 'mh'], portal: { name: 'Aaple Sarkar', url: 'aaplesarkar.mahaonline.gov.in' } },
  { id: 'rj', names: ['rajasthan', 'राजस्थान', 'rj'], portal: { name: 'e-Mitra', url: 'emitra.rajasthan.gov.in' } },
  { id: 'dl', names: ['delhi', 'दिल्ली', 'new delhi'], portal: { name: 'e-District Delhi', url: 'edistrict.delhigovt.nic.in' } },
  { id: 'br', names: ['bihar', 'बिहार', 'br'], portal: { name: 'RTPS Bihar', url: 'serviceonline.bihar.gov.in' } },
  { id: 'wb', names: ['west bengal', 'bengal', 'पश्चिम बंगाल', 'wb'], portal: { name: 'Backward Classes Welfare portal (caste) / e-District', url: 'castcertificatewb.gov.in' } },
  { id: 'gj', names: ['gujarat', 'गुजरात', 'gj'], portal: { name: 'Digital Gujarat', url: 'digitalgujarat.gov.in' } },
  { id: 'ka', names: ['karnataka', 'कर्नाटक', 'ka'], portal: { name: 'Seva Sindhu', url: 'sevasindhu.karnataka.gov.in' } },
  { id: 'tn', names: ['tamil nadu', 'tamilnadu', 'तमिलनाडु', 'tn'], portal: { name: 'TN e-Sevai', url: 'tnesevai.tn.gov.in' } },
  { id: 'ts', names: ['telangana', 'तेलंगाना', 'ts'], portal: { name: 'MeeSeva', url: 'ts.meeseva.telangana.gov.in' } },
  { id: 'ap', names: ['andhra pradesh', 'andhra', 'आंध्र प्रदेश', 'ap'], portal: { name: 'AP Seva', url: 'apseva.ap.gov.in' } },
  { id: 'up', names: ['uttar pradesh', 'उत्तर प्रदेश', 'up'], portal: { name: 'e-District UP', url: 'edistrict.up.gov.in' } },
  { id: 'mp', names: ['madhya pradesh', 'मध्य प्रदेश', 'mp'], portal: { name: 'MP e-District', url: 'mpedistrict.gov.in' } },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

export function matchState(text) {
  const f = findState(text);
  if (!f) return null;
  const withPortal = STATES.find((st) => st.id === f.id);
  return withPortal ? { ...withPortal, name: f.name, hi: f.hi } : { id: f.id, names: [], name: f.name, hi: f.hi, portal: null };
}

export function portalLine(stateId, lang) {
  const st = STATES.find((x) => x.id === stateId);
  if (st) return `*${st.portal.name}* (${st.portal.url})`;
  return lang === 'hi'
    ? 'आपके राज्य का e-District / सेवा पोर्टल (राज्य का नाम और "e-District income certificate" खोजें, या तहसील / CSC केंद्र पर पूछें)'
    : "your state's e-District or e-Sevai portal (search your state name with \"e-District income certificate\", or ask at your tehsil or a CSC centre)";
}

const yn = (key, en, hi, when) => ({ key, type: 'yn', en, hi, when });
const opts = (key, en, hi, options, when) => ({ key, type: 'opts', en, hi, options, when });

// ---------------------------------------------------------------- PAN
const pan = {
  id: 'pan',
  name: { en: 'New PAN card', hi: 'नया PAN कार्ड' },
  blurb: { en: 'Instant e-PAN or full application', hi: 'इंस्टेंट e-PAN या पूरा आवेदन' },
  intake: [
    yn('has_pan', 'First: do you already have a PAN? (Having two PANs is not allowed.)', 'पहले बताइए: क्या आपके पास पहले से PAN है? (दो PAN रखना मना है।)'),
    yn('adult', 'Are you 18 or older?', 'क्या आपकी उम्र 18 साल या ज़्यादा है?', (a) => a.has_pan === 'n'),
    yn(
      'mobile',
      'Is your mobile number linked to your Aadhaar? (The OTP goes to that number.) You can check at myaadhaar.uidai.gov.in.',
      'क्या आपका मोबाइल नंबर आधार से जुड़ा है? (OTP उसी नंबर पर आता है।) आप myaadhaar.uidai.gov.in पर जाँच सकते हैं।',
      (a) => a.adult === 'y',
    ),
  ],
  pick: (a) => {
    if (a.has_pan === 'y') return { route: 'have' };
    if (a.adult === 'n')
      return {
        route: 'form',
        note: {
          en: '\nBecause the applicant is under 18, a parent or guardian applies and signs on their behalf.',
          hi: '\nआवेदक 18 साल से कम का है, इसलिए माता-पिता या अभिभावक उसकी तरफ से आवेदन करेंगे और साइन करेंगे।',
        },
      };
    return { route: a.mobile === 'y' ? 'epan' : 'form' };
  },
  routes: {
    have: {
      kind: 'info',
      text: {
        en: "Then you don't need a new one. If you need a correction, a reprint, or the digital copy, choose *Fix or reprint PAN* from the services list.",
        hi: 'तो आपको नया PAN नहीं चाहिए। सुधार, रीप्रिंट या डिजिटल कॉपी चाहिए तो सेवाओं की लिस्ट में *PAN सुधार या रीप्रिंट* चुनें।',
      },
    },
    epan: {
      intro: {
        en: 'Good news: you can likely get an *instant e-PAN for free* (a digital PAN as a PDF) using Aadhaar OTP. It takes {n} short steps.',
        hi: 'अच्छी खबर: आप आधार OTP से *मुफ्त में instant e-PAN* (PDF वाला डिजिटल PAN) ले सकते हैं। इसमें {n} छोटे स्टेप हैं।',
      },
      steps: PAN.epan,
    },
    form: {
      intro: {
        en: "You'll apply on the official Protean or UTIITSL site, {n} steps. The Income Tax Department lists ₹91 plus GST (about ₹107), paid on the portal.{note}",
        hi: 'आप सरकारी Protean या UTIITSL साइट पर आवेदन करेंगे, {n} स्टेप। आयकर विभाग ₹91 और GST (करीब ₹107) बताता है, पोर्टल पर ही भरनी है।{note}',
      },
      steps: PAN.form,
    },
  },
  docs: PAN.docsList,
  fee: {
    en: 'Instant e-PAN with Aadhaar OTP is free. The full application is ₹91 plus GST (about ₹107) for an Indian address, paid on the portal. Correction and reprint is about ₹50 with GST for an Indian address; the portal shows the exact fee before you pay.',
    hi: 'आधार OTP से instant e-PAN मुफ्त है। पूरा आवेदन भारतीय पते के लिए ₹91 और GST (करीब ₹107) है, पोर्टल पर भरें। सुधार और रीप्रिंट करीब ₹50 GST सहित है (भारतीय पता); सही फीस पोर्टल भुगतान से पहले दिखाता है।',
  },
  after: {
    en: 'Keep your acknowledgement number safe.',
    hi: 'अपना acknowledgement नंबर संभालकर रखें।',
  },
  sheetName: { en: 'PAN application', hi: 'PAN आवेदन' },
  sheet: ['full_name', 'dob', 'father_name', 'gender', 'address', 'pincode'],
  self: {
    en: 'the Aadhaar number, the OTP, the captcha and the payment',
    hi: 'आधार नंबर, OTP, कैप्चा और भुगतान',
  },
  sites: PAN.officialSites,
  facts: [
    'Fees: Income Tax Department lists Rs 91 plus GST (about Rs 107) for a standard application with an Indian address, Rs 862 plus GST for a foreign address. Instant e-PAN via Aadhaar OTP on incometax.gov.in is free. Correction and reprint: about Rs 50 including GST for an Indian address (from a Protean notice; say "about" and that the portal shows the exact fee).',
    'Instant e-PAN eligibility: an individual with no PAN, valid Aadhaar with a linked mobile, adult, not a representative assessee under section 160, not a foreign citizen. If someone already has a PAN they cannot apply for another. It is digital only; a physical card can be requested later on Protean or UTIITSL. The OTP is 6 digits, valid 15 minutes, 3 attempts.',
    'Having two PANs is not allowed.',
  ],
  unverified: ['the correction fee (from a Protean notice, not an Income Tax page)', 'the number of the correction form (portals still say Changes or Correction)', 'exact button names on the Protean / UTIITSL form'],
};

const panFix = {
  id: 'pan_fix',
  alias: 'pan',
  name: { en: 'Fix or reprint PAN', hi: 'PAN सुधार या रीप्रिंट' },
  blurb: { en: 'Correction, lost card, digital copy', hi: 'करेक्शन, खोया कार्ड, डिजिटल कॉपी' },
  intake: [],
  pick: () => ({ route: 'info' }),
  routes: { info: { kind: 'info', text: PAN.fixOrReprint } },
};

// ---------------------------------------------------------------- Driving licence
const dl = {
  id: 'dl',
  name: { en: 'Driving licence', hi: 'ड्राइविंग लाइसेंस' },
  blurb: { en: 'Renew, or get a duplicate', hi: 'रिन्यू या डुप्लीकेट' },
  intake: [
    opts(
      'state_of_dl',
      'What is the situation with your licence?',
      'आपके लाइसेंस की क्या स्थिति है?',
      [
        ['ok', 'Valid / <1 yr late', 'वैध / 1 साल से कम'],
        ['old', 'Expired > 1 year', '1 साल से ज़्यादा'],
        ['dup', 'Lost or damaged', 'खोया या खराब'],
      ],
    ),
  ],
  pick: (a) => ({ route: a.state_of_dl === 'dup' ? 'dup' : a.state_of_dl === 'old' ? 'late' : 'renew' }),
  routes: {
    renew: {
      intro: {
        en: 'You can renew your driving licence online on Sarathi, {n} steps. Official pages say you can renew from up to a year before expiry to a year after.{note}',
        hi: 'आप Sarathi पर अपना ड्राइविंग लाइसेंस ऑनलाइन रिन्यू कर सकते हैं, {n} स्टेप। सरकारी पेज के अनुसार एक्सपायरी से एक साल पहले से एक साल बाद तक रिन्यू हो सकता है।{note}',
      },
      steps: [
        { en: 'Open *sarathi.parivahan.gov.in* and choose your state.', hi: '*sarathi.parivahan.gov.in* खोलें और अपना राज्य चुनें।' },
        {
          en: 'Tap *Apply for DL Renewal* (or *Driving Licence → Services on DL*). Tap *Continue*, type your licence number and date of birth, and tap *Get Driving Licence Details*.',
          hi: '*Apply for DL Renewal* (या *Driving Licence → Services on DL*) दबाएँ। *Continue* दबाएँ, अपना लाइसेंस नंबर और जन्मतिथि डालें और *Get Driving Licence Details* दबाएँ।',
        },
        {
          en: 'Choose *Renewal* and fill in the form. Use the details exactly as on your licence. Type *sheet* to get your details ready to copy.',
          hi: '*Renewal* चुनें और फॉर्म भरें। जानकारी बिल्कुल लाइसेंस जैसी ही डालें। जानकारी कॉपी करने के लिए *sheet* लिखें।',
        },
        {
          en: 'Upload what the site asks: your photo and signature, and *Form 1* (self-declaration of fitness). If you are over 40, or drive a transport vehicle, you also need *Form 1A*: a medical certificate signed by a registered doctor. Rules can differ by state.',
          hi: 'साइट जो माँगे वह अपलोड करें: आपकी फोटो और हस्ताक्षर, और *Form 1* (सेहत का स्वयं-घोषणा पत्र)। अगर आपकी उम्र 40 से ऊपर है या आप ट्रांसपोर्ट वाहन चलाते हैं तो *Form 1A* भी चाहिए: पंजीकृत डॉक्टर का मेडिकल सर्टिफिकेट। राज्य के अनुसार नियम अलग हो सकते हैं।',
        },
        {
          en: 'If your state asks for it, book an RTO appointment (*DL services Slot Booking*). Not every renewal needs a visit or a test.',
          hi: 'अगर आपका राज्य माँगे तो RTO का अपॉइंटमेंट बुक करें (*DL services Slot Booking*)। हर रिन्यूअल में विज़िट या टेस्ट ज़रूरी नहीं होता।',
        },
        {
          en: 'Pay the fee online under *Fee Payments*. The central fee for renewal is ₹200, but the site adds your state\'s charges, so the final amount can differ. Print the receipt and the form.',
          hi: '*Fee Payments* में ऑनलाइन फीस भरें। रिन्यूअल की केंद्रीय फीस ₹200 है, पर साइट आपके राज्य के शुल्क जोड़ती है, इसलिए अंतिम रकम अलग हो सकती है। रसीद और फॉर्म प्रिंट करें।',
        },
        {
          en: 'Track with *Application Status* (use *Find Application Number* if you lost it). The renewed licence usually comes by post.',
          hi: '*Application Status* से स्टेटस देखें (नंबर खो गया हो तो *Find Application Number* इस्तेमाल करें)। रिन्यू हुआ लाइसेंस आमतौर पर डाक से आता है।',
        },
      ],
    },
    late: {
      intro: {
        en: 'If a licence expired more than a year ago, official pages say you may need a driving test, or even a fresh learner licence, depending on your state. A late fee also applies: ₹300, plus ₹1,000 for each year or part of a year after the first year. The steps start the same way, {n} steps.{note}',
        hi: 'अगर लाइसेंस एक साल से ज़्यादा पहले एक्सपायर हुआ है तो सरकारी पेज के अनुसार आपके राज्य के आधार पर ड्राइविंग टेस्ट या नया लर्नर लाइसेंस भी लग सकता है। देरी की फीस भी लगती है: ₹300, और पहले साल के बाद हर साल या उसके हिस्से के लिए ₹1,000 अलग। स्टेप शुरू में वही हैं, {n} स्टेप।{note}',
      },
      steps: null, // same as renew, with the RTO step made mandatory (filled in below)
    },
    dup: {
      intro: {
        en: 'For a lost, damaged or full licence you apply for a *duplicate* on Sarathi, {n} steps. The site shows the fee on the payment screen.{note}',
        hi: 'लाइसेंस खो जाने, खराब होने या भर जाने पर Sarathi पर *डुप्लीकेट* के लिए आवेदन करें, {n} स्टेप। फीस भुगतान वाली स्क्रीन पर दिखती है।{note}',
      },
      steps: [
        { en: 'Open *sarathi.parivahan.gov.in* and choose your state.', hi: '*sarathi.parivahan.gov.in* खोलें और अपना राज्य चुनें।' },
        {
          en: 'Under *Driving Licence → Services on DL* choose *Duplicate DL*. Type your licence number and date of birth, and tap *Get Driving Licence Details*.',
          hi: '*Driving Licence → Services on DL* में *Duplicate DL* चुनें। लाइसेंस नंबर और जन्मतिथि डालें और *Get Driving Licence Details* दबाएँ।',
        },
        {
          en: 'Fill in *Form 2*. If the licence was lost, keep a copy of the police report (FIR) if your state asks for it. Type *sheet* for your details ready to copy.',
          hi: '*Form 2* भरें। लाइसेंस खोया हो तो अगर आपका राज्य माँगे तो पुलिस रिपोर्ट (FIR) की कॉपी रखें। जानकारी कॉपी करने के लिए *sheet* लिखें।',
        },
        {
          en: 'Upload your photo and signature and any document the site asks for. Book a slot if the state needs one.',
          hi: 'अपनी फोटो, हस्ताक्षर और साइट जो दस्तावेज़ माँगे वह अपलोड करें। राज्य में ज़रूरी हो तो स्लॉट बुक करें।',
        },
        { en: 'Pay under *Fee Payments*, then print the receipt.', hi: '*Fee Payments* में भुगतान करें और रसीद प्रिंट करें।' },
        {
          en: 'Track with *Application Status*. Use *Track Dispatch Article Status* under *Others* to follow the post.',
          hi: '*Application Status* से स्टेटस देखें। डाक की स्थिति के लिए *Others* में *Track Dispatch Article Status* इस्तेमाल करें।',
        },
      ],
    },
  },
  docs: {
    en:
      'For a licence renewal you usually need:\n' +
      '• Your existing driving licence (number and date of birth)\n' +
      '• Form 2 (filled online on Sarathi)\n' +
      '• Form 1: self-declaration of physical fitness\n' +
      '• Form 1A: medical certificate from a registered doctor. Needed for transport vehicles and, as one official page says, if you are over 40\n' +
      '• Passport-size photo and signature\n' +
      'For a duplicate: Form 2 plus the damaged licence, or a photocopy or FIR if it was lost. Your state may ask for more.',
    hi:
      'लाइसेंस रिन्यूअल के लिए आमतौर पर चाहिए:\n' +
      '• आपका मौजूदा ड्राइविंग लाइसेंस (नंबर और जन्मतिथि)\n' +
      '• Form 2 (Sarathi पर ऑनलाइन भरा जाता है)\n' +
      '• Form 1: सेहत का स्वयं-घोषणा पत्र\n' +
      '• Form 1A: पंजीकृत डॉक्टर का मेडिकल सर्टिफिकेट। ट्रांसपोर्ट वाहन के लिए और, एक सरकारी पेज के अनुसार, 40 साल से ऊपर की उम्र में चाहिए\n' +
      '• पासपोर्ट साइज़ फोटो और हस्ताक्षर\n' +
      'डुप्लीकेट के लिए: Form 2 के साथ खराब लाइसेंस, या खोने पर फोटोकॉपी या FIR। आपका राज्य और कुछ माँग सकता है।',
  },
  fee: {
    en: 'The central fee list shows ₹200 for renewal, ₹300 for late renewal plus ₹1,000 for each year or part after the first year, and ₹500 to add a vehicle class. States add their own user charges, smart-card and postage costs, so the payment screen shows the final amount. The duplicate fee is only shown on the payment screen.',
    hi: 'केंद्रीय फीस सूची में रिन्यूअल ₹200, देर से रिन्यूअल ₹300 और पहले साल के बाद हर साल या हिस्से के लिए ₹1,000, और नई वाहन श्रेणी जोड़ने के ₹500 हैं। राज्य अपने यूज़र चार्ज, स्मार्ट कार्ड और डाक का खर्च जोड़ते हैं, इसलिए अंतिम रकम भुगतान स्क्रीन पर दिखती है। डुप्लीकेट की फीस सिर्फ भुगतान स्क्रीन पर दिखती है।',
  },
  after: {
    en: 'Want a reminder before your next expiry? Type *remind*.',
    hi: 'अगली एक्सपायरी से पहले रिमाइंडर चाहिए? *remind* लिखें।',
  },
  sheetName: { en: 'driving licence', hi: 'ड्राइविंग लाइसेंस' },
  sheet: ['full_name', 'dob', 'father_name', 'address', 'pincode', 'mobile'],
  self: {
    en: 'the licence number, any OTP or captcha, the doctor-signed Form 1A, the declarations, the payment and any RTO visit',
    hi: 'लाइसेंस नंबर, OTP या कैप्चा, डॉक्टर के साइन वाला Form 1A, घोषणाएँ, भुगतान और RTO की कोई भी विज़िट',
  },
  sites: ['sarathi.parivahan.gov.in', 'parivahan.gov.in', 'mParivahan app'],
  facts: [
    'Renewal is on sarathi.parivahan.gov.in for holders of a permanent licence from a Sarathi-enabled state. In other cases go to the RTO in person.',
    'The parivahan FAQ says renewal can be done within one year before or one year after expiry. Beyond that a driving test or possibly a fresh learner licence may be needed as per state policy. Some state pages still use older wording about a grace period, so say state rules can differ and to check the state portal.',
    'Central fee list: renewal Rs 200; late renewal Rs 300 plus Rs 1000 for each year or part after the first year; change of address Rs 200; add a class Rs 500. State charges are extra.',
    'Renewal needs no NOC to renew in another state (parivahan FAQ). Select the RTO of your last transaction or the nearest RTO.',
  ],
  unverified: ['state-specific rules and fees (states add charges)', 'the fee schedule text comes from the 2021 rules, not a 2026 page', 'whether Form 1A applies at 40+ for every class', 'whether a photo upload or RTO visit is compulsory in every state', 'duplicate licence fee amount'],
  remind: ['dl'],
};
dl.routes.late.steps = dl.routes.renew.steps.map((s, i) =>
  i === 4
    ? {
        en: 'Book the RTO appointment. For a licence this old, expect to visit the RTO and possibly take a driving test. Ask your RTO which applies.',
        hi: 'RTO का अपॉइंटमेंट बुक करें। इतने पुराने लाइसेंस के लिए RTO जाना और शायद ड्राइविंग टेस्ट देना पड़ेगा। अपने RTO से पूछें कि आप पर क्या लागू है।',
      }
    : s,
);

// ---------------------------------------------------------------- Aadhaar update
const aadhaar = {
  id: 'aadhaar',
  name: { en: 'Aadhaar update', hi: 'आधार अपडेट' },
  blurb: { en: 'Address, name, DOB, mobile, biometrics', hi: 'पता, नाम, जन्मतिथि, मोबाइल, बायोमेट्रिक' },
  intake: [
    opts('what', 'What do you want to update?', 'आप क्या अपडेट करना चाहते हैं?', [
      ['doc', 'Address / documents', 'पता / दस्तावेज़'],
      ['centre', 'Name, DOB, biometric', 'नाम/DOB/बायोमेट्रिक'],
      ['mob', 'Mobile or email', 'मोबाइल या ईमेल'],
    ]),
  ],
  pick: (a) => ({ route: a.what === 'doc' ? 'online' : a.what === 'mob' ? 'mobile' : 'centre' }),
  routes: {
    online: {
      intro: {
        en: 'You can update your *address* (and upload identity or address documents) online on myAadhaar, {n} steps. Document update is *free* on the portal until 14 June 2027. It only works if your Aadhaar has a registered mobile number, because the OTP goes there.{note}',
        hi: 'आप myAadhaar पर ऑनलाइन अपना *पता* अपडेट कर सकते हैं (और पहचान या पते के दस्तावेज़ अपलोड कर सकते हैं), {n} स्टेप। पोर्टल पर डॉक्यूमेंट अपडेट 14 जून 2027 तक *मुफ्त* है। यह तभी चलेगा जब आपके आधार में मोबाइल नंबर दर्ज हो, क्योंकि OTP वहीं आता है।{note}',
      },
      steps: [
        { en: 'Open *myaadhaar.uidai.gov.in* and tap *Login*.', hi: '*myaadhaar.uidai.gov.in* खोलें और *Login* दबाएँ।' },
        {
          en: 'Type your 12-digit Aadhaar number and the captcha, then tap *Send OTP*. Type the OTP that comes to your registered mobile, on the site only.',
          hi: 'अपना 12 अंकों का आधार नंबर और कैप्चा डालें, फिर *Send OTP* दबाएँ। आपके रजिस्टर्ड मोबाइल पर आया OTP सिर्फ वेबसाइट पर डालें।',
        },
        {
          en: 'Open *Update Aadhaar* (Document Update). Check the name and address shown, and choose what to change.',
          hi: '*Update Aadhaar* (Document Update) खोलें। दिख रहा नाम और पता जाँचें और चुनें कि क्या बदलना है।',
        },
        {
          en: 'Upload clear scans of your *Proof of Identity* and *Proof of Address*. Type *docs* to see what is accepted. Type *sheet* for your details ready to copy.',
          hi: 'अपने *पहचान प्रमाण* और *पते के प्रमाण* के साफ स्कैन अपलोड करें। क्या मान्य है यह देखने के लिए *docs* लिखें। जानकारी कॉपी करने के लिए *sheet* लिखें।',
        },
        {
          en: 'Submit and save your *Service Request Number*. Track it at *myaadhaar.uidai.gov.in/CheckAadhaarStatus*.',
          hi: 'सबमिट करें और अपना *Service Request Number* सुरक्षित रखें। *myaadhaar.uidai.gov.in/CheckAadhaarStatus* पर ट्रैक करें।',
        },
        {
          en: 'You get an SMS when it is done. Then log in again and choose *Download Aadhaar* to get your updated e-Aadhaar.',
          hi: 'काम पूरा होने पर SMS आएगा। फिर दोबारा लॉगिन करके *Download Aadhaar* चुनें और अपडेटेड e-Aadhaar पाएँ।',
        },
      ],
    },
    centre: {
      intro: {
        en: 'Name, date of birth, gender, photo and fingerprints or iris can be changed only at an *Aadhaar Seva Kendra*, {n} steps. There is a limit: name twice in a lifetime, date of birth and gender once each.{note}',
        hi: 'नाम, जन्मतिथि, लिंग, फोटो और फिंगरप्रिंट या आँखों का स्कैन सिर्फ *आधार सेवा केंद्र* पर बदले जा सकते हैं, {n} स्टेप। एक सीमा है: नाम जीवन में दो बार, जन्मतिथि और लिंग एक-एक बार।{note}',
      },
      steps: [
        {
          en: 'Book a slot at *bookappointment.uidai.gov.in* (free, any Seva Kendra). You can also walk in: centres open 9:30am to 5:30pm, 7 days a week.',
          hi: '*bookappointment.uidai.gov.in* पर स्लॉट बुक करें (मुफ्त, किसी भी सेवा केंद्र में)। बिना बुकिंग भी जा सकते हैं: केंद्र सुबह 9:30 से शाम 5:30 तक, हफ्ते के सातों दिन खुलते हैं।',
        },
        {
          en: 'Take your originals. Type *docs* for the list. For a date-of-birth change you must bring proof of date of birth.',
          hi: 'अपने मूल दस्तावेज़ ले जाएँ। सूची के लिए *docs* लिखें। जन्मतिथि बदलने के लिए जन्मतिथि का प्रमाण ज़रूर ले जाएँ।',
        },
        {
          en: 'At the centre, fill the update form (the operator can help), and give your fingerprints, iris or photo if needed. Type *sheet* first so your details are ready.',
          hi: 'केंद्र पर अपडेट फॉर्म भरें (ऑपरेटर मदद करेगा), और ज़रूरत हो तो फिंगरप्रिंट, आँखों का स्कैन या फोटो दें। पहले *sheet* लिख लें ताकि जानकारी तैयार रहे।',
        },
        {
          en: 'Pay the fee if any: ₹75 for a demographic update on its own, ₹125 for a biometric update (a demographic update done together with a biometric one is free). Ask for a receipt with your *Update Request Number*.',
          hi: 'फीस लगे तो दें: सिर्फ डेमोग्राफिक अपडेट के ₹75, बायोमेट्रिक अपडेट के ₹125 (बायोमेट्रिक के साथ किया गया डेमोग्राफिक अपडेट मुफ्त है)। अपने *Update Request Number* वाली रसीद माँगें।',
        },
        {
          en: 'Track with that number on *myaadhaar.uidai.gov.in/CheckAadhaarStatus*. Then download your updated e-Aadhaar from myAadhaar.',
          hi: 'उसी नंबर से *myaadhaar.uidai.gov.in/CheckAadhaarStatus* पर ट्रैक करें। फिर myAadhaar से अपडेटेड e-Aadhaar डाउनलोड करें।',
        },
      ],
    },
    mobile: {
      intro: {
        en: 'For a *mobile number*, the safest way is a visit to an Aadhaar Seva Kendra, and it is the only way if no number is registered yet. If a number is already registered, UIDAI says the Aadhaar app can update it with an OTP and face check, and email updates are free there until 31 December 2026. {n} steps.{note}',
        hi: '*मोबाइल नंबर* के लिए सबसे पक्का तरीका आधार सेवा केंद्र जाना है, और अगर अभी कोई नंबर दर्ज नहीं है तो यही एकमात्र तरीका है। अगर नंबर पहले से दर्ज है तो UIDAI के अनुसार Aadhaar ऐप से OTP और चेहरे की जाँच के साथ अपडेट हो सकता है, और वहाँ ईमेल अपडेट 31 दिसंबर 2026 तक मुफ्त है। {n} स्टेप।{note}',
      },
      steps: [
        {
          en: 'If a mobile number is already registered, open the official *Aadhaar app* and look for the mobile number or email update. It asks for an OTP and a face check.',
          hi: 'अगर कोई मोबाइल नंबर पहले से दर्ज है तो सरकारी *Aadhaar ऐप* खोलें और मोबाइल नंबर या ईमेल अपडेट खोजें। इसमें OTP और चेहरे की जाँच होती है।',
        },
        {
          en: 'If no number is registered, or the app does not work for you, book a slot at *bookappointment.uidai.gov.in* or walk in to a Seva Kendra.',
          hi: 'अगर कोई नंबर दर्ज नहीं है, या ऐप आपके लिए काम नहीं करता, तो *bookappointment.uidai.gov.in* पर स्लॉट बुक करें या सेवा केंद्र में सीधे जाएँ।',
        },
        {
          en: 'At the centre, tell the operator the new mobile number. The fee is ₹75 for a demographic update on its own. Ask for the receipt with your *Update Request Number*.',
          hi: 'केंद्र पर ऑपरेटर को नया मोबाइल नंबर बताएँ। सिर्फ डेमोग्राफिक अपडेट की फीस ₹75 है। अपने *Update Request Number* वाली रसीद माँगें।',
        },
        {
          en: 'Track with the number at *myaadhaar.uidai.gov.in/CheckAadhaarStatus*.',
          hi: 'उसी नंबर से *myaadhaar.uidai.gov.in/CheckAadhaarStatus* पर ट्रैक करें।',
        },
      ],
    },
  },
  docs: {
    en:
      'Aadhaar updates need proof documents:\n' +
      '• *Proof of Identity*: a document with your photo and name\n' +
      '• *Proof of Address*: a document showing where you live now\n' +
      '• *Proof of Date of Birth*: compulsory when you change your date of birth\n' +
      'At a centre, take originals; they are scanned and returned. Online, upload clear scans. The full accepted list is on uidai.gov.in.',
    hi:
      'आधार अपडेट के लिए प्रमाण दस्तावेज़ चाहिए:\n' +
      '• *पहचान प्रमाण*: फोटो और नाम वाला दस्तावेज़\n' +
      '• *पते का प्रमाण*: वह दस्तावेज़ जिसमें आपका मौजूदा पता हो\n' +
      '• *जन्मतिथि का प्रमाण*: जन्मतिथि बदलते समय ज़रूरी\n' +
      'केंद्र पर मूल दस्तावेज़ ले जाएँ; वे स्कैन होकर लौटा दिए जाते हैं। ऑनलाइन साफ स्कैन अपलोड करें। मान्य दस्तावेज़ों की पूरी सूची uidai.gov.in पर है।',
  },
  fee: {
    en: 'Document update on the myAadhaar portal is free until 14 June 2027. At a centre: ₹75 for a document or demographic update, ₹125 for a biometric update (a demographic update done together with a biometric one is free). The UIDAI home page says the mandatory biometric update is free for ages 5 to 17 until 30 September 2027, but an older fee sheet said 7 to 15 only until 30 September 2026. Check the myAadhaar page before you pay.',
    hi: 'myAadhaar पोर्टल पर डॉक्यूमेंट अपडेट 14 जून 2027 तक मुफ्त है। केंद्र पर: डॉक्यूमेंट या डेमोग्राफिक अपडेट ₹75, बायोमेट्रिक अपडेट ₹125 (बायोमेट्रिक के साथ किया गया डेमोग्राफिक अपडेट मुफ्त है)। UIDAI के होम पेज के अनुसार 5 से 17 साल के बच्चों का अनिवार्य बायोमेट्रिक अपडेट 30 सितंबर 2027 तक मुफ्त है, पर पुरानी फीस शीट में 7 से 15 साल के लिए सिर्फ 30 सितंबर 2026 तक लिखा था। भुगतान से पहले myAadhaar पेज देख लें।',
  },
  after: { en: 'Keep your request number until the update shows.', hi: 'अपडेट दिखने तक अपना रिक्वेस्ट नंबर रखें।' },
  sheetName: { en: 'Aadhaar update', hi: 'आधार अपडेट' },
  sheet: ['full_name', 'dob', 'gender', 'address', 'pincode', 'mobile', 'email'],
  self: {
    en: 'the Aadhaar number, the captcha, the OTP, uploading your documents, the payment and any centre visit',
    hi: 'आधार नंबर, कैप्चा, OTP, दस्तावेज़ अपलोड करना, भुगतान और केंद्र की कोई भी विज़िट',
  },
  sites: ['myaadhaar.uidai.gov.in', 'uidai.gov.in', 'bookappointment.uidai.gov.in'],
  facts: [
    'Online on myAadhaar (Aadhaar number + OTP to the registered mobile): document update (proof of identity or address). Free until 14 June 2027 per a UIDAI order dated 13 May 2026.',
    'Only at an Aadhaar Seva Kendra: biometrics (fingerprints, iris, photo), name, gender, date of birth, local language, and a first-time mobile number.',
    'Limits: name 2 updates in a lifetime, gender 1, date of birth 1. Address and mobile have no limit.',
    'Fees at a centre: demographic or document update Rs 75; biometric update Rs 125; demographic together with biometric is free. UIDAI home page: mandatory biometric update free for ages 5-17 until 30 September 2027. An older fee sheet said ages 7-15 free only until 30 September 2026. The two disagree, so say to check the myAadhaar page. Email update in the Aadhaar app is free until 31 December 2026.',
    'Appointments: bookappointment.uidai.gov.in, free, max 2 appointments per person per month. Centres open 9:30 to 17:30, 7 days. Help line 1947.',
    'The e-Aadhaar can be downloaded on myaadhaar.uidai.gov.in with Aadhaar and OTP and has the same validity as the original.',
  ],
  unverified: ['the exact menu labels on myaadhaar.uidai.gov.in (the site could not be opened)', 'whether name, DOB or gender can be changed online today (assume a centre visit)', 'which free window for children applies (the UIDAI home page says 5-17 until 30 September 2027, an older fee sheet said 7-15 until 30 September 2026)'],
};

// ---------------------------------------------------------------- Voter ID
const voter = {
  id: 'voter',
  name: { en: 'Voter ID', hi: 'वोटर ID' },
  blurb: { en: 'New voter, correction, download e-EPIC', hi: 'नया वोटर, सुधार, e-EPIC डाउनलोड' },
  intake: [
    opts('what', 'What do you need?', 'आपको क्या चाहिए?', [
      ['new', 'New voter (18+)', 'नया वोटर (18+)'],
      ['fix', 'Correct / shifted', 'सुधार / पता बदला'],
      ['get', 'Download or track', 'डाउनलोड या ट्रैक'],
    ]),
  ],
  pick: (a) => ({ route: a.what === 'fix' ? 'fix' : a.what === 'get' ? 'get' : 'new' }),
  routes: {
    new: {
      intro: {
        en: 'To be enrolled as a new voter you fill *Form 6* on the Voters\' Services Portal or the Voter Helpline app, {n} steps. You must be an Indian citizen, live in the constituency and be 18. If you are 17 you can apply in advance. Election Commission pages list no fee.{note}',
        hi: 'नए वोटर के रूप में नाम जुड़वाने के लिए Voters\' Services Portal या Voter Helpline ऐप पर *Form 6* भरना होता है, {n} स्टेप। आप भारतीय नागरिक हों, उसी निर्वाचन क्षेत्र में रहते हों और 18 साल के हों। 17 साल के हों तो पहले से आवेदन कर सकते हैं। चुनाव आयोग के पेज पर कोई फीस नहीं लिखी।{note}',
      },
      steps: [
        {
          en: 'Open *voters.eci.gov.in* (or install the *Voter Helpline* app). Log in with your mobile number and the OTP. Create an account if you are new.',
          hi: '*voters.eci.gov.in* खोलें (या *Voter Helpline* ऐप इंस्टॉल करें)। अपने मोबाइल नंबर और OTP से लॉगिन करें। नए हों तो अकाउंट बनाएँ।',
        },
        {
          en: 'Choose *Register as a new voter* (Form 6).',
          hi: '*Register as a new voter* (Form 6) चुनें।',
        },
        {
          en: 'Fill in your name, your relative\'s name, date of birth, gender and address. Adding Aadhaar is optional. Type *sheet* to get your details ready to copy.',
          hi: 'अपना नाम, रिश्तेदार का नाम, जन्मतिथि, लिंग और पता भरें। आधार जोड़ना ज़रूरी नहीं है। जानकारी कॉपी करने के लिए *sheet* लिखें।',
        },
        {
          en: 'Upload a colour passport photo (white background, face straight, 4.5 x 3.5 cm), one age proof and one address proof. Type *docs* for what is accepted.',
          hi: 'रंगीन पासपोर्ट फोटो (सफेद बैकग्राउंड, चेहरा सीधा, 4.5 x 3.5 सेमी), एक उम्र का प्रमाण और एक पते का प्रमाण अपलोड करें। क्या मान्य है यह देखने के लिए *docs* लिखें।',
        },
        {
          en: 'Sign the declaration and submit. Save your *reference number*. A booth-level officer may visit to check your address.',
          hi: 'घोषणा पर हस्ताक्षर करके सबमिट करें। अपना *रेफरेंस नंबर* सुरक्षित रखें। आपका पता जाँचने के लिए बूथ-स्तर का अधिकारी आ सकता है।',
        },
        {
          en: 'Track with *Track Application Status*. When your name is on the roll, download your digital card with *Download e-EPIC*.',
          hi: '*Track Application Status* से ट्रैक करें। नाम सूची में आ जाए तो *Download e-EPIC* से अपना डिजिटल कार्ड डाउनलोड करें।',
        },
      ],
    },
    fix: {
      intro: {
        en: 'To correct details, shift your address, replace a lost card or mark a disability, you fill *Form 8* on the same portal or app, {n} steps.{note}',
        hi: 'जानकारी सुधारने, पता बदलने, खोया कार्ड बदलवाने या दिव्यांगता दर्ज करने के लिए उसी पोर्टल या ऐप पर *Form 8* भरें, {n} स्टेप।{note}',
      },
      steps: [
        {
          en: 'Open *voters.eci.gov.in* or the *Voter Helpline* app and log in with your mobile number and OTP.',
          hi: '*voters.eci.gov.in* या *Voter Helpline* ऐप खोलें और मोबाइल नंबर व OTP से लॉगिन करें।',
        },
        {
          en: 'Choose *Form 8* (shifting of residence, correction of entries, replacement EPIC, or marking a disability). Type your *EPIC number* and pick what you want.',
          hi: '*Form 8* चुनें (पता बदलना, प्रविष्टि सुधार, EPIC बदलवाना, या दिव्यांगता दर्ज करना)। अपना *EPIC नंबर* डालें और चुनें कि आपको क्या करना है।',
        },
        {
          en: 'Type the correct details. You can correct up to 4 items in one form. Type *sheet* for your details ready to copy.',
          hi: 'सही जानकारी डालें। एक फॉर्म में अधिकतम 4 चीज़ें सुधार सकते हैं। जानकारी कॉपी करने के लिए *sheet* लिखें।',
        },
        {
          en: 'Upload proof for each change (type *docs*). For a lost card, keep the FIR or police report copy. Upload a new photo only if the photo is changing.',
          hi: 'हर बदलाव का प्रमाण अपलोड करें (*docs* लिखें)। खोया कार्ड हो तो FIR या पुलिस रिपोर्ट की कॉपी रखें। फोटो बदलनी हो तभी नई फोटो अपलोड करें।',
        },
        {
          en: 'Submit and save the *reference number*. Track it with *Track Application Status*.',
          hi: 'सबमिट करें और *रेफरेंस नंबर* सुरक्षित रखें। *Track Application Status* से ट्रैक करें।',
        },
      ],
    },
    get: {
      intro: {
        en: 'You can check your name, track an application and download your digital voter card (e-EPIC), {n} steps. Voter helpline: 1950.{note}',
        hi: 'आप अपना नाम देख सकते हैं, आवेदन ट्रैक कर सकते हैं और अपना डिजिटल वोटर कार्ड (e-EPIC) डाउनलोड कर सकते हैं, {n} स्टेप। वोटर हेल्पलाइन: 1950।{note}',
      },
      steps: [
        {
          en: 'To check your name on the roll, your polling station and your booth officer, open *electoralsearch.eci.gov.in*.',
          hi: 'मतदाता सूची में अपना नाम, मतदान केंद्र और बूथ अधिकारी देखने के लिए *electoralsearch.eci.gov.in* खोलें।',
        },
        {
          en: 'To track an application, open *voters.eci.gov.in*, log in, choose *Track Application Status* and type your reference number.',
          hi: 'आवेदन ट्रैक करने के लिए *voters.eci.gov.in* खोलें, लॉगिन करें, *Track Application Status* चुनें और रेफरेंस नंबर डालें।',
        },
        {
          en: 'To download your card, log in and choose *Download Voter ID (e-EPIC)*. You may need an OTP on your registered mobile, and possibly a face check if no mobile is linked.',
          hi: 'अपना कार्ड डाउनलोड करने के लिए लॉगिन करें और *Download Voter ID (e-EPIC)* चुनें। आपके रजिस्टर्ड मोबाइल पर OTP लग सकता है, और मोबाइल जुड़ा न हो तो चेहरे की जाँच भी।',
        },
      ],
    },
  },
  docs: {
    en:
      'For a new voter (Form 6) you usually need:\n' +
      '• A colour passport photo, plain white background, 4.5 x 3.5 cm\n' +
      '• *One age proof*: birth certificate, Aadhaar, PAN, driving licence, Class 10 or 12 certificate with your date of birth, or passport\n' +
      '• *One address proof*: a utility bill (up to a year old), Aadhaar, bank passbook, passport, land record, or a registered rent or sale deed. It can be a parent\'s or spouse\'s if they are enrolled at that address\n' +
      'Aadhaar is optional. Your mobile number is needed for the OTP. For a correction (Form 8), add your EPIC number and proof for the item you change.',
    hi:
      'नए वोटर (Form 6) के लिए आमतौर पर चाहिए:\n' +
      '• रंगीन पासपोर्ट फोटो, सादा सफेद बैकग्राउंड, 4.5 x 3.5 सेमी\n' +
      '• *उम्र का एक प्रमाण*: जन्म प्रमाणपत्र, आधार, PAN, ड्राइविंग लाइसेंस, 10वीं या 12वीं का सर्टिफिकेट जिसमें जन्मतिथि हो, या पासपोर्ट\n' +
      '• *पते का एक प्रमाण*: बिजली-पानी आदि का बिल (एक साल तक पुराना), आधार, बैंक पासबुक, पासपोर्ट, ज़मीन का रिकॉर्ड, या रजिस्टर्ड किराया या बिक्री का दस्तावेज़। अगर माता-पिता या जीवनसाथी उसी पते पर वोटर हैं तो उनका भी चलेगा\n' +
      'आधार वैकल्पिक है। OTP के लिए आपका मोबाइल नंबर चाहिए। सुधार (Form 8) के लिए EPIC नंबर और जो चीज़ बदल रहे हैं उसका प्रमाण जोड़ें।',
  },
  fee: {
    en: 'The Election Commission says Form 6 is free at the election offices, and its pages show no fee for the other forms. No page says the card itself is free, so if any site or agent asks you for money, stop and check with the helpline 1950.',
    hi: 'चुनाव आयोग के अनुसार Form 6 चुनाव कार्यालयों में मुफ्त है, और बाकी फॉर्म पर कोई फीस नहीं लिखी। कार्ड मुफ्त है यह कहीं साफ नहीं लिखा, इसलिए कोई साइट या एजेंट पैसे माँगे तो रुकें और हेल्पलाइन 1950 से पूछें।',
  },
  after: { en: 'Save your reference number.', hi: 'अपना रेफरेंस नंबर सुरक्षित रखें।' },
  sheetName: { en: 'voter ID application', hi: 'वोटर ID आवेदन' },
  sheet: ['full_name', 'father_name', 'dob', 'gender', 'address', 'pincode', 'mobile'],
  self: {
    en: 'the mobile OTP, the captcha, your photo and documents, the signed declaration and any face check',
    hi: 'मोबाइल OTP, कैप्चा, आपकी फोटो और दस्तावेज़, हस्ताक्षर की हुई घोषणा और चेहरे की कोई भी जाँच',
  },
  sites: ['voters.eci.gov.in', 'electoralsearch.eci.gov.in', 'Voter Helpline app', 'helpline 1950'],
  facts: [
    'New voter: Form 6 on voters.eci.gov.in or the Voter Helpline app. Indian citizen, ordinarily resident in the constituency, 18 on a qualifying date (1 Jan, 1 Apr, 1 Jul or 1 Oct). 17-year-olds can apply in advance. NRIs use Form 6A. Form 7 is for objections or deletion.',
    'Correction, shifting, replacement EPIC or marking a disability: Form 8, up to 4 items per form.',
    'Check name and polling station: electoralsearch.eci.gov.in. Download e-EPIC and track status on voters.eci.gov.in. Helpline 1950.',
  ],
  unverified: ['exact button labels on voters.eci.gov.in (the site blocks automated access)', 'that the card itself is free (only Form 6 is stated as free)', 'the e-EPIC download steps'],
};

// ---------------------------------------------------------------- Passport
const passportSteps = (mode) => [
  {
    en: 'Open *passportindia.gov.in* (Passport Seva) and tap *Register Now*. Make a User ID; an email ID is compulsory. Then log in with your User ID, password and captcha.',
    hi: '*passportindia.gov.in* (Passport Seva) खोलें और *Register Now* दबाएँ। यूज़र ID बनाएँ; ईमेल ID देना ज़रूरी है। फिर यूज़र ID, पासवर्ड और कैप्चा से लॉगिन करें।',
  },
  {
    en: 'Choose *Apply for Fresh Passport / Re-issue of Passport*. Fill in the online form and submit it. Type *sheet* to get your details ready to copy.',
    hi: '*Apply for Fresh Passport / Re-issue of Passport* चुनें। ऑनलाइन फॉर्म भरकर सबमिट करें। जानकारी कॉपी करने के लिए *sheet* लिखें।',
  },
  mode === 'fresh'
    ? {
        en: 'Pick the *booklet* (36 or 60 pages) and, if you are in a hurry, *Tatkaal*. Tatkaal costs extra and is not allowed for some cases (for example name changes and citizens by registration). Check the fee with the portal\'s *Fee Calculator*.',
        hi: '*बुकलेट* (36 या 60 पन्ने) चुनें और जल्दी हो तो *तत्काल* चुनें। तत्काल में अलग फीस लगती है और कुछ मामलों में मना है (जैसे नाम बदलना और रजिस्ट्रेशन से बने नागरिक)। फीस पोर्टल के *Fee Calculator* से देखें।',
      }
    : {
        en: 'For a renewal or a lost or damaged passport, state your reason on the form, and have your *old passport* ready. Pick the *booklet* (36 or 60 pages) and, if you are in a hurry, *Tatkaal*. Check the fee with the portal\'s *Fee Calculator*.',
        hi: 'रिन्यूअल या खोए या खराब पासपोर्ट के लिए फॉर्म में कारण लिखें और अपना *पुराना पासपोर्ट* तैयार रखें। *बुकलेट* (36 या 60 पन्ने) चुनें और जल्दी हो तो *तत्काल* चुनें। फीस पोर्टल के *Fee Calculator* से देखें।',
      },
  {
    en: 'Open *View Saved/Submitted Applications*, select your application and tap *Pay and Schedule Appointment*. Choose your Passport Seva Kendra (PSK / POPSK), pick a date, and pay online.',
    hi: '*View Saved/Submitted Applications* खोलें, अपना आवेदन चुनें और *Pay and Schedule Appointment* दबाएँ। अपना पासपोर्ट सेवा केंद्र (PSK / POPSK) चुनें, तारीख लें और ऑनलाइन भुगतान करें।',
  },
  {
    en: 'Print the *Application Receipt* (it shows your ARN) or keep the appointment SMS.',
    hi: '*Application Receipt* प्रिंट करें (उसमें आपका ARN होता है) या अपॉइंटमेंट का SMS रखें।',
  },
  {
    en: 'Go to the PSK on your slot with your *original documents* and one self-attested photocopy of each. The applicant must be there. Type *docs* for the list.',
    hi: 'अपने स्लॉट पर PSK जाएँ, *मूल दस्तावेज़* और हर एक की एक स्व-सत्यापित फोटोकॉपी के साथ। आवेदक का खुद वहाँ होना ज़रूरी है। सूची के लिए *docs* लिखें।',
  },
  {
    en: 'At the PSK you go through a security check, then Counter A (photo, fingerprints, documents scanned), Counter B (documents checked) and Counter C (approval). Keep the *Acknowledgement Letter* you get at the exit.',
    hi: 'PSK पर सुरक्षा जाँच के बाद Counter A (फोटो, फिंगरप्रिंट, दस्तावेज़ स्कैन), Counter B (दस्तावेज़ों की जाँच) और Counter C (मंज़ूरी) से गुज़रना होता है। निकलते समय मिलने वाला *Acknowledgement Letter* रखें।',
  },
  {
    en: 'Track your application on passportindia.gov.in with the file number from the letter, or call *1800-258-1800*. The police may verify your address before or after the passport is issued.',
    hi: 'पत्र में दिए फाइल नंबर से passportindia.gov.in पर अपना आवेदन ट्रैक करें, या *1800-258-1800* पर कॉल करें। पासपोर्ट जारी होने से पहले या बाद में पुलिस आपके पते की जाँच कर सकती है।',
  },
];

const passport = {
  id: 'passport',
  name: { en: 'Passport', hi: 'पासपोर्ट' },
  blurb: { en: 'Fresh, renewal, lost or damaged', hi: 'नया, रिन्यूअल, खोया या खराब' },
  intake: [
    opts('what', 'What do you need?', 'आपको क्या चाहिए?', [
      ['fresh', 'First passport', 'पहला पासपोर्ट'],
      ['renew', 'Renew / reissue', 'रिन्यू / रीइश्यू'],
      ['lost', 'Lost or damaged', 'खोया या खराब'],
    ]),
    yn('minor', 'Is the applicant under 18?', 'क्या आवेदक 18 साल से कम का है?'),
  ],
  pick: (a) => ({
    route: a.what === 'fresh' ? 'fresh' : a.what === 'lost' ? 'lost' : 'renew',
    note:
      a.minor === 'y'
        ? {
            en: '\nFor a child under 18 both parents sign a declaration (or one parent signs and a separate declaration explains why the other did not), and a copy of a parent\'s passport is needed. One-parent and complex cases can take about 30 days. Under 15 the passport is valid for 5 years or until age 18.',
            hi: '\n18 साल से कम के बच्चे के लिए दोनों माता-पिता एक घोषणा पर हस्ताक्षर करते हैं (या एक अभिभावक साइन करता है और अलग घोषणा में बताता है कि दूसरे ने क्यों नहीं किया), और माता-पिता में से किसी के पासपोर्ट की कॉपी चाहिए। एक अभिभावक वाले और जटिल मामलों में करीब 30 दिन लग सकते हैं। 15 साल से कम उम्र में पासपोर्ट 5 साल या 18 साल की उम्र तक वैध होता है।',
          }
        : undefined,
  }),
  routes: {
    fresh: {
      intro: {
        en: 'A *first passport* is applied for on Passport Seva and finished with a visit to a Passport Seva Kendra, {n} steps.{note}',
        hi: '*पहले पासपोर्ट* का आवेदन Passport Seva पर होता है और पासपोर्ट सेवा केंद्र की विज़िट से पूरा होता है, {n} स्टेप।{note}',
      },
      steps: passportSteps('fresh'),
    },
    renew: {
      intro: {
        en: 'A *renewal or reissue* is applied for on Passport Seva and finished with a visit to a Passport Seva Kendra, {n} steps.{note}',
        hi: '*रिन्यूअल या रीइश्यू* का आवेदन Passport Seva पर होता है और पासपोर्ट सेवा केंद्र की विज़िट से पूरा होता है, {n} स्टेप।{note}',
      },
      steps: passportSteps('renew'),
    },
    lost: {
      intro: {
        en: 'For a *lost, stolen or damaged passport* you apply for a reissue on Passport Seva, {n} steps. The fee is higher than a normal renewal. Report a lost or stolen passport to the police first.{note}',
        hi: '*खोए, चोरी हुए या खराब पासपोर्ट* के लिए Passport Seva पर रीइश्यू का आवेदन करें, {n} स्टेप। फीस सामान्य रिन्यूअल से ज़्यादा है। खोया या चोरी हुआ पासपोर्ट पहले पुलिस को रिपोर्ट करें।{note}',
      },
      steps: passportSteps('lost'),
    },
  },
  docs: {
    en:
      'For a *first passport* (originals plus one self-attested photocopy):\n' +
      '• *Address proof*: Aadhaar, electricity, water or gas bill, postpaid or landline bill, rent agreement, voter ID, bank passbook, or a parent\'s or spouse\'s passport copy\n' +
      '• *Date-of-birth proof*: birth certificate, school leaving or Class 10 certificate, PAN, driving licence, voter ID or insurance policy bond\n' +
      '• A photo is taken at the PSK\n' +
      'For a *renewal*: your old passport, plus a self-attested copy of its first two and last two pages and any observation or extension page. Address proof only if your address changed. A name change needs extra proof such as a marriage certificate or a gazette notification.\n' +
      'A child under 18 also needs a parent\'s passport copy and the parents\' declaration.',
    hi:
      '*पहले पासपोर्ट* के लिए (मूल दस्तावेज़ और एक स्व-सत्यापित फोटोकॉपी):\n' +
      '• *पते का प्रमाण*: आधार, बिजली, पानी या गैस का बिल, पोस्टपेड या लैंडलाइन बिल, किराया समझौता, वोटर ID, बैंक पासबुक, या माता-पिता या जीवनसाथी के पासपोर्ट की कॉपी\n' +
      '• *जन्मतिथि का प्रमाण*: जन्म प्रमाणपत्र, स्कूल लीविंग या 10वीं का सर्टिफिकेट, PAN, ड्राइविंग लाइसेंस, वोटर ID या बीमा पॉलिसी बॉन्ड\n' +
      '• फोटो PSK पर ही ली जाती है\n' +
      '*रिन्यूअल* के लिए: आपका पुराना पासपोर्ट, और उसके पहले दो और आखिरी दो पन्नों की तथा किसी भी observation या extension पन्ने की स्व-सत्यापित कॉपी। पता बदला हो तभी पते का प्रमाण। नाम बदलने पर विवाह प्रमाणपत्र या गज़ट अधिसूचना जैसा अतिरिक्त प्रमाण चाहिए।\n' +
      '18 साल से कम के बच्चे के लिए माता-पिता के पासपोर्ट की कॉपी और माता-पिता की घोषणा भी चाहिए।',
  },
  fee: {
    en: 'Please confirm the fee in the *Fee Calculator* on passportindia.gov.in before you pay; it shows the exact amount for you. The official fee table (in force from 1 July 2026) lists, for a normal application: ₹2,500 (36 pages, 10 years), ₹3,500 (60 pages), ₹1,750 (child under 18). *Tatkaal* adds ₹2,500. A lost, stolen or damaged passport is ₹4,250 to ₹6,000. Children of 8 and under and people over 60 get a 10% rebate on a fresh application.',
    hi: 'भुगतान से पहले passportindia.gov.in के *Fee Calculator* में फीस ज़रूर जाँच लें; वह आपके लिए सही रकम दिखाता है। 1 जुलाई 2026 से लागू सरकारी फीस तालिका में सामान्य आवेदन के लिए ये फीस लिखी हैं: ₹2,500 (36 पन्ने, 10 साल), ₹3,500 (60 पन्ने), ₹1,750 (18 साल से कम का बच्चा)। *तत्काल* में ₹2,500 अलग। खोया, चोरी या खराब पासपोर्ट ₹4,250 से ₹6,000। 8 साल तक के बच्चों और 60 से ऊपर के लोगों को नए आवेदन पर 10% छूट मिलती है।',
  },
  after: {
    en: 'Want a reminder before your passport expires? Type *remind*.',
    hi: 'पासपोर्ट एक्सपायर होने से पहले रिमाइंडर चाहिए? *remind* लिखें।',
  },
  sheetName: { en: 'passport application', hi: 'पासपोर्ट आवेदन' },
  sheet: ['full_name', 'dob', 'gender', 'father_name', 'mother_name', 'address', 'pincode', 'mobile', 'email'],
  self: {
    en: 'choosing your password, the captcha, the payment, and the visit to the PSK with your photo and fingerprints',
    hi: 'अपना पासवर्ड चुनना, कैप्चा, भुगतान, और फोटो व फिंगरप्रिंट के साथ PSK की विज़िट',
  },
  sites: ['passportindia.gov.in', 'portal2.passportindia.gov.in'],
  facts: [
    'Apply at passportindia.gov.in (Passport Seva), pay and book a Passport Seva Kendra appointment, and attend in person with originals. Tatkaal costs extra, needs no proof of urgency, and always has police verification afterwards.',
    'Validity: adults 10 years. Minors under 15 get 5 years or until 18. Ages 15-18 can choose 10 years or until 18.',
    'Fees from the June 2026 instruction booklet: normal 36 pages 10 years Rs 2500; 60 pages Rs 3500; minor Rs 1750; Tatkaal adds Rs 2500; lost or damaged Rs 4250 to Rs 6000; change of particulars Rs 2500. Payment at the PSK is online or as the PSK allows. Tell people to confirm in the portal Fee Calculator.',
    'Processing: Tatkaal without prior police verification is dispatched within 1 working day; normal with post-issue police verification is dispatched about the 3rd working day. Complex cases (adoption, single-parent minor, major name change) take about 30 days. Do not quote a number for normal applications without verification.',
    'Helpline: 1800-258-1800.',
  ],
  unverified: ['police-verification rules (the official page did not load); fees match the official table in force from 1 July 2026, still send people to the Fee Calculator', 'exact processing days for a normal application without police verification', 'exact portal menu labels (the site needs JavaScript)'],
  remind: ['passport'],
};

// ---------------------------------------------------------------- GST registration
const gst = {
  id: 'gst',
  name: { en: 'GST registration', hi: 'GST रजिस्ट्रेशन' },
  blurb: { en: 'Register your business on the GST portal', hi: 'अपना कारोबार GST पोर्टल पर रजिस्टर करें' },
  intake: [
    opts('kind', 'What does your business sell?', 'आपका कारोबार क्या बेचता है?', [
      ['goods', 'Goods', 'सामान'],
      ['service', 'Services', 'सेवाएँ'],
      ['online', 'Online / other state', 'ऑनलाइन / दूसरा राज्य'],
    ]),
  ],
  pick: (a) => ({
    route: 'register',
    note:
      a.kind === 'online'
        ? {
            en: '\nSelling on an e-commerce site, or to another state, can make registration compulsory whatever your turnover is. Check your case on gst.gov.in or with a tax professional.',
            hi: '\nई-कॉमर्स साइट पर या दूसरे राज्य में बेचने पर आपके कारोबार की रकम कुछ भी हो, रजिस्ट्रेशन अनिवार्य हो सकता है। अपना मामला gst.gov.in पर या किसी टैक्स प्रोफेशनल से जाँच लें।',
          }
        : a.kind === 'services'
          ? {
              en: '\nFor services you must register when yearly turnover is above ₹20 lakh (₹10 lakh in special category states).',
              hi: '\nसेवाओं के लिए सालाना टर्नओवर ₹20 लाख से ऊपर (विशेष श्रेणी के राज्यों में ₹10 लाख) होने पर रजिस्ट्रेशन ज़रूरी है।',
            }
          : {
              en: '\nFor goods only, the limit is usually ₹40 lakh a year (₹20 lakh in some special category states). Selling to another state can need registration anyway.',
              hi: '\nसिर्फ सामान के लिए सीमा आमतौर पर सालाना ₹40 लाख है (कुछ विशेष श्रेणी के राज्यों में ₹20 लाख)। दूसरे राज्य में बेचने पर फिर भी रजिस्ट्रेशन लग सकता है।',
            },
  }),
  routes: {
    register: {
      intro: {
        en: 'You register on the GST portal in two parts, {n} steps. No fee is charged for registration on the portal. Apply within 30 days of becoming liable.{note}',
        hi: 'आप GST पोर्टल पर दो हिस्सों में रजिस्ट्रेशन करते हैं, {n} स्टेप। पोर्टल पर रजिस्ट्रेशन की कोई फीस नहीं लगती। ज़िम्मेदारी बनने के 30 दिन के अंदर आवेदन करें।{note}',
      },
      steps: [
        {
          en: 'Open *gst.gov.in* and go to *Services → Registration → New Registration*.',
          hi: '*gst.gov.in* खोलें और *Services → Registration → New Registration* पर जाएँ।',
        },
        {
          en: '*Part A*: choose taxpayer type, state and district, type the legal name *exactly as on PAN*, your PAN, email and mobile, and the captcha. You get two OTPs (mobile and email), each valid 10 minutes. Type them on the site only.',
          hi: '*Part A*: करदाता का प्रकार, राज्य और ज़िला चुनें, कानूनी नाम *बिल्कुल PAN जैसा* लिखें, PAN, ईमेल, मोबाइल और कैप्चा डालें। आपको दो OTP मिलेंगे (मोबाइल और ईमेल), हर एक 10 मिनट चलता है। उन्हें सिर्फ साइट पर डालें।',
        },
        {
          en: 'You get a *Temporary Reference Number (TRN)*, valid for 15 days. Save it. Go back to *New Registration*, choose *Temporary Reference Number*, and enter the TRN and a fresh OTP.',
          hi: 'आपको एक *Temporary Reference Number (TRN)* मिलेगा, जो 15 दिन वैध है। इसे सुरक्षित रखें। *New Registration* में लौटकर *Temporary Reference Number* चुनें और TRN व नया OTP डालें।',
        },
        {
          en: '*Part B* has 10 tabs: business details, promoters, authorised signatory, places of business, goods and services (up to 5 HSN or SAC codes), state details, Aadhaar and verification. Type *sheet* for your details ready to copy, and *docs* for what to upload.',
          hi: '*Part B* में 10 टैब हैं: कारोबार की जानकारी, प्रमोटर, अधिकृत हस्ताक्षरकर्ता, कारोबार के स्थान, सामान और सेवाएँ (अधिकतम 5 HSN या SAC कोड), राज्य की जानकारी, आधार और सत्यापन। जानकारी कॉपी करने के लिए *sheet* और अपलोड की सूची के लिए *docs* लिखें।',
        },
        {
          en: 'Upload the documents as PDF or JPEG, about 1 MB each.',
          hi: 'दस्तावेज़ PDF या JPEG में अपलोड करें, हर एक करीब 1 MB तक।',
        },
        {
          en: 'On the Aadhaar tab keep *Yes* and finish authentication using the link sent to your email and mobile, with an Aadhaar OTP. If you skip or it fails, you must visit a GST Suvidha Kendra for a biometric check within 15 days.',
          hi: 'Aadhaar टैब पर *Yes* रखें और ईमेल व मोबाइल पर आए लिंक से आधार OTP द्वारा ऑथेंटिकेशन पूरा करें। छोड़ें या फेल हो तो 15 दिन के अंदर GST सुविधा केंद्र पर बायोमेट्रिक जाँच के लिए जाना होगा।',
        },
        {
          en: 'On the *Verification* tab tick the declaration, pick the signatory and sign with an *EVC (OTP)*. Companies and LLPs must use a *digital signature (DSC)*. Submit and save your *ARN*.',
          hi: '*Verification* टैब पर घोषणा टिक करें, हस्ताक्षरकर्ता चुनें और *EVC (OTP)* से साइन करें। कंपनी और LLP को *डिजिटल सिग्नेचर (DSC)* इस्तेमाल करना होता है। सबमिट करें और अपना *ARN* सुरक्षित रखें।',
        },
        {
          en: 'Track under *Services → Registration → Track Application Status*. If Aadhaar authentication went through, the officer should approve or ask a question in about 3 working days. Otherwise it can take about 7 working days or more.',
          hi: '*Services → Registration → Track Application Status* में ट्रैक करें। आधार ऑथेंटिकेशन हो गया हो तो अधिकारी को करीब 3 कार्यदिवस में मंज़ूरी देनी या सवाल पूछना चाहिए। नहीं तो करीब 7 कार्यदिवस या ज़्यादा लग सकते हैं।',
        },
      ],
    },
  },
  docs: {
    en:
      'For GST registration you usually need:\n' +
      '• PAN of the business or the owner\n' +
      '• Proof of how the business is set up (partnership deed or incorporation certificate; not needed for a sole proprietor)\n' +
      '• Owner or partner details: PAN, Aadhaar, address, photo (and DIN for companies)\n' +
      '• Proof for the authorised signatory (appointment letter or board resolution) and a photo\n' +
      '• Proof of the business place: ownership document, or rent agreement with the owner\'s consent, or a utility bill\n' +
      '• Bank details (cancelled cheque or statement first page; can be added later)\n' +
      '• A mobile number linked to Aadhaar and a working email for the OTPs\n' +
      'Some states ask for extra items (for example an electricity consumer number).',
    hi:
      'GST रजिस्ट्रेशन के लिए आमतौर पर चाहिए:\n' +
      '• कारोबार या मालिक का PAN\n' +
      '• कारोबार के स्वरूप का प्रमाण (पार्टनरशिप डीड या इंकॉर्पोरेशन सर्टिफिकेट; अकेले मालिक के लिए नहीं चाहिए)\n' +
      '• मालिक या पार्टनर की जानकारी: PAN, आधार, पता, फोटो (कंपनी के लिए DIN भी)\n' +
      '• अधिकृत हस्ताक्षरकर्ता का प्रमाण (नियुक्ति पत्र या बोर्ड प्रस्ताव) और फोटो\n' +
      '• कारोबार की जगह का प्रमाण: मालिकाना दस्तावेज़, या मकान मालिक की सहमति के साथ किराया समझौता, या बिजली-पानी का बिल\n' +
      '• बैंक की जानकारी (कैंसिल चेक या स्टेटमेंट का पहला पन्ना; बाद में भी जोड़ सकते हैं)\n' +
      '• आधार से जुड़ा मोबाइल नंबर और OTP के लिए चालू ईमेल\n' +
      'कुछ राज्य अतिरिक्त चीज़ें माँगते हैं (जैसे बिजली उपभोक्ता नंबर)।',
  },
  fee: {
    en: 'The GST portal does not charge a registration fee (the tutorial pages list no fee step). If someone asks for money to "process" it, that is an agent or consultant fee, not the government\'s.',
    hi: 'GST पोर्टल रजिस्ट्रेशन की कोई फीस नहीं लेता (ट्यूटोरियल पेज में कोई फीस वाला स्टेप नहीं है)। कोई इसे "प्रोसेस" करने के पैसे माँगे तो वह एजेंट या कंसल्टेंट की फीस है, सरकार की नहीं।',
  },
  after: { en: 'Keep your ARN until approval comes.', hi: 'मंज़ूरी आने तक अपना ARN रखें।' },
  sheetName: { en: 'GST registration', hi: 'GST रजिस्ट्रेशन' },
  sheet: ['full_name', 'dob', 'father_name', 'address', 'pincode', 'mobile', 'email'],
  self: {
    en: 'every OTP (mobile, email and Aadhaar), the captcha, the final signature (EVC or DSC), uploading documents and any Suvidha Kendra visit',
    hi: 'हर OTP (मोबाइल, ईमेल और आधार), कैप्चा, अंतिम हस्ताक्षर (EVC या DSC), दस्तावेज़ अपलोड और GST सुविधा केंद्र की कोई भी विज़िट',
  },
  sites: ['gst.gov.in', 'reg.gst.gov.in/registration'],
  facts: [
    'Threshold (CGST Section 22): aggregate turnover above Rs 20 lakh for services or mixed supplies (Rs 10 lakh in special category states); goods-only suppliers up to Rs 40 lakh (Rs 20 lakh in some special category states).',
    'Compulsory regardless of turnover: inter-state taxable supply (with exceptions), casual taxable persons, non-residents, reverse-charge payers, e-commerce operators and sellers who must collect tax.',
    'Apply within 30 days of becoming liable. Casual and non-resident persons apply at least 5 days before starting. There is no fee on the portal.',
    'The TRN is valid 15 days. OTPs are valid 10 minutes. With Aadhaar authentication, approval comes within 3 working days, and it is deemed approved if the officer does nothing in that time. Without authentication you visit a Suvidha Kendra first and that shortcut does not apply.',
    'Composition scheme details change; do not quote limits, tell people to check gst.gov.in.',
  ],
  unverified: ['that the fee is nil (no page states it outright)', 'whether the thresholds are unchanged as of September 2026', 'special-category-state list', 'composition scheme limits and rates'],
};

// ---------------------------------------------------------------- Income and caste certificates
const stateStep = {
  en: 'Open {portal}. Register or log in with your mobile number and Aadhaar or your state login.',
  hi: '{portal} खोलें। अपने मोबाइल नंबर और आधार या राज्य के लॉगिन से रजिस्टर करें या लॉगिन करें।',
};

const income = {
  id: 'income',
  name: { en: 'Income certificate', hi: 'आय प्रमाणपत्र' },
  blurb: { en: 'From your state e-District portal', hi: 'आपके राज्य के e-District पोर्टल से' },
  intake: [{ key: 'state', type: 'state', en: 'Which state do you live in? Type the name, like Maharashtra.', hi: 'आप किस राज्य में रहते हैं? नाम लिखें, जैसे महाराष्ट्र।' }],
  pick: () => ({ route: 'apply' }),
  routes: {
    apply: {
      intro: {
        en: 'Income certificates are issued by your *state*, usually by the Tehsildar or SDM, and applied for on your state portal or at a CSC centre, {n} steps. Your portal: {portal}. Fees, validity and documents differ by state.{note}',
        hi: 'आय प्रमाणपत्र आपका *राज्य* जारी करता है, आमतौर पर तहसीलदार या SDM, और आवेदन राज्य के पोर्टल पर या CSC केंद्र पर होता है, {n} स्टेप। आपका पोर्टल: {portal}। फीस, वैधता और दस्तावेज़ राज्य के अनुसार अलग होते हैं।{note}',
      },
      steps: [
        stateStep,
        {
          en: 'Choose *Revenue Department → Income Certificate*. Type your family and income details. Type *sheet* to get your details ready to copy.',
          hi: '*Revenue Department → Income Certificate* चुनें। अपने परिवार और आय की जानकारी डालें। जानकारी कॉपी करने के लिए *sheet* लिखें।',
        },
        {
          en: 'Upload your photo ID, address proof, income proof (salary slip, ITR, employer certificate, or your own declaration where the state accepts it) and a recent photo. Type *docs* for the usual list.',
          hi: 'अपना फोटो ID, पते का प्रमाण, आय का प्रमाण (सैलरी स्लिप, ITR, नियोक्ता का प्रमाणपत्र, या जहाँ राज्य माने वहाँ आपकी अपनी घोषणा) और हाल की फोटो अपलोड करें। आम सूची के लिए *docs* लिखें।',
        },
        {
          en: 'Pay the fee if the portal asks, submit, and save your *application number*.',
          hi: 'पोर्टल माँगे तो फीस भरें, सबमिट करें और अपना *आवेदन नंबर* सुरक्षित रखें।',
        },
        {
          en: 'Track the application on the same portal. The Tehsildar or officer checks it. When it is approved, download the digitally signed certificate or collect it. If it is late, ask at your tehsil.',
          hi: 'उसी पोर्टल पर आवेदन ट्रैक करें। तहसीलदार या अधिकारी उसकी जाँच करता है। मंज़ूर होने पर डिजिटल हस्ताक्षर वाला प्रमाणपत्र डाउनलोड करें या ले लें। देर हो तो अपनी तहसील में पूछें।',
        },
      ],
    },
  },
  docs: {
    en:
      'An income certificate usually needs (your state may differ):\n' +
      '• Application form (online on your state portal)\n' +
      '• Photo ID such as Aadhaar or voter ID\n' +
      '• Address proof\n' +
      '• Income proof or a self-declaration: salary slip, ITR or employer certificate where relevant\n' +
      '• A recent passport photo\n' +
      '• Ration card or family details in some states\n' +
      'The exact list is on your state portal.',
    hi:
      'आय प्रमाणपत्र के लिए आमतौर पर चाहिए (आपका राज्य अलग माँग सकता है):\n' +
      '• आवेदन फॉर्म (आपके राज्य पोर्टल पर ऑनलाइन)\n' +
      '• फोटो ID जैसे आधार या वोटर ID\n' +
      '• पते का प्रमाण\n' +
      '• आय का प्रमाण या स्वयं-घोषणा: सैलरी स्लिप, ITR या नियोक्ता का प्रमाणपत्र जहाँ लागू हो\n' +
      '• हाल की पासपोर्ट फोटो\n' +
      '• कुछ राज्यों में राशन कार्ड या परिवार की जानकारी\n' +
      'सही सूची आपके राज्य के पोर्टल पर है।',
  },
  fee: {
    en: 'The fee is set by each state and differs a lot. Examples from official portals: Maharashtra ₹20 for income and ₹40 for caste; Rajasthan e-Mitra adds a ₹50 kiosk charge; the Karnataka portal shows both ₹25 and ₹40. Your portal shows the exact amount before you pay.',
    hi: 'फीस हर राज्य तय करता है और मैं इसे किसी सरकारी पेज से पक्का नहीं कर पाया। यह राज्य के हिसाब से बहुत अलग है। सरकारी पोर्टल से उदाहरण: महाराष्ट्र में आय के ₹20 और जाति के ₹40; राजस्थान e-Mitra ₹50 कियोस्क शुल्क जोड़ता है; कर्नाटक के अपने पेजों में ₹25 और ₹40 दोनों दिखते हैं। सही रकम आपका पोर्टल भुगतान से पहले दिखाता है।',
  },
  after: {
    en: 'Income certificates are usually valid for a limited time, often a year or a financial year, so check the date on yours.',
    hi: 'आय प्रमाणपत्र आमतौर पर सीमित समय के लिए वैध होते हैं, अक्सर एक साल या एक वित्त वर्ष के लिए, इसलिए अपने वाले की तारीख जाँच लें।',
  },
  sheetName: { en: 'income certificate', hi: 'आय प्रमाणपत्र' },
  sheet: ['full_name', 'father_name', 'dob', 'gender', 'address', 'pincode', 'mobile'],
  self: {
    en: 'the login OTP, the captcha, uploading your documents, the payment and any visit to the tehsil',
    hi: 'लॉगिन OTP, कैप्चा, दस्तावेज़ अपलोड, भुगतान और तहसील की कोई भी विज़िट',
  },
  sites: ['your state e-District portal', 'services.india.gov.in'],
  facts: [
    'Income certificates are issued by state or UT revenue departments, usually the Tehsildar, SDM or block or circle officer, applied for on the state e-District or RTPS portal or at a CSC.',
    'Portals: Maharashtra Aaple Sarkar, Rajasthan e-Mitra, Delhi e-District, Bihar RTPS, Gujarat Digital Gujarat, Karnataka Seva Sindhu, Tamil Nadu e-Sevai, Telangana MeeSeva, Andhra Pradesh AP Seva, Uttar Pradesh e-District, Madhya Pradesh e-District.',
    'Fees, validity and processing time are set by each state and were not confirmed. Do not quote a number; say to check the portal.',
  ],
  unverified: ['documents, validity and fee (typical values only)', 'per-state fee and processing days', 'the officer who signs in each state'],
};

const caste = {
  id: 'caste',
  name: { en: 'Caste certificate', hi: 'जाति प्रमाणपत्र' },
  blurb: { en: 'SC, ST, OBC and OBC non-creamy layer', hi: 'SC, ST, OBC और OBC नॉन-क्रीमी लेयर' },
  intake: [
    { key: 'state', type: 'state', en: 'Which state do you live in? Type the name, like Bihar.', hi: 'आप किस राज्य में रहते हैं? नाम लिखें, जैसे बिहार।' },
    opts('kind', 'Which certificate do you need?', 'आपको कौन सा प्रमाणपत्र चाहिए?', [
      ['scst', 'SC or ST', 'SC या ST'],
      ['obc', 'OBC (state)', 'OBC (राज्य)'],
      ['ncl', 'OBC for central job', 'OBC केंद्र नौकरी'],
    ]),
  ],
  pick: (a) => ({ route: a.kind === 'ncl' ? 'ncl' : 'apply' }),
  routes: {
    apply: {
      intro: {
        en: 'Caste certificates are issued by your *state*, usually by the Tehsildar, SDM or District Magistrate, and applied for on your state portal, {n} steps. Your portal: {portal}.{note}',
        hi: 'जाति प्रमाणपत्र आपका *राज्य* जारी करता है, आमतौर पर तहसीलदार, SDM या ज़िलाधिकारी, और आवेदन राज्य के पोर्टल पर होता है, {n} स्टेप। आपका पोर्टल: {portal}।{note}',
      },
      steps: [
        stateStep,
        {
          en: 'Choose the *caste certificate* service (SC, ST or OBC). Check whether your state treats caste and non-creamy-layer as separate services.',
          hi: '*जाति प्रमाणपत्र* सेवा चुनें (SC, ST या OBC)। देखें कि आपका राज्य जाति और नॉन-क्रीमी लेयर को अलग सेवाएँ मानता है या नहीं।',
        },
        {
          en: 'Fill in your details, your father\'s details and your caste. Some states also ask for your present and permanent address and two local referees. Type *sheet* to get your details ready to copy.',
          hi: 'अपनी, अपने पिता की और अपनी जाति की जानकारी भरें। कुछ राज्य मौजूदा और स्थायी पता और दो स्थानीय गवाह भी माँगते हैं। जानकारी कॉपी करने के लिए *sheet* लिखें।',
        },
        {
          en: 'Upload proof of caste (a family member\'s old certificate, school leaving certificate, or land record showing caste), your photo ID, address proof and a passport photo. Type *docs* for the list. If you came from another state, keep proof of migration.',
          hi: 'जाति का प्रमाण (परिवार के किसी सदस्य का पुराना प्रमाणपत्र, स्कूल लीविंग सर्टिफिकेट, या जाति दर्शाने वाला भूमि रिकॉर्ड), फोटो ID, पते का प्रमाण और पासपोर्ट फोटो अपलोड करें। सूची के लिए *docs* लिखें। दूसरे राज्य से आए हों तो पलायन का प्रमाण रखें।',
        },
        {
          en: 'Submit and save your *application number*. The officer verifies it. When it is approved, download the digitally signed certificate from the portal.',
          hi: 'सबमिट करें और अपना *आवेदन नंबर* सुरक्षित रखें। अधिकारी उसकी जाँच करता है। मंज़ूर होने पर पोर्टल से डिजिटल हस्ताक्षर वाला प्रमाणपत्र डाउनलोड करें।',
        },
      ],
    },
    ncl: {
      intro: {
        en: 'For *central government jobs and admissions*, OBC candidates need a *non-creamy-layer* certificate. A state OBC certificate alone is not enough. The officer, usually the Tehsildar or higher, also assesses your family income and status against the central creamy-layer rules. Your state portal: {portal}, {n} steps.{note}',
        hi: '*केंद्र सरकार की नौकरियों और दाखिलों* के लिए OBC उम्मीदवारों को *नॉन-क्रीमी लेयर* प्रमाणपत्र चाहिए। सिर्फ राज्य का OBC प्रमाणपत्र काफी नहीं है। अधिकारी, आमतौर पर तहसीलदार या उससे ऊपर, आपके परिवार की आय और स्थिति को केंद्र के क्रीमी-लेयर नियमों से जाँचता है। आपका राज्य पोर्टल: {portal}, {n} स्टेप।{note}',
      },
      steps: [
        stateStep,
        {
          en: 'Choose the *OBC non-creamy layer* service (some states call it OBC-NCL).',
          hi: '*OBC नॉन-क्रीमी लेयर* सेवा चुनें (कुछ राज्य इसे OBC-NCL कहते हैं)।',
        },
        {
          en: 'Fill in your family income details. Salary and farm income are usually treated separately under the central rules, so keep those papers ready.',
          hi: 'अपने परिवार की आय की जानकारी भरें। केंद्र के नियमों में वेतन और खेती की आय अक्सर अलग गिनी जाती है, इसलिए वे कागज़ तैयार रखें।',
        },
        {
          en: 'Upload proof of caste, income proof, photo ID, address proof and a photo. Type *docs* for the list and *sheet* for your details ready to copy.',
          hi: 'जाति का प्रमाण, आय का प्रमाण, फोटो ID, पते का प्रमाण और फोटो अपलोड करें। सूची के लिए *docs* और जानकारी कॉपी करने के लिए *sheet* लिखें।',
        },
        {
          en: 'Submit and save your *application number*. When it is approved, download the certificate. It usually covers one financial year, so apply again when a new one is needed.',
          hi: 'सबमिट करें और *आवेदन नंबर* सुरक्षित रखें। मंज़ूर होने पर प्रमाणपत्र डाउनलोड करें। यह आमतौर पर एक वित्त वर्ष के लिए होता है, इसलिए नया चाहिए तो दोबारा आवेदन करें।',
        },
      ],
    },
  },
  docs: {
    en:
      'A caste certificate usually needs (your state may differ):\n' +
      '• Proof of caste from a family member: an old caste certificate, school leaving certificate, or land record showing caste\n' +
      '• Residence proof (some states ask for present and permanent address)\n' +
      '• Photo ID such as Aadhaar or voter ID\n' +
      '• A passport photo\n' +
      '• Family relation details, and two local referees in some states\n' +
      '• Proof of migration if you came from another state\n' +
      'For an OBC non-creamy-layer certificate add income proof. The exact list is on your state portal.',
    hi:
      'जाति प्रमाणपत्र के लिए आमतौर पर चाहिए (आपका राज्य अलग माँग सकता है):\n' +
      '• परिवार के किसी सदस्य से जाति का प्रमाण: पुराना जाति प्रमाणपत्र, स्कूल लीविंग सर्टिफिकेट, या जाति दर्शाने वाला भूमि रिकॉर्ड\n' +
      '• निवास का प्रमाण (कुछ राज्य मौजूदा और स्थायी पता माँगते हैं)\n' +
      '• फोटो ID जैसे आधार या वोटर ID\n' +
      '• पासपोर्ट फोटो\n' +
      '• परिवार के रिश्ते की जानकारी, और कुछ राज्यों में दो स्थानीय गवाह\n' +
      '• दूसरे राज्य से आए हों तो पलायन का प्रमाण\n' +
      'OBC नॉन-क्रीमी लेयर प्रमाणपत्र के लिए आय का प्रमाण भी जोड़ें। सही सूची आपके राज्य के पोर्टल पर है।',
  },
  fee: {
    en: 'The fee is set by each state and I could not confirm it from an official page. It is often nothing or a small service charge. Your portal shows the exact amount before you pay.',
    hi: 'फीस हर राज्य तय करता है और मैं इसे किसी सरकारी पेज से पक्का नहीं कर पाया। यह अक्सर कुछ नहीं या मामूली सेवा शुल्क होता है। सही रकम आपका पोर्टल भुगतान से पहले दिखाता है।',
  },
  after: {
    en: 'SC and ST certificates are generally lifelong once issued, while OBC non-creamy-layer certificates usually cover one financial year. Check your state\'s rule.',
    hi: 'SC और ST प्रमाणपत्र एक बार बनने के बाद आमतौर पर जीवन भर के लिए होते हैं, जबकि OBC नॉन-क्रीमी लेयर प्रमाणपत्र आमतौर पर एक वित्त वर्ष के लिए होते हैं। अपने राज्य का नियम जाँच लें।',
  },
  sheetName: { en: 'caste certificate', hi: 'जाति प्रमाणपत्र' },
  sheet: ['full_name', 'father_name', 'dob', 'gender', 'address', 'pincode', 'mobile'],
  self: {
    en: 'the login OTP, the captcha, uploading your documents, the payment and any verification visit',
    hi: 'लॉगिन OTP, कैप्चा, दस्तावेज़ अपलोड, भुगतान और सत्यापन की कोई भी विज़िट',
  },
  sites: ['your state e-District portal', 'services.india.gov.in'],
  facts: [
    'Caste certificates are issued by state or UT authorities, usually the Tehsildar, SDM or District Magistrate, on state e-District portals. West Bengal has a dedicated Backward Classes Welfare portal.',
    'OBC non-creamy-layer certificates for central government jobs and admissions assess family income and status under the central (DoPT) creamy-layer rules; a state OBC certificate alone is not enough.',
    'Validity: SC and ST certificates are generally lifelong; OBC-NCL is usually one financial year. Fees and processing time are set by each state and were not confirmed. Do not quote numbers.',
  ],
  unverified: ['validity, fee and processing time per state', 'the central creamy-layer income limit (do not quote)', 'which officer signs in each state'],
};

export const SERVICES = [pan, panFix, dl, aadhaar, voter, passport, gst, income, caste];
export const serviceById = (id) => SERVICES.find((s) => s.id === id) || null;
/** The service whose docs, sheet and facts apply (pan_fix shares PAN's). */
export const baseService = (id) => {
  const s = serviceById(id);
  return s && s.alias ? serviceById(s.alias) : s;
};

// ---------------------------------------------------------------- text helpers
export const L10 = (obj, lang) => (obj ? obj[lang] || i18n.string(lang, obj.en) || obj.en : '');
/** Button title for option [id, en, hi]. */
export const optTitle = (o, lang) => (lang === 'hi' ? o[2] : lang === 'en' ? o[1] : i18n.string(lang, o[1]) || o[1]);

/** The questions still to ask, given answers so far. Returns the next question or null. */
export function nextQuestion(svc, ans) {
  return svc.intake.find((q) => ans[q.key] === undefined && (!q.when || q.when(ans))) || null;
}

/** Match a typed reply to an option id. Digits pick by position. */
export function matchOption(q, text, lang) {
  const s = norm(text);
  if (!s) return null;
  const list = q.options;
  if (/^[1-9]$/.test(s) && list[Number(s) - 1]) return list[Number(s) - 1][0];
  for (const [id, en, hi] of list) {
    if (s === norm(id) || s === norm(en) || s === norm(hi)) return id;
  }
  return null;
}

/** All the plain-text facts about one service, handed to the AI so its answers stay inside what we checked. */
export function serviceFacts(svc) {
  const b = baseService(svc.id) || svc;
  const steps = (arr) => (arr || []).map((s, i) => `${i + 1}. ${s.en.replace(/\*/g, '')}`).join('\n');
  const out = [`Service: ${b.name.en}. Last verified: ${LAST_VERIFIED}. Official: ${(b.sites || []).join(', ')}.`, ...(b.facts || []), ...extraFor(b.id), ...liveLines(b.id)];
  for (const [rid, r] of Object.entries(b.routes)) {
    if (r.kind === 'info') out.push(`${rid}: ${r.text.en.replace(/\*/g, '')}`);
    else out.push(`Route "${rid}": ${r.intro.en.replace(/\*/g, '').replace('{n}', String(r.steps.length)).replace('{note}', '').replace('{portal}', 'the state portal')}`, steps(r.steps));
  }
  if (b.docs) out.push(b.docs.en.replace(/\*/g, ''));
  if (b.fee) out.push(`Fees: ${b.fee.en.replace(/\*/g, '')}`);
  if (b.unverified?.length) out.push(`NOT CONFIRMED from an official page (say you are unsure and point to the official site if asked): ${b.unverified.join('; ')}.`);
  return out.join('\n');
}

const WORDS = (t) => new Set(String(t).toLowerCase().match(/[a-z0-9\u0900-\u097f]{3,}/g) || []);
const STOP = new Set(['the', 'and', 'for', 'how', 'what', 'can', 'are', 'you', 'with', 'this', 'that', 'from', 'will', 'need', 'get', 'does', 'much', 'kya', 'hai', 'kaise']);
function pick(chunks, q, budget) {
  const qw = [...WORDS(q)].filter((w) => !STOP.has(w));
  const scored = chunks.map((c, i) => {
    const cw = WORDS(c);
    let sc = 0;
    for (const w of qw) if (cw.has(w) || [...cw].some((x) => x.length > 4 && w.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))) sc++;
    return { c, i, sc };
  }).sort((a, b) => b.sc - a.sc || a.i - b.i);
  const out = []; let n = 0;
  for (const x of scored) { if (n + x.c.length > budget && out.length) continue; out.push(x); n += x.c.length; if (n >= budget) break; }
  return out.sort((a, b) => a.i - b.i).map((x) => x.c);
}

/** Only the parts of a service's facts that match the question (about a third of the full text), so each AI call is small. */
export function relevantFacts(svc, question, budget = 2200) {
  const b = baseService(svc.id) || svc;
  const strip = (t) => t.en.replace(/\*/g, '');
  const must = [`Service: ${b.name.en}. Verified ${LAST_VERIFIED}. Official: ${(b.sites || []).join(', ')}.`, ...liveLines(b.id)];
  if (b.fee) must.push(`Fees: ${strip(b.fee)}`);
  if (b.unverified?.length) must.push(`NOT CONFIRMED (say usually, portal shows exact): ${b.unverified.join('; ')}.`);
  const opt = [...(b.facts || []), ...extraFor(b.id)];
  for (const [rid, r] of Object.entries(b.routes)) {
    if (r.kind === 'info') opt.push(`${rid}: ${strip(r.text)}`);
    else opt.push(`Route "${rid}": ${strip(r.intro).replace('{n}', String(r.steps.length)).replace('{note}', '').replace('{portal}', 'the state portal')}\n` + r.steps.map((x, i) => `${i + 1}. ${strip(x)}`).join('\n'));
  }
  if (b.docs) opt.push(strip(b.docs));
  const room = Math.max(600, budget - must.join('\n').length);
  return [...must, ...pick(opt, question, room)].join('\n');
}

/** No service named: the one-line overview plus the few fact lines that match the question across every service. */
export function relevantCross(question, budget = 2400) {
  const seen = new Set(); const chunks = [];
  for (const s of SERVICES) {
    if (s.alias || seen.has(s.id)) continue; seen.add(s.id);
    const b = baseService(s.id) || s;
    const head = `[${b.name.en}; official ${(b.sites || []).join(', ')}]`;
    if (b.fee) chunks.push(`${head} Fees: ${b.fee.en.replace(/\*/g, '')}`);
    for (const f of [...(b.facts || []), ...extraFor(b.id), ...liveLines(b.id)]) chunks.push(`${head} ${f}`);
  }
  return overviewFacts() + '\n\n' + pick(chunks, question, budget).join('\n');
}

// Newer facts read from the official pages while the server runs (see livefacts.js). Empty until the first refresh.
let LIVE = {};
export const setLiveFacts = (m) => { LIVE = m && typeof m === 'object' ? m : {}; };
export const liveStamp = () => Object.values(LIVE).map((x) => x?.ts || 0).reduce((a, b) => Math.max(a, b), 0);
const liveLines = (id) => {
  const x = LIVE[id];
  if (!x?.items?.length) return [];
  const day = new Date(x.ts).toISOString().slice(0, 10);
  return [`LATEST READ FROM OFFICIAL PAGES on ${day} (newer than the lines above; if they differ, trust these):`, ...x.items.map((i) => i.text)];
};

/** Fees, deadlines and rules for every service in one block, for questions that do not name a service. */
export function crossFacts() {
  const seen = new Set();
  return SERVICES.filter((s) => !s.alias && !seen.has(s.id) && seen.add(s.id))
    .map((s) => {
      const b = baseService(s.id) || s;
      const fee = b.fee ? `Fees: ${b.fee.en.replace(/\*/g, '')}` : '';
      return [`## ${b.name.en} (official: ${(b.sites || []).join(', ')})`, ...(b.facts || []), ...extraFor(b.id), fee, ...liveLines(b.id)].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

/** A short line per service, for questions asked before any service is picked. */
export function overviewFacts() {
  return SERVICES.filter((s) => !s.alias)
    .map((s) => `- ${s.name.en}: ${s.blurb.en}. Official: ${(s.sites || []).join(', ')}.`)
    .join('\n');
}

const KEYWORDS = [
  ['passport', /passport|पासपोर्ट/i],
  ['gst', /\bgst|जीएसटी/i],
  ['caste', /caste|\bobc\b|\bsc\b|\bst\b|creamy|जाति/i],
  ['income', /income cert|आय प्रमाण/i],
  ['voter', /voter|\bepic\b|election|वोटर|मतदाता/i],
  ['dl', /driving|licen[cs]e|\bdl\b|\brto\b|sarathi|लाइसेंस|ड्राइविंग/i],
  ['pan', /\bpan\b|e-?pan|पैन/i],
  ['aadhaar', /aadhaa?r|uidai|आधार/i],
];

/** Every service a question mentions (for "learner licence fee and passport tatkal fee"). */
export function detectServices(text) {
  const s = String(text || '');
  const out = [];
  for (const [id, re] of KEYWORDS) if (re.test(s)) { const v = serviceById(id); if (v && !out.some((x) => x.id === (baseService(v.id) || v).id)) out.push(baseService(v.id) || v); }
  return out;
}

/** Which service a free-form question is about, so the AI only gets that service's facts. */
export function detectService(text) {
  const s = String(text || '');
  for (const [id, re] of KEYWORDS) if (re.test(s)) return serviceById(id);
  return null;
}

// ---------------------------------------------------------------- translation support
// Every English string in the registry that a person can see, so translate.js can translate them once.
// Each is { en, max? }. Notes returned by pick() are found by trying every combination of answers.
function probeNotes(svc) {
  const notes = [];
  const values = svc.intake.map((q) => (q.type === 'yn' ? ['y', 'n'] : q.type === 'opts' ? q.options.map((o) => o[0]) : ['other']));
  const walk = (i, ans) => {
    if (i === svc.intake.length) {
      try {
        const r = svc.pick(ans);
        if (r?.note) notes.push(r.note);
      } catch {
        /* an impossible combination */
      }
      return;
    }
    for (const v of values[i]) walk(i + 1, { ...ans, [svc.intake[i].key]: v });
  };
  walk(0, {});
  return notes;
}

export function translatableStrings() {
  const out = new Map();
  const add = (obj, max) => {
    if (!obj || !obj.en) return;
    const prev = out.get(obj.en);
    out.set(obj.en, { en: obj.en, max: prev?.max && max ? Math.min(prev.max, max) : max || prev?.max });
  };
  for (const s of SERVICES) {
    add(s.name, 24);
    add(s.blurb, 72);
    for (const q of s.intake) {
      add(q);
      for (const o of q.options || []) add({ en: o[1] }, 20);
    }
    for (const r of Object.values(s.routes)) {
      add(r.intro);
      add(r.text);
      for (const st of r.steps || []) add(st);
    }
    for (const k of ['docs', 'fee', 'after', 'self', 'sheetName']) add(s[k]);
    for (const n of probeNotes(s)) add(n);
  }
  // fixed strings from this file
  add({ en: "your state's e-District or e-Sevai portal (search your state name with \"e-District income certificate\", or ask at your tehsil or a CSC centre)" });
  return [...out.values()];
}
