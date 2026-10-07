// Builds demo/saathi-site.html: the REAL landing page (web/site.html, site.css, site.js) as one file, so it can be previewed
// without a server. The scam checker runs the real rules in the page. Prices are hidden because there is no server to ask.
// Usage: node scripts/build-site-demo.js <app-preview-url>
import { readFileSync, writeFileSync } from 'node:fs';
import { SERVICES, LAST_VERIFIED } from '../src/services.js';
const APP = process.argv[2] || '#';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = (name, deps) => {
  let s = read(`../src/${name}.js`);
  s = s.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '');
  const ex = [];
  s = s.replace(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/gm, (m, n) => { ex.push(n); return m.replace(/^export\s+/, ''); });
  return `const M_${name} = (() => {\n${deps || ''}${s}\nreturn { ${ex.join(', ')} };\n})();`;
};
const clean = (x) => String(x || '').replace(/\*/g, '').trim();
const SERVICES_JSON = { verified: LAST_VERIFIED, services: SERVICES.filter((sv) => sv.fee && sv.docs).map((sv) => ({ id: sv.id, name: sv.name.en, blurb: sv.blurb?.en || '', fee: clean(sv.fee.en), docs: clean(sv.docs.en).split('\n').map((l) => l.trim()).filter(Boolean), sites: (sv.sites || []).map((u) => String(u).trim().split(/\s+/)[0]).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h)).map((h) => 'https://' + h), unverified: sv.unverified || [] })) };
const bundle = `const SERVICES_JSON = ${JSON.stringify(SERVICES_JSON)};
const Mods = (() => {
${strip('i18n')}
${strip('messages', 'const i18n = M_i18n;\n')}
${strip('scamcheck')}
return { t: M_messages.t, analyze: M_scamcheck.analyze, sensitiveKind: M_scamcheck.sensitiveKind };
})();
const __realFetch = window.fetch.bind(window);
window.fetch = async (path, opts = {}) => {
  if (String(path) === '/app/api/check') {
    const { t, analyze, sensitiveKind } = Mods;
    const text = String(JSON.parse(opts.body).text || '').slice(0, 1500);
    const sens = sensitiveKind(text);
    let out;
    if (sens) out = { level: 'private', headline: t('en', 'sensitive_warn', { what: t('en', 'sensitive_k_' + sens) }), lines: [], advice: '' };
    else {
      const a = analyze(text);
      const lines = a.urls.map((x) => ({ kind: x.kind, text: t('en', 'scam_u_' + x.kind, { host: x.host.slice(0, 60) }) }));
      for (const r of a.reasons.filter((r) => r !== 'shortener' && r !== 'unknown_site')) lines.push({ kind: 'reason', text: t('en', 'scam_r_' + r) });
      out = { level: a.level, headline: t('en', 'scam_v_' + a.level), lines, advice: a.level !== 'none' ? t('en', 'scam_advice_' + a.level) : '' };
    }
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (String(path) === '/app/api/services') return new Response(JSON.stringify(SERVICES_JSON), { status: 200, headers: { 'content-type': 'application/json' } });
  if (String(path) === '/app/api/config') return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  return __realFetch(path, opts);
};`;
const html = read('../web/site.html');
let body = html.slice(html.indexOf('<a class="skip"'), html.indexOf('<script src="/site.js"'));
const logo = 'data:image/svg+xml;base64,' + Buffer.from(read('../web/logo.svg')).toString('base64');
body = body.replaceAll('/logo.svg', logo).replaceAll('href="/app"', `href="${APP}" target="_blank" rel="noopener"`).replaceAll('href="/privacy"', 'href="#faq"').replace('href="/"', 'href="#main"');
const css = (read('../web/hark.css') + '\n' + read('../web/site.css')).replace(/@font-face\{[^}]*\}\n?/g, '').replaceAll('"Bricolage"', '"Bricolage Grotesque"');
// The live page sets the sky and the body class from /sky.js and the page's own markup; the demo has no server, so it does the same here.
const setup = "(function(){try{var d=document.documentElement;d.dataset.style='sky';var h=new Date().getHours(),dark=matchMedia('(prefers-color-scheme: dark)').matches;d.dataset.sky=dark||h>=20||h<5?'night':h<8?'dawn':h<17?'day':'sunset';document.body.classList.add('landing');}catch(e){}})();";
const js = read('../web/site.js').replace("go.href = '/app?service=' + encodeURIComponent(sv.id);", `go.href = '${APP}'; go.target = '_blank'; go.rel = 'noopener';`);
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Instrument+Sans:wght@400..700&family=Noto+Sans+Devanagari:wght@700&display=swap">';
writeFileSync(new URL('../demo/saathi-site.html', import.meta.url), `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Saathi</title>\n${fonts}\n<style>${css}</style>\n<script>${setup}</script>\n<body class="landing">\n${body}\n<script>${bundle}\n${js}</script>\n`);
console.log('built demo/saathi-site.html');
