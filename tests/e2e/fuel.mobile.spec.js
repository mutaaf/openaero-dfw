import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0162 on a phone (390x844, Pilot): the Cessna's FUEL sits over the touch throttle's THR
// label, on screen, clear of it and of the stick, and under the horizon's band.
test('390x844 Pilot: FUEL over the throttle, inside the screen, overlapping nothing', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(`${BASE}?debug&mission=steep_turns`);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const el = page.locator('#txtTouchFuel');
  await expect(el).toBeVisible({ timeout: 10_000 });
  await expect(el).toHaveText(/^FUEL \d+\.\d GAL \d+:\d\d$/);
  const box = await el.boundingBox();
  const vp = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  // Low on the screen: under its middle, where the horizon sits on a level flight.
  expect(box.y).toBeGreaterThan(vp.height / 2);
  const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const sel of ['#txtTouchThr', '#touchThrottle', '#touchStick']) {
    const other = await page.locator(sel).boundingBox();
    if (other) expect(overlap(box, other), sel).toBe(false);
  }
  await page.screenshot({ path: test.info().outputPath('fuel-390x844.png') });
  expect(errors).toEqual([]);
});
