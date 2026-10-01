// Saathi landing page. Plain script, no libraries. Without JavaScript the page is still fully readable.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rupees = (p) => '₹' + (p % 100 === 0 ? p / 100 : (p / 100).toFixed(2));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // ---- Scroll reveal ---------------------------------------------------------
  document.documentElement.classList.add('js');
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' }) : null;
  const watch = (n) => (io ? io.observe(n) : n.classList.add('in'));
  $$('.reveal').forEach(watch);

  const nav = $('#nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- "What do I need for…" card: real facts from /app/api/services -----------------
  const seg = $('#seg'), body = $('#needBody'), go = $('#needGo'), dateEl = $('#needDate');
  const ICONS = {
    fee: '<path d="M7 5h10M7 9h10M9 5c4 0 6 1.5 6 4s-2 4-6 4l7 6"/>',
    docs: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
    site: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  };
  const icon = (k) => { const w = el('span', 'ic'); w.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[k] + '</svg>'; return w; };
  const row = (k, label, build) => {
    const r = el('div', 'nrow'); const t = el('div'); t.append(el('div', 'k', label)); build(t); r.append(icon(k), t); return r;
  };
  const host = (u) => { try { return new URL(u).host; } catch { return ''; } };
  let data = null;
  function show(i) {
    const sv = data.services[i];
    $$('button', seg).forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; });
    body.replaceChildren();
    body.append(row('fee', 'What it costs', (t) => { const f = sv.fee.split('\n')[0]; const m = f.match(/^[^.]{6,60}\./); t.append(el('div', 'big', m ? m[0] : f)); const rest = m ? f.slice(m[0].length).trim() : ''; if (rest) t.append(el('div', 'sm', rest)); }));
    body.append(row('docs', 'What to keep ready', (t) => {
      const lines = sv.docs.filter((l) => /^[•\-*]/.test(l)).map((l) => l.replace(/^[•\-*]\s*/, ''));
      const head = sv.docs.find((l) => !/^[•\-*]/.test(l));
      if (head && !lines.length) t.append(el('div', 'big', head));
      const ul = el('ul'); lines.slice(0, 7).forEach((l) => ul.append(el('li', '', l)));
      if (lines.length) t.append(ul);
    }));
    const site = (sv.sites || []).find((u) => /^https:\/\//.test(u));
    if (site) body.append(row('site', 'Official site', (t) => {
      const a = el('a', 'site', host(site)); a.href = site; a.target = '_blank'; a.rel = 'noopener noreferrer'; t.append(a);
      if (sv.unverified?.length) t.append(el('div', 'flag', 'Some details here are not confirmed on an official page yet. Saathi says so when it matters.'));
    }));
    go.href = '/app?service=' + encodeURIComponent(sv.id);
  }
  if (seg && body) fetch('/app/api/services').then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => {
    data = d;
    if (dateEl && d.verified) dateEl.textContent = 'Checked ' + d.verified;
    seg.replaceChildren();
    d.services.forEach((sv, i) => {
      const b = el('button', '', sv.name); b.type = 'button'; b.setAttribute('role', 'tab');
      b.addEventListener('click', () => show(i));
      seg.append(b);
    });
    seg.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const bs = $$('button', seg); const cur = bs.findIndex((b) => b.getAttribute('aria-selected') === 'true');
      const n = (cur + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length; show(n); bs[n].focus();
    });
    show(0);
  }).catch(() => { body.replaceChildren(el('p', 'sm', 'Could not load the list just now. Open the app and ask Saathi directly.')); });

  // ---- Scam checker (uses the same rules as the bot; nothing is saved) --------
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
      chkOut.hidden = false; chkOut.dataset.l = 'none'; chkOut.replaceChildren(el('p', 'vt', e.message === 'slow' ? 'Too many checks. Try again in a minute.' : 'Could not check just now. Try again, or open the app.'));
    } finally { chkGo.disabled = false; chkGo.textContent = 'Check it'; }
  }
  if (chkGo) {
    chkGo.addEventListener('click', runCheck);
    chkIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runCheck(); });
    for (const b of $$('.try button')) b.addEventListener('click', () => { chkIn.value = b.dataset.ex; runCheck(); });
  }

  // ---- Locker demo: locked until you tap, hides again on its own -----------------
  const vcard = $('#vcard'), vBtn = $('#vBtn'), vBody = $('#vBody'), vIc = $('#vIc'), vBar = $('#vBar');
  if (vcard) {
    let timer = null;
    const SAMPLE = 'ABCPE1234F';
    const lock = () => {
      clearTimeout(timer);
      vcard.dataset.state = 'locked';
      vBody.replaceChildren(el('span', 'mask', '••••••234F'));
      vIc.textContent = '🔒';
      vBtn.textContent = 'Unlock';
    };
    const open = () => {
      vcard.dataset.state = 'open';
      vBody.replaceChildren(el('span', 'val', SAMPLE));
      vIc.textContent = '🔓';
      vBtn.textContent = 'Hide';
      const bar = $('i', vBar);
      bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = 'transform 8s linear'; bar.style.transform = 'scaleX(0)'; }));
      timer = setTimeout(lock, 8000);
    };
    vBtn.addEventListener('click', () => (vcard.dataset.state === 'open' ? lock() : open()));
  }

  // ---- From the server: WhatsApp button and real prices ---------------------------
  fetch('/app/api/config').then((r) => (r.ok ? r.json() : Promise.reject())).then((c) => {
    if (c.whatsapp && /^https:\/\/wa\.me\/\d+$/.test(c.whatsapp)) { const w = $('#waBtn'); if (w) { w.href = c.whatsapp; w.hidden = false; } }
    const p = c.prices, sec = $('#price');
    if (!p || !sec) return;
    const items = [['A message', p.msgPaise], ['An AI answer', p.aiPaise], ['A document check', p.scanPaise], ['A copy sheet', p.sheetPaise], ['A voice note', p.voicePaise], ['A reminder', p.remindPaise]]
      .filter(([, v]) => Number.isFinite(v) && v > 0);
    if (!items.length) return;
    $('#priceLede').textContent = `New people start with ${rupees(p.trialPaise)} and ${p.freeMsgsPerDay} free messages a day. After that, each action costs a little. No subscription.`;
    const rows = $('#rcRows'); rows.replaceChildren();
    items.forEach(([label, v], i) => {
      const r = el('div', 'rc-r'); r.setAttribute('role', 'listitem'); r.style.transitionDelay = 0.15 + i * 0.09 + 's';
      r.append(el('span', '', label), el('span', 'dots'), el('b', '', rupees(v)));
      rows.append(r);
    });
    if (p.pack) $('#packNote').textContent = `Or a ${p.pack.days}-day PAN pack for ${rupees(p.pack.paise)}: ${p.pack.scans} document checks, ${p.pack.ai} AI answers, ${p.pack.voice} voice notes and ${p.pack.remind} reminders.`;
    sec.hidden = false;
    $$('.reveal', sec).forEach(watch);
    watch($('#receipt'));
  }).catch(() => {});
})();

// ---- FAQ answers open with a real height animation ----------------------------------------------------------------------
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
    d.classList.toggle('opening', opening);
    const a = d.animate({ height: [startH + 'px', endH + 'px'] }, { duration: opening ? 380 : 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    d._a = a; a.onfinish = () => { d._a = null; d.style.overflow = ''; d.classList.remove('opening'); if (!opening) d.open = false; };
  });
})();
