// The guide workspace: everything a guide screen needs beyond the plain steps.
// Structured documents, a fee calculator, watch-outs. All amounts and rules here come from the same official
// facts the assistant uses (services.js and factsextra.js). Where the facts do not give a number, there is no number.
import { SERVICES, L10, portalLine, nextQuestion, baseService } from './services.js';
import { findState } from './states.js';
import { ToolError } from './errors.js';

const T = (en, hi) => ({ en, hi });

// ---- documents (tickable list). `locker` says which saved ID would cover it. ------------------------------
const DOCS = {
  pan: [
    { id: 'id', label: T('ID proof', 'पहचान प्रमाण'), hint: T('Aadhaar, voter ID, passport or driving licence', 'आधार, वोटर आईडी, पासपोर्ट या ड्राइविंग लाइसेंस'), locker: ['aadhaar', 'voter_id', 'passport', 'driving_licence'] },
    { id: 'addr', label: T('Address proof', 'पते का प्रमाण'), hint: T('Aadhaar, voter ID, passport, licence, or a recent electricity bill or bank statement', 'आधार, वोटर आईडी, पासपोर्ट, लाइसेंस, या हाल का बिजली बिल या बैंक स्टेटमेंट'), locker: ['aadhaar'] },
    { id: 'dob', label: T('Date-of-birth proof', 'जन्मतिथि का प्रमाण'), hint: T('Birth certificate, school leaving or 10th certificate, or passport. Aadhaar is not accepted for this.', 'जन्म प्रमाणपत्र, स्कूल छोड़ने या 10वीं का प्रमाणपत्र, या पासपोर्ट। इसके लिए आधार मान्य नहीं है।') },
    { id: 'photo', label: T('Passport-size photo', 'पासपोर्ट साइज़ फोटो'), tool: 'photo' },
    { id: 'sign', label: T('Your signature', 'आपके हस्ताक्षर'), hint: T('On white paper, scanned', 'सफेद कागज़ पर, स्कैन किया हुआ'), tool: 'photo' },
    { id: 'mob', label: T('Mobile number linked to Aadhaar', 'आधार से जुड़ा मोबाइल नंबर'), hint: T('The OTP goes here. Needed for the instant e-PAN.', 'OTP इसी पर आता है। instant e-PAN के लिए ज़रूरी है।') },
  ],
  dl: [
    { id: 'dl', label: T('Your existing driving licence', 'आपका मौजूदा ड्राइविंग लाइसेंस'), hint: T('Number and date of birth', 'नंबर और जन्मतिथि'), locker: ['driving_licence'] },
    { id: 'f2', label: T('Form 2', 'फॉर्म 2'), hint: T('Filled online on Sarathi', 'Sarathi पर ऑनलाइन भरा जाता है') },
    { id: 'f1', label: T('Form 1: self-declaration of fitness', 'फॉर्म 1: शारीरिक फिटनेस की घोषणा') },
    { id: 'f1a', label: T('Form 1A: medical certificate', 'फॉर्म 1A: मेडिकल सर्टिफिकेट'), hint: T('Needed for transport vehicles and, as one official page says, if you are over 40', 'ट्रांसपोर्ट वाहनों के लिए, और एक सरकारी पेज के अनुसार 40 साल से ऊपर होने पर') },
    { id: 'photo', label: T('Passport-size photo and signature', 'पासपोर्ट साइज़ फोटो और हस्ताक्षर'), tool: 'photo' },
    { id: 'dup', label: T('For a duplicate: damaged licence, or a copy or FIR if lost', 'डुप्लीकेट के लिए: खराब लाइसेंस, या खोया हो तो कॉपी या FIR') },
  ],
  aadhaar: [
    { id: 'poi', label: T('Proof of identity', 'पहचान प्रमाण'), hint: T('A document with your photo and name', 'फोटो और नाम वाला दस्तावेज़') },
    { id: 'poa', label: T('Proof of address', 'पते का प्रमाण'), hint: T('A document showing where you live now', 'आप अभी जहाँ रहते हैं वह दिखाने वाला दस्तावेज़') },
    { id: 'dob', label: T('Proof of date of birth', 'जन्मतिथि का प्रमाण'), hint: T('Compulsory only when you change your date of birth', 'सिर्फ जन्मतिथि बदलते समय ज़रूरी') },
    { id: 'mob', label: T('Mobile number linked to Aadhaar', 'आधार से जुड़ा मोबाइल नंबर'), hint: T('For the OTP on the myAadhaar portal', 'myAadhaar पोर्टल के OTP के लिए') },
    { id: 'orig', label: T('Originals, if you go to a centre', 'केंद्र जाने पर असली दस्तावेज़'), hint: T('They are scanned and returned', 'स्कैन करके लौटा दिए जाते हैं') },
  ],
  voter: [
    { id: 'photo', label: T('Colour passport photo', 'रंगीन पासपोर्ट फोटो'), hint: T('Plain white background, 4.5 x 3.5 cm', 'सफेद बैकग्राउंड, 4.5 x 3.5 सेमी'), tool: 'photo' },
    { id: 'age', label: T('One age proof', 'एक आयु प्रमाण'), hint: T('Birth certificate, Aadhaar, PAN, licence, Class 10 or 12 certificate with date of birth, or passport', 'जन्म प्रमाणपत्र, आधार, PAN, लाइसेंस, जन्मतिथि वाला 10वीं या 12वीं का प्रमाणपत्र, या पासपोर्ट'), locker: ['aadhaar', 'pan', 'driving_licence', 'passport'] },
    { id: 'addr', label: T('One address proof', 'एक पते का प्रमाण'), hint: T('Utility bill (up to a year old), Aadhaar, bank passbook, passport, land record or registered rent deed. A parent\'s or spouse\'s works if they are enrolled at that address.', 'बिजली-पानी का बिल (एक साल तक पुराना), आधार, बैंक पासबुक, पासपोर्ट, ज़मीन का रिकॉर्ड या रजिस्टर्ड किराया-पत्र। माता-पिता या जीवनसाथी का भी चलेगा अगर वे उसी पते पर दर्ज हैं।'), locker: ['aadhaar', 'passport'] },
    { id: 'mob', label: T('Mobile number for the OTP', 'OTP के लिए मोबाइल नंबर') },
    { id: 'epic', label: T('EPIC number (for a correction, Form 8)', 'EPIC नंबर (सुधार, फॉर्म 8 के लिए)'), locker: ['voter_id'] },
  ],
  passport: [
    { id: 'addr', label: T('Address proof (original and one self-attested copy)', 'पते का प्रमाण (असली और एक स्व-सत्यापित कॉपी)'), hint: T('Aadhaar, electricity, water or gas bill, postpaid or landline bill, rent agreement, voter ID, bank passbook, or a parent\'s or spouse\'s passport copy', 'आधार, बिजली/पानी/गैस बिल, पोस्टपेड या लैंडलाइन बिल, किराया-पत्र, वोटर आईडी, बैंक पासबुक, या माता-पिता/जीवनसाथी के पासपोर्ट की कॉपी'), locker: ['aadhaar', 'voter_id'] },
    { id: 'dob', label: T('Date-of-birth proof (first passport)', 'जन्मतिथि का प्रमाण (पहला पासपोर्ट)'), hint: T('Birth certificate, school leaving or Class 10 certificate, PAN, licence, voter ID or insurance bond', 'जन्म प्रमाणपत्र, स्कूल छोड़ने या 10वीं का प्रमाणपत्र, PAN, लाइसेंस, वोटर आईडी या बीमा बॉन्ड'), locker: ['pan', 'driving_licence', 'voter_id'] },
    { id: 'old', label: T('Old passport, for a renewal', 'पुराना पासपोर्ट, रिन्यूअल के लिए'), hint: T('Plus a self-attested copy of its first two and last two pages and any observation or extension page', 'साथ में उसके पहले दो और आखिरी दो पन्नों और किसी ऑब्ज़र्वेशन या एक्सटेंशन पेज की स्व-सत्यापित कॉपी'), locker: ['passport'] },
    { id: 'name', label: T('Name-change proof, if your name changed', 'नाम बदला हो तो उसका प्रमाण'), hint: T('Marriage certificate or gazette notification', 'विवाह प्रमाणपत्र या गैज़ेट अधिसूचना') },
    { id: 'child', label: T('For a child under 18: a parent\'s passport copy and the parents\' declaration', '18 साल से कम के बच्चे के लिए: माता-पिता के पासपोर्ट की कॉपी और उनकी घोषणा') },
    { id: 'mob', label: T('Mobile number and email', 'मोबाइल नंबर और ईमेल'), hint: T('The photo is taken at the passport centre (PSK)', 'फोटो पासपोर्ट केंद्र (PSK) पर लिया जाता है') },
  ],
  gst: [
    { id: 'pan', label: T('PAN of the business or owner', 'बिज़नेस या मालिक का PAN'), locker: ['pan'] },
    { id: 'setup', label: T('Proof of how the business is set up', 'बिज़नेस कैसे बना है उसका प्रमाण'), hint: T('Partnership deed or incorporation certificate. Not needed for a sole proprietor.', 'पार्टनरशिप डीड या इनकॉर्पोरेशन सर्टिफिकेट। सिंगल प्रोपराइटर के लिए ज़रूरी नहीं।') },
    { id: 'owner', label: T('Owner or partner details', 'मालिक या पार्टनर के विवरण'), hint: T('PAN, Aadhaar, address, photo (and DIN for companies)', 'PAN, आधार, पता, फोटो (कंपनी के लिए DIN भी)'), locker: ['aadhaar'] },
    { id: 'auth', label: T('Proof for the authorised signatory', 'अधिकृत हस्ताक्षरकर्ता का प्रमाण'), hint: T('Appointment letter or board resolution, and a photo', 'नियुक्ति पत्र या बोर्ड रेज़ोल्यूशन, और फोटो') },
    { id: 'place', label: T('Proof of the business place', 'बिज़नेस की जगह का प्रमाण'), hint: T('Ownership document, or rent agreement with the owner\'s consent, or a utility bill', 'मालिकाना दस्तावेज़, या मालिक की सहमति वाला किराया-पत्र, या यूटिलिटी बिल') },
    { id: 'bank', label: T('Bank details', 'बैंक विवरण'), hint: T('Cancelled cheque or first page of the statement. Can be added later.', 'कैंसल चेक या स्टेटमेंट का पहला पन्ना। बाद में भी जोड़ सकते हैं।') },
    { id: 'mob', label: T('Mobile linked to Aadhaar and a working email', 'आधार से जुड़ा मोबाइल और चालू ईमेल'), hint: T('Both get OTPs', 'दोनों पर OTP आते हैं') },
  ],
  income: [
    { id: 'id', label: T('Photo ID', 'फोटो पहचान पत्र'), hint: T('Aadhaar or voter ID', 'आधार या वोटर आईडी'), locker: ['aadhaar', 'voter_id'] },
    { id: 'addr', label: T('Address proof', 'पते का प्रमाण'), locker: ['aadhaar'] },
    { id: 'inc', label: T('Income proof or self-declaration', 'आय का प्रमाण या स्व-घोषणा'), hint: T('Salary slip, ITR or employer certificate where relevant', 'सैलरी स्लिप, ITR या नियोक्ता का प्रमाणपत्र, जहाँ लागू हो') },
    { id: 'photo', label: T('Recent passport photo', 'हाल का पासपोर्ट फोटो'), tool: 'photo' },
    { id: 'ration', label: T('Ration card or family details (some states)', 'राशन कार्ड या परिवार का विवरण (कुछ राज्य)') },
  ],
  caste: [
    { id: 'proof', label: T('Proof of caste from a family member', 'परिवार के सदस्य से जाति का प्रमाण'), hint: T('An old caste certificate, school leaving certificate, or land record showing caste', 'पुराना जाति प्रमाणपत्र, स्कूल छोड़ने का प्रमाणपत्र, या जाति दिखाने वाला ज़मीन का रिकॉर्ड') },
    { id: 'res', label: T('Residence proof', 'निवास प्रमाण'), hint: T('Some states ask for present and permanent address', 'कुछ राज्य वर्तमान और स्थायी दोनों पते माँगते हैं') },
    { id: 'id', label: T('Photo ID', 'फोटो पहचान पत्र'), hint: T('Aadhaar or voter ID', 'आधार या वोटर आईडी'), locker: ['aadhaar', 'voter_id'] },
    { id: 'photo', label: T('Passport photo', 'पासपोर्ट फोटो'), tool: 'photo' },
    { id: 'ref', label: T('Family details, and two local referees in some states', 'परिवार का विवरण, और कुछ राज्यों में दो स्थानीय गवाह') },
    { id: 'mig', label: T('Proof of migration, if you came from another state', 'दूसरे राज्य से आए हों तो प्रवास का प्रमाण') },
    { id: 'income', label: T('Income proof (OBC non-creamy-layer only)', 'आय का प्रमाण (सिर्फ OBC नॉन-क्रीमी लेयर)') },
  ],
};

