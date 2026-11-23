import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0211 on a phone (390x844, touch), at Kid level: hands off, the guide flies to the pole and rolls left round
// it; fast-forwarded to the end (openaeroDebugAroundPoint), the card's track plot and FLY AGAIN fit the screen.
test('phone, Kid, hands off: the plane circles the pole and the card plots the track on screen', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=turns_around_point`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  expect((await snap()).assist).toBe('kid');
  await expect(page.locator('#txtCoach')).toHaveText(/flies to the lit pole/, { timeout: 10_000 });
  await expect.poll(async () => (await snap()).aroundPoint?.phase, { timeout: 40_000 }).toBe('circle');
  await expect.poll(async () => (await snap()).bankRightDeg, { timeout: 20_000 }).toBeLessThan(-20);
  await expect(page.locator('#txtCoach')).toHaveText(/Watch the wing/, { timeout: 10_000 });
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.y + coach.height).toBeLessThan(844 / 2);
  await page.screenshot({ path: test.info().outputPath('around-point-390.png') });
  // Kid's auto-config leaves the flaps up in the lesson: a sink at 1,000 ft is not an approach (90 KIAS is past flaps 20's 85).
  await page.waitForTimeout(6000);
  expect((await snap()).flapsIndex).toBe(0);
  await page.evaluate(() => window.openaeroDebugAroundPoint(719));
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#txtStabilized')).toContainText(/flew the circles for you/);
  const [plot, fly, cardBox] = await Promise.all([page.locator('#trackPlot').boundingBox(), page.locator('#btnFlyAgain').boundingBox(), page.locator('#resultsCard').boundingBox()]);
  expect(plot.width).toBeGreaterThan(200);
  expect(plot.height).toBeGreaterThan(100);
  expect(fly.y + fly.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);
  expect(cardBox.y).toBeGreaterThanOrEqual(0);
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('around-point-card-390.png') });
  expect(errors).toEqual([]);
});
