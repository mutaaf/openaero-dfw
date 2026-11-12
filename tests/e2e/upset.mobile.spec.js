import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0174 on a phone (390x844, touch), at Kid level: the instructor hands the Cessna over nose-high
// and slowing; hands off, Kid's assists lower the nose and level it, and the results card says the plane
// recovered for you. The coach card stays on screen and the page never scrolls.
test('phone, Kid, nose-high: hands off, the plane recovers itself and the card says so', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=upset_nose_high`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  expect((await snap()).assist).toBe('kid');
  await expect.poll(async () => (await snap()).upset?.phase, { timeout: 10_000 }).toBe('recover');
  expect((await snap()).pitchDeg).toBeGreaterThan(0); // still nose-up (Kid's assists are already pushing; the set-up's +35° is carded headless)
  await expect(page.locator('#txtCoach')).toHaveText(/levels itself/, { timeout: 10_000 });
  // The coach card fits on screen, clear of the stall banner (up top: the zoom is slow).
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.y).toBeGreaterThanOrEqual(0);
  expect(coach.y + coach.height).toBeLessThanOrEqual(844);
  const banner = page.locator('#stallAlertBanner');
  if (await banner.isVisible()) {
    const b = await banner.boundingBox();
    expect(coach.y >= b.y + b.height || coach.y + coach.height <= b.y).toBe(true);
  }
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('upset-high-390.png') });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#resultsCard')).toContainText(/recovered for you/);
  await page.screenshot({ path: test.info().outputPath('upset-high-card-390.png') });
  expect(errors).toEqual([]);
});