// ---- things people get wrong, from the official facts ------------------------------------------------------
const TIPS = {
  pan: [
    T('Having two PANs is not allowed. If you already have one, correct or reprint it instead.', 'दो PAN रखना मना है। पहले से है तो नया नहीं, सुधार या रीप्रिंट कराएँ।'),
    T('The instant e-PAN needs a mobile number linked to your Aadhaar. Check it on myaadhaar.uidai.gov.in first.', 'instant e-PAN के लिए आधार से जुड़ा मोबाइल नंबर चाहिए। पहले myaadhaar.uidai.gov.in पर जाँच लें।'),
    T('Aadhaar is not accepted as proof of date of birth for a PAN.', 'PAN के लिए जन्मतिथि के प्रमाण में आधार मान्य नहीं है।'),
    T('Name and date of birth must match on your PAN and Aadhaar, or linking them fails.', 'PAN और आधार में नाम और जन्मतिथि एक जैसी होनी चाहिए, वरना लिंक नहीं होगा।'),
    T('The e-PAN is a digital PDF. You can ask for a physical card later on Protean or UTIITSL.', 'e-PAN डिजिटल PDF होता है। फिजिकल कार्ड बाद में Protean या UTIITSL से माँग सकते हैं।'),
  ],
  dl: [
    T('States add their own charges for smart card and postage, so the payment screen shows the final amount.', 'राज्य स्मार्ट कार्ड और डाक का अपना शुल्क जोड़ते हैं, इसलिए अंतिम रकम पेमेंट स्क्रीन पर दिखती है।'),
    T('Renewing late costs more: Rs 300, plus Rs 1,000 for each year or part after the first.', 'देर से रिन्यू करने पर ज़्यादा लगता है: ₹300, और पहले साल के बाद हर साल या उसके हिस्से के ₹1,000।'),
    T('Your state may ask for more than the central list. Check the Sarathi page for your state.', 'आपका राज्य केंद्र की लिस्ट से ज़्यादा माँग सकता है। अपने राज्य का Sarathi पेज देखें।'),
  ],
  aadhaar: [
    T('Document updates on the myAadhaar portal are free until 14 June 2027. Centres charge Rs 75.', 'myAadhaar पोर्टल पर दस्तावेज़ अपडेट 14 जून 2027 तक मुफ्त है। केंद्र पर ₹75 लगता है।'),
    T('Biometric updates (fingerprints, iris, photo) have to be done at a centre.', 'बायोमेट्रिक अपडेट (फिंगरप्रिंट, आईरिस, फोटो) केंद्र पर ही होते हैं।'),
    T('Changing your date of birth needs a date-of-birth proof document.', 'जन्मतिथि बदलने के लिए जन्मतिथि का प्रमाण चाहिए।'),
    T('Keep the request number (URN) until the update shows.', 'अपडेट दिखने तक रिक्वेस्ट नंबर (URN) संभालकर रखें।'),
  ],
  voter: [
    T('Form 6 is free at the election offices. If anyone asks you for money, stop and call the helpline 1950.', 'फॉर्म 6 चुनाव कार्यालयों में मुफ्त है। कोई पैसे माँगे तो रुकें और हेल्पलाइन 1950 पर फोन करें।'),
    T('Aadhaar is optional for a voter ID. Your mobile number is needed for the OTP.', 'वोटर आईडी के लिए आधार वैकल्पिक है। OTP के लिए मोबाइल नंबर चाहिए।'),
    T('A correction uses Form 8 and needs your EPIC number and proof for the item you change.', 'सुधार फॉर्म 8 से होता है और इसमें EPIC नंबर और बदली जाने वाली चीज़ का प्रमाण लगता है।'),
  ],
  passport: [
    T('Always confirm the amount in the Fee Calculator on passportindia.gov.in before you pay.', 'पेमेंट से पहले हमेशा passportindia.gov.in के फीस कैलकुलेटर में रकम जाँच लें।'),
    T('Tatkaal adds Rs 2,500 to the fee.', 'तत्काल में फीस पर ₹2,500 और लगते हैं।'),
    T('Take the originals plus one self-attested photocopy to the passport centre. The photo is taken there.', 'पासपोर्ट केंद्र पर असली दस्तावेज़ और एक स्व-सत्यापित फोटोकॉपी ले जाएँ। फोटो वहीं खिंचती है।'),
    T('A name change needs extra proof, like a marriage certificate or a gazette notification.', 'नाम बदलने के लिए अतिरिक्त प्रमाण चाहिए, जैसे विवाह प्रमाणपत्र या गैज़ेट अधिसूचना।'),
  ],
  gst: [
    T('The GST portal charges no registration fee. If someone asks for money to process it, that is an agent fee, not the government\'s.', 'GST पोर्टल रजिस्ट्रेशन की कोई फीस नहीं लेता। कोई पैसे माँगे तो वह एजेंट की फीस है, सरकार की नहीं।'),
    T('You need a mobile linked to Aadhaar and a working email. Both receive OTPs.', 'आधार से जुड़ा मोबाइल और चालू ईमेल चाहिए। दोनों पर OTP आते हैं।'),
    T('Some states ask for extra items, for example an electricity consumer number.', 'कुछ राज्य अतिरिक्त चीज़ें माँगते हैं, जैसे बिजली उपभोक्ता नंबर।'),
    T('Keep the ARN until approval comes.', 'मंज़ूरी आने तक ARN संभालकर रखें।'),
  ],
  income: [
    T('Fee, validity and documents differ by state. Your state portal shows the exact amount before you pay.', 'फीस, वैधता और दस्तावेज़ राज्य के अनुसार अलग होते हैं। पेमेंट से पहले आपका राज्य पोर्टल सही रकम दिखाता है।'),
    T('Income certificates are usually valid for a year or a financial year. Check the date on yours.', 'आय प्रमाणपत्र आमतौर पर एक साल या एक वित्त वर्ष के लिए वैध होते हैं। अपने का तारीख देखें।'),
    T('You can also apply at a CSC centre or the tehsil office.', 'CSC केंद्र या तहसील कार्यालय में भी आवेदन कर सकते हैं।'),
  ],
  caste: [
    T('SC and ST certificates are generally lifelong once issued. OBC non-creamy-layer certificates usually cover one financial year.', 'SC और ST प्रमाणपत्र जारी होने के बाद आमतौर पर आजीवन वैध रहते हैं। OBC नॉन-क्रीमी लेयर प्रमाणपत्र आमतौर पर एक वित्त वर्ष के लिए होते हैं।'),
    T('The fee is set by each state. Your portal shows the amount before you pay.', 'फीस हर राज्य तय करता है। पेमेंट से पहले आपका पोर्टल रकम दिखाता है।'),
    T('Some states want two local referees or proof of migration.', 'कुछ राज्य दो स्थानीय गवाह या प्रवास का प्रमाण माँगते हैं।'),
  ],
};

