import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
// A long roll: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0107 on a phone (390x844, touch), at Kid level: full power from the touch throttle,
// then hands off. At the fire the plane closes the thrust and the autobrake MAX stops it; the
// coach says so, and the card fits the screen. (The HUD warning clears 2 s after the thrust is
// idle, at once here: rto.spec.js checks it.)
test('phone, Kid: full power, the fire warning, the plane stops itself, the card fits', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=kdfw_35c_rto`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  expect((await snap()).assist).toBe('kid');
  await expect(page.locator('#txtCoach')).toHaveText(/^Full power \(TO\/GA\), then let go/, { timeout: 10_000 });
  const cdp = await page.context().newCDPSession(page);
  const thr = await page.locator('#touchThrottle').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: thr.x + thr.width / 2, y: thr.y + 4, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#txtCoach')).toHaveText('Engine fire! The plane stops itself: keep it straight', { timeout: 90_000 });
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.x + coach.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('rto-390-fire.png') });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Rejected takeoff');
  await expect(page.locator('#resultsFactors li').first()).toContainText('the plane did it');
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect((await page.locator('#btnFlyAgain').boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('rto-390.png') });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
  expect(stored.missions['kdfw_35c_rto@kid']).toBeTruthy();
  expect(errors).toEqual([]);
});
