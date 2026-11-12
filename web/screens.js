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
    menu: 'M4 5L20 5M4 12L20 12M4 19L20 19',
    attach: 'M16 6L7.586 14.586A2 2 0 0 0 10.415 17.415L18.829 8.829A4 4 0 1 0 13.172 3.172L4.793 11.723A6 6 0 1 0 13.278 20.208L21.657 11.657',
    down: 'M6 9L12 15L18 9',
    plus: 'M5 12L19 12M12 5L12 19',
    chev: 'M9 18L15 12L9 6',
    back: 'M15 18L9 12L15 6',
    close: 'M18 6L6 18M6 6L18 18',
    check: 'M20 6L9 17L4 12',
    card: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2zM2 10L22 10M6 14L8 14',
    id: 'M13 19A4 4 0 0 0 5 19M16 10L18 10M16 14L18 14M6 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0zM4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2z',
    car: 'M19 17L21 17C21.6 17 22 16.6 22 16L22 13C22 12.1 21.3 11.3 20.5 11.1C18.7 10.6 16 10 16 10C16 10 14.7 8.6 13.8 7.7C13.3 7.3 12.7 7 12 7L5 7C4.4 7 3.9 7.4 3.6 7.9L2.2 10.8A3.7 3.7 0 0 0 2 12L2 16C2 16.6 2.4 17 3 17L5 17M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0zM9 17L15 17M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z',
    passport: 'M15 13A3 3 0 1 0 9 13M4 19.5L4 4.5A2.5 2.5 0 0 1 6.5 2L19 2A1 1 0 0 1 20 3L20 21A1 1 0 0 1 19 22L6.5 22A1 1 0 0 1 6.5 17L20 17M10 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z',
    vote: 'M9 12L11 14L15 10M5 7C5 5.9 5.9 5 7 5L17 5A2 2 0 0 1 19 7L19 19L5 19L5 7ZM22 19L2 19',
    gst: 'M12 17L12 7M16 8L10 8A2 2 0 0 0 10 12L14 12A2 2 0 0 1 14 16L8 16M4 3A1 1 0 0 1 5 2A1.3 1.3 0 0 1 5.7 2.2L6.633 2.8A1.3 1.3 0 0 0 8.033 2.8L8.967 2.2A1.3 1.3 0 0 1 10.367 2.2L11.3 2.8A1.3 1.3 0 0 0 12.7 2.8L13.633 2.2A1.3 1.3 0 0 1 15.033 2.2L15.967 2.8A1.3 1.3 0 0 0 17.367 2.8L18.3 2.2A1.3 1.3 0 0 1 19 2A1 1 0 0 1 20 3L20 21A1 1 0 0 1 19 22A1.3 1.3 0 0 1 18.3 21.8L17.367 21.2A1.3 1.3 0 0 0 15.967 21.2L15.033 21.8A1.3 1.3 0 0 1 13.633 21.8L12.7 21.2A1.3 1.3 0 0 0 11.3 21.2L10.367 21.8A1.3 1.3 0 0 1 8.967 21.8L8.033 21.2A1.3 1.3 0 0 0 6.633 21.2L5.7 21.8A1.3 1.3 0 0 1 5 22A1 1 0 0 1 4 21Z',
    cert: 'M15.477 12.89L16.992 21.416A0.5 0.5 0 0 1 16.182 21.886L12.602 19.199A1 1 0 0 0 11.405 19.199L7.819 21.885A0.5 0.5 0 0 1 7.009 21.416L8.523 12.89M6 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z',
    scan: 'M3 7L3 5A2 2 0 0 1 5 3L7 3M17 3L19 3A2 2 0 0 1 21 5L21 7M21 17L21 19A2 2 0 0 1 19 21L17 21M7 21L5 21A2 2 0 0 1 3 19L3 17',
    doc: 'M6 22A2 2 0 0 1 4 20L4 4A2 2 0 0 1 6 2L14 2A2.4 2.4 0 0 1 15.704 2.706L19.292 6.294A2.4 2.4 0 0 1 20 8L20 20A2 2 0 0 1 18 22ZM14 2L14 7A1 1 0 0 0 15 8L20 8M10 9L8 9M16 13L8 13M16 17L8 17',
    lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2zM7 11L7 7A5 5 0 0 1 17 7L17 11',
    bell: 'M10.268 21A2 2 0 0 0 13.732 21M3.262 15.326A1 1 0 0 0 4 17L20 17A1 1 0 0 0 20.74 15.327C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8C6 12.499 4.589 13.956 3.262 15.326',
    shield: 'M20 13C20 18 16.5 20.5 12.34 21.95A1 1 0 0 1 11.67 21.94C7.5 20.5 4 18 4 13L4 6A1 1 0 0 1 5 5C7 5 9.5 3.8 11.24 2.28A1.17 1.17 0 0 1 12.76 2.28C14.51 3.81 17 5 19 5A1 1 0 0 1 20 6ZM9 12L11 14L15 10',
    wallet: 'M19 7L19 4A1 1 0 0 0 18 3L5 3A2 2 0 0 0 5 7L20 7A1 1 0 0 1 21 8L21 12L18 12A2 2 0 0 0 18 16L21 16A1 1 0 0 0 22 15L22 13A1 1 0 0 0 21 12M3 5L3 19A2 2 0 0 0 5 21L20 21A1 1 0 0 0 21 20L21 16',
    sliders: 'M10 5L3 5M12 19L3 19M14 3L14 7M16 17L16 21M21 12L12 12M21 19L16 19M21 5L14 5M8 10L8 14M8 12L3 12',
    help: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM9.09 9A3 3 0 0 1 14.92 10C14.92 12 11.92 13 11.92 13M12 17L12.01 17',
    globe: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM12 2A14.5 14.5 0 0 0 12 22A14.5 14.5 0 0 0 12 2M2 12L22 12',
    user: 'M19 21L19 19A4 4 0 0 0 15 15L9 15A4 4 0 0 0 5 19L5 21M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0z',
    clock: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM12 6L12 12L16 14',
    moon: 'M20.985 12.486A9 9 0 1 1 11.512 3.014C11.917 2.992 12.129 3.474 11.914 3.817A6 6 0 0 0 20.182 12.085C20.526 11.87 21.007 12.081 20.985 12.486',
    trash: 'M10 11L10 17M14 11L14 17M19 6L19 20A2 2 0 0 1 17 22L7 22A2 2 0 0 1 5 20L5 6M3 6L21 6M8 6L8 4A2 2 0 0 1 10 2L14 2A2 2 0 0 1 16 4L16 6',
    ext: 'M15 3L21 3L21 9M10 14L21 3M18 13L18 19A2 2 0 0 1 16 21L5 21A2 2 0 0 1 3 19L3 8A2 2 0 0 1 5 6L11 6',
    backup: 'M12 13L12 21M4 14.899A7 7 0 1 1 15.71 8L17.5 8A4.5 4.5 0 0 1 20 16.242M8 17L12 13L16 17',
    restore: 'M12 13L12 21L8 17M12 21L16 17M4.393 15.269A7 7 0 1 1 15.71 8L17.5 8A4.5 4.5 0 0 1 19.936 16.284',
    msg: 'M22 17A2 2 0 0 1 20 19L6.828 19A2 2 0 0 0 5.414 19.586L3.212 21.788A0.71 0.71 0 0 1 2 21.286L2 5A2 2 0 0 1 4 3L20 3A2 2 0 0 1 22 5Z',
    download: 'M12 15L12 3M21 15L21 19A2 2 0 0 1 19 21L5 21A2 2 0 0 1 3 19L3 15M7 10L12 15L17 10',
    plusc: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM8 12L16 12M12 8L12 16',
    warn: 'M21.73 18L13.73 4A2 2 0 0 0 10.25 4L2.25 18A2 2 0 0 0 4 21L20 21A2 2 0 0 0 21.73 18M12 9L12 13M12 17L12.01 17',
    star: 'M11.525 2.295A0.53 0.53 0 0 1 12.475 2.295L14.785 6.974A2.123 2.123 0 0 0 16.38 8.134L21.546 8.89A0.53 0.53 0 0 1 21.84 9.794L18.104 13.432A2.123 2.123 0 0 0 17.493 15.31L18.375 20.45A0.53 0.53 0 0 1 17.604 21.01L12.986 18.582A2.122 2.122 0 0 0 11.013 18.582L6.396 21.01A0.53 0.53 0 0 1 5.626 20.45L6.507 15.311A2.122 2.122 0 0 0 5.896 13.432L2.16 9.795A0.53 0.53 0 0 1 2.454 8.889L7.619 8.134A2.122 2.122 0 0 0 9.216 6.974Z',
    search: 'M21 21L16.66 16.66M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0z',
    refresh: 'M3 12A9 9 0 0 1 12 3A9.75 9.75 0 0 1 18.74 5.74L21 8M21 3L21 8L16 8M21 12A9 9 0 0 1 12 21A9.75 9.75 0 0 1 5.26 18.26L3 16M8 16L3 16L3 21',
    bolt: 'M15.914 4A1.5 1.5 0 0 0 13.44 2.439L4.44 11.439A1.5 1.5 0 0 0 5.5 14L9.502 14A0.5 0.5 0 0 1 9.973 14.666L8.086 20A1.5 1.5 0 0 0 10.561 21.56L19.561 12.56A1.5 1.5 0 0 0 18.5 10L14.503 10A0.5 0.5 0 0 1 14.031 9.333Z',
    tkt: 'M2 9A3 3 0 0 1 2 15L2 17A2 2 0 0 0 4 19L20 19A2 2 0 0 0 22 17L22 15A3 3 0 0 1 22 9L22 7A2 2 0 0 0 20 5L4 5A2 2 0 0 0 2 7ZM13 5L13 7M13 17L13 19M13 11L13 13',
    stk: 'M12.83 2.18A2 2 0 0 0 11.17 2.18L2.6 6.08A1 1 0 0 0 2.6 7.91L11.18 11.82A2 2 0 0 0 12.84 11.82L21.42 7.92A1 1 0 0 0 21.42 6.09ZM2 12A1 1 0 0 0 2.58 12.91L11.18 16.82A2 2 0 0 0 12.83 16.82L21.41 12.92A1 1 0 0 0 22 12M2 17A1 1 0 0 0 2.58 17.91L11.18 21.82A2 2 0 0 0 12.83 21.82L21.41 17.92A1 1 0 0 0 22 17',
    crown: 'M11.562 3.266A0.5 0.5 0 0 1 12.438 3.266L15.39 8.87A1 1 0 0 0 16.906 9.164L21.183 5.5A0.5 0.5 0 0 1 21.981 6.019L19.147 16.265A1 1 0 0 1 18.191 16.999L5.81 16.999A1 1 0 0 1 4.853 16.265L2.02 6.02A0.5 0.5 0 0 1 2.818 5.501L7.094 9.165A1 1 0 0 0 8.61 8.871ZM5 21L19 21',
    mic: 'M12 19L12 22M19 10L19 12A7 7 0 0 1 5 12L5 10M12 2h0a3 3 0 0 1 3 3v7a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3v-7a3 3 0 0 1 3 -3z',
    rupee: 'M14 20L6 12L10 12C15.333 12 15.333 4 10 4M6 4L18 4M6 8L18 8',
    people: 'M16 21L16 19A4 4 0 0 0 12 15L6 15A4 4 0 0 0 2 19L2 21M16 3.128A4 4 0 0 1 16 10.872M22 21L22 19A4 4 0 0 0 19 15.13M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0z',
    book: 'M12 5L12 21M20.001 19A2 2 0 0 0 22 17L22 5A2 2 0 0 0 20.001 3L16 3.002A5 5 0 0 0 12 5A5 5 0 0 0 8 3L4 3A2 2 0 0 0 2 5L2 17A2 2 0 0 0 3.999 19L8 19A5 5 0 0 1 12 21A5 5 0 0 1 16 19Z',
    chatx: 'M19 19L6.828 19A2 2 0 0 0 5.414 19.586L3.212 21.788A0.7 0.7 0 0 1 2 21.286L2 5A2 2 0 0 1 3.184 3.174M2 2L22 22M8.656 3L20 3A2 2 0 0 1 22 5L22 16.344',
    type: 'M12 4L12 20M4 7L4 5A1 1 0 0 1 5 4L19 4A1 1 0 0 1 20 5L20 7M9 20L15 20',
    tools: 'M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1zM15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1zM15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1zM4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z',
    photo: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2zM7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0zM21 15L17.914 11.914A2 2 0 0 0 15.086 11.914L6 21',
    devices: 'M18 8L18 6A2 2 0 0 0 16 4L4 4A2 2 0 0 0 2 6L2 13A2 2 0 0 0 4 15L12 15M10 19L10 15.04L10 18.19M7 19L12 19M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2z',
    apps: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2zM10 4L10 8M2 8L22 8M6 4L6 8',
    eye: 'M2.062 12.348A1 1 0 0 1 2.062 11.652A10.75 10.75 0 0 1 21.938 11.652A1 1 0 0 1 21.938 12.348A10.75 10.75 0 0 1 2.062 12.348M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z',
    eyeoff: 'M10.733 5.076A10.744 10.744 0 0 1 21.938 11.651A1 1 0 0 1 21.938 12.347A10.747 10.747 0 0 1 20.494 14.837M14.084 14.158A3 3 0 0 1 9.842 9.916M17.479 17.499A10.75 10.75 0 0 1 2.062 12.348A1 1 0 0 1 2.062 11.652A10.75 10.75 0 0 1 6.508 6.509M2 2L22 22',
    copy: 'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2zM4 16C2.9 16 2 15.1 2 14L2 4C2 2.9 2.9 2 4 2L14 2C15.1 2 16 2.9 16 4',
    phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2zM12 18L12.01 18',
    link: 'M10 13A5 5 0 0 0 17.54 13.54L20.54 10.54A5 5 0 0 0 13.47 3.47L11.75 5.18M14 11A5 5 0 0 0 6.46 10.46L3.46 13.46A5 5 0 0 0 10.53 20.53L12.24 18.82',
    sync: 'M21 12A9 9 0 0 0 12 3A9.75 9.75 0 0 0 5.26 5.74L3 8M3 3L3 8L8 8M3 12A9 9 0 0 0 12 21A9.75 9.75 0 0 0 18.74 18.26L21 16M16 16L21 16L21 21',
    camera: 'M13.997 4A2 2 0 0 1 15.757 5.05L16.243 5.95A2 2 0 0 0 18.003 7L20 7A2 2 0 0 1 22 9L22 18A2 2 0 0 1 20 20L4 20A2 2 0 0 1 2 18L2 9A2 2 0 0 1 4 7L5.997 7A2 2 0 0 0 7.756 5.952L8.245 5.048A2 2 0 0 1 10.004 4ZM9 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z',
    calendar: 'M8 2L8 5M16 2L16 5M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2zM3 9L21 9',
    edit: 'M21.174 6.812A1 1 0 0 0 17.188 2.825L3.842 16.174A2 2 0 0 0 3.342 17.004L2.021 21.356A0.5 0.5 0 0 0 2.644 21.978L6.997 20.658A2 2 0 0 0 7.827 20.161ZM15 5L19 9',
    wa: 'M2.992 16.342A2 2 0 0 1 3.086 17.509L2.021 20.799A1 1 0 0 0 3.257 21.967L6.67 20.969A2 2 0 0 1 7.769 21.061A10 10 0 1 0 2.992 16.342',
    tag: 'M12.586 2.586A2 2 0 0 0 11.172 2L4 2A2 2 0 0 0 2 4L2 11.172A2 2 0 0 0 2.586 12.586L11.29 21.29A2.426 2.426 0 0 0 14.71 21.29L21.29 14.71A2.426 2.426 0 0 0 21.29 11.29ZM7 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0z',
    pack: 'M11 21.73A2 2 0 0 0 13 21.73L20 17.73A2 2 0 0 0 21 16L21 8A2 2 0 0 0 20 6.27L13 2.27A2 2 0 0 0 11 2.27L4 6.27A2 2 0 0 0 3 8L3 16A2 2 0 0 0 4 17.73ZM12 22L12 12M3.29 7L12 12L20.71 7M7.5 4.27L16.5 9.42',
    spark: 'M11.017 2.814A1 1 0 0 1 12.983 2.814L14.034 8.372A2 2 0 0 0 15.628 9.966L21.186 11.017A1 1 0 0 1 21.186 12.983L15.628 14.034A2 2 0 0 0 14.034 15.628L12.983 21.186A1 1 0 0 1 11.017 21.186L9.966 15.628A2 2 0 0 0 8.372 14.034L2.814 12.983A1 1 0 0 1 2.814 11.017L8.372 9.966A2 2 0 0 0 9.966 8.372ZM20 2L20 6M22 4L18 4M2 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z',
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
  function chatDo(payload, shown) {
    // Saathi is still answering the last message: say so, rather than drop this one without a word.
    if (C.isBusy?.()) { C.toast?.(T('Saathi is still answering. Try again in a moment.')); return; }
    closeAll(); closeSidebar(); if (C.showTab) C.showTab('chat'); C.send(payload, shown);
  }

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
  let colObs = null;
  let frameOf = null; // the page the frame on screen was built for
  let inPlace = false; // true while a page redraws its own content (a tab, a person, a filter)
  let calmUntil = 0; // until this time, content that lands is part of a same-page swap and does not rise on its own
  function frame(title, sub) {
    const cur = stack[stack.length - 1];
    // Same page, new content: keep the header and back button where they are, and only swap the content.
    if (inPlace && cur && frameOf === cur.name && screen.querySelector('.sc-col')) {
      const col = screen.querySelector('.sc-col');
      const small = screen.querySelector('.sc-small'); if (small) small.textContent = title;
      const big = el('div', 'sc-big'); big.append(el('h1', '', title)); if (sub) big.append(el('p', '', sub));
      col.replaceChildren(big);
      return col;
    }
    frameOf = cur ? cur.name : null;
    screen.replaceChildren();
    const head = el('header', 'sc-head');
    const nested = stack.length > 1;
    const back = el('button', 'icon-btn sc-back'); back.type = 'button'; back.setAttribute('aria-label', T(nested ? 'Back' : 'Close')); back.append(ico(nested ? 'back' : 'close', 22));
    back.onclick = goBack;
    const h = el('div', 'sc-small', title);
    if (nested) head.append(back, h); else { back.classList.add('sc-x-r'); head.append(h, back); }
    const body = el('div', 'sc-body'); const col = el('div', 'sc-col'); body.append(col);
    const big = el('div', 'sc-big'); big.append(el('h1', '', title)); if (sub) big.append(el('p', '', sub));
    col.append(big);
    // Anything that lands on the page later, such as data that arrives after a moment, rises in the same way.
    colObs?.disconnect();
    colObs = new MutationObserver((muts) => {
      let i = 0;
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof Element) || n.classList.contains('sc-big') || n.classList.contains('rise')) continue;
        if (performance.now() < calmUntil) continue;
        // The sliding tab line is positioned by script; a rise animation would pin its transform.
        // A form that swaps in place (a person, a tab) has its own motion on the wrapper, so its contents do not rise one by one.
        if (n.classList.contains('tab-line') || n.parentElement?.closest('.g-tabs, .seg, .g-pane, .dt-wrap, .dt-people')) continue;
        n.classList.add('rise'); n.style.setProperty('--d', Math.min(i++, 12) * 40 + 'ms');
      }
    });
    colObs.observe(col, { childList: true, subtree: true });
    body.addEventListener('scroll', () => head.classList.toggle('scrolled', body.scrollTop > 48), { passive: true });
    screen.append(head, body);
    return col;
  }
  let hideTimer = 0, backTimer = 0;
  function openScreen(name, params = {}) {
    closeSidebar(); clearTimeout(hideTimer); clearTimeout(backTimer); screen.classList.remove('leaving'); document.body.classList.remove('screen-back');
    // A page of the same kind (one service for another) takes the place of the open one, so the back arrow
    // always returns to the page you came from, not through every service you looked at.
    const top = stack[stack.length - 1];
    if (top && top.name === name) top.params = params;
    else stack.push({ name, params });
    if (stack.length === 1) { try { history.pushState({ saathi: 1 }, ''); } catch { /* fine */ } }
    render();
    screen.hidden = false; requestAnimationFrame(() => screen.classList.add('on'));
    document.body.classList.add('screen-open');
  }
  function render() {
    const cur = stack[stack.length - 1];
    if (!cur) return;
    markActive(cur.name === 'service' ? 'svc_' + cur.params.id : ['topup', 'packs', 'activity'].includes(cur.name) ? 'wallet' : ['backup', 'language'].includes(cur.name) ? 'settings' : cur.name);
    if (!inPlace) screen.scrollTop = 0;
    // Nothing stands in for the page while it loads: content rises in as it arrives.
    const ret = SCREENS[cur.name](cur.params);
    if (ret && typeof ret.catch === 'function') ret.catch(() => { /* the page keeps what it has */ });
    if (!inPlace) {
      screen.classList.remove('swap'); void screen.offsetWidth; screen.classList.add('swap');
      // Moving from one page to another: the page fades and slides up again. It is already open, so its own animation would not run on its own.
      if (screen.classList.contains('on')) { screen.classList.remove('on'); void screen.offsetWidth; screen.classList.add('on'); }
    }
  }
  // Same page, different content (a tab, a person, a filter). The page stays put and the back arrow still goes to the page before it.
  function redraw(params) {
    const cur = stack[stack.length - 1];
    if (!cur) return;
    if (params) cur.params = { ...cur.params, ...params };
    inPlace = true;
    try { render(); } finally { inPlace = false; }
    // The new content rises in as one block (the page fades and slides up), not item by item.
    calmUntil = performance.now() + 900;
    const col = screen.querySelector('.sc-col');
    if (col) { col.classList.remove('sw-in'); void col.offsetWidth; col.classList.add('sw-in'); }
  }
  function goBack() { stack.pop(); if (stack.length) render(); else hideScreen(); }
  // Closing: the page plays its own exit (the 'leaving' keyframes in system.css), and the page underneath rises in as it goes.
  // Removing 'on' alone would drop the page's animation at once, so the exit has to be a class of its own.
  function hideScreen() {
    clearTimeout(hideTimer); clearTimeout(backTimer);
    screen.classList.remove('on'); screen.classList.add('leaving'); markActive(null);
    document.body.classList.remove('screen-open'); document.body.classList.add('screen-back');
    hideTimer = setTimeout(() => {
      if (stack.length) return; // a page was opened again while this one was leaving
      screen.classList.remove('leaving'); screen.hidden = true; screen.replaceChildren();
    }, 280);
    // The page underneath has finished rising once its .38s animation is over. Then its tab classes are cleared, so nothing plays twice.
    backTimer = setTimeout(() => {
      if (stack.length) return;
      document.body.classList.remove('screen-back');
      document.querySelectorAll('#chat, .dock').forEach((x) => x.classList.remove('in-r', 'in-l'));
    }, 440);
  }
  function closeAll() { if (!stack.length) return; stack.length = 0; hideScreen(); }
  window.addEventListener('popstate', () => { if (stack.length) { stack.length = 0; hideScreen(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (dialogOpen) dismissDialog(); else if (stack.length) goBack(); else closeSidebar(); } });

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
  // Tabs share one line that glides under the chosen tab; each tab does not animate on its own.
  // Returns place(animate), which moves the line under whichever tab is selected.
  function tabLine(box) {
    const line = el('span', 'tab-line');
    box.prepend(line);
    const place = (animate = true) => {
      const on = box.querySelector('[aria-selected="true"],[aria-pressed="true"]');
      if (!on) { line.style.opacity = '0'; return; }
      line.style.opacity = '1';
      if (!animate) line.style.transition = 'none';
      line.style.width = on.offsetWidth + 'px';
      line.style.transform = `translateX(${on.offsetLeft}px)`;
      if (!animate) { void line.offsetWidth; line.style.transition = ''; }
    };
    requestAnimationFrame(() => place(false));
    if (window.ResizeObserver) new ResizeObserver(() => place(false)).observe(box);
    return place;
  }
  function seg(options, current, onPick) {
    const g = el('div', 'seg'); g.setAttribute('role', 'group');
    for (const [val, label] of options) {
      const b = btn('', label); b.setAttribute('aria-pressed', String(val === current));
      b.onclick = () => {
        for (const x of g.querySelectorAll('button')) x.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true'); place(true); onPick(val);
      };
      g.append(b);
    }
    const place = tabLine(g);
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
    const m = await refreshMe(); if (m.wallet && stack[stack.length - 1]?.name === 'wallet') draw(m.wallet);
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
    const t0 = performance.now(); let last = null;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ms);
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
      chip.classList.add('on');
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
    const m = await refreshMe(); if (m.wallet && stack[stack.length - 1]?.name === 'packs') draw(m.wallet);
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
    const col = frame(T('Language'), T('The app shows your language. Saathi replies in the language you write in.'));
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
  SCREENS.settings = () => {
    const col = frame(T('Settings'));
    const theme = seg([['system', T('Auto')], ['light', T('Light')], ['dark', T('Dark')]], store.get('saathi.theme') || 'system', (v) => { store.set('saathi.theme', v); C.applyTheme(v); });
    const size = seg([['1', T('Normal')], ['1.18', T('Large')], ['1.36', T('Huge')]], String(Number(store.get('saathi.scale')) || 1), (v) => { store.set('saathi.scale', v); C.applyScale(Number(v)); });
    col.append(group(T('Preferences'),
      row({ icon: 'globe', title: T('Language'), value: langName(C.uiLang()), onclick: () => openScreen('language') }),
      row({ icon: 'moon', title: T('Appearance'), right: theme }),
      row({ icon: 'type', title: T('Text size'), right: size }),
    ));
    const inst = [];
    if (!(matchMedia('(display-mode: standalone)').matches || navigator.standalone)) {
      if (/iphone|ipad/i.test(navigator.userAgent)) inst.push(row({ icon: 'download', title: T('Add to Home Screen'), sub: T('Tap Share, then Add to Home Screen') }));
      else inst.push(row({ icon: 'download', title: T('Install Saathi'), sub: T('Open it like an app'), onclick: async () => { if (!deferredInstall) return toast(T('Use your browser menu, then Install app.')); deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; } }));
    }
    col.append(group(T('Privacy and backup'),
      row({ icon: 'backup', title: T('Backup and restore'), onclick: () => openScreen('backup') }),
      row({ icon: 'shield', title: T('Privacy notice'), onclick: () => openScreen('privacy') }),
      row({ icon: 'help', title: T('Help and support'), onclick: () => openScreen('help') }),
      ...(C.cfg?.link ? [row({ icon: 'devices', title: T('Devices and sync'), onclick: () => openScreen('devices') })] : []),
      ...inst,
    ));
    col.append(group(T('Data'),
      row({ icon: 'chatx', title: T('Delete all my chats'), onclick: confirmClearChats }),
      row({ icon: 'trash', title: T('Delete all my data'), sub: T('Removes saved details, locker, reminders and wallet'), danger: true, onclick: confirmDelete }),
    ));
    col.append(el('p', 'mut small center about', T('Saathi 1.0 · Independent, not a government website')));
  };
  SCREENS.backup = () => {
    const col = frame(T('Backup and restore'), T('Keep this code safe. It restores your balance and details on a new phone.'));
    const section = (title, icon, ...kids) => { const g = el('section', 'grp'); const h = el('div', 'bk-hero sm'); const c = el('span', 'bk-ic'); c.append(ico(icon, 22)); h.append(c, el('b', '', title)); const box = el('div', 'grp-box bk-box'); box.append(...kids); g.append(h, box); return g; };
    const KEEP = T('Copied. Keep it somewhere safe.');
    const codes = el('div', 'bk-codes');
    (C.sid || '').match(/.{1,6}/g)?.forEach((part, i) => {
      const b = el('button', 'bk-part', part); b.type = 'button'; b.title = T('Tap to copy this part');
      b.setAttribute('aria-label', T('Copy part {n}', { n: i + 1 }));
      b.onclick = () => C.copyText(part, b, KEEP);
      codes.append(b);
    });
    const all = btn('btn pri', T('Copy all'), function () { C.copyText(C.sid, this, KEEP); });
    const foot = el('div', 'bk-foot'); foot.append(el('small', '', T('Tap a part to copy only that part.')), all);
    col.append(section(T('Your recovery code'), 'backup', codes, foot));
    col.append(note(T('Anyone with this code can use your balance. Never share it.'), 'lock'));
    const inp = el('input', 'field-i'); inp.placeholder = T('Paste your code here'); inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', T('Recovery code'));
    const go = btn('btn pri', T('Restore'), () => {
      const c = inp.value.toLowerCase().replace(/[^a-f0-9]/g, '');
      if (!/^[a-f0-9]{32,64}$/.test(c)) return toast(T('That code does not look right.'));
      store.set('saathi.sid', c); C.resetAfterDelete(); location.reload();
    });
    const r = el('div', 'restore'); r.append(inp, go);
    col.append(section(T('Restore from a code'), 'restore', r));
  };

  // ---- dialog -------------------------------------------------------------------------------------
  const dw = $('dialogWrap'); let dialogOpen = false;
  let dialogBusy = false; let dismissFn = null;
  function showDialog({ title, body, busy, actions, content, onDismiss }) {
    dw.replaceChildren(); dialogBusy = Boolean(busy); dismissFn = onDismiss || null;
    const d = el('div', 'dialog'); d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
    if (busy) { const s = el('div', 'spin'); s.append(el('i')); d.append(s); }
    d.append(el('h3', '', title)); if (body) d.append(el('p', 'mut', body)); if (content) d.append(content);
    if (actions) { const a = el('div', 'd-acts'); for (const x of actions) a.append(x); d.append(a); }
    dw.append(d); dw.hidden = false; requestAnimationFrame(() => dw.classList.add('on')); dialogOpen = true;
  }
  function closeDialog() { dw.classList.remove('on'); dialogOpen = false; setTimeout(() => { if (!dialogOpen) dw.hidden = true; }, 260); }
  // Tapping outside (or Escape) counts as Cancel. A busy dialog cannot be dismissed while it works.
  function dismissDialog() { if (!dialogOpen || dialogBusy) return; const f = dismissFn; closeDialog(); f?.(); }
  dw.addEventListener('click', (e) => { if (e.target === dw) dismissDialog(); });
  function confirmDelete() {
    showDialog({
      title: T('Delete all your data?'), body: T('Removes your details, locker, reminders and wallet from our server, and your chats from this device. Cannot be undone.'),
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
        const p = el('p', 'wl-sub', T('Saathi fills your forms from these. Saved encrypted, never shared, never sent to the AI.'));
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
        // What was saved, in the same rows as step 4, so the finish reads as a summary and not an empty page.
        const n = ageOf(about.dob);
        const facts = [n !== null ? T('Age: {n}', { n }) : '', about.state].filter(Boolean).join(' · ');
        const ul = el('ul', 'wl-points wl-done');
        // Only strings the app already ships in every language, so the finish reads the same everywhere.
        const rows = [
          ['user', T('Your details'), facts],
          ['lock', T('Locker'), T('No sign-up. Your locker is encrypted and hidden until you unlock it. You always finish on the official website.')],
          ['ext', T('Official sites'), T('Type or paste these into the official website yourself. Saathi never logs in for you, and never sees your OTP.')],
        ];
        rows.forEach(([icon, title, text], i) => {
          const li = el('li'); li.style.setProperty('--i', i);
          const badge = el('span', 'wl-ic'); badge.append(ico(icon, 22));
          const d = el('div'); d.append(el('b', '', title), el('p', '', text));
          li.append(badge, d);
          ul.append(li);
        });
        page.append(tickHost.firstElementChild, el('p', 'wl-eye', T('Step {n} of {total}', { n: 5, total: OB_TOTAL })), h, p, ul);
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
  C.ui = { STATE_LIST, frame, row, group, seg, tabLine, redraw, calm: (ms = 900) => { calmUntil = performance.now() + ms; }, note, empty, btn, ico, SCREENS, openScreen, goBack, closeAll, showDialog, closeDialog, refreshMe, rupee, fmtDate, chatDo, startServiceChat, loadServices, svcMeta, SERVICES, packName };
  buildSidebar();
  C.rebuild = buildSidebar;
  C.openScreen = openScreen;
})();