// ---- fee calculators ------------------------------------------------------------------------------------
// fields: [{ key, label, type: 'choice'|'toggle'|'number', choices: [[id, label]], when(sel), def }]
// compute(sel) -> { lines: [{ label, amount|null, note? }], total: [min, max]|null, notes: [text] }
const c2 = (id, en, hi) => [id, T(en, hi)];
const ln = (en, hi, amount, note) => ({ label: T(en, hi), amount, ...(note ? { note } : {}) });
const GST_RATE = 0.18;

const CALC = {
  pan: {
    fields: [
      { key: 'kind', label: T('What do you need?', 'आपको क्या चाहिए?'), type: 'choice', def: 'epan', choices: [c2('epan', 'Instant e-PAN', 'Instant e-PAN'), c2('new', 'Full new application', 'पूरा नया आवेदन'), c2('fix', 'Correction or reprint', 'सुधार या रीप्रिंट')] },
      { key: 'addr', label: T('Address on the form', 'फॉर्म पर पता'), type: 'choice', def: 'in', when: (s) => s.kind === 'new', choices: [c2('in', 'India', 'भारत'), c2('abroad', 'Outside India', 'भारत के बाहर')] },
    ],
    compute(s) {
      if (s.kind === 'epan') return { lines: [ln('Instant e-PAN with Aadhaar OTP', 'Aadhaar OTP से instant e-PAN', 0)], total: [0, 0], notes: [T('Free. Digital PDF only.', 'मुफ्त। सिर्फ डिजिटल PDF।')] };
      if (s.kind === 'fix') return { lines: [ln('Correction or reprint, Indian address (with GST)', 'सुधार या रीप्रिंट, भारतीय पता (GST सहित)', 50)], total: [50, 50], approx: true, notes: [T('About Rs 50. Protean or UTIITSL show the exact amount before you pay.', 'करीब ₹50। Protean या UTIITSL पेमेंट से पहले सही रकम दिखाते हैं।')] };
      const base = s.addr === 'abroad' ? 862 : 91;
      const gst = Math.round(base * GST_RATE);
      return { lines: [ln('Application fee', 'आवेदन शुल्क', base), ln('GST (about 18%)', 'GST (करीब 18%)', gst)], total: [base + gst, base + gst], approx: true, notes: [T('Paid on the portal. The portal shows the exact fee.', 'पोर्टल पर ही भरना है। पोर्टल सही फीस दिखाता है।')] };
    },
  },
  dl: {
    fields: [
      { key: 'what', label: T('What do you need?', 'आपको क्या चाहिए?'), type: 'choice', def: 'renew', choices: [c2('renew', 'Renew on time', 'समय पर रिन्यू'), c2('late', 'Renew late', 'देर से रिन्यू'), c2('dup', 'Duplicate', 'डुप्लीकेट')] },
      { key: 'years', label: T('How late? (years, or part of a year)', 'कितनी देर? (साल, या साल का हिस्सा)'), type: 'number', min: 1, max: 15, def: 1, when: (s) => s.what === 'late' },
      { key: 'cls', label: T('Add a vehicle class', 'वाहन क्लास जोड़ें'), type: 'toggle', def: false },
    ],
    compute(s) {
      const lines = [];
      let lo = 0; let hi = 0; const notes = [T('States add user charges, smart-card and postage costs. The payment screen shows the final amount.', 'राज्य यूज़र चार्ज, स्मार्ट कार्ड और डाक का खर्च जोड़ते हैं। अंतिम रकम पेमेंट स्क्रीन पर दिखती है।')];
      if (s.what === 'renew') { lines.push(ln('Renewal', 'रिन्यूअल', 200)); lo += 200; hi += 200; }
      else if (s.what === 'late') {
        const y = Math.max(1, Math.min(15, Number(s.years) || 1));
        lines.push(ln('Late renewal', 'देर से रिन्यूअल', 300));
        lo += 300; hi += 300;
        if (y > 1) { lines.push(ln(`Delay charge, ${y - 1} year${y > 2 ? 's' : ''} after the first`, `देरी शुल्क, पहले साल के बाद ${y - 1} साल`, 1000 * (y - 1))); lo += 1000 * (y - 1); hi += 1000 * (y - 1); }
      } else lines.push({ label: T('Duplicate licence', 'डुप्लीकेट लाइसेंस'), amount: null, note: T('The fee is only shown on the payment screen.', 'फीस सिर्फ पेमेंट स्क्रीन पर दिखती है।') });
      if (s.cls) { lines.push(ln('Add a vehicle class', 'वाहन क्लास जोड़ना', 500)); lo += 500; hi += 500; }
      return { lines, total: s.what === 'dup' && !s.cls ? null : [lo, hi], partial: s.what === 'dup', approx: false, notes };
    },
  },
  aadhaar: {
    fields: [
      { key: 'where', label: T('Where will you update?', 'कहाँ अपडेट करेंगे?'), type: 'choice', def: 'online', choices: [c2('online', 'Online (myAadhaar)', 'ऑनलाइन (myAadhaar)'), c2('centre', 'At a centre', 'केंद्र पर')] },
      { key: 'what', label: T('What are you updating?', 'क्या अपडेट कर रहे हैं?'), type: 'choice', def: 'doc', when: (s) => s.where === 'centre', choices: [c2('doc', 'Document or demographic', 'दस्तावेज़ या डेमोग्राफिक'), c2('bio', 'Biometric', 'बायोमेट्रिक')] },
      { key: 'both', label: T('Demographic update done together with a biometric one', 'बायोमेट्रिक के साथ ही डेमोग्राफिक अपडेट'), type: 'toggle', def: false, when: (s) => s.where === 'centre' && s.what === 'bio' },
      { key: 'child', label: T('Child aged 5 to 17 (mandatory biometric update)', 'बच्चा 5 से 17 साल का (अनिवार्य बायोमेट्रिक अपडेट)'), type: 'toggle', def: false, when: (s) => s.where === 'centre' && s.what === 'bio' },
    ],
    compute(s) {
      if (s.where === 'online') return { lines: [ln('Document update on myAadhaar', 'myAadhaar पर दस्तावेज़ अपडेट', 0)], total: [0, 0], notes: [T('Free until 14 June 2027.', '14 जून 2027 तक मुफ्त।')] };
      if (s.what === 'doc') return { lines: [ln('Document or demographic update', 'दस्तावेज़ या डेमोग्राफिक अपडेट', 75)], total: [75, 75], notes: [] };
      if (s.child) return { lines: [ln('Mandatory biometric update, ages 5 to 17', 'अनिवार्य बायोमेट्रिक अपडेट, 5 से 17 साल', 0)], total: [0, 0], notes: [T('UIDAI says free until 30 September 2027, but an older fee sheet said ages 7 to 15 only until 30 September 2026. Check the myAadhaar page before you pay.', 'UIDAI के अनुसार 30 सितंबर 2027 तक मुफ्त, पर एक पुरानी फीस शीट में सिर्फ 7 से 15 साल के लिए 30 सितंबर 2026 तक लिखा था। पेमेंट से पहले myAadhaar पेज देखें।')] };
      return { lines: [ln('Biometric update', 'बायोमेट्रिक अपडेट', 125), ...(s.both ? [ln('Demographic update done together', 'साथ में डेमोग्राफिक अपडेट', 0, T('Free with a biometric update', 'बायोमेट्रिक के साथ मुफ्त'))] : [])], total: [125, 125], notes: [] };
    },
  },
  voter: {
    fields: [{ key: 'what', label: T('What do you need?', 'आपको क्या चाहिए?'), type: 'choice', def: 'new', choices: [c2('new', 'New voter (Form 6)', 'नया वोटर (फॉर्म 6)'), c2('fix', 'Correction (Form 8)', 'सुधार (फॉर्म 8)'), c2('get', 'Download my card', 'कार्ड डाउनलोड')] }],
    compute: () => ({ lines: [ln('Form fee', 'फॉर्म शुल्क', 0)], total: [0, 0], notes: [T('The Election Commission says Form 6 is free. No page shows a fee for the other forms. If anyone asks for money, call 1950.', 'चुनाव आयोग के अनुसार फॉर्म 6 मुफ्त है। बाकी फॉर्म की कोई फीस किसी पेज पर नहीं दिखती। कोई पैसे माँगे तो 1950 पर फोन करें।')] }),
  },
  passport: {
    fields: [
      { key: 'book', label: T('Which passport?', 'कौन सा पासपोर्ट?'), type: 'choice', def: 'p36', choices: [c2('p36', '36 pages, 10 years', '36 पन्ने, 10 साल'), c2('p60', '60 pages, 10 years', '60 पन्ने, 10 साल'), c2('minor', 'Child under 18', '18 साल से कम का बच्चा'), c2('lost', 'Lost, stolen or damaged', 'खोया, चोरी या खराब')] },
      { key: 'tatkal', label: T('Tatkaal (faster)', 'तत्काल (जल्दी)'), type: 'toggle', def: false },
      { key: 'rebate', label: T('Child of 8 or under, or over 60 (fresh application)', '8 साल या कम का बच्चा, या 60 से ऊपर (नया आवेदन)'), type: 'toggle', def: false, when: (s) => s.book !== 'lost' },
    ],
    compute(s) {
      const lines = [];
      let lo; let hi;
      if (s.book === 'lost') { lines.push({ label: T('Lost, stolen or damaged passport', 'खोया, चोरी या खराब पासपोर्ट'), amount: null, range: [4250, 6000] }); lo = 4250; hi = 6000; }
      else {
        const base = { p36: 2500, p60: 3500, minor: 1750 }[s.book] || 2500;
        lines.push(ln('Passport fee', 'पासपोर्ट फीस', base)); lo = hi = base;
        if (s.rebate) { const off = Math.round(base * 0.1); lines.push(ln('10% rebate', '10% छूट', -off)); lo -= off; hi -= off; }
      }
      if (s.tatkal) { lines.push(ln('Tatkaal', 'तत्काल', 2500)); lo += 2500; hi += 2500; }
      return { lines, total: [lo, hi], notes: [T('Confirm the amount in the Fee Calculator on passportindia.gov.in before you pay. Table in force from 1 July 2026.', 'पेमेंट से पहले passportindia.gov.in के फीस कैलकुलेटर में रकम जाँच लें। तालिका 1 जुलाई 2026 से लागू।')] };
    },
  },
  gst: {
    fields: [],
    compute: () => ({ lines: [ln('GST registration', 'GST रजिस्ट्रेशन', 0)], total: [0, 0], notes: [T('The GST portal charges no fee. Anyone asking for money is an agent or consultant.', 'GST पोर्टल कोई फीस नहीं लेता। पैसे माँगने वाला एजेंट या कंसल्टेंट है।')] }),
  },
  income: { fields: [], compute: null },
  caste: { fields: [], compute: null },
};

