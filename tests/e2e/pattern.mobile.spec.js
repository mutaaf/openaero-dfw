import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0048 on a phone (390x844, touch), Kid level: the coach says let go, and the card fits
// the screen with the horizon still in view. Kid's hands-off circuit and landing are flown
// headless from this spawn in tests/flight/pattern.test.js.
test('phone, Kid: the traffic pattern tells a kid to let go, and the coach card fits', async ({ page }) => {
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=pattern_kads_16`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText('Let go: the plane flies the pattern for you', { timeout: 10_000 });
  const box = await page.locator('#coach').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  // Hands off, Kid holds the downwind: level at 1,000 ft, wings level, the heading kept.
  await page.waitForTimeout(4000);
  const d = await page.evaluate(() => window.openaeroDebug());
  expect(d.assist).toBe('kid');
  expect(Math.abs(d.aglFt - 1000)).toBeLessThan(100);
  expect(Math.abs(d.headingDeg - 340)).toBeLessThan(10);
  await page.screenshot({ path: test.info().outputPath('pattern-390-kid.png') });
  expect(errors).toEqual([]);
});
