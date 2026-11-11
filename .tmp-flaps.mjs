import { chromium, devices } from '@playwright/test';
const B = 'http://localhost:4180/openaero/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const sizes = { iphone15: [393, 852], iphone15L: [852, 393], ipadAir: [820, 1180], ipadAirL: [1180, 820], pixel8: [412, 915], pixel8L: [915, 412] };
const level = process.argv[2] || 'learner';
const which = process.argv[3] || 'all';
for (const [name, [w, h]] of Object.entries(sizes)) {
  if (which !== 'all' && which !== name) continue;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: !name.startsWith('ipad'), userAgent: devices['Pixel 7'].userAgent });
  await ctx.addInitScript((lv) => { localStorage.setItem('openaero_assist_v1', JSON.stringify({ v: 1, level: lv, at: 0 })); localStorage.setItem('openaero_coach_v1', '{"v":1,"seen":true,"at":0}'); }, level);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.route(/arcgisonline|googleapis|aviationweather/, r => r.abort());
  // takeoff
  await page.goto(B + '?debug&mission=kdfw_takeoff');
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.waitForTimeout(1500);
  const btn = page.locator('#touchFlaps');
  const vis = await btn.isVisible();
  const labels = [];
  for (let i = 0; i < 6; i++) {
    const s = await page.evaluate(() => window.openaeroDebug());
    const bb = vis ? await btn.boundingBox() : null;
    labels.push(`${s.flapsIndex}:${vis ? (await btn.innerText()).replace(/\s+/g,' ') : '-'}:${bb ? Math.round(bb.width)+'x'+Math.round(bb.height) : ''}:sw${await btn.evaluate(e => e.scrollWidth > e.clientWidth)}`);
    if (i === 0) await page.screenshot({ path: `/tmp/claude-0/sc/to-${name}.png` });
    if (vis) await btn.tap(); else await page.keyboard.press('f');
    await page.waitForTimeout(150);
  }
  // mid-transit label
  if (vis) { await btn.tap(); await page.waitForTimeout(60); await page.screenshot({ path: `/tmp/claude-0/sc/transit-${name}.png` }); labels.push('transit:' + (await btn.innerText()).replace(/\s+/g,' ') + ':' + Math.round((await btn.boundingBox()).width)); }
  const pc = await page.locator('#txtPhoneConfig').innerText().catch(() => '?');
  console.log(name, w + 'x' + h, 'touchVisible', vis, labels.join(' | '), 'phoneCfg', pc, 'docScroll', await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]), errs.length ? 'ERR ' + errs.join(';') : '');
  await ctx.close();
}
await browser.close();
