// The app shell: a round + button, a Home | Chat | Guides pill, a profile avatar, a card feed and swipe between tabs.
(() => {
  const C = window.SaathiCore; const U = C && C.ui; if (!C || !U) return;
  const { $, el, T } = C; const { ico } = U;
  const app = $('app'), top = document.querySelector('.top'), chat = $('chat'), screenEl = $('screen');
  const TABS = ['home', 'chat', 'guides'];
  let cur = 'home';

  // Old header pieces stay in the page (other code looks them up) but out of sight.
  const legacy = el('div', 'hk-legacy'); legacy.hidden = true;
  while (top.firstChild) legacy.append(top.firstChild);
  top.append(legacy);

  const plus = el('button', 'hk-round'); plus.type = 'button';
  const seg = el('div', 'hk-seg'); seg.setAttribute('role', 'tablist');
  const thumb = el('span', 'hk-thumb'); seg.append(thumb);
  const tbtn = {};
  for (const k of TABS) { const b = el('button', 'hk-tab'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.k = k; b.onclick = () => showTab(k); seg.append(b); tbtn[k] = b; }
  const av = el('button', 'hk-av'); av.type = 'button'; av.append(ico('user', 20));
  av.onclick = () => U.openScreen('profile');
  top.classList.add('hk-top'); top.append(plus, seg, av);

  const home = el('section', 'hk-pane hk-home'); home.id = 'hkHome';
  const guides = el('section', 'hk-pane hk-guides'); guides.id = 'hkGuides';
  chat.before(home, guides);
  const float = el('button', 'hk-float'); float.type = 'button'; float.append(ico('msg', 20), el('span', ''));
  float.onclick = () => { showTab('chat'); C.focusInput?.(); };
  app.append(float);

  function moveThumb() { const b = tbtn[cur]; if (!b || !b.offsetWidth) return; thumb.style.setProperty('--x', b.offsetLeft + 'px'); thumb.style.setProperty('--w', b.offsetWidth + 'px'); }
  new ResizeObserver(moveThumb).observe(seg); document.fonts?.ready?.then(moveThumb);
  function labels() {
    tbtn.home.textContent = T('Home'); tbtn.chat.textContent = T('Chat'); tbtn.guides.textContent = T('Guides');
    av.setAttribute('aria-label', T('Profile')); float.lastChild.textContent = T('Ask Saathi');
    plusMode(); moveThumb();
  }
  function plusMode() {
    plus.replaceChildren(ico(cur === 'chat' ? 'search' : 'plus', 22));
    plus.setAttribute('aria-label', cur === 'chat' ? T('Search') : T('New chat'));
  }
  // The pressed button flies to the middle of the screen, dissolves sideways, and then the search box rises.
  function flySearch(from) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !from.animate) return U.openScreen('search');
    const r = from.getBoundingClientRect(); const g = from.cloneNode(true);
    Object.assign(g.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: '0', zIndex: '99', pointerEvents: 'none', willChange: 'transform,opacity' });
    document.body.append(g); from.style.visibility = 'hidden';
    const cx = innerWidth / 2 - (r.left + r.width / 2), cy = innerHeight / 2 - (r.top + r.height / 2);
    const mid = `translate(${cx}px,${cy}px) scale(1.12)`;
    const a = g.animate([{ transform: 'none' }, { transform: mid }], { duration: 420, easing: 'cubic-bezier(.22,.9,.28,1)', fill: 'forwards' });
    a.finished.then(() => g.animate([{ transform: mid, opacity: 1, filter: 'blur(0px)' }, { transform: `translate(${cx + 70}px,${cy}px) scale(3.6,.55)`, opacity: 0, filter: 'blur(8px)' }], { duration: 360, easing: 'ease-in', fill: 'forwards' }).finished)
      .then(() => { g.remove(); from.style.visibility = ''; U.openScreen('search'); }).catch(() => { g.remove(); from.style.visibility = ''; U.openScreen('search'); });
  }
  C.flySearch = flySearch;
  plus.onclick = () => { if (cur === 'chat') flySearch(plus); else C.newChat(); };

  let dir = 1;
  function showTab(k, { silent } = {}) {
    if (!TABS.includes(k)) return;
    const from = cur; if (k === from && app.dataset.tab) return;
    dir = TABS.indexOf(k) >= TABS.indexOf(from) ? 1 : -1;
    cur = k; app.dataset.tab = k; document.body.dataset.tab = k;
    TABS.forEach((t, i) => { tbtn[t].classList.toggle('on', t === k); tbtn[t].setAttribute('aria-selected', String(t === k)); });
    moveThumb();
    plusMode();
    const pane = k === 'home' ? home : k === 'guides' ? guides : $('chat');
    pane.classList.remove('in-r', 'in-l'); void pane.offsetWidth; pane.classList.add(dir > 0 ? 'in-r' : 'in-l');
    const dk = document.querySelector('.dock'); if (dk && k === 'chat') { dk.classList.remove('in-r', 'in-l'); void dk.offsetWidth; dk.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
    if (k === 'home') drawHome();
    if (k === 'guides' && !guides.dataset.done) drawGuides();
    if (k === 'chat') requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
  }
  C.showTab = showTab;

  // ---- Home: what you can do right now ---------------------------------------------------------------
  const card = (cls) => el('div', 'hk-card ' + (cls || ''));
  const wide = (cls, text, go) => { const b = el('button', 'hk-wide ' + cls, text); b.type = 'button'; b.onclick = go; return b; };
  const greet = () => { const h = new Date().getHours(); return h < 12 ? T('Good morning') : h < 17 ? T('Good afternoon') : T('Good evening'); };
  let fyBox = null, fyList = null, built = false, lastItems = null;
  function paintFy(items) {
    if (!fyBox) return;
    fyBox.hidden = !items.length; fyList.replaceChildren();
    for (const it of items.slice(0, 4)) {
      const b = el('button', 'hk-row'); b.type = 'button';
      b.append(el('span', 'hk-v', it.v), el('span', 'hk-t', it.t), ico('chev', 18));
      b.onclick = () => U.openScreen(it.go, it.args); fyList.append(b);
    }
  }
  function buildHome() {
    built = true; home.replaceChildren();
    const hi = card('hk-hello'); hi.append(el('h1', '', greet()), el('p', '', T('What do you need help with today?')));
    const ask = el('button', 'hk-ask'); ask.type = 'button'; ask.append(ico('msg', 20), el('span', '', T('Ask Saathi anything')), ico('mic', 20));
    ask.onclick = () => { showTab('chat'); C.focusInput?.(); }; hi.append(ask);
    fyBox = card(); fyBox.hidden = true; fyList = el('div', 'hk-list'); fyBox.append(el('h2', '', T('For you')), fyList);
    const q = card(); q.append(el('h2', '', T('Quick start')));
    const grid = el('div', 'hk-qs');
    const pick = ['pan', 'aadhaar', 'dl', 'passport', 'voter'].map((id) => { const s = U.SERVICES.find((x) => x[0] === id); return [s[2], T(s[1]), () => U.openScreen('service', { id })]; });
    for (const [ic, label, go] of [...pick, ['scan', T('Scan'), () => U.openScreen('scan')], ['doc', T('Resize'), () => U.openScreen('photo')], ['warn', T('Check if it is a scam'), () => U.openScreen('check')]]) {
      const b = el('button', 'hk-q'); b.type = 'button'; const c = el('span', 'hk-circ'); c.append(ico(ic, 22)); b.append(c, el('span', '', label)); b.onclick = go; grid.append(b);
    }
    q.append(grid);
    home.append(hi, fyBox, q);
    if (lastItems) paintFy(lastItems);
    home.classList.add('fresh'); [...home.children].forEach((c, i) => c.style.setProperty('--d', i * 70 + 'ms')); setTimeout(() => home.classList.remove('fresh'), 1200);
  }
  async function drawHome() {
    if (!built) buildHome();
    const d = await C.fyData?.().catch(() => null);
    if (d) { lastItems = d.items; paintFy(d.items); }
  }

  // ---- Guides tab ---------------------------------------------------------------------------------
  async function drawGuides() {
    guides.replaceChildren(); guides.dataset.done = '1'; guides.classList.add('fresh'); setTimeout(() => guides.classList.remove('fresh'), 1200);
    guides.append(el('h1', 'hk-h1', T('Guides')));
    const d = await U.loadServices().catch(() => ({}));
    const box = card('hk-flush');
    for (const [id, name, ic] of U.SERVICES) {
      const s = (d.services || []).find((x) => x.id === id);
      const b = el('button', 'hk-svc'); b.type = 'button';
      const c = el('span', 'hk-circ'); c.append(ico(ic, 20));
      const tx = el('span', 'hk-st'); tx.append(el('b', '', s?.name || T(name)), el('small', '', s?.blurb || ''));
      b.append(c, tx, ico('chev', 18)); b.onclick = () => U.openScreen('service', { id }); box.append(b);
    }
    guides.append(box);
    const tl = card('hk-flush');
    for (const [ic, label, go] of [['scan', T('Scan'), 'scan'], ['photo', T('Resize'), 'photo'], ['warn', T('Check if it is a scam'), 'check'], ['bell', T('Reminders'), 'reminders'], ['lock', T('My locker'), 'locker']]) {
      const b = el('button', 'hk-svc'); b.type = 'button';
      const c = el('span', 'hk-circ'); c.append(ico(ic === 'photo' ? 'doc' : ic, 20));
      const tx = el('span', 'hk-st'); tx.append(el('b', '', label));
      b.append(c, tx, ico('chev', 18)); b.onclick = () => U.openScreen(go); tl.append(b);
    }
    guides.append(el('h2', 'hk-h2', T('Tools')), tl);
    [...guides.children].forEach((c, i) => c.style.setProperty('--d', i * 60 + 'ms'));
  }

  // ---- Profile and search pages ---------------------------------------------------------------------
  const SC = U.SCREENS;
  const floatSearch = () => { const b = el('button', 'hk-search-pill'); b.type = 'button'; b.append(ico('search', 20), el('span', '', T('Search'))); b.onclick = () => flySearch(b); return b; };
  SC.profile = async () => {
    const col = U.frame(T('Profile'));
    const m = await U.refreshMe().catch(() => ({}));
    const bal = card('hk-brand hk-prof'); bal.append(el('div', 'hk-logo', 'saathi'), el('p', '', T('Wallet balance') + ' · ' + ($('walletText').textContent || '₹0')));
    bal.append(wide('dark', T('Top up'), () => U.openScreen('topup')));
    const g = (...r) => U.group(null, ...r);
    const lang = C.uiLang();
    col.append(bal,
      g(U.row({ icon: 'user', title: T('My details'), onclick: () => U.openScreen('details') }), U.row({ icon: 'bell', title: T('Reminders'), onclick: () => U.openScreen('reminders') }), U.row({ icon: 'lock', title: T('My locker'), onclick: () => U.openScreen('locker') }), U.row({ icon: 'apps', title: T('Applications'), onclick: () => U.openScreen('apps') })),
      g(U.row({ icon: 'wallet', title: T('Wallet'), value: m.wallet?.balance, onclick: () => U.openScreen('wallet') }), U.row({ icon: 'pack', title: T('Packs'), onclick: () => U.openScreen('packs') }), U.row({ icon: 'clock', title: T('Transaction history'), onclick: () => U.openScreen('activity') })),
      g(U.row({ icon: 'msg', title: T('Chats'), onclick: () => U.openScreen('chats') }), U.row({ icon: 'globe', title: T('Language'), value: lang === 'en' ? 'English' : lang, onclick: () => U.openScreen('language') }), U.row({ icon: 'sliders', title: T('Settings'), onclick: () => U.openScreen('settings') }), U.row({ icon: 'shield', title: T('Privacy notice'), onclick: () => U.openScreen('privacy') })),
      g(U.row({ icon: 'help', title: T('Help and support'), onclick: () => U.openScreen('help') }), U.row({ icon: 'backup', title: T('Backup and restore'), onclick: () => U.openScreen('backup') })),
      el('p', 'mut small center about', T('Saathi 1.0 · Independent, not a government website')),
      el('div', 'hk-spacer'));
    screenEl.append(floatSearch());
  };
  SC.search = () => {
    screenEl.replaceChildren();
    const wrap = el('div', 'hk-sw');
    const body = el('div', 'hk-sb'); const hint = el('p', 'hk-hint', T('Search your chats and guides')); body.append(hint);
    const bar = el('div', 'hk-sbar');
    const field = el('label', 'hk-sfield'); field.append(ico('search', 20));
    const inp = el('input'); inp.type = 'search'; inp.placeholder = T('Search'); inp.setAttribute('aria-label', T('Search')); inp.autocomplete = 'off'; field.append(inp);
    const x = el('button', 'hk-round'); x.type = 'button'; x.setAttribute('aria-label', T('Close')); x.append(ico('close', 22)); x.onclick = U.goBack;
    bar.append(field, x); wrap.append(body, bar); screenEl.append(wrap);
    const run = () => {
      const q = inp.value.trim().toLowerCase(); body.replaceChildren();
      if (!q) return body.append(hint);
      const out = [];
      for (const c of C.chats.list) { const t = (c.title || '') + ' ' + c.items.map((i) => i.text || i.reply?.body || '').join(' '); if (t.toLowerCase().includes(q)) out.push([ico('msg', 20), c.title || T('New chat'), () => { U.closeAll(); C.openChat(c.id, { fromSwitch: true }); }]); }
      for (const [id, name, ic] of U.SERVICES) if (T(name).toLowerCase().includes(q) || name.toLowerCase().includes(q)) out.push([ico(ic, 20), T(name), () => U.openScreen('service', { id })]);
      if (!out.length) return body.append(el('p', 'hk-hint', T('Nothing found')));
      const box = card('hk-flush');
      for (const [i, t, go] of out.slice(0, 20)) { const b = el('button', 'hk-svc'); b.type = 'button'; const c = el('span', 'hk-circ'); c.append(i); const tx = el('span', 'hk-st'); tx.append(el('b', '', t)); b.append(c, tx, ico('chev', 18)); b.onclick = go; box.append(b); }
      body.append(box);
    };
    inp.addEventListener('input', run);
    setTimeout(() => inp.focus(), 80);
  };

  // ---- swipe between tabs (the page follows your finger a little, then slides) ----------------------------
  let sx = 0, sy = 0, st = 0, ok = false, mv = false;
  const live = () => (cur === 'chat' ? [chat, document.querySelector('.dock')] : [cur === 'home' ? home : guides]).filter(Boolean);
  const nudge = (px, ease) => live().forEach((n) => { n.style.transition = ease ? 'transform .3s cubic-bezier(.22,.9,.28,1)' : 'none'; n.style.transform = px ? `translateX(${px}px)` : ''; });
  app.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); mv = false;
    ok = e.touches.length === 1 && !document.body.classList.contains('screen-open') && !e.target.closest('input,textarea,.pop,.dd-pop,.chips,pre,table,[data-noswipe]');
  }, { passive: true });
  app.addEventListener('touchmove', (e) => {
    if (!ok) return; const t = e.touches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
    if (!mv && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) mv = true;
    if (mv) { const i = TABS.indexOf(cur); const edge = (dx > 0 && i === 0) || (dx < 0 && i === TABS.length - 1); nudge(dx * (edge ? .12 : .38), false); }
  }, { passive: true });
  app.addEventListener('touchend', (e) => {
    if (!ok) return; ok = false;
    const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
    if (mv) nudge(0, true);
    if (Date.now() - st > 800 || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = TABS.indexOf(cur) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < TABS.length) showTab(TABS[i]);
  }, { passive: true });
  seg.addEventListener('keydown', (e) => { const i = TABS.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0); if (i >= 0 && i < TABS.length && i !== TABS.indexOf(cur)) { showTab(TABS[i]); tbtn[TABS[i]].focus(); } });

  document.addEventListener('saathi:relabel', () => { labels(); guides.dataset.done = ''; built = false; if (cur === 'guides') drawGuides(); if (cur === 'home') drawHome(); });
  labels();
  showTab('home');
  app.dataset.hk = '1';
})();
