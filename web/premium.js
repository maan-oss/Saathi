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
        if (!b || !b.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) continue;
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
})();
