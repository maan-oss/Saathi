import { t, tr } from './messages.js';
import { R } from './rich.js';
import { STATE_NAMES } from './states.js';
import { FIELDS, GENDER, normField, normAll, missingKeys, fieldDef, shown, fromExtraction } from './profile.js';
import { charge, refund, credit, buyPack, grantTrial, balance, activePack, rates, inr } from './billing.js';
import {
  SERVICES,
  serviceById,
  baseService,
  nextQuestion,
  matchOption,
  matchState,
  portalLine,
  L10,
  optTitle,
  serviceFacts,
  overviewFacts,
  crossFacts,
  detectServices,
  detectService,
  LAST_VERIFIED,
} from './services.js';
import { LANGS, WA_LANGS, langDef, matchLang, isReady } from './i18n.js';
import { analyze, sensitiveKind } from './scamcheck.js';
import { TYPES, TYPE_IDS, typeName, normNumber, showNumber, maskNumber, normExpiry, fmtDate as fmtIso, daysLeft, detectQuestion } from './locker.js';
import { parseFutureDate, fmtDue, makeReminder, MAX_REMINDERS, daysUntil } from './reminders.js';

// ---- input normalisation -------------------------------------------------
const clean = (s) => (s || '').toLowerCase().trim().replace(/[.!?,।]+$/g, '');
const set = (...xs) => new Set(xs);
const YES = set('1', 'y', 'yes', 'haan', 'han', 'ha', 'हाँ', 'हां', 'हा', 'जी', 'ji');
const NO = set('2', 'n', 'no', 'nahi', 'nahin', 'nope', 'नहीं', 'नही');
const NEXT = set('next', 'n', 'ok', 'okay', 'done', '1', 'आगे', 'हो गया', 'हो गई', 'होगया');
const BACK = set('back', 'b', '2', 'पीछे', 'वापस');
const MENU = set('menu', 'मेनू', 'मैन्यू', 'मेन्यू', '0', 'restart');
const MENU_WORDS = set('hi', 'hii', 'hello', 'hey', 'namaste', 'नमस्ते', 'start', 'help', 'हेलो', 'हाय');
const AGENT = set('agent', 'human', 'एजेंट', 'इंसान', 'इंसान से बात');
const DOCS = set('docs', 'documents', 'दस्तावेज़', 'दस्तावेज', 'डॉक्स');
const FEES = set('fee', 'fees', 'cost', 'फीस', 'शुल्क');
const DELETE = set('delete', 'delete my data', 'डिलीट', 'हटाओ');
const ENGLISH = set('english', 'अंग्रेज़ी', 'अंग्रेजी');
const HINDI = set('hindi', 'हिंदी', 'हिन्दी');
const LANGUAGE = set('language', 'lang', 'भाषा');
const WALLET = set('wallet', 'balance', 'वॉलेट', 'बैलेंस');
const TOPUP = set('topup', 'top up', 'recharge', 'add money', 'टॉपअप', 'टॉप-अप');
const PROFILE = set('profile', 'my profile', 'प्रोफाइल');
const SHEET = set('sheet', 'form sheet', 'शीट');
const SCAN = set('scan', 'स्कैन');
const LOCKER = set('locker', 'vault', 'my locker', 'my vault', 'लॉकर', 'वॉल्ट');
const FILL = set('fill', 'details', 'add details', 'update details');
const FORGET = set('forget', 'forget me');
const PACK = set('pack', 'saathi pack', 'pan pack', 'पैक');
const SERVICES_CMD = set('services', 'service', 'guide', 'सेवाएँ', 'सेवाएं');
const REMIND = set('remind', 'reminder', 'reminders', 'रिमाइंडर');
const SCAM = set('scam', 'check', 'safe', 'safety', 'is this real', 'is it real', 'fake', 'स्कैम', 'ठगी', 'सुरक्षा', 'असली');
const SOURCES = set('sources', 'source', 'why', 'how do you know', 'स्रोत', 'सोर्स');
const HISTORY = set('history', 'receipts', 'receipt', 'ledger', 'हिसाब', 'रसीद', 'रसीदें');
const SKIP = set('skip', 'छोड़ें', 'छोड़ो');
const KEEP = set('keep', 'रहने दें');
const SAVE = set('save', 'सेव करें', 'सेव');
const ONCE = set('once', 'use once', 'सिर्फ अभी');
const DISCARD = set('discard', 'हटा दें', 'हटाओ');
const DEVANAGARI = /[ऀ-ॿ]/;

const MAX_QUESTION_CHARS = 500;
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const CORE_KEYS = ['full_name', 'dob', 'father_name', 'gender', 'address', 'pincode'];

const QA_CACHE = new Map();
const STATE_SYSTEM = `Which Indian state or union territory does the text name? Accept spelling mistakes, short forms, Hindi or other Indian scripts, and cities or districts (answer with their state or union territory). Reply with ONLY the official English name from this list, or NONE if it is not a place in India or you cannot tell: ${STATE_NAMES.join(', ')}.`;
const HINGLISH = /\b(kya|kaise|kaisa|kitna|kitne|karna|karu|kare|hai|hain|mera|meri|mujhe|chahiye|batao|bataiye|paisa|nahi|nahin|aur|ke liye|banwana|banwane|lagega|lagta|kab|kahan|kahaan)\b/i;
/** The language of the person's latest message, so a free model cannot drift into another language. */
function langHint(q) {
  if (/[\u0900-\u097F]/.test(q)) return 'Hindi (Devanagari)';
  if (/[\u0980-\u0DFF\u0600-\u06FF]/.test(q)) return null;
  return HINGLISH.test(q) ? 'Hinglish (Hindi in English letters)' : 'English';
}

