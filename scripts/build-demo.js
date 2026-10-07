// Builds demo/saathi-app.html: the REAL web app (web/index.html, style.css, app.js) with the REAL bot engine running
// inside the page instead of on a server. What you see is exactly what people get at your address.
// Each src file becomes its own scope, its imports become plain destructuring.
import { readFileSync, writeFileSync } from 'node:fs';

const ORDER = ['i18n', 'messages', 'knowledge', 'factsextra', 'states', 'services', 'costguard', 'rich', 'profile', 'billing', 'reminders', 'translate', 'scamcheck', 'locker', 'flow', 'errors', 'guides', 'tools'];
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

function wrap(name) {
  let src = read(`../src/${name}.js`);
  const exported = [];
  src = src.replace(/^import\s+([\s\S]*?)\s+from\s+['"]\.\/(\w+)\.js['"];?[ \t]*$/gm, (_, what, mod) => {
    if (!ORDER.includes(mod)) return '';
    what = what.trim();
    if (what.startsWith('* as ')) return `const ${what.slice(5).trim()} = M_${mod};`;
    return `const ${what.replace(/\s+as\s+/g, ': ')} = M_${mod};`;
  });
  src = src.replace(/^import[\s\S]*?from\s+['"]node:[^'"]+['"];?[ \t]*$/gm, '');
  src = src.replace(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/gm, (m, n) => {
    exported.push(n);
    return m.replace(/^export\s+/, '');
  });
  src = src.replace(/^export\s*\{[^}]*\};?[ \t]*$/gm, '');
  src = src.replace(/^export\s+default\s+/gm, '');
  return `const M_${name} = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();`;
}

const hiSrc = read('../src/ui-hi.js').replace(/^export\s+/gm, '');
const engine = `const Engine = (() => {
${hiSrc}
const HI_DICT = HI;
${ORDER.map(wrap).join('\n')}
return { HI_DICT, LANGS: M_i18n.LANGS, SERVICES: M_services.SERVICES, LAST_VERIFIED: M_services.LAST_VERIFIED, createBot: M_flow.createBot, createTools: M_tools.createTools, CostGuard: M_costguard.CostGuard, createTranslator: M_translate.createTranslator, classifyUrl: M_scamcheck.classifyUrl, extractUrls: M_scamcheck.extractUrls, redact: M_scamcheck.redact, balance: M_billing.balance, inr: M_billing.inr, activePack: M_billing.activePack };
})();`;

const html = read('../web/index.html');
const markup = html.slice(html.indexOf('<div class="shell"'), html.indexOf('<script src="/app.js"'));
const logo = 'data:image/svg+xml;base64,' + Buffer.from(read('../web/logo.svg')).toString('base64');
const css = read('../web/style.css').replace(/@font-face\{[^}]*\}\n?/g, '').replaceAll('"Bricolage"', '"Bricolage Grotesque"') + '\n' + read('../web/screens.css') + '\n' + read('../web/guides.css') + '\n' + read('../web/polish.css') + ``;
const tools = read('../web/tools.js').replaceAll("'/logo.svg'", JSON.stringify(logo));
const screens = read('../web/screens.js').replaceAll("'/logo.svg'", JSON.stringify(logo));
const app = read('../web/app.js').replaceAll("'/logo.svg'", JSON.stringify(logo)).replace("if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});", '');
const guides = read('../web/guides.js');
const shim = read('../demo/shim.js');
const built = `<title>Saathi web app</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Instrument+Sans:wght@400..700&display=swap">
<style>${css}</style>
${markup.replaceAll('/logo.svg', logo)}
<script>
${engine}
${shim}
</script>
<script>
${app}
</script>
<script>
${screens}
</script>
<script>
${tools}
</script>
<script>
${guides}
</script>
`;
writeFileSync(new URL('../demo/saathi-app.html', import.meta.url), built);
console.log('built demo/saathi-app.html', (built.length / 1024).toFixed(0) + ' KB');
