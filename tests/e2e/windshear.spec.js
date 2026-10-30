import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';
// A long flight: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Microburst windshear drill (ticket 0112): the 737 on a 3 NM final to DFW 35C meets a microburst
// at 600 ft. Kid, hands off: the warning (banner + coach), the plane flies the escape (full
// power, the climb guide, no gear or flaps), and the card grades it. The escape a pilot flies,
// and the dive for speed it grades lower, are flown headless (tests/flight/windshear.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('windshear on Kid: the warning, the plane climbs out of the microburst, graded card', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?debug&mission=kdfw_35c_windshear`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Dallas' }).locator('[data-scenario="kdfw_35c_windshear"]')).toContainText('Windshear');
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).windshear?.phase, { timeout: 10_000 }).toBe('final');
  expect(await snap(page)).toMatchObject({ mission: 'kdfw_35c_windshear', aircraft: 'b738', onGround: false, flapsIndex: 2 });
  await expect.poll(async () => (await snap(page)).windshear.phase, { timeout: 90_000, intervals: [250] }).toBe('warning');
  await expect(page.locator('#masterAlertBanner')).toHaveText('WINDSHEAR');
  await expect(page.locator('#masterAlertBanner')).toBeVisible();
  await expect(page.locator('#txtCoach')).toHaveText(/Windshear! Let go/);
  await page.screenshot({ path: test.info().outputPath('windshear-1280-warning.png') });
  // ILS AUTO can't take the escape back (the panel's first-timer reached for it): the coach keeps its card.
  await page.evaluate(() => document.getElementById('btnApApr').click());
  await page.waitForTimeout(1000);
  await expect(page.locator('#txtCoachLabel')).toHaveText('Coach');
  await expect(page.locator('#txtCoach')).toHaveText(/Windshear! Let go/);
  const warn = await snap(page);
  expect(warn.windshear.startFt).toBeGreaterThan(550);
  await expect.poll(async () => (await snap(page)).throttle, { timeout: 5_000 }).toBe(1);
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 150_000 });
  const done = await snap(page);
  console.log(`[0112] Kid: lowest ${Math.round(done.windshear.lowFt)} ft of ${Math.round(done.windshear.startFt)}, shaker ${done.windshear.shakerS.toFixed(1)} s, grade ${await page.locator('#txtGrade').textContent()}`);
  expect(done.windshear).toMatchObject({ phase: 'clear', ground: false, stalled: false });
  expect(done.gearDown).toBe(true); // Kid's assists leave the gear and flaps alone in the shear
  await expect(page.locator('#txtResultTitle')).toHaveText('Windshear escape');
  await expect(page.locator('#resultsFactors li').nth(0)).toContainText('the plane did it');
  await expect(page.locator('#txtGradeReason')).toBeHidden(); // nothing to blame the kid for: the plane flew it
  expect(['S', 'A', 'B']).toContain((await page.locator('#txtGrade').textContent()).trim());
  expect(await lowContrastLabels(page, '#resultsCard')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('windshear-1280.png') });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
  expect(Object.keys(stored.missions['kdfw_35c_windshear@kid']).sort()).toEqual(['at', 'grade', 'score']);
  // Fly again: back on the final, the shear ahead again.
  await page.locator('#btnFlyAgain').click();
  await expect.poll(async () => (await snap(page)).windshear?.phase).toBe('final');
  expect(errors).toEqual([]);
});
