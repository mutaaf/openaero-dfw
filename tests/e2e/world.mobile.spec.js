// The Rapier world on a 390x844 touch phone (ticket 0043): loaded after Start, the tug driving on the
// KDFW takeoff, no console errors.
import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, BASE } from './helpers.js';
import { worldFetches, flyWorld } from './worldHelpers.js';

test('phone: the tug drives its road after Start, no console errors', async ({ page }) => {
  await stubTiles(page);
  const errors = collectErrors(page);
  const fetched = worldFetches(page);
  await page.goto(`${BASE}?debug&mission=kdfw_takeoff`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  expect(fetched).toEqual([]);
  const a = await flyWorld(page);
  await expect.poll(async () => (await page.evaluate(() => window.openaeroWorld().along)) - a.along, { timeout: 20_000 }).toBeGreaterThan(1);
  expect((await page.evaluate(() => window.openaeroWorld())).contact).toBe(4);
  expect(errors).toEqual([]);
});
