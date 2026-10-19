import { test, expect } from '@playwright/test';
import { stubTiles, collectErrors, BASE } from './helpers.js';

test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

// Ticket 0041: ?fdm=jsbsim loads JSBSim (WASM) after Start flight and flies the Cessna on
// it; the ILS autoland, tuned on flightModel.js, must hold the approach on JSBSim too.
test('?fdm=jsbsim flies the Cessna on JSBSim and the autoland holds the ILS', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.goto(`${BASE}?fdm=jsbsim`);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).fdm, { timeout: 30_000 }).toBe('jsbsim');
  expect((await snap(page)).aircraft).toBe('c172');
  await page.click('#btnApApr');
  const t0 = (await snap(page)).simTime;
  // 45 sim-seconds to capture from wherever the hands-off start left it, then on the beam.
  await expect.poll(async () => (await snap(page)).simTime - t0, { timeout: 200_000, intervals: [2000] }).toBeGreaterThan(45);
  const s = await snap(page);
  expect(s.onGround).toBe(false);
  expect(Math.abs(s.crossM)).toBeLessThan(15);
  expect(Math.abs(s.heightAbovePathM)).toBeLessThan(10);
  expect(s.iasKts).toBeGreaterThan(58);
  expect(s.iasKts).toBeLessThan(82);
  expect(Math.abs(s.bankRightDeg)).toBeLessThan(8);
  expect(errors).toEqual([]);
});
