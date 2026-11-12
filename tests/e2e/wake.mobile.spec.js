import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2 });

// Ticket 0115 on a phone (390x844, touch), at Learner: the lesson's jet appears ahead on 35C once the player starts,
// the coach card with its words fits on screen and the page never scrolls.
test('phone, Learner: the jet ahead on 35C, the coach\'s words on screen, no scroll', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?mission=kdfw_35c_wake&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(() => page.evaluate(() => window.openaeroTraffic?.().jet?.endId), { timeout: 15_000 }).toBe('KDFW_35C');
  await expect(page.locator('#txtCoach')).toHaveText(/A jet is landing ahead: stay at or above its path/, { timeout: 10_000 });
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.y).toBeGreaterThanOrEqual(0);
  expect(coach.y + coach.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.openaeroTraffic().visible), { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path: test.info().outputPath('wake-390.png') });
  expect(errors).toEqual([]);
});