// Examples the official portals show. Used only as a hint list, never added up.
const FEE_HINTS = {
  income: [T('Maharashtra: Rs 20 for an income certificate', 'महाराष्ट्र: आय प्रमाणपत्र के ₹20'), T('Rajasthan e-Mitra: adds a Rs 50 kiosk charge', 'राजस्थान e-Mitra: ₹50 कियोस्क शुल्क जुड़ता है'), T('Karnataka portal: shows both Rs 25 and Rs 40', 'कर्नाटक पोर्टल: ₹25 और ₹40 दोनों दिखते हैं')],
  caste: [T('Maharashtra: Rs 40 for a caste certificate', 'महाराष्ट्र: जाति प्रमाणपत्र के ₹40'), T('Often nothing or a small service charge. Not confirmed from an official page for every state.', 'अक्सर कुछ नहीं या छोटा सेवा शुल्क। हर राज्य के लिए किसी सरकारी पेज से पुष्टि नहीं।')],
};

const plainMd = (s) => String(s || '').replace(/\*/g, '');
const lg = (l) => (l === 'hi' || l === 'en' ? l : l || 'en');
const tx = (o, l) => (o ? L10(o, lg(l)) : '');

function qOut(q, l) {
  return { key: q.key, type: q.type, text: plainMd(tx(q, l)), options: (q.options || []).map(([id, en, hi]) => ({ id, label: l === 'hi' ? hi : en })) };
}
const stateIdOf = (name) => (name ? findState(name)?.id || null : null);