function qaSystemPrompt(langName, svc, context, web = null, more = [], said = null) {
  const lines = [
    'You are Saathi, a warm assistant that helps people in India with government paperwork (PAN, driving licence, Aadhaar, voter ID, passport, GST, state income and caste certificates). Sound like a helpful friend. Greetings get a short hello and a question about what they need.',
    'RULES: Answer the question directly and confidently, with the exact rupee amounts, dates and steps from the FACTS below. Never reply with only "check the website": give the answer first, then at most one short line saying where the live figure shows (for example the portal fee page). If the FACTS do not cover a detail, use only what you are certain is standard and stable for Indian government procedures and say "usually" or "about"; if you truly do not know, say that in one sentence and name the one official place to look, never a vague "check the site". Where the FACTS say NOT CONFIRMED, give the typical value with "usually" and say the portal shows the exact amount. Lines marked LATEST READ FROM OFFICIAL PAGES override older lines. Never ask for or repeat OTPs, passwords or Aadhaar/PAN numbers. You only guide, you cannot submit applications. No tax or legal advice; steer unrelated questions back politely.',
    web
      ? `${said ? `The person's latest message is in ${said}: reply in ${said}. ` : ''}Reply in the SAME language and script as the person's latest message (Hindi gets Devanagari, Hinglish gets Hinglish, other Indian languages their own script); if unclear use ${langName}. Plain short words, at most 120 words, answer first, only *bold*, no headings or tables. Use the conversation so far; do not repeat yourself.`
      : `Reply in ${langName}, short plain words, at most 110 words, only *bold*, no headings or tables.`,
  ];
  if (web) {
    lines.push(
      'Last line: ACTIONS: then up to two ids that truly help next (comma separated) or none. Ids: guide (step-by-step guide), docs, info (everything needed for one service in one card), fees (only when a service is being discussed), scan (check a document photo), details (their saved details for form filling), locker (saved IDs and expiry dates), reminders, track (track an application), photo (resize a photo or signature), check (is a message a scam). Never write ACTIONS anywhere else.',
    );
  }
  lines.push('', 'FACTS:', more.length > 1 ? more.map(serviceFacts).join('\n\n') : svc ? serviceFacts(svc) : crossFacts(), context ? `\nCurrent step: ${context}` : '');
  return lines.join('\n');
}

const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/**
 * The conversation engine. The main path is a scripted state machine (free to run).
 * The AI is only used for free-form questions and reading documents, only while the CostGuard allows it,
 * and every paid action goes through billing.charge().
 *
 * handle(userId, input, ctx) -> { replies: (string | RichReply)[], handoff? }
 *   input: { type:'text', text } | { type:'reply', id, title } | { type:'form', id, values }
 *        | { type:'image', mediaId } | { type:'document', mediaId, mime } | { type:'voice', mediaId, seconds? }
 *        | { type:'other' }
 *   ctx:   { phone } used for payment notices and reminders; { early(replies) } optional, sends a message
 *          straight away (for slow steps such as setting up a language)
 *
 * creditPayment({ ref, paymentId, paise }) is called by the payment webhook.
 */
export function createBot({ store, guard, llm, config, downloadMedia, vault, payments = null, stt = null, translator = null }) {
  if (!vault) throw new Error('createBot needs a vault (see src/vault.js)');
  const rt = rates(config);

  async function handle(userId, input, ctx = {}) {
    if (!guard.allowInbound(userId)) return { replies: [] };

    let u = store.getUser(userId);
    if (!u) {
      u = { state: 'new', lang: null };
      if (store.hadTrial?.(userId) || ctx.trial === false) u.trialGiven = true; // ctx.trial === false: web sign-ups over the per-address cap
      else {
        grantTrial(u, config);
        store.markTrial?.(userId);
      }
    }
    u.lastInboundAt = Date.now();
    const replies = [];
    let handoff = null;
    let deleted = false;

    const L = () => u.lang || 'en';
    const T = (key, vars) => t(L(), key, vars);
    const say = (key, vars) => replies.push(T(key, vars));
    const btn = (id, key, vars) => ({ id, title: T(key, vars) });
    const ask = (body, buttons) => replies.push(R.buttons(body, buttons));
    let keepAwait = false;
    let holdSteps = false;
    const setAwait = (kind) => {
      u.await = kind;
      keepAwait = true;
    };

    // Reply taps carry an id that we treat exactly like typed text.
    let raw = '';
    let text = '';
    let isTap = false;
    const setInput = (inp) => {
      input = inp;
      raw = inp.type === 'text' ? (inp.text || '').trim() : inp.type === 'reply' ? String(inp.id || '') : '';
      text = clean(raw);
      isTap = inp.type === 'reply';
    };
    setInput(input);

    const profile = async () => (u.vault ? (await vault.open(u.vault)) || {} : {});
    const pending = async () => (u.pending ? (await vault.open(u.pending)) || {} : {});
    const setPending = async (obj) => {
      u.pending = Object.keys(obj).length ? await vault.seal(obj) : undefined;
      if (!u.pending) delete u.pending;
    };
    const merged = async () => ({ ...(await profile()), ...(await pending()) });
    const lines = (vals) =>
      FIELDS.filter((f) => vals[f.key])
        .map((f) => `${f.label[L()] || f.label.en}: ${shown(f, vals[f.key], L())}`)
        .join('\n');
    const label = (key) => fieldDef(key).label[L()] || fieldDef(key).label.en;

    const packDef = rt.packs.pan_pack;
    const packVars = () => ({
      price: inr(packDef.paise),
      pack: inr(packDef.paise),
      packPrice: inr(packDef.paise),
      days: packDef.days,
      scans: packDef.scans,
      aiN: packDef.ai,
      voiceN: packDef.voice ?? 0,
      remindN: packDef.remind ?? 0,
    });

    // ---- money ----------------------------------------------------------
    function paywall(c) {
      ask(T('pay_need', { price: inr(c.price), bal: inr(balance(u)), pack: inr(packDef.paise) }), [
        btn('topup', 'btn_topup'),
        btn('pack', 'btn_pack', { price: inr(packDef.paise) }),
        btn('menu', 'btn_menu'),
      ]);
    }
    /** Returns the charge result, or null after showing a paywall. */
    function gate(kind) {
      const c = charge(u, config, kind);
      if (c.ok) return c;
      paywall(c);
      return null;
    }
    function showTopups() {
      replies.push(
        R.list(
          T('topup_body'),
          T('topup_btn'),
          rt.topups.map((p) => ({
            id: `pay_${p}`,
            title: inr(p),
            description: T('topup_desc', { ai: Math.floor(p / rt.aiPaise), scans: Math.floor(p / rt.scanPaise) }),
          })),
        ),
      );
    }
    function showWallet() {
      const p = activePack(u);
      const packLine = p ? T('wallet_pack', { date: fmtDate(p.until), scans: p.scans, aiN: p.ai }) : '';
      ask(
        T('wallet', {
          bal: inr(balance(u)),
          pack: packLine,
          free: rt.freeMsgsPerDay,
          msg: inr(rt.msgPaise),
          ai: inr(rt.aiPaise),
          scan: inr(rt.scanPaise),
          sheet: inr(rt.sheetPaise),
          voice: inr(rt.voicePaise),
          remindP: inr(rt.remindPaise),
          ...packVars(),
          pack: packLine,
        }),
        [btn('topup', 'btn_topup'), btn('pack', 'btn_pack', { price: inr(packDef.paise) }), btn('menu', 'btn_menu')],
      );
    }
    async function startTopup(paise, packId = null) {
      const okAmount = rt.topups.includes(paise) || (Number.isInteger(paise) && paise % 100 === 0 && paise >= 1000 && paise <= 500000);
      if (!payments || !okAmount) return say('topup_off');
      const ref = `sv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      store.putPayment(ref, { userId, paise, status: 'pending', ts: Date.now(), phone: ctx.phone || null, ...(packId ? { packId } : {}) });
      try {
        const { url } = await payments.createLink({ ref, paise, note: 'Saathi wallet top-up' });
        say('topup_link', { amt: inr(paise), url });
      } catch (e) {
        console.error('payment link error:', e.message);
        store.putPayment(ref, { userId, paise, status: 'failed', ts: Date.now() });
        say('topup_fail');
      }
    }
    /** Buy a pack from the wallet; if the wallet is short, send a payment link for just the difference and activate on payment. */
    async function buyPackNow(id) {
      const def = rt.packs[id];
      const r = buyPack(u, config, id);
      if (r.ok) return say('pack_bought', { date: fmtDate(activePack(u).until) });
      const need = Math.max(1000, Math.ceil(r.need / 100) * 100);
      say('pack_short', { price: inr(def.paise), bal: inr(balance(u)) });
      await startTopup(need, id);
    }
    function showPackInfo() {
      ask(T('pack_info', { ...packVars(), bal: inr(balance(u)) }), [
        btn('confirm_pack', 'btn_buy', { price: inr(packDef.paise) }),
        btn('menu', 'btn_cancel'),
      ]);
      setAwait('pack');
    }

    // ---- menus and languages ---------------------------------------------
    const showMenu = () => {
      u.state = 'menu';
      delete u.pickFor;
      replies.push(
        R.list(
          T('menu_body'),
          T('menu_btn'),
          tr(L(), 'menu_rows').map(([id, title, description]) => ({ id, title, description })),
        ),
      );
    };

    const showServices = (pickFor = null) => {
      u.state = 'svc_list';
      if (pickFor) u.pickFor = pickFor;
      else delete u.pickFor;
      replies.push(
        R.list(
          T(pickFor === 'sheet' ? 'svc_pick_sheet' : 'svc_body'),
          T('svc_btn'),
          SERVICES.map((s, i) => ({ id: String(i + 1), title: L10(s.name, L()), description: L10(s.blurb, L()) })),
        ),
      );
    };

    const langButtons = (lang = null) => [
      { id: '1', title: t('en', 'btn_english') },
      { id: '2', title: t('en', 'btn_hindi') },
      { id: '3', title: t(lang || 'en', 'btn_more_langs') },
    ];
    const askLanguage = (first = false) => {
      u.state = first ? 'new_lang' : 'lang';
      ask(first ? t('en', 'welcome') : t(L(), 'lang_pick'), langButtons(first ? null : L()));
    };
    const showMoreLangs = () => {
      u.state = 'lang_more';
      replies.push(
        R.list(
          T('lang_more_body'),
          T('lang_more_btn'),
          WA_LANGS.map((l, i) => ({ id: String(i + 1), title: l.native, description: l.en })),
        ),
      );
    };

    async function chooseLang(code, quiet = false) {
      const prev = u.lang;
      if (code === 'en' || code === 'hi') {
        u.lang = code;
        if (!quiet) say('lang_set');
        return;
      }
      const def = langDef(code);
      if (!isReady(code)) {
        if (!translator?.enabled || !guard.llmAllowed(userId)) {
          say('lang_fail', { lang: def.en });
          if (!u.lang) u.lang = 'en';
          return;
        }
        await ctx.early?.([T('lang_wait', { lang: def.en })]);
        let ok = false;
        try {
          ok = await translator.ensure(code);
        } catch (e) {
          console.error('language setup error:', e.message);
        }
        if (!ok) {
          say('lang_fail', { lang: def.en });
          if (!u.lang) u.lang = prev || 'en';
          return;
        }
      }
      u.lang = code;
      say('lang_ready', { lang: def.native });
    }

    const afterLang = () => {
      if (u.state === 'steps' && u.route) stepReply();
      else showMenu();
    };

    // ---- services: intake, route, steps -----------------------------------
    const svcNow = () => serviceById(u.svc);
    const portalText = () => portalLine(u.ans?.state, L());
    const fillText = (s) => s.replaceAll('{portal}', portalText());

    const stepsFor = () => svcNow()?.routes?.[u.route]?.steps || [];
    const stepReply = () => {
      const steps = stepsFor();
      const body = T('step', { i: u.step + 1, n: steps.length, text: fillText(L10(steps[u.step], L())) });
      replies.push(R.buttons(body, [btn('next', 'btn_next'), btn('back', 'btn_back'), btn('menu', 'btn_menu')]));
    };
    const resumeSteps = () => {
      if (u.state === 'steps' && u.route && !keepAwait && !holdSteps) stepReply();
    };

    const askQ = (q) => {
      if (q.type === 'yn') return ask(L10(q, L()), [btn('1', 'btn_yes'), btn('2', q.key === 'mobile' ? 'btn_no_unsure' : 'btn_no')]);
      if (q.type === 'opts') return ask(L10(q, L()), q.options.map((o) => ({ id: o[0], title: optTitle(o, L()) })));
      replies.push(L10(q, L()));
    };

    function startService(svc) {
      u.svc = svc.id;
      u.ans = {};
      delete u.route;
      delete u.step;
      askIntake();
    }
    function askIntake() {
      const svc = svcNow();
      const q = nextQuestion(svc, u.ans);
      if (!q) return finishIntake(svc);
      u.state = 'svc_q';
      askQ(q);
    }
    function finishIntake(svc) {
      const { route, note } = svc.pick(u.ans);
      startRoute(svc, route, note);
    }
    function startRoute(svc, routeId, note) {
      const r = svc.routes[routeId];
      if (r.kind === 'info') {
        replies.push(L10(r.text, L()));
        delete u.route;
        if (svc.intake.length) return showMenu();
        u.state = 'qa';
        return;
      }
      u.route = routeId;
      u.step = 0;
      u.state = 'steps';
      const intro = fillText(L10(r.intro, L()).replace('{n}', String(r.steps.length)).replace('{note}', note ? L10(note, L()) : ''));
      const self = svc.self ? T('self_line', { list: L10(svc.self, L()) }) : '';
      replies.push(`${intro}\n\n${T('safety')}${self}`);
      stepReply();
    }
    async function answerIntake() {
      const svc = svcNow();
      const q = svc && nextQuestion(svc, u.ans);
      if (!q) return showServices();
      if (q.type === 'yn') {
        if (YES.has(text)) u.ans[q.key] = 'y';
        else if (NO.has(text)) u.ans[q.key] = 'n';
        else return askQ(q);
      } else if (q.type === 'opts') {
        const id = matchOption(q, raw, L());
        if (!id) {
          say('opt_bad');
          return askQ(q);
        }
        u.ans[q.key] = id;
      } else {
        let st = matchState(raw);
        // Not a spelling the list knows (a city, another language, a heavy typo): let the AI place it, or say it is not a place in India.
        if (!st && raw.length <= 60 && llm.enabled && guard.llmAllowed(userId)) {
          try {
            const r = await llm.answer(STATE_SYSTEM, raw.slice(0, 80), { max: 12 });
            guard.recordLlm(userId, r.usage);
            st = matchState(String(r.text || '').replace(/[*"'`.\n]/g, ' ').trim());
          } catch {
            /* the AI is down: fall through to asking again */
          }
        }
        if (!st) {
          say('svc_state_bad');
          return askQ(q);
        }
        u.ans[q.key] = st.id;
        if (!st.portal) replies.push(T('svc_state_unknown', { state: L() === 'hi' ? st.hi : st.name }));
      }
      askIntake();
    }
    function pickService() {
      let s = null;
      if (/^\d+$/.test(text)) s = SERVICES[Number(text) - 1];
      if (!s) s = SERVICES.find((x) => clean(L10(x.name, L())) === text || clean(x.name.en) === text || clean(x.name.hi) === text);
      return s || null;
    }

    // Someone typed a sentence instead of tapping. Start the guide if they are clearly asking to do something
    // with one service; otherwise just answer like a normal chat.
    async function chatOrRoute(raw) {
      const svc = detectService(raw);
      const wantsDoing = /\b(i (want|need|wanna|have to)|i'd like|help me|let'?s|take me|start|apply for|guide me)\b|मुझे .*(बनवाना|चाहिए|करना)/i.test(raw);
      if (svc && wantsDoing && raw.length < 90 && svc.intake?.length) return startService(svc);
      u.state = 'qa';
      await answerQuestion(raw);
    }

    const ACTION_BTN = {
      guide: (svc) => (svc?.intake?.length ? { id: 'go_' + svc.id, title: 'Guide me step by step', hi: 'गाइड शुरू करें' } : null),
      docs: (svc) => (svc ? { id: 'docs', title: 'Documents needed', hi: 'ज़रूरी दस्तावेज़' } : null),
      info: (svc) => (svc ? { id: 'info_' + svc.id, title: 'All info I need', hi: 'सारी जानकारी' } : null),
      fees: (svc) => (svc ? { id: 'fee', title: 'Fee and cost', hi: 'फीस' } : null),
      scan: () => ({ id: 'act_scan', title: 'Scan a document', hi: 'दस्तावेज़ स्कैन करें' }),
      details: () => ({ id: 'act_details', title: 'My details', hi: 'मेरे विवरण' }),
      sheet: () => ({ id: 'act_details', title: 'My details', hi: 'मेरे विवरण' }),
      locker: () => ({ id: 'act_locker', title: 'Open my locker', hi: 'मेरा लॉकर खोलें' }),
      reminders: () => ({ id: 'act_reminders', title: 'Set a reminder', hi: 'रिमाइंडर लगाएँ' }),
      track: () => ({ id: 'act_apps', title: 'Track this application', hi: 'आवेदन ट्रैक करें' }),
      photo: () => ({ id: 'act_photo', title: 'Resize a photo', hi: 'फोटो का साइज़ बदलें' }),
      check: () => ({ id: 'act_check', title: 'Check a message', hi: 'मैसेज जाँचें' }),
    };
    const FEE_Q = /\b(fees?|cost|costs|price|charges?|kitna|kitne|kharcha|rate)\b|फीस|शुल्क|कितना|कितने|खर्च/i;
    const DOCS_Q = /\b(documents?|docs|papers|required|kaagaz|kagaz|dastavez)\b|दस्तावेज|कागज़|कागज/i;
    const GREET = /^\s*(hi+|hello+|hey+|hii+|namaste|namaskar|नमस्ते|नमस्कार|हैलो|हाय|good (morning|afternoon|evening))[\s!.?]*$/i;

    const ALLINFO_Q = /\b(all|every ?thing|full|complete|whole|sab ?kuch|saari|sari)\b.{0,30}\b(info|information|details?|jankari|needed|required|need)\b|\b(info|information|details?)\b.{0,20}\b(needed|required|need)\b.{0,20}\b(all|everything)\b|what (all )?(do|will) i need|सारी जानकारी|पूरी जानकारी|सब कुछ/i;
    const SENS = new Set(['dob', 'father_name', 'mother_name', 'address', 'pincode', 'mobile', 'email']);
    const LOCKER_FOR = { pan: ['aadhaar'], gst: ['pan', 'aadhaar'], dl: ['aadhaar'], voter: ['aadhaar'], passport: ['aadhaar'], aadhaar: [], income: ['aadhaar'], caste: ['aadhaar'] };
    /** One card: documents, fee, and the person's own saved details. Values of private fields are never in the reply; the app fetches them on Show. */
    async function buildPack(b) {
      const vals = await merged();
      const lk = await getLocker();
      const fields = FIELDS.map((f) => {
        const set = Boolean(vals[f.key]);
        const sens = SENS.has(f.key);
        return { key: f.key, label: label(f.key), set, sens, ...(set && !sens ? { value: shown(f, vals[f.key], L()) } : {}) };
      });
      const ids = (LOCKER_FOR[b.id] || []).map((t) => ({ type: t, label: docName(t), set: Boolean(lk[t]?.number) }));
      const missing = [...fields.filter((f) => !f.set).map((f) => f.label), ...ids.filter((i) => !i.set).map((i) => i.label)];
      const docs = L10(b.docs, L());
      const fee = L10(b.fee, L());
      const title = L10(b.name, L()) || b.id;
      const text = `${docs}\n\n${fee}`.trim();
      return R.pack(title, { docs, fee, fields, ids, missing }, text);
    }

    async function answerQuestion(question) {
      const inSteps = u.state === 'steps';
      const web = ctx.channel === 'web' && ctx.ai ? ctx : null;
      // Web: two kinds of message never need the AI, so they cost nothing and answer instantly.
      if (web && !inSteps) {
        const q = question.trim();
        if (GREET.test(q)) {
          const hi = /[\u0900-\u097F]/.test(q) || /namaste|namaskar/i.test(q);
          replies.push(hi ? 'नमस्ते! बताइए, किस काम में मदद चाहिए? पैन, आधार, ड्राइविंग लाइसेंस, पासपोर्ट, वोटर आईडी, जीएसटी या कोई प्रमाण पत्र।' : 'Hi! Tell me what you need help with: PAN, Aadhaar, driving licence, passport, voter ID, GST or a certificate.');
          return;
        }
        if (ALLINFO_Q.test(q)) {
          let sv = detectService(q) || baseService(web.svc);
          if (!sv && web.hist?.length) for (let i = web.hist.length - 1; i >= 0 && !sv; i--) sv = detectService(web.hist[i].t);
          const b = sv && (baseService(sv.id) || sv);
          if (b) {
            u.svc = b.id;
            replies.push(await buildPack(b));
            return;
          }
        }
        if (q.split(/\s+/).length <= 9) {
          let sv = detectService(q) || baseService(web.svc);
          if (!sv && web.hist?.length) for (let i = web.hist.length - 1; i >= 0 && !sv; i--) sv = detectService(web.hist[i].t);
          const wantFee = FEE_Q.test(q);
          const wantDocs = DOCS_Q.test(q);
          const specific = /link|penalt|late|tatk?al|pvc|learn|duplic|correct|reprint|renew|minor|child|police|pcc|lost|nri|foreign|international|retest|test|compos|return|inoperat|refund|updat|chang|address|mobile|name|dob|birth|state|hindi/i.test(q);
          if (sv && wantFee !== wantDocs && !specific) {
            const b = baseService(sv.id) || sv;
            u.svc = b.id;
            const btns = [wantFee ? ACTION_BTN.docs(b) : ACTION_BTN.fees(b), ACTION_BTN.guide(b)].filter(Boolean).map((x) => ({ id: x.id, title: L() === 'hi' ? x.hi : x.title }));
            replies.push(R.buttons(L10(wantFee ? b.fee : b.docs, L()), btns));
            return;
          }
        }
      }
      let svc = detectService(question) || baseService(web?.svc);
      if (!svc && web?.hist?.length) for (let i = web.hist.length - 1; i >= 0 && !svc; i--) svc = detectService(web.hist[i].t);
      svc = svc || baseService(u.svc);
      if (web && svc && !inSteps) u.svc = svc.id;
      // The first question of a chat is often one many people ask. Reuse the answer for a while: no AI call, no charge.
      const ckey = web && !web.hist?.length && !inSteps ? [svc?.id || '', L(), question.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 160)].join('|') : null;
      const hit = ckey ? QA_CACHE.get(ckey) : null;
      let raw0 = hit && hit.exp > Date.now() ? hit.text : null;
      let c = null;
      if (!raw0) {
        if (!llm.enabled || !guard.llmAllowed(userId)) return say(inSteps ? 'step_help_busy' : 'qa_busy');
        c = gate('ai');
        if (!c) return;
      }
      try {
        if (!raw0) {
          const context = inSteps ? fillText(stepsFor()[u.step].en).replace(/\*/g, '') : '';
          const langName = L() === 'hi' ? 'Hindi (Devanagari)' : L() === 'en' ? 'simple English' : `${langDef(L())?.en || 'English'} (its own script)`;
          let q = question.slice(0, MAX_QUESTION_CHARS);
          if (web?.hist?.length) {
            // Only the last few turns, trimmed: every extra word is paid for again on every message.
            const past = web.hist.slice(-4).map((h) => `${h.r === 'a' ? 'Saathi' : 'Person'}: ${h.t.slice(0, h.r === 'a' ? 220 : 240)}`).join('\n');
            q = `Earlier:\n${past}\n\nNew message:\n${q}`;
          }
          const r = await llm.answer(qaSystemPrompt(langName, svc, context, web, web ? detectServices(question) : [], web ? langHint(question) : null), q, { max: web ? 300 : 350 });
          guard.recordLlm(userId, r.usage);
          raw0 = r.text;
          if (ckey && raw0) {
            if (QA_CACHE.size >= 300) QA_CACHE.delete(QA_CACHE.keys().next().value);
            QA_CACHE.set(ckey, { text: raw0, exp: Date.now() + 12 * 3600 * 1000 });
          }
        }
        let answer = raw0;
        let acts = [];
        if (web) {
          const m = String(raw0).match(/\n?\s*\**ACTIONS\**\s*:\s*([^\n]*)\s*$/i);
          if (m) {
            answer = raw0.slice(0, m.index).trim();
            acts = m[1].toLowerCase().split(/[,\s]+/).filter((x) => ACTION_BTN[x]).slice(0, 2);
          }
          answer = answer.replace(/\n?\s*\**ACTIONS\**\s*:.*$/gis, '').trim();
        }
        if (web) {
          const btns = acts.map((k) => ACTION_BTN[k](svc)).filter(Boolean).map((b) => ({ id: b.id, title: L() === 'hi' ? b.hi : b.title }));
          replies.push(answer ? (btns.length ? R.buttons(answer, btns) : answer) : T('qa_fail'));
        } else if (answer && svc && !inSteps && u.state !== 'svc_q' && svc.intake?.length) {
          const title = L() === 'hi' ? 'गाइड शुरू करें' : 'Guide me step by step';
          replies.push(R.buttons(answer, [{ id: 'go_' + svc.id, title }, btn('menu', 'btn_menu')]));
        } else replies.push(answer || T('qa_fail'));
      } catch (e) {
        console.error('llm error:', e.message);
        if (c) refund(u, c, 'ai');
        say('qa_fail');
      }
    }

    // ---- documents ------------------------------------------------------
    async function checkPhoto() {
      if (!config.docCheck) return say('docs_off');
      if (!u.docConsent) {
        setAwait('consent');
        return ask(T('doc_consent'), [btn('1', 'btn_allow'), btn('2', 'btn_no')]);
      }
      if (!llm.enabled || !guard.llmAllowed(userId)) return say('doc_busy');
      const c = gate('scan');
      if (!c) return;
      try {
        const { buffer, mime } = await downloadMedia(input.mediaId);
        if (buffer.length > MAX_DOC_BYTES) {
          refund(u, c, 'scan');
          return say('doc_too_big');
        }
        const r = await llm.checkDocument(buffer, mime);
        guard.recordLlm(userId, r.usage);
        const lkKind = lockerFromScan(r)?.type;
        const type = lkKind ? docName(lkKind) : String(r.type || 'other').replaceAll('_', ' ');
        if (!r.readable || r.type === 'not_a_document') {
          refund(u, c, 'scan');
          return say('doc_unclear', { issues: r.issues?.length ? ` (${r.issues.join(', ')})` : '' });
        }
        const { clean: found } = normAll(fromExtraction(r));
        const lk = lockerFromScan(r);
        const lkOk = lk && !lk.none;
        if (!Object.keys(found).length && !lkOk) {
          refund(u, c, 'scan');
          return say('doc_nofields', { type });
        }
        await setPending({ ...(await pending()), ...found });
        let extra = '';
        if (lkOk) {
          u.pendingLocker = await vault.seal({ type: lk.type, number: lk.number, expiry: lk.expiry, name: found.full_name, dob: found.dob });
          const ll = [];
          if (lk.number) ll.push(T('lk_line_number', { v: maskNumber(lk.number) }));
          if (lk.expiry) ll.push(T('lk_line_expiry', { v: fmtIso(lk.expiry), left: leftText(lk.expiry) }));
          extra = T('lk_found_doc', { doc: docName(lk.type), lockerlines: ll.join('\n') });
        } else {
          dropPendingLocker();
          if (lk?.none) extra = T('lk_scan_nonum');
        }
        setAwait('save');
        ask(T('doc_ok', { type, details: lines(found) || '—' }) + extra, [btn('save', 'btn_save'), btn('once', 'btn_once'), btn('discard', 'btn_discard')]);
      } catch (e) {
        console.error('photo check error:', e.message);
        refund(u, c, 'scan');
        say('doc_fail');
      }
    }

    // ---- voice notes ----------------------------------------------------
    /** Turns a voice note into text and carries on as if the person had typed it. Returns false if it could not. */
    async function hearVoice() {
      if (!stt?.enabled) {
        say('voice_off');
        return false;
      }
      if (!guard.llmAllowed(userId)) {
        say('voice_busy');
        return false;
      }
      const c = gate('voice');
      if (!c) return false;
      try {
        const { buffer, mime } = await downloadMedia(input.mediaId);
        const r = await stt.transcribe(buffer, mime);
        guard.recordStt?.(userId, r.seconds ?? input.seconds ?? 10);
        const said = String(r.text || '').replace(/\s+/g, ' ').trim();
        if (!said) {
          refund(u, c, 'voice');
          say('voice_empty');
          return false;
        }
        replies.push(T('voice_heard', { text: said.slice(0, 300) }));
        setInput({ type: 'text', text: said.slice(0, MAX_QUESTION_CHARS), viaVoice: true });
        return true;
      } catch (e) {
        console.error('voice error:', e.message);
        refund(u, c, 'voice');
        say(e.code === 'too_long' ? 'voice_long' : 'voice_fail');
        return false;
      }
    }

    // ---- profile, forms, sheet -----------------------------------------
    async function saveProfile() {
      const all = await merged();
      if (Object.keys(all).length) {
        u.vault = await vault.seal(all);
        u.vaultConsent = true;
      }
      await setPending({});
      if (u.pendingLocker) {
        const pl = await vault.open(u.pendingLocker);
        dropPendingLocker();
        if (pl?.type && TYPES[pl.type]) {
          const doc = await mergeLocker(pl.type, { number: pl.number, expiry: pl.expiry, name: pl.name, dob: pl.dob });
          return { lockerType: pl.type, doc };
        }
      }
      return null;
    }

    async function showProfile() {
      const p = await profile();
      if (!Object.keys(p).length) {
        return ask(T('profile_empty'), [btn('fill', 'btn_fill'), btn('scan', 'btn_scan'), btn('menu', 'btn_menu')]);
      }
      const miss = missingKeys(p, CORE_KEYS).map(label);
      ask(T('profile_show', { lines: lines(p), missing: miss.length ? T('profile_missing', { list: miss.join(', ') }) : '' }), [
        btn('fill', 'btn_update'),
        btn('forget', 'btn_erase'),
        btn('menu', 'btn_menu'),
      ]);
    }

    const formReply = async () => {
      const vals = await merged();
      return R.form(
        'details',
        T('form_body'),
        T('form_cta'),
        FIELDS.map((f) => ({
          key: f.key,
          type: f.type,
          label: label(f.key),
          options: f.options ? f.options.map((o) => ({ id: o, title: GENDER[o][L()] || GENDER[o].en })) : undefined,
        })),
        vals,
      );
    };

    async function startFill() {
      if (u.state !== 'fill') u.backTo = u.state === 'steps' ? 'steps' : null;
      if (config.flowsEnabled && ctx.channel !== 'web') return replies.push(await formReply());
      const vals = await merged();
      const keys = baseService(u.svc)?.sheet || CORE_KEYS;
      const miss = missingKeys(vals, keys);
      u.fillKeys = miss.length ? miss : keys;
      u.fillIdx = 0;
      u.state = 'fill';
      say('fill_intro');
      await askNextField(vals);
    }

    async function askNextField(vals) {
      const key = u.fillKeys[u.fillIdx];
      if (!key) return finishFill();
      const f = fieldDef(key);
      const cur = vals && vals[key] ? T('fill_current', { value: shown(f, vals[key], L()) }) : '';
      if (key === 'gender') {
        return ask(T('fill_ask_gender') + cur, [btn('male', 'btn_male'), btn('female', 'btn_female'), btn('other', 'btn_other')]);
      }
      replies.push(T(`fill_ask_${key}`) + cur);
    }

    async function finishFill() {
      delete u.fillKeys;
      delete u.fillIdx;
      u.state = u.backTo || 'menu';
      delete u.backTo;
      say('fill_done');
      await afterDetails();
      resumeSteps();
    }

    // Called once new details are in. Offers to save, then carries on with the sheet if that is why we asked.
    async function afterDetails() {
      const pend = await pending();
      if (Object.keys(pend).length) {
        if (u.vaultConsent) {
          await saveProfile();
          say('save_done');
        } else {
          setAwait('save');
          return ask(T('save_ask'), [btn('save', 'btn_save'), btn('once', 'btn_once'), btn('discard', 'btn_discard')]);
        }
      }
      if (u.next === 'sheet') await doSheet();
    }

    async function doSheet() {
      delete u.next;
      const b = baseService(u.svc);
      if (!b) return showServices('sheet');
      const vals = await merged();
      if (!b.sheet.some((k) => vals[k])) {
        u.next = 'sheet';
        holdSteps = true;
        return ask(T('sheet_none'), [btn('fill', 'btn_fill'), btn('scan', 'btn_scan'), btn('menu', 'btn_menu')]);
      }
      const c = gate('sheet');
      if (!c) {
        u.next = 'sheet';
        holdSteps = true;
        return;
      }
      const rows = FIELDS.filter((f) => b.sheet.includes(f.key) && vals[f.key]).map((f) => ({ key: f.key, label: label(f.key), value: shown(f, vals[f.key], L()) }));
      const miss = missingKeys(vals, b.sheet).map(label);
      const title = T('sheet_title', { svc: L10(b.sheetName, L()) });
      const body = T('sheet_body', { lines: rows.map((r) => `${r.label}: ${r.value}`).join('\n') });
      const txt = `${title}\n${body}${miss.length ? T('sheet_missing', { list: miss.join(', ') }) : ''}${T('sheet_foot')}`;
      replies.push(R.sheet(title, rows, miss, txt));
      if (miss.length) {
        holdSteps = true;
        ask(T('sheet_next'), [btn('fill', 'btn_fill'), btn('menu', 'btn_menu')]);
      } else if (u.state !== 'steps') {
        ask(T('sheet_next'), [btn('services', 'btn_services'), btn('menu', 'btn_menu')]);
      }
      // A session-only sheet must not linger.
      if (!u.vaultConsent || !u.vault) await setPending({});
    }

    async function handleForm() {
      const { clean: ok, bad } = normAll(input.values || {});
      if (!Object.keys(ok).length && !bad.length) return say('form_empty');
      await setPending({ ...(await pending()), ...ok });
      if (bad.length) {
        say('form_bad', { labels: bad.map(label).join(', ') });
        return replies.push(await formReply());
      }
      say('fill_done');
      await afterDetails();
      resumeSteps();
    }

    async function fillAnswer() {
      const key = u.fillKeys[u.fillIdx];
      const f = fieldDef(key);
      if (SKIP.has(text) || KEEP.has(text)) {
        u.fillIdx++;
        return askNextField(await merged());
      }
      const val = normField(key, raw);
      if (val === null) {
        say('fill_bad', { label: label(key) });
        return askNextField(await merged());
      }
      await setPending({ ...(await pending()), [key]: val });
      u.fillIdx++;
      await askNextField(await merged());
    }

    // ---- reminders ------------------------------------------------------
    const remLines = () => (u.reminders || []).map((r, i) => `${i + 1}. ${r.label}: ${fmtDue(r.due)}`).join('\n');

    function showReminders() {
      u.state = 'menu';
      const list = u.reminders?.length ? T('remind_list', { lines: remLines() }) : T('remind_none');
      const buttons = [btn('remind_add', 'btn_remind_add')];
      if (u.reminders?.length) buttons.push(btn('remind_remove', 'btn_remind_remove'));
      buttons.push(btn('menu', 'btn_menu'));
      ask(`${T('remind_intro', { price: inr(rt.remindPaise) })}\n\n${list}`, buttons);
    }
    function startAddReminder() {
      if (!ctx.phone && !u.phoneSealed) return say('remind_nophone');
      if ((u.reminders || []).length >= MAX_REMINDERS) return say('remind_full');
      // Check the person can pay before asking them for a date.
      const c = charge(u, config, 'remind');
      if (!c.ok) return paywall(c);
      refund(u, c, 'remind');
      u.state = 'rem_type';
      replies.push(
        R.list(
          T('remind_type_body'),
          T('remind_type_btn'),
          tr(L(), 'remind_types').map(([id, title, description]) => ({ id, title, description })),
        ),
      );
    }
    function reminderTypeChosen() {
      const row = tr(L(), 'remind_types').find(([id]) => id === text) || tr(L(), 'remind_types')[Number(text) - 1];
      if (!row) return startAddReminder();
      u.remType = row[0];
      u.remLabel = row[0] === 'custom' ? null : row[1];
      if (row[0] === 'custom') {
        u.state = 'rem_label';
        return say('remind_ask_label');
      }
      u.state = 'rem_date';
      say('remind_ask_date');
    }
    async function reminderDate() {
      const due = parseFutureDate(raw);
      if (!due) return say('remind_bad_date');
      const c = gate('remind');
      if (!c) return;
      const rem = makeReminder({ id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, type: u.remType, label: u.remLabel, due });
      u.reminders = [...(u.reminders || []), rem];
      if (ctx.phone) u.phoneSealed = await vault.seal({ phone: ctx.phone });
      delete u.remType;
      delete u.remLabel;
      u.state = 'menu';
      say('remind_saved', { label: rem.label, date: fmtDue(due) });
      if (daysUntil(due) < 7) say('remind_past');
      showMenu();
    }
    function startRemoveReminder() {
      u.state = 'rem_remove';
      replies.push(R.list(T('remind_remove_body'), T('remind_type_btn'), u.reminders.map((r, i) => ({ id: String(i + 1), title: r.label.slice(0, 24), description: fmtDue(r.due) }))));
    }
    function removeReminder() {
      const i = Number(text) - 1;
      if (!u.reminders?.[i]) return startRemoveReminder();
      u.reminders.splice(i, 1);
      if (!u.reminders.length) delete u.reminders;
      say('remind_removed');
      showReminders();
    }

    // ---- safety and transparency -------------------------------------------
    const fmtWhen = (ts) =>
      new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

    function showSafetyTips() {
      ask(T('safety_tips'), [btn('scam_again', 'btn_scam_again'), btn('menu', 'btn_menu')]);
    }
    function startScam() {
      u.state = 'scam_ask';
      say('scam_prompt');
    }
    function runScam(text0) {
      const a = analyze(text0);
      const parts = [T('scam_v_' + a.level)];
      const urlLines = a.urls.map((x) => T('scam_u_' + x.kind, { host: x.host.slice(0, 60) }));
      if (urlLines.length) parts.push(urlLines.join('\n'));
      const why = a.reasons.filter((r) => r !== 'shortener' && r !== 'unknown_site').map((r) => '• ' + T('scam_r_' + r));
      if (why.length) parts.push(why.join('\n'));
      if (a.level !== 'none') parts.push(T('scam_advice_' + a.level));
      ask(parts.join('\n\n'), [btn('scam_again', 'btn_scam_again'), btn('safety_tips', 'btn_scam_tips'), btn('menu', 'btn_menu')]);
    }

    function showSources() {
      const b = baseService(u.svc);
      let out = T('sources_head', { date: LAST_VERIFIED });
      if (b) {
        out += T('sources_sites', { svc: L10(b.name, L()), sites: (b.sites || []).map((x) => '• ' + x).join('\n') });
        if (b.unverified?.length) out += T('sources_unsure', { list: b.unverified.map((x) => '• ' + x).join('\n') });
      } else out += T('sources_generic');
      out += T('sources_foot');
      replies.push(out);
    }

    const histWhat = (what) => {
      const w = String(what || '');
      if (w === 'welcome credit') return T('hist_welcome');
      if (w === 'top-up') return T('hist_topup');
      if (w.startsWith('pack ')) return T('hist_pack');
      if (w.startsWith('refund ')) return T('hist_refund', { what: histWhat(w.slice(7)) });
      return ['msg', 'ai', 'scan', 'sheet', 'voice', 'remind'].includes(w) ? T('hist_' + w) : T('hist_other');
    };
    function showHistory() {
      const h = (u.wallet?.history || []).slice(-10).reverse();
      const p = activePack(u);
      const packLine = p ? T('wallet_pack', { date: fmtDate(p.until), scans: p.scans, aiN: p.ai }) : '';
      if (!h.length) return ask(T('history_none'), [btn('topup', 'btn_topup'), btn('menu', 'btn_menu')]);
      const lines = h
        .map((e) => T('history_line', { when: fmtWhen(e.ts), what: histWhat(e.what), amount: (e.paise >= 0 ? '+' : '−') + inr(Math.abs(e.paise)), bal: inr(e.bal) }))
        .join('\n');
      ask(T('history_head', { bal: inr(balance(u)), pack: packLine, lines }), [btn('topup', 'btn_topup'), btn('menu', 'btn_menu')]);
    }

    // ---- locker ----------------------------------------------------------
    const getLocker = async () => (u.locker ? (await vault.open(u.locker)) || {} : {});
    const putLocker = async (obj) => {
      if (Object.keys(obj).length) u.locker = await vault.seal(obj);
      else delete u.locker;
    };
    const docName = (type) => typeName(type, L() === 'hi' ? 'hi' : 'en');
    const leftText = (iso) => {
      const n = daysLeft(iso);
      return n < 0 ? T('lk_left_past', { n: -n }) : n === 0 ? T('lk_left_today') : T('lk_left_days', { n });
    };
    const hasPhone = () => Boolean(ctx.phone || u.phoneSealed);
    const dropPendingLocker = () => {
      delete u.pendingLocker;
    };
    /** What a scan found that belongs in the locker: { type, number?, expiry? } or null. */
    function lockerFromScan(r) {
      let kind = String(r.type || '').replace('pan_card', 'pan');
      // The model sometimes calls a clear PAN card "other": the number's own shape settles it.
      if (!TYPES[kind]) kind = TYPE_IDS.find((id) => normNumber(id, r.number ?? r.fields?.number)) || null;
      if (!kind) return null;
      const number = normNumber(kind, r.number ?? r.fields?.number);
      const expiry = TYPES[kind].expiry ? normExpiry(r.expiry ?? r.fields?.expiry) : null;
      if (!number && !expiry) return { type: kind, none: true };
      return { type: kind, number, expiry };
    }
    async function mergeLocker(type, patch) {
      const all = await getLocker();
      const cur = all[type] || {};
      all[type] = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v)), saved: Date.now() };
      await putLocker(all);
      return all[type];
    }
    async function showLocker() {
      const all = await getLocker();
      const rows = TYPE_IDS.filter((id) => all[id]).map((id) => ({
        id: `lk_${id}`,
        title: `${TYPES[id].icon} ${docName(id)}`.slice(0, 24),
        description: (all[id].expiry ? `${fmtIso(all[id].expiry)} · ${leftText(all[id].expiry)}` : '🔒').slice(0, 72),
      }));
      rows.push({ id: 'lk_add', title: T('lk_add').slice(0, 24), description: T('lk_add_desc').slice(0, 72) });
      replies.push(R.list(T('lk_intro', { list: rows.length === 1 ? T('lk_empty') : '' }), T('lk_list_btn'), rows));
    }
    function lockedCard(type, doc, asked) {
      const body = asked
        ? T('lk_locked_asked', { doc: docName(type), field: T('lk_field_' + asked) })
        : T('lk_locked', { doc: docName(type), mask: doc.number ? maskNumber(doc.number) : '🔒' });
      const b = [btn(`unlock_${type}`, 'btn_unlock'), btn(`lkdel_${type}`, 'btn_lk_remove'), btn('locker', 'btn_lk_back')];
      ask(body, b);
    }
    function unlockedCard(type, doc) {
      const items = [];
      const ls = [];
      if (doc.number) { const v = showNumber(type, doc.number); items.push({ key: 'number', label: T('lk_field_number'), value: v }); ls.push(T('lk_line_number', { v })); }
      if (doc.name) { items.push({ key: 'name', label: T('lk_field_name'), value: doc.name }); ls.push(T('lk_line_name', { v: doc.name })); }
      if (doc.dob) { items.push({ key: 'dob', label: T('lk_field_dob'), value: doc.dob }); ls.push(T('lk_line_dob', { v: doc.dob })); }
      if (doc.expiry) { const v = fmtIso(doc.expiry); items.push({ key: 'expiry', label: T('lk_field_expiry'), value: v }); ls.push(T('lk_line_expiry', { v, left: leftText(doc.expiry) })); }
      replies.push(R.secret(docName(type), items, T('lk_open', { doc: docName(type), lines: ls.join('\n') })));
    }
    async function lockerAnswer(q) {
      if (!gate('msg')) return;
      const doc = (await getLocker())[q.type];
      if (!doc) return ask(T('lk_missing', { doc: docName(q.type) }), [btn(`lk_addt_${q.type}`, 'btn_lk_add'), btn('menu', 'btn_menu')]);
      if (q.field === 'expiry') {
        if (!doc.expiry) return ask(T('lk_expiry_none', { doc: docName(q.type) }), [btn(`lk_exp_${q.type}`, 'btn_lk_expiry'), btn('menu', 'btn_menu')]);
        const b = daysLeft(doc.expiry) >= 0 && hasPhone() ? [btn(`lk_remind_${q.type}`, 'btn_lk_remind'), btn('menu', 'btn_menu')] : [btn('menu', 'btn_menu')];
        return ask(T('lk_expiry_says', { doc: docName(q.type), date: fmtIso(doc.expiry), left: leftText(doc.expiry) }), b);
      }
      const asked = q.field === 'number' && !doc.number ? null : q.field;
      lockedCard(q.type, doc, asked);
    }
    function askLockerType() {
      u.state = 'lk_type';
      replies.push(R.list(T('lk_pick_type'), T('lk_list_btn'), TYPE_IDS.map((id) => ({ id: `lkt_${id}`, title: `${TYPES[id].icon} ${docName(id)}`.slice(0, 24), description: '' }))));
    }
    async function startLockerAdd(type) {
      u.lkTmp = await vault.seal({ type });
      u.state = 'lk_num';
      say('lk_ask_number', { doc: docName(type) });
    }
    async function finishLockerAdd(tmp, expiry) {
      const doc = await mergeLocker(tmp.type, { number: tmp.number, expiry });
      delete u.lkTmp;
      u.state = 'menu';
      const fresh = doc.expiry && daysLeft(doc.expiry) >= 0 && hasPhone();
      if (doc.expiry) {
        const b = fresh ? [btn(`lk_remind_${tmp.type}`, 'btn_lk_remind'), btn('locker', 'btn_lk_back'), btn('menu', 'btn_menu')] : [btn('locker', 'btn_lk_back'), btn('menu', 'btn_menu')];
        ask(T('lk_saved_exp', { doc: docName(tmp.type), date: fmtIso(doc.expiry), left: leftText(doc.expiry) }), b);
      } else ask(T('lk_saved', { doc: docName(tmp.type), docshort: docName(tmp.type) }), [btn('locker', 'btn_lk_back'), btn('menu', 'btn_menu')]);
    }
    async function lockerAction() {
      if (LOCKER.has(text) || text === 'locker') return showLocker();
      if (text === 'lk_add') return askLockerType();
      let m;
      if ((m = text.match(/^lkt_(.+)$/)) && TYPES[m[1]]) return startLockerAdd(m[1]);
      if ((m = text.match(/^lk_addt_(.+)$/)) && TYPES[m[1]]) return startLockerAdd(m[1]);
      if ((m = text.match(/^lk_exp_(.+)$/)) && TYPES[m[1]]) {
        const doc = (await getLocker())[m[1]];
        u.lkTmp = await vault.seal({ type: m[1], number: doc?.number });
        u.state = 'lk_exp';
        return say('lk_ask_expiry');
      }
      if ((m = text.match(/^unlock_(.+)$/)) && TYPES[m[1]]) {
        const doc = (await getLocker())[m[1]];
        return doc ? unlockedCard(m[1], doc) : ask(T('lk_missing', { doc: docName(m[1]) }), [btn(`lk_addt_${m[1]}`, 'btn_lk_add'), btn('menu', 'btn_menu')]);
      }
      if ((m = text.match(/^lkdel_(.+)$/)) && TYPES[m[1]]) {
        const all = await getLocker();
        delete all[m[1]];
        await putLocker(all);
        return ask(T('lk_removed', { doc: docName(m[1]) }), [btn('locker', 'btn_lk_back'), btn('menu', 'btn_menu')]);
      }
      if ((m = text.match(/^lk_remind_(.+)$/)) && TYPES[m[1]]) {
        const doc = (await getLocker())[m[1]];
        if (!doc?.expiry || daysLeft(doc.expiry) < 0) return showReminders();
        if (!hasPhone()) return say('remind_nophone');
        if ((u.reminders || []).length >= MAX_REMINDERS) return say('remind_full');
        const c = gate('remind');
        if (!c) return;
        const label = `${docName(m[1])} ${T('lk_field_expiry')}`.slice(0, 40);
        u.reminders = [...(u.reminders || []).filter((r) => r.label !== label), makeReminder({ id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, type: 'custom', label, due: doc.expiry })];
        if (ctx.phone) u.phoneSealed = await vault.seal({ phone: ctx.phone });
        say('remind_saved', { label, date: fmtDue(doc.expiry) });
        return;
      }
      // a tap on a locker row: show it locked
      if ((m = text.match(/^lk_(.+)$/)) && TYPES[m[1]]) {
        const doc = (await getLocker())[m[1]];
        return doc ? lockedCard(m[1], doc) : showLocker();
      }
      return showLocker();
    }
    async function lockerNumberTyped() {
      const tmp = (await vault.open(u.lkTmp || '')) || null;
      if (!tmp) return showLocker();
      const n = normNumber(tmp.type, raw);
      if (!n) return say('lk_bad_number', { doc: docName(tmp.type) });
      tmp.number = n;
      if (!TYPES[tmp.type].expiry) return finishLockerAdd(tmp, null);
      u.lkTmp = await vault.seal(tmp);
      u.state = 'lk_exp';
      ask(T('lk_ask_expiry'), [btn('lk_skip', 'btn_lk_skip')]);
    }
    async function lockerExpiryTyped() {
      const tmp = (await vault.open(u.lkTmp || '')) || null;
      if (!tmp) return showLocker();
      if (SKIP.has(text) || text === 'lk_skip') return finishLockerAdd(tmp, null);
      const e = normExpiry(raw);
      if (!e) return say('lk_bad_date');
      return finishLockerAdd(tmp, e);
    }

    // ---- routing --------------------------------------------------------
    let stop = false;
    let lockerQ = null;
    if (input.type === 'voice') stop = !(await hearVoice());
    let sens = !stop && input.type === 'text' ? sensitiveKind(raw, { allowMobile: u.state === 'fill' || u.state === 'rem_label' }) : null;
    if (u.state === 'lk_num' && (sens === 'pan' || sens === 'aadhaar')) sens = null; // the person is deliberately adding it to their own locker

    // ---- 1. language selection --------------------------------------------
    if (stop) {
      // a voice note we could not read: the reply is already queued
    } else if (u.state === 'new') {
      if (DEVANAGARI.test(raw)) {
        u.lang = 'hi';
        showMenu();
      } else askLanguage(true);
    } else if (u.state === 'new_lang' || u.state === 'lang') {
      const pick = text === '1' || ENGLISH.has(text) ? 'en' : text === '2' || HINDI.has(text) || DEVANAGARI.test(raw) ? 'hi' : null;
      if (pick) {
        await chooseLang(pick, u.state === 'new_lang');
        afterLang();
      } else if (text === '3' || text === 'more' || text === 'more languages') showMoreLangs();
      else if (matchLang(raw, false)) {
        await chooseLang(matchLang(raw, false));
        afterLang();
      } else askLanguage(u.state === 'new_lang');
    } else if (u.state === 'lang_more') {
      const code = /^\d+$/.test(text) ? LANGS[Number(text) - 1]?.code : matchLang(raw);
      if (code) {
        await chooseLang(code);
        afterLang();
      } else showMoreLangs();
    }
    // ---- 1b. numbers nobody should type into a chat ------------------------
    else if (sens) {
      say('sensitive_warn', { what: T('sensitive_k_' + sens) });
    }
    // ---- 2. non-text input --------------------------------------------------
    else if (u.state === 'scam_ask' && (input.type === 'image' || input.type === 'document')) {
      say('scam_image');
    } else if (input.type === 'image' || (input.type === 'document' && /^(application\/pdf|image\/)/.test(input.mime || ''))) {
      await checkPhoto();
    } else if (input.type === 'form') {
      await handleForm();
    } else if (input.type === 'other' || input.type === 'document') {
      say('text_only');
    }
    // ---- 3. an open yes/no question --------------------------------------
    else if (u.await && awaitedAnswer()) {
      await answerAwaited();
    }
    // ---- 4. commands that work anywhere ---------------------------------
    else if (MENU.has(text)) {
      delete u.await;
      delete u.next;
      delete u.backTo;
      delete u.remType;
      delete u.remLabel;
      if (u.state === 'fill') {
        delete u.fillKeys;
        delete u.fillIdx;
      }
      showMenu();
    } else if (DOCS.has(text) || FEES.has(text)) {
      const b = baseService(u.svc);
      if (!b) {
        say('pick_service_first');
        showServices();
      } else {
        replies.push(L10(DOCS.has(text) ? b.docs : b.fee, L()));
        holdSteps = false;
        resumeSteps();
      }
    } else if (AGENT.has(text) && ctx.channel !== 'web') {
      u.handoffAt = Date.now();
      handoff = { route: u.route || null, step: u.step ?? null, lang: L(), svc: u.svc || null };
      say('handoff');
    } else if (DELETE.has(text) || text === 'delete_yes') {
      const hasValue = balance(u) > 0 || u.vault || activePack(u) || u.reminders?.length;
      if (text === 'delete_yes' || !hasValue) doDelete();
      else {
        setAwait('delete');
        ask(T('delete_confirm', { bal: inr(balance(u)) }), [btn('delete_yes', 'btn_erase_all'), btn('menu', 'btn_keep'), btn('agent', 'btn_agent')]);
      }
    } else if (LANGUAGE.has(text)) {
      askLanguage(false);
    } else if (ENGLISH.has(text) || HINDI.has(text)) {
      await chooseLang(ENGLISH.has(text) ? 'en' : 'hi');
      afterLang();
    } else if (u.state !== 'fill' && u.state !== 'rem_label' && matchLang(raw, false)) {
      await chooseLang(matchLang(raw, false));
      afterLang();
    } else if (WALLET.has(text)) {
      showWallet();
    } else if (TOPUP.has(text)) {
      showTopups();
    } else if (text.startsWith('pay_')) {
      await startTopup(Number(text.slice(4)));
    } else if (PACK.has(text)) {
      showPackInfo();
    } else if (text === 'confirm_pack') {
      confirmPack();
    } else if (/^buypack_[a-z0-9_]+$/.test(text) && rt.packs[text.slice(8)]) {
      await buyPackNow(text.slice(8));
    } else if (PROFILE.has(text)) {
      await showProfile();
    } else if (SCAN.has(text)) {
      say('scan_prompt', { price: inr(rt.scanPaise) });
    } else if (FILL.has(text)) {
      await startFill();
    } else if (SHEET.has(text)) {
      await doSheet();
      resumeSteps();
    } else if (REMIND.has(text)) {
      showReminders();
    } else if (text === 'remind_add') {
      startAddReminder();
    } else if (text === 'remind_remove') {
      if (u.reminders?.length) startRemoveReminder();
      else showReminders();
    } else if (FORGET.has(text) || text === 'forget_yes') {
      if (text === 'forget_yes') doForget();
      else {
        setAwait('forget');
        ask(T('forget_ask'), [btn('forget_yes', 'btn_erase_yes'), btn('menu', 'btn_cancel')]);
      }
    } else if (SERVICES_CMD.has(text)) {
      showServices();
    } else if (SCAM.has(text) || text === 'scam_again') {
      startScam();
    } else if (text === 'safety_tips') {
      showSafetyTips();
    } else if (SOURCES.has(text)) {
      showSources();
      holdSteps = false;
      resumeSteps();
    } else if (input.type === 'reply' && /^lang_[a-z]{2,3}$/.test(text) && (['en', 'hi'].includes(text.slice(5)) || langDef(text.slice(5))) && !['fill', 'rem_label', 'rem_date', 'lk_num', 'lk_exp'].includes(u.state)) {
      await chooseLang(text.slice(5));
      afterLang();
    } else if (/^info_[a-z0-9_]+$/.test(text) && baseService(text.slice(5))) {
      const b = baseService(text.slice(5));
      u.svc = b.id;
      replies.push(await buildPack(b));
    } else if (/^go_[a-z0-9_]+$/.test(text) && serviceById(text.slice(3))) {
      startService(serviceById(text.slice(3)));
    } else if (HISTORY.has(text)) {
      showHistory();
    } else if (LOCKER.has(text) || /^(lk_|lkt_|lkdel_|unlock_)/.test(text)) {
      await lockerAction();
    } else if (input.type === 'text' && !['fill', 'rem_label', 'rem_date', 'lk_num', 'lk_exp', 'scam_ask', 'new', 'lang'].includes(u.state) && !(ctx.channel === 'web' && ctx.ai && text.split(/\s+/).length > 6) && (lockerQ = detectQuestion(raw))) {
      await lockerAnswer(lockerQ);
    } else if (['menu', 'qa', 'steps', 'svc_list', 'svc_q'].includes(u.state) && input.type === 'text' && text.length >= 6 && ['danger', 'caution'].includes(analyze(raw).level)) {
      runScam(raw);
    }
    // ---- 4b. web chat: anything typed is a real conversation with the AI, in any state that is not a form field ----
    else if (ctx.channel === 'web' && ctx.ai && input.type === 'text' && text.length >= 1 && !/^\d+$/.test(text) && ['menu', 'qa', 'svc_list'].includes(u.state)) {
      u.state = 'qa';
      await answerQuestion(raw);
    }
    // ---- 5. the state machine --------------------------------------------
    else {
      switch (u.state) {
        case 'menu':
          if (!gate('msg')) break;
          if (text === '1') showServices();
          else if (text === '2') say('scan_prompt', { price: inr(rt.scanPaise) });
          else if (text === '3') await doSheet();
          else if (text === '4') await showProfile();
          else if (text === '5') showReminders();
          else if (text === '6') {
            u.state = 'qa';
            say('ask_question');
          } else if (text === '7') showWallet();
          else if (text === '8') askLanguage(false);
          else if (text === '9') startScam();
          else if (text === '10') await showLocker();
          else if (input.type === 'text' && text.length >= 2 && !MENU_WORDS.has(text)) await chatOrRoute(raw);
          else showMenu();
          break;

        case 'svc_list': {
          if (!gate('msg')) break;
          const s = pickService();
          if (!s) showServices(u.pickFor);
          else if (u.pickFor === 'sheet') {
            u.svc = s.id;
            delete u.pickFor;
            u.state = 'menu';
            await doSheet();
          } else startService(s);
          break;
        }

        case 'svc_q': {
          if (!gate('msg')) break;
          const svc = svcNow();
          const q = svc && nextQuestion(svc, u.ans);
          const isAnswer = !q || YES.has(text) || NO.has(text) || (q.type === 'opts' && matchOption(q, raw, L())) || (q.type === 'state' && !/\?/.test(raw) && raw.split(/\s+/).length <= 6);
          if (input.type === 'text' && !isAnswer && raw.length > 8 && /\?|\b(what|why|how|can|could|is|are|do|does|will|which|who|when|where|should)\b/i.test(raw)) {
            await answerQuestion(raw); // a real question in the middle of the guide: answer it, then ask the same thing again
            u.state = 'svc_q';
            askIntake();
          } else await answerIntake();
          break;
        }

        case 'steps': {
          const steps = stepsFor();
          if (NEXT.has(text)) {
            if (!gate('msg')) break;
            if (u.step + 1 >= steps.length) {
              u.state = 'qa';
              const b = svcNow();
              const buttons = b?.remind ? [btn('remind', 'btn_remind'), btn('agent', 'btn_agent'), btn('menu', 'btn_menu')] : [btn('agent', 'btn_agent'), btn('menu', 'btn_menu')];
              ask(T('done', { after: b?.after ? L10(b.after, L()) : '' }), buttons);
            } else {
              u.step++;
              stepReply();
            }
          } else if (BACK.has(text)) {
            if (!gate('msg')) break;
            if (u.step === 0) say('at_first_step');
            else {
              u.step--;
              stepReply();
            }
          } else if (isTap) stepReply();
          else await answerQuestion(raw);
          break;
        }

        case 'fill':
          await fillAnswer();
          break;

        case 'lk_type':
          askLockerType();
          break;
        case 'lk_num':
          await lockerNumberTyped();
          break;
        case 'lk_exp':
          await lockerExpiryTyped();
          break;

        case 'rem_type':
          reminderTypeChosen();
          break;

        case 'rem_label': {
          const name = raw.replace(/\s+/g, ' ').trim();
          if (name.length < 2 || name.length > 40) say('remind_ask_label');
          else {
            u.remLabel = name;
            u.state = 'rem_date';
            say('remind_ask_date');
          }
          break;
        }

        case 'rem_date':
          await reminderDate();
          break;

        case 'rem_remove':
          removeReminder();
          break;

        case 'scam_ask':
          if (isTap) showMenu();
          else runScam(raw);
          break;

        case 'qa':
        default:
          if (isTap) showMenu();
          else await chatOrRoute(raw);
      }
    }

    function confirmPack() {
      const r = buyPack(u, config, 'pan_pack');
      if (r.ok) say('pack_bought', { date: fmtDate(activePack(u).until) });
      else {
        say('pack_short', { price: inr(packDef.paise), bal: inr(balance(u)) });
        showTopups();
      }
    }
    function doForget() {
      delete u.vault;
      delete u.vaultConsent;
      delete u.pending;
      delete u.locker;
      delete u.pendingLocker;
      delete u.lkTmp;
      say('forgot');
    }
    function doDelete() {
      say('deleted');
      deleted = true;
    }

    // Is this input an answer to the open question in u.await?
    function awaitedAnswer() {
      if (u.await === 'save') return SAVE.has(text) || ONCE.has(text) || DISCARD.has(text) || YES.has(text) || NO.has(text);
      return YES.has(text) || NO.has(text); // consent, pack, forget, delete
    }

    async function answerAwaited() {
      const kind = u.await;
      delete u.await;
      const yes = YES.has(text);
      if (kind === 'consent') {
        if (yes) {
          u.docConsent = true;
          say('doc_consent_yes');
        } else say('doc_consent_no');
      } else if (kind === 'pack') {
        if (yes) confirmPack();
        else showMenu();
      } else if (kind === 'forget') {
        if (yes) doForget();
        else showMenu();
      } else if (kind === 'delete') {
        if (yes) doDelete();
        else showMenu();
      } else if (kind === 'save') {
        if (SAVE.has(text) || yes) {
          const lk = await saveProfile();
          say('save_done');
          if (lk?.doc?.expiry && daysLeft(lk.doc.expiry) >= 0 && hasPhone()) ask(T('lk_remind_offer'), [btn(`lk_remind_${lk.lockerType}`, 'btn_lk_remind'), btn('menu', 'btn_menu')]);
        } else if (ONCE.has(text)) {
          dropPendingLocker();
          say('save_once');
        } else {
          dropPendingLocker();
          await setPending({});
          delete u.next;
          say('save_discard');
        }
        if (u.next === 'sheet' && Object.keys(await merged()).length) await doSheet();
        resumeSteps();
      }
    }

    if (deleted) store.deleteUser(userId);
    else {
      if (!keepAwait) delete u.await;
      store.putUser(userId, u);
    }
    return { replies, handoff };
  }

  /** Called by the payment webhook. Safe to call twice for the same payment. */
  async function creditPayment({ ref, paymentId, paise }) {
    const rec = store.getPayment(ref);
    if (!rec) return { ok: false, reason: 'unknown_ref' };
    if (rec.status === 'paid') return { ok: false, duplicate: true, reason: 'already_paid' };
    if (rec.paise !== paise) return { ok: false, reason: 'amount_mismatch' };
    const u = store.getUser(rec.userId);
    if (!u) return { ok: false, reason: 'no_user' };
    const r = credit(u, paise, paymentId, 'top-up');
    if (!r.ok) return { ...r, reason: r.duplicate ? 'duplicate' : 'bad_amount' };
    let packOn = false;
    if (rec.packId && rates(config).packs[rec.packId]) packOn = buyPack(u, config, rec.packId).ok;
    store.putUser(rec.userId, u);
    store.putPayment(ref, { userId: rec.userId, paise, status: 'paid', paymentId, ts: rec.ts, paidAt: Date.now(), ...(rec.packId ? { packId: rec.packId } : {}) });
    return { ok: true, userId: rec.userId, phone: rec.phone, lang: u.lang || 'en', paise, balance: r.balance, packOn };
  }

  return { handle, creditPayment };
}
