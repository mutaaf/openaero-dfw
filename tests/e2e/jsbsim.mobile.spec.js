import { test, expect } from '@playwright/test';
import { stubTiles, collectErrors, BASE } from './helpers.js';

test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

// Ticket 0041 on a phone (390x844, touch): JSBSim loads on Start flight and the trimmed
// Cessna flies hands-off for 10 sim-seconds with zero console errors.
test('?fdm=jsbsim on a phone: JSBSim loads and the trimmed Cessna flies hands-off', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.goto(`${BASE}?fdm=jsbsim`);
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).fdm, { timeout: 30_000 }).toBe('jsbsim');
  const t0 = (await snap(page)).simTime;
  const h0 = (await snap(page)).aglFt;
  await expect.poll(async () => (await snap(page)).simTime - t0, { timeout: 120_000, intervals: [1000] }).toBeGreaterThan(10);
  const s = await snap(page);
  expect(s.onGround).toBe(false);
  expect(s.aglFt).toBeGreaterThan(h0 - 400); // trimmed: settling into a glide, not falling
  expect(s.aircraft).toBe('c172');
  expect(Number.isFinite(s.iasKts)).toBe(true);
  await page.screenshot({ path: 'test-results/jsbsim-phone.png' });
  expect(errors).toEqual([]);
});
