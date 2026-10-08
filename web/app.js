// Saathi web app. Plain JavaScript, no libraries, nothing loaded from other sites.
// Every piece of text from the server is put on the page with textContent, never as HTML.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const svg = (d, size = 18, extra = '') => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2.2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    if (extra) p.setAttribute('style', extra);
    s.append(p);
    return s;
  };
  const ICON = { check: 'M5 12.5l4.5 4.5L19 7.5', chev: 'M9 6l6 6-6 6', warn: 'M12 4l9 16H3zM12 10v4M12 17.5v.01', lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3', file: 'M7 3h7l4 4v14H7zM14 3v5h4' };

  // ---- storage that may be blocked -------------------------------------------------------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const randomHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
  let sid = store.get('saathi.sid');
  if (!/^[a-f0-9]{32,64}$/.test(sid || '')) { sid = randomHex(24); store.set('saathi.sid', sid); }

  // ---- settings that live on this device: theme, text size ---------------------------------
  const root = document.documentElement;
  const applyTheme = (t) => { if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme; if (typeof skyPhase === 'function') skyPhase(); };
  const applyScale = (n) => root.style.setProperty('--scale', String(n));
  const applyStyle = () => { root.dataset.style = 'sky'; skyPhase(); };
  // Sky style: the backdrop follows the viewer's own clock (dawn, day, sunset, night), like the Hark app.
  function skyPhase() {
    if (root.dataset.style !== 'sky') return;
    const h = new Date().getHours();
    const dark = root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const lightPick = root.dataset.theme === 'light';
    root.dataset.sky = dark || (!lightPick && (h >= 20 || h < 5)) ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : 'sunset';
  }
  setInterval(skyPhase, 600000);
  applyTheme(store.get('saathi.theme'));
  applyStyle(store.get('saathi.style'));
  applyScale(Number(store.get('saathi.scale')) || 1);
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast'); t.replaceChildren(svg('M5 12.5l4.5 4.5L19 7.5', 16), el('span', '', msg)); t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }

  // ---- talking to the server --------------------------------------------------------------
  async function api(path, opts = {}) {
    const headers = { 'x-session': sid, 'x-saathi': '1', ...(opts.headers || {}) };
    const res = await fetch(path, { ...opts, headers });
    let j = null;
    try { j = await res.json(); } catch { /* not json */ }
    return { ok: res.ok, status: res.status, j: j || {} };
  }

  // ---- the app's own words in the person's language ---------------------------------------------
  // T('English text') looks the text up in the language dictionary from the server, and falls back to English.
  // N('English text') only marks a text for extraction and returns it unchanged (translate it later with T).
  let UI = {};
  const uiLang = () => { const c = store.get('saathi.lang'); return /^[a-z]{2,4}$/.test(c || '') ? c : 'en'; };
  const T = (s, vars) => {
    let out = UI[s] || s;
    if (vars) out = out.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
    return out;
  };
  const N = (s) => s;
  async function loadUI(code, opts = {}) {
    code = code || uiLang();
    if (code === 'en') { UI = {}; document.documentElement.lang = 'en'; return 1; }
    const ck = 'saathi.ui.' + code;
    let got = null;
    try { const c = JSON.parse(store.get(ck) || 'null'); if (c && c.n > 20) got = c.s; } catch { /* fetch below */ }
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), opts.wait || 8000);
      const r = await fetch('/app/api/ui?lang=' + encodeURIComponent(code), { signal: ctl.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j && j.strings && Object.keys(j.strings).length > 20) { got = j.strings; store.set(ck, JSON.stringify({ n: Object.keys(got).length, s: got })); }
    } catch { /* keep the cached text */ }
    if (!got) return 0;
    UI = got; document.documentElement.lang = code;
    return Object.keys(UI).length;
  }
  /** Translate the fixed words in index.html. */
  function applyStatic() {
    document.querySelectorAll('[data-t]').forEach((e) => { e.dataset.en = e.dataset.en || e.dataset.t; e.textContent = T(e.dataset.en); });
    document.querySelectorAll('[data-tp]').forEach((e) => { e.dataset.enp = e.dataset.enp || e.dataset.tp; e.placeholder = T(e.dataset.enp); });
    document.querySelectorAll('[data-ta]').forEach((e) => { e.dataset.ena = e.dataset.ena || e.dataset.ta; e.setAttribute('aria-label', T(e.dataset.ena)); });
  }

  // ---- rendering --------------------------------------------------------------------------
  let freshNext = true;
  const ACT_SCREEN = { act_scan: 'scan', act_check: 'check', act_details: 'details', act_locker: 'locker', act_reminders: 'reminders', act_apps: 'apps', act_photo: 'photo' };
  const thread = $('thread');
  const chat = $('chat');
  const HIST_KEY = 'saathi.chats.v1';
  // Chats are saved on this device (localStorage) so they are still here tomorrow. Copy-ready sheets and unlocked locker
  // cards hold personal details and are never saved. "Delete all my data" and Settings can clear the lot.
  const tab = { get: (k) => store.get(k), set: (k, v) => store.set(k, v), del: (k) => store.del(k) };
  let chats = { cur: null, list: [] };
  try { const j = JSON.parse(store.get(HIST_KEY) || 'null'); if (j && Array.isArray(j.list)) chats = j; } catch { /* start fresh */ }
  const saveChats = () => {
    chats.list = chats.list.slice(0, 40);
    store.set(HIST_KEY, JSON.stringify(chats));
    core.onChats?.();
    core.afterSave?.();
  };
  /** Merge chats from another device: newest copy of each chat wins, deleted chats stay deleted. */
  function mergeChats(list, dead) {
    chats.dead = { ...(chats.dead || {}), ...(dead || {}) };
    const by = new Map(chats.list.map((c) => [c.id, c]));
    for (const c of list) { if (!c?.id || chats.dead[c.id]) continue; const m = by.get(c.id); if (!m || (c.ts || 0) > (m.ts || 0)) by.set(c.id, c); }
    for (const id of Object.keys(chats.dead)) by.delete(id);
    chats.list = [...by.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 40);
    store.set(HIST_KEY, JSON.stringify(chats));
    core.onChats?.();
  }
  // "Everything for PAN" card. Plain facts are shown; private values stay locked until Show, then hide again on their own.
  function renderPack(r) {
    const card = el('div', 'sheet pack');
    const head = el('div', 'sheet-h');
    const badge = el('span', 'sh-ic'); badge.append(iconEl(DOC, 19));
    const tt = el('div', 'sh-t'); tt.append(el('b', '', String(r.title || '')), el('small', '', T('Everything you need in one place')));
    head.append(badge, tt);
    card.append(head);
    const sec = (title) => { const h = el('div', 'pk-h', title); card.append(h); };
    const block = (txt) => {
      if (!txt) return;
      const d = el('div', 'pk-txt'); let ul = null;
      const lines = String(txt).split('\n').map((x) => x.trim()).filter(Boolean);
      const bullets = lines.some((x) => /^[•\-·]\s/.test(x));
      const flat = bullets ? lines : lines.flatMap((x) => x.split(/(?<=[.!?])\s+(?=[A-Z₹])/));
      for (const ln of flat) {
        const isB = /^[•\-·]\s/.test(ln) || !bullets;
        if (isB) {
          if (!ul) { ul = el('ul', 'pk-ul'); d.append(ul); }
          const t = ln.replace(/^[•\-·]\s+/, '');
          const li = el('li'); const m = bullets ? /^([^:]{2,30}):\s+(.+)$/.exec(t) : null;
          if (m) { li.append(el('b', 'pk-k', m[1])); li.append(richText(m[2], r.links)); } else li.append(richText(t, r.links));
          ul.append(li);
        } else { ul = null; const pr = el('p', 'pk-p'); pr.append(richText(ln, r.links)); d.append(pr); }
      }
      card.append(d);
    };
    sec(T('Documents')); block(r.docs);
    sec(T('Fee')); block(r.fee);
    const lockRow = (label, set, fetcher, i) => {
      const line = el('div', 'sheet-row pk-row'); line.style.setProperty('--i', i);
      const k = el('div', 'k'); const v = el('div', 'v pk-v');
      const dots = el('span', 'pk-dots', set ? '••••••••' : T('Not saved yet'));
      if (!set) dots.classList.add('none');
      v.append(dots); k.append(el('div', 'l', label), v);
      line.append(k);
      if (set) {
        const show = el('button', 'copy pk-show', T('Show')); show.type = 'button'; show.setAttribute('aria-label', T('Show') + ' ' + label);
        const cp = el('button', 'copy', T('Copy')); cp.type = 'button'; cp.setAttribute('aria-label', T('Copy') + ' ' + label);
        let shown = null; let timer = null;
        const hide = () => { clearTimeout(timer); shown = null; dots.textContent = '••••••••'; dots.classList.remove('on'); show.textContent = T('Show'); };
        show.onclick = async () => {
          if (shown != null) return hide();
          show.disabled = true;
          try {
            const x = await fetcher();
            shown = x.view; dots.textContent = x.view; dots.classList.add('on'); show.textContent = T('Hide');
            timer = setTimeout(hide, 20000);
          } catch { dots.textContent = T('Could not open. Try again.'); setTimeout(hide, 2500); }
          show.disabled = false;
        };
        cp.onclick = async () => { try { const x = await fetcher(); copyText(x.copy, cp); } catch { /* ignore */ } };
        document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
        line.append(show, cp);
      }
      card.append(line);
    };
    const tcall = (op, args) => api('/app/api/t', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, args }) }).then((x) => (x.ok ? x.j.data : Promise.reject(new Error('fail'))));
    const plainFields = (r.fields || []).filter((f) => !f.sens);
    const privFields = (r.fields || []).filter((f) => f.sens);
    sec(T('Your details'));
    plainFields.forEach((f, i) => {
      if (!f.set) { lockRow(f.label, false, null, i); return; }
      const line = el('div', 'sheet-row'); line.style.setProperty('--i', i);
      const k = el('div', 'k'); k.append(el('div', 'l', f.label), el('div', 'v', String(f.value)));
      const c = el('button', 'copy', T('Copy')); c.type = 'button'; c.onclick = () => copyText(String(f.value), c);
      line.append(k, c); card.append(line);
    });
    const encH = el('div', 'pk-h enc'); const lk = el('span', 'lk'); lk.innerHTML = LOCK_SVG; encH.append(lk, el('span', '', T('Encrypted. Tap Show to see.')));
    card.append(encH);
    const fieldVal = async (key) => { const d = await tcall('details.get', {}); const f = d.fields.find((x) => x.key === key); if (!f?.value) throw new Error('none'); return { view: f.value, copy: f.value }; };
    privFields.forEach((f, i) => lockRow(f.label, f.set, () => fieldVal(f.key), i));
    (r.ids || []).forEach((x, i) => lockRow(x.label, x.set, async () => { const d = await tcall('locker.reveal', { type: x.type }); return { view: d.number, copy: d.copy }; }, i + privFields.length));
    {
      const all = [...plainFields, ...privFields, ...(r.ids || [])]; const have = all.filter((x) => x.set).length;
      const m = el('div', 'pk-prog'); const tx = el('span', '', T('{n} of {m} saved', { n: have, m: all.length }));
      const bar = el('span', 'meter'); const fill = el('i'); fill.style.setProperty('--v', String(all.length ? have / all.length : 0)); bar.append(fill);
      m.append(tx, bar);
      if (have < all.length) { const ab = el('button', 'btn sm', T('Add my details')); ab.type = 'button'; ab.onclick = () => core.openScreen?.('details'); m.append(ab); }
      card.append(m);
    }
    const note = el('div', 'sheet-note'); note.append(iconEl(SHIELD, 16), el('span', '', T('Private values are encrypted and never sit in this chat. They hide again after 20 seconds.')));
    card.append(note);
    return card;
  }
  const curChat = () => chats.list.find((c) => c.id === chats.cur) || null;
  function makeChat(svc = null, title = '') {
    const c = { id: randomHex(6), title: title || '', ts: Date.now(), svc, items: [] };
    chats.list.unshift(c); chats.cur = c.id; return c;
  }
  const remember = (rec) => {
    if (rec.kind === 'sheet' || rec.kind === 'secret' || rec.kind === 'pack') return;
    let c = curChat(); if (!c) c = makeChat();
    c.items.push(rec); c.items = c.items.slice(-80); c.ts = Date.now();
    if (!c.title && rec.who === 'me' && rec.text) c.title = String(rec.text).replace(/\s+/g, ' ').slice(0, 44);
    // most recently used chat first
    chats.list = [c, ...chats.list.filter((x) => x !== c)];
    saveChats();
  };
  /** The last few turns as plain text, so the AI can follow "and the fee?". */
  const recentTurns = () => {
    const c = curChat(); if (!c) return [];
    const out = [];
    for (const it of c.items.slice(-12)) {
      if (it.who === 'me' && it.text) out.push({ r: 'u', t: String(it.text).slice(0, 500) });
      else if (it.who === 'bot' && it.reply?.body) out.push({ r: 'a', t: String(it.reply.body).slice(0, 500) });
    }
    return out.slice(-8);
  };

  // Your own message: go to the bottom. A reply: start at its top if it is long, otherwise sit at the bottom.
  const scrollTo = (node, toTop) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const tall = toTop && node.offsetHeight > chat.clientHeight * 0.6;
      const top = tall
        ? chat.scrollTop + node.getBoundingClientRect().top - chat.getBoundingClientRect().top - 12
        : chat.scrollHeight;
      chat.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    }));
  };
  const jump = $('jump');
  const onChatScroll = () => {
    $('app').classList.toggle('scrolled', chat.scrollTop > 6);
    const away = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    jump.hidden = away < 260;
  };
  jump.onclick = () => chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });


  // ---- icon tiles: the main menu and the welcome screen --------------------------------------
  const TILE_ICON = {
    '1': 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
    '2': 'M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M4 12h16',
    '3': 'M7 3h7l4 4v14H7zM10 12h5M10 16h5',
    '4': 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c0-4 3.5-6 8-6s8 2 8 6',
    '5': 'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0',
    '6': 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 115 .5c0 1.5-2.5 2-2.5 3.5M12 17v.01',
    '7': 'M4 7h15a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 7l12-3v3M16 13h2',
    '8': 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    '9': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5L15.5 10',
    '10': ICON.lock,
    card: 'M3 6h18v12H3zM3 10h18M7 15h4',
    car: 'M5 16V11l2-5h10l2 5v5M3 16h18M7.5 13.5v.01M16.5 13.5v.01M6 16v3M18 16v3',
    id: 'M4 5h16v14H4zM8 11a2 2 0 100-4 2 2 0 000 4zM5.5 16c.5-2 5-2 5 0M14 9h4M14 13h4',
  };
  function tile(iconKey, title, desc, onclick) {
    const b = el('button', 'tile'); b.type = 'button';
    const ic = el('span', 'tic'); ic.append(svg(TILE_ICON[iconKey], 22));
    const t = el('span', 'tt'); t.append(el('b', '', title)); if (desc) t.append(el('small', '', desc));
    b.append(ic, t); b.onclick = onclick; return b;
  }
  // Official sites: always open a page that exists. Guessed deep paths often lead nowhere, so only these are kept; everything else opens the site's front page.
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
  function fixUrl(u) {
    const m = /^(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})(\/[^\s]*)?/i.exec(String(u || '').trim());
    if (!m) return null;
    const host = m[1].toLowerCase(); const path = m[2] || '';
    if (/incometax\.gov\.in$/.test(host) && /instant|e-?pan/i.test(path)) return 'https://eportal.incometax.gov.in/iec/foservices/#/pre-login/instant-e-pan';
    if (LANDING[host]) return LANDING[host];
    return /\.(gov\.in|nic\.in)$/.test(host) ? 'https://' + host + '/' : 'https://' + host + path;
  }
  function toHref(url) {
    const u = /^https?:\/\//i.test(url) ? url : 'https://' + url.replace(/^\/\//, '');
    try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null; } catch { return null; }
  }

  // Inline formatting used in the bot's texts: *bold*, _italic_. Links are handled first.
  function inline(parent, s) {
    const re = /(\*[^*\n]+\*)|((?:^|(?<=\s))_[^_\n]+_(?=$|\s|[.,;:!?]))/g;
    let last = 0;
    for (const m of s.matchAll(re)) {
      if (m.index > last) parent.append(s.slice(last, m.index));
      const inner = m[0].slice(1, -1);
      parent.append(m[1] ? el('strong', '', inner) : el('em', '', inner));
      last = m.index + m[0].length;
    }
    if (last < s.length) parent.append(s.slice(last));
  }

  function linkNode(url, info) {
    const href = info.kind === 'official' ? fixUrl(url) : toHref(url);
    if (info.kind === 'official' && href) {
      const a = el('a', 'link ok', url);
      a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
      return a;
    }
    if (info.kind === 'payment' && href) {
      const a = el('a', 'link pay'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
      a.append(svg(ICON.lock, 17), T('Pay securely on Stripe'));
      a.title = url;
      a.addEventListener('click', () => { awaitingPayment = true; });
      return a;
    }
    // Anything else is text you cannot tap. If it looks like a trap, say so.
    const w = el('span');
    w.append(el('span', 'link bad', url));
    const b = el('span', 'badge bad'); b.append(svg(ICON.warn, 11), info.kind === 'trap' ? T('Looks like a trap') : T('Not confirmed official'));
    w.append(b);
    return w;
  }

  function richText(text, links = {}) {
    const box = el('div', 'txt');
    const urls = Object.keys(links).sort((a, b) => b.length - a.length);
    text = String(text);
    for (const u of urls) text = text.split('*' + u + '*').join(u).split('_' + u + '_').join(u); // bold/italic marks around a link would cut it in two
    for (const para of text.split(/\n{2,}/)) {
      const p = el('p');
      const lines = para.split('\n');
      lines.forEach((line, i) => {
        let rest = line;
        while (rest) {
          let hit = null;
          for (const u of urls) { const at = rest.indexOf(u); if (at >= 0 && (!hit || at < hit.at)) hit = { at, u }; }
          if (!hit) { inline(p, rest); break; }
          if (hit.at) inline(p, rest.slice(0, hit.at));
          p.append(linkNode(hit.u, links[hit.u]));
          rest = rest.slice(hit.at + hit.u.length);
        }
        if (i < lines.length - 1) p.append(document.createElement('br'));
      });
      box.append(p);
    }
    return box;
  }

  function addMe(content, rec) {
    const m = el('div', 'msg me');
    const b = el('div', 'bubble-me');
    if (typeof content === 'string') b.textContent = content;
    else b.append(content);
    m.append(b);
    thread.append(m);
    if (rec) remember(rec);
    scrollTo(m, false);
    return m;
  }

  function botShell(fromHuman) {
    const row = el('div', 'msg botrow');
    const prev = thread.lastElementChild;
    if (!prev || prev.classList.contains('me') || !prev.classList.contains('botrow')) row.classList.add('first');
    const av = el('span', 'av'); const im = el('img'); im.src = '/logo.svg'; im.width = 22; im.height = 22; im.alt = ''; av.append(im);
    const bot = el('div', 'bot');
    const body = el('div', 'body');
    if (fromHuman) body.dataset.human = '1';
    bot.append(body);
    row.append(av, bot);
    return { row, body };
  }

  function lock(group, chosenEl) {
    group.classList.add('done');
    if (chosenEl) chosenEl.classList.add('chosen');
  }

  function copyText(text, btn) {
    const done = () => {
      const old = btn.dataset.label || (btn.dataset.label = btn.textContent);
      btn.textContent = T('Copied');
      btn.classList.add('ok');
      toast(T('Copied. Paste it into the official site.'));
      clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1500);
    };
    const fallback = () => {
      const ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch { /* nothing more we can do */ }
      ta.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  const iconEl = (d, size = 18, cls = '') => { const s = svg(d, size); if (cls) s.setAttribute('class', cls); return s; };
  const DOC = 'M7 3h7l4 4v14H7zM14 3v5h4M10 13h5M10 17h5';
  const SHIELD = 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5L15.5 10';
  function renderSheet(r) {
    const card = el('div', 'sheet');
    const h = el('div', 'sheet-h');
    const badge = el('span', 'sh-ic'); badge.append(iconEl(DOC, 19));
    const all = el('button', 'sheet-all', T('Copy all')); all.type = 'button';
    const ttl = el('div', 'sh-t'); ttl.append(el('b', '', String(r.title || T('Your details')).replace(/[*_]/g, '').replace(/^[^\p{L}\p{N}]+/u, '')), el('small', '', T('Copy-ready, one tap each')));
    h.append(badge, ttl, all);
    card.append(h);
    const rows = r.rows || [];
    rows.forEach((row, i) => {
      const line = el('div', 'sheet-row'); line.style.setProperty('--i', i);
      const k = el('div', 'k');
      k.append(el('div', 'l', row.label), el('div', 'v', row.value));
      const c = el('button', 'copy', T('Copy')); c.type = 'button';
      c.setAttribute('aria-label', T('Copy') + ' ' + row.label);
      c.onclick = () => copyText(String(row.value), c);
      line.append(k, c);
      card.append(line);
    });
    all.onclick = () => copyText(rows.map((x) => `${x.label}: ${x.value}`).join('\n'), all);
    if (r.missing?.length) { const m = el('div', 'sheet-miss'); m.append(el('b', '', T('Still needed')), ' ' + r.missing.join(', ')); card.append(m); }
    const note = el('div', 'sheet-note'); note.append(iconEl(SHIELD, 16), el('span', '', T('Type or paste these into the official website yourself. Saathi never logs in for you, and never sees your OTP.')));
    card.append(note);
    return card;
  }
  const LOCK_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path class="shackle" d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><rect x="5.5" y="11" width="13" height="9.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="15.6" r="1.3" fill="currentColor"/></svg>';
  function renderSecret(r) {
    const card = el('div', 'sheet vault');
    const ttl = Math.max(10, Math.min(120, Number(r.ttl) || 30));
    const items = (r.items || []).map((x) => ({ label: String(x.label), value: String(x.value) }));
    const head = el('div', 'sheet-h');
    const lock = el('span', 'sh-ic lk'); lock.innerHTML = LOCK_SVG;
    requestAnimationFrame(() => requestAnimationFrame(() => lock.classList.add('open')));
    const hide = el('button', 'sheet-all', T('Hide')); hide.type = 'button';
    const tt = el('div', 'sh-t'); tt.append(el('b', '', String(r.title || T('Locker'))), el('small', '', T('Unlocked for {n} seconds', { n: ttl })));
    head.append(lock, tt, hide);
    const bar = el('div', 'ttl'); const fill = el('i'); bar.append(fill);
    card.append(head, bar);
    items.forEach((it, i) => {
      const line = el('div', 'sheet-row'); line.style.setProperty('--i', i);
      const k = el('div', 'k'); k.append(el('div', 'l', it.label), el('div', 'v reveal-v', it.value));
      const c = el('button', 'copy', T('Copy')); c.type = 'button'; c.setAttribute('aria-label', T('Copy') + ' ' + it.label);
      c.onclick = () => copyText(it.value, c);
      line.append(k, c);
      card.append(line);
    });
    const note = el('div', 'sheet-note'); note.append(iconEl(SHIELD, 16), el('span', '', T('Nothing here is saved on this device. It hides on its own.')));
    card.append(note);
    let timer = null;
    const relock = () => {
      clearTimeout(timer);
      if (card.classList.contains('hidden')) return;
      card.classList.add('relocking');
      items.length = 0;
      setTimeout(() => {
        card.replaceChildren();
        card.classList.remove('relocking');
        card.classList.add('hidden');
        const p = el('div', 'sheet-note lockedmsg'); const l2 = el('span', 'sh-ic lk'); l2.innerHTML = LOCK_SVG;
        p.append(l2, el('span', '', T('Hidden again. Ask me again, or tap Unlock above, to see it.')));
        card.append(p);
      }, 220);
    };
    hide.onclick = relock;
    timer = setTimeout(relock, ttl * 1000);
    requestAnimationFrame(() => { fill.style.transition = 'transform ' + ttl + 's linear'; fill.style.transform = 'scaleX(0)'; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) relock(); }, { once: true });
    return card;
  }

  function renderReply(r, { fromHuman = false, silent = false } = {}) {
    const firstEver = false;
    const { row, body } = botShell(fromHuman);
    let plainForHistory = '';
    if (typeof r === 'string') r = { kind: 'text', body: r };
    if (fromHuman) {
      const box = el('div', 'txt human-msg');
      box.append(el('span', 'from', 'Saathi team'), r.body);
      body.append(box);
      plainForHistory = r.body;
    } else if (r.kind === 'sheet') {
      body.append(renderSheet(r));
    } else if (r.kind === 'secret') {
      body.append(renderSecret(r));
    } else if (r.kind === 'pack') {
      body.append(renderPack(r));
    } else if (r.kind === 'buttons' || r.kind === 'list' || r.kind === 'form' || r.kind === 'text') {
      if (r.body) body.append(richText(r.body, r.links));
      plainForHistory = r.body || '';
      if (r.kind === 'buttons') {
        const g = el('div', 'chips');
        for (const b of r.buttons) {
          const c = el('button', 'chip', T(b.title)); c.type = 'button';
          c.onclick = () => {
            if (b.id.startsWith('act_')) return void core.openScreen?.(ACT_SCREEN[b.id] || 'tools');
            if (b.id.startsWith('info:')) return void core.openScreen?.('service', { id: b.id.slice(5) });
            lock(g, c);
            if (b.id === 'ask') send({ type: 'text', text: T(b.title) }, T(b.title));
            else send({ type: 'reply', id: b.id, title: b.title }, T(b.title));
          };
          g.append(c);
        }
        body.append(g);
      } else if (r.kind === 'list' && r.rows.length === 10 && r.rows.every((x, i) => x.id === String(i + 1))) {
        const g = el('div', 'tiles list');
        for (const x of r.rows) g.append(tile(x.id, x.title, x.description, () => { lock(g, g.querySelector(`[data-id="${x.id}"]`)); send({ type: 'reply', id: x.id, title: x.title }, x.title); }));
        [...g.children].forEach((c, i) => { c.dataset.id = r.rows[i].id; });
        body.append(g);
      } else if (r.kind === 'list') {
        const g = el('div', 'list');
        for (const x of r.rows) {
          const b = el('button', 'row'); b.type = 'button';
          const t = el('div', 'x'); t.append(el('div', 't', x.title));
          if (x.description) t.append(el('div', 'd', x.description));
          b.append(t, svg(ICON.chev, 18));
          b.onclick = () => { lock(g, b); send({ type: 'reply', id: x.id, title: x.title }, x.title); };
          g.append(b);
        }
        body.append(g);
      }
    } else if (r.body) {
      body.append(richText(r.body, r.links));
    }
    thread.append(row);
    if (!silent) remember({ who: 'bot', reply: r.kind === 'buttons' || r.kind === 'list' ? r : { kind: 'text', body: plainForHistory || '', links: r.links }, human: fromHuman });
    if (!firstEver) scrollTo(row, true);
    return row;
  }

  function typing() {
    const { row, body } = botShell();
    const t = el('div', 'typing'); t.append(el('i'), el('i'), el('i'));
    t.setAttribute('role', 'status'); t.setAttribute('aria-label', T('Saathi is typing'));
    body.append(t);
    thread.append(row);
    scrollTo(row, false);
    return row;
  }

  function showError(text, retry) {
    const { row, body } = botShell();
    const e = el('div', 'err', text);
    if (retry) { const b = el('button', 'link-btn', T('Try again')); b.type = 'button'; b.onclick = () => { row.remove(); retry(); }; e.append(b); }
    body.append(e);
    thread.append(row);
    scrollTo(row, false);
  }

  // ---- wallet + human handoff -------------------------------------------------------------
  let walletNow = null; let pricesNow = null;
  function setWallet(w) {
    if (!w) return;
    walletNow = w;
    $('wallet').hidden = false;
    $('walletText').textContent = w.balance;
    $('wallet').classList.toggle('has-pack', Boolean(w.pack));
  }
  const rupee = (p) => '₹' + (p % 100 === 0 ? p / 100 : (p / 100).toFixed(2));


  // ---- sending ----------------------------------------------------------------------------
  let busy = false;
  let awaitingPayment = false;
  const setBusy = (v) => { busy = v; sendBtn.classList.toggle('busy', v); grow(); };
  const lockStale = () => document.querySelectorAll('.chips:not(.done), .list:not(.done)').forEach((g) => g.classList.add('done'));
  async function send(payload, shown, thumb) {
    if (busy) return;
    setBusy(true);
    const hist = payload.type === 'text' ? recentTurns() : [];
    lockStale();
    document.querySelectorAll('.suggest, .hello').forEach((g) => g.remove());
    if (shown !== null) {
      if (thumb) addMe(thumb, { who: 'me', text: shown });
      else addMe(shown ?? payload.text, { who: 'me', text: shown ?? payload.text });
    }
    const tp = typing();
    const slow = setTimeout(() => { const n = el('div', 'typing-note', T('Still working on it…')); tp.querySelector('.body').append(n); }, 6000);
    try {
      const { ok, status, j } = await api('/app/api/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, lang: uiLang(), ...(payload.type === 'text' ? { ctx: { svc: curChat()?.svc || undefined, hist } } : {}), ...(freshNext ? { fresh: true } : {}) }) });
      if (ok) freshNext = false;
      clearTimeout(slow); tp.remove();
      if (!ok) {
        if (status === 429) showError(T('You are going a little fast. Wait a few seconds and try again.'), () => { setBusy(false); send(payload, null); });
        else if (j.error === 'upload_expired') showError(T('That upload expired. Please attach it again.'));
        else showError(T('Something went wrong on our side. Nothing was lost.'), () => { setBusy(false); send(payload, null); });
        return;
      }
      for (const r of j.replies || []) {
        renderReply(r);
        if (j.replies.length > 1) await new Promise((res) => setTimeout(res, 250));
      }
      setWallet(j.wallet);
      if (payload.type === 'reply' && payload.id === 'delete_yes') { chats = { cur: null, list: [] }; store.del(HIST_KEY); }
    } catch {
      clearTimeout(slow); tp.remove();
      showError(T('No internet connection. Check it and try again.'), () => { setBusy(false); send(payload, null); });
    } finally {
      setBusy(false);
      if (matchMedia('(pointer:fine)').matches) $('input').focus({ preventScroll: true });
    }
  }

  // ---- composer ---------------------------------------------------------------------------
  const input = $('input');
  const sendBtn = $('sendBtn');
  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; sendBtn.disabled = (!input.value.trim() && !recording) || busy; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('form').requestSubmit(); }
  });
  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (recording) return void stopRecording(true);
    if (dictating) stopDictation();
    const text = input.value.trim();
    if (!text || busy) return; // keep what they typed instead of losing it
    input.value = ''; grow();
    send({ type: 'text', text });
  });

  // attach: photos and PDFs
  const attachBtn = $('attachBtn');
  const pop = $('attachPop');
  const closePop = () => { pop.hidden = true; attachBtn.setAttribute('aria-expanded', 'false'); };
  attachBtn.onclick = (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; attachBtn.setAttribute('aria-expanded', String(!pop.hidden)); };
  document.addEventListener('click', (e) => { if (!pop.contains(e.target)) closePop(); });
  $('pickFile').onclick = () => { closePop(); $('fileInput').click(); };
  $('pickCamera').onclick = () => { closePop(); $('cameraInput').click(); };
  for (const id of ['fileInput', 'cameraInput']) $(id).addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) attachFile(f); });

  async function shrink(file) {
    // Phone photos are huge. Shrink to about 1800px: much faster on a slow connection, and easily readable.
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
      return blob || file;
    } catch { return file; }
  }

  async function upload(blob, mime) {
    const { ok, status, j } = await api('/app/api/upload', { method: 'POST', headers: { 'content-type': mime }, body: blob });
    if (!ok) throw Object.assign(new Error(j.error || 'upload'), { status, code: j.error });
    return j.mediaId;
  }

  async function attachFile(file) {
    if (busy) return;
    const isPdf = file.type === 'application/pdf';
    const isImg = file.type.startsWith('image/');
    if (!isPdf && !isImg) return showError(T('I can read photos and PDF files. Try one of those.'));
    if (file.size > 25 * 1024 * 1024) return showError(T('That file is too big. Try a smaller photo or PDF.'));
    const chip = el('div');
    if (isImg) { const im = document.createElement('img'); im.src = URL.createObjectURL(file); im.alt = 'Your photo'; chip.append(im); }
    else { const f = el('div', 'file'); f.append(svg(ICON.file, 18), file.name.slice(0, 40)); chip.append(f); }
    const blob = await shrink(file);
    const mime = blob.type || file.type;
    if (blob.size > 6 * 1024 * 1024) return showError(T('That file is too big after shrinking. Try a smaller PDF, or a photo.'));
    setBusy(true);
    addMe(chip, { who: 'me', text: isPdf ? T('Sent a PDF') : T('Sent a photo') });
    const tp = typing();
    try {
      const mediaId = await upload(blob, mime);
      tp.remove(); setBusy(false);
      await send({ type: isPdf ? 'document' : 'image', mediaId, mime, filename: file.name }, null);
    } catch (e) {
      tp.remove(); setBusy(false);
      showError(e.status === 415 ? T('That kind of file is not supported.') : e.status === 429 ? T('Slow down a little, then try again.') : T('The upload failed. Check your connection and try again.'));
    }
  }

  // ---- speaking instead of typing: browser dictation (free), or a voice note when the browser has none ----
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const BCP = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN', or: 'or-IN', ur: 'ur-IN', as: 'as-IN', ne: 'ne-NP', mai: 'hi-IN', kok: 'mr-IN', sa: 'hi-IN' };
  const micBtn = $('micBtn');
  let sr = null; let dictating = false; let dictLang = null; let dictBase = '';
  const dictCodes = () => { const u = uiLang(); return u === 'en' ? ['en', 'hi'] : u === 'hi' ? ['hi', 'en'] : [u, 'en']; };
  const codeLabel = (c) => ({ en: 'English', hi: 'हिन्दी' }[c] || (core.cfg?.languages || []).find((l) => l.code === c)?.native || c);
  function startDictation() {
    if (!dictLang || !dictCodes().includes(dictLang)) dictLang = dictCodes()[0];
    const r = new SR();
    r.lang = BCP[dictLang] || 'en-IN'; r.interimResults = true; r.continuous = true;
    dictBase = input.value ? input.value.replace(/\s*$/, ' ') : '';
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else interim += t; }
      input.value = dictBase + finalText + interim; grow();
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') showError(T('I could not use the microphone. Allow it in your browser settings, or just type.'));
      if (e.error !== 'aborted' && e.error !== 'no-speech') stopDictation();
    };
    r.onend = () => { if (dictating && sr === r) stopDictation(); };
    try { r.start(); } catch { return; }
    sr = r; dictating = true;
    micBtn.classList.add('live'); micBtn.setAttribute('aria-pressed', 'true');
    $('rec').hidden = false; $('recTime').hidden = true; $('recMsg').textContent = T('Listening… speak now');
    const dl = $('dictLang'); dl.hidden = false; dl.textContent = codeLabel(dictLang) + ' ⇄'; dl.setAttribute('aria-label', T('Change the language you speak'));
    dl.onclick = () => { const cs = dictCodes(); const cur = input.value; stopDictation(); dictLang = cs[(cs.indexOf(dictLang) + 1) % cs.length]; input.value = cur; startDictation(); };
    $('recCancel').onclick = () => { stopDictation(); input.value = dictBase.trim(); grow(); };
  }
  function stopDictation() {
    dictating = false;
    const r = sr; sr = null;
    try { r?.stop(); } catch { /* already stopped */ }
    micBtn.classList.remove('live'); micBtn.setAttribute('aria-pressed', 'false');
    $('rec').hidden = true; $('recTime').hidden = false; $('dictLang').hidden = true; $('recCancel').onclick = () => stopRecording(false);
    grow(); if (matchMedia('(pointer:fine)').matches) input.focus({ preventScroll: true });
  }

  // voice note (only when the server can turn speech into text and the browser has no dictation)
  let recorder = null; let recording = false; let chunks = []; let recStart = 0; let recTimer = null; let recStream = null;
  async function startRecording() {
    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return showError(T('I could not use the microphone. Allow it in your browser settings, or just type.'));
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    recorder = new MediaRecorder(recStream, type ? { mimeType: type } : undefined);
    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start();
    recording = true; recStart = Date.now();
    $('rec').hidden = false; $('recMsg').textContent = T('Recording. Tap send when you are done.'); input.disabled = true; sendBtn.disabled = false; sendBtn.classList.add('rec-stop');
    sendBtn.setAttribute('aria-label', T('Stop and send voice message'));
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      $('recTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= 80) stopRecording(true);
    }, 250);
  }
  function stopRecording(sendIt) {
    if (!recording) return;
    recording = false; clearInterval(recTimer);
    const mime = recorder.mimeType || 'audio/webm';
    recorder.onstop = async () => {
      recStream?.getTracks().forEach((t) => t.stop());
      if (!sendIt || !chunks.length) return;
      const blob = new Blob(chunks, { type: mime });
      const secs = Math.round((Date.now() - recStart) / 1000);
      setBusy(true);
      addMe(`🎤 ${T('Voice message')} · ${secs}s`, { who: 'me', text: '🎤 ' + T('Voice message') });
      const tp = typing();
      try {
        const mediaId = await upload(blob, mime.split(';')[0]);
        tp.remove(); setBusy(false);
        await send({ type: 'voice', mediaId, mime: mime.split(';')[0] }, null);
      } catch { tp.remove(); setBusy(false); showError(T('The voice message did not upload. Try again, or type instead.')); }
    };
    recorder.stop();
    $('rec').hidden = true; input.disabled = false; sendBtn.classList.remove('rec-stop');
    sendBtn.setAttribute('aria-label', T('Send')); grow();
  }
  micBtn.onclick = () => {
    if (SR) return void (dictating ? stopDictation() : startDictation());
    return void (recording ? stopRecording(true) : startRecording());
  };
  $('recCancel').onclick = () => stopRecording(false);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });

  // ---- chats: new, open, delete -------------------------------------------------------------
  // The server keeps one place-in-the-guide per person. A new or switched chat starts it from the top with its next message.
  let engineChat = null;
  const engineReset = () => { freshNext = true; };
  const markEngine = (id) => { engineChat = id; };
  const clearThread = () => { thread.replaceChildren(); document.querySelectorAll('.suggest, .hello').forEach((g) => g.remove()); };

  function openChat(id, { fromSwitch = false } = {}) {
    core.showTab?.('chat');
    const c = chats.list.find((x) => x.id === id);
    if (!c) return newChat();
    chats.cur = c.id; store.set(HIST_KEY, JSON.stringify(chats));
    clearThread();
    for (const rec of c.items) {
      if (rec.who === 'me') addMe(rec.text);
      else if (rec.reply) renderReply(rec.reply, { silent: true });
    }
    const resumed = !fromSwitch && (engineChat === id || !engineChat);
    if (!resumed) { document.querySelectorAll('.chips, .list').forEach((g) => g.classList.add('done')); if (engineChat !== id) { engineReset(); markEngine(id); } }
    else markEngine(id);
    const last = thread.lastElementChild; if (last) requestAnimationFrame(() => chat.scrollTo({ top: chat.scrollHeight, behavior: 'instant' }));
    core.onChats?.();
  }
  function newChat() {
    core.showTab?.('chat');
    chats.cur = null; store.set(HIST_KEY, JSON.stringify(chats));
    clearThread(); welcome();
    if (engineChat) { engineReset(); markEngine(null); }
    chat.scrollTo({ top: 0 }); core.onChats?.();
  }
  function deleteChat(id) {
    chats.list = chats.list.filter((x) => x.id !== id);
    chats.dead = { ...(chats.dead || {}), [id]: Date.now() };
    const wasCur = chats.cur === id;
    if (wasCur) chats.cur = null;
    store.set(HIST_KEY, JSON.stringify(chats));
    core.afterSave?.();
    if (wasCur) newChat(); else core.onChats?.();
  }
  function clearChats() { chats = { cur: null, list: [] }; store.del(HIST_KEY); markEngine(null); core.onChats?.(); }
  /** Start a chat about one service: the assistant opens with what it knows and offers questions that make sense for that service. */
  function openServiceChat(svcId, name, intro, chips) {
    core.showTab?.('chat');
    clearThread();
    makeChat(svcId, name); saveChats();
    if (engineChat) engineReset();
    markEngine(chats.cur);
    renderReply({ kind: 'buttons', body: intro, buttons: chips });
    chat.scrollTo({ top: 0 });
  }

  // ---- start ------------------------------------------------------------------------------
  async function boot() {
    let cfg = {};
    try { cfg = (await api('/app/api/config')).j || {}; } catch { /* offline */ }
    pricesNow = cfg.prices || null;
    core.cfg = cfg;
    await loadUI(uiLang()); applyStatic(); core.rebuild?.();
    if (SR || (cfg.voice && window.MediaRecorder && navigator.mediaDevices?.getUserMedia)) micBtn.hidden = false;
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) return;
      const { ok, j } = await api('/app/api/me').catch(() => ({ ok: false }));
      if (ok) setWallet(j.wallet);
    });
    // Every visit starts on a fresh chat. Earlier chats are in the sidebar.
    chats.cur = null; store.set(HIST_KEY, JSON.stringify(chats));
    if (!store.get('saathi.onboarded')) core.onboarding();
    else welcome();
    core.openPending?.();
    core.onChats?.();
    const { ok, j } = await api('/app/api/me').catch(() => ({ ok: false }));
    if (ok) setWallet(j.wallet);
  }

  // ---- an empty chat: just a greeting and the box to type in ---------------------------------------
  function welcome() {
    const box = el('div', 'hello');
    box.append(el('h1', '', T('Hi, I’m Saathi.')), el('p', '', T('What do you need help with today?')), el('p', 'hello-trust', T('Saathi guides you. You do the final steps on the official site. Never share your OTP with anyone.')));
    thread.append(box);
    forYou(box);
    input.focus({ preventScroll: true });
  }
  // Up to three "next" cards from the person's own account (Sky style shows them; Classic hides them with CSS).
  let core_fy = null;
  async function fyData() {
    if (!store.get('saathi.onboarded')) return null;
    const r = await api('/app/api/t', { method: 'POST', headers: { 'content-type': 'application/json', 'x-saathi': '1' }, body: JSON.stringify({ op: 'summary', args: {} }) }).catch(() => null);
    if (!r?.ok || !r.j?.ok) return null;
    const sum = r.j.data || {}; const items = [];
    for (const x of sum.reminders || []) if (x.left <= 14) items.push({ k: x.left, v: T('Check'), t: x.label + ' · ' + (x.left < 0 ? T('{n} days ago', { n: -x.left }) : x.left === 0 ? T('Today') : T('In {n} days', { n: x.left })), go: 'reminders' });
    for (const d of sum.docs || []) if (d.left !== null && d.left <= 60) items.push({ k: d.left, v: T('Open'), t: T('A saved document expires soon'), go: 'locker' });
    for (const a of sum.appsList || []) if ((a.status === 'applied' || a.status === 'waiting') && a.since > 14) items.push({ k: 50, v: T('Check'), t: (a.title || T('Application')) + ' · ' + T('Waiting for {n} days. Check its status.', { n: a.since }), go: 'apps' });
    for (const [id, g] of Object.entries(sum.guides || {})) if (g?.steps?.length) items.push({ k: 80, v: T('Continue'), t: T('Continue your guide'), go: 'service', args: { id } });
    if (sum.details && !sum.details.filled) items.push({ k: 90, v: T('Save'), t: T('Save your details once'), go: 'details' });
    const started = new Set(Object.keys(sum.guides || {}));
    const hour = new Date().getHours();
    const ideas = [
      { v: T('Check'), t: T('Got a suspicious call or message? Check if it is a scam.'), go: 'check' },
      { v: T('Scan'), t: T('Scan a document and pull out the details'), go: 'scan' },
      { v: T('Resize'), t: T('Make a photo or signature the size a form wants'), go: 'photo' },
      { v: T('Add'), t: T('Set a reminder so you never miss a date'), go: 'reminders' },
      { v: T('Start'), t: T('Apply for a PAN card, step by step'), go: 'service', args: { id: 'pan' }, svc: 'pan' },
      { v: T('Start'), t: T('Fix your Aadhaar details, step by step'), go: 'service', args: { id: 'aadhaar' }, svc: 'aadhaar' },
      { v: T('Start'), t: T('Get a driving licence, step by step'), go: 'service', args: { id: 'dl' }, svc: 'dl' },
      { v: T('Start'), t: T('Apply for a passport, step by step'), go: 'service', args: { id: 'passport' }, svc: 'passport' },
    ].filter((x) => !x.svc || !started.has(x.svc));
    const off = (new Date().getDate() + (hour > 12 ? 2 : 0)) % ideas.length;
    for (let i = 0; i < ideas.length; i++) items.push({ k: 200 + i, ...ideas[(i + off) % ideas.length] });
    items.sort((a, b) => a.k - b.k);
    return { sum, items };
  }
  core_fy = fyData;
  async function forYou(after) {
    const d = await fyData(); if (!d || !after.isConnected) return;
    const items = d.items;
    document.querySelectorAll('.foryou').forEach((n) => n.remove());
    const stack = el('div', 'foryou'); stack.append(el('div', 'fy-h', T('For you')));
    for (const it of items.slice(0, 4)) {
      const b = el('button', 'fy-card'); b.type = 'button';
      b.append(el('span', 'fy-v', it.v), el('span', 'fy-t', it.t));
      b.onclick = () => core.openScreen?.(it.go, it.args);
      stack.append(b);
    }
    document.getElementById('app').append(stack);
  }

  const brandLink = document.querySelector('.top .brand');
  if (brandLink) { brandLink.href = '#'; brandLink.addEventListener('click', (e) => { e.preventDefault(); if (document.body.classList.contains('screen-open')) return; newChat(); }); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  chat.addEventListener('scroll', onChatScroll, { passive: true });
  grow();

  // A calm custom picker instead of the browser's own: a button that opens a list (a bottom sheet on phones).
  // It behaves like a <select>: read and set .value, and listen with .onchange.
  function dropdown({ options, value, label, search, placeholder, onChange }) {
    const root = el('div', 'dd'); const btn = el('button', 'dd-btn'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); if (label) btn.setAttribute('aria-label', label);
    const txt = el('span', 'dd-t'); const chev = el('span', 'dd-c'); chev.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.append(txt, chev); root.append(btn);
    let cur = value !== undefined && value !== null ? value : (options[0] ? options[0][0] : '');
    const nameOf = (v) => { const o = options.find((x) => x[0] === v); return o ? o[1] : ''; };
    const paint = () => { const n = nameOf(cur); txt.textContent = n || placeholder || ''; txt.classList.toggle('ph', !n); };
    Object.defineProperty(root, 'value', { get: () => cur, set: (v) => { cur = v; paint(); } });
    paint();
    let pop = null; let scrim = null; let act = -1;
    const close = (refocus = true) => { if (!pop) return; { const p = pop, sc = scrim; p.classList.remove('on'); sc.style.transition = 'opacity .2s'; sc.style.opacity = '0'; setTimeout(() => { p.remove(); sc.remove(); }, 230); } pop = scrim = null; document.removeEventListener('keydown', onKey, true); btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus({ preventScroll: true }); };
    const choose = (v) => { const changed = v !== cur; cur = v; paint(); close(); if (changed) { onChange?.(v); root.onchange?.({ target: root }); } };
    function onKey(e) {
      if (!pop) return;
      const items = [...pop.querySelectorAll('.dd-o')];
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; act = (act + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((n, i) => n.classList.toggle('act', i === act)); items[act].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter' && act >= 0 && items[act]) { e.preventDefault(); items[act].click(); }
    }
    function open() {
      if (pop) return close();
      scrim = el('div', 'dd-scrim'); scrim.onclick = () => close();
      pop = el('div', 'dd-pop'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', label || '');
      const phone = innerWidth < 600;
      const head = el('div', 'dd-h'); if (phone) head.append(el('span', 'dd-grip'));
      let q = null; if (search) { q = el('input', 'dd-q'); q.type = 'search'; q.placeholder = T('Search'); q.autocomplete = 'off'; head.append(q); }
      const list = el('div', 'dd-list'); list.setAttribute('role', 'listbox');
      const draw = () => {
        const f = q ? q.value.trim().toLowerCase() : ''; list.replaceChildren(); act = -1;
        const hit = options.filter((o) => !f || String(o[1]).toLowerCase().includes(f));
        for (const [v, l] of hit) {
          const o = el('button', 'dd-o' + (v === cur ? ' on' : '')); o.type = 'button'; o.setAttribute('role', 'option'); o.setAttribute('aria-selected', String(v === cur));
          o.append(el('span', '', l)); if (v === cur) { const k = el('span', 'dd-k'); k.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; o.append(k); }
          o.onclick = () => choose(v); list.append(o);
        }
        if (!hit.length) list.append(el('div', 'dd-none', T('Nothing found')));
      };
      if (q) q.oninput = draw;
      draw(); pop.append(head, list);
      document.body.append(scrim, pop);
      btn.setAttribute('aria-expanded', 'true');
      if (!phone) { const r = btn.getBoundingClientRect(); const below = innerHeight - r.bottom; const up = below < 300 && r.top > below; pop.style.left = Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 260) - 8)) + 'px'; pop.style.width = Math.max(r.width, 260) + 'px'; pop.style.maxHeight = Math.max(180, Math.min(360, (up ? r.top : below) - 16)) + 'px'; if (up) pop.style.bottom = (innerHeight - r.top + 6) + 'px'; else pop.style.top = (r.bottom + 6) + 'px'; }
      document.addEventListener('keydown', onKey, true);
      requestAnimationFrame(() => { pop?.classList.add('on'); scrim?.classList.add('on'); const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'center' }); if (q && !phone) q.focus({ preventScroll: true }); });
    }
    btn.onclick = open;
    return root;
  }

  // What the screens (sidebar, settings, wallet, onboarding...) use.
  const core = window.SaathiCore = {
    $, el, svg, api, dropdown, toast, store, tab, HIST_KEY, sid, rupee, send, copyText, welcome, boot, setWallet, applyTheme, applyStyle, applyScale, richText, renderReply, fixUrl,
    T, N, uiLang, loadUI, applyStatic, fyData, openChat, newChat, deleteChat, clearChats, openServiceChat, randomHex, mergeChats,
    get wallet() { return walletNow; },
    get prices() { return pricesNow; },
    set prices(v) { pricesNow = v; },
    get chats() { return chats; },
    onboarding: () => {},
    onChats: null,
    focusInput: () => input.focus(),
    pickFile: () => $('fileInput').click(),
    prefill: (t) => { input.value = t; grow(); input.focus(); },
    resetAfterDelete() { clearChats(); store.del('saathi.poll'); },
  };
})();

