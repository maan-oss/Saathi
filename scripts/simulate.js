// Chat with the bot in your terminal, no WhatsApp needed.
//   npm run simulate
// Commands: /img <path>  test the photo check   /pdf <path>   /voice <path>   /stats  spend so far   /reset  forget this user   /quit
import readline from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { config } from '../src/config.js';
import { Store } from '../src/store.js';
import { CostGuard } from '../src/costguard.js';
import { createLlm } from '../src/llm.js';
import { createBot } from '../src/flow.js';
import { createVault } from '../src/vault.js';
import { plain } from '../src/rich.js';
import { createStt } from '../src/stt.js';
import { createTranslator } from '../src/translate.js';

const store = new Store('./data-sim');
const guard = new CostGuard(store, config);
const llm = createLlm(config);
const translator = createTranslator({ llm, store, guard, config });
await translator.loadCached();
const bot = createBot({
  store,
  guard,
  llm,
  config,
  vault: createVault(config.vaultKey),
  stt: createStt(config),
  translator,
  downloadMedia: async (path) => ({ buffer: readFileSync(path), mime: /png$/i.test(path) ? 'image/png' : /pdf$/i.test(path) ? 'application/pdf' : /ogg|opus$/i.test(path) ? 'audio/ogg' : 'image/jpeg' }),
});

const USER = 'simulator';
const PHONE = '919999900000'; // fake, lets reminders work
console.log(`AI: ${llm.enabled ? config.model : 'off (set ANTHROPIC_API_KEY to enable free-form answers)'}`);
console.log(`Photo check: ${config.docCheck ? 'on' : 'off (DOC_CHECK=1 to enable)'}`);
console.log('Say hi to start. /stats /reset /quit\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const show = (replies) => replies.forEach((r) => console.log(`\n🤖 ${plain(r)}\n`));

while (true) {
  const line = (await rl.question('you> ')).trim();
  if (line === '/quit') break;
  if (line === '/stats') {
    console.log(await guard.stats());
    continue;
  }
  if (line === '/reset') {
    await store.deleteUser(USER);
    console.log('reset');
    continue;
  }
  const input = line.startsWith('/img ') ? { type: 'image', mediaId: line.slice(5).trim() }
    : line.startsWith('/pdf ') ? { type: 'document', mediaId: line.slice(5).trim(), mime: 'application/pdf' }
    : line.startsWith('/voice ') ? { type: 'voice', mediaId: line.slice(7).trim() }
    : { type: 'text', text: line };
  const { replies } = await bot.handle(USER, input, { phone: PHONE, early: show });
  show(replies);
}
rl.close();
