// The app's own pages: tools hub, scan, locker, details, reminders, applications, photo resizer, devices and sync.
// None of these go through the chat. They talk to /app/api/t (and /app/api/link) directly and never use the AI,
// except Scan, which asks it to read one photo.
(() => {
  'use strict';
  const C = window.SaathiCore;
  const U = C.ui;
  const { $, el, api, toast, store, T, N } = C;
  const { frame, row, group, seg, note, empty, btn, ico, SCREENS: S, openScreen, showDialog, closeDialog, rupee } = U;

  // ---- helpers -----------------------------------------------------------------------------------------
  const JSON_H = { 'content-type': 'application/json' };
  async function tcall(op, args = {}) {
    const r = await api('/app/api/t', { method: 'POST', headers: JSON_H, body: JSON.stringify({ op, args }) }).catch(() => ({ ok: false, status: 0, j: {} }));
    if (r.j?.wallet) C.setWallet(r.j.wallet);
    return { ok: Boolean(r.ok && r.j.ok), data: r.j.data, error: r.j.error || (r.ok ? null : 'network'), extra: r.j };
  }
  async function lcall(op, args = {}) {
    const r = await api('/app/api/link', { method: 'POST', headers: JSON_H, body: JSON.stringify({ op, ...args }) }).catch(() => ({ ok: false, j: {} }));
    return { ok: Boolean(r.ok && r.j.ok), data: r.j.data, error: r.j.error || (r.ok ? null : 'network') };
  }
  const ERR = {
    bad_number: N('That number does not look right. Check it and try again.'),
    bad_date: N('That date does not look right.'),
    bad_type: N('Pick a document type.'),
    bad_label: N('Give it a short name.'),
    empty: N('Add a number or an expiry date.'),
    no_expiry: N('This document has no expiry date.'),
    full: N('You have reached the limit. Remove one first.'),
    too_big: N('That is too big.'),
    slow_down: N('You are going a little fast. Wait a few seconds and try again.'),
    bad_code: N('That code is not right, or it has expired. Ask for a new one.'),
    same: N('This is the same device.'),
    already_linked: N('This device is already linked. Unlink it first.'),
    has_devices: N('Other devices are linked to this one. Sign them out first.'),
    too_many: N('You can link up to 5 devices. Remove one first.'),
    expired: N('That took too long. Please scan again.'),
    network: N('Could not reach Saathi. Check your internet and try again.'),
  };
  const errText = (code) => T(ERR[code] || N('Something went wrong. Please try again.'));
  const fmtIso = (iso) => { const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const whenText = (n) => (n < 0 ? T('{n} days ago', { n: -n }) : n === 0 ? T('Today') : n === 1 ? T('Tomorrow') : T('In {n} days', { n }));
  const TYPE_ICON = { pan: 'card', aadhaar: 'id', driving_licence: 'car', passport: 'passport', voter_id: 'vote', gst: 'gst' };
  const TYPE_NAME = { pan: N('PAN card'), aadhaar: N('Aadhaar'), driving_licence: N('Driving licence'), passport: N('Passport'), voter_id: N('Voter ID'), gst: N('GSTIN') };
  const typeName = (t) => T(TYPE_NAME[t] || t);
  const FIELD_NAMES = [N('Full name (as on Aadhaar)'), N('Date of birth'), N("Father's name"), N('Gender'), N('Address'), N('PIN code'), N("Mother's name"), N('Mobile number'), N('Email')];
  const fieldLabel = (f) => T(f.label.en);
  const optionLabel = (o) => T(o.en);
  void FIELD_NAMES;
  const busyBtn = async (b, fn) => { b.disabled = true; try { return await fn(); } finally { b.disabled = false; } };
  const field = (label, input, hint) => { const w = el('label', 'fld'); w.append(el('span', 'fld-l', label), input); if (hint) w.append(el('small', 'fld-h', hint)); return w; };
  const textInput = (ph, value = '', mode) => { const i = el('input', 'field-i'); i.type = 'text'; i.placeholder = ph || ''; i.value = value; i.autocomplete = 'off'; i.spellcheck = false; if (mode) i.inputMode = mode; return i; };
  const errBox = () => { const e = el('p', 'fld-err'); e.hidden = true; e.setAttribute('role', 'alert'); e.show = (m) => { e.textContent = m; e.hidden = false; }; e.hide = () => { e.hidden = true; }; return e; };
  const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const svcById = (id) => U.SERVICES.find((x) => x[0] === id);

  // The wallet paywall shown when a paid action has no free or paid balance.
  function paywall(extra) {
    showDialog({
      title: T('Add money to continue'),
      body: T('This needs {price}, and your balance is lower. Add money or get a pack.', { price: rupee(extra?.price || 0) }),
      actions: [btn('btn', T('Not now'), closeDialog), btn('btn pri', T('See packs'), () => { closeDialog(); openScreen('packs'); })],
    });
  }

  // ---- tools hub: a "Today" dashboard ------------------------------------------------------------------------
  const dayDiff = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(todayIso() + 'T00:00:00Z')) / 86400000);
  const addDaysIso = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const shortDate = (ts) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const meterBar = (v) => { const m = el('span', 'meter hub-meter'); const i = el('i'); i.style.setProperty('--v', String(Math.max(0, Math.min(1, v)))); m.append(i); return m; };

  S.tools = async () => {
    const col = frame(T('Today'), T('What needs you now, and everything Saathi can do.'));
    col.classList.add('wide-col');
    const sw = el('label', 'search-w hub-search'); sw.append(ico('search', 18));
    const si = el('input', 'search'); si.type = 'search'; si.placeholder = T('Search tools and guides'); si.setAttribute('aria-label', T('Search tools and guides')); si.autocomplete = 'off'; si.spellcheck = false;
    sw.append(si);
    const holder = el('div', 'hub-wrap'); col.append(sw, holder);
    let sum = { locker: 0, docs: [], details: { filled: 0, total: 9 }, reminders: [], apps: 0, appsList: [], guides: {}, devices: 0 };
    let loaded = false;

    const attention = () => {
      const items = [];
      for (const r of sum.reminders || []) if (r.left <= 14) items.push({ k: r.left, icon: 'bell', title: r.label, sub: fmtIso(r.due), when: r.left, go: 'reminders' });
      for (const d of sum.docs || []) if (d.left !== null && d.left <= 60) items.push({ k: d.left, icon: TYPE_ICON[d.type] || 'doc', title: d.left < 0 ? T('{doc} has expired', { doc: typeName(d.type) }) : T('{doc} expires', { doc: typeName(d.type) }), sub: fmtIso(d.expiry), when: d.left, go: 'locker' });
      for (const a of sum.appsList || []) if ((a.status === 'applied' || a.status === 'waiting') && a.since !== null && a.since > 14) items.push({ k: 100 - a.since / 100, icon: 'apps', title: a.title || T('Application'), sub: T('Waiting for {n} days. Check its status.', { n: a.since }), when: null, go: 'apps' });
      return items.sort((x, y) => x.k - y.k).slice(0, 6);
    };

    const draw = () => {
      holder.replaceChildren();
      const q = si.value.trim().toLowerCase();
      const tools = [
        { icon: 'scan', title: T('Scan a document'), sub: T('Check a photo and pull out the details'), screen: 'scan', wide: true },
        { icon: 'lock', title: T('My locker'), sub: sum.locker ? T('Saved {n} of {total}', { n: sum.locker, total: 6 }) : T('IDs and expiry dates'), screen: 'locker', v: sum.locker / 6 },
        { icon: 'user', title: T('My details'), sub: T('{filled} of {total} filled', sum.details), screen: 'details', v: sum.details.total ? sum.details.filled / sum.details.total : 0 },
        { icon: 'bell', title: T('Reminders'), sub: sum.reminders?.[0] ? T('{label}: {when}', { label: sum.reminders[0].label, when: whenText(sum.reminders[0].left).toLowerCase() }) : T('Never miss a date'), screen: 'reminders' },
        { icon: 'apps', title: T('Applications'), sub: sum.apps ? T('{n} tracked', { n: sum.apps }) : T('Track what you applied for'), screen: 'apps' },
        { icon: 'photo', title: T('Photo resizer'), sub: T('Photo or signature to the size a form wants'), screen: 'photo' },
        { icon: 'shield', title: T('Is this real?'), sub: T('Check a suspicious message or link'), screen: 'check' },
      ];
      if (C.cfg?.link) tools.push({ icon: 'devices', title: T('Devices and sync'), sub: sum.devices ? T('{n} linked', { n: sum.devices + 1 }) : T('Use Saathi on your phone too'), screen: 'devices' });
      if ((tools.length - 1) % 2 === 1) tools[tools.length - 1].wide = true;
      const shownTools = q ? tools.filter((t) => (t.title + ' ' + t.sub).toLowerCase().includes(q)) : tools;
      const guides = U.SERVICES.filter(([, name]) => !q || T(name).toLowerCase().includes(q));

      if (!q) {
        // needs attention
        const att = attention();
        const g = el('section', 'grp'); const h = el('div', 'grp-h'); h.append(el('h2', 'grp-t', T('Needs attention')));
        if (att.length) h.append(el('small', 'mut', String(att.length)));
        g.append(h);
        if (!loaded) { const sk = el('div', 'hub-skel'); g.append(sk); }
        else if (!att.length) {
          const ok = el('div', 'hub-clear'); const ic = el('span', 'hub-clear-ic'); ic.append(ico('check', 18));
          const tx = el('div'); tx.append(el('b', '', T('Nothing needs you right now')), el('small', '', T('Dates, documents and applications are all on track.')));
          ok.append(ic, tx); g.append(ok);
        } else {
          const box = el('div', 'grp-box');
          for (const it of att) {
            const right = it.when === null ? null : el('span', 'tag ' + (it.when < 0 ? 'bad' : it.when <= 7 ? 'warn' : ''), whenText(it.when));
            box.append(row({ icon: it.icon, title: it.title, sub: it.sub, right: right || undefined, onclick: () => openScreen(it.go) }));
          }
          g.append(box);
        }
        holder.append(g);

        // continue
        const cont = Object.entries(sum.guides || {}).filter(([id, gd]) => svcById(id) && gd?.steps?.length).sort((x, y) => (y[1].at || 0) - (x[1].at || 0)).slice(0, 6);
        if (cont.length) {
          const cg = el('section', 'grp'); cg.append(el('h2', 'grp-t', T('Continue')));
          const strip = el('div', 'hub-cont');
          for (const [id, gd] of cont) {
            const meta = svcById(id);
            const b = btn('hub-cc', '', () => openScreen('service', { id })); const ic = el('span', 'hub-cc-ic'); ic.append(ico(meta[2], 18));
            const pips = el('span', 'hub-pips'); for (let i = 0; i < Math.min(gd.steps.length, 8); i++) pips.append(el('i'));
            const tx = el('span', 'hub-cc-tx'); tx.append(el('b', '', T('Continue {service}', { service: T(meta[1]) })), el('small', '', gd.steps.length === 1 ? T('1 step done') : T('{n} steps done', { n: gd.steps.length })));
            b.append(ic, tx, pips); strip.append(b);
          }
          cg.append(strip); holder.append(cg);
        }
      }

      // tools
      if (shownTools.length) {
        const grid = el('div', 'tool-grid');
        for (const t of shownTools) {
          const b = el('button', 'tool-card' + (t.wide && !q ? ' wide' : '')); b.type = 'button';
          const c = el('span', 'tool-ic'); c.append(ico(t.icon, 24));
          b.append(c, el('b', '', t.title), el('small', '', t.sub)); if (t.v !== undefined) b.append(meterBar(t.v)); b.onclick = () => openScreen(t.screen); grid.append(b);
        }
        if (!q) { const g = el('section', 'grp'); g.append(el('h2', 'grp-t', T('Tools')), grid); holder.append(g); } else holder.append(grid);
      }
      if (guides.length) {
        const g = el('div', 'tool-guides'); g.append(el('h2', 'grp-t', T('Guides')));
        const box = el('div', 'guide-tiles');
        for (const [id, name, ic] of guides) { const c = btn('gtile', '', () => openScreen('service', { id })); const d = el('span', 'gtile-ic'); d.append(ico(ic, 22)); c.append(d, el('span', 'gtile-n', T(name))); box.append(c); }
        g.append(box); holder.append(g);
      }
      if (q && !shownTools.length && !guides.length) holder.append(empty('search', T('Nothing found'), T('Try another word.')));
    };
    si.oninput = draw;
    draw();
    const r = await tcall('summary');
    if (r.ok) { sum = { ...sum, ...r.data }; }
    loaded = true; draw();
  };

  // ---- scan ------------------------------------------------------------------------------------------------
  async function shrink(file, max = 1600) {
    if (!file.type.startsWith('image/')) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (k === 1 && file.size < 1.2e6) return file;
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
      return blob && blob.size < file.size ? blob : file;
    } catch { return file; }
  }
  const STAGES = [N('Checking the photo is sharp'), N('Reading the text'), N('Finding names and dates'), N('Almost done')];

  S.scan = () => {
    const col = frame(T('Scan a document'), T('Take a photo or upload a PDF. Saathi checks it and pulls out the details.'));
    const stage = el('div', 'scan-stage');
    for (const c of ['tl', 'tr', 'bl', 'br']) stage.append(el('i', 'scan-c ' + c));
    const view = el('div', 'scan-view'); stage.append(view);
    const grid = el('div', 'scan-grid'); const beam = el('div', 'scan-beam'); stage.append(grid, beam);
    const hud = el('div', 'scan-hud'); const hudDot = el('i'); const hudTx = el('span'); const hudBar = el('b'); const hudFill = el('u'); hudBar.append(hudFill); hud.append(hudDot, hudTx, hudBar); stage.append(hud);
    const out = el('div', 'scan-out');
    const file = el('input'); file.type = 'file'; file.accept = 'image/*,application/pdf'; file.hidden = true;
    const cam = el('input'); cam.type = 'file'; cam.accept = 'image/*'; cam.setAttribute('capture', 'environment'); cam.hidden = true;
    const acts = el('div', 'two');
    const bCam = btn('btn pri xl', '', () => cam.click()); bCam.append(ico('camera', 20), el('span', '', T('Take a photo')));
    const bFile = btn('btn xl', '', () => file.click()); bFile.append(ico('doc', 20), el('span', '', T('Choose photo or PDF')));
    acts.append(bCam, bFile);
    const p = C.prices;
    const cost = el('p', 'mut small center', p ? T('Free with a pack. Otherwise {price} per scan, only if it reads.', { price: rupee(p.scanPaise) }) : '');
    col.append(stage, out, acts, cost, file, cam);
    col.append(note(T('An AI reads the photo. It is used once and never saved. Your ID numbers go to your locker only if you choose.'), 'lock'));

    let url = null; let timer = null; let running = false;
    const idle = () => {
      clearInterval(timer); if (url) { URL.revokeObjectURL(url); url = null; }
      stage.className = 'scan-stage'; view.replaceChildren(); out.replaceChildren(); acts.hidden = false; cost.hidden = false;
      const c = el('div', 'scan-idle'); const ic = el('span', 'scan-idle-ic'); ic.append(ico('scan', 34));
      c.append(ic, el('b', '', T('Place your document flat')), el('small', '', T('Good light, all four corners in view')));
      view.append(c);
    };
    const setStage = (i) => { hudTx.textContent = T(STAGES[Math.min(i, STAGES.length - 1)]); hudFill.style.setProperty('--w', Math.min(0.94, (i + 1) / STAGES.length) * 100 + '%'); };
    function scanning(blob, isPdf) {
      view.replaceChildren();
      if (isPdf) { const c = el('div', 'scan-idle'); const ic = el('span', 'scan-idle-ic'); ic.append(ico('doc', 34)); c.append(ic, el('b', '', T('PDF document'))); view.append(c); }
      else { url = URL.createObjectURL(blob); const im = el('img'); im.src = url; im.alt = ''; view.append(im); }
      stage.className = 'scan-stage scanning'; acts.hidden = true; cost.hidden = true; out.replaceChildren();
      let i = 0; setStage(0); timer = setInterval(() => setStage(++i), 1700);
    }
    const finishStage = (ok) => { clearInterval(timer); stage.classList.remove('scanning'); stage.classList.add(ok ? 'done' : 'failed'); hudTx.textContent = ok ? T('Done') : T('Could not read it'); hudFill.style.setProperty('--w', '100%'); };
    async function askConsent() {
      if (store.get('saathi.scanOk') === '1') return true;
      return new Promise((resolve) => showDialog({
        title: T('Let Saathi read this?'), body: T('An AI reads your photo to find the details. It is used once and not saved. Do not scan anything you would not want a third party to see.'),
        actions: [btn('btn', T('Cancel'), () => { closeDialog(); resolve(false); }), btn('btn pri', T('Yes, read it'), () => { store.set('saathi.scanOk', '1'); closeDialog(); resolve(true); })],
      }));
    }
    async function go(f) {
      if (!f || running) return;
      if (!(f.type.startsWith('image/') || f.type === 'application/pdf')) return toast(T('Pick a photo or a PDF.'));
      if (!(await askConsent())) return;
      running = true;
      const isPdf = f.type === 'application/pdf';
      const blob = await shrink(f);
      scanning(blob, isPdf);
      const t0 = Date.now();
      const up = await api('/app/api/upload', { method: 'POST', headers: { 'content-type': blob.type || f.type }, body: blob }).catch(() => ({ ok: false, j: {} }));
      let r = up.ok ? await tcall('scan', { mediaId: up.j.mediaId, consent: true }) : { ok: false, error: up.status === 413 ? 'too_big' : 'network', extra: {} };
      const wait = 2400 - (Date.now() - t0); if (wait > 0) await new Promise((x) => setTimeout(x, wait));
      running = false;
      if (!r.ok) {
        finishStage(false);
        if (r.error === 'paywall') { paywall(r.extra); }
        const msg = r.error === 'unclear' ? T('That photo is not clear enough to read.') : r.error === 'nofields' ? T('I could not find any details on it.') : r.error === 'busy' || r.error === 'off' ? T('Scanning is busy right now. Please try again in a little while.') : r.error === 'too_big' ? T('That file is too big. Use one under 5 MB.') : r.error === 'failed' ? T('Something went wrong reading it. You were not charged.') : errText(r.error);
        const card = el('div', 'scan-res bad'); card.append(el('h3', '', T('Could not read it')), el('p', 'mut', msg));
        const tips = r.extra?.issues?.length ? el('p', 'mut small', r.extra.issues.join(', ')) : null; if (tips) card.append(tips);
        card.append(el('p', 'mut small', T('Tips: flat surface, no glare, all corners visible.')), btn('btn pri', T('Try again'), idle));
        out.replaceChildren(card); return;
      }
      finishStage(true); showResult(r.data);
    }
    function showResult(d) {
      const card = el('div', 'scan-res');
      const head = el('div', 'res-head'); const ck = el('span', 'res-ck'); ck.append(ico('check', 18));
      const tx = el('div'); tx.append(el('h3', '', d.type ? typeName(d.type) : T(d.typeName)), el('small', '', d.issues.length ? T('Readable, but: {list}', { list: d.issues.join(', ') }) : T('Readable and clear')));
      head.append(ck, tx); card.append(head);
      const list = el('div', 'res-fields');
      let i = 0;
      const add = (label, value) => { const r = el('div', 'res-f'); r.style.setProperty('--i', String(i++)); r.append(el('span', '', label), el('b', '', value)); list.append(r); };
      for (const f of d.fields) add(f.label ? T(f.label.en) : f.key, f.value);
      if (d.locker?.masked) add(T('Number'), d.locker.masked);
      if (d.locker?.expiry) add(T('Expires'), fmtIso(d.locker.expiry) + (d.locker.left !== null ? ' · ' + whenText(d.locker.left).toLowerCase() : ''));
      card.append(list);
      const a = el('div', 'res-acts');
      const saveTo = async (what, b) => {
        await busyBtn(b, async () => {
          const r = await tcall('scan.save', { scanId: d.scanId, locker: what === 'locker' || what === 'both', details: what === 'details' || what === 'both' });
          if (!r.ok) return toast(errText(r.error));
          toast(T('Saved')); b.textContent = T('Saved'); b.disabled = true; b.prepend(ico('check', 16));
        });
      };
      if (d.locker && d.fields.length) { const b = btn('btn pri', T('Save to locker and details'), () => saveTo('both', b)); a.append(b); }
      else if (d.locker) { const b = btn('btn pri', T('Save to my locker'), () => saveTo('locker', b)); a.append(b); }
      else if (d.fields.length) { const b = btn('btn pri', T('Save to my details'), () => saveTo('details', b)); a.append(b); }
      a.append(btn('btn', T('Scan another'), idle)); card.append(a);
      if (d.locker?.expiry && d.locker.left >= 0) card.append(el('p', 'mut small', T('Tip: after saving, set a reminder for the expiry date in Reminders.')));
      out.replaceChildren(card);
    }
    file.onchange = () => { const f = file.files[0]; file.value = ''; go(f); };
    cam.onchange = () => { const f = cam.files[0]; cam.value = ''; go(f); };
    idle();
    return () => { clearInterval(timer); if (url) URL.revokeObjectURL(url); };
  };

  // ---- locker ----------------------------------------------------------------------------------------------
  const RENEW = { driving_licence: 'dl', passport: 'passport', aadhaar: 'aadhaar', voter_id: 'voter', pan: 'pan', gst: 'gst' };
  const renewId = (type) => { const id = type === 'pan' && svcById('pan_fix') ? 'pan_fix' : RENEW[type]; return id && svcById(id) ? id : null; };
  const lkTone = (n) => (n < 0 ? 'bad' : n <= 60 ? 'warn' : 'ok');
  const FORMAT_HINT = {
    pan: N('5 letters, 4 digits, 1 letter. For example ABCPE1234F.'), aadhaar: N('12 digits, starting with 2 to 9. Spaces are fine.'),
    driving_licence: N('State code, RTO number, then the rest. For example MH12 20110012345.'), passport: N('1 letter then 7 digits. For example A1234567.'),
    voter_id: N('3 letters then 7 digits. For example ABC1234567.'), gst: N('15 characters. For example 22AAAAA0000A1Z5.'),
  };

  S.locker = async () => {
    const col = frame(T('My locker'), T('Keep the numbers and expiry dates of your IDs. Numbers stay hidden until you tap the eye.'));
    col.classList.add('wide-col');
    const holder = el('div', 'lk-wrap'); col.append(holder);
    let types = []; let docs = [];
    const timers = {};
    const draw = () => {
      holder.replaceChildren();
      // completeness
      const have = new Set(docs.map((d) => d.type));
      const cm = el('section', 'lk2-comp');
      const top = el('div', 'lk2-comp-t'); top.append(el('b', '', T('Saved {n} of {total}', { n: have.size, total: types.length || 6 })), el('small', 'mut', have.size === (types.length || 6) ? T('Everything saved') : T('Tap one to add it')));
      cm.append(top, meterBar(have.size / (types.length || 6)));
      const chips = el('div', 'lk2-chips');
      for (const t of types) {
        const on = have.has(t.type);
        const b = btn('lk2-chip' + (on ? ' on' : ''), '', () => openAdd(t.type)); b.setAttribute('aria-label', typeName(t.type) + ': ' + (on ? T('Saved') : T('Not saved')));
        b.append(ico(on ? 'check' : 'plus', 14), el('span', '', typeName(t.type))); chips.append(b);
      }
      cm.append(chips); holder.append(cm);
      const acts = el('div', 'lk2-acts');
      acts.append(btn('btn pri xl', T('Add a document'), () => openAdd()), btn('btn xl', T('Scan one'), () => openScreen('scan')));
      holder.append(acts);
      if (!docs.length) holder.append(empty('lock', T('Nothing saved yet'), T('Add your PAN, licence or passport. Saathi shows what is about to expire.')));
      const grid = el('div', 'lk2-grid'); for (const d of docs) grid.append(card(d)); holder.append(grid);
      const ul = el('ul', 'incl');
      for (const t of [T('Encrypted before it is saved'), T('Hidden until you tap the eye, and hidden again after 20 seconds'), T('Never shown in a chat, never sent to the AI'), T('Delete any document, or everything, at any time')]) { const li = el('li'); li.append(ico('check', 16), el('span', '', t)); ul.append(li); }
      holder.append(group(T('How it stays safe'), ul));
    };
    function card(d) {
      const c = el('article', 'lk-card');
      const head = el('div', 'lk-head'); const ic = el('span', 'lk-ic'); ic.append(ico(TYPE_ICON[d.type] || 'doc', 22));
      const tt = el('div', 'lk-t'); tt.append(el('b', '', typeName(d.type)));
      const num = el('div', 'lk-num', d.hasNumber ? d.masked : T('No number saved')); tt.append(num);
      head.append(ic, tt);
      const eye = btn('icon-btn lk-eye', '', null); eye.setAttribute('aria-label', T('Show number')); eye.append(ico('eye', 20));
      if (d.hasNumber) head.append(eye);
      c.append(head);
      if (d.expiry) {
        const tone = lkTone(d.left);
        const chip = el('div', 'lk2-exp ' + tone);
        const l = el('span', 'lk2-exp-l'); l.append(ico('calendar', 15), el('span', '', T('Expires {date}', { date: fmtIso(d.expiry) })));
        const r = el('span', 'lk2-exp-r'); r.append(el('b', '', tone === 'bad' ? T('Expired') : tone === 'warn' ? T('Expiring soon') : T('Valid')), el('small', '', whenText(d.left)));
        chip.append(l, r); c.append(chip);
      }
      const acts = el('div', 'lk-acts');
      const cp = btn('btn sm', T('Copy'), null); cp.hidden = true; acts.append(cp);
      const rid = d.expiry ? renewId(d.type) : null;
      if (rid) acts.append(btn('btn sm' + (d.left <= 60 ? ' pri' : ''), T('Renew'), () => openScreen('service', { id: rid })));
      if (d.expiry && d.left >= 0) acts.append(btn('btn sm', T('Remind me'), async function () {
        await busyBtn(this, async () => {
          const r = await tcall('reminders.add', { label: T('{doc} expires', { doc: typeName(d.type) }), due: d.expiry });
          toast(r.ok ? T('Reminder set') : errText(r.error));
        });
      }));
      acts.append(btn('btn sm', T('Edit'), () => openAdd(d.type)));
      acts.append(btn('btn sm danger', T('Delete'), () => showDialog({
        title: T('Delete this document?'), body: T('{doc} will be removed from your locker.', { doc: typeName(d.type) }),
        actions: [btn('btn', T('Cancel'), closeDialog), btn('btn danger', T('Delete'), async () => { closeDialog(); const r = await tcall('locker.remove', { type: d.type }); if (r.ok) { docs = r.data.docs; draw(); } else toast(errText(r.error)); })],
      })));
      c.append(acts);
      let shown = false; let copy = '';
      const hide = () => { clearTimeout(timers[d.type]); shown = false; num.textContent = d.masked; num.classList.remove('open'); cp.hidden = true; copy = ''; eye.replaceChildren(ico('eye', 20)); eye.setAttribute('aria-label', T('Show number')); };
      eye.onclick = async () => {
        if (shown) return hide();
        const r = await tcall('locker.reveal', { type: d.type });
        if (!r.ok) return toast(errText(r.error));
        shown = true; copy = r.data.copy; num.textContent = r.data.number; num.classList.add('open'); cp.hidden = false;
        eye.replaceChildren(ico('eyeoff', 20)); eye.setAttribute('aria-label', T('Hide number'));
        timers[d.type] = setTimeout(hide, 20000);
      };
      cp.onclick = () => C.copyText(copy, cp);
      return c;
    }
    function openAdd(pre) {
      const sel = C.dropdown({ label: T('Document type'), options: types.map((t) => [t.type, typeName(t.type)]), value: pre && types.some((t) => t.type === pre) ? pre : undefined });
      const num = textInput('', '', 'text'); num.autocapitalize = 'characters'; num.setAttribute('aria-label', T('Number'));
      const exp = el('input', 'field-i'); exp.type = 'date';
      const expF = field(T('Expiry date'), exp);
      const PH = { pan: 'ABCPE1234F', aadhaar: '2345 6789 0123', driving_licence: 'MH12 20110012345', passport: 'A1234567', voter_id: 'ABC1234567', gst: '22AAAAA0000A1Z5' };
      const fb = el('div', 'lk2-fb'); fb.setAttribute('aria-live', 'polite');
      const fbMsg = el('span', 'lk2-fb-m'); const fbHint = el('small', 'fld-h'); fb.append(fbMsg, fbHint);
      let seq = 0; let timer = null; let blurred = false;
      const paint = (state, msg) => { fb.className = 'lk2-fb ' + state; fbMsg.replaceChildren(); if (msg) { fbMsg.append(ico(state === 'ok' ? 'check' : 'warn', 14), el('span', '', msg)); } };
      const check = () => {
        clearTimeout(timer); const my = ++seq;
        fbHint.textContent = FORMAT_HINT[sel.value] ? T(FORMAT_HINT[sel.value]) : '';
        if (!num.value.trim()) return paint('idle', '');
        timer = setTimeout(async () => {
          const r = await tcall('locker.check', { type: sel.value, number: num.value });
          if (my !== seq) return;
          if (r.ok && r.data.ok) paint('ok', T('Looks right: {pretty}', { pretty: r.data.pretty }));
          else paint(blurred ? 'bad' : 'typing', blurred ? T('This does not look like a valid number yet.') : T('Keep typing. Checking as you go.'));
        }, 250);
      };
      const sync = () => { const t = types.find((x) => x.type === sel.value); num.placeholder = PH[sel.value] || ''; expF.hidden = !t?.expiry; blurred = false; check(); };
      sel.onchange = sync; num.oninput = () => { blurred = false; check(); }; num.onblur = () => { blurred = true; if (num.value.trim()) check(); };
      const er = errBox();
      const content = el('div', 'sheet-form'); content.append(field(T('Document'), sel), field(T('Number'), num), fb, expF, er);
      sync();
      const save = btn('btn pri', T('Save'), () => busyBtn(save, async () => {
        er.hide();
        const r = await tcall('locker.add', { type: sel.value, number: num.value, expiry: expF.hidden ? '' : exp.value });
        if (!r.ok) { blurred = true; check(); return er.show(errText(r.error)); }
        docs = r.data.docs; closeDialog(); draw(); toast(T('Saved'));
      }));
      showDialog({ title: T('Add a document'), body: '', content, actions: [btn('btn', T('Cancel'), closeDialog), save] });
    }
    const r = await tcall('locker.list'); if (r.ok) { docs = r.data.docs; types = r.data.types; }
    draw();
    return () => Object.values(timers).forEach(clearTimeout);
  };

  // ---- my details ---------------------------------------------------------------------------------------------
  const SECTIONS = () => [
    [T('Identity'), 'user', ['full_name', 'dob', 'gender']], [T('Family'), 'people', ['father_name', 'mother_name']],
    [T('Contact'), 'phone', ['mobile', 'email']], [T('Address'), 'card', ['address', 'city', 'state', 'pincode']],
  ];

  S.details = async () => {
    const col = frame(T('My details'), T('What forms keep asking for. Saved once, ready to copy any time.'));
    col.classList.add('wide-col');
    const holder = el('div', 'dt-wrap'); col.append(holder);
    const r = await tcall('details.get');
    if (!r.ok) { holder.append(empty('user', T('Could not load'), errText(r.error))); return; }
    let data = r.data; let ready = {};
    const inputs = {};
    const liveText = (f) => { const v = inputs[f.key]?.value ?? f.value; return f.type === 'choice' ? (f.options.find((o) => o.id === v) ? optionLabel(f.options.find((o) => o.id === v)) : '') : String(v || '').trim(); };
    const loadReady = async () => { const rr = await tcall('details.readiness'); if (rr.ok) { ready = rr.data; drawReady(); } };
    const readyBox = el('div', 'dt-ready-box');
    function drawReady() {
      readyBox.replaceChildren();
      const list = U.SERVICES.filter(([id]) => ready[id]);
      if (!list.length) return;
      const g = el('section', 'grp'); g.append(el('h2', 'grp-t', T('Ready for')));
      const box = el('div', 'grp-box dt-ready');
      for (const [id, name, ic] of list) {
        const x = ready[id]; const full = x.have === x.total;
        const right = el('span', 'dt-rd'); right.append(el('span', 'tag' + (full ? ' on' : ''), T('{n}/{total}', { n: x.have, total: x.total })));
        const b = row({ icon: ic, title: T(name), sub: full ? T('Everything this guide asks for is saved') : T('Missing: {list}', { list: x.missing.map((k) => { const f = data.fields.find((y) => y.key === k); return f ? fieldLabel(f).replace(/ \(.*\)$/, '') : k; }).join(', ') }), right, onclick: () => openScreen('service', { id }) });
        box.append(b);
      }
      g.append(box); readyBox.append(g);
    }
    const draw = () => {
      holder.replaceChildren();
      const meter = el('div', 'dt-meter'); const head = el('div', 'grp-h'); head.append(el('b', '', T('{filled} of {total} filled', data)), el('small', 'mut', Math.round((data.filled / data.total) * 100) + '%'));
      meter.append(head, meterBar(data.filled / data.total)); holder.append(meter);
      holder.append(readyBox); drawReady();
      const form = el('form', 'dt-form'); form.noValidate = true;
      const byKey = Object.fromEntries(data.fields.map((f) => [f.key, f]));
      const seen = new Set();
      const mk = (f) => {
        seen.add(f.key);
        let inp;
        if (f.type === 'choice') {
          inp = el('div', 'seg'); inp.setAttribute('role', 'group'); inp.value = f.value;
          for (const o of f.options) { const b = btn('', optionLabel(o), null); b.setAttribute('aria-pressed', String(f.value === o.id)); b.onclick = () => { inp.value = inp.value === o.id ? '' : o.id; for (const x of inp.children) x.setAttribute('aria-pressed', 'false'); if (inp.value) b.setAttribute('aria-pressed', 'true'); }; inp.append(b); }
        } else if (f.type === 'longtext') { inp = el('textarea', 'field-i'); inp.rows = 3; inp.value = f.value; }
        else if (f.key === 'state') { inp = C.dropdown({ label: fieldLabel(f), search: true, placeholder: T('Choose your state'), options: (U.STATE_LIST || []).map((n) => [n, n]), value: f.value || '' }); }
        else { inp = el('input', 'field-i'); inp.type = 'text'; inp.value = f.value; inp.autocomplete = 'off'; inp.spellcheck = false; if (f.type === 'phone' || f.type === 'pin') inp.inputMode = 'numeric'; if (f.type === 'email') inp.inputMode = 'email'; if (f.type === 'date') inp.placeholder = 'DD/MM/YYYY'; }
        inputs[f.key] = inp;
        const wrap = el('div', 'fld dt-f'); const lab = el('div', 'fld-row'); lab.append(el('span', 'fld-l', fieldLabel(f)));
        const cp = btn('link-btn', T('Copy'), null); cp.onclick = () => { const t = liveText(f); if (t) C.copyText(t, cp); else toast(T('Nothing to copy yet.')); }; lab.append(cp);
        wrap.append(lab, inp); wrap.dataset.key = f.key; return wrap;
      };
      for (const [title, icon, keys] of SECTIONS()) {
        const fs = keys.map((k) => byKey[k]).filter(Boolean); if (!fs.length) continue;
        const sec = el('section', 'dt-sec'); const sh = el('div', 'dt-sec-h'); const ic = el('span', 'dt-sec-ic'); ic.append(ico(icon, 16));
        sh.append(ic, el('h2', '', title), el('small', 'mut', T('{n}/{total}', { n: fs.filter((f) => f.value).length, total: fs.length })));
        const grid = el('div', 'dt-grid'); for (const f of fs) { const w = mk(f); if (f.type === 'longtext') w.classList.add('full'); grid.append(w); }
        sec.append(sh, grid); form.append(sec);
      }
      const rest = data.fields.filter((f) => !seen.has(f.key)); if (rest.length) { const sec = el('section', 'dt-sec'); const grid = el('div', 'dt-grid'); for (const f of rest) grid.append(mk(f)); sec.append(grid); form.append(sec); }
      const er = errBox();
      const save = btn('btn pri xl', T('Save details'), null); save.type = 'submit';
      form.append(er, save);
      form.onsubmit = (e) => { e.preventDefault(); busyBtn(save, async () => {
        er.hide();
        const values = {}; for (const f of data.fields) values[f.key] = inputs[f.key].value ?? '';
        const rr = await tcall('details.set', { values });
        if (!rr.ok) return er.show(errText(rr.error));
        data = rr.data;
        if (rr.data.bad?.length) { draw(); loadReady(); for (const k of rr.data.bad) holder.querySelector(`[data-key="${k}"]`)?.classList.add('bad'); return holder.querySelector('.bad') && toast(T('Some fields do not look right. Check the marked ones.')); }
        draw(); loadReady(); toast(T('Saved'));
      }); };
      holder.append(form);
      holder.append(note(T('Stored encrypted. Never sent to the AI. Delete it any time in Settings.'), 'lock'));
    };
    draw(); loadReady();
  };

  // ---- reminders ---------------------------------------------------------------------------------------------
  const nextFixed = (m, d) => { const t = todayIso(); let y = Number(t.slice(0, 4)); let iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; if (iso < t) iso = `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return iso; };
  const nextYearIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y + 1, m - 1, d)); if (t.getUTCMonth() !== m - 1) t.setUTCDate(0); return t.toISOString().slice(0, 10); };
  const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  /** An all-day calendar event with an alert 7 days before. */
  function downloadIcs(r) {
    try {
      const ymd = (iso) => iso.replace(/-/g, '');
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Saathi//Reminders//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
        `UID:${r.id}@saathi`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(r.due)}`, `DTEND;VALUE=DATE:${ymd(addDaysIso(r.due, 1))}`, `SUMMARY:${icsText(r.label)}`];
      if (r.note) lines.push(`DESCRIPTION:${icsText(r.note)}`);
      if (r.repeat === 'yearly') lines.push('RRULE:FREQ=YEARLY');
      lines.push('BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(r.label)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
      const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = (r.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reminder') + '.ics';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(T('Calendar file saved'));
    } catch { toast(T('Could not make the calendar file.')); }
  }
  const switchRow = (label, checked) => {
    const w = el('label', 'rm-sw'); const i = el('input'); i.type = 'checkbox'; i.checked = checked; const tr = el('span', 'rm-sw-tr'); tr.append(el('i'));
    w.append(i, tr, el('span', 'rm-sw-l', label)); w.input = i; return w;
  };

  S.reminders = async () => {
    const col = frame(T('Reminders'), T('Add a date you cannot afford to miss. It shows here.'));
    col.classList.add('wide-col');
    const holder = el('div', 'rm-wrap'); col.append(holder);
    let st = { items: [], wa: false, max: 12 }; let docs = [];
    let openId = null; let addOpen = null;
    const PRESETS = () => [
      { name: T('Licence renewal'), repeat: false }, { name: T('Passport renewal'), repeat: false }, { name: T('PAN-Aadhaar link check'), repeat: false },
      { name: T('ITR filing (31 July)'), label: T('ITR filing'), due: nextFixed(7, 31), repeat: true, hint: T('ITR filing is due 31 July each year for most people.') },
      { name: T('Insurance renewal'), repeat: true }, { name: T('Vehicle PUC'), repeat: true }, { name: T('Voter ID check'), repeat: false },
    ];
    const apply = async (p, done) => { const r = await p; if (!r.ok) return toast(errText(r.error)); st = r.data; draw(); if (done) toast(done); };

    const addCard = () => {
      const c = el('section', 'rm-new');
      const open = addOpen === null ? !st.items.length : addOpen;
      const head = el('button', 'rm-new-h'); head.type = 'button'; head.setAttribute('aria-expanded', String(open));
      const ic = el('span', 'rm-new-ic'); ic.append(ico('plus', 20));
      head.append(ic, el('b', '', T('Add a reminder')), el('span', 'sp'));
      const chev = ico('chev', 18); chev.classList.add('rm-chev'); head.append(chev); c.classList.toggle('open', open);
      head.onclick = () => { addOpen = !open; draw(); };
      c.append(head);
      if (!open) return c;
      const form = el('form', 'rm-form'); form.noValidate = true;
      const label = textInput(T('What is it? (for example, Licence renewal)')); label.maxLength = 40; label.setAttribute('aria-label', T('Reminder name'));
      const due = el('input', 'field-i'); due.type = 'date'; due.min = todayIso(); due.setAttribute('aria-label', T('Date'));
      const nt = textInput(T('Note (optional)')); nt.maxLength = 120; nt.setAttribute('aria-label', T('Note'));
      const yr = switchRow(T('Repeat every year'), false);
      const chips = el('div', 'chipbox rm-presets');
      const hint = el('small', 'fld-h', '');
      for (const p of PRESETS()) chips.append(btn('gchip', p.name, () => { label.value = p.label || p.name; if (p.due) due.value = p.due; yr.input.checked = Boolean(p.repeat); hint.textContent = p.hint || ''; (p.due ? nt : due).focus(); }));
      const er = errBox();
      const go = btn('btn pri xl', T('Add reminder'), null); go.type = 'submit';
      const dl = field(T('Date'), due);
      form.append(el('span', 'fld-l', T('Quick start')), chips, field(T('Name'), label), dl, hint, field(T('Note'), nt), yr,
        el('p', 'rm-explain', T('Saathi counts down to this date and shows it here.')), er, go);
      form.onsubmit = (e) => { e.preventDefault(); busyBtn(go, async () => {
        er.hide();
        const r = await tcall('reminders.add', { label: label.value, due: due.value, note: nt.value, repeat: yr.input.checked ? 'yearly' : '' });
        if (!r.ok) return er.show(errText(r.error));
        st = r.data; addOpen = false; draw(); toast(T('Reminder set'));
      }); };
      c.append(form);
      return c;
    };

    const itemCard = (r) => {
      const open = openId === r.id;
      const w = el('div', 'rm-item' + (open ? ' open' : '') + (r.left < 0 ? ' late' : ''));
      const head = el('button', 'rm-head'); head.type = 'button'; head.setAttribute('aria-expanded', String(open));
      const ic = el('span', 'rm-ic'); ic.append(ico(r.repeat ? 'refresh' : 'bell', 18));
      const tx = el('span', 'rm-tx'); tx.append(el('b', '', r.label), el('small', '', fmtIso(r.due) + (r.note ? ' · ' + r.note : '')));
      const right = el('span', 'rm-right'); right.append(el('span', 'tag ' + (r.left < 0 ? 'bad' : r.left <= 7 ? 'warn' : ''), whenText(r.left)));
      if (r.repeat) right.append(el('span', 'tag', T('Yearly')));
      const chev = ico('chev', 18); chev.classList.add('rm-chev'); right.append(chev);
      head.append(ic, tx, right);
      head.onclick = () => {
        if (!open) { openId = r.id; draw(); return; }
        // Close with motion: play the exit, then redraw the list with nothing open.
        w.classList.add('closing');
        setTimeout(() => { if (openId === r.id) { openId = null; draw(); } }, 200);
      };
      w.append(head);
      if (!open) return w;
      const body = el('div', 'rm-body');
      const label = textInput('', r.label); label.maxLength = 40;
      const due = el('input', 'field-i'); due.type = 'date'; due.value = r.due;
      const nt = textInput(T('Note (optional)'), r.note || ''); nt.maxLength = 120;
      const yr = switchRow(T('Repeat every year'), Boolean(r.repeat));
      const er = errBox();
      const two = el('div', 'two'); two.append(field(T('Name'), label), field(T('Date'), due));
      body.append(two, field(T('Note'), nt), yr);
      const acts = el('div', 'rm-acts');
      const done = btn('btn pri sm', r.repeat ? T('Done, remind me next year') : T('Mark done'), () => busyBtn(done, () => apply(tcall('reminders.done', { id: r.id }), r.repeat ? T('Moved to next year') : T('Done'))));
      const save = btn('btn sm', T('Save changes'), () => busyBtn(save, async () => {
        er.hide();
        const rr = await tcall('reminders.update', { id: r.id, label: label.value, due: due.value, note: nt.value, repeat: yr.input.checked ? 'yearly' : '' });
        if (!rr.ok) return er.show(errText(rr.error));
        st = rr.data; draw(); toast(T('Saved'));
      }));
      const cal = btn('btn sm', '', () => downloadIcs(r)); cal.append(ico('calendar', 15), el('span', '', T('Add to calendar')));
      const del = btn('btn sm danger', T('Delete'), () => showDialog({ title: T('Remove this reminder?'), body: r.label, actions: [btn('btn', T('Cancel'), closeDialog), btn('btn danger', T('Remove'), async () => { closeDialog(); openId = null; apply(tcall('reminders.remove', { id: r.id })); })] }));
      acts.append(done, save, cal, del);
      body.append(er, acts);
      if (r.repeat) body.append(el('small', 'mut', T('Marking it done moves it to {date}.', { date: fmtIso(nextYearIso(r.due)) })));
      w.append(body);
      return w;
    };

    const draw = () => {
      holder.replaceChildren();
      holder.append(addCard());
      const sug = docs.filter((d) => d.expiry && d.left >= 0 && !st.items.some((r) => r.label === T('{doc} expires', { doc: typeName(d.type) })));
      if (sug.length) {
        const box = el('div', 'chipbox');
        for (const d of sug) box.append(btn('gchip', T('{doc} expires {date}', { doc: typeName(d.type), date: fmtIso(d.expiry) }), () => apply(tcall('reminders.add', { label: T('{doc} expires', { doc: typeName(d.type) }), due: d.expiry }), T('Reminder set'))));
        const g = el('section', 'grp'); g.append(el('h2', 'grp-t', T('From your locker')), box); holder.append(g);
      }
      if (!st.items.length) holder.append(empty('bell', T('No reminders yet'), T('Nothing is coming up.')));
      else {
        const groups = [[T('Overdue'), (r) => r.left < 0], [T('This week'), (r) => r.left >= 0 && r.left <= 7], [T('This month'), (r) => r.left > 7 && r.left <= 31], [T('Later'), (r) => r.left > 31]];
        for (const [name, fn] of groups) {
          const list = st.items.filter(fn); if (!list.length) continue;
          const g = el('section', 'grp'); const h = el('div', 'grp-h'); h.append(el('h2', 'grp-t', name), el('small', 'mut', String(list.length)));
          const box = el('div', 'rm-list'); for (const r of list) box.append(itemCard(r));
          g.append(h, box); holder.append(g);
        }
      }
      const nb = el('section', 'rm-notice');
      nb.append(el('b', '', T('How you get notified')));
      const pills = el('div', 'rm-pills'); for (const t of [T('30 days before'), T('7 days before'), T('On the day')]) pills.append(el('span', 'rm-pill', t)); nb.append(pills);
      holder.append(nb);
      if (st.wa) holder.append(note(T('Reminders also arrive on your WhatsApp: 30 days before, 7 days before and on the day.'), 'wa'));
      else if (C.cfg?.link && C.cfg?.whatsapp) { const n = note(T('Get these on WhatsApp too. Connect your phone in Devices and sync.'), 'wa'); n.classList.add('tap'); n.onclick = () => openScreen('devices'); holder.append(n); }
    };
    const [a, b] = await Promise.all([tcall('reminders.list'), tcall('locker.list')]);
    if (a.ok) st = a.data; if (b.ok) docs = b.data.docs;
    draw();
  };

  // ---- applications -----------------------------------------------------------------------------------------------
  const STATUS = [['preparing', N('Preparing')], ['applied', N('Applied')], ['waiting', N('Waiting')], ['done', N('Done')]];
  const statusName = (s) => T((STATUS.find((x) => x[0] === s) || STATUS[0])[1]);
  const statusIdx = (s) => Math.max(0, STATUS.findIndex((x) => x[0] === s));
  const lastExtras = { apps: [], checks: {}, prefs: {}, loaded: false };
  async function loadExtras() { const r = await tcall('extras.get'); if (r.ok) { Object.assign(lastExtras, r.data, { loaded: true }); } return lastExtras; }
  async function saveExtras(patch) { const r = await tcall('extras.set', patch); if (r.ok) Object.assign(lastExtras, r.data); return r; }

  // A short, generic "what to do now" line for each stage. Some services have their own line.
  const HINT_DEFAULT = { preparing: N('Gather your documents and check that your details match them exactly.'), applied: N('Keep your reference number. Most portals let you check status with it.'), waiting: N('Check the status every few days. If nothing changes for a couple of weeks, contact the helpline or office.'), done: N('Keep the final document or receipt safe, and save its number in your locker.') };
  const HINT_SVC = {
    pan: { preparing: N('Keep your Aadhaar and a photo ready. Your name should match Aadhaar exactly.'), applied: N('Keep the acknowledgement number. The official site lets you track a PAN application with it.') },
    aadhaar: { preparing: N('Keep your proof of identity and proof of address ready.'), applied: N('Keep the update request number (URN). You can check the update status with it.') },
    dl: { preparing: N('Keep your ID, address proof and a passport-size photo ready.'), applied: N('Keep the application number. Parivahan lets you check status with it.') },
    passport: { preparing: N('Keep your original documents ready for the appointment.'), applied: N('Keep the file number. Passport Seva lets you track the application with it.') },
    voter: { preparing: N('Keep an ID proof and an address proof ready.'), applied: N('Keep the reference ID. The voter portal lets you track the form with it.') },
    gst: { preparing: N('Keep your PAN, address proof and bank details ready.'), applied: N('Keep the ARN. The GST portal lets you track the application with it.') },
  };
  const hintFor = (svc, stage) => T((HINT_SVC[svc] && HINT_SVC[svc][stage]) || HINT_DEFAULT[stage]);

  S.apps = async () => {
    const col = frame(T('Applications'), T('Keep track of what you applied for, with the reference number and where it stands.'));
    col.classList.add('wide-col');
    const holder = el('div', 'ap-wrap'); col.append(holder);
    const ex = await loadExtras(); let apps = ex.apps.slice();
    let filter = 'all';
    const persist = async () => { const r = await saveExtras({ apps }); if (!r.ok) toast(errText(r.error)); else apps = r.data.apps; return r.ok; };
    const d = await U.loadServices();
    const isDone = (a) => a.status === 'done';
    const sinceOf = (a) => (a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? -dayDiff(a.date) : null);
    const setStatus = async (a, id) => {
      if (a.status === id) return;
      a.status = id; a.hist = [...(a.hist || []), { s: id, ts: Date.now() }].slice(-8);
      await persist(); draw();
    };
    const remind = (a, b) => busyBtn(b, async () => {
      const r = await tcall('reminders.add', { label: T('Check {title}', { title: a.title }).slice(0, 40), due: addDaysIso(todayIso(), 7) });
      toast(r.ok ? T('Reminder set for 7 days from now') : errText(r.error));
    });

    function appCard(a) {
      const c = el('article', 'ap-card' + (isDone(a) ? ' fin' : ''));
      const head = el('div', 'ap-head'); const ic = el('span', 'lk-ic'); ic.append(ico((svcById(a.svc) || [0, 0, 'doc'])[2], 22));
      const tt = el('div', 'lk-t'); tt.append(el('b', '', a.title || T('Application')));
      const sub = el('div', 'ap-sub');
      if (a.ref) { const rc = btn('ap-ref', '', function () { C.copyText(a.ref, this); }); rc.setAttribute('aria-label', T('Copy reference number')); rc.append(el('span', '', T('Ref: {ref}', { ref: a.ref })), ico('copy', 14)); sub.append(rc); }
      else sub.append(el('small', 'mut', T('No reference number yet')));
      tt.append(sub); head.append(ic, tt);
      const tag = el('span', 'tag ap-pill' + (isDone(a) ? ' on' : ''), statusName(a.status)); head.append(tag);
      c.append(head);

      const idx = statusIdx(a.status);
      const tl = el('div', 'ap-tl'); tl.setAttribute('role', 'group'); tl.setAttribute('aria-label', T('Status'));
      STATUS.forEach(([id], i) => {
        const h = [...(a.hist || [])].reverse().find((x) => x.s === id);
        const b = btn('ap-stage' + (i < idx ? ' past' : '') + (i === idx ? ' cur' : ''), '', () => setStatus(a, id));
        b.setAttribute('aria-pressed', String(i === idx));
        const dot = el('span', 'ap-dot'); if (i <= idx) dot.append(ico('check', 12));
        b.append(dot, el('span', 'ap-sl', statusName(id)), el('small', 'ap-sd', h && i <= idx ? shortDate(h.ts) : ''));
        tl.append(b);
      });
      c.append(tl);

      const meta = el('div', 'ap-meta'); const since = sinceOf(a);
      if (a.date && idx > 0) meta.append(el('span', '', T('Applied {when}', { when: whenText(-since).toLowerCase() })));
      if (!isDone(a) && idx > 0 && since !== null && since > 14) meta.append(el('span', 'tag warn', T('Waiting {n} days', { n: since })));
      if (a.due && !isDone(a)) { const n = dayDiff(a.due); meta.append(el('span', n < 0 ? 'tag bad' : 'mut', T('Expected by {date}', { date: fmtIso(a.due) }) + ' · ' + whenText(n).toLowerCase())); }
      if (meta.childNodes.length) c.append(meta);

      const hint = el('div', 'ap-next'); hint.append(el('b', '', T('Next step')), el('span', '', hintFor(a.svc, a.status)));
      c.append(hint);
      if (a.note) c.append(el('p', 'mut small ap-note', a.note));

      const acts = el('div', 'lk-acts');
      const site = (d.services || []).find((s) => s.id === a.svc)?.sites?.[0];
      if (site) { const l = el('a', 'btn sm', T('Official site')); l.href = C.fixUrl(site) || site; l.target = '_blank'; l.rel = 'noopener noreferrer'; acts.append(l); }
      if (!isDone(a)) { const rb = btn('btn sm', '', () => remind(a, rb)); rb.append(ico('bell', 15), el('span', '', T('Remind me to check'))); acts.append(rb); }
      acts.append(btn('btn sm', T('Edit'), () => openForm(a)), btn('btn sm danger', T('Delete'), () => showDialog({ title: T('Delete this?'), body: a.title, actions: [btn('btn', T('Cancel'), closeDialog), btn('btn danger', T('Delete'), async () => { closeDialog(); apps = apps.filter((x) => x !== a); await persist(); draw(); })] })));
      c.append(acts);
      return c;
    }

    const draw = () => {
      holder.replaceChildren();
      const active = apps.filter((a) => !isDone(a)); const fin = apps.filter(isDone);
      holder.append(btn('btn pri xl', T('Track an application'), () => openForm()));
      if (apps.length) {
        const tabs = el('div', 'ap-tabs'); tabs.setAttribute('role', 'tablist');
        for (const [id, name, n] of [['all', T('All'), apps.length], ['active', T('Active'), active.length], ['done', T('Done'), fin.length]]) {
          const b = btn('ap-tab', '', () => { filter = id; draw(); }); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(filter === id));
          b.append(el('span', '', name), el('i', '', String(n))); tabs.append(b);
        }
        holder.append(tabs);
      }
      const list = (filter === 'active' ? active : filter === 'done' ? fin : [...active, ...fin]);
      if (!apps.length) holder.append(empty('apps', T('Nothing tracked yet'), T('Add an application to keep its reference number and status in one place.')));
      else if (!list.length) holder.append(empty('apps', T('Nothing here'), T('No applications in this list.')));
      const grid = el('div', 'ap-grid'); for (const a of list) grid.append(appCard(a)); holder.append(grid);
    };

    function openForm(a) {
      const sel = C.dropdown({ label: T('Service'), options: [...U.SERVICES, ['other', N('Something else')]].map(([id, name]) => [id, T(name)]), value: a?.svc || (S.__svc || 'pan') });
      const nameOf = (id) => (id === 'other' ? '' : T((svcById(id) || [0, ''])[1]));
      let touched = Boolean(a);
      const title = textInput(T('Name (for example, PAN correction)'), a?.title || nameOf(sel.value)); title.maxLength = 60;
      title.addEventListener('input', () => { touched = true; });
      sel.onchange = () => { if (!touched) title.value = nameOf(sel.value); };
      const ref = textInput(T('Reference or acknowledgement number'), a?.ref || ''); ref.maxLength = 40; ref.autocapitalize = 'characters';
      const refLine = el('div', 'rm-line'); const cp = btn('btn', '', function () { if (ref.value.trim()) C.copyText(ref.value.trim(), this); }); cp.setAttribute('aria-label', T('Copy reference number')); cp.append(ico('copy', 16));
      refLine.append(ref, cp);
      const date = el('input', 'field-i'); date.type = 'date'; date.value = a?.date || todayIso();
      const due = el('input', 'field-i'); due.type = 'date'; due.value = a?.due || '';
      const nt = textInput(T('Note (optional)'), a?.note || ''); nt.maxLength = 200;
      const two = el('div', 'two'); two.append(field(T('Date applied'), date), field(T('Expected by (optional)'), due));
      const content = el('div', 'sheet-form'); content.append(field(T('Service'), sel), field(T('Name'), title), field(T('Reference number'), refLine), two, field(T('Note'), nt));
      const save = btn('btn pri', T('Save'), () => busyBtn(save, async () => {
        const nm = title.value.trim() || nameOf(sel.value) || T('Application');
        const patch = { svc: sel.value, title: nm, ref: ref.value.trim(), date: date.value, due: due.value, note: nt.value.trim() };
        if (a) Object.assign(a, patch);
        else { const status = patch.ref ? 'applied' : 'preparing'; apps.unshift({ id: '', ...patch, status, hist: [{ s: status, ts: Date.now() }] }); }
        await persist(); closeDialog(); draw(); toast(T('Saved'));
      }));
      showDialog({ title: a ? T('Edit application') : T('Track an application'), body: '', content, actions: [btn('btn', T('Cancel'), closeDialog), save] });
    }
    draw();
  };

  // ---- photo resizer ---------------------------------------------------------------------------------------------------
  S.photo = () => {
    const col = frame(T('Photo resizer'), T('Make a photo or signature the size a form asks for. It never leaves your phone.'));
    const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    const stage = el('div', 'ph-stage'); const info = el('p', 'mut small center');
    const pick = btn('btn pri xl', '', () => file.click()); pick.append(ico('photo', 20), el('span', '', T('Choose a photo')));
    const sizeSeg = seg([['20', '20 KB'], ['50', '50 KB'], ['100', '100 KB'], ['200', '200 KB'], ['500', '500 KB']], '100', (v) => { kb = Number(v); });
    const dimSel = C.dropdown({ label: T('Size in pixels'), options: [['keep', T('Keep the size')], ['413x531', T('Passport photo, 3.5 × 4.5 cm')], ['512x512', T('Square, 512 × 512')], ['custom', T('Custom size')]], value: 'keep' });
    const wI = textInput('', '', 'numeric'); wI.placeholder = T('Width px'); const hI = textInput('', '', 'numeric'); hI.placeholder = T('Height px');
    const custom = el('div', 'two'); custom.append(wI, hI); custom.hidden = true;
    dimSel.onchange = () => { custom.hidden = dimSel.value !== 'custom'; };
    const out = el('div', 'ph-out');
    const go = btn('btn pri xl', T('Resize'), null); go.disabled = true;
    let kb = 100; let img = null; let name = 'photo'; let outUrl = null;
    col.append(stage, pick, file, field(T('Keep it under'), sizeSeg), field(T('Size in pixels'), dimSel), custom, go, out, info);
    col.append(note(T('Check the size and format the official form asks for. Different forms ask for different sizes.'), 'help'));
    file.onchange = async () => {
      const f = file.files[0]; file.value = ''; if (!f) return;
      try { img = await createImageBitmap(f); } catch { return toast(T('Could not open that photo. Try a JPEG or PNG.')); }
      name = f.name.replace(/\.[^.]+$/, '') || 'photo';
      stage.replaceChildren(); const im = el('img'); im.alt = ''; im.src = URL.createObjectURL(f); stage.append(im); im.onload = () => URL.revokeObjectURL(im.src);
      info.textContent = T('Original: {w} × {h}, {kb} KB', { w: img.width, h: img.height, kb: Math.round(f.size / 1024) }); go.disabled = false; out.replaceChildren();
    };
    const render = (w, h, q) => new Promise((res) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      const k = Math.max(w / img.width, h / img.height); const dw = img.width * k; const dh = img.height * k; // fill the frame, centred
      g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      c.toBlob((b) => res(b), 'image/jpeg', q);
    });
    go.onclick = () => busyBtn(go, async () => {
      if (!img) return;
      let w = img.width; let h = img.height;
      if (dimSel.value === 'custom') { w = Math.round(Number(wI.value)); h = Math.round(Number(hI.value)); if (!(w >= 50 && w <= 6000 && h >= 50 && h <= 6000)) return toast(T('Enter a width and height between 50 and 6000.')); }
      else if (dimSel.value !== 'keep') [w, h] = dimSel.value.split('x').map(Number);
      else { const k = Math.min(1, 3000 / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k); }
      const target = kb * 1024; let blob = null; let cw = w; let ch = h;
      for (let shrinkN = 0; shrinkN < 8; shrinkN++) {
        let lo = 0.3; let hi = 0.95; let best = null;
        for (let i = 0; i < 7; i++) { const q = (lo + hi) / 2; const b = await render(cw, ch, q); if (b.size <= target) { best = b; lo = q; } else hi = q; }
        if (best) { blob = best; break; }
        if (dimSel.value !== 'keep' && dimSel.value !== 'custom') { blob = await render(cw, ch, 0.3); break; } // exact size wanted: best effort
        cw = Math.round(cw * 0.85); ch = Math.round(ch * 0.85);
      }
      if (!blob) return toast(T('Could not get it that small. Try a bigger limit.'));
      if (outUrl) URL.revokeObjectURL(outUrl); outUrl = URL.createObjectURL(blob);
      const ok = blob.size <= target;
      const card = el('div', 'scan-res'); const im = el('img', 'ph-prev'); im.src = outUrl; im.alt = '';
      const a = el('a', 'btn pri xl', T('Download')); a.href = outUrl; a.download = name + '-' + kb + 'kb.jpg';
      card.append(im, el('p', ok ? 'ph-ok' : 'ph-warn', ok ? T('Done: {w} × {h}, {kb} KB', { w: cw, h: ch, kb: Math.round(blob.size / 1024) }) : T('Closest it can get: {kb} KB. Try a bigger limit or a smaller size.', { kb: Math.round(blob.size / 1024) })), a);
      out.replaceChildren(card);
    });
  };

  // ---- devices and sync -----------------------------------------------------------------------------------------------
  const codeText = (c) => c;
  S.devices = async ({ code: joinCode } = {}) => {
    const section = (title, ...kids) => { const s = el('section', 'dv-sec'); s.append(el('h2', 'grp-t', title), ...kids); return s; };
    const col = frame(T('Devices and sync'), T('Use the same Saathi on your phone and computer. Your locker, details, reminders, applications and wallet follow you.'));
    if (!C.cfg?.link) { col.append(empty('devices', T('Not available here'), T('Linking devices needs the live Saathi server.'))); return; }
    const holder = el('div', 'dv-wrap'); col.append(holder);
    let dev = { list: [], wa: false, waNumber: null };
    let issued = null; let ticker = null;
    const stopTick = () => { clearInterval(ticker); ticker = null; };
    const draw = () => {
      stopTick(); holder.replaceChildren();
      // this account's devices
      const box = el('div', 'grp-box');
      for (const d of dev.list) {
        const right = el('span', 'rm-right');
        if (d.current) right.append(el('span', 'tag on', T('This device')));
        else if (!d.main) { const x = btn('btn sm danger', T('Remove'), () => showDialog({ title: T('Remove this device?'), body: T('{label} will lose access right away. Its data here stays safe.', { label: d.label }), actions: [btn('btn', T('Cancel'), closeDialog), btn('btn danger', T('Remove'), async () => { closeDialog(); const r = await lcall('remove', { id: d.id }); if (r.ok) { dev = r.data; draw(); } else toast(errText(r.error)); })] })); right.append(x); }
        else right.append(el('span', 'tag', T('Main')));
        box.append(row({ icon: /Android|iPhone|iPad/.test(d.label || '') ? 'phone' : 'devices', title: d.label, sub: d.main ? T('Main device') : T('Linked {date}', { date: U.fmtDate(d.added) }), right }));
      }
      holder.append(section(T('Linked devices'), box));

      // add a device
      const add = el('div', 'card-i dv-add');
      add.append(el('p', 'mut', T('On the other device, open Saathi, go to Devices and enter this code. It works once and expires in 5 minutes.')));
      if (issued && issued.exp > Date.now()) {
        const cd = el('div', 'dv-code', codeText(issued.code)); const left = el('small', 'mut center'); const tick = () => { const s = Math.max(0, Math.round((issued.exp - Date.now()) / 1000)); left.textContent = T('Expires in {m}:{s}', { m: Math.floor(s / 60), s: String(s % 60).padStart(2, '0') }); if (!s) { issued = null; draw(); } };
        tick(); ticker = setInterval(tick, 1000);
        const cp = btn('btn', T('Copy code'), function () { C.copyText(issued.code, this); });
        const sh = btn('btn', T('Copy link'), function () { C.copyText(location.origin + '/app#link=' + issued.code.replace('-', ''), this); });
        const two = el('div', 'two'); two.append(cp, sh); add.append(cd, left, two);
      } else add.append(btn('btn pri xl', T('Show a code'), async function () { await busyBtn(this, async () => { const r = await lcall('new'); if (!r.ok) return toast(errText(r.error)); issued = { code: r.data.code, exp: r.data.exp }; draw(); }); }));
      holder.append(section(T('Add a device'), add));

      // enter a code
      const join = el('div', 'card-i');
      join.append(el('p', 'mut', T('Have a code from another device? Enter it here.')));
      const inp = textInput('ABCD-EFGH', joinCode || ''); inp.autocapitalize = 'characters'; inp.maxLength = 12; inp.setAttribute('aria-label', T('Code'));
      const er = errBox();
      const go = btn('btn pri', T('Link this device'), () => {
        er.hide(); if (inp.value.replace(/[^A-Za-z0-9]/g, '').length < 8) return er.show(errText('bad_code'));
        showDialog({
          title: T('Link this device?'), body: T('This device will use the account of the other device. Anything saved only here (wallet balance, locker, details) will be replaced by that account’s data.'),
          actions: [btn('btn', T('Cancel'), closeDialog), btn('btn pri', T('Link'), async () => {
            closeDialog(); const r = await lcall('join', { code: inp.value, confirm: true });
            if (!r.ok) return er.show(errText(r.error));
            C.resetAfterDelete?.(); toast(T('Linked')); setTimeout(() => location.reload(), 500);
          })],
        });
      });
      const line = el('div', 'rm-line'); line.append(inp, go); join.append(line, er);
      if (joinCode) { inp.focus(); }
      holder.append(section(T('Link this device'), join));

      // WhatsApp
      if (C.cfg.whatsapp) {
        const wa = el('div', 'card-i');
        wa.append(el('h3', '', T('Connect your WhatsApp')));
        if (dev.wa) {
          wa.append(el('p', 'mut', T('Your WhatsApp is connected. Reminders arrive there and the same locker, details and wallet are used in both places.')), btn('btn danger', T('Disconnect WhatsApp'), () => showDialog({ title: T('Disconnect WhatsApp?'), body: T('Reminders will stop arriving there. Your data stays in your account.'), actions: [btn('btn', T('Cancel'), closeDialog), btn('btn danger', T('Disconnect'), async () => { closeDialog(); const r = await lcall('wa_unlink'); if (r.ok) { dev = r.data; draw(); } })] })));
        } else if (waCode && waCode.exp > Date.now()) {
          const msg = 'LINK ' + waCode.code;
          wa.append(el('p', 'mut', T('Send this exact message to Saathi on WhatsApp from your phone, then tap Yes when it asks.')), el('div', 'dv-code', msg));
          const a = el('a', 'btn pri xl', T('Open WhatsApp')); a.href = 'https://wa.me/' + (waCode.number || dev.waNumber || '') + '?text=' + encodeURIComponent(msg); a.target = '_blank'; a.rel = 'noopener noreferrer';
          wa.append(a, btn('btn', T('I sent it, check now'), async function () { await busyBtn(this, async () => { const r = await lcall('devices'); if (r.ok) { dev = r.data; if (dev.wa) { waCode = null; toast(T('WhatsApp connected')); } else toast(T('Not yet. Send the message, tap Yes, then try again.')); draw(); } }); }));
        } else {
          wa.append(el('p', 'mut', T('Get reminders on your phone and use the same account there. WhatsApp itself proves the number is yours, and you confirm with a Yes.')), btn('btn pri xl', T('Connect WhatsApp'), async function () { await busyBtn(this, async () => { const r = await lcall('phone'); if (!r.ok) return toast(errText(r.error)); waCode = r.data; draw(); }); }));
        }
        holder.append(section(T('WhatsApp'), wa));
      }

      // sync
      const syncOn = Boolean(lastExtras.prefs?.syncChats);
      const sy = el('div', 'grp-box');
      const sw = seg([['1', T('On')], ['0', T('Off')]], syncOn ? '1' : '0', async (v) => { await saveExtras({ prefs: { syncChats: v === '1' } }); if (v === '1') C.syncNow?.(); else await tcall('chats.put', { blob: '' }); toast(v === '1' ? T('Chats will sync') : T('Chats stay on this device')); });
      sy.append(row({ icon: 'sync', title: T('Sync my chats too'), sub: T('Locker, details, reminders, applications and wallet always sync. Chats only sync if you turn this on. They are stored encrypted.'), right: sw }));
      holder.append(section(T('Sync'), sy));

      // security
      holder.append(note(T('Codes work once and expire in 5 minutes. Remove a device at any time and it loses access at once.'), 'lock'));
      const me = dev.list.find((d) => d.current);
      if (dev.list.length > 1) {
        if (me && !me.main) holder.append(btn('btn', T('Unlink this device'), () => showDialog({ title: T('Unlink this device?'), body: T('This device will start empty. Your account stays on your other devices.'), actions: [btn('btn', T('Cancel'), closeDialog), btn('btn danger', T('Unlink'), async () => { closeDialog(); const r = await lcall('unlink'); if (r.ok) { C.resetAfterDelete?.(); location.reload(); } })] })));
        else holder.append(btn('btn danger', T('Sign out all other devices'), () => showDialog({ title: T('Sign out other devices?'), body: T('Every other device loses access right away.'), actions: [btn('btn', T('Cancel'), closeDialog), btn('btn danger', T('Sign out'), async () => { closeDialog(); const r = await lcall('signout_others'); if (r.ok) { dev = r.data; draw(); toast(T('Signed out')); } })] })));
      }
      const bk = el('div', 'grp-box'); bk.append(row({ icon: 'backup', title: T('Backup and restore'), sub: T('A recovery code, if you lose this device'), onclick: () => openScreen('backup') })); holder.append(section(T('Recovery'), bk));
    };
    let waCode = null;
    await loadExtras();
    const r = await lcall('devices'); if (r.ok) dev = r.data;
    draw();
    return stopTick;
  };

  // ---- where our facts come from --------------------------------------------------------------------------------------------
  const ORG = {
    'incometax.gov.in': 'Income Tax Department', 'tinpan.proteantech.in': 'Protean (PAN services)', 'pan.utiitsl.com': 'UTIITSL (PAN services)',
    'sarathi.parivahan.gov.in': 'Sarathi, driving licence', 'parivahan.gov.in': 'Parivahan, transport', 'myaadhaar.uidai.gov.in': 'myAadhaar, UIDAI',
    'uidai.gov.in': 'UIDAI, Aadhaar', 'bookappointment.uidai.gov.in': 'UIDAI appointments', 'voters.eci.gov.in': 'Election Commission, voters',
    'electoralsearch.eci.gov.in': 'Electoral search', 'passportindia.gov.in': 'Passport Seva', 'portal2.passportindia.gov.in': 'Passport Seva portal',
    'gst.gov.in': 'GST portal', 'reg.gst.gov.in': 'GST registration', 'services.india.gov.in': 'India.gov.in services',
  };
  const hostOf = (u) => { const m = /([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i.exec(String(u)); return m ? m[1].toLowerCase() : ''; };
  const siteLogo = (host) => {
    const w = el('span', 'src-logo'); w.append(el('b', '', host.replace(/^(www|tinpan|portal2|reg|myaadhaar|sarathi|voters|electoralsearch|bookappointment|pan)\./, '').charAt(0).toUpperCase()));
    const im = el('img'); im.alt = ''; im.width = 28; im.height = 28; im.loading = 'lazy'; im.decoding = 'async';
    im.src = '/app/api/logo?host=' + encodeURIComponent(host);
    im.onload = () => { if (im.naturalWidth > 8) w.classList.add('has'); else im.remove(); }; im.onerror = () => im.remove();
    w.append(im); return w;
  };
  S.sources = async () => {
    const col = frame(T('Where our facts come from'), T('Every fee and step is taken from an official page. When we last checked is shown below.'));
    const d = await U.loadServices();
    const by = new Map();
    for (const s of d.services || []) for (const u of s.sites || []) { const h = hostOf(u); if (!h || !/\.(gov\.in|nic\.in|in|com)$/.test(h)) continue; if (!by.has(h)) by.set(h, []); const l = by.get(h); if (!l.includes(s.name)) l.push(s.name); }
    const list = el('div', 'src-list');
    for (const [h, names] of by) {
      const a = el('a', 'src-i'); a.href = C.fixUrl(h); a.target = '_blank'; a.rel = 'noopener noreferrer';
      const tx = el('span', 'src-tx'); tx.append(el('b', '', ORG[h] || h), el('small', 'src-h', h), el('small', 'src-u', T('Used for {list}', { list: names.join(', ') })));
      const go = ico('ext', 16); go.classList.add('src-go');
      a.append(siteLogo(h), tx, go); list.append(a);
    }
    col.append(el('h3', 'src-t', T('Official websites')), list);
    if (d.verified) col.append(el('p', 'mut small center', T('Information last checked {date}.', { date: d.verified })));
    col.append(note(T('Fees and rules change. Always confirm on the official site before you pay.'), 'help'));
  };

  // ---- chat sync (only when the person turned it on) --------------------------------------------------------------------------
  let pushT = null;
  C.syncNow = async () => { if (!lastExtras.prefs?.syncChats) return; const r = await tcall('chats.put', { blob: JSON.stringify({ list: C.chats.list.slice(0, 40), dead: C.chats.dead || {} }) }); return r.ok; };
  C.afterSave = () => { if (!lastExtras.prefs?.syncChats) return; clearTimeout(pushT); pushT = setTimeout(C.syncNow, 4000); };
  async function pullChats() {
    await loadExtras();
    if (!lastExtras.prefs?.syncChats) return;
    const r = await tcall('chats.get'); if (!r.ok || !r.data.blob) return;
    try { const j = JSON.parse(r.data.blob); C.mergeChats(j.list || [], j.dead || {}); } catch { /* ignore a bad blob */ }
  }

  // ---- linking from a shared link: /app#link=ABCDEFGH ---------------------------------------------------------------------------
  const m = /^#link=([A-Za-z0-9]{8})$/.exec(location.hash);
  const joinCode = m ? m[1].slice(0, 4).toUpperCase() + '-' + m[1].slice(4).toUpperCase() : null;
  if (m) { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* fine */ } }

  C.boot().then(() => {
    pullChats().catch(() => {});
    if (joinCode && store.get('saathi.onboarded')) openScreen('devices', { code: joinCode });
  });
})();
