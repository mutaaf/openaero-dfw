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
  await expect(el).toHaveText(/^FUEL \d+\.\d GAL( \d+h\d\d)?$/);
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
  // It takes no width from the touch deck (the device panel: a one-line label widened the throttle's
  // column and squeezed the stick from 144 to 96 px): every control sits where it sits without it.
  const boxes = () => Promise.all(['#touchThrottle', '#touchStick', '#txtTouchThr'].map((s) => page.locator(s).boundingBox()));
  const withFuel = await boxes();
  expect(box.width).toBeLessThanOrEqual(withFuel[0].width + 1);
  await page.evaluate(() => document.getElementById('txtTouchFuel').classList.add('hidden'));
  const without = await boxes();
  for (let i = 0; i < 3; i++) {
    expect(withFuel[i].x).toBeCloseTo(without[i].x, 0);
    expect(withFuel[i].width).toBeCloseTo(without[i].width, 0);
  }
  expect(withFuel[1].width).toBeGreaterThanOrEqual(140);
  await page.evaluate(() => document.getElementById('txtTouchFuel').classList.remove('hidden'));
  await page.screenshot({ path: test.info().outputPath('fuel-390x844.png') });
  expect(errors).toEqual([]);
});
