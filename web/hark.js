// The app shell: a round + button, a Home | Chat | Guides pill, a profile avatar, a card feed and swipe between tabs.
(() => {
  const C = window.SaathiCore; const U = C && C.ui; if (!C || !U) return;
  const { $, el, T } = C; const { ico } = U;
  const app = $('app'), top = document.querySelector('.top'), chat = $('chat'), screenEl = $('screen');
  const TABS = ['home', 'chat', 'guides'];
  let cur = 'home'; let searching = false;

  // Old header pieces stay in the page (other code looks them up) but out of sight.
  const legacy = el('div', 'hk-legacy'); legacy.hidden = true;
  while (top.firstChild) legacy.append(top.firstChild);
  top.append(legacy);

  const plus = el('button', 'hk-round'); plus.type = 'button';
  for (const k of ['plus', 'search', 'x']) { const s = el('span', 'hk-i ' + k); s.append(ico(k === 'x' ? 'close' : k, 22)); plus.append(s); }
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
  function moveThumb() { const b = tbtn[cur]; if (!b || !b.offsetWidth) return; thumb.style.setProperty('--x', b.offsetLeft + 'px'); thumb.style.setProperty('--w', b.offsetWidth + 'px'); }
  function fitTabs() { let s = 15; const bs = Object.values(tbtn); bs.forEach((b) => { b.style.fontSize = s + 'px'; }); while (s > 10.5 && bs.some((b) => b.scrollWidth > b.clientWidth + .5)) { s -= .5; bs.forEach((b) => { b.style.fontSize = s + 'px'; }); } moveThumb(); }
  new ResizeObserver(fitTabs).observe(seg); document.fonts?.ready?.then(fitTabs);
  function labels() {
    tbtn.home.textContent = T('Home'); tbtn.chat.textContent = T('Chat'); tbtn.guides.textContent = T('Guides');
    av.setAttribute('aria-label', T('Profile'));
    plusMode(); fitTabs();
  }
  function plusMode() {
    plus.dataset.m = searching ? 'x' : cur === 'chat' ? 'search' : 'plus';
    plus.setAttribute('aria-label', searching ? T('Close') : cur === 'chat' ? T('Search') : T('New chat'));
  }
  plus.onclick = () => { if (searching) closeSearch(); else if (cur === 'chat') openSearch(); else C.newChat(); };

  let dir = 1;
  function showTab(k, { silent } = {}) {
    if (!TABS.includes(k)) return;
    if (searching) closeSearch();
    const from = cur; if (k === from && app.dataset.tab) return;
    dir = TABS.indexOf(k) >= TABS.indexOf(from) ? 1 : -1;
    cur = k; app.dataset.tab = k; document.body.dataset.tab = k;
    TABS.forEach((t, i) => { tbtn[t].classList.toggle('on', t === k); tbtn[t].setAttribute('aria-selected', String(t === k)); });
    moveThumb();
    plusMode();
    const pane = k === 'home' ? home : k === 'guides' ? guides : $('chat');
    if (k !== 'chat') pane.scrollTop = 0;
    // The first time Home or Guides opens, its cards rise in one by one; the pane does not also slide in (one motion, not two).
    const firstOpen = (k === 'home' && !built) || (k === 'guides' && !guides.dataset.done);
    if (!firstOpen) { pane.classList.remove('in-r', 'in-l'); void pane.offsetWidth; pane.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
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
    const hi = el('div', 'hk-hello'); hi.append(el('h1', '', greet()), el('p', '', T('What do you need help with today?')));
    const ask = el('button', 'hk-ask'); ask.type = 'button'; ask.append(ico('msg', 20), el('span', '', T('Ask Saathi anything')), ico('mic', 20));
    ask.onclick = () => { showTab('chat'); C.focusInput?.(); }; hi.append(ask);
    fyBox = card(); fyList = el('div', 'hk-list'); fyBox.append(el('h2', '', T('For you')), fyList);
    for (let i = 0; i < 2; i++) fyList.append(el('div', 'hk-skel'));
    const q = el('section', 'hk-strip'); q.append(el('h2', 'hk-h2', T('Quick start')));
    const rail = el('div', 'hk-rail'); rail.dataset.noswipe = '1';
    const pick = ['pan', 'aadhaar', 'dl', 'passport', 'voter'].map((id) => { const s = U.SERVICES.find((x) => x[0] === id); return [s[2], T(s[1]), () => U.openScreen('service', { id })]; });
    [...pick, ['scan', T('Scan'), () => U.openScreen('scan')], ['doc', T('Resize'), () => U.openScreen('photo')], ['warn', T('Check if it is a scam'), () => U.openScreen('check')]].forEach(([ic, label, go], i) => {
      const b = el('button', 'hk-rq'); b.type = 'button'; b.style.setProperty('--d', 260 + i * 55 + 'ms'); const c = el('span', 'hk-circ'); c.append(ico(ic, 24)); b.append(c, el('span', '', label)); b.onclick = go; rail.append(b);
    });
    q.append(rail);
    const s = card(); s.append(el('h2', '', T('Got a strange call or message?')), wide('light', T('Check if it is a scam'), () => U.openScreen('check')));
    home.append(hi, q, fyBox, s);
    if (lastItems) paintFy(lastItems);
    home.classList.add('fresh'); [...home.children].forEach((c, i) => c.style.setProperty('--d', i * 80 + 'ms')); setTimeout(() => home.classList.remove('fresh'), 1400);
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
  const floatSearch = () => { const b = el('button', 'hk-search-pill'); b.type = 'button'; b.append(ico('search', 20), el('span', '', T('Search'))); b.onclick = () => { U.closeAll(); openSearch(); }; return b; };
  SC.profile = () => {
    // Everything is drawn at once from what we already know, so nothing waits on the network. The balance is
    // refreshed in place afterwards. The rows rise in order from the top; the title and the bottom button come in with them.
    const col = U.frame(T('Profile'));
    const balText = el('div', 'hk-logo', C.wallet?.balance || $('walletText').textContent || '₹0');
    const bal = card('hk-prof'); bal.append(el('p', '', T('Wallet balance')), balText);
    bal.append(wide('dark', T('Top up'), () => U.openScreen('topup')));
    const g = (...r) => U.group(null, ...r);
    const lang = C.uiLang();
    col.append(bal,
      g(U.row({ icon: 'user', title: T('My details'), onclick: () => U.openScreen('details') }), U.row({ icon: 'bell', title: T('Reminders'), onclick: () => U.openScreen('reminders') }), U.row({ icon: 'lock', title: T('My locker'), onclick: () => U.openScreen('locker') }), U.row({ icon: 'apps', title: T('Applications'), onclick: () => U.openScreen('apps') })),
      g(U.row({ icon: 'wallet', title: T('Wallet'), value: C.wallet?.balance, onclick: () => U.openScreen('wallet') }), U.row({ icon: 'pack', title: T('Packs'), onclick: () => U.openScreen('packs') }), U.row({ icon: 'clock', title: T('Transaction history'), onclick: () => U.openScreen('activity') })),
      g(U.row({ icon: 'msg', title: T('Chats'), onclick: () => U.openScreen('chats') }), U.row({ icon: 'globe', title: T('Language'), value: lang === 'en' ? 'English' : lang, onclick: () => U.openScreen('language') }), U.row({ icon: 'sliders', title: T('Settings'), onclick: () => U.openScreen('settings') }), U.row({ icon: 'shield', title: T('Privacy notice'), onclick: () => U.openScreen('privacy') })),
      g(U.row({ icon: 'help', title: T('Help and support'), onclick: () => U.openScreen('help') }), U.row({ icon: 'backup', title: T('Backup and restore'), onclick: () => U.openScreen('backup') })),
      el('p', 'mut small center about', T('Saathi 1.0 · Independent, not a government website')),
      el('div', 'hk-spacer'));
    const fb = el('div', 'hk-fadebar'); screenEl.append(fb, floatSearch());
    U.refreshMe().then((m) => { if (m?.wallet) balText.textContent = m.wallet.balance; }).catch(() => {});
  };
  // ---- search: a panel inside the app; the round button in the corner turns into an X while it is open -------
  const sp = el('div', 'hk-sp'); const spBody = el('div', 'hk-sb'); const spBar = el('div', 'hk-sbar');
  const field = el('label', 'hk-sfield'); field.append(ico('search', 20));
  const inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; field.append(inp); spBar.append(field);
  sp.append(spBody, spBar); app.append(sp);
  const hint = el('p', 'hk-hint');
  function runSearch() {
    const q = inp.value.trim().toLowerCase(); spBody.replaceChildren();
    const row = (icon, t, go) => { const b = el('button', 'hk-svc'); b.type = 'button'; const c = el('span', 'hk-circ'); c.append(icon); const tx = el('span', 'hk-st'); tx.append(el('b', '', t)); b.append(c, tx, ico('chev', 18)); b.onclick = () => { closeSearch(); go(); }; return b; };
    if (!q) {
      const rec = C.chats.list.filter((c) => c.items.length).slice(0, 10);
      hint.textContent = T('Search your chats and guides');
      if (!rec.length) return spBody.append(hint);
      const box = card('hk-flush'); spBody.append(el('h2', 'hk-big', T('Recent')), box);
      rec.forEach((c, i) => { const r = row(ico('msg', 20), c.title || T('New chat'), () => C.openChat(c.id, { fromSwitch: true })); r.style.setProperty('--d', i * 40 + 'ms'); box.append(r); });
      return;
    }
    const out = [];
    for (const c of C.chats.list) { const t = (c.title || '') + ' ' + c.items.map((i) => i.text || i.reply?.body || '').join(' '); if (t.toLowerCase().includes(q)) out.push(row(ico('msg', 20), c.title || T('New chat'), () => C.openChat(c.id, { fromSwitch: true }))); }
    for (const [id, name, ic] of U.SERVICES) if (T(name).toLowerCase().includes(q) || name.toLowerCase().includes(q)) out.push(row(ico(ic, 20), T(name), () => U.openScreen('service', { id })));
    if (!out.length) { hint.textContent = T('Nothing found'); return spBody.append(hint); }
    const box = card('hk-flush'); box.append(...out.slice(0, 20)); spBody.append(box);
  }
  function openSearch() { if (searching) return; searching = true; inp.placeholder = T('Search'); inp.value = ''; runSearch(); spBody.scrollTop = 0; app.dataset.search = '1'; plusMode(); setTimeout(() => { if (searching) inp.focus({ preventScroll: true }); }, 220); }
  function closeSearch() { if (!searching) return; searching = false; delete app.dataset.search; inp.blur(); plusMode(); }
  inp.addEventListener('input', runSearch);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && searching) closeSearch(); });

  // ---- swipe between tabs (the page follows your finger a little, then slides) ----------------------------
  let sx = 0, sy = 0, st = 0, ok = false, mv = false;
  app.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); mv = false;
    ok = e.touches.length === 1 && !document.body.classList.contains('screen-open') && !e.target.closest('input,textarea,.pop,.dd-pop,.chips,pre,table,[data-noswipe]');
  }, { passive: true });
  app.addEventListener('touchend', (e) => {
    if (!ok) return; ok = false;
    const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st > 800 || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = TABS.indexOf(cur) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < TABS.length) showTab(TABS[i]);
  }, { passive: true });
  seg.addEventListener('keydown', (e) => { const i = TABS.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0); if (i >= 0 && i < TABS.length && i !== TABS.indexOf(cur)) { showTab(TABS[i]); tbtn[TABS[i]].focus(); } });

  document.addEventListener('saathi:relabel', () => { labels(); guides.dataset.done = ''; built = false; if (cur === 'guides') drawGuides(); if (cur === 'home') drawHome(); });
  new MutationObserver(() => { if (!document.body.classList.contains('screen-open')) { home.scrollTop = 0; guides.scrollTop = 0; } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  labels();
  showTab('home');
  app.dataset.hk = '1';
})();
