import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0189 on a phone (390x844, touch), Pilot: the power-off 180 loads on its downwind with the
// engine out, the coach's first words fit, the touch throttle reads OUT and moving it does nothing.
test('phone, Pilot: the power-off 180 starts engine out with its coach on screen', async ({ page }) => {
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
  await page.goto(`${BASE}?debug&mission=pad_180_kads_16`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  await expect(page.locator('#txtCoach')).toHaveText('Engine out! Pitch for 68 knots: the spot is the big white blocks', { timeout: 10_000 });
  await expect(page.locator('#txtTouchThr')).toHaveText('OUT');
  const coach = await page.locator('#txtCoach').boundingBox();
  expect(coach.x).toBeGreaterThanOrEqual(0);
  expect(coach.x + coach.width).toBeLessThanOrEqual(390);
  const s = await snap();
  expect(s).toMatchObject({ mission: 'pad_180_kads_16', engineFailed: true });
  expect(s.engineN).toBeLessThan(0.01);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('power180-390-coach.png') });
  // Gliding on down the downwind: the coach says when to turn (not yet, 1,000 ft abeam the spot).
  await expect(page.locator('#txtCoach')).toHaveText('Spot off your left: too high to turn yet, glide on', { timeout: 15_000 });
  expect(errors).toEqual([]);
});
