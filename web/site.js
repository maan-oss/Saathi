// Saathi landing page. Plain script, no libraries. Every section reads without it.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rupees = (p) => '₹' + (p % 100 === 0 ? p / 100 : (p / 100).toFixed(2));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // ---- Header: a thin rule once you scroll past the top ----
  const nav = $('#nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---- Hero question bar: the example inside the bar changes every few seconds. The page reads the same without it. ----
  const askTry = $('#askTry');
  if (askTry && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const examples = ['New PAN card', 'Update Aadhaar', 'Renew passport', 'Driving licence'];
    let n = 0;
    setInterval(() => { n = (n + 1) % examples.length; askTry.textContent = examples[n]; }, 3200);
  }

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
        r.append(el('span', 'rt', label), el('span', 'rv', rupees(v)));
        rows.append(r);
      }
      if (p.pack) {
        const r = el('div', 'rrow pk');
        r.setAttribute('role', 'listitem');
        const t = el('span', 'rt', `${p.pack.days}-day PAN pack`);
        t.append(el('small', '', `${p.pack.scans} document checks, ${p.pack.ai} AI answers, ${p.pack.voice} voice notes and ${p.pack.remind} reminders`));
        r.append(t, el('span', 'rv', rupees(p.pack.paise)));
        rows.append(r);
      }
      sec.hidden = false;
    })
    .catch(() => {});
})();
