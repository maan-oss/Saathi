// Checks every connection and tells you exactly what is missing. Safe to run any time: it only reads, and sends nothing to real users.
//   npm run doctor
import { diagnose } from '../src/doctor.js';
export { diagnose };

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await diagnose();
  for (const r of rows) console.log(`[${r.s}] ${r.t}${r.d ? ' - ' + r.d : ''}`);
  const fixes = rows.filter((r) => r.s === 'FIX').length;
  console.log(fixes ? `\n${fixes} thing(s) to fix. See SETUP.md.` : '\nAll good. Message your number from another phone to try it.');
  console.log('\nNot checked here: the two reminder templates (approve them in WhatsApp Manager) and your Stripe webhook URL.');
  process.exit(fixes ? 1 : 0);
}
