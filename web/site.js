// Saathi landing page. Plain script, no libraries. Without JavaScript every section still reads.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rupees = (p) => '₹' + (p % 100 === 0 ? p / 100 : (p / 100).toFixed(2));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // ---- Header: a dark bar once you scroll past the hero ----
  const nav = $('#nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---- Scam check (same rules as the bot; nothing is saved, no link is opened) ----
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

  // ---- From the server: real prices, and the WhatsApp link (sections stay hidden if the server has none) ----
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

// ---- FAQ answers open with one height animation ----
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

// ---- every official website name, anywhere on the page, becomes a real link ----
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
