import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:800}, permissions:['clipboard-read','clipboard-write'] }); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:3111/app'); await p.waitForSelector('.chip');
const ok=(n,c)=>console.log(c?'PASS':'FAIL',n);
// double-tap a chip fast
await p.dblclick('.chip:has-text("English")'); await p.waitForTimeout(900);
ok('double tap sends once', (await p.$$eval('.msg.me',x=>x.length))===1);
// stale locking: type instead of tapping list
const before = await p.$$eval('.list:not(.done)',x=>x.length);
await p.fill('#input','wallet'); await p.press('#input','Enter'); await p.waitForTimeout(800);
ok('older buttons locked after typing', before===1 && (await p.$$eval('.list:not(.done)',x=>x.length))===0);
// typed text kept while busy
await p.fill('#input','one'); await p.press('#input','Enter'); await p.fill('#input','two'); await p.press('#input','Enter'); await p.waitForTimeout(1200);
const mine = await p.$$eval('.msg.me .bubble-me',x=>x.map(e=>e.textContent));
ok('no message silently lost: '+JSON.stringify(mine.slice(-2)), mine.includes('one') && (mine.includes('two')|| (await p.inputValue('#input'))==='two'));
// settings: text size, theme, backup code round trip
await p.click('#menuBtn'); await p.click('#settingsBtn'); await p.waitForTimeout(400);
await p.click('.seg >> nth=1 >> button:has-text("Huge")'); await p.click('.seg >> nth=0 >> button:has-text("Dark")');
ok('huge text applied', (await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--scale'))).trim()==='1.36');
ok('dark applied', await p.evaluate(()=>document.documentElement.dataset.theme==='dark'));
const sid1 = await p.evaluate(()=>localStorage.getItem('saathi.sid'));
await p.fill('.field input','0'.repeat(10)); await p.click('.field .btn'); await p.waitForTimeout(300);
ok('bad code rejected', (await p.evaluate(()=>localStorage.getItem('saathi.sid')))===sid1);
const newCode='ab'.repeat(24);
await p.fill('.field input', newCode.replace(/(.{6})/g,'$1 · ')); await Promise.all([p.waitForNavigation(), p.click('.field .btn')]); await p.waitForTimeout(600);
ok('restore swaps account', (await p.evaluate(()=>localStorage.getItem('saathi.sid')))===newCode);
ok('prefs survive reload', await p.evaluate(()=>document.documentElement.dataset.theme==='dark'));
// hold to delete: short press does nothing, long press asks
await p.waitForSelector('.chip'); await p.waitForTimeout(800);
await p.click('#menuBtn'); await p.click('#settingsBtn'); await p.waitForTimeout(400);
await p.locator('.hold').scrollIntoViewIfNeeded(); await p.waitForTimeout(300); const box = await p.locator('.hold').boundingBox(); await p.mouse.move(box.x+20,box.y+20); await p.mouse.down(); await p.waitForTimeout(300); await p.mouse.up(); await p.waitForTimeout(300);
ok('short press does not delete', await p.$$eval('.msg.me',x=>!x.some(e=>/Delete my data/.test(e.textContent))));
await p.mouse.move(box.x+20,box.y+20); await p.mouse.down(); await p.waitForTimeout(1400); await p.mouse.up(); await p.waitForTimeout(900);
ok('long press asks to confirm', await p.$$eval('.msg.me',x=>x.some(e=>/Delete my data/.test(e.textContent))));
console.log(errs.join('\n')||'no js errors'); await b.close();