function svcOf(id) {
  const s = baseService(id) || SERVICES.find((x) => x.id === id);
  if (!s) throw new ToolError('unknown_service');
  return s;
}

/** Ops for the guide screens. Pure: they read nothing about the person. */
export function guideOps() {
  return {
    async 'guide.get'(uid, a) {
      const s = svcOf(String(a.id || ''));
      const l = lg(a.lang);
      const calc = CALC[s.id];
      return {
        id: s.id,
        name: tx(s.name, l),
        blurb: tx(s.blurb, l),
        hasSteps: Object.values(s.routes || {}).some((r) => r.steps),
        askFirst: s.intake?.length > 0,
        docs: (DOCS[s.id] || []).map((d) => ({ id: d.id, label: tx(d.label, l), hint: tx(d.hint, l), locker: d.locker || [], tool: d.tool || null })),
        fee: plainMd(tx(s.fee, l)),
        calc: calc?.compute ? { fields: calc.fields.map((f) => ({ key: f.key, label: tx(f.label, l), type: f.type, def: f.def, min: f.min, max: f.max, choices: (f.choices || []).map(([id, lab]) => ({ id, label: tx(lab, l) })) })) } : null,
        feeHints: (FEE_HINTS[s.id] || []).map((h) => tx(h, l)),
        tips: (TIPS[s.id] || []).map((t) => tx(t, l)),
        after: plainMd(tx(s.after, l)),
        sheet: s.sheet || [],
        self: plainMd(tx(s.self, l)),
      };
    },
    /** Answers so far in, next question or the finished route out. */
    async 'guide.route'(uid, a) {
      const s = svcOf(String(a.id || ''));
      const l = lg(a.lang);
      const ans = {};
      for (const [k, v] of Object.entries(a.answers && typeof a.answers === 'object' ? a.answers : {}).slice(0, 8)) {
        const q = s.intake.find((x) => x.key === k);
        if (!q) continue;
        if (q.type === 'state') {
          const id = stateIdOf(String(v));
          if (id) ans[k] = id;
        } else if (q.type === 'yn') { if (v === 'y' || v === 'n') ans[k] = v; }
        else if ((q.options || []).some((o) => o[0] === v)) ans[k] = v;
      }
      const q = nextQuestion(s, ans);
      if (q) return { question: qOut(q, l), answered: Object.keys(ans).length };
      const pick = s.pick ? s.pick(ans) : { route: Object.keys(s.routes)[0] };
      const r = s.routes[pick.route];
      if (!r) throw new ToolError('no_route');
      const portal = plainMd(portalLine(ans.state, l));
      const fill = (t) => plainMd(String(t).replaceAll('{portal}', portal));
      if (r.kind === 'info') return { route: { id: pick.route, kind: 'info', text: fill(tx(r.text, l)) }, ans };
      const note = pick.note ? tx(pick.note, l) : '';
      return {
        route: {
          id: pick.route,
          kind: 'steps',
          intro: fill(tx(r.intro, l).replace('{n}', String(r.steps.length)).replace('{note}', note ? note : '')).trim(),
          steps: r.steps.map((st) => fill(tx(st, l))),
        },
        ans,
      };
    },
    async 'guide.fee'(uid, a) {
      const s = svcOf(String(a.id || ''));
      const l = lg(a.lang);
      const c = CALC[s.id];
      if (!c?.compute) throw new ToolError('no_calc');
      const sel = {};
      for (const f of c.fields) {
        const v = a.sel?.[f.key];
        if (f.type === 'toggle') sel[f.key] = v === undefined ? Boolean(f.def) : Boolean(v);
        else if (f.type === 'number') sel[f.key] = Math.max(f.min ?? 0, Math.min(f.max ?? 99, Math.round(Number(v ?? f.def)) || f.def));
        else sel[f.key] = f.choices.some((x) => x[0] === v) ? v : f.def;
      }
      const r = c.compute(sel);
      return {
        sel,
        lines: r.lines.map((x) => ({ label: tx(x.label, l), amount: x.amount ?? null, range: x.range || null, note: x.note ? tx(x.note, l) : '' })),
        total: r.total,
        approx: Boolean(r.approx),
        partial: Boolean(r.partial),
        notes: (r.notes || []).map((n) => tx(n, l)),
        visible: c.fields.filter((f) => !f.when || f.when(sel)).map((f) => f.key),
      };
    },
  };
}
