// Everything the bot "knows" about PAN. Deterministic, editable, no AI cost.
//
// !! Government rules change. Re-verify before launch and whenever a portal changes.
// Checked on 2026-09-30 against the Income Tax Department pages (incometax.gov.in instant e-PAN steps,
// eligibility and FAQ; incometaxindia.gov.in apply-for-pan): instant e-PAN steps and rules, the Rs 91 + GST
// fee, the portal list. Confirmed from the Income Tax Department (Rule 158): Form 93 replaced Form 49A from
// 1 April 2026. Still not confirmed: the correction form number and exact button names on the Protean / UTIITSL form.

export const PAN = {
  lastVerified: '2026-09-30',
  officialSites: ['incometax.gov.in', 'tinpan.proteantech.in (Protean)', 'pan.utiitsl.com (UTIITSL)'],

  // Instant e-PAN: free, Aadhaar-OTP based, digital PDF. For adults with no PAN and an Aadhaar-linked mobile.
  epan: [
    {
      en: 'Open *incometax.gov.in* in your phone browser. On the home page tap *Instant E-PAN*.',
      hi: 'अपने फोन के ब्राउज़र में *incometax.gov.in* खोलें। होम पेज पर *Instant E-PAN* पर टैप करें।',
    },
    {
      en: 'Tap *Get New e-PAN*. Type your 12-digit Aadhaar number on the site, tick the confirmation box and tap *Continue*. Read the consent terms, tick *I have read the consent terms* and tap *Continue*.',
      hi: '*Get New e-PAN* पर टैप करें। वेबसाइट पर अपना 12 अंकों का आधार नंबर डालें, पुष्टि वाला बॉक्स टिक करें और *Continue* दबाएँ। सहमति की शर्तें पढ़ें, *I have read the consent terms* टिक करें और *Continue* दबाएँ।',
    },
    {
      en: 'A 6-digit OTP comes by SMS on the mobile linked to your Aadhaar. Type it on the site only. It works for 15 minutes and you get 3 tries. Tick the Aadhaar validation box and tap *Continue*.',
      hi: 'आधार से जुड़े मोबाइल पर SMS से 6 अंकों का OTP आएगा। उसे सिर्फ वेबसाइट पर डालें। यह 15 मिनट चलता है और 3 कोशिश मिलती हैं। आधार वैलिडेशन बॉक्स टिक करके *Continue* दबाएँ।',
    },
    {
      en: 'Tick *I Accept that* and tap *Continue*. Adding and validating your email is optional at this point.',
      hi: '*I Accept that* टिक करके *Continue* दबाएँ। इस समय ईमेल जोड़ना और वैलिडेट करना ज़रूरी नहीं है।',
    },
    {
      en: 'You get a success message with an acknowledgement number, and an SMS. Take a screenshot. To get your e-PAN later, go back to *Instant E-PAN* on incometax.gov.in, check the status and download the digitally signed e-PAN with Aadhaar and OTP.',
      hi: 'आपको सफलता का संदेश, acknowledgement नंबर और एक SMS मिलेगा। स्क्रीनशॉट रख लें। बाद में e-PAN पाने के लिए incometax.gov.in पर *Instant E-PAN* में जाएँ, स्टेटस देखें और आधार व OTP से डिजिटल हस्ताक्षर वाला e-PAN डाउनलोड करें।',
    },
  ],

  // Full application on Protean (NSDL) or UTIITSL. Used for minors, no Aadhaar-linked mobile, or when a physical card is wanted.
  form: [
    {
      en: 'Open *tinpan.proteantech.in* (Protean) or *pan.utiitsl.com* (UTIITSL). Both are official. Choose *New PAN – Indian Citizen*. (Older guides call it Form 49A; from 1 April 2026 it is Form 93. Follow whatever the site shows.)',
      hi: '*tinpan.proteantech.in* (Protean) या *pan.utiitsl.com* (UTIITSL) खोलें। दोनों सरकारी हैं। *New PAN – Indian Citizen* चुनें। (पुरानी गाइड में इसे Form 49A कहते हैं; 1 अप्रैल 2026 से Form 93 है। साइट जो दिखाए वही चुनें।)',
    },
    {
      en: 'Fill in your details *exactly* as written on your ID proof: same spelling, same date of birth. A spelling mismatch is one of the most common reasons for rejection.',
      hi: 'अपनी जानकारी बिल्कुल वैसे ही भरें जैसी ID प्रूफ पर लिखी है: वही स्पेलिंग, वही जन्मतिथि। स्पेलिंग में फर्क होना अस्वीकृति की सबसे आम वजहों में से एक है।',
    },
    {
      en: 'Choose how to verify. If your mobile is linked to Aadhaar, you can verify online with an Aadhaar OTP, with no papers. If not, you send supporting documents by post or courier after paying.',
      hi: 'वेरिफिकेशन का तरीका चुनें। अगर आपका मोबाइल आधार से जुड़ा है तो आधार OTP से ऑनलाइन वेरिफाई कर सकते हैं, कागज़ नहीं लगेंगे। नहीं जुड़ा है तो भुगतान के बाद सहायक दस्तावेज़ डाक या कूरियर से भेजने होंगे।',
    },
    {
      en: 'Upload your photo and signature if the site asks. Photo: recent, passport-size, plain background. Signature: on white paper with a black or blue pen. Upload proofs only if asked. Type *docs* to see the usual list.',
      hi: 'साइट माँगे तो अपनी फोटो और हस्ताक्षर अपलोड करें। फोटो: हाल की, पासपोर्ट साइज़, सादा बैकग्राउंड। हस्ताक्षर: सफेद कागज़ पर काले या नीले पेन से। प्रूफ तभी अपलोड करें जब माँगे। आम सूची देखने के लिए *docs* लिखें।',
    },
    {
      en: 'Pay the fee on the portal\'s own payment page (card, net banking or demand draft). The Income Tax Department lists ₹91 plus GST for an Indian address, so about ₹107. Nobody else should ask you for money to "process" it.',
      hi: 'फीस पोर्टल के अपने पेमेंट पेज पर ही भरें (कार्ड, नेट बैंकिंग या डिमांड ड्राफ्ट)। आयकर विभाग भारतीय पते के लिए ₹91 और GST बताता है, यानी करीब ₹107। इसे "प्रोसेस" करने के नाम पर कोई और पैसे न माँगे।',
    },
    {
      en: 'Submit and save your acknowledgement number. If you did not verify with Aadhaar OTP: print the acknowledgement, sign it, attach your photo and self-attested proofs, and post or courier it to the address the portal shows, within the time it shows.',
      hi: 'सबमिट करें और अपना acknowledgement नंबर सुरक्षित रखें। अगर आधार OTP से वेरिफाई नहीं किया: acknowledgement प्रिंट करें, साइन करें, फोटो और स्व-सत्यापित (self-attested) प्रूफ लगाएँ और पोर्टल पर दिखे पते पर, दिखाए गए समय के अंदर, डाक या कूरियर से भेजें।',
    },
    {
      en: 'Track the status on the same portal with your acknowledgement number. A physical card comes by post and takes a while; a digital e-PAN is faster.',
      hi: 'उसी पोर्टल पर acknowledgement नंबर से स्टेटस देखें। फिजिकल कार्ड डाक से आता है और समय लगता है; डिजिटल e-PAN जल्दी मिलता है।',
    },
  ],

  docsList: {
    en:
      'Documents usually needed (the portal shows the current list):\n' +
      '• ID proof: Aadhaar, voter ID, passport or driving licence\n' +
      '• Address proof: Aadhaar, voter ID, passport, driving licence, or a recent electricity bill / bank statement\n' +
      '• Date-of-birth proof: birth certificate, school leaving / 10th certificate, passport (Aadhaar is not accepted as proof of date of birth)\n' +
      '• A passport-size photo and your signature\n' +
      'With Aadhaar e-KYC you usually don\'t need to upload papers. Since the April 2026 change the portal may ask for extra supporting documents.',
    hi:
      'आमतौर पर ये दस्तावेज़ लगते हैं (मौजूदा सूची पोर्टल पर दिखती है):\n' +
      '• ID प्रूफ: आधार, वोटर ID, पासपोर्ट या ड्राइविंग लाइसेंस\n' +
      '• पते का प्रूफ: आधार, वोटर ID, पासपोर्ट, ड्राइविंग लाइसेंस, या हाल का बिजली बिल / बैंक स्टेटमेंट\n' +
      '• जन्मतिथि का प्रूफ: जन्म प्रमाणपत्र, स्कूल लीविंग / 10वीं का सर्टिफिकेट, पासपोर्ट (आधार जन्मतिथि का प्रूफ नहीं माना जाता)\n' +
      '• पासपोर्ट साइज़ फोटो और आपके हस्ताक्षर\n' +
      'आधार e-KYC से आमतौर पर कागज़ अपलोड नहीं करने पड़ते। अप्रैल 2026 के बदलाव के बाद पोर्टल अतिरिक्त सहायक दस्तावेज़ माँग सकता है।',
  },

  fixOrReprint: {
    en:
      'Fixing or reprinting an existing PAN:\n' +
      '• *Correction* (name, date of birth, address...): same portals (Protean / UTIITSL) → *Changes or Correction in existing PAN Data*. The portal shows the fee before you pay.\n' +
      '• *Reprint* of a lost card: the portals have a separate reprint request. The portal shows the fee before you pay.\n' +
      '• Just need the digital copy? Use *Instant E-PAN → Check Status/Download PAN* on incometax.gov.in.\n' +
      'Ask me anything about it, or type *menu*.',
    hi:
      'मौजूदा PAN में सुधार या दोबारा प्रिंट:\n' +
      '• *सुधार* (नाम, जन्मतिथि, पता...): वही पोर्टल (Protean / UTIITSL) → *Changes or Correction in existing PAN Data*। फीस पोर्टल भुगतान से पहले दिखाता है।\n' +
      '• खोए कार्ड का *रीप्रिंट*: पोर्टल पर अलग रीप्रिंट अनुरोध होता है। फीस पोर्टल भुगतान से पहले दिखाता है।\n' +
      '• सिर्फ डिजिटल कॉपी चाहिए? incometax.gov.in पर *Instant E-PAN → Check Status/Download PAN* इस्तेमाल करें।\n' +
      'इस बारे में कुछ भी पूछें, या *menu* लिखें।',
  },
};

