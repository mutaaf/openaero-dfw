import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
// A long flight: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0036 on a phone (390x844, touch), Kid level: the dead-stick glide put on a 0.8 NM
// final far too low to make it (the ?debug hook), hands off. Kid's guide holds best glide and
// flares it into the field short of the runway: the card says by how much, and fits. ILS AUTO
// can't be engaged with the engine out (it would fly a glidepath it has no power for).
test('phone, Kid: a dead-stick glide that falls short says how far it missed the runway', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?debug&mission=deadstick_kads_16`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  await expect(page.locator('#txtCoach')).toHaveText(/Engine stopped!/, { timeout: 10_000 });
  await page.locator('#touchIls').tap();
  await page.waitForTimeout(500);
  expect((await snap()).engineFailed).toBe(true);
  expect(await page.evaluate(() => document.getElementById('touchIls').classList.contains('active-amber'))).toBe(false);
  await expect(page.locator('#txtTouchThr')).toHaveText('OUT'); // the touch throttle's readout
  await page.screenshot({ path: test.info().outputPath('deadstick-390-coach.png') });
  // 0.8 NM out at 150 ft: a 9:1 glide needs ~540 ft.
  await page.evaluate(() => window.openaeroDebugDeadStick(0.8, 150));
  await expect(page.locator('#txtCoach')).toHaveText('No engine: the plane glides to the runway', { timeout: 10_000 });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Dead-stick landing');
  await expect(page.locator('#txtGrade')).toHaveText('D');
  await expect(page.locator('#txtGradeReason')).toHaveText(/^Short of the runway by [\d,]+ ft: turn for it sooner/);
  await expect(page.locator('#resultsFactors li')).toHaveCount(3); // made, rate, speed: no centreline in a field
  await expect(page.locator('#resultsFactors li').first()).toContainText(/missed by [\d,]+ ft/);
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const btn = await page.locator('#btnFlyAgain').boundingBox();
  expect(btn.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  expect((await snap()).lastLanding.grade).toBe('D');
  await page.screenshot({ path: test.info().outputPath('deadstick-390.png') });
  expect(errors).toEqual([]);
});
