// Saathi landing page. Plain script, no libraries. Without JavaScript every section still reads.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rupees = (p) => '₹' + (p % 100 === 0 ? p / 100 : (p / 100).toFixed(2));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
  const keep = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } };

  // ---- Header: a dark bar once the sky of the hero is behind you ----------------------------------
  const nav = $('#nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---- Get started: a real three-step onboarding (same data the bot uses) ------------------------
  const ob = $('#start');
  if (ob) {
    const steps = $$('.ob-step', ob), dots = $$('#obDots i'), count = $('#obCount');
    const back = $('#obBack'), next = $('#obNext'), go = $('#obGo');
    const svcWrap = $('#obSvc'), svcName = $('#obSvcName'), feeEl = $('#obFee'), docsEl = $('#obDocs');
    const siteRow = $('#obSiteRow'), siteA = $('#obSite'), flag = $('#obFlag');
    const docIcon = () => $('#tplDoc').content.firstElementChild.cloneNode(true);
    let step = 1, lang = 'en', services = null, chosen = null; // chosen: service object, 'other', or null

    const setStep = (n) => {
      step = n;
      steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
      dots.forEach((d, i) => d.classList.toggle('on', i === n - 1));
      count.textContent = `Step ${n} of 3`;
      back.hidden = n === 1;
      next.hidden = n === 3;
      go.hidden = n !== 3;
      next.disabled = n === 2 && chosen === null;
      if (n === 3) fillStep3();
    };
    const focusStep = () => {
      const h = steps[step - 1]?.querySelector('h3');
      if (h) h.focus({ preventScroll: true });
    };

    // Step 1: language. Only English and Hindi here; the app has the rest.
    $$('[data-lang]', ob).forEach((b) => b.addEventListener('click', () => {
      lang = b.dataset.lang;
      $$('[data-lang]', ob).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));

    // Step 2: service rows, loaded from the app's own service list.
    const pick = (b) => {
      $$('[data-svc]', ob).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      chosen = b.dataset.svc === '' ? 'other' : services?.find((s) => s.id === b.dataset.svc) || null;
      next.disabled = chosen === null;
    };
    const rowFor = (sv) => {
      const b = el('button', 'srow'); b.type = 'button'; b.dataset.svc = sv.id; b.setAttribute('aria-pressed', 'false');
      const c = el('span', 'circ'); c.append(docIcon());
      const t = el('span', 'st'); t.append(el('b', '', sv.name));
      b.append(c, t);
      b.addEventListener('click', () => pick(b));
      return b;
    };
    const loadServices = () => fetch('/app/api/services').then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => {
      services = d.services || [];
      svcWrap.replaceChildren(...services.map(rowFor));
    }).catch(() => {
      svcWrap.replaceChildren(el('p', 'tiny', 'Could not load the list just now. Pick “Something else”, or open the app.'));
    });
    const other = $('[data-svc=""]', ob);
    if (other) other.addEventListener('click', () => pick(other));

    // Step 3: what to keep ready, from the chosen service.
    function fillStep3() {
      if (chosen === 'other' || chosen === null) {
        svcName.textContent = 'Ask in your own words';
        feeEl.textContent = 'Free to ask. Prices show when you go ahead.';
        docsEl.replaceChildren(el('li', '', 'Tell Saathi what you need, in your own words.'), el('li', '', 'It asks a few questions, then gives you the steps.'));
        siteRow.hidden = true;
        go.href = '/app';
        return;
      }
      const sv = chosen;
      svcName.textContent = sv.name;
      const f = String(sv.fee || '').split('\n')[0];
      const m = f.match(/^[^.]{6,60}\./);
      feeEl.textContent = m ? m[0] : f;
      const rest = m ? f.slice(m[0].length).trim() : '';
      if (rest) feeEl.append(el('div', 'tiny', rest));
      const lines = (sv.docs || []).filter((l) => /^[•\-*]/.test(l)).map((l) => l.replace(/^[•\-*]\s*/, ''));
      const head = (sv.docs || []).find((l) => !/^[•\-*]/.test(l));
      docsEl.replaceChildren(...(lines.length ? lines.slice(0, 7) : [head || 'Ask Saathi for the list']).map((l) => el('li', '', l)));
      const site = (sv.sites || []).find((u) => /^https:\/\//.test(u));
      siteRow.hidden = !site;
      if (site) { siteA.textContent = new URL(site).host; siteA.href = site; }
      flag.hidden = !(sv.unverified && sv.unverified.length);
      go.href = '/app?service=' + encodeURIComponent(sv.id);
    }

    // Opening the app: remember the language and the chosen service, then the app picks them up.
    go.addEventListener('click', () => {
      save('saathi.lang', lang);
      if (chosen && chosen !== 'other') keep('saathi.open', chosen.id);
    });

    next.addEventListener('click', () => { if (step < 3) { setStep(step + 1); focusStep(); } });
    back.addEventListener('click', () => { if (step > 1) { setStep(step - 1); focusStep(); } });
    setStep(1);
    loadServices();
  }

  // ---- Scam checker (same rules as the bot; nothing is saved, no link is opened) ----------------
  const chkIn = $('#chkIn'), chkGo = $('#chkGo'), chkOut = $('#chkOut'), chkHint = $('#chkHint');
  const bold = (parent, text) => {
    // Turns *word* into <b>word</b> without ever using innerHTML.
    String(text).split(/(\*[^*]+\*)/).forEach((part) => {
      if (/^\*[^*]+\*$/.test(part)) parent.append(el('b', '', part.slice(1, -1)));
      else if (part) parent.append(document.createTextNode(part.replace(/[_]/g, '')));
    });
  };
  async function runCheck() {
    const text = chkIn.value.trim();
    if (text.length < 4) { chkIn.focus(); chkHint.textContent = 'Paste something first.'; return; }
    chkGo.disabled = true; chkGo.textContent = 'Checking…';
    try {
      const r = await fetch('/app/api/check', { method: 'POST', headers: { 'content-type': 'application/json', 'x-saathi': '1' }, body: JSON.stringify({ text }) });
      if (r.status === 429) throw new Error('slow');
      if (!r.ok) throw new Error('bad');
      const v = await r.json();
      chkOut.replaceChildren();
      chkOut.dataset.l = v.level;
      const t = el('p', 'vt'); bold(t, v.headline); chkOut.append(t);
      if (v.lines?.length) { const ul = el('ul'); for (const l of v.lines) { const li = el('li'); bold(li, l.text.replace(/^•\s*/, '')); ul.append(li); } chkOut.append(ul); }
      if (v.advice) { const a = el('p', 'adv'); bold(a, v.advice); chkOut.append(a); }
      chkOut.hidden = false;
      chkHint.textContent = 'Never paste an OTP or card number.';
    } catch (e) {
      chkOut.hidden = false; chkOut.dataset.l = 'none';
      chkOut.replaceChildren(el('p', 'vt', e.message === 'slow' ? 'Too many checks. Try again in a minute.' : 'Could not check just now. Try again, or open the app.'));
    } finally { chkGo.disabled = false; chkGo.textContent = 'Check it'; }
  }
  if (chkGo) {
    chkGo.addEventListener('click', runCheck);
    chkIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runCheck(); });
    for (const b of $$('.try button')) b.addEventListener('click', () => { chkIn.value = b.dataset.ex; runCheck(); });
  }

  // ---- Locker demo: locked until you tap, hides again on its own -------------------------------
  const vcard = $('#vcard'), vBtn = $('#vBtn'), vBody = $('#vBody'), vBar = $('#vBar');
  if (vcard) {
    let timer = null;
    const SAMPLE = 'ABCPE1234F';
    const lock = () => {
      clearTimeout(timer);
      vcard.dataset.state = 'locked';
      vBody.replaceChildren(el('span', 'mask', '••••••234F'));
      vBtn.textContent = 'Unlock';
      const bar = $('i', vBar); bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)';
    };
    const open = () => {
      vcard.dataset.state = 'open';
      vBody.replaceChildren(el('span', 'val', SAMPLE));
      vBtn.textContent = 'Hide';
      const bar = $('i', vBar);
      bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = 'transform 8s linear'; bar.style.transform = 'scaleX(0)'; }));
      timer = setTimeout(lock, 8000);
    };
    vBtn.addEventListener('click', () => (vcard.dataset.state === 'open' ? lock() : open()));
  }

  // ---- From the server: real prices, and the WhatsApp link (sections stay hidden if the server has none)
  fetch('/app/api/config').then((r) => (r.ok ? r.json() : Promise.reject())).then((c) => {
    if (c.whatsapp && /^https:\/\/wa\.me\//.test(c.whatsapp)) {
      for (const a of $$('[data-wa]')) { a.href = c.whatsapp; a.hidden = false; }
    }
    const p = c.prices, sec = $('#price');
    if (!p || !sec) return;
    const items = [['A message', p.msgPaise], ['An AI answer', p.aiPaise], ['A document check', p.scanPaise], ['A copy sheet', p.sheetPaise], ['A voice note', p.voicePaise], ['A reminder', p.remindPaise]]
      .filter(([, v]) => Number.isFinite(v) && v > 0);
    if (!items.length) return;
    $('#priceLede').textContent = `New people start with ${rupees(p.trialPaise)} and ${p.freeMsgsPerDay} free messages a day. After that, each action costs a little. No subscription.`;
    const rows = $('#rcRows'); rows.replaceChildren();
    for (const [label, v] of items) {
      const r = el('div', 'rrow'); r.setAttribute('role', 'listitem');
      r.append(el('span', 'rt', label), el('span', 'rv', rupees(v)));
      rows.append(r);
    }
    if (p.pack) $('#packNote').textContent = `Or a ${p.pack.days}-day PAN pack for ${rupees(p.pack.paise)}: ${p.pack.scans} document checks, ${p.pack.ai} AI answers, ${p.pack.voice} voice notes and ${p.pack.remind} reminders.`;
    sec.hidden = false;
  }).catch(() => {});
})();

