import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const problems = []; const errs = [];
const sizes = [[320,640],[360,740],[390,844],[768,1024],[1024,768],[1440,900]];
const check = async (page, tag, w) => page.evaluate(([tag,w]) => {
  const out=[]; const vw=window.innerWidth;
  if (document.documentElement.scrollWidth>vw+1) out.push(tag+': page scrolls sideways '+document.documentElement.scrollWidth);
  for (const e of document.querySelectorAll('body *')) {
    const cs=getComputedStyle(e); if (cs.visibility==='hidden'||cs.display==='none'||e.closest('[inert]')||e.closest('.modal:not(.on)')||e.closest('.toast')) continue;
    const r=e.getBoundingClientRect(); if(!r.width||!r.height) continue;
    if (e.closest('.drawer:not(.on)')) continue;
    if (r.right>vw+1||r.left<-1) { if(!e.closest('.sr')) out.push(tag+': off-screen '+e.tagName+'.'+e.className+' '+Math.round(r.left)+'-'+Math.round(r.right)); }
    if ((cs.overflow==='hidden'||cs.overflowX==='hidden') && e.scrollWidth>e.clientWidth+1 && !['BUTTON','TEXTAREA','INPUT'].includes(e.tagName) && e.className!=='hold'&&!e.className.includes('sheet')&&!e.className.includes('list')) out.push(tag+': clipped text '+e.tagName+'.'+e.className);
    if (['BUTTON','A'].includes(e.tagName) && e.scrollWidth>e.clientWidth+1 && cs.overflow!=='visible') out.push(tag+': clipped button '+e.textContent.slice(0,20));
  }
  return out;
},[tag,w]);
for (const [w,h] of sizes) for (const scheme of ['light','dark']) {
  const ctx = await browser.newContext({ viewport:{width:w,height:h}, colorScheme:scheme, isMobile:w<700, hasTouch:w<700, deviceScaleFactor:1 });
  const page = await ctx.newPage(); page.on('pageerror',e=>errs.push(w+' '+e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(w+' '+m.text())});
  const say = async (t)=>{ await page.fill('#input',t); await page.press('#input','Enter'); await page.waitForTimeout(650); };
  await page.goto('http://localhost:3111/app'); await page.waitForSelector('.chip'); await page.waitForTimeout(400);
  problems.push(...await check(page,`${w}${scheme[0]} welcome`,w));
  await page.click('.chip:has-text("English")'); await page.waitForTimeout(600);
  problems.push(...await check(page,`${w}${scheme[0]} menu`,w));
  await say('pay 500 at http://pan-card-apply.xyz/kyc urgent'); problems.push(...await check(page,`${w}${scheme[0]} scam`,w));
  await say('sources'); problems.push(...await check(page,`${w}${scheme[0]} sources`,w));
  await page.click('#menuBtn'); await page.waitForTimeout(400); problems.push(...await check(page,`${w}${scheme[0]} drawer`,w));
  if (scheme==='light') await page.screenshot({path:`a-${w}-drawer.png`});
  await page.click('#settingsBtn'); await page.waitForTimeout(450); problems.push(...await check(page,`${w}${scheme[0]} settings`,w));
  await page.screenshot({path:`a-${w}-${scheme}-settings.png`});
  await ctx.close();
}
console.log([...new Set(problems)].join('\n')||'no layout problems');
console.log(errs.join('\n')||'no js errors');
await browser.close();
