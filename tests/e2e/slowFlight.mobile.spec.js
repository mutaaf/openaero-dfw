import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Ticket 0164 on a phone (390x844, touch), at Kid level: hands off, the plane slows to the band and holds
// it level; the hold is graded on the results card. The coach card stays clear of the horizon.
test('phone, Kid, hands off: the plane flies slow and level, and the hold is graded', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=c172_slow_flight`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  expect((await snap()).assist).toBe('kid');
  await expect(page.locator('#txtCoach')).toHaveText(/Let go|slows down/, { timeout: 10_000 });
  await expect.poll(async () => (await snap()).slowFlight?.phase, { timeout: 90_000 }).toBe('holding');
  await expect(page.locator('#txtCoach')).toHaveText(/flies slowly/, { timeout: 10_000 });
  const s = await snap();
  expect(s.iasKts).toBeLessThan(s.slowFlight.targetKts + 12);
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.y + coach.height).toBeLessThan(844 / 2);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('slow-flight-390.png') });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#resultsCard')).toContainText(/Slow flight/);
  await expect(page.locator('#resultsCard')).toContainText(/for you/);
  await page.screenshot({ path: test.info().outputPath('slow-flight-results-390.png') });
  expect(errors).toEqual([]);
});