// ---- FAQ answers open with one height animation (no second animation on the arrow) ----------------
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.addEventListener('click', (e) => {
    const sum = e.target.closest && e.target.closest('.faq summary'); const d = sum && sum.parentElement;
    if (!d || !d.animate) return;
    e.preventDefault();
    if (d._a) d._a.cancel();
    const startH = d.offsetHeight; const opening = !d.open;
    d.style.overflow = 'hidden'; if (opening) d.open = true;
    const endH = opening ? d.scrollHeight : sum.offsetHeight;
    const a = d.animate({ height: [startH + 'px', endH + 'px'] }, { duration: opening ? 380 : 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    d._a = a; a.onfinish = () => { d._a = null; d.style.overflow = ''; if (!opening) d.open = false; };
  });
})();

// ---- every official website name, anywhere on the page, becomes a real link ----------------------------------
(() => {
  'use strict';
  const LANDING = {
    'incometax.gov.in': 'https://www.incometax.gov.in/iec/foportal/', 'www.incometax.gov.in': 'https://www.incometax.gov.in/iec/foportal/',
    'eportal.incometax.gov.in': 'https://eportal.incometax.gov.in/iec/foservices/',
    'tinpan.proteantech.in': 'https://www.protean-tinpan.com/', 'proteantech.in': 'https://www.protean-tinpan.com/',
    'pan.utiitsl.com': 'https://www.pan.utiitsl.com/', 'utiitsl.com': 'https://www.pan.utiitsl.com/', 'www.pan.utiitsl.com': 'https://www.pan.utiitsl.com/',
    'sarathi.parivahan.gov.in': 'https://sarathi.parivahan.gov.in/sarathiservice/', 'parivahan.gov.in': 'https://parivahan.gov.in/',
    'uidai.gov.in': 'https://uidai.gov.in/', 'myaadhaar.uidai.gov.in': 'https://myaadhaar.uidai.gov.in/', 'bookappointment.uidai.gov.in': 'https://bookappointment.uidai.gov.in/',
    'passportindia.gov.in': 'https://www.passportindia.gov.in/', 'www.passportindia.gov.in': 'https://www.passportindia.gov.in/', 'portal2.passportindia.gov.in': 'https://portal2.passportindia.gov.in/',
    'gst.gov.in': 'https://www.gst.gov.in/', 'www.gst.gov.in': 'https://www.gst.gov.in/', 'reg.gst.gov.in': 'https://reg.gst.gov.in/',
    'voters.eci.gov.in': 'https://voters.eci.gov.in/', 'electoralsearch.eci.gov.in': 'https://electoralsearch.eci.gov.in/', 'services.india.gov.in': 'https://services.india.gov.in/',
  };
  const HOST = /\b((?:[a-z0-9-]+\.)+(?:gov\.in|nic\.in|proteantech\.in|utiitsl\.com|protean-tinpan\.com))(\/[^\s),;]*)?/gi;
  const fix = (u) => {
    const m = /^(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})(\/[^\s]*)?/i.exec(String(u || '').trim());
    if (!m) return null;
    const host = m[1].toLowerCase(); const path = m[2] || '';
    if (/incometax\.gov\.in$/.test(host) && /instant|e-?pan/i.test(path)) return 'https://eportal.incometax.gov.in/iec/foservices/#/pre-login/instant-e-pan';
    if (LANDING[host]) return LANDING[host];
    return 'https://' + host + '/';
  };
  const SKIP = new Set(['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'SELECT', 'OPTION', 'CODE', 'TITLE']);
  const skip = (n) => { for (let e = n.parentElement; e; e = e.parentElement) { if (SKIP.has(e.tagName) || e.isContentEditable || e.classList?.contains('no-link') || e.classList?.contains('bad')) return true; } return false; };
  function linkText(node) {
    const text = node.nodeValue; HOST.lastIndex = 0;
    if (!HOST.test(text)) return; HOST.lastIndex = 0;
    const frag = document.createDocumentFragment(); let last = 0;
    for (const m of text.matchAll(HOST)) {
      const shown = (m[1] + (m[2] || '')).replace(/[.!?:]+$/, '');
      if (m.index > last) frag.append(text.slice(last, m.index));
      const a = document.createElement('a'); a.className = 'ext-link'; a.textContent = shown; a.href = fix(shown); a.target = '_blank'; a.rel = 'noopener noreferrer';
      frag.append(a); last = m.index + shown.length;
    }
    if (last < text.length) frag.append(text.slice(last));
    node.replaceWith(frag);
  }
  function scan(root) {
    if (!root || root.nodeType === 8) return;
    if (root.nodeType === 3) { if (!skip(root)) linkText(root); return; }
    if (root.nodeType !== 1 || SKIP.has(root.tagName)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const list = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.length > 5 && n.nodeValue.includes('.') && !skip(n)) list.push(n);
    list.forEach(linkText);
  }
  let queued = new Set(); let raf = 0;
  const flush = () => { raf = 0; const q = queued; queued = new Set(); q.forEach((n) => { if (n.isConnected) scan(n); }); };
  const mo = new MutationObserver((muts) => { for (const m of muts) { m.addedNodes.forEach((n) => queued.add(n)); if (m.type === 'characterData') queued.add(m.target); } if (!raf) raf = requestAnimationFrame(flush); });
  const start = () => { scan(document.body); mo.observe(document.body, { childList: true, subtree: true, characterData: true }); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
