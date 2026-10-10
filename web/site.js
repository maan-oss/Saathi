// Saathi landing page. Plain script. GSAP and ScrollTrigger (in /vendor) add the scroll motion; without them every
// section still reads and works. Text from the server is set with textContent only, never innerHTML.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const rupees = (p) => '₹' + (p % 100 === 0 ? p / 100 : (p / 100).toFixed(2));
  // A price cell keeps its amount in paise, so the counter below can count up to it.
  const priceCell = (paise) => { const n = el('span', 'rval', rupees(paise)); n.dataset.paise = String(paise); return n; };
  function countUp(node, to) {
    const t0 = performance.now(), dur = 900;
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      node.textContent = rupees(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const G = window.gsap;
  const ST = window.ScrollTrigger;
  const motion = !reduce && !!G && !!ST;
  if (motion) G.registerPlugin(ST);

  // ---- Header: a frosted bar once you scroll ----
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- The six forms. The text is written here, not on the server. ----
  const SVC = {
    pan: { label: 'New PAN card', docs: ['Aadhaar card', 'Passport-size photo', 'Mobile number'], site: 'incometax.gov.in', href: '/app?service=pan' },
    aadhaar: { label: 'Update Aadhaar', docs: ['Aadhaar card', 'Proof of your new address', 'Mobile number linked to Aadhaar'], site: 'uidai.gov.in', href: '/app?service=aadhaar' },
    dl: { label: 'Driving licence', docs: ['Proof of age', 'Proof of address', 'Passport-size photo'], site: 'sarathi.parivahan.gov.in', href: '/app?service=dl' },
    passport: { label: 'Passport', docs: ['Your old passport', 'Proof of address', 'Mobile number'], site: 'passportindia.gov.in', href: '/app?service=passport' },
    voter: { label: 'Voter ID', docs: ['Your voter ID card', 'Proof of address', 'Passport-size photo'], site: 'voters.eci.gov.in', href: '/app?service=voter' },
    gst: { label: 'GST registration', docs: ['PAN card', 'Aadhaar card', 'Business address proof', 'Bank account proof'], site: 'gst.gov.in', href: '/app?service=gst' },
  };
  // What a typed sentence means. The first rule that matches wins.
  const RULES = [
    ['aadhaar', /aadhaa?r|adhaar|address/i],
    ['pan', /\bpan\b/i],
    ['dl', /licen[cs]e|driv|learner/i],
    ['passport', /passport/i],
    ['voter', /voter|vote|election/i],
    ['gst', /\bgst\b|registration/i],
  ];

  // ---- Stage card: shows the checklist for the form you picked ----
  const card = $('#float');
  const chips = $$('.chip[data-svc]');
  let current = 'pan';
  const fadeIn = (nodes) => { if (motion) G.fromTo(nodes, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.06, ease: 'power3.out', clearProps: 'transform,opacity' }); };

  function renderCard(key) {
    const s = SVC[key];
    const list = el('ul', 'float-list');
    for (const d of s.docs) { const li = el('li'); li.append(el('span', 'tk'), document.createTextNode(d)); list.append(li); }
    const go = el('a', 'float-go');
    go.href = s.href;
    go.dataset.app = '';
    go.append(el('span', 'float-dom', s.site), el('span', '', 'Finish on the official site →'));
    card.replaceChildren(el('h2', 'float-t', s.label), el('p', 'float-s', 'Keep these ready before you start.'), list, go);
    fadeIn([...card.children].filter((n) => n !== list));
    if (motion) G.from([...list.children], { x: -12, opacity: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out', clearProps: 'transform,opacity' });
  }
  function setService(key) {
    if (!SVC[key]) return;
    current = key;
    chips.forEach((b) => { const on = b.dataset.svc === key; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    renderCard(key);
  }
  chips.forEach((b) => b.addEventListener('click', () => setService(b.dataset.svc)));

  // ---- The question box: an example types itself in until you start typing ----
  const ask = $('#ask');
  const askIn = $('#askIn');
  const askField = $('.ask-field');
  const ghost = $('#askGhost');
  const EX = [
    'I need a new PAN card',
    'I want to change my Aadhaar address',
    'I need a learner licence',
    'I need to renew my passport',
    'I want to correct my voter ID',
    'I want to register for GST',
  ];
  const syncField = () => askField.classList.toggle('has-val', askIn.value.length > 0);
  askIn.addEventListener('input', () => { syncField(); openAsk(); });
  syncField();
  function typeGhost() {
    if (reduce) { ghost.textContent = EX[0]; return; }
    let i = 0, n = 0, dir = 1;
    const step = () => {
      const s = EX[i];
      if (dir > 0) {
        n += 1;
        ghost.textContent = s.slice(0, n);
        if (n === s.length) { dir = -1; return setTimeout(step, 1700); }
        return setTimeout(step, 55);
      }
      n -= 1;
      ghost.textContent = s.slice(0, n);
      if (n === 0) { dir = 1; i = (i + 1) % EX.length; return setTimeout(step, 380); }
      return setTimeout(step, 26);
    };
    ghost.textContent = '';
    setTimeout(step, 900);
  }
  typeGhost();

  // ---- Matching forms: as you type, the forms that fit appear under the box (a listbox). ----
  // Arrow keys move, Enter picks the highlighted form (with none highlighted, Enter submits as before), Escape closes.
  const askList = $('#askList');
  let shown = [];
  let active = -1;
  function matchesFor(q) {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return Object.keys(SVC)
      .filter((k) => SVC[k].label.toLowerCase().includes(s) || RULES.some(([kk, re]) => kk === k && re.test(q.trim())))
      .slice(0, 4);
  }
  function closeAsk() {
    shown = [];
    active = -1;
    askList.replaceChildren();
    askList.hidden = true;
    askIn.setAttribute('aria-expanded', 'false');
    askIn.removeAttribute('aria-activedescendant');
  }
  function markActive(i) {
    active = i;
    [...askList.children].forEach((li, n) => li.setAttribute('aria-selected', String(n === i)));
    if (i >= 0) askIn.setAttribute('aria-activedescendant', askList.children[i].id);
    else askIn.removeAttribute('aria-activedescendant');
  }
  function showStage() {
    const stage = $('#stage');
    if (stage.getBoundingClientRect().top > innerHeight * 0.7) stage.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }
  function pickAsk(key) {
    askIn.value = SVC[key].label;
    syncField();
    closeAsk();
    setService(key);
    showStage();
  }
  function openAsk() {
    shown = matchesFor(askIn.value);
    if (!shown.length) { closeAsk(); return; }
    askList.replaceChildren(...shown.map((k, n) => {
      const li = el('li');
      li.id = 'askOpt' + n;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.append(el('span', '', SVC[k].label), el('small', '', SVC[k].site));
      li.addEventListener('mousedown', (e) => e.preventDefault()); // keeps focus in the box
      li.addEventListener('click', () => pickAsk(k));
      return li;
    }));
    const wasHidden = askList.hidden;
    askList.hidden = false;
    askIn.setAttribute('aria-expanded', 'true');
    markActive(-1);
    if (wasHidden && motion) G.from(askList, { opacity: 0, y: -6, duration: 0.3, ease: 'power2.out', clearProps: 'transform,opacity' });
  }
  askIn.addEventListener('keydown', (e) => {
    const n = shown.length;
    if (!n) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); markActive((active + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); markActive(active <= 0 ? n - 1 : active - 1); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pickAsk(shown[active]); }
    else if (e.key === 'Escape') { closeAsk(); }
  });
  askIn.addEventListener('blur', closeAsk);

  ask.addEventListener('submit', (e) => {
    e.preventDefault();
    closeAsk();
    const v = askIn.value.trim();
    if (!v) { askIn.focus(); return; }
    const hit = RULES.find(([, re]) => re.test(v));
    if (hit) {
      setService(hit[0]);
    } else {
      card.replaceChildren(el('h2', 'float-t', 'Which form is it?'), el('p', 'float-s', 'Tap one of the six forms above, or type its name, like “passport” or “voter ID”.'));
      fadeIn([...card.children]);
    }
    showStage();
  });

  // ---- Language: the same reply in English or Hindi. The text fades out, swaps, and fades back in. ----
  const langBtns = $$('.lang-btn');
  function setLang(lang) {
    langBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    document.documentElement.lang = lang;
    const nodes = $$('[data-en]');
    const apply = () => nodes.forEach((n) => { n.textContent = n.dataset[lang] || n.dataset.en; });
    if (!motion) { apply(); return; }
    G.to(nodes, { opacity: 0, duration: 0.16, ease: 'power1.in', onComplete: () => { apply(); G.to(nodes, { opacity: 1, duration: 0.32, ease: 'power1.out' }); } });
  }
  langBtns.forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

  // ---- Questions: each answer opens in place ----
  $$('.qa-btn').forEach((b) => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    b.parentElement.classList.toggle('open', open);
  }));

  // ---- Scam check (same rules as the bot; nothing is saved, no link is opened) ----
  const chkIn = $('#chkIn'), chkGo = $('#chkGo'), chkOut = $('#chkOut'), chkHint = $('#chkHint');
  // Turns *word* into <b>word</b>. Never uses innerHTML.
  const bold = (parent, text) => {
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
      if (v.lines?.length) {
        const ul = el('ul');
        for (const l of v.lines) { const li = el('li'); bold(li, String(l.text).replace(/^•\s*/, '')); ul.append(li); }
        chkOut.append(ul);
      }
      if (v.advice) { const a = el('p', 'adv'); bold(a, v.advice); chkOut.append(a); }
      chkOut.hidden = false;
      chkHint.textContent = 'Never paste an OTP or card number.';
    } catch (e) {
      chkOut.hidden = false;
      chkOut.dataset.l = 'none';
      chkOut.replaceChildren(el('p', 'vt', e.message === 'slow' ? 'Too many checks. Try again in a minute.' : 'Could not check just now. Try again, or open the app.'));
    } finally {
      chkGo.disabled = false;
      chkGo.textContent = 'Check it';
      if (motion && !chkOut.hidden) G.from(chkOut, { opacity: 0, y: 16, duration: 0.6, ease: 'power3.out', clearProps: 'transform,opacity' });
    }
  }
  if (chkGo) {
    chkGo.addEventListener('click', runCheck);
    chkIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runCheck(); });
    for (const b of $$('.try button')) b.addEventListener('click', () => { chkIn.value = b.dataset.ex; runCheck(); });
  }

  // ---- Prices from the server. The section stays hidden if the server has none. ----
  fetch('/app/api/config')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((c) => {
      const p = c.prices, sec = $('#price');
      if (!p || !sec) return;
      const items = [
        ['A message', p.msgPaise],
        ['An AI answer', p.aiPaise],
        ['A document check', p.scanPaise],
        ['A copy sheet', p.sheetPaise],
        ['A voice note', p.voicePaise],
        ['A reminder', p.remindPaise],
      ].filter(([, v]) => Number.isFinite(v) && v > 0);
      if (!items.length) return;
      $('#priceLede').textContent = `New people start with ${rupees(p.trialPaise)} and ${p.freeMsgsPerDay} free messages a day. After that, each action costs a little. No subscription.`;
      const rows = $('#rcRows');
      rows.replaceChildren();
      for (const [label, v] of items) {
        const r = el('div', 'rrow');
        r.setAttribute('role', 'listitem');
        r.append(el('span', 'rt', label), priceCell(v));
        rows.append(r);
      }
      if (p.pack) {
        const r = el('div', 'rrow pk');
        r.setAttribute('role', 'listitem');
        const t = el('span', 'rt', `${p.pack.days}-day PAN pack`);
        t.append(el('small', '', `${p.pack.scans} document checks, ${p.pack.ai} AI answers, ${p.pack.voice} voice notes and ${p.pack.remind} reminders`));
        r.append(t, priceCell(p.pack.paise));
        rows.append(r);
      }
      sec.hidden = false;
      if (motion) {
        reveal($$('#price [data-rv]'));
        G.from('#rcRows .rrow', { x: innerWidth < 900 ? 18 : 46, opacity: 0, duration: 0.8, stagger: 0.09, ease: 'power3.out', clearProps: 'transform,opacity', scrollTrigger: { trigger: '.receipt', start: 'top 86%', once: true } });
        // Each price counts up from zero as the receipt comes into view. Without this, the final amounts are already there.
        const cells = $$('#rcRows .rval');
        ST.create({ trigger: '.receipt', start: 'top 86%', once: true, onEnter: () => cells.forEach((n) => countUp(n, Number(n.dataset.paise))) });
        ST.refresh();
      }
    })
    .catch(() => {});

  // ---- Motion (desktop and phone). Skipped entirely when the browser cannot run it or asks for less. ----
  if (!motion) return;

  // Services first. On a wide screen the row is pinned and slides sideways as you scroll down. Pinning adds height below
  // it, so every other scroll trigger has to be created after this one, or it is measured from the wrong place.
  const track = $('.svc-track');
  const svc = $('#services');
  G.matchMedia().add('(min-width: 900px)', () => {
    const dist = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
    G.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: { trigger: svc, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1 },
    });
  });
  // On a phone the six cards rise one after another instead.
  G.matchMedia().add('(max-width: 899px)', () => {
    G.from('.svc-track > li', { opacity: 0, y: 50, filter: 'blur(8px)', duration: 1, stagger: 0.12, ease: 'power3.out', clearProps: 'transform,filter,opacity', scrollTrigger: { trigger: '.svc-track', start: 'top 86%', once: true } });
  });

  // Reveal on enter: from below, from a side, or out of a blur. Each one plays once.
  function reveal(nodes) {
    nodes.forEach((n, i) => {
      const kind = n.dataset.rv || 'up';
      const dx = innerWidth < 900 ? 18 : 72; // on a phone, keep the slide inside the side gutter
      const from = kind === 'left' ? { x: -dx } : kind === 'right' ? { x: dx } : kind === 'blur' ? { y: 36, filter: 'blur(12px)' } : { y: 56 };
      G.from(n, { opacity: 0, ...from, duration: 1.2, ease: 'power3.out', delay: (i % 4) * 0.07, clearProps: 'transform,filter,opacity', scrollTrigger: { trigger: n, start: 'top 90%', once: true } });
    });
  }
  reveal($$('[data-rv]').filter((n) => !n.closest('[hidden]')));

  // Scroll-linked text: each word starts dim and lights up as the reader scrolls past it.
  // The full sentence stays in a hidden copy for screen readers; the word spans are hidden from them.
  $$('[data-tr]').forEach((node) => {
    const text = node.textContent.trim();
    const spans = text.split(/\s+/).map((w) => { const s = el('span', 'w', w); s.setAttribute('aria-hidden', 'true'); return s; });
    node.replaceChildren(el('span', 'sr', text));
    spans.forEach((s, i) => { if (i) node.append(' '); node.append(s); });
    G.timeline({ scrollTrigger: { trigger: node, start: 'top 92%', end: 'bottom 52%', scrub: 0.5 } })
      .fromTo(spans, { opacity: 0.28 }, { opacity: 1, stagger: 1, ease: 'none' });
  });

  // Fonts and photos settle after the first paint; measure again once they have.
  if (document.fonts?.ready) document.fonts.ready.then(() => ST.refresh());
  addEventListener('load', () => ST.refresh());

  // The hero photo stage opens to full width as you scroll past it.
  G.fromTo('#stage', { clipPath: 'inset(0% 6% round 36px)' }, { clipPath: 'inset(0% 0% round 36px)', ease: 'none', scrollTrigger: { trigger: '#stage', start: 'top 96%', end: 'top 30%', scrub: 0.6 } });

  // Photos drift slowly inside their frames (parallax).
  $$('.par').forEach((img) => {
    G.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // The last-step photo opens up from a smaller frame.
  G.fromTo('#feature', { clipPath: 'inset(16% 7% 16% 7% round 32px)' }, { clipPath: 'inset(0% 0% 0% 0% round 32px)', ease: 'none', scrollTrigger: { trigger: '#feature', start: 'top 92%', end: 'top 28%', scrub: 0.6 } });

  // The route: the stop you are reading is lit, the rest dim, and the line fills down the side.
  const routeList = $('.route-list');
  routeList.classList.add('live');
  const stops = $$('.stop', routeList);
  // Exactly one step is lit: the one whose middle is nearest the middle of the screen.
  const pickStop = () => {
    const mid = innerHeight / 2;
    let best = null, gap = Infinity;
    for (const s of stops) {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < gap) { gap = d; best = s; }
    }
    stops.forEach((s) => s.classList.toggle('on', s === best));
  };
  ST.create({ trigger: routeList, start: 'top bottom', end: 'bottom top', onUpdate: pickStop, onRefresh: pickStop });
  G.fromTo('.rail i', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: routeList, start: 'top 72%', end: 'bottom 72%', scrub: 0.4 } });
  // The line ends at the last step's circle, not at the bottom of its text. Measured from the layout (not the
  // screen position), so the reveal animations do not move it.
  const rail = $('.rail', routeList);
  const fitRail = () => {
    const last = $$('.stop-n', routeList).at(-1);
    if (!rail || !last) return;
    let y = 0;
    for (let n = last; n && n !== routeList; n = n.offsetParent) y += n.offsetTop;
    rail.style.bottom = Math.max(0, routeList.offsetHeight - (y + last.offsetHeight / 2)) + 'px';
  };
  fitRail();
  addEventListener('resize', fitRail);
  document.fonts?.ready.then(fitRail);

  // The sunset panel drifts as you pass it.
  G.fromTo('.final-sky', { backgroundPosition: '50% 0%' }, { backgroundPosition: '50% 100%', ease: 'none', scrollTrigger: { trigger: '.final', start: 'top bottom', end: 'bottom top', scrub: true } });

  // ---- Anonymous counts: one landing view, and each tap into the app. No cookie, no id. The server keeps daily totals only,
  // and ignores bots and anything that is not one of these two events. A failed send is silently dropped.
  const count = (event) => {
    try {
      const src = new URLSearchParams(location.search).get('utm_source') || '';
      fetch('/app/api/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-saathi': '1' },
        body: JSON.stringify({ event, source: src.slice(0, 40) }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* counts are optional */ }
  };
  count('landing_view');
  $$('[data-app]').forEach((a) => a.addEventListener('click', () => count('app_open')));

  // Pointer effects, for a mouse only (never on touch). Each one resets cleanly when the pointer leaves.
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    // Service cards tilt a few degrees toward the pointer.
    $$('.tile').forEach((t) => {
      t.addEventListener('pointerenter', () => t.classList.add('tilt'));
      t.addEventListener('pointermove', (e) => {
        const r = t.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        t.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-8px)`;
      });
      t.addEventListener('pointerleave', () => { t.classList.remove('tilt'); t.style.transform = ''; });
    });
    // Marked buttons drift a little toward the pointer.
    $$('[data-mag]').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * 0.2).toFixed(1)}px, ${((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1)}px)`;
      });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
  }
})();
