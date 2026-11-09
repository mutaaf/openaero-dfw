import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0161 on a phone (390x844, touch), at Kid level: hands off, the guide rolls the Cessna into
// the steep turn and holds it; the coach card stays clear of the horizon and the page never scrolls.
test('phone, Kid, hands off: the plane rolls into the steep turn and the coach says so', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=steep_turns`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  expect((await snap()).assist).toBe('kid');
  await expect(page.locator('#txtCoach')).toHaveText(/Let go|holds the turn/, { timeout: 10_000 });
  await expect.poll(async () => (await snap()).steepTurns?.phase, { timeout: 30_000 }).toBe('turn1');
  await expect.poll(async () => (await snap()).bankRightDeg, { timeout: 30_000 }).toBeGreaterThan(40);
  await expect(page.locator('#txtCoach')).toHaveText(/holds the turn/, { timeout: 10_000 });
  // Kid's guide holds the height in the bank (it asks α(1 − cos φ) less nose).
  const a = await snap();
  await page.waitForTimeout(4000);
  const b = await snap();
  expect(Math.abs(b.pos.y - a.pos.y) * 3.28084).toBeLessThan(150);
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.y + coach.height).toBeLessThan(844 / 2);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('steep-turns-390.png') });
  expect(errors).toEqual([]);
});
