import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0224 on a phone (390x844, touch), at Kid level: hands off, the guide flies north across the road and rolls
// left into the first half-circle; ended early (openaeroDebugSTurns), the card's plot and FLY AGAIN fit the screen.
test('phone, Kid, hands off: the plane flies the S-turns, the flaps stay up and the card plots the S on screen', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=s_turns_road`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  expect((await snap()).assist).toBe('kid');
  await expect(page.locator('#txtCoach')).toHaveText(/crosses the road and flies the S-turns/, { timeout: 10_000 });
  await expect.poll(async () => (await snap()).sTurns?.phase, { timeout: 40_000 }).toBe('course');
  await expect(page.locator('#txtCoach')).toHaveText(/Watch: steep with the wind behind/, { timeout: 10_000 });
  await expect.poll(async () => (await snap()).bankRightDeg, { timeout: 30_000 }).toBeLessThan(-20);
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.y + coach.height).toBeLessThan(844 / 2);
  await page.screenshot({ path: test.info().outputPath('s-turns-390.png') });
  const s = await snap();
  expect(s.flapsIndex).toBe(0); // Kid's auto-config leaves the flaps up in the lesson
  expect(Math.abs(s.sTurns.d - s.sTurns.R)).toBeLessThan(150);
  // Through the first crossing back over the road, then end it there.
  await expect.poll(async () => (await snap()).sTurns.half, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  expect((await snap()).sTurns.maxCrossDeg).toBeLessThan(10);
  await page.evaluate(() => window.openaeroDebugSTurns());
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#txtStabilized')).toContainText(/flew the S-turns for you/);
  const [plot, fly, cardBox] = await Promise.all([page.locator('#trackPlot').boundingBox(), page.locator('#btnFlyAgain').boundingBox(), page.locator('#resultsCard').boundingBox()]);
  expect(plot.width).toBeGreaterThan(200);
  expect(plot.height).toBeGreaterThan(100);
  expect(fly.y + fly.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);
  expect(cardBox.y).toBeGreaterThanOrEqual(0);
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('s-turns-card-390.png') });
  expect(errors).toEqual([]);
});