// ---- small motion helpers shared by every screen -------------------------------------------------------------------
// 1) <details> opens and closes with a real height animation. 2) Scrolling lists fade at the edge that has more to see.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('click', (e) => {
    const sum = e.target.closest && e.target.closest('summary'); const d = sum && sum.parentElement;
    if (!d || d.tagName !== 'DETAILS' || reduce || !d.animate) return;
    e.preventDefault();
    if (d._anim) { d._anim.cancel(); d._anim = null; }
    const startH = d.offsetHeight; d.style.overflow = 'hidden';
    const opening = !d.open;
    if (opening) d.open = true;
    const endH = opening ? d.scrollHeight : sum.offsetHeight + (parseFloat(getComputedStyle(d).borderTopWidth) || 0) * 2 + (parseFloat(getComputedStyle(d).paddingTop) || 0) + (parseFloat(getComputedStyle(d).paddingBottom) || 0);
    d.classList.toggle('opening', opening); d.classList.toggle('closing', !opening);
    const a = d.animate({ height: [startH + 'px', endH + 'px'] }, { duration: opening ? 380 : 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    d._anim = a;
    const done = () => { d._anim = null; d.style.overflow = ''; d.classList.remove('opening', 'closing'); if (!opening) d.open = false; };
    a.onfinish = done; a.oncancel = () => { d.style.overflow = ''; };
  });
  const SEL = '.ob-langs2 .langs, .ob-stage, .sb-scroll, #chat, .screen';
  const upd = (n) => { const t = n.scrollTop > 6, b = n.scrollHeight - n.clientHeight - n.scrollTop > 6; n.style.setProperty('--ft', t ? '26px' : '0px'); n.style.setProperty('--fb', b ? '26px' : '0px'); n.classList.add('fadey'); };
  const all = () => document.querySelectorAll(SEL).forEach(upd);
  document.addEventListener('scroll', (e) => { const n = e.target; if (n && n.matches && n.matches(SEL)) upd(n); }, true);
  setInterval(all, 400); all();
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
