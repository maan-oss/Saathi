// Saathi web app: sidebar, onboarding, and the full-page screens (wallet, packs, payment, settings, language,
// services, chats, locker, reminders, help). Plain JavaScript. Every string from the server goes in with textContent.
// Every word the app itself shows is written as T('English') (or N('English') when it is only marked) so it can be translated.
(() => {
  'use strict';
  const C = window.SaathiCore;
  if (!C) return;
  const { $, el, svg, api, toast, store, T, N } = C;

  // ---- icons -------------------------------------------------------------------------------
  const I = {
    plus: 'M5 12h14M12 5v14',
    chev: 'm9 18 6-6-6-6',
    back: 'm15 18-6-6 6-6',
    close: 'M18 6 6 18m6 6 12 12',
    check: 'M20 6 9 17l-5-5',
    card: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2zM2 10L22 10M6 14h2',
    id: 'M13 19a4 4 0 00-8 0M16 10h2M16 14h2M6 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0zM4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2z',
    car: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0zM9 17h6M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z',
    passport: 'M15 13a3 3 0 1 0-6 0M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20M10 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z',
    vote: 'm9 12 2 2 4-4M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7ZM22 19H2',
    gst: 'M12 17V7M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z',
    cert: 'm15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526M6 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z',
    scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2',
    doc: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M10 9H8M16 13H8M16 17H8',
    lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2zM7 11V7a5 5 0 0 1 10 0v4',
    bell: 'M10.268 21a2 2 0 0 0 3.464 0M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
    shield: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zm9 12 2 2 4-4',
    wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
    sliders: 'M10 5H3M12 19H3M14 3v4M16 17v4M21 12h-9M21 19h-5M21 5h-7M8 10v4M8 12H3',
    help: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
    globe: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20',
    user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0z',
    clock: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM12 6v6l4 2',
    moon: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401',
    trash: 'M10 11v6M14 11v6M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    ext: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
    backup: 'M12 13v8M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242m8 17 4-4 4 4',
    restore: 'M12 13v8l-4-4m12 21 4-4M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284',
    msg: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
    download: 'M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m7 10 5 5 5-5',
    plusc: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM8 12h8M12 8v8',
    warn: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01',
    star: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
    search: 'm21 21-4.34-4.34M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0z',
    refresh: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5',
    bolt: 'M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z',
    tkt: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM13 5v2M13 17v2M13 11v2',
    stk: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83zM2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
    crown: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294zM5 21h14',
    mic: 'M12 19v3M19 10v2a7 7 0 0 1-14 0v-2M12 2h0a3 3 0 0 1 3 3v7a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3v-7a3 3 0 0 1 3 -3z',
    rupee: 'm14 20-8-8h4c5.333 0 5.333-8 0-8M6 4h12M6 8h12',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0z',
    book: 'M12 5v16M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z',
    chatx: 'M19 19H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.7.7 0 0 1 2 21.286V5a2 2 0 0 1 1.184-1.826m2 2 20 20M8.656 3H20a2 2 0 0 1 2 2v11.344',
    type: 'M12 4v16M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2M9 20h6',
    tools: 'M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1zM15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1zM15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1zM4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z',
    photo: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2zM7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0zm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
    devices: 'M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8M10 19v-3.96 3.15M7 19h5M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2z',
    apps: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2zM10 4v4M2 8h20M6 4v4',
    eye: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z',
    eyeoff: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49M14.084 14.158a3 3 0 0 1-4.242-4.242M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143m2 2 20 20',
    copy: 'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2zM4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
    phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2zM12 18h.01',
    link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    sync: 'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 16h5v5',
    camera: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4zM9 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z',
    calendar: 'M8 2v3M16 2v3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2zM3 9h18',
    edit: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zm15 5 4 4',
    wa: 'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719',
    tag: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42zM7 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0z',
    pack: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73zM12 22V12M3.29 7L12 12L20.71 7m7.5 4.27 9 5.15',
    spark: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4M22 4h-4M2 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z',
  };
  const ico = (k, size = 20) => svg(I[k], size);
  const btn = (cls, text, onclick) => { const b = el('button', cls, text); b.type = 'button'; if (onclick) b.onclick = onclick; return b; };
  const rupee = C.rupee;
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

  // ---- talking to the engine from a screen ---------------------------------------------------
  const payloadWith = (payload) => ({ ...payload, lang: C.uiLang() });
  async function engine(payload) {
    const r = await api('/app/api/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payloadWith(payload)) });
    if (r.j.wallet) C.setWallet(r.j.wallet);
    return r;
  }
  let me = { wallet: null, account: null };
  async function refreshMe() {
    const r = await api('/app/api/me').catch(() => ({ ok: false }));
    if (r.ok) { me = { wallet: r.j.wallet, account: r.j.account }; if (r.j.wallet) C.setWallet(r.j.wallet); }
    return me;
  }
  // Ask the chat to do something: close any screen and the menu, then send it as if typed.
  function chatDo(payload, shown) { closeAll(); closeSidebar(); C.send(payload, shown); }

  // ---- services (names are marked here so they get translated) ------------------------------------
  const STATE_LIST = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];
  const SERVICES = [['pan', N('PAN card'), 'card'], ['aadhaar', N('Aadhaar'), 'id'], ['dl', N('Driving licence'), 'car'], ['passport', N('Passport'), 'passport'], ['voter', N('Voter ID'), 'vote'], ['gst', N('GST registration'), 'gst'], ['income', N('Income certificate'), 'rupee'], ['caste', N('Caste certificate'), 'cert']];
  const TAILORED = {
    pan: N('How do I fix a wrong name on my PAN?'), aadhaar: N('How do I update my address in Aadhaar?'), dl: N('Do I start with a learner licence?'), passport: N('Is this a fresh passport or a renewal?'),
    voter: N('How do I check my name in the voter list?'), gst: N('Do I need GST registration for my work?'), income: N('Where do I apply for an income certificate?'), caste: N('Which proof is accepted for a caste certificate?'),
  };
  let servicesCache = null; let servicesLang = null;
  const loadServices = async () => {
    const lg = C.uiLang();
    if (servicesCache && servicesLang === lg) return servicesCache;
    const r = await api('/app/api/services?lang=' + encodeURIComponent(lg)).catch(() => ({ ok: false }));
    servicesCache = r.ok ? r.j : { services: [] }; servicesLang = lg; return servicesCache;
  };
  const svcMeta = (id) => SERVICES.find((x) => x[0] === id) || [id, id, 'doc'];

  // A chat about one service: it opens with what Saathi knows, and everything you type afterwards is about that service.
  async function startServiceChat(id) {
    closeAll(); closeSidebar();
    const meta = svcMeta(id); const d = await loadServices(); const s = (d.services || []).find((x) => x.id === id);
    const name = s?.name || T(meta[1]);
    const lines = [T('*{name}*', { name })];
    if (s?.blurb) lines.push(s.blurb);
    if (s?.fee) lines.push(T('Official fee: {fee}', { fee: clip(s.fee, 160) }));
    lines.push(T('Ask me anything about this, or let me guide you step by step.'));
    C.openServiceChat(id, name, lines.join('\n\n'), [
      { id: 'ask', title: N('What documents do I need?') }, { id: 'ask', title: N('How much does it cost?') },
      { id: 'go_' + id, title: N('Guide me step by step') }, { id: 'ask', title: TAILORED[id] || N('What should I know first?') },
      { id: 'info:' + id, title: N('Full details') },
    ]);
  }

  // ---- sidebar ---------------------------------------------------------------------------------
  const sb = $('sidebar'); const scrim = $('scrim');
  let sbItems = {}; let recentBox = null;
  function navItem(key, icon, label, onclick, extra) {
    const b = el('button', 'sb-item'); b.type = 'button';
    const ic = el('span', 'sb-ic'); ic.append(ico(icon, 19));
    b.append(ic, el('span', 'sb-t', label));
    if (extra) b.append(extra);
    b.onclick = onclick; sbItems[key] = b; return b;
  }
  function renderRecents() {
    if (!recentBox) return;
    recentBox.replaceChildren();
    const list = C.chats.list.filter((c) => c.items.length);
    if (!list.length) return;
    recentBox.append(el('div', 'sb-label', T('Recent')));
    for (const c of list.slice(0, 5)) {
      const wrap = el('div', 'sb-chat' + (C.chats.cur === c.id ? ' active' : ''));
      const b = el('button', 'sb-item'); b.type = 'button';
      const ic = el('span', 'sb-ic'); ic.append(ico('msg', 18));
      b.append(ic, el('span', 'sb-t', c.title || T('New chat')));
      b.onclick = () => { closeAll(); closeSidebar(); C.openChat(c.id, { fromSwitch: true }); };
      const x = el('button', 'sb-del'); x.type = 'button'; x.setAttribute('aria-label', T('Delete this chat')); x.append(ico('trash', 16));
      x.onclick = (e) => { e.stopPropagation(); C.deleteChat(c.id); };
      wrap.append(b, x); recentBox.append(wrap);
    }
    if (list.length > 5) recentBox.append(navItem('chats', 'clock', T('All chats'), () => openScreen('chats')));
  }
  C.onChats = renderRecents;
  function buildSidebar() {
    sb.replaceChildren(); sbItems = {};
    const head = el('div', 'sb-head');
    const brand = el('a', 'sb-brand'); brand.href = '#'; brand.setAttribute('aria-label', 'Saathi'); brand.onclick = (e) => { e.preventDefault(); closeAll(); closeSidebar(); C.newChat(); };
    const lg = el('img'); lg.src = '/logo.svg'; lg.width = 28; lg.height = 28; lg.alt = '';
    brand.append(lg, el('span', '', 'Saathi'));
    const x = el('button', 'icon-btn sb-x'); x.type = 'button'; x.setAttribute('aria-label', T('Close menu')); x.append(ico('close', 22)); x.onclick = closeSidebar;
    head.append(brand, el('span', 'sp'), x);
    const nc = el('button', 'sb-new'); nc.type = 'button'; nc.append(ico('plus', 18), el('span', '', T('New chat')));
    nc.onclick = () => { closeAll(); closeSidebar(); C.newChat(); };
    const scroll = el('nav', 'sb-scroll');
    recentBox = el('div', 'sb-recent'); scroll.append(recentBox);
    scroll.append(
      navItem('tools', 'tools', T('Today'), () => openScreen('tools')),
      navItem('services', 'plusc', T('Guides'), () => openScreen('services')),
      navItem('details', 'user', T('My details'), () => openScreen('details')),
      navItem('locker', 'lock', T('My locker'), () => openScreen('locker')),
    );
    const foot = el('div', 'sb-foot');
    const wal = navItem('wallet', 'wallet', T('Wallet'), () => openScreen('wallet'));
    const bal = el('span', 'sb-bal'); bal.id = 'sbBal'; bal.textContent = $('walletText').textContent; wal.append(bal);
    foot.append(wal, ...(C.cfg?.link ? [navItem('devices', 'devices', T('Devices and sync'), () => openScreen('devices'))] : []), navItem('settings', 'sliders', T('Settings'), () => openScreen('settings')), navItem('help', 'help', T('Help and support'), () => openScreen('help')));
    const fine = el('div', 'sb-fine'); const pa = el('a', '', T('Privacy')); pa.href = '#privacy'; pa.onclick = (e) => { e.preventDefault(); openScreen('privacy'); };
    fine.append(pa, el('span', '', ' · ' + T('Not a government website')));
    foot.append(fine);
    sb.append(head, nc, scroll, foot);
    renderRecents();
    // Top navigation (wide screens): the same places as the menu card, always one tap away.
    const top = document.querySelector('.top'); top?.querySelector('.topnav')?.remove();
    if (top) {
      const tn = el('nav', 'topnav'); tn.setAttribute('aria-label', 'Saathi');
      for (const [k, label, go] of [['home', T('Home'), () => { closeAll(); C.newChat(); }], ['tools', T('Today'), () => openScreen('tools')], ['services', T('Guides'), () => openScreen('services')], ['details', T('My details'), () => openScreen('details')], ['locker', T('My locker'), () => openScreen('locker')]]) {
        const b = el('button', 'tn' + (k === 'home' ? ' active' : ''), label); b.type = 'button'; b.dataset.k = k; b.onclick = go; tn.append(b);
      }
      top.querySelector('.brand')?.after(tn);
    }
    document.dispatchEvent(new Event('saathi:relabel'));
  }
  function openSidebar() { sb.classList.add('on'); scrim.classList.add('on'); $('menuBtn').setAttribute('aria-expanded', 'true'); }
  function closeSidebar() { sb.classList.remove('on'); scrim.classList.remove('on'); $('menuBtn').setAttribute('aria-expanded', 'false'); }
  $('menuBtn').onclick = openSidebar; scrim.onclick = closeSidebar;
  $('wallet').onclick = () => openScreen('wallet');
  const walletText = $('walletText');
  new MutationObserver(() => { const b = $('sbBal'); if (b) b.textContent = walletText.textContent; }).observe(walletText, { childList: true, characterData: true, subtree: true });
  const markActive = (key) => { for (const [k, b] of Object.entries(sbItems)) b.classList.toggle('active', k === key); document.querySelectorAll('.topnav .tn').forEach((b) => b.classList.toggle('active', b.dataset.k === (key || 'home'))); };

  // ---- screen frame ----------------------------------------------------------------------------
  const screen = $('screen');
  const stack = [];
  const SCREENS = {};
  // A screen has a back button, a small title that appears once you scroll, and a big title at the top of the page.
  function frame(title, sub) {
    screen.replaceChildren();
    const head = el('header', 'sc-head');
    const back = el('button', 'icon-btn sc-back'); back.type = 'button'; back.setAttribute('aria-label', T('Back')); back.append(ico(stack.length > 1 ? 'back' : 'close', 22));
    back.onclick = goBack;
    const h = el('div', 'sc-small', title);
    head.append(back, h);
    const body = el('div', 'sc-body'); const col = el('div', 'sc-col'); body.append(col);
    const big = el('div', 'sc-big'); big.append(el('h1', '', title)); if (sub) big.append(el('p', '', sub));
    col.append(big);
    body.addEventListener('scroll', () => head.classList.toggle('scrolled', body.scrollTop > 48), { passive: true });
    screen.append(head, body);
    return col;
  }
  function openScreen(name, params = {}) {
    closeSidebar();
    stack.push({ name, params });
    if (stack.length === 1) { try { history.pushState({ saathi: 1 }, ''); } catch { /* fine */ } }
    render();
    screen.hidden = false; requestAnimationFrame(() => screen.classList.add('on'));
    document.body.classList.add('screen-open');
  }
  function render() {
    const cur = stack[stack.length - 1];
    if (!cur) return;
    markActive(cur.name === 'service' ? 'svc_' + cur.params.id : ['topup', 'packs', 'activity'].includes(cur.name) ? 'wallet' : ['backup', 'language'].includes(cur.name) ? 'settings' : cur.name);
    screen.scrollTop = 0;
    SCREENS[cur.name](cur.params);
    screen.classList.remove('swap'); void screen.offsetWidth; screen.classList.add('swap');
  }
  function goBack() { stack.pop(); if (stack.length) render(); else hideScreen(); }
  function hideScreen() { screen.classList.remove('on'); document.body.classList.remove('screen-open'); markActive(null); setTimeout(() => { if (!stack.length) { screen.hidden = true; screen.replaceChildren(); } }, 400); }
  function closeAll() { if (!stack.length) return; stack.length = 0; hideScreen(); }
  window.addEventListener('popstate', () => { if (stack.length) { stack.length = 0; hideScreen(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (dialogOpen) closeDialog(); else if (stack.length) goBack(); else closeSidebar(); } });

  // ---- building blocks -------------------------------------------------------------------------
  function group(title, ...rows) { const g = el('section', 'grp'); if (title) g.append(el('h2', 'grp-t', title)); const box = el('div', 'grp-box'); box.append(...rows.filter(Boolean)); g.append(box); return g; }
  function row({ icon, title, sub, value, onclick, href, danger, right, badge }) {
    const r = el(href ? 'a' : onclick ? 'button' : 'div', 'row-i' + (danger ? ' danger' : ''));
    if (href) { r.href = href; r.target = '_blank'; r.rel = 'noopener noreferrer'; }
    if (onclick && !href) { r.type = 'button'; }
    if (onclick) r.onclick = onclick;
    if (icon) { const ic = el('span', 'ri-ic'); ic.append(ico(icon, 19)); r.append(ic); }
    const tx = el('span', 'ri-tx'); const t = el('span', 'ri-t', title); if (badge) t.append(el('span', 'tag', badge)); tx.append(t); if (sub) tx.append(el('span', 'ri-s', sub)); r.append(tx);
    if (right) r.append(right);
    else { if (value) r.append(el('span', 'ri-v', value)); if (onclick || href) { const c = ico(href ? 'ext' : 'chev', href ? 16 : 18); c.classList.add('ri-c'); r.append(c); } }
    return r;
  }
  function seg(options, current, onPick) {
    const g = el('div', 'seg'); g.setAttribute('role', 'group');
    for (const [val, label] of options) {
      const b = btn('', label); b.setAttribute('aria-pressed', String(val === current));
      b.onclick = () => { for (const x of g.children) x.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-pressed', 'true'); onPick(val); };
      g.append(b);
    }
    return g;
  }
  function note(text, icon = 'shield') { const n = el('div', 'note'); n.append(ico(icon, 18), el('span', '', text)); return n; }
  function empty(icon, title, text, action) {
    const e = el('div', 'empty'); const c = el('div', 'empty-ic'); c.append(ico(icon, 30));
    e.append(c, el('h3', '', title), el('p', '', text)); if (action) e.append(action); return e;
  }
  // Show what the bot said (text, links, buttons) inside a screen, so a flow can run without leaving it.
  function botBox(container, replies, onDone) {
    container.replaceChildren();
    for (const r0 of replies) {
      const r = typeof r0 === 'string' ? { kind: 'text', body: r0 } : r0;
      if (r.body) { const b = el('div', 'botbox'); b.append(C.richText(r.body, r.links)); container.append(b); }
      const opts = r.kind === 'buttons' ? r.buttons : r.kind === 'list' ? r.rows.map((x) => ({ id: x.id, title: x.title })) : [];
      if (opts.length) {
        const g = el('div', 'bb-btns');
        for (const o of opts) g.append(btn('btn' + (o === opts[0] ? ' pri' : ''), o.title, async () => {
          if (o.id === 'menu') { onDone?.(); return; }
          g.classList.add('busy'); const x = await engine({ type: 'reply', id: o.id, title: o.title }); await refreshMe(); botBox(container, x.j.replies || [], onDone);
        }));
        container.append(g);
      }
    }
  }
  const plain = (s) => String(s || '').replace(/[*_]/g, '');
  // Results are written for WhatsApp, with emoji and bullet marks. The web card is plain text, so those come off here.
  const clean = (s) => plain(s).replace(/\p{Extended_Pictographic}️?/gu, '').replace(/^[\s•·*\-]+/u, '').replace(/\s{2,}/g, ' ').trim();
  // The first site named in the message, used only for its letter badge. Nothing is fetched from that site.
  const siteOf = (s) => { const m = String(s).match(/(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?=[/\s?#]|$)/i); return m ? m[1].toLowerCase() : ''; };
  const siteBadge = (host) => { const b = el('span', 'v-site', host[0].toUpperCase()); b.setAttribute('aria-hidden', 'true'); b.title = host; let h = 0; for (const c of host) h = (h * 31 + c.charCodeAt(0)) % 360; b.style.setProperty('--site-h', String(h)); return b; };
  const findPayLink = (replies) => {
    const rep = (replies || []).map((x) => (typeof x === 'string' ? { body: x } : x));
    const linkRep = rep.find((x) => x.links && Object.values(x.links).some((i) => i.kind === 'payment'));
    return { rep, url: linkRep ? Object.entries(linkRep.links).find(([, i]) => i.kind === 'payment')[0] : null };
  };

  // ---- wallet ----------------------------------------------------------------------------------
  const WHAT = { 'welcome credit': N('Welcome credit (one time)'), 'top-up': N('Money added'), referral: N('Referral bonus'), msg: N('Guide message'), ai: N('AI answer'), scan: N('Document check'), sheet: N('Form sheet'), voice: N('Voice note'), remind: N('Reminder') };
  const whatLabel = (w) => (w.startsWith('pack ') ? T('Pack bought') : w.startsWith('refund ') ? T('Refund') : WHAT[w] ? T(WHAT[w]) : T('Other'));
  function activityRows(list) {
    const box = el('div', 'act');
    for (const e of list) {
      const r = el('div', 'act-r'); const plus = e.paise >= 0;
      const ic = el('span', 'act-ic' + (plus ? ' in' : '')); ic.append(ico(plus ? 'plus' : e.what === 'ai' ? 'star' : 'doc', 16));
      const tx = el('span', 'act-t'); tx.append(el('b', '', whatLabel(e.what)), el('small', '', fmtDate(e.ts) + ', ' + fmtTime(e.ts)));
      const amt = el('span', 'act-a' + (plus ? ' in' : ''), (plus ? '+' : '−') + rupee(Math.abs(e.paise)));
      r.append(ic, tx, amt); box.append(r);
    }
    return box;
  }
  const packName = (id, fallback) => ({ pan_pack: T('Saathi pack'), pack_month: T('Saathi Plus') }[id] || fallback || T('Saathi pack'));
  SCREENS.wallet = async () => {
    const col = frame(T('Wallet'), T('Your balance, packs and recent activity.'));
    const w0 = C.wallet; const p = C.prices;
    const holder = el('div', 'wl'); col.append(holder);
    const draw = (w) => {
      holder.replaceChildren();
      const hero = el('section', 'w-hero');
      hero.append(el('div', 'w-l', T('Balance')), el('div', 'w-n', w ? w.balance : '₹0'));
      if (w && w.freeLeft != null && p) {
        const meter = el('div', 'meter'); const fill = el('i'); meter.append(fill);
        const used = Math.max(0, p.freeMsgsPerDay - w.freeLeft); fill.style.setProperty('--v', String(Math.min(1, used / p.freeMsgsPerDay)));
        hero.append(el('div', 'w-s', T('{left} of {total} free guide messages left today', { left: w.freeLeft, total: p.freeMsgsPerDay })), meter);
        if (p.freeAiPerDay) hero.append(el('div', 'w-s soft', T('{left} of {total} free AI answers left today', { left: w.freeAiLeft ?? 0, total: p.freeAiPerDay })));
      }
      const acts = el('div', 'w-acts');
      acts.append(btn('btn light', T('Add money'), () => openScreen('topup')), btn('btn ghostw', T('See packs'), () => openScreen('packs')));
      hero.append(acts);
      holder.append(hero);
      if (w?.pack) {
        const pk = el('section', 'card-i pack-on');
        const top = el('div', 'pk-top'); top.append(el('h3', '', T('{name} is on', { name: packName(w.pack.id, w.pack.name) })), el('span', 'tag on', T('Active')));
        pk.append(top, el('p', 'mut', T('Until {date}. Guide messages and form sheets are unlimited.', { date: fmtDate(w.pack.until) })));
        const ul = el('ul', 'left');
        for (const [n, l] of [[w.pack.scans, T('document checks left')], [w.pack.ai, T('AI answers left')], [w.pack.voice, T('voice notes left')], [w.pack.remind, T('reminders left')]].filter(([n]) => typeof n === 'number' && n > 0)) { const li = el('li'); li.append(el('b', '', String(n)), el('span', '', l)); ul.append(li); }
        pk.append(ul); holder.append(pk);
      }
      const hist = (w?.history || []);
      const sec = el('section', 'grp'); const th = el('div', 'grp-h'); th.append(el('h2', 'grp-t', T('Recent activity')));
      if (hist.length > 6) th.append(btn('link-btn', T('See all'), () => openScreen('activity')));
      sec.append(th);
      sec.append(hist.length ? activityRows(hist.slice(0, 6)) : el('p', 'mut pad', T('Nothing yet. Charges and top-ups will show here.')));
      holder.append(sec);
      // Invite a friend: your link, and what you earn when the people you invite add money.
      const inv = el('section', 'grp'); inv.append(el('h2', 'grp-t', T('Invite a friend')));
      const invBox = el('div', 'grp-box invite');
      const invLink = el('p', 'invite-link', T('Getting your link…'));
      const invBtn = btn('btn sm', T('Copy my invite link'), null); invBtn.disabled = true;
      invBox.append(el('p', 'mut', T('You earn 30% of what they add in their first month, and 10% after that.')), invLink, invBtn);
      inv.append(invBox); holder.append(inv);
      api('/app/api/t', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'ref.code', args: {} }) }).then((r) => {
        const code = r.ok && r.j?.ok ? r.j.data?.code : null;
        if (!code) { invLink.textContent = T('Your link is not ready yet. Try again in a moment.'); return; }
        const link = location.origin + '/app?ref=' + code;
        invLink.textContent = link; invBtn.disabled = false;
        invBtn.onclick = function () { C.copyText(link, this); };
      }).catch(() => { invLink.textContent = T('Your link is not ready yet. Try again in a moment.'); });
      if (p) {
        const rows = [[T('Guide message (after the free ones)'), p.msgPaise], [T('AI answer (after the free ones)'), p.aiPaise], [T('Document check'), p.scanPaise], [T('Form sheet'), p.sheetPaise], ...(C.cfg?.voice ? [[T('Voice note'), p.voicePaise]] : []), [T('Reminder'), p.remindPaise]];
        const box = el('div', 'grp-box prices');
        for (const [l, v] of rows) { const r = el('div', 'pr'); r.append(el('span', '', l), el('b', '', rupee(v))); box.append(r); }
        const g = el('section', 'grp'); g.append(el('h2', 'grp-t', T('Pay per use')), box); holder.append(g);
      }
      holder.append(note(T('Free messages renew every day. Saathi never charges without showing the price first.'), 'shield'));
    };
    draw(w0);
    const m = await refreshMe(); if (m.wallet && stack.at(-1)?.name === 'wallet') draw(m.wallet);
  };
  SCREENS.activity = async () => {
    const col = frame(T('Transactions'), T('Everything that went in or out of your wallet.'));
    const m = await refreshMe(); const h = m.wallet?.history || [];
    col.append(h.length ? activityRows(h) : empty('clock', T('No activity yet'), T('Charges, top-ups and refunds will appear here.')));
  };

  // ---- payment: straight to Stripe, then back here ----------------------------------------------
  // The server creates the payment and gives us Stripe's page; we send the person there at once. When Stripe brings
  // them back (see payreturn) the server says whether that one payment is paid. The balance is never used as proof.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const payError = (code) => (code === 'slow_down' ? T('Too many tries. Wait a minute and try again.') : code === 'payments_off' ? T('Top-ups are not switched on yet.') : T('We could not start that payment. Nothing was charged. Please try again.'));
  async function payOut(paise, pack, onErr) {
    const r = await api('/app/api/topup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paise, ...(pack ? { pack } : {}), origin: location.origin }) });
    const url = r.ok && r.j?.url;
    if (!url || !/^https:\/\/checkout\.stripe\.com\//.test(url)) return onErr(payError(r.j?.error));
    location.assign(url); // same tab: the Stripe page, then straight back to Saathi
  }
  const errBox = (stage, text) => { stage.replaceChildren(); const e = el('div', 'note bad'); e.append(ico('warn', 18), el('span', '', text)); stage.append(e); };

  SCREENS.topup = async () => {
    const col = frame(T('Add money'), T('Choose an amount. It goes into your wallet and is used only when you use a paid feature.'));
    const cfg = C.cfg || {}; const p = C.prices;
    const amounts = cfg.topups?.length ? cfg.topups : [5000, 10000, 20000, 50000];
    if (!cfg.pay) {
      col.append(empty('wallet', T('Top-ups are not switched on yet'), T('You can keep using Saathi with the free daily messages. Paid features will open once payments go live.'), btn('btn', T('Back to wallet'), goBack)));
      return;
    }
    let chosen = amounts[1] || amounts[0];
    const grid = el('div', 'amounts');
    const sum = el('section', 'card-i sumcard');
    const pay = btn('btn pri xl', '');
    const stage = el('div', 'pay-stage');
    const draw = () => {
      for (const b of grid.children) b.setAttribute('aria-pressed', String(Number(b.dataset.p) === chosen));
      sum.replaceChildren();
      const r1 = el('div', 'pr'); r1.append(el('span', '', T('You pay')), el('b', '', rupee(chosen)));
      const r2 = el('div', 'pr'); r2.append(el('span', '', T('Added to wallet')), el('b', '', rupee(chosen)));
      sum.append(r1, r2);
      if (p) sum.append(el('p', 'mut small', T('About {ai} AI answers or {scans} document checks.', { ai: Math.floor(chosen / p.aiPaise), scans: Math.floor(chosen / p.scanPaise) })));
      pay.textContent = T('Pay {amt} securely', { amt: rupee(chosen) });
    };
    for (const a of amounts) { const b = btn('amt', rupee(a)); b.dataset.p = String(a); b.onclick = () => { chosen = a; draw(); }; grid.append(b); }
    pay.onclick = () => {
      pay.disabled = true; pay.textContent = T('Opening Stripe…');
      payOut(chosen, null, (msg) => { pay.disabled = false; draw(); errBox(stage, msg); });
    };
    col.append(grid, sum, pay, stage, note(T('You pay on Stripe with your card. Saathi never sees your card number.'), 'lock'));
    draw();
  };

  // Counts the balance up like a win on a machine: quick steps that slow down, each step flashes, then it lands.
  function countUp(node, from, to, onStep, ms = 1900) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now(); let last = null;
    const tick = (now) => {
      const t = reduce ? 1 : Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - t, 4);
      const v = t >= 1 ? to : Math.round((from + (to - from) * e) / 100) * 100;
      if (v !== last) {
        last = v; node.textContent = rupee(v); onStep?.(v);
        node.classList.remove('tick'); void node.offsetWidth; node.classList.add('tick');
      }
      if (t < 1) requestAnimationFrame(tick); else node.classList.add('done');
    };
    requestAnimationFrame(tick);
  }
  function checkRing() {
    const wrap = el('div', 'pay-ring');
    const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 80 80'); s.setAttribute('aria-hidden', 'true');
    const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', '40'); c.setAttribute('cy', '40'); c.setAttribute('r', '36');
    const p2 = document.createElementNS(SVGNS, 'path'); p2.setAttribute('d', 'M25 41 L35 51 L56 29');
    s.append(c, p2); wrap.append(s); return wrap;
  }

  // Back from Stripe: /app?topup=paid&pay=REF or /app?topup=cancelled&pay=REF.
  SCREENS.payreturn = async ({ ref, cancelled }) => {
    const col = frame(T('Payment'));
    const stage = el('div', 'pay-stage'); col.append(stage);
    const again = () => { stack.length = 0; openScreen('topup'); };
    if (cancelled) {
      stage.append(waitBox(T('Payment cancelled'), T('Nothing was charged.'), btn('btn pri xl', T('Back to Add money'), again)));
      return;
    }
    if (!ref) { stage.append(waitBox(T('We could not find that payment'), T('Your balance is in the wallet. If you paid, it shows there shortly.'), btn('btn pri xl', T('Open wallet'), () => { stack.length = 0; openScreen('wallet'); }))); return; }

    const celebrate = (j) => {
      stage.replaceChildren();
      const to = j.wallet ? j.wallet.paise : 0;
      const from = j.before != null ? j.before : Math.max(0, to - j.paise);
      const card = el('section', 'card-i success pay-win');
      const done = btn('btn pri xl', T('Done'), () => { stack.length = 0; hideScreen(); });
      if (j.pack) {
        // A pack is paid for and switched on from the wallet, so the balance is not counted up.
        const on = j.wallet?.pack;
        card.append(checkRing(), el('h3', '', T('Payment received')), el('p', 'mut', on ? T('{name} is on until {date}.', { name: packName(on.id, on.name), date: fmtDate(on.until) }) : T('Your pack is on.')), done);
        stage.append(card);
        setTimeout(() => { if (!document.body.contains(card)) return; stack.length = 0; hideScreen(); C.toast?.(T('Your pack is on.')); }, 2600);
        return;
      }
      const num = el('div', 'pay-num', rupee(from));
      const chip = el('span', 'pay-chip', '+' + rupee(j.paise));
      const bal = el('div', 'pay-bal'); bal.append(el('p', 'pay-lbl', T('Your balance')), num, chip);
      card.append(checkRing(), el('h3', '', T('Payment received')), el('p', 'mut', T('{amt} added to your wallet.', { amt: rupee(j.paise) })), bal, done);
      stage.append(card);
      const walletText = document.getElementById('walletText');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) chip.classList.add('on');
      countUp(num, from, to, (v) => { if (walletText) walletText.textContent = rupee(v); }, 1900);
      setTimeout(() => { C.setWallet?.(j.wallet); }, 2000);
      // Then back to the top page on its own, with the amount confirmed there.
      setTimeout(() => {
        if (!document.body.contains(card)) return;
        stack.length = 0; hideScreen();
        C.toast?.(j.pack ? T('Your pack is on.') : T('{amt} added to your wallet.', { amt: rupee(j.paise) }));
      }, j.pack ? 2600 : 2900);
    };
    const confirm = async () => {
      stage.replaceChildren(waitBox(T('Confirming your payment'), T('Stripe is confirming it. This usually takes a few seconds. Keep this page open.')));
      const t0 = Date.now(); let why = 'slow';
      while (document.body.contains(col) && Date.now() - t0 < 60000) {
        const r = await api('/app/api/pay?ref=' + encodeURIComponent(ref)).catch(() => ({ ok: false, status: 0 }));
        if (r.status === 404) { why = 'missing'; break; }
        if (r.ok && r.j?.status === 'paid') return celebrate(r.j);
        if (r.ok && r.j?.status === 'failed') { why = 'failed'; break; }
        await new Promise((res) => setTimeout(res, 1500));
      }
      if (!document.body.contains(col)) return;
      const text = why === 'missing' ? T('We cannot find this payment in this browser. If you paid, your balance will show in the wallet shortly.')
        : why === 'failed' ? T('This payment did not go through. Nothing was charged.')
        : T('Stripe has not confirmed it yet. Your balance updates as soon as it does.');
      stage.replaceChildren(waitBox(why === 'failed' ? T('Payment not completed') : T('Still confirming'), text, btn('btn pri xl', why === 'failed' ? T('Try again') : T('Check again'), () => (why === 'failed' ? again() : confirm()))));
    };
    confirm();
  };
  // A card with a title, a line of text and one action. Used while we wait, and when something needs a decision.
  function waitBox(title, text, action) {
    const card = el('section', 'card-i paycard');
    if (!action) { const spin = el('div', 'spin'); spin.append(el('i')); card.append(spin); }
    card.append(el('h3', '', title), el('p', 'mut', text));
    if (action) card.append(action);
    return card;
  }

  // ---- packs -------------------------------------------------------------------------------------
  const PACK_TAG = { pan_pack: N('Most popular'), pack_month: N('Best value') };
  const PACK_ICON = { pan_pack: 'stk', pack_month: 'crown' };
  // The least a Stripe payment can be (billing.js MIN_TOPUP_PAISE). A short wallet pays at least this much, so a pack can be paid for.
  const MIN_TOPUP = 5000;
  SCREENS.packs = async () => {
    const col = frame(T('Packs'), T('One price for a whole paperwork job. No need to count messages.'));
    const packs = C.prices?.packs || [];
    if (!packs.length) { col.append(empty('pack', T('No packs available'), T('Pay-per-use pricing applies.'))); return; }
    const holder = el('div', 'packs'); col.append(holder);
    const stage = el('div', 'pay-stage'); col.append(stage);
    const draw = (w) => {
      holder.replaceChildren();
      if (w?.pack) holder.append(note(T('{name} is active until {date}. A new pack starts after you buy it.', { name: packName(w.pack.id, w.pack.name), date: fmtDate(w.pack.until) }), 'check'));
      for (const pk of packs) {
        const card = el('section', 'pack' + (PACK_TAG[pk.id] ? ' hot' : ''));
        const top = el('div', 'pack-top'); const ic = el('span', 'pack-ic'); ic.append(ico(PACK_ICON[pk.id] || 'pack', 22));
        const nm = el('div', 'pack-nm'); nm.append(el('b', '', packName(pk.id, pk.name)), el('small', '', T('{days} days', { days: pk.days })));
        top.append(ic, nm); if (PACK_TAG[pk.id]) top.append(el('span', 'tag hot', T(PACK_TAG[pk.id])));
        const price = el('div', 'pack-price'); price.append(el('b', '', rupee(pk.paise)), el('span', '', T('about {amt} a day', { amt: rupee(Math.round(pk.paise / pk.days)) })));
        const ul = el('ul', 'incl');
        for (const [k, t] of [['msg', T('Unlimited guide messages')], ['doc', T('Unlimited form sheets')], ['camera', T('{n} document checks', { n: pk.scans })], ['spark', T('{n} AI answers', { n: pk.ai })]]) { const li = el('li'); const c = el('span', 'inc-ic'); c.append(ico(k, 16)); li.append(c, el('span', '', t)); ul.append(li); }
        const enough = (w?.paise || 0) >= pk.paise; const need = Math.max(MIN_TOPUP, Math.ceil((pk.paise - (w?.paise || 0)) / 100) * 100);
        const buy = btn('btn ' + (PACK_TAG[pk.id] ? 'pri' : 'ink') + ' xl', enough ? T('Get it for {amt} from your wallet', { amt: rupee(pk.paise) }) : T('Pay {amt} and get it', { amt: rupee(need) }), () => buyPack(pk, buy));
        // Until payments are live, a pack that needs a top-up cannot be bought: say so instead of opening a payment that will fail.
        if (!C.cfg?.pay && !enough) { buy.disabled = true; buy.textContent = T('Payments go live soon'); }
        card.append(top, price, ul, buy); holder.append(card);
      }
      holder.append(note(T('Packs are paid from your wallet. If you are short, you pay only the difference on Stripe and the pack starts by itself.'), 'wallet'));
    };
    const buyPack = async (pk, button) => {
      const beforeUntil = C.wallet?.pack?.until || 0; const have = C.wallet?.paise || 0;
      if (have < pk.paise) {
        // Short: pay the difference on Stripe. The pack starts by itself once that payment is in.
        const need = Math.max(MIN_TOPUP, Math.ceil((pk.paise - have) / 100) * 100);
        return payOut(need, pk.id, (msg) => errBox(stage, msg));
      }
      button.disabled = true; const old = button.textContent; button.textContent = T('One moment…');
      const r = await engine({ type: 'reply', id: 'buypack_' + pk.id, title: pk.name });
      button.disabled = false; button.textContent = old;
      const m = await refreshMe();
      if (m.wallet?.pack && m.wallet.pack.id === pk.id && m.wallet.pack.until > beforeUntil) {
        col.replaceChildren(); const ok = el('section', 'card-i success'); const c = el('div', 'ok-ic'); c.append(ico('check', 34));
        ok.append(c, el('h3', '', T('{name} is on', { name: packName(pk.id, pk.name) })), el('p', 'mut', T('It runs until {date}. Enjoy.', { date: fmtDate(m.wallet.pack.until) })), btn('btn pri xl', T('Done'), () => { stack.length = 0; hideScreen(); }));
        col.append(ok); return;
      }
      // The wallet changed while we were buying: the chat may have made a Stripe link instead. Use it if so.
      const { url } = findPayLink(r.j?.replies);
      if (url && /^https:\/\/checkout\.stripe\.com\//.test(url)) return location.assign(url);
      errBox(stage, T('We could not start that payment. Nothing was charged. Please try again.'));
    };
    draw(C.wallet);
    const m = await refreshMe(); if (m.wallet && stack.at(-1)?.name === 'packs') draw(m.wallet);
  };

  // ---- language -------------------------------------------------------------------------------
  const langList = () => C.cfg?.languages || [{ code: 'en', native: 'English', en: 'English' }, { code: 'hi', native: 'हिन्दी', en: 'Hindi' }];
  // A plain list: search at the top, English and Hindi first, then the rest A to Z.
  function langPicker(container, { current, onPick }) {
    const search = el('input', 'search'); search.type = 'search'; search.placeholder = T('Search languages'); search.setAttribute('aria-label', T('Search languages')); search.autocomplete = 'off';
    const wrap = el('div', 'search-w'); wrap.append(ico('search', 18), search);
    const list = el('div', 'langs');
    let sel = current;
    const draw = () => {
      list.replaceChildren();
      const q = search.value.trim().toLowerCase();
      const all = langList().filter((l) => !q || l.en.toLowerCase().includes(q) || l.native.toLowerCase().includes(q));
      const top = all.filter((l) => l.code === 'en' || l.code === 'hi'); const rest = all.filter((l) => l.code !== 'en' && l.code !== 'hi').sort((a, b) => a.en.localeCompare(b.en));
      for (const l of [...top, ...rest]) {
        const b = el('button', 'lang' + (sel === l.code ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(sel === l.code));
        const tx = el('span', 'l-tx'); const n = el('b', '', l.native); n.lang = l.code; tx.append(n, el('small', '', l.en + (l.beta ? ' · beta' : '')));
        const dot = el('span', 'l-dot'); dot.append(ico('check', 14));
        b.append(tx, dot); b.onclick = () => { sel = l.code; onPick(l); draw(); }; list.append(b);
      }
      if (!all.length) list.append(el('p', 'mut pad', T('No language found. Try another spelling.')));
    };
    search.addEventListener('input', draw); draw();
    container.append(wrap, list);
    return { get sel() { return sel; } };
  }
  // Changing the language: the bot's own texts, then the app's words. The AI answers keep following whatever you write in.
  async function applyLanguage(l, { reload = true } = {}) {
    showDialog({ title: T('Setting up {lang}', { lang: l.en }), body: l.code === 'en' || l.code === 'hi' ? T('One moment…') : T('The first time a language is used it takes up to a minute. Later it is instant.'), busy: true });
    const prev = C.uiLang();
    const n = await C.loadUI(l.code, { wait: 90000 });
    if (!n) { await C.loadUI(prev); closeDialog(); toast(T('This language needs Saathi’s AI, which is not switched on yet. Hindi and English work now.')); return false; }
    const r = await api('/app/api/lang', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: l.code }) });
    closeDialog();
    if (!r.ok || !r.j.ok) { toast(T('Could not change the language. Please try again.')); return false; }
    store.set('saathi.lang', l.code);
    if (reload) {
      // Redraw in place: no page reload, so it also works where browser storage is blocked.
      C.applyStatic(); closeAll(); try { buildSidebar(); } catch { /* sidebar redraws on next open */ }
      C.newChat(); openScreen('settings');
    }
    return true;
  }
  SCREENS.language = async () => {
    const col = frame(T('Language'), T('Everything in the app shows in the language you pick. Saathi answers in the language you write to it, so you can chat in Hindi even if the app is in English.'));
    const m = await refreshMe();
    langPicker(col, { current: C.uiLang() || m.account?.lang || 'en', onPick: (l) => { if (l.code !== C.uiLang()) applyLanguage(l); } });
  };

  // ---- services ---------------------------------------------------------------------------------
  SCREENS.services = async () => {
    const col = frame(T('Services'), T('Pick a guide to see what you need, the fee and the official sites.'));
    const d = await loadServices();
    const g = el('div', 'svc-grid');
    for (const [id, name, ic] of SERVICES) {
      const s = (d.services || []).find((x) => x.id === id);
      const b = el('button', 'svc-card'); b.type = 'button';
      const c = el('span', 'svc-ic'); c.append(ico(ic, 22));
      b.append(c, el('b', '', s?.name || T(name)), el('small', '', s?.blurb || T('Guide, documents and fees')));
      b.onclick = () => openScreen('service', { id }); g.append(b);
    }
    col.append(g);
  };
  SCREENS.service = async ({ id }) => {
    const meta = svcMeta(id);
    const d = await loadServices(); const s = (d.services || []).find((x) => x.id === id);
    const col = frame(s?.name || T(meta[1]), s?.blurb || '');
    const top = el('section', 'svc-top'); const c = el('span', 'svc-ic big'); c.append(ico(meta[2], 30)); top.append(c);
    col.append(top);
    const acts = el('div', 'two');
    acts.append(btn('btn pri xl', T('Chat about this'), () => startServiceChat(id)), btn('btn xl', T('Guide me step by step'), () => chatDo({ type: 'reply', id: 'go_' + id, title: T('Guide me step by step') }, T('Guide me step by step') + ': ' + (s?.name || T(meta[1])))));
    col.append(acts);
    if (s?.fee) col.append(group(T('Official fee'), row({ icon: 'rupee', title: s.fee })));
    if (s?.docs?.length) { const ul = el('ul', 'checklist'); for (const t of s.docs) { const li = el('li'); li.append(ico('check', 16), el('span', '', t.replace(/^[•\-]\s*/, ''))); ul.append(li); } col.append(group(T('What you need'), ul)); }
    if (s?.sites?.length) col.append(group(T('Official sites'), ...s.sites.map((u) => row({ icon: 'ext', title: u.replace(/^https:\/\//, ''), href: C.fixUrl(u) || u }))));
    if (s?.unverified?.length) col.append(note(T('Not confirmed by us: {list}. Check the official site.', { list: s.unverified.join(', ') }), 'help'));
    if (d.verified) col.append(el('p', 'mut small center', T('Information last checked {date}.', { date: d.verified })));
  };

  // ---- chats --------------------------------------------------------------------------------------
  SCREENS.chats = () => {
    const col = frame(T('All chats'), T('Your conversations are saved on this device.'));
    const list = C.chats.list.filter((c) => c.items.length);
    if (!list.length) { col.append(empty('msg', T('No chats yet'), T('Start a conversation and it will show up here.'), btn('btn pri', T('New chat'), () => { closeAll(); C.newChat(); }))); return; }
    const box = el('div', 'grp-box');
    for (const c of list) {
      const r = row({ icon: 'msg', title: c.title || T('New chat'), sub: fmtDate(c.ts) + ', ' + fmtTime(c.ts), onclick: () => { closeAll(); C.openChat(c.id, { fromSwitch: true }); } });
      box.append(r);
    }
    const g = el('section', 'grp'); g.append(box); col.append(g);
    col.append(btn('btn danger', T('Delete all chats'), () => confirmClearChats()));
  };
  function confirmClearChats() {
    showDialog({ title: T('Delete all chats?'), body: T('This removes the conversations saved on this device. Your wallet and saved details are not touched.'), actions: [btn('btn', T('Cancel'), closeDialog), btn('btn danger', T('Delete chats'), () => { closeDialog(); C.clearChats(); closeAll(); C.newChat(); toast(T('Chats deleted')); })] });
  }

  // ---- is this real? ---------------------------------------------------------------------------------
  SCREENS.check = () => {
    const col = frame(T('Is this real?'), T('Paste an SMS, WhatsApp message or link. Saathi checks it for signs of a scam.'));
    const ta = el('textarea', 'field-i big'); ta.rows = 5; ta.maxLength = 1500; ta.spellcheck = false; ta.placeholder = T('Paste the message or link here'); ta.setAttribute('aria-label', T('Message to check'));
    const go = btn('btn pri xl', T('Check it'), async () => {
      const text = ta.value.trim(); if (text.length < 4) return toast(T('Paste something to check.'));
      go.disabled = true; go.textContent = T('Checking…');
      const r = await api('/app/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, lang: C.uiLang() }) }).catch(() => ({ ok: false, j: {} }));
      go.disabled = false; go.textContent = T('Check it');
      out.replaceChildren();
      if (!r.ok) { out.append(note(T('Could not check that right now. Please try again.'), 'warn')); return; }
      const lv = r.j.level; const tone = lv === 'danger' ? 'bad' : lv === 'caution' || lv === 'private' ? 'warn' : 'good';
      const card = el('section', 'verdict ' + tone);
      const head = el('div', 'v-head'); head.append(el('h3', '', clean(r.j.headline)));
      const host = siteOf(text); if (host) head.append(siteBadge(host));
      card.append(head);
      if (r.j.lines?.length) { const list = el('div', 'v-l'); for (const l of r.j.lines) list.append(el('p', '', clean(l.text))); card.append(list); }
      if (r.j.advice) card.append(el('p', 'v-adv', clean(r.j.advice)));
      out.append(card);
    });
    const out = el('div', 'v-out');
    col.append(ta, go, out, note(T('Never share an OTP, PIN or password with anyone, even if they say they are from a government office.'), 'shield'));
  };

  // ---- locker, reminders -----------------------------------------------------------------------
  // ---- help -------------------------------------------------------------------------------------
  const FAQ = [
    [N('What is Saathi?'), N('Saathi is a guide for Indian government paperwork: PAN, Aadhaar, driving licence, passport, voter ID, GST and state certificates. It explains each step, checks your documents and gets your details ready to copy. You finish on the official website.')],
    [N('Is Saathi a government service?'), N('No. Saathi is independent and not connected to any government body. It always points you to the official website for the final step.')],
    [N('Does Saathi ask for my OTP or password?'), N('Never. If a message asks you for an OTP, PIN or password, it is not from Saathi. Enter those only on the official site.')],
    [N('What does it cost?'), N('You get free guide messages and free AI answers every day, and new people get a small welcome credit. After that each paid feature has a small price you can see in Wallet. A pack covers a whole paperwork job for a few days.')],
    [N('Is my data safe?'), N('Saved details and the locker are encrypted on our server and only kept if you choose. Your chats are saved on this device only, and you can delete them any time. You can delete everything in Settings.')],
    [N('Which languages work?'), N('The app works in English, Hindi and eight more Indian languages: Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam and Punjabi. Saathi answers in the language you write in, so you can switch between English and Hindi mid-chat. Some languages are translated by AI, so check important details.')],
    [N('My payment did not show up'), N('It can take a minute. Open Wallet and use “I have paid, check now”. If the money left your account and the wallet stays the same, email gethelp.saathi@gmail.com with your payment receipt.')],
    [N('How do I delete my data?'), N('Settings, then Delete all my data. It removes your saved details, locker, reminders and wallet from our server.')],
  ];
  // ---- privacy notice: lives inside the app so it always opens --------------------------------
  const PRIV = [
    ['lock', N('What we keep'), N('Your place in the guide and your language, deleted after a few hours of inactivity. Details you choose to save (name, date of birth, parents’ names, gender, address, PIN code, mobile number, email) are stored encrypted until you delete them. The locker keeps ID numbers and expiry dates, encrypted, hidden until you unlock. We never store Aadhaar card photos, card numbers or OTPs.')],
    ['scan', N('Photos, PDFs and voice notes'), N('Only read if you agree, held in memory and never saved. Voice notes are turned into text by a speech service and the audio is not kept.')],
    ['bell', N('Reminders'), N('If you set one, we keep its date, its name and your phone number (encrypted) so we can message you before it.')],
    ['wallet', N('Payments'), N('Paid on Stripe’s own page. We never see your card details. We keep the amount, date and reference for your wallet.')],
    ['spark', N('AI'), N('Free-form questions, document reading and translation are processed by an AI service. Your saved details are never sent to it. Languages other than English and Hindi are machine translated and may have mistakes.')],
    ['shield', N('What we never do'), N('We never ask for your OTP or password. Do not share them with anyone. Everything is stored under a scrambled ID, not your phone number.')],
    ['trash', N('Deleting your data'), N('Settings, then Delete all my data, removes your saved details, locker, reminders and wallet from our server.')],
  ];
  function privacyBody() {
    const box = el('div', 'priv');
    for (const [ic, h, t] of PRIV) {
      const r = el('section', 'priv-s'); const i = el('span', 'priv-ic'); i.append(ico(I[ic] ? ic : 'shield', 18));
      const x = el('div'); x.append(el('h3', '', T(h)), el('p', '', T(t))); r.append(i, x); box.append(r);
    }
    return box;
  }
  SCREENS.privacy = () => {
    const col = frame(T('Privacy notice'), T('What Saathi keeps, what it never does, and how to delete it all.'));
    col.append(privacyBody());
  };
  const showPrivacy = () => showDialog({ title: T('Privacy notice'), content: privacyBody(), actions: [btn('btn pri', T('Close'), closeDialog)] });
  C.showPrivacy = showPrivacy;

  SCREENS.help = async () => {
    const col = frame(T('Help and support'), T('Answers to the questions people ask most.'));
    const box = el('div', 'faq');
    for (const [q, a] of FAQ) { const d = el('details'); const s = el('summary', '', T(q)); const c = ico('chev', 18); c.classList.add('fq'); s.append(c); d.append(s, el('p', '', T(a))); box.append(d); }
    const g = el('section', 'grp'); g.append(el('h2', 'grp-t', T('Common questions')), box);
    col.append(g);
    const rows = [];
    if (C.cfg?.whatsapp) rows.push(row({ icon: 'wa', title: T('Chat on WhatsApp'), sub: T('Same Saathi, in your WhatsApp'), href: C.cfg.whatsapp }));
    rows.push(row({ icon: 'book', title: T('Where our facts come from'), sub: T('Official sources and when we last checked'), onclick: () => openScreen('sources') }));
    col.append(group(T('More'), ...rows));
  };

  // ---- settings ---------------------------------------------------------------------------------
  const langName = (code) => langList().find((l) => l.code === code)?.native || 'English';
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
  SCREENS.settings = async () => {
    const col = frame(T('Settings'));
    const m = await refreshMe();
    const theme = seg([['system', T('Auto')], ['light', T('Light')], ['dark', T('Dark')]], store.get('saathi.theme') || 'system', (v) => { store.set('saathi.theme', v); C.applyTheme(v); });
    const size = seg([['1', T('Normal')], ['1.18', T('Large')], ['1.36', T('Huge')]], String(Number(store.get('saathi.scale')) || 1), (v) => { store.set('saathi.scale', v); C.applyScale(Number(v)); });
    col.append(group(T('Preferences'),
      row({ icon: 'globe', title: T('Language'), value: langName(C.uiLang()), onclick: () => openScreen('language') }),
      row({ icon: 'moon', title: T('Appearance'), right: theme }),
      row({ icon: 'type', title: T('Text size'), right: size }),
    ));
    col.append(group(T('Money'),
      row({ icon: 'wallet', title: T('Wallet'), value: m.wallet?.balance, onclick: () => openScreen('wallet') }),
      row({ icon: 'pack', title: T('Packs'), value: m.wallet?.pack ? T('Active') : '', onclick: () => openScreen('packs') }),
      row({ icon: 'clock', title: T('Transaction history'), onclick: () => openScreen('activity') }),
    ));
    col.append(group(T('Your things'),
      row({ icon: 'msg', title: T('Chats'), value: String(C.chats.list.filter((c) => c.items.length).length || ''), onclick: () => openScreen('chats') }),
      row({ icon: 'lock', title: T('My locker'), value: m.account?.hasLocker ? T('In use') : T('Empty'), onclick: () => openScreen('locker') }),
      row({ icon: 'bell', title: T('Reminders'), value: String((m.account?.reminders || []).length || ''), onclick: () => openScreen('reminders') }),
      row({ icon: 'user', title: T('My details'), value: m.account?.hasProfile ? T('Saved') : T('None'), onclick: () => openScreen('details') }),
      row({ icon: 'apps', title: T('Applications'), onclick: () => openScreen('apps') }),
      ...(C.cfg?.link ? [row({ icon: 'devices', title: T('Devices and sync'), onclick: () => openScreen('devices') })] : []),
    ));
    const inst = [];
    if (!(matchMedia('(display-mode: standalone)').matches || navigator.standalone)) {
      if (/iphone|ipad/i.test(navigator.userAgent)) inst.push(row({ icon: 'download', title: T('Add to Home Screen'), sub: T('Tap Share, then Add to Home Screen') }));
      else inst.push(row({ icon: 'download', title: T('Install Saathi'), sub: T('Open it like an app'), onclick: async () => { if (!deferredInstall) return toast(T('Use your browser menu, then Install app.')); deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; } }));
    }
    col.append(group(T('Privacy and backup'),
      row({ icon: 'backup', title: T('Backup and restore'), sub: T('Move your wallet to a new phone'), onclick: () => openScreen('backup') }),
      row({ icon: 'shield', title: T('Privacy notice'), onclick: () => openScreen('privacy') }),
      ...inst,
    ));
    col.append(group(T('Help'),
      row({ icon: 'help', title: T('Help and support'), onclick: () => openScreen('help') }),
    ));
    col.append(group(T('Data'),
      row({ icon: 'chatx', title: T('Delete all my chats'), onclick: confirmClearChats }),
      row({ icon: 'trash', title: T('Delete all my data'), sub: T('Removes saved details, locker, reminders and wallet'), danger: true, onclick: confirmDelete }),
    ));
    col.append(el('p', 'mut small center about', T('Saathi 1.0 · Independent, not a government website')));
  };
  const grouped = (h) => h.match(/.{1,6}/g).join(' · ');
  SCREENS.backup = () => {
    const col = frame(T('Backup and restore'), T('Your balance and saved details belong to this device. Keep this code somewhere safe to restore them on a new phone or after clearing your browser.'));
    const hero = el('div', 'bk-hero'); const c1 = el('span', 'bk-ic'); c1.append(ico('backup', 26)); hero.append(c1, el('b', '', T('Your recovery code')));
    const code = el('div', 'code', grouped(C.sid));
    col.append(hero, code, btn('btn', T('Copy code'), function () { C.copyText(C.sid, this); }));
    col.append(note(T('Anyone with this code can use your balance. Never share it.'), 'lock'));
    const inp = el('input', 'field-i'); inp.placeholder = T('Paste a code to restore'); inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', T('Recovery code'));
    const go = btn('btn pri', T('Restore'), () => {
      const c = inp.value.toLowerCase().replace(/[^a-f0-9]/g, '');
      if (!/^[a-f0-9]{32,64}$/.test(c)) return toast(T('That code does not look right.'));
      store.set('saathi.sid', c); C.resetAfterDelete(); location.reload();
    });
    const g = el('section', 'grp'); const h2 = el('div', 'bk-hero sm'); const c2 = el('span', 'bk-ic'); c2.append(ico('restore', 22)); h2.append(c2, el('b', '', T('Restore from a code')));
    const r = el('div', 'restore'); r.append(inp, go); g.append(h2, r); col.append(g);
  };

  // ---- dialog -------------------------------------------------------------------------------------
  const dw = $('dialogWrap'); let dialogOpen = false;
  function showDialog({ title, body, busy, actions, content }) {
    dw.replaceChildren();
    const d = el('div', 'dialog'); d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
    if (busy) { const s = el('div', 'spin'); s.append(el('i')); d.append(s); }
    d.append(el('h3', '', title)); if (body) d.append(el('p', 'mut', body)); if (content) d.append(content);
    if (actions) { const a = el('div', 'd-acts'); for (const x of actions) a.append(x); d.append(a); }
    dw.append(d); dw.hidden = false; requestAnimationFrame(() => dw.classList.add('on')); dialogOpen = true;
  }
  function closeDialog() { dw.classList.remove('on'); dialogOpen = false; setTimeout(() => { if (!dialogOpen) dw.hidden = true; }, 200); }
  function confirmDelete() {
    showDialog({
      title: T('Delete all your data?'), body: T('This removes your saved details, locker, reminders and wallet balance from our server, and your chats from this device. It cannot be undone.'),
      actions: [btn('btn', T('Cancel'), closeDialog), btn('btn danger', T('Delete everything'), async () => {
        closeDialog(); await engine({ type: 'text', text: 'delete' }); await engine({ type: 'reply', id: 'delete_yes' });
        C.resetAfterDelete(); store.del('saathi.onboarded'); store.del('saathi.lang'); location.reload();
      })],
    });
  }

  // ---- welcome: five short steps. Continue stays off until the step is complete ---------------------
  // Only the About step asks for anything. Its fields are all needed, so there is no Skip.
  const OB_TOTAL = 5;
  const OB_SERVICES = [
    ['card', N('PAN card'), N('Apply, or fix a wrong name or date')],
    ['id', N('Aadhaar'), N('Update your address and details')],
    ['car', N('Driving licence'), N('Learner licence and renewal')],
    ['passport', N('Passport'), N('New application or renewal')],
    ['vote', N('Voter ID'), N('Correct your details')],
    ['gst', N('GST registration'), N('Register your business')],
  ];
  const ageOf = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) return null; const b = new Date(+m[1], +m[2] - 1, +m[3]); if (b > new Date()) return null; const n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a >= 0 && a < 121 ? a : null; };
  const field = (text, control, extra, asLabel = true) => { const w = el(asLabel ? 'label' : 'div', 'wl-field'); w.append(el('span', 'wl-lbl', text), control); if (extra) w.append(extra); return w; };

  C.onboarding = () => {
    const ob = $('onboard');
    ob.replaceChildren(); ob.hidden = false; document.body.classList.add('ob-open');
    requestAnimationFrame(() => ob.classList.add('on'));

    let step = 0; let busy = false; let langHolder = null; let aboutErr = null;
    let lang = langList().find((l) => l.code === C.uiLang()) || { code: C.uiLang(), native: C.uiLang(), en: C.uiLang() };
    const about = { name: '', dob: '', gender: '', state: '' };
    const todayISO = new Date().toISOString().slice(0, 10);
    const aboutReady = () => about.name.trim().length >= 2 && ageOf(about.dob) !== null && !!about.gender && about.state.trim().length >= 2;

    // ---- chrome: back, five-part progress, one Continue -------------------------------------------
    const back = btn('wl-back', ''); back.setAttribute('aria-label', T('Back')); back.append(ico('back', 22));
    const prog = el('div', 'wl-prog'); prog.setAttribute('role', 'progressbar'); prog.setAttribute('aria-valuemin', '1'); prog.setAttribute('aria-valuemax', String(OB_TOTAL));
    for (let i = 0; i < OB_TOTAL; i++) prog.append(el('i'));
    const brand = el('img', 'wl-brand'); brand.src = '/logo.svg'; brand.alt = ''; brand.setAttribute('aria-hidden', 'true');
    const top = el('header', 'wl-top'); top.append(brand, back, prog);
    const stage = el('main', 'wl-stage');
    const hint = el('p', 'wl-hint'); hint.setAttribute('aria-live', 'polite');
    const next = btn('wl-next', '');
    const foot = el('footer', 'wl-foot'); foot.append(hint, next);
    const wrap = el('div', 'wl'); wrap.append(top, stage, foot);
    ob.append(wrap);

    // Continue is off until the step is complete; on About it also says what is still missing.
    function sync() {
      const onAbout = step === 1;
      const ok = !onAbout || aboutReady();
      next.disabled = busy || !ok;
      next.setAttribute('aria-disabled', String(next.disabled));
      if (onAbout && !ok && !busy) {
        const missing = [];
        if (about.name.trim().length < 2) missing.push(T('your name'));
        if (ageOf(about.dob) === null) missing.push(T('date of birth'));
        if (!about.gender) missing.push(T('gender'));
        if (about.state.trim().length < 2) missing.push(T('state'));
        hint.textContent = T('Still to add: {items}', { items: missing.join(', ') });
      } else hint.textContent = '';
    }
    function label() {
      next.textContent = step === 0 ? (lang.code === 'en' ? T('Continue in {lang}', { lang: lang.en }) : T('Continue')) : step === OB_TOTAL - 1 ? T('Start using Saathi') : T('Continue');
    }
    const pickLang = (l) => { lang = l; label(); };

    // ---- the five steps ------------------------------------------------------------------------------
    const views = [
      () => { // 1: welcome and language
        const page = el('section', 'wl-page wl-welcome');
        const h = el('h1', '', T('Welcome to Saathi')); h.tabIndex = -1;
        const p = el('p', 'wl-sub', T('Pick the language you read in.'));
        langHolder = el('div', 'wl-langs');
        langPicker(langHolder, { current: lang.code, onPick: pickLang });
        page.append(el('p', 'wl-eye', T('Step {n} of {total}', { n: 1, total: OB_TOTAL })), h, p, langHolder);
        return page;
      },
      () => { // 2: about you (all four needed)
        const page = el('section', 'wl-page');
        const eyebrow = el('p', 'wl-eye', T('Step {n} of {total}', { n: 2, total: OB_TOTAL }));
        const h = el('h1', '', T('Tell us about you')); h.tabIndex = -1;
        const p = el('p', 'wl-sub', T('Saathi fills your forms from these, so you never type them twice. Saved encrypted on our server. Never shared, and never sent to the AI.'));
        const form = el('div', 'wl-form');

        const nm = el('input', 'wl-in'); nm.type = 'text'; nm.autocomplete = 'name'; nm.maxLength = 80; nm.placeholder = T('As on your Aadhaar'); nm.value = about.name;
        nm.addEventListener('input', () => { about.name = nm.value; sync(); });

        const dob = el('input', 'wl-in'); dob.type = 'date'; dob.max = todayISO; dob.value = about.dob; dob.autocomplete = 'bday';
        const age = el('small', 'wl-hint-small');
        const showAge = () => { const n = ageOf(dob.value); age.textContent = n === null ? '' : T('Age: {n}', { n }); };
        const onDob = () => { about.dob = dob.value; showAge(); sync(); };
        dob.addEventListener('input', onDob); dob.addEventListener('change', onDob); showAge();

        const chips = el('div', 'wl-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', T('Gender'));
        for (const [v, text] of [['male', T('Male')], ['female', T('Female')], ['other', T('Other')]]) {
          const b = btn('', text); b.setAttribute('aria-pressed', String(about.gender === v));
          b.onclick = () => { about.gender = v; for (const c of chips.children) c.setAttribute('aria-pressed', String(c === b)); sync(); };
          chips.append(b);
        }

        const dd = C.dropdown({ label: T('State'), search: true, placeholder: T('Your state'), options: STATE_LIST.map((n) => [n, n]), value: about.state || '', onChange: (v) => { about.state = v; sync(); } });
        dd.classList.add('wl-dd');

        aboutErr = el('p', 'wl-err'); aboutErr.setAttribute('role', 'alert'); aboutErr.hidden = true;
        form.append(
          field(T('Full name'), nm),
          field(T('Date of birth'), dob, age),
          field(T('Gender'), chips, null, false),
          field(T('State'), dd, null, false),
          aboutErr,
        );
        // Enter moves on, but only when every field is filled
        form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && aboutReady() && !busy) { e.preventDefault(); next.click(); } });
        page.append(eyebrow, h, p, form);
        return page;
      },
      () => { // 3: what Saathi helps with
        const page = el('section', 'wl-page');
        const h = el('h1', '', T('Paperwork, one step at a time')); h.tabIndex = -1;
        const p = el('p', 'wl-sub', T('For each one, Saathi lists the documents to keep ready, the fee and the official link. Start from Home, any time.'));
        const ul = el('ul', 'wl-svc');
        OB_SERVICES.forEach(([icon, name, desc], i) => {
          const li = el('li'); li.style.setProperty('--i', i);
          const badge = el('span', 'wl-ic'); badge.append(ico(icon, 22));
          li.append(badge, el('b', '', T(name)), el('span', '', T(desc)));
          ul.append(li);
        });
        page.append(el('p', 'wl-eye', T('Step {n} of {total}', { n: 3, total: OB_TOTAL })), h, p, ul);
        return page;
      },
      () => { // 4: what stays in your hands
        const page = el('section', 'wl-page');
        const h = el('h1', '', T('You stay in control')); h.tabIndex = -1;
        const p = el('p', 'wl-sub', T('Saathi never does the sensitive steps for you.'));
        const ul = el('ul', 'wl-points');
        const rows = [
          ['lock', T('Your locker is private'), T('ID numbers and dates stay hidden until you unlock them.')],
          ['shield', T('Never your OTP'), T('Saathi never asks for an OTP, PIN or card number.')],
          ['ext', T('You finish on the official site'), T('Saathi shows each step and the official link. You press the final button yourself.')],
        ];
        rows.forEach(([icon, title, text], i) => {
          const li = el('li'); li.style.setProperty('--i', i);
          const badge = el('span', 'wl-ic'); badge.append(ico(icon, 22));
          const d = el('div'); d.append(el('b', '', title), el('p', '', text));
          li.append(badge, d);
          ul.append(li);
        });
        const privacy = btn('wl-link', T('How your data is handled'), () => C.showPrivacy());
        page.append(el('p', 'wl-eye', T('Step {n} of {total}', { n: 4, total: OB_TOTAL })), h, p, ul, privacy);
        return page;
      },
      () => { // 5: ready
        const page = el('section', 'wl-page');
        const tickHost = el('div'); tickHost.innerHTML = '<svg class="wl-tick" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46"/><path d="M29 50l13 13 26-28"/></svg>';
        const first = about.name.trim().split(/\s+/)[0] || '';
        const h = el('h1', '', first ? T('You are all set, {name}.', { name: first }) : T('You are all set.')); h.tabIndex = -1;
        const p = el('p', 'wl-sub', T('Ask in your own words, or pick a service from Home. Your details are saved encrypted.'));
        page.append(el('p', 'wl-eye', T('Step {n} of {total}', { n: 5, total: OB_TOTAL })), h, p, tickHost.firstElementChild);
        return page;
      },
    ];

    // ---- moving between steps -------------------------------------------------------------------------
    function render(dir) {
      const view = views[step]();
      view.classList.add(dir >= 0 ? 'wl-in-r' : 'wl-in-l');
      stage.replaceChildren(view); stage.scrollTop = 0;
      [...prog.children].forEach((b, i) => { b.className = i < step ? 'done' : i === step ? 'on' : ''; });
      back.classList.toggle('off', step === 0);
      brand.hidden = step !== 0; back.hidden = step === 0;
      label(); sync();
      const h = view.querySelector('h1'); if (h) h.focus({ preventScroll: true });
    }
    function go(n) {
      if (busy) return;
      const dir = n >= step ? 1 : -1;
      step = Math.max(0, Math.min(OB_TOTAL - 1, n));
      render(dir);
    }
    back.onclick = () => { if (step > 0) go(step - 1); };

    // About you: check the state name with the server, then save the four details
    const tsend = async (op, args) => { const r = await api('/app/api/t', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, args }) }).catch(() => ({ ok: false, status: 0, j: {} })); return r.ok ? { ok: true, data: r.j.data } : { ok: false, status: r.status || 0, error: r.j?.error }; };
    const stateSeen = new Map();
    const checkState = async (v) => { const k = v.trim().toLowerCase(); if (stateSeen.has(k)) return stateSeen.get(k); const r = await tsend('state.find', { text: v }); if (r.ok) stateSeen.set(k, r); return r; };
    async function saveAbout() {
      const v = { full_name: about.name.trim(), dob: about.dob, gender: about.gender, state: about.state.trim() };
      const bad = (m) => { if (aboutErr) { aboutErr.textContent = m; aboutErr.hidden = false; aboutErr.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); } return false; };
      if (v.state) { const r = await checkState(v.state); if (r.ok && !r.data.name) return bad(T('I don’t know a state like that. Try the full name of an Indian state.')); if (r.ok) v.state = r.data.name; }
      const values = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
      const r = await tsend('details.set', { values });
      if (!r.ok) return bad(r.status === 429 ? T('Too many tries in a row. Wait a minute, then tap Continue again.') : r.status === 0 ? T('No connection. Check your internet and tap Continue again.') : T('Something went wrong. Please try again.'));
      if (r.data.bad?.length) return bad(T('Some of that does not look right. Check the name and date.'));
      if (about.state) store.set('saathi.state', about.state);
      return true;
    }

    async function finish() {
      busy = true; sync();
      store.set('saathi.onboarded', '1');
      if (!store.get('saathi.lang')) store.set('saathi.lang', lang.code);
      api('/app/api/lang', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: C.uiLang() }) }).then(() => refreshMe()).catch(() => {});
      ob.classList.remove('on'); document.body.classList.remove('ob-open');
      setTimeout(() => { ob.hidden = true; ob.replaceChildren(); C.openPending?.(); C.refreshHome?.(); }, 420);
      C.welcome(); C.applyStatic();
    }

    next.onclick = async () => {
      if (busy || next.disabled) return;
      if (step === 0) {
        if (lang.code === 'en' && C.uiLang() === 'en') { store.set('saathi.lang', 'en'); return go(1); }
        busy = true; sync();
        next.textContent = lang.code === 'hi' ? T('Getting ready…') : T('Setting up {lang}…', { lang: lang.en });
        const [r] = await Promise.all([api('/app/api/lang', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: lang.code }) }), C.loadUI(lang.code, { wait: 90000 })]);
        busy = false; sync();
        if (!r.ok || !r.j.ok) { toast(T('Could not change the language. Please try again.')); label(); return; }
        store.set('saathi.lang', lang.code); C.applyStatic(); buildSidebar();
        return go(1);
      }
      if (step === 1) {
        if (!aboutReady()) return;
        busy = true; sync();
        const ok = await saveAbout();
        busy = false; sync();
        if (ok) go(2);
        return;
      }
      if (step < OB_TOTAL - 1) return go(step + 1);
      await finish();
    };

    // The server's language list can arrive after the welcome has opened; redraw the list then.
    C.welcomeLangs = () => {
      if (!langHolder || !langHolder.isConnected || step !== 0) return;
      lang = langList().find((l) => l.code === lang.code) || lang;
      langHolder.replaceChildren();
      langPicker(langHolder, { current: lang.code, onPick: pickLang });
      label();
    };

    render(0);
  };

  // A service picked on the landing page (?service=pan, or kept from its onboarding) opens once the app is ready.
  C.openPending = () => {
    // A payment return held during the welcome opens now that the welcome is closed.
    if (store.get('saathi.onboarded') && !document.body.classList.contains('ob-open')) {
      let pay = null;
      try { pay = JSON.parse(sessionStorage.getItem('saathi.topup') || 'null'); sessionStorage.removeItem('saathi.topup'); } catch { pay = null; }
      if (pay) { openScreen('payreturn', pay); return; }
    }
    const q = new URLSearchParams(location.search).get('service');
    if (q) { try { sessionStorage.setItem('saathi.open', q); } catch { /* private mode */ } history.replaceState(null, '', '/app'); }
    let id = null; try { id = sessionStorage.getItem('saathi.open'); } catch { /* private mode */ }
    if (!id || !store.get('saathi.onboarded') || document.body.classList.contains('ob-open')) return;
    if (!SERVICES.some((s) => s[0] === id)) return;
    try { sessionStorage.removeItem('saathi.open'); } catch { /* private mode */ }
    openScreen('service', { id });
  };
  C.ui = { STATE_LIST, frame, row, group, seg, note, empty, btn, ico, SCREENS, openScreen, goBack, closeAll, showDialog, closeDialog, refreshMe, rupee, fmtDate, chatDo, startServiceChat, loadServices, svcMeta, SERVICES, packName };
  buildSidebar();
  C.rebuild = buildSidebar;
  C.openScreen = openScreen;
})();
