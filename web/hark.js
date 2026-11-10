// The app shell: a round button (search in Chat, new chat in Guides), a Chat | Guides pill, a profile avatar, and swipe between tabs.
(() => {
  const C = window.SaathiCore; const U = C && C.ui; if (!C || !U) return;
  const { $, el, T } = C; const { ico } = U;
  const app = $('app'), top = document.querySelector('.top'), chat = $('chat');
  const TABS = ['chat', 'guides'];
  let cur = 'chat'; let searching = false;

  // Old header pieces stay in the page (other code looks them up) but out of sight.
  const legacy = el('div', 'hk-legacy'); legacy.hidden = true;
  while (top.firstChild) legacy.append(top.firstChild);
  top.append(legacy);

  const plus = el('button', 'hk-round'); plus.type = 'button';
  for (const k of ['search', 'x']) { const s = el('span', 'hk-i ' + k); s.append(ico(k === 'x' ? 'close' : k, 22)); plus.append(s); }
  const seg = el('div', 'hk-seg'); seg.setAttribute('role', 'tablist');
  const tbtn = {};
  for (const k of TABS) { const b = el('button', 'hk-tab'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.k = k; b.onclick = () => showTab(k); seg.append(b); tbtn[k] = b; }
  const av = el('button', 'hk-av'); av.type = 'button'; av.append(ico('user', 20));
  av.onclick = () => U.openScreen('profile');
  top.classList.add('hk-top'); top.append(plus, seg, av);

  const guides = el('section', 'hk-pane hk-guides'); guides.id = 'hkGuides';
  chat.before(guides);
  function fitTabs() { let s = 15; const bs = Object.values(tbtn); bs.forEach((b) => { b.style.fontSize = s + 'px'; }); while (s > 10.5 && bs.some((b) => b.scrollWidth > b.clientWidth + .5)) { s -= .5; bs.forEach((b) => { b.style.fontSize = s + 'px'; }); } }
  new ResizeObserver(fitTabs).observe(seg); document.fonts?.ready?.then(fitTabs);
  function labels() {
    tbtn.chat.textContent = T('Chat'); tbtn.guides.textContent = T('Guides');
    av.setAttribute('aria-label', T('Profile'));
    plusMode(); fitTabs();
  }
  // The round button at the top left is search on both tabs (search covers chats and guides), and an X while search is open.
  function plusMode() {
    plus.dataset.m = searching ? 'x' : 'search';
    plus.setAttribute('aria-label', searching ? T('Close') : T('Search'));
  }
  plus.onclick = () => { if (searching) closeSearch(); else openSearch(); };

  let dir = 1;
  function showTab(k) {
    if (!TABS.includes(k)) return;
    if (searching) closeSearch();
    const from = cur; if (k === from && app.dataset.tab) return;
    dir = TABS.indexOf(k) >= TABS.indexOf(from) ? 1 : -1;
    cur = k; app.dataset.tab = k; document.body.dataset.tab = k;
    TABS.forEach((t) => { tbtn[t].classList.toggle('on', t === k); tbtn[t].setAttribute('aria-selected', String(t === k)); });
    plusMode();
    const pane = k === 'guides' ? guides : $('chat');
    if (k !== 'chat') pane.scrollTop = 0;
    // The first time Guides opens, its cards rise in one by one; the pane does not also slide in (one motion, not two).
    const firstOpen = k === 'guides' && !guides.dataset.done;
    if (!firstOpen) { pane.classList.remove('in-r', 'in-l'); void pane.offsetWidth; pane.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
    const dk = document.querySelector('.dock'); if (dk && k === 'chat') { dk.classList.remove('in-r', 'in-l'); void dk.offsetWidth; dk.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
    if (k === 'guides' && !guides.dataset.done) drawGuides();
    if (k === 'chat') requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
  }
  C.showTab = showTab;

  // ---- Guides tab ---------------------------------------------------------------------------------
  const card = (cls) => el('div', 'hk-card ' + (cls || ''));
  async function drawGuides() {
    guides.replaceChildren(); guides.dataset.done = '1';
    guides.append(el('h1', 'hk-h1', T('Guides')));
    // Drawn at once from what the app already knows, so the cards always rise, even when the network is slow.
    // The names and blurbs from the server are filled in afterwards, in place.
    const box = card('hk-flush'); const filled = [];
    for (const [id, name, ic] of U.SERVICES) {
      const b = el('button', 'hk-svc'); b.type = 'button';
      const c = el('span', 'hk-circ'); c.append(ico(ic, 20));
      const tb = el('b', '', T(name)), sm = el('small', '', '');
      const tx = el('span', 'hk-st'); tx.append(tb, sm); filled.push({ id, tb, sm });
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
    guides.classList.add('fresh'); setTimeout(() => guides.classList.remove('fresh'), 1200);
    const d = await U.loadServices().catch(() => ({}));
    for (const f of filled) {
      const s = (d.services || []).find((x) => x.id === f.id);
      if (s?.name) f.tb.textContent = s.name;
      f.sm.textContent = s?.blurb || '';
    }
  }

  // ---- Profile and search pages ---------------------------------------------------------------------
  const SC = U.SCREENS;
  SC.profile = () => {
    // Everything is drawn at once from what we already know, so nothing waits on the network. The balance is
    // refreshed in place afterwards. The rows rise in order from the top; the title and the bottom button come in with them.
    const col = U.frame(T('Profile'));
    const balText = el('div', 'hk-logo', C.wallet?.balance || $('walletText').textContent || '₹0');
    const bal = card('hk-prof'); bal.append(el('p', '', T('Wallet balance')), balText);
    bal.append(wide('dark', T('Top up'), () => U.openScreen('topup')));
    const g = (...r) => U.group(null, ...r);
    // Profile holds the person's own things and money. Preferences, backup, privacy and help live in Settings.
    col.append(bal,
      g(U.row({ icon: 'user', title: T('My details'), onclick: () => U.openScreen('details') }), U.row({ icon: 'bell', title: T('Reminders'), onclick: () => U.openScreen('reminders') }), U.row({ icon: 'lock', title: T('My locker'), onclick: () => U.openScreen('locker') }), U.row({ icon: 'apps', title: T('Applications'), onclick: () => U.openScreen('apps') }), U.row({ icon: 'msg', title: T('Chats'), onclick: () => U.openScreen('chats') })),
      g(U.row({ icon: 'wallet', title: T('Wallet'), onclick: () => U.openScreen('wallet') }), U.row({ icon: 'pack', title: T('Packs'), onclick: () => U.openScreen('packs') }), U.row({ icon: 'clock', title: T('Transaction history'), onclick: () => U.openScreen('activity') })),
      g(U.row({ icon: 'sliders', title: T('Settings'), onclick: () => U.openScreen('settings') })),
      el('div', 'hk-spacer'));
    const fb = el('div', 'hk-fadebar'); screenEl.append(fb);
    U.refreshMe().then((m) => { if (m?.wallet) balText.textContent = m.wallet.balance; }).catch(() => {});
  };
  // ---- search: a panel inside the app; the round button in the corner turns into an X while it is open -------
  const screenEl = $('screen');
  function wide(cls, text, go) { const b = el('button', 'hk-wide ' + cls, text); b.type = 'button'; b.onclick = go; return b; }
  const sp = el('div', 'hk-sp'); const spBody = el('div', 'hk-sb'); const spBar = el('div', 'hk-sbar');
  const field = el('label', 'hk-sfield'); field.append(ico('search', 20));
  const inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; field.append(inp);
  // Our own clear cross: it fades and grows in while there is text. The browser's native one is hidden in CSS.
  const clr = el('button', 'hk-sclear'); clr.type = 'button'; clr.setAttribute('aria-label', T('Close')); clr.append(ico('close', 16));
  field.append(clr); spBar.append(field);
  const syncClear = () => field.classList.toggle('has', inp.value.length > 0);
  clr.onclick = () => { inp.value = ''; syncClear(); runSearch(); inp.focus({ preventScroll: true }); };
  sp.append(spBody); top.append(spBar); app.append(sp);
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
  function openSearch() { if (searching) return; searching = true; inp.placeholder = T('Search'); inp.value = ''; syncClear(); runSearch(); spBody.scrollTop = 0; app.dataset.search = '1'; plusMode(); setTimeout(() => { if (searching) inp.focus({ preventScroll: true }); }, 220); }
  function closeSearch() { if (!searching) return; searching = false; delete app.dataset.search; inp.blur(); plusMode(); }
  inp.addEventListener('input', () => { runSearch(); syncClear(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && searching) closeSearch(); });

  // ---- swipe between tabs (the page follows your finger a little, then slides) ----------------------------
  let sx = 0, sy = 0, st = 0, ok = false;
  app.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
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

  document.addEventListener('saathi:relabel', () => { labels(); guides.dataset.done = ''; if (cur === 'guides') drawGuides(); });
  new MutationObserver(() => { if (!document.body.classList.contains('screen-open')) guides.scrollTop = 0; }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  labels();
  showTab('chat');
  app.dataset.hk = '1';
})();

// Desktop: a mouse wheel moves a row of cards sideways (Quick start, the guide and hub rails), and the page keeps scrolling
// up and down when the row reaches its end. A trackpad's own sideways swipe still works as before.
(() => {
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const row = e.target instanceof Element ? e.target.closest('.hk-rail, .hub-cont') : null;
    if (!row || row.scrollWidth <= row.clientWidth + 2) return;
    const before = row.scrollLeft;
    row.scrollLeft += e.deltaY;
    if (row.scrollLeft !== before) e.preventDefault();
  }, { passive: false });
})();

// ---- a soft halo where you press. It is the feedback on every tap, instead of a black line. ---------------
(() => {
  const SEL = 'button, [role="button"], a[href], label.hk-sfield, .row, .hk-svc, .hk-q, .chip, .gtile, .tool-card, .svc-card, .hub-cc, .hk-row, .hk-wide, .dd-o, .lang, .fd-o';
  const NO_HALO = '.ap-card, .ap-tl, .rm-item, .rm-new, .tool-card, .svc-card, .gtile, .hub-cc, .hk-svc, .hk-wide, .hk-tile, .hk-row';
  const calm = { matches: false };
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || calm.matches || !(e.target instanceof Element)) return;
    const t = e.target.closest(SEL);
    if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
    // Cards keep no ring of their own: the press shows on the card itself, not as a circle inside it.
    if (t.closest(NO_HALO)) return;
    const r = t.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
    const wrap = document.createElement('span'); wrap.className = 'hk-halo'; wrap.setAttribute('aria-hidden', 'true');
    const dot = document.createElement('i');
    dot.style.left = (e.clientX - r.left) + 'px'; dot.style.top = (e.clientY - r.top) + 'px';
    dot.style.setProperty('--s', String(Math.ceil((Math.hypot(r.width, r.height) * 2) / 10)));
    wrap.append(dot); t.append(wrap);
    const done = () => wrap.remove(); dot.addEventListener('animationend', done); setTimeout(done, 900);
  }, { passive: true });
})();
