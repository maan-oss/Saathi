// The guide workspace: one screen per service that is a working tool, not a page of text.
//  Steps      find your route, tick steps off, ask about a step, track the application
//  Documents  a checklist that knows what is already in your locker
//  Fees       a calculator built from the official fee tables
//  My details what this form needs, what you have saved, fill the gaps right here
// Progress is saved (encrypted) with the rest of your extras and follows you to your other devices.
// Nothing here uses the AI unless you press "Ask Saathi".
(() => {
  'use strict';
  const C = window.SaathiCore;
  const U = C.ui;
  const { el, api, toast, store, T, N } = C;
  const { frame, btn, ico, SCREENS: S, openScreen, showDialog, closeDialog, rupee } = U;

  const JSON_H = { 'content-type': 'application/json' };
  async function tcall(op, args = {}) {
    const r = await api('/app/api/t', { method: 'POST', headers: JSON_H, body: JSON.stringify({ op, args }) }).catch(() => ({ ok: false, j: {} }));
    return { ok: Boolean(r.ok && r.j.ok), data: r.j.data, error: r.j.error || (r.ok ? null : 'network') };
  }
  const SENS = new Set(['dob', 'father_name', 'mother_name', 'address', 'city', 'pincode', 'mobile', 'email']);
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  // *bold* to <b>, and official web addresses to real links, without ever touching innerHTML.
  // Only government sites and the two PAN partners become links; anything else stays plain text.
  const OFFICIAL = /(?:^|\.)(?:gov\.in|nic\.in)$|^(?:tinpan\.proteantech\.in|pan\.utiitsl\.com|proteantech\.in|utiitsl\.com)$/i;
  const DOMAIN = /\b((?:[a-z0-9-]+\.)+(?:gov\.in|nic\.in|proteantech\.in|utiitsl\.com))(\/[^\s),;]*)?/gi;
  function linkify(parent, text) {
    let last = 0;
    for (const m of text.matchAll(DOMAIN)) {
      if (!OFFICIAL.test(m[1])) continue;
      if (m.index > last) parent.append(text.slice(last, m.index));
      const a = el('a', 'ext-link', m[0].replace(/[.]+$/, '')); a.href = C.fixUrl(a.textContent) || 'https://' + a.textContent; a.target = '_blank'; a.rel = 'noopener noreferrer';
      parent.append(a); last = m.index + a.textContent.length;
    }
    if (last < text.length) parent.append(text.slice(last));
  }
  function md(text) {
    const f = document.createDocumentFragment();
    String(text || '').split(/(\*[^*\n]+\*)/g).forEach((part) => {
      if (/^\*[^*\n]+\*$/.test(part)) { const b = el('b'); linkify(b, part.slice(1, -1)); f.append(b); }
      else if (part) linkify(f, part);
    });
    return f;
  }
  const mdBox = (cls, text) => { const d = el('div', cls); d.append(md(text)); return d; };


  // Guide icons: two-tone drawings, one per service, so each guide looks like what it is.
  const GI = {
    pan: '<rect x="3" y="7" width="26" height="18" rx="3.5"/><rect x="7" y="12" width="7" height="5.5" rx="1.2" class="f"/><path d="M18 13h7M18 17h7M7 21.5h18"/>',
    aadhaar: '<rect x="3" y="7" width="26" height="18" rx="3.5"/><circle cx="11" cy="14" r="2.6" class="f"/><path d="M6.5 21.5c.9-3 8.1-3 9 0M19 13h7M19 17h7M19 21h4"/>',
    dl: '<rect x="3" y="7" width="26" height="18" rx="3.5"/><circle cx="11.5" cy="16" r="4.6"/><circle cx="11.5" cy="16" r="1.2" class="f"/><path d="M7 16h3.3M12.7 16H16M11.5 17.2v3.2M20 13h6M20 17h6M20 21h3.5"/>',
    passport: '<rect x="7" y="3" width="18" height="26" rx="2.8"/><circle cx="16" cy="13.5" r="5"/><path d="M11 13.5h10M16 8.5c2.2 2.6 2.2 7.4 0 10M16 8.5c-2.2 2.6-2.2 7.4 0 10M11.5 23.5h9"/>',
    voter: '<path d="M5 17h22v9.5a1.5 1.5 0 01-1.5 1.5h-19A1.5 1.5 0 015 26.5z"/><path d="M11 17V6.5a1 1 0 011-1h8a1 1 0 011 1V17"/><path d="M13.2 11.2l2.1 2.1 3.6-4" /><rect x="11" y="21" width="10" height="2.6" rx="1.3" class="f"/>',
    gst: '<path d="M7 3.5h18v25l-3-2.3-3 2.3-3-2.3-3 2.3-3-2.3-3 2.3z"/><circle cx="12.5" cy="10.5" r="1.8" class="f"/><circle cx="19.5" cy="18.5" r="1.8" class="f"/><path d="M20 9.5l-8 10M12 24h8"/>',
    income: '<path d="M8 3.5h11l6 6v19H8z"/><path d="M19 3.5v6h6"/><path d="M12.5 15h7.5M12.5 18.5h7.5M12.5 15c4.6 0 5 2.1 5 3.3s-.9 3.4-5 3.4l5.2 4.3"/>',
    caste: '<rect x="3.5" y="5" width="25" height="18" rx="2.8"/><path d="M8.5 10.5h15M8.5 14.5h8"/><circle cx="22" cy="20.5" r="4" class="f"/><path d="M19.8 24.2L19 29l3-1.6 3 1.6-.8-4.8"/>',
  };
  const gIcon = (id, fallbackKey) => {
    const body = GI[id]; if (!body) return ico(fallbackKey, 26);
    const doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="30" height="30" class="gi" aria-hidden="true">' + body + '</svg>', 'image/svg+xml');
    return document.importNode(doc.documentElement, true);
  };
  let lastRing = null; let lastMeter = null;
  function ring(p, size = 64) {
    const box = el('div', 'gr-ring'); const pv = Math.max(0, Math.min(1, p));
    box.style.setProperty('--p', String(lastRing === null ? pv : lastRing)); if (lastRing !== null && lastRing !== pv) requestAnimationFrame(() => requestAnimationFrame(() => box.style.setProperty('--p', String(pv)))); lastRing = pv;
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 36 36'); s.setAttribute('aria-hidden', 'true');
    const bg = document.createElementNS(ns, 'circle'); bg.setAttribute('cx', 18); bg.setAttribute('cy', 18); bg.setAttribute('r', 15.5); bg.setAttribute('class', 'gr-bg');
    const fg = document.createElementNS(ns, 'circle'); fg.setAttribute('cx', 18); fg.setAttribute('cy', 18); fg.setAttribute('r', 15.5); fg.setAttribute('class', 'gr-fg'); fg.setAttribute('pathLength', 100);
    s.append(bg, fg); box.append(s);
    const t = el('span', 'gr-pct', Math.round(pv * 100) + '%'); box.append(t);
    return box;
  }
  const tick = (on, label, onclick) => {
    const b = el('button', 'gk' + (on ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', String(on)); b.setAttribute('aria-label', label);
    b.append(ico('check', 15)); b.onclick = onclick; return b;
  };
  const meter = (v) => { const m = el('span', 'meter gm'); const i = el('i'); i.style.setProperty('--v', String(lastMeter === null ? v : lastMeter)); if (lastMeter !== null && lastMeter !== v) requestAnimationFrame(() => requestAnimationFrame(() => i.style.setProperty('--v', String(v)))); lastMeter = v; m.append(i); return m; };

  S.service = async ({ id }) => {
    S.__svc = id;
    const meta = U.svcMeta(id); lastRing = null; lastMeter = null;
    const lang = C.uiLang();
    const col = frame(T(meta[1]), '');
    col.classList.add('wide-col', 'guide');
    const body = el('div', 'g-body'); col.append(body);
    body.append(el('div', 'g-load', T('Loading…')));

    const [gr, ex, lk, dt] = await Promise.all([tcall('guide.get', { id, lang }), tcall('extras.get'), tcall('locker.list'), tcall('details.get')]);
    if (!gr.ok) { body.replaceChildren(U.note(T('Could not load this guide. Check your internet and try again.'), 'warn')); return; }
    const G = gr.data;
    const savedTypes = new Set((lk.ok ? lk.data.docs : []).filter((d) => d.hasNumber).map((d) => d.type));
    let details = dt.ok ? dt.data : { fields: [], filled: 0, total: 0 };
    let allProg = ex.ok ? { ...(ex.data.guides || {}) } : {};
    const P = allProg[id] || (allProg[id] = { route: '', ans: {}, steps: [], docs: [], fee: {}, at: 0 });
    P.ans ||= {}; P.steps ||= []; P.docs ||= []; P.fee ||= {};
    let saveT = null;
    const save = () => { P.at = Date.now(); clearTimeout(saveT); saveT = setTimeout(() => tcall('extras.set', { guides: allProg }), 500); };
    let route = null; // { id, kind, intro, steps } or { kind:'info', text }
    let question = null; let order = [];
    let tab = 'steps';
    const head = el('section', 'g-head');
    const tabs = el('div', 'g-tabs'); tabs.setAttribute('role', 'tablist');
    const pane = el('div', 'g-pane');
    body.replaceChildren(head, tabs, pane);

    const stepsTotal = () => (route?.kind === 'steps' ? route.steps.length : 0);
    const docsDone = () => G.docs.filter((d) => P.docs.includes(d.id)).length;
    const sheetFields = () => G.sheet.map((k) => details.fields.find((f) => f.key === k)).filter(Boolean);
    const haveCount = () => sheetFields().filter((f) => f.value).length;
    const overall = () => {
      const parts = [];
      parts.push(stepsTotal() ? P.steps.filter((n) => n < stepsTotal()).length / stepsTotal() : 0);
      if (G.docs.length) parts.push(docsDone() / G.docs.length);
      if (G.sheet.length) parts.push(haveCount() / G.sheet.length);
      return parts.reduce((a, b) => a + b, 0) / parts.length;
    };
    const nextStep = () => { for (let i = 0; i < stepsTotal(); i++) if (!P.steps.includes(i)) return i; return -1; };

    // ---- header card ----------------------------------------------------------------------------------
    function drawHead() {
      head.replaceChildren();
      const p = overall();
      const info = el('div', 'gh-tx');
      info.append(el('h2', '', G.name), el('p', 'gh-sub', G.blurb));
      let status;
      if (route?.kind === 'info') status = T('Nothing to apply for. Read the note below.');
      else if (!route) status = T('Start by finding your route');
      else if (nextStep() === -1) status = T('Every step is done');
      else status = T('Step {i} of {n} is next', { i: nextStep() + 1, n: stepsTotal() });
      info.append(el('div', 'gh-st', status));
      const gi = el('span', 'gh-ic'); gi.setAttribute('aria-hidden', 'true'); gi.append(gIcon(id, meta[2]));
      const top = el('div', 'gh-top'); top.append(gi, info, ring(p, 52));
      head.append(top);
      const acts = el('div', 'gh-acts');
      acts.append(btn('btn sm', T('Ask Saathi'), () => U.startServiceChat(id)));
      if (route?.kind === 'steps' && P.steps.length) acts.append(btn('btn sm ghost', T('Start over'), confirmReset));
      head.append(acts);
      tabsDraw();
    }
    function tabsDraw() {
      tabs.replaceChildren();
      const items = [
        ['steps', T('Steps'), stepsTotal() ? `${P.steps.filter((n) => n < stepsTotal()).length}/${stepsTotal()}` : ''],
        ['docs', T('What you need'), G.docs.length ? `${docsDone()}/${G.docs.length}` : ''],
        ['me', T('Fill it'), G.sheet.length ? `${haveCount()}/${G.sheet.length}` : ''],
      ];
      for (const [k, label, badge] of items) {
        const b = el('button', 'g-tab'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(tab === k));
        b.append(el('span', '', label)); if (badge) b.append(el('small', '', badge));
        b.onclick = () => { tab = k; tabsDraw(); drawPane(); };
        tabs.append(b);
      }
    }
    function confirmReset() {
      showDialog({
        title: T('Start this guide over?'), body: T('Your ticked steps and answers for this guide are cleared. Your saved details are not touched.'),
        actions: [btn('btn', T('Cancel'), closeDialog), btn('btn danger', T('Start over'), () => { closeDialog(); P.route = ''; P.ans = {}; P.steps = []; save(); route = null; order = []; question = null; init(); })],
      });
    }
    let tipsOpen = false;
    const drawPane = (soft) => {
      const sc = pane.closest('.screen'); const y = sc ? sc.scrollTop : 0;
      pane.replaceChildren();
      if (soft) pane.classList.remove('in'); else { pane.classList.remove('in'); void pane.offsetWidth; pane.classList.add('in'); }
      if (tab === 'steps') stepsPane(); else if (tab === 'docs') { docsPane(); if (G.docs.length) feesPane(); } else mePane();
      if (soft && sc) sc.scrollTop = y;
    };
    const refresh = () => { drawHead(); };

    // ---- steps ---------------------------------------------------------------------------------------
    async function askRoute(answers) {
      const r = await tcall('guide.route', { id, lang, answers });
      return r.ok ? r.data : null;
    }
    async function init() {
      const known = P.ans && Object.keys(P.ans).length;
      if (!G.hasSteps) { route = null; drawHead(); drawPane(); return; }
      const r = await askRoute(known || !G.askFirst ? P.ans : {});
      if (r?.route) { route = r.route; P.route = r.route.id; question = null; } else { route = null; question = r?.question || null; order = Object.keys(P.ans || {}); }
      drawHead(); drawPane();
    }
    function finder() {
      const card = el('section', 'g-card find');
      const n = order.length;
      const top = el('div', 'fd-top'); top.append(el('span', 'fd-k', T('Find your route')), el('span', 'fd-n', T('Question {n}', { n: n + 1 })));
      card.append(top);
      if (!question) { card.append(el('p', 'mut', T('Could not load the question. Try again.')), btn('btn sm', T('Try again'), init)); return card; }
      card.append(el('h3', 'fd-q', question.text));
      const answer = async (v) => {
        const next = { ...P.ans, [question.key]: v };
        const r = await askRoute(next);
        if (!r) return toast(T('Something went wrong. Please try again.'));
        if (r.question && r.question.key === question.key) return; // rejected value
        P.ans = next; order = Object.keys(next);
        if (r.route) { route = r.route; P.route = r.route.id; P.steps = []; question = null; save(); drawHead(); drawPane(); }
        else { question = r.question; save(); drawPane(); }
      };
      const opts = el('div', 'fd-opts');
      if (question.type === 'yn') { opts.append(btn('fd-o', T('Yes'), () => answer('y')), btn('fd-o', T('No'), () => answer('n'))); }
      else if (question.type === 'state') {
        const inp = C.dropdown({ label: T('State'), search: true, placeholder: T('Your state'), options: (U.STATE_LIST || []).map((n) => [n, n]), value: '' });
        const err = el('small', 'fld-h bad'); err.textContent = '';
        const go = btn('btn pri', T('Continue'), async () => {
          const v = inp.value.trim(); if (!v) return;
          go.disabled = true;
          const f = await tcall('state.find', { text: v });
          go.disabled = false;
          if (!f.ok) return toast(T('Something went wrong. Please try again.'));
          if (!f.data.name) { err.textContent = T('I don’t know a state like that.'); return; }
          answer(f.data.name);
        });
        inp.onchange = () => { err.textContent = ''; };
        opts.classList.add('col'); opts.append(inp, err, go);
      } else for (const o of question.options) opts.append(btn('fd-o', o.label, () => answer(o.id)));
      card.append(opts);
      if (order.length) card.append(btn('link-btn fd-back', T('Back'), async () => { const k = order[order.length - 1]; const next = { ...P.ans }; delete next[k]; P.ans = next; save(); const r = await askRoute(next); question = r?.question || null; order = Object.keys(next); drawPane(); }));
      return card;
    }
    function stepsPane() {
      if (!G.hasSteps) { pane.append(U.note(T('This one has no step-by-step guide yet. Use the tabs for documents and fees, or ask Saathi.'), 'help')); tipsCard(); return; }
      if (!route) { pane.append(finder()); tipsCard(); return; }
      if (route.kind === 'info') { pane.append(mdBox('g-card g-info', route.text)); pane.append(btn('btn sm ghost', T('Change my answers'), () => { P.route = ''; P.ans = {}; save(); route = null; order = []; init(); })); return; }
      const intro = el('section', 'g-card route');
      intro.append(mdBox('rt-tx', route.intro));
      const row = el('div', 'rt-acts');
      row.append(btn('link-btn', T('Change my answers'), () => { P.route = ''; P.ans = {}; P.steps = []; save(); route = null; order = []; init(); }), btn('link-btn', T('Copy my details'), copySheet));
      intro.append(row);
      pane.append(intro);
      const total = stepsTotal(); const cur = nextStep();
      const bar = el('div', 'g-progress'); bar.append(el('span', '', T('{done} of {n} steps done', { done: P.steps.filter((n) => n < total).length, n: total })), meter(P.steps.filter((n) => n < total).length / total));
      pane.append(bar);
      const list = el('ol', 'stp');
      route.steps.forEach((text, i) => {
        const done = P.steps.includes(i);
        const li = el('li', 'stp-i' + (done ? ' done' : '') + (i === cur ? ' cur' : ''));
        li.style.setProperty('--i', String(i));
        const k = tick(done, T('Step {i}', { i: i + 1 }), () => toggleStep(i));
        const main = el('div', 'stp-m');
        main.append(el('span', 'stp-n', T('Step {i}', { i: i + 1 })), mdBox('stp-t', text));
        if (i === cur) {
          const a = el('div', 'stp-a');
          a.append(btn('btn pri sm', i === total - 1 ? T('Mark done') : T('Done, next step'), () => toggleStep(i)), btn('btn sm', T('Ask about this step'), () => askStep(i, text)));
          main.append(a);
        } else if (!done) main.append(btn('link-btn stp-ask', T('Ask about this step'), () => askStep(i, text)));
        li.append(k, main); list.append(li);
      });
      pane.append(list);
      if (cur === -1) finishCard();
      tipsCard();
    }
    function toggleStep(i) {
      const at = P.steps.indexOf(i);
      if (at >= 0) P.steps.splice(at, 1); else P.steps.push(i);
      save(); refresh(); drawPane(true);
      const now = P.steps.includes(i);
      const items = pane.querySelectorAll('.stp-i');
      if (items[i]) items[i].classList.add(now ? 'just' : 'undo');
      const cur = pane.querySelector('.stp-i.cur');
      if (cur && now) { cur.classList.add('arrive'); setTimeout(() => cur.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 120); }
    }
    function askStep(i, text) {
      const q = T('I am on step {i} of the {name} guide: "{text}". Explain it simply and tell me what to watch out for.', { i: i + 1, name: G.name, text: text.slice(0, 300) });
      U.chatDo({ type: 'text', text: q }, T('Explain step {i} of {name}', { i: i + 1, name: G.name }));
    }
    function finishCard() {
      const c = el('section', 'g-card fin');
      const ic = el('span', 'fin-ic'); ic.append(ico('check', 22));
      c.append(ic, el('h3', '', T('That is every step')));
      if (G.after) c.append(el('p', 'mut', G.after));
      const acts = el('div', 'stack');
      acts.append(btn('btn pri xl', T('Track this application'), trackDialog));
      if (['dl', 'passport'].includes(id)) acts.append(btn('btn xl', T('Remind me before it expires'), remindDialog));
      c.append(acts); pane.append(c);
    }
    function tipsCard() {
      if (!G.tips.length) return;
      const c = el('details', 'g-card tips'); if (tipsOpen) c.open = true; c.addEventListener('toggle', () => { tipsOpen = c.open; });
      const sm = el('summary'); const ti = el('span', 'ti'); ti.append(ico('warn', 20)); sm.append(ti, el('span', 'tt', T('Watch out for'))); c.append(sm);
      const ul = el('ul', 'tp'); for (const t of G.tips) { const li = el('li'); li.append(ico('warn', 16), el('span', '', t)); ul.append(li); }
      c.append(ul); pane.append(c);
    }
    async function trackDialog() {
      const title = el('input', 'field-i'); title.type = 'text'; title.value = G.name; title.maxLength = 60;
      const ref = el('input', 'field-i'); ref.type = 'text'; ref.placeholder = T('Acknowledgement or reference number'); ref.maxLength = 40; ref.autocapitalize = 'characters'; ref.spellcheck = false;
      const date = el('input', 'field-i'); date.type = 'date'; date.value = todayIso();
      const wrap = el('div', 'sheet-form');
      const f = (l, i) => { const w = el('label', 'fld'); w.append(el('span', 'fld-l', l), i); return w; };
      wrap.append(f(T('What did you apply for?'), title), f(T('Reference number'), ref), f(T('Date applied'), date));
      const ok = btn('btn pri', T('Save'), async () => {
        ok.disabled = true;
        const cur = await tcall('extras.get');
        const apps = cur.ok ? cur.data.apps : [];
        apps.unshift({ id: 'g' + Date.now().toString(36), svc: id, title: title.value.trim() || G.name, ref: ref.value.trim(), note: '', status: 'applied', date: date.value, hist: [{ s: 'applied', ts: Date.now() }] });
        const r = await tcall('extras.set', { apps });
        ok.disabled = false; closeDialog();
        if (r.ok) { toast(T('Saved in Applications')); openScreen('apps'); } else toast(T('Something went wrong. Please try again.'));
      });
      showDialog({ title: T('Track this application'), body: T('Keep the reference number here so you can find it later.'), content: wrap, actions: [btn('btn', T('Not now'), closeDialog), ok] });
    }
    function remindDialog() {
      const date = el('input', 'field-i'); date.type = 'date';
      const w = el('label', 'fld'); w.append(el('span', 'fld-l', T('Expiry date')), date);
      const wrap = el('div', 'sheet-form'); wrap.append(w);
      const ok = btn('btn pri', T('Set reminder'), async () => {
        if (!date.value) return toast(T('That date does not look right.'));
        ok.disabled = true;
        const r = await tcall('reminders.add', { label: T('{doc} expires', { doc: G.name }), due: date.value });
        ok.disabled = false;
        if (r.ok) { closeDialog(); toast(T('Reminder set')); } else toast(T('That date does not look right.'));
      });
      showDialog({ title: T('Remind me before it expires'), body: T('You get a notice a month before, a week before, and on the day.'), content: wrap, actions: [btn('btn', T('Cancel'), closeDialog), ok] });
    }
    function copySheet() {
      const rows = sheetFields().filter((f) => f.value);
      if (!rows.length) { toast(T('Nothing saved yet. Fill your details on the My details tab.')); tab = 'me'; tabsDraw(); drawPane(); return; }
      const text = rows.map((f) => `${T(f.label.en)}: ${f.type === 'choice' ? T((f.options.find((o) => o.id === f.value) || { en: f.value }).en) : f.value}`).join('\n');
      const t = document.createElement('button'); C.copyText(text, t);
    }

    // ---- documents -----------------------------------------------------------------------------------
    function docsPane() {
      if (!G.docs.length) { pane.append(mdBox('g-card', G.fee)); return; }
      const done = docsDone();
      const bar = el('div', 'g-progress'); bar.append(el('span', '', T('{done} of {n} ready', { done, n: G.docs.length })), meter(done / G.docs.length));
      pane.append(bar);
      const list = el('ul', 'dcl');
      G.docs.forEach((d, i) => {
        const on = P.docs.includes(d.id);
        const li = el('li', 'dcl-i' + (on ? ' done' : '')); li.style.setProperty('--i', String(i));
        const k = tick(on, d.label, () => { const at = P.docs.indexOf(d.id); if (at >= 0) P.docs.splice(at, 1); else P.docs.push(d.id); save(); refresh(); drawPane(); });
        const m = el('div', 'dcl-m'); m.append(el('b', '', d.label)); if (d.hint) m.append(el('span', 'dcl-h', d.hint));
        const chips = el('div', 'dcl-c');
        const have = d.locker.find((t) => savedTypes.has(t));
        if (have) { const c = el('span', 'chip ok'); c.append(ico('lock', 13), el('span', '', T('In your locker'))); chips.append(c); }
        else if (d.locker.length) chips.append(btn('chip', T('Add to locker'), () => openScreen('locker')));
        if (d.tool === 'photo') chips.append(btn('chip', T('Resize a photo'), () => openScreen('photo')));
        if (chips.childNodes.length) m.append(chips);
        li.append(k, m); list.append(li);
      });
      pane.append(list);
      const acts = el('div', 'two'); acts.append(btn('btn xl', T('Scan a document'), () => openScreen('scan')), btn('btn xl', T('Open my locker'), () => openScreen('locker')));
      pane.append(acts);
      if (G.docs.length && done === G.docs.length) pane.append(U.note(T('You have everything. Go to the Steps tab.'), 'check'));
    }

    // ---- fees ----------------------------------------------------------------------------------------
    function feesPane() {
      if (!G.calc) {
        const c = el('section', 'g-card'); c.append(el('h3', 'g-h', T('What it costs')), mdBox('fee-tx', G.fee));
        if (G.feeHints.length) { const ul = el('ul', 'tp plain'); for (const h of G.feeHints) { const li = el('li'); li.append(ico('rupee', 16), el('span', '', h)); ul.append(li); } c.append(ul); }
        pane.append(c, U.note(T('Your portal shows the exact amount before you pay.'), 'shield'));
        return;
      }
      const form = el('section', 'g-card calc'); form.append(el('h3', 'g-h', T('Fee calculator')));
      const out = el('section', 'g-card total');
      pane.append(form, out);
      const sel = { ...(P.fee || {}) };
      let seq = 0;
      const run = async () => {
        const my = ++seq;
        const r = await tcall('guide.fee', { id, lang, sel });
        if (my !== seq) return;
        if (!r.ok) { out.replaceChildren(el('p', 'mut', T('Could not work that out. Try again.'))); return; }
        Object.assign(sel, r.data.sel); P.fee = { ...sel }; save();
        drawFields(r.data.visible); drawTotal(r.data);
      };
      const fieldsBox = el('div', 'cf'); form.append(fieldsBox);
      function drawFields(visible) {
        fieldsBox.replaceChildren();
        for (const f of G.calc.fields) {
          if (visible && !visible.includes(f.key)) continue;
          const w = el('div', 'cf-f'); w.append(el('span', 'fld-l', f.label));
          if (f.type === 'choice') {
            const g = el('div', 'seg wrap'); g.setAttribute('role', 'group');
            for (const c of f.choices) { const b = btn('', c.label); b.setAttribute('aria-pressed', String((sel[f.key] ?? f.def) === c.id)); b.onclick = () => { sel[f.key] = c.id; run(); }; g.append(b); }
            w.append(g);
          } else if (f.type === 'toggle') {
            const on = Boolean(sel[f.key] ?? f.def);
            const s = el('button', 'sw' + (on ? ' on' : '')); s.type = 'button'; s.setAttribute('role', 'switch'); s.setAttribute('aria-checked', String(on)); s.setAttribute('aria-label', f.label);
            s.append(el('i')); s.onclick = () => { sel[f.key] = !on; run(); };
            w.classList.add('sw-row'); w.append(s);
          } else {
            const v = Number(sel[f.key] ?? f.def);
            const st = el('div', 'stepper');
            const minus = btn('icon-btn', '−', () => { sel[f.key] = Math.max(f.min ?? 0, v - 1); run(); }); minus.setAttribute('aria-label', T('Less'));
            const plus = btn('icon-btn', '+', () => { sel[f.key] = Math.min(f.max ?? 99, v + 1); run(); }); plus.setAttribute('aria-label', T('More'));
            st.append(minus, el('b', '', String(v)), plus); w.append(st);
          }
          fieldsBox.append(w);
        }
      }
      function drawTotal(d) {
        out.replaceChildren();
        const lines = el('ul', 'ln');
        for (const l of d.lines) {
          const li = el('li'); const left = el('span', 'ln-l', l.label); if (l.note) left.append(el('small', '', l.note));
          const amt = l.amount === null ? (l.range ? inr(l.range[0]) + ' – ' + inr(l.range[1]) : T('Shown at payment')) : (l.amount < 0 ? '− ' + inr(-l.amount) : l.amount === 0 ? T('Free') : inr(l.amount));
          li.append(left, el('b', 'ln-a', amt)); lines.append(li);
        }
        out.append(lines);
        const tot = el('div', 'tot');
        let label = T('Total'); let value;
        if (!d.total) { value = T('Shown at payment'); }
        else if (d.total[0] === d.total[1]) value = d.total[0] === 0 ? T('Free') : (d.approx ? T('About {amt}', { amt: inr(d.total[0]) }) : inr(d.total[0]));
        else value = inr(d.total[0]) + ' – ' + inr(d.total[1]);
        if (d.partial && d.total) label = T('Total so far');
        tot.append(el('span', '', label), el('b', 'tot-v', value)); out.append(tot);
        for (const n of d.notes) out.append(el('p', 'tot-n', n));
        const det = el('details', 'g-det'); det.append(el('summary', '', T('Official wording')), mdBox('fee-tx', G.fee)); out.append(det);
      }
      drawFields(null);
      run();
    }

    // ---- my details ----------------------------------------------------------------------------------
    function fillAlong() {
      const rows = sheetFields().filter((f) => f.value).map((f) => ({ f, label: T(f.label.en), val: f.type === 'choice' ? T((f.options.find((o) => o.id === f.value) || { en: f.value }).en) : f.value }));
      if (!rows.length) return;
      let i = 0; const wrap = el('div', 'fw');
      const draw = () => {
        const r = rows[i]; wrap.replaceChildren();
        const bar = el('div', 'fw-bar'); const fill = el('i'); fill.style.width = ((i + 1) / rows.length * 100) + '%'; bar.append(fill);
        const v = el('div', 'fw-v', r.val); const sens = SENS.has(r.f.key); if (sens) v.classList.add('sens');
        const back = btn('btn', T('Back'), () => { if (i > 0) { i--; draw(); } }); back.disabled = i === 0;
        const last = i === rows.length - 1;
        const next = btn('btn pri', last ? T('Copy and finish') : T('Copy and next'), async function () {
          const t = document.createElement('button'); C.copyText(String(r.f.value), t);
          if (last) closeDialog(); else { i++; draw(); }
        });
        wrap.append(el('div', 'fw-c', T('{i} of {n}', { i: i + 1, n: rows.length })), bar, el('div', 'fw-l', r.label), v,
          el('p', 'fw-h', T('Tap the box on the website that says "{label}", paste, then come back.', { label: r.label })));
        const ac = el('div', 'fw-a'); ac.append(back, next); wrap.append(ac);
      };
      draw();
      showDialog({ title: T('Fill it with me'), content: wrap, actions: [btn('btn', T('Close'), closeDialog)] });
    }
    function mePane() {
      const fields = sheetFields();
      if (!fields.length) { pane.append(U.note(T('This guide needs no saved details.'), 'check')); return; }
      const have = haveCount();
      const bar = el('div', 'g-progress'); bar.append(el('span', '', T('{done} of {n} saved', { done: have, n: fields.length })), meter(have / fields.length));
      pane.append(bar);
      if (have) {
        const fw = el('div', 'fw-cta'); const ft = el('div', 'fw-t'); ft.append(el('b', '', T('Fill it with me')), el('span', '', T('Saathi reads out each value in the order the form asks. You paste it into the official site.')));
        fw.append(ft, btn('btn pri', T('Start'), () => fillAlong())); pane.append(fw);
      }
      pane.append(mdBox('g-lead', have === fields.length ? T('Everything this form asks for is saved. Copy each value as you go.') : T('Fill in what is missing. It is saved encrypted and reused for every form.')));
      const box = el('div', 'g-card me'); const inputs = {};
      fields.forEach((f, i) => {
        const r = el('div', 'me-r'); r.style.setProperty('--i', String(i));
        const lab = T(f.label.en);
        const left = el('div', 'me-l'); left.append(el('span', 'l', lab));
        if (f.value) {
          const shownVal = f.type === 'choice' ? T((f.options.find((o) => o.id === f.value) || { en: f.value }).en) : f.value;
          const v = el('span', 'v' + (SENS.has(f.key) ? ' pk-dots' : ''), SENS.has(f.key) ? '••••••••' : shownVal);
          left.append(v);
          const act = el('div', 'me-a');
          if (SENS.has(f.key)) {
            let timer = null;
            const show = btn('copy', T('Show'), () => { if (v.classList.contains('on')) return hide(); v.textContent = shownVal; v.classList.add('on'); show.textContent = T('Hide'); timer = setTimeout(hide, 20000); });
            const hide = () => { clearTimeout(timer); v.textContent = '••••••••'; v.classList.remove('on'); show.textContent = T('Show'); };
            act.append(show);
          }
          act.append(btn('copy', T('Copy'), function () { C.copyText(f.value, this); }));
          r.append(left, act);
        } else {
          let inp;
          if (f.type === 'choice') {
            inp = el('div', 'seg'); inp.setAttribute('role', 'group'); inp.value = '';
            for (const o of f.options) { const b = btn('', T(o.en)); b.setAttribute('aria-pressed', 'false'); b.onclick = () => { inp.value = inp.value === o.id ? '' : o.id; for (const x of inp.children) x.setAttribute('aria-pressed', 'false'); if (inp.value) b.setAttribute('aria-pressed', 'true'); }; inp.append(b); }
          } else if (f.type === 'longtext') { inp = el('textarea', 'field-i'); inp.rows = 2; }
          else if (f.key === 'state') { inp = C.dropdown({ label: T('State'), search: true, placeholder: T('Choose your state'), options: (U.STATE_LIST || []).map((n) => [n, n]), value: '' }); }
          else { inp = el('input', 'field-i'); inp.type = 'text'; inp.autocomplete = 'off'; inp.spellcheck = false; if (f.type === 'date') inp.placeholder = T('DD/MM/YYYY'); if (f.type === 'phone' || f.type === 'pin') inp.inputMode = 'numeric'; }
          inputs[f.key] = inp;
          left.append(inp);
          r.append(left);
        }
        box.append(r);
      });
      pane.append(box);
      if (Object.keys(inputs).length) {
        const er = el('p', 'fld-err'); er.hidden = true; er.setAttribute('role', 'alert');
        const save1 = btn('btn pri xl', T('Save what I filled in'), async () => {
          const values = {}; for (const [k, i] of Object.entries(inputs)) if ((i.value ?? '').toString().trim()) values[k] = i.value;
          if (!Object.keys(values).length) { er.textContent = T('Fill in at least one field.'); er.hidden = false; return; }
          er.hidden = true; save1.disabled = true;
          const r = await tcall('details.set', { values });
          save1.disabled = false;
          if (!r.ok) { er.textContent = T('Something went wrong. Please try again.'); er.hidden = false; return; }
          details = r.data;
          if (r.data.bad?.length) { er.textContent = T('Some of that does not look right. Check the name and date.'); er.hidden = false; }
          else toast(T('Saved'));
          refresh(); drawPane();
        });
        pane.append(er, save1);
      }
      pane.append(U.note(T('Stored encrypted. Never sent to the AI.'), 'lock'));
    }

    drawHead();
    await init();
    return () => { if (saveT) { clearTimeout(saveT); tcall('extras.set', { guides: allProg }); } };
  };
})();
