// Premium motion and voice feedback. It only reads the page and adds classes or animations; it never changes what is sent.
(() => {
  const $ = (id) => document.getElementById(id);

  // 1. A message you send glides from the box into its bubble (the box is measured before it is cleared).
  (() => {
    const form = $('form'), input = $('input'), thread = $('thread');
    if (!form || !input || !thread || !window.MutationObserver) return;
    let pending = null;
    form.addEventListener('submit', () => {
      if (!input.value.trim()) return;
      pending = { r: input.getBoundingClientRect(), t: performance.now() };
    }, { capture: true });
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement) || !n.classList.contains('me') || !pending) continue;
        const p = pending; pending = null;
        if (performance.now() - p.t > 1500) continue;
        const b = n.querySelector('.bubble-me');
        if (!b || !b.animate) continue;
        const br = b.getBoundingClientRect();
        if (!br.width) continue;
        const dx = (p.r.left + p.r.width / 2) - (br.left + br.width / 2);
        const dy = (p.r.top + p.r.height / 2) - (br.top + br.height / 2);
        const sx = Math.min(1.5, Math.max(0.7, p.r.width / br.width));
        b.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${Math.min(1.3, Math.max(.6, p.r.height / br.height))})`, opacity: .6, borderRadius: '26px' },
          { transform: 'translate(0, 0) scale(1, 1)', opacity: 1, borderRadius: getComputedStyle(b).borderRadius },
        ], { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }).observe(thread, { childList: true });
  })();

  // 2. Dictation: a wave of bars that move with your voice, drawn from the microphone level.
  (() => {
    const rec = $('rec'), dl = $('dictLang'), recDot = rec?.querySelector('.rec-dot');
    if (!rec || !dl || !recDot) return;
    const wave = document.createElement('span'); wave.className = 'wave'; wave.setAttribute('aria-hidden', 'true');
    const bars = [];
    for (let i = 0; i < 26; i++) { const b = document.createElement('i'); wave.append(b); bars.push(b); }
    recDot.after(wave);
    let ctx = null, stream = null, an = null, raf = 0, on = false;
    const draw = (level) => {
      const t = performance.now() / 150;
      bars.forEach((b, i) => {
        const shape = 0.5 + 0.5 * Math.abs(Math.sin(i * 0.8 + t));
        const h = Math.min(1, 0.2 + level * shape * 2.2);
        b.style.height = (h * 100).toFixed(0) + '%';
      });
    };
    const loop = () => {
      if (!on) return;
      raf = requestAnimationFrame(loop);
      let level = 0.16 + 0.08 * Math.sin(performance.now() / 300); // a calm idle wave when no microphone level is readable
      if (an) {
        const data = new Uint8Array(an.fftSize); an.getByteTimeDomainData(data);
        let s = 0; for (const v of data) { const x = (v - 128) / 128; s += x * x; }
        level = Math.min(1, Math.sqrt(s / data.length) * 5);
      }
      draw(level);
    };
    async function start() {
      if (on) return; on = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an);
      } catch { an = null; }
      loop();
    }
    function stop() {
      on = false; cancelAnimationFrame(raf);
      try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
      try { ctx?.close(); } catch { /* already closed */ }
      stream = null; ctx = null; an = null;
      bars.forEach((b) => { b.style.height = '12%'; });
    }
    const sync = () => {
      const dictating = !rec.hidden && !dl.hidden; // dictation shows the language button; a voice note does not
      rec.classList.toggle('dict', dictating);
      if (dictating) start(); else stop();
    };
    new MutationObserver(sync).observe(rec, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(sync).observe(dl, { attributes: true, attributeFilter: ['hidden'] });
  })();

  // 3. Dates: one calendar sheet in place of the phone's own date picker. It writes the same ISO value into the same
  //    field and fires the same input and change events, so every screen that reads the field keeps working.
  (() => {
    const tr = (s, v) => (window.SaathiCore?.T ? window.SaathiCore.T(s, v) : s);
    const loc = () => document.documentElement.lang || 'en';
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
    const parse = (s) => { const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return x ? { y: +x[1], m: +x[2] - 1, d: +x[3] } : null; };
    const today = () => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; };
    const cmp = (a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d);
    const dayLabel = (p) => new Intl.DateTimeFormat(loc(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(p.y, p.m, p.d));
    const monthLabel = (y, m) => new Intl.DateTimeFormat(loc(), { month: 'long', year: 'numeric' }).format(new Date(y, m, 1));
    const CHEV = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    let sheet = null, field = null, view = null, mode = 'days';

    function build() {
      sheet = document.createElement('div');
      sheet.className = 'dp';
      sheet.hidden = true;
      sheet.innerHTML =
        '<div class="dp-scrim"></div>' +
        '<div class="dp-card" role="dialog" aria-modal="true" aria-label="' + tr('Choose a date') + '">' +
          '<div class="dp-grab" aria-hidden="true"></div>' +
          '<header class="dp-head">' +
            '<button type="button" class="dp-nav" data-go="-1" aria-label="' + tr('Previous month') + '">' + CHEV('M15 6l-6 6 6 6') + '</button>' +
            '<button type="button" class="dp-title" data-mode="years"></button>' +
            '<button type="button" class="dp-nav" data-go="1" aria-label="' + tr('Next month') + '">' + CHEV('M9 6l6 6-6 6') + '</button>' +
          '</header>' +
          '<div class="dp-wk" aria-hidden="true"></div>' +
          '<div class="dp-grid" role="grid"></div>' +
          '<div class="dp-years" hidden></div>' +
          '<footer class="dp-foot">' +
            '<button type="button" class="dp-link" data-act="clear">' + tr('Clear') + '</button>' +
            '<button type="button" class="dp-link" data-act="today">' + tr('Today') + '</button>' +
            '<button type="button" class="dp-done" data-act="close">' + tr('Done') + '</button>' +
          '</footer>' +
        '</div>';
      document.body.append(sheet);
      sheet.querySelector('.dp-scrim').addEventListener('click', close);
      sheet.addEventListener('click', onClick);
      sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    }

    // The field's own min and max bound the calendar. Without them: 1900 to ten years ahead.
    function bounds() {
      const t = today();
      return { min: parse(field.min) || { y: 1900, m: 0, d: 1 }, max: parse(field.max) || { y: t.y + 10, m: 11, d: 31 } };
    }
    const inRange = (p, b) => cmp(p, b.min) >= 0 && cmp(p, b.max) <= 0;

    function render() {
      const b = bounds();
      const title = sheet.querySelector('.dp-title');
      const grid = sheet.querySelector('.dp-grid');
      const wk = sheet.querySelector('.dp-wk');
      const years = sheet.querySelector('.dp-years');
      const navs = sheet.querySelectorAll('.dp-nav');
      const pickMode = mode !== 'days'; // year list or month list
      wk.hidden = pickMode; grid.hidden = pickMode; years.hidden = !pickMode;
      navs.forEach((n) => { n.hidden = pickMode; });

      if (mode === 'years') {
        title.textContent = String(view.y);
        years.replaceChildren();
        for (let y = b.max.y; y >= b.min.y; y--) {
          const btn = document.createElement('button');
          btn.type = 'button'; btn.className = 'dp-yr' + (y === view.y ? ' sel' : ''); btn.dataset.year = String(y); btn.textContent = String(y);
          years.append(btn);
        }
        years.querySelector('.dp-yr.sel')?.scrollIntoView({ block: 'center' });
        return;
      }
      if (mode === 'months') {
        title.textContent = String(view.y);
        years.replaceChildren();
        const fmt = new Intl.DateTimeFormat(loc(), { month: 'short' });
        for (let m = 0; m < 12; m++) {
          const btn = document.createElement('button');
          const last = new Date(view.y, m + 1, 0).getDate();
          const off = !(cmp({ y: view.y, m, d: last }, b.min) >= 0 && cmp({ y: view.y, m, d: 1 }, b.max) <= 0); // no day of this month is in range
          btn.type = 'button'; btn.className = 'dp-yr' + (m === view.m ? ' sel' : ''); btn.dataset.month = String(m);
          btn.textContent = fmt.format(new Date(view.y, m, 1));
          btn.disabled = off;
          years.append(btn);
        }
        return;
      }

      title.textContent = monthLabel(view.y, view.m);
      if (!wk.childElementCount) {
        for (let i = 0; i < 7; i++) {
          const s = document.createElement('span');
          s.textContent = new Intl.DateTimeFormat(loc(), { weekday: 'narrow' }).format(new Date(2024, 0, 7 + i)); // 7 Jan 2024 was a Sunday
          wk.append(s);
        }
      }
      const sel = parse(field.value);
      const now = today();
      grid.replaceChildren();
      const lead = new Date(view.y, view.m, 1).getDay();
      const days = new Date(view.y, view.m + 1, 0).getDate();
      for (let i = 0; i < lead; i++) grid.append(document.createElement('span'));
      for (let d = 1; d <= days; d++) {
        const p = { y: view.y, m: view.m, d };
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'dp-day'; btn.dataset.iso = iso(view.y, view.m, d);
        btn.textContent = String(d); btn.setAttribute('aria-label', dayLabel(p));
        if (sel && cmp(sel, p) === 0) { btn.classList.add('sel'); btn.setAttribute('aria-pressed', 'true'); }
        if (cmp(now, p) === 0) btn.classList.add('today');
        if (!inRange(p, b)) btn.disabled = true;
        grid.append(btn);
      }
      const prevM = view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 };
      const nextM = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 };
      sheet.querySelector('[data-go="-1"]').disabled = cmp({ ...prevM, d: 31 }, b.min) < 0;
      sheet.querySelector('[data-go="1"]').disabled = cmp({ ...nextM, d: 1 }, b.max) > 0;
      const todayBtn = sheet.querySelector('[data-act="today"]');
      todayBtn.disabled = !inRange(now, b);
    }

    function shift(k) {
      let y = view.y, m = view.m + k;
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      view = { y, m };
      render();
    }

    // Writes the value the way a native date field would, so listeners on the field see a normal change.
    function choose(value) {
      const f = field;
      if (f && f.value !== value) {
        f.value = value;
        f.dispatchEvent(new Event('input', { bubbles: true }));
        f.dispatchEvent(new Event('change', { bubbles: true }));
      }
      close();
    }

    function onClick(e) {
      const t = e.target.closest('button');
      if (!t || !sheet.contains(t)) return;
      if (t.dataset.go) return shift(+t.dataset.go);
      if (t.dataset.mode === 'years') { mode = mode === 'days' ? 'years' : 'days'; return render(); }
      if (t.dataset.year) { view = { y: +t.dataset.year, m: view.m }; mode = 'months'; return render(); }
      if (t.dataset.month) { view = { y: view.y, m: +t.dataset.month }; mode = 'days'; return render(); }
      if (t.dataset.iso) return choose(t.dataset.iso);
      if (t.dataset.act === 'clear') return choose('');
      if (t.dataset.act === 'today') { const n = today(); if (inRange(n, bounds())) choose(iso(n.y, n.m, n.d)); return; }
      if (t.dataset.act === 'close') close();
    }

    function open(input) {
      if (!sheet) build();
      field = input;
      const b = bounds();
      const cur = parse(input.value) || (inRange(today(), b) ? today() : b.min);
      view = { y: cur.y, m: cur.m };
      mode = 'days';
      sheet.hidden = false;
      document.body.classList.add('dp-open');
      render();
      place();
      requestAnimationFrame(() => sheet.classList.add('on'));
      const target = sheet.querySelector('.dp-day.sel') || sheet.querySelector('.dp-day.today:not(:disabled)') || sheet.querySelector('.dp-day:not(:disabled)');
      target?.focus({ preventScroll: true });
    }

    // On a computer the calendar opens beside its field, like a menu, and stays on screen. A phone keeps the sheet from the bottom.
    function place() {
      const card = sheet.querySelector('.dp-card');
      if (!field || !matchMedia('(min-width:640px)').matches) { card.style.left = ''; card.style.top = ''; return; }
      const r = field.getBoundingClientRect(), cw = card.offsetWidth, ch = card.offsetHeight, m = 12;
      const left = Math.min(Math.max(m, r.left), innerWidth - cw - m);
      let top = r.bottom + 8;
      if (top + ch > innerHeight - m) top = Math.max(m, r.top - ch - 8);
      card.style.left = left + 'px'; card.style.top = top + 'px';
    }
    addEventListener('resize', () => { if (sheet && !sheet.hidden) place(); });

    function close() {
      if (!sheet || sheet.hidden) return;
      sheet.classList.remove('on');
      document.body.classList.remove('dp-open');
      // Drop focus from the sheet. It is not handed back to the date field: on phones that would open the system picker.
      if (sheet.contains(document.activeElement)) document.activeElement.blur();
      field = null;
      setTimeout(() => { if (!sheet.classList.contains('on')) sheet.hidden = true; }, 240);
    }

    // Every date field shows day first, as Indian users write it (DD/MM/YYYY). The browser picks a date's order from the field's lang.
    const dayFirst = (node) => {
      if (node.nodeType !== 1) return;
      const dates = node.matches && node.matches('input[type="date"]') ? [node] : [];
      if (node.querySelectorAll) dates.push(...node.querySelectorAll('input[type="date"]'));
      for (const d of dates) if (!d.lang) d.lang = 'en-IN';
    };
    dayFirst(document.body);
    new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) dayFirst(n); })
      .observe(document.body, { childList: true, subtree: true });

    // A tap on a date field opens the calendar instead of the system picker (the system picker stays as a fallback in the browser).
    document.addEventListener('mousedown', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === 'date' && !t.disabled && !t.readOnly) { e.preventDefault(); open(t); }
    }, true);
    document.addEventListener('click', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'date' && !e.target.disabled && !e.target.readOnly) e.preventDefault();
    }, true);
    // Keyboard users reach the field with Tab: opening the calendar there too.
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === 'date' && !t.lang) t.lang = 'en-IN';
      if (!(t instanceof HTMLInputElement) || t.type !== 'date' || t.disabled || t.readOnly) return;
      if (sheet && !sheet.hidden) return;
      open(t);
    });
  })();
})();
