import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
import fs from 'node:fs';
const OUT = '/tmp/claude-0/-home-user-openaero-dfw/a3e9ad64-5c6f-5e59-a8bd-7021676cead7/scratchpad/panel/firsttimer';
test.use({ simWarp: 2, deviceScaleFactor: 1 });
const snap = (page) => page.evaluate(() => { const s = window.openaeroDebug(); return { t: s.simTime, ap: s.aroundPoint, bank: s.bankRightDeg, ias: s.iasKts, agl: s.aglFt, msl: s.mslFt, thr: s.throttle, stick: s.stick, coach: document.getElementById('txtCoach')?.textContent, card: document.getElementById('resultsCard') && !document.getElementById('resultsCard').classList.contains('hidden') && document.getElementById('resultsCard').offsetParent !== null }; });

for (const mode of (process.env.FT_MODES || 'coach').split(',')) test(`learner ${mode}`, async ({ page, context }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript((lv) => localStorage.setItem('openaero_assist_v1', `{"v":1,"level":"${lv}","at":0}`), process.env.FT_LEVEL || 'learner');
  await page.goto(`${BASE}?mission=turns_around_point`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const cdp = await context.newCDPSession(page);
  const box = await page.locator('#touchStick').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  let held = false, sx = 0, sy = 0;
  const put = async (x, y) => {
    const pt = { x: cx + x * box.width / 2, y: cy + y * box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: held ? 'touchMove' : 'touchStart', touchPoints: [pt] });
    held = true; sx = x; sy = y;
  };
  const lift = async () => { if (held) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); held = false; };
  const log = [];
  let next = 0, i = 0, started = false, lastAdj = 0;
  const t0 = (await snap(page)).t;
  while (true) {
    const s = await snap(page);
    const rt = s.t - t0;
    log.push({ rt: rt.toFixed(1), ph: s.ap?.phase, d: s.ap?.d?.toFixed(0), along: s.ap?.along?.toFixed(0), sw: s.ap?.swept?.toFixed(0), bank: s.bank?.toFixed(1), ias: s.ias?.toFixed(1), msl: s.msl?.toFixed(0), sx, sy, coach: s.coach, why: s.ap?.why });
    if (rt >= next) { await page.screenshot({ path: `${OUT}/${mode}-${String(++i).padStart(2, '0')}.png`, scale: 'css' }); next += 10; }
    if (s.card || s.ap?.phase === 'failed' || s.ap?.phase === 'complete') { await page.waitForTimeout(1500); break; }
    if (rt > 400) break;
    const c = s.coach || '';
    if (mode === 'coach') {
      if (!started && /Pole abeam: roll left/.test(c)) { started = true; await put(-0.8, 0); }
      else if (started && rt - lastAdj > 1) {
        lastAdj = rt;
        let x = sx, y = 0;
        if (/steepen|steepest|Over 45/.test(c)) x = /Over 45/.test(c) ? x + 0.08 : x - 0.04;
        if (/shallower|shallowest/.test(c)) x += 0.04;
        if (/Sinking/.test(c)) y = -0.15; if (/Climbing/.test(c)) y = 0.15;
        await put(Math.max(-1, Math.min(0, x)), y);
      }
    } else if (mode === 'wrongway') {
      if (!started && /Pole abeam: roll left/.test(c)) { started = true; await put(0.8, 0); }
    } else if (mode === 'early') {
      if (!started && rt > 3) { started = true; await put(-0.8, 0); }
    } else if (mode === 'fixedbank') {
      if (!started && /Pole abeam: roll left/.test(c)) { started = true; await put(-0.6, 0); }
    }
    await page.waitForTimeout(400);
  }
  await lift();
  await page.screenshot({ path: `${OUT}/${mode}-card.png`, scale: 'css' });
  const card = await page.locator('#resultsCard').innerText().catch(() => 'no card');
  fs.writeFileSync(`${OUT}/${mode}-log.json`, JSON.stringify({ card, errors, log }, null, 1));
});
