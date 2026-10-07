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

  function labels() {
    tbtn.home.textContent = T('Home'); tbtn.chat.textContent = T('Chat'); tbtn.guides.textContent = T('Guides');
    av.setAttribute('aria-label', T('Profile')); float.lastChild.textContent = T('Ask Saathi');
    plusMode();
  }
  function plusMode() {
    plus.replaceChildren(ico(cur === 'chat' ? 'search' : 'plus', 22));
    plus.setAttribute('aria-label', cur === 'chat' ? T('Search') : T('New chat'));
  }
  plus.onclick = () => { if (cur === 'chat') U.openScreen('search'); else { C.newChat(); } };

  let dir = 1;
  function showTab(k, { silent } = {}) {
    if (!TABS.includes(k)) return;
    const from = cur; if (k === from && app.dataset.tab) return;
    dir = TABS.indexOf(k) >= TABS.indexOf(from) ? 1 : -1;
    cur = k; app.dataset.tab = k; document.body.dataset.tab = k;
    TABS.forEach((t, i) => { tbtn[t].classList.toggle('on', t === k); tbtn[t].setAttribute('aria-selected', String(t === k)); });
    seg.style.setProperty('--i', String(TABS.indexOf(k)));
    plusMode();
    const pane = k === 'home' ? home : k === 'guides' ? guides : $('chat');
    pane.classList.remove('in-r', 'in-l'); void pane.offsetWidth; pane.classList.add(dir > 0 ? 'in-r' : 'in-l');
    const dk = document.querySelector('.dock'); if (dk && k === 'chat') { dk.classList.remove('in-r', 'in-l'); void dk.offsetWidth; dk.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
    if (k === 'home' && !silent) drawHome();
    if (k === 'guides' && !guides.dataset.done) drawGuides();
    if (k === 'chat') requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
  }
  C.showTab = showTab;

  // ---- Home: a feed of big soft cards ----------------------------------------------------------
  const card = (cls) => el('div', 'hk-card ' + (cls || ''));
  const wide = (cls, text, go) => { const b = el('button', 'hk-wide ' + cls, text); b.type = 'button'; b.onclick = go; return b; };
  const tile = (label, value, go) => { const b = el('button', 'hk-tile'); b.type = 'button'; b.append(el('small', '', label), el('b', '', value)); b.onclick = go; return b; };
  async function drawHome() {
    const d = await C.fyData?.().catch(() => null);
    const sum = d?.sum || {};
    home.replaceChildren();
    const brand = card('hk-brand');
    brand.append(el('div', 'hk-logo', 'saathi'), el('p', '', T('Ask anything about government paperwork, in your language.')));
    const two = el('div', 'hk-two'); two.append(wide('dark', T('Ask Saathi'), () => { showTab('chat'); C.focusInput?.(); }), wide('', T('Start a guide'), () => showTab('guides')));
    brand.append(two);
    const today = card(); today.append(el('h2', '', T('Today')));
    const grid = el('div', 'hk-tiles');
    grid.append(
      tile(T('Reminders'), String((sum.reminders || []).length), () => U.openScreen('reminders')),
      tile(T('My locker'), String(sum.locker || 0), () => U.openScreen('locker')),
      tile(T('Applications'), String(sum.apps || 0), () => U.openScreen('apps')),
      tile(T('Wallet'), $('walletText').textContent || '₹0', () => U.openScreen('wallet')),
    );
    today.append(grid);
    home.append(brand, today);
    const items = (d?.items || []).slice(0, 4);
    if (items.length) {
      const fy = card(); fy.append(el('h2', '', T('For you')));
      const list = el('div', 'hk-list');
      for (const it of items) {
        const b = el('button', 'hk-row'); b.type = 'button';
        b.append(el('span', 'hk-v', it.v), el('span', 'hk-t', it.t)); b.append(ico('chev', 18));
        b.onclick = () => U.openScreen(it.go, it.args); list.append(b);
      }
      fy.append(list); home.append(fy);
    }
    const g = card(); g.append(el('h2', '', T('Guides')));
    const stack = el('div', 'hk-stack');
    for (const [, , ic] of U.SERVICES.slice(0, 5)) { const c = el('span', 'hk-circ'); c.append(ico(ic, 20)); stack.append(c); }
    g.append(stack, el('p', '', T('Step by step help for PAN, Aadhaar, passport and more.')), wide('light', T('See all guides'), () => showTab('guides')));
    const s = card(); s.append(el('h2', '', T('Got a strange call or message?')), wide('light', T('Check if it is a scam'), () => U.openScreen('check')));
    home.append(g, s);
    [...home.children].forEach((c, i) => c.style.setProperty('--d', i * 60 + 'ms'));
  }

  // ---- Guides tab ---------------------------------------------------------------------------------
  async function drawGuides() {
    guides.replaceChildren(); guides.dataset.done = '1';
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
  const floatSearch = () => { const b = el('button', 'hk-search-pill'); b.type = 'button'; b.append(ico('search', 20), el('span', '', T('Search'))); b.onclick = () => U.openScreen('search'); return b; };
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

  // ---- swipe between tabs ---------------------------------------------------------------------------
  let sx = 0, sy = 0, st = 0, ok = false;
  app.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
    ok = e.touches.length === 1 && !document.body.classList.contains('screen-open') && !e.target.closest('input,textarea,.pop,.dd-pop,.chips,pre,table,[data-noswipe]');
  }, { passive: true });
  app.addEventListener('touchend', (e) => {
    if (!ok) return; ok = false;
    const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st > 700 || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = TABS.indexOf(cur) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < TABS.length) showTab(TABS[i]);
  }, { passive: true });
  seg.addEventListener('keydown', (e) => { const i = TABS.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0); if (i >= 0 && i < TABS.length && i !== TABS.indexOf(cur)) { showTab(TABS[i]); tbtn[TABS[i]].focus(); } });

  document.addEventListener('saathi:relabel', () => { labels(); guides.dataset.done = ''; if (cur === 'guides') drawGuides(); if (cur === 'home') drawHome(); });
  labels();
  showTab('home');
  app.dataset.hk = '1';
})();
