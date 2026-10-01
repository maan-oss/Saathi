// Pre-generate the machine translations so the first person to pick a language doesn't wait.
//   node scripts/translate.js            all languages
//   node scripts/translate.js ta te      just these
// Needs ANTHROPIC_API_KEY. Costs a small amount per language (about 350 short texts).
// Hand-corrected records (reviewed: true in data/translations.json) are never overwritten.
import { config } from '../src/config.js';
import { Store } from '../src/store.js';
import { CostGuard } from '../src/costguard.js';
import { createLlm } from '../src/llm.js';
import { createTranslator } from '../src/translate.js';
import { LANGS } from '../src/i18n.js';

const llm = createLlm(config);
if (!llm.enabled) {
  console.error('Set ANTHROPIC_API_KEY first.');
  process.exit(1);
}
const store = new Store(config.dataDir);
const translator = createTranslator({ llm, store, guard: new CostGuard(store, config), config });
const wanted = process.argv.slice(2);
const codes = wanted.length ? wanted : LANGS.map((l) => l.code);
for (const code of codes) {
  if (!LANGS.some((l) => l.code === code)) {
    console.error(`unknown language ${code}`);
    continue;
  }
  if (store.getTranslation(code)?.reviewed) {
    console.log(`${code}: hand-reviewed, skipped`);
    continue;
  }
  process.stdout.write(`${code}: translating... `);
  console.log((await translator.ensure(code)) ? 'ready' : 'NOT enabled (too many texts failed the checks)');
}
