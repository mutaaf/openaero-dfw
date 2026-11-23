import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
import fs from 'node:fs';
const OUT = '/tmp/claude-0/-home-user-openaero-dfw/a3e9ad64-5c6f-5e59-a8bd-7021676cead7/scratchpad/panel/firsttimer';
test.use({ simWarp: 4, deviceScaleFactor: 0.5 });
const snap = (page) => page.evaluate(() => { const s = window.openaeroDebug(); return { t: s.simTime, ap: s.aroundPoint, bank: s.bankRightDeg, ias: s.iasKts, agl: s.aglFt, flaps: s.flapsIndex, hdg: s.headingDeg, coach: document.getElementById('txtCoach')?.textContent }; });

test('kid full', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=turns_around_point`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${OUT}/kid-00-brief.png` });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const log = [];
  let next = 0, i = 0;
  const t0 = (await snap(page)).t;
  while (true) {
    const s = await snap(page);
    log.push(s);
    if (s.t - t0 >= next) { await page.screenshot({ path: `${OUT}/kid-${String(++i).padStart(2, '0')}.png` }); next += 10; }
    if (await page.locator('#resultsCard').isVisible()) break;
    if (s.t - t0 > 500) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/kid-card.png` });
  const card = await page.locator('#resultsCard').innerText().catch(() => 'no card');
  fs.writeFileSync(`${OUT}/kid-log.json`, JSON.stringify({ card, errors, log: log.map((s) => ({ t: s.t?.toFixed(1), ph: s.ap?.phase, d: s.ap?.d?.toFixed(0), sw: s.ap?.swept?.toFixed(0), bank: s.bank?.toFixed(1), ias: s.ias?.toFixed(1), agl: s.agl?.toFixed(0), sd: s.ap?.sdFt?.toFixed(0), coach: s.coach })) }, null, 1));
});
