// The Rapier world (ticket 0043, src/world/): its chunk and wasm are fetched only after the start screen
// closes on a KDFW flight (or within 5 km of the tug, serviceRoad.js LOAD_M), never at boot or at another
// airport; on the KDFW takeoff (the ramp lane ~2 km off) the tow tractor drives on its own wheels; on the
// default 4 NM final (~9 km off) it is loaded and asleep. ?debug: window.openaeroWorld.
import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, BASE } from './helpers.js';
import { worldFetches, flyWorld } from './worldHelpers.js';

test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('the KDFW takeoff: Rapier loads after Start, never at boot; the tug drives its road on four wheels; no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  const fetched = worldFetches(page);
  await page.goto(`${BASE}?debug&mission=kdfw_takeoff`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.waitForTimeout(3000); // boot and the after-boot chunks (runway lights) have loaded
  expect(fetched).toEqual([]);
  const a = await flyWorld(page);
  expect(fetched.some((u) => /rapier_wasm3d_bg.*\.wasm$/.test(u))).toBe(true);
  expect(a.asleep).toBe(false);
  // It moves along its road on all four wheels, on the centreline, at walking pace.
  await expect.poll(async () => (await page.evaluate(() => window.openaeroWorld().along)) - a.along, { timeout: 20_000 }).toBeGreaterThan(2);
  const b = await page.evaluate(() => window.openaeroWorld());
  expect(b.contact).toBe(4);
  expect(Math.abs(b.laneErr)).toBeLessThan(0.8);
  expect(Math.abs(b.speed)).toBeLessThan(1.6);
  expect(errors).toEqual([]);
});

test('the default 4 NM final (KDFW, ~9 km from the tug): loaded on the spawn, asleep', async ({ page }) => {
  await page.goto(`${BASE}?debug`);
  const a = await flyWorld(page);
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => window.openaeroWorld());
  expect(b.asleep).toBe(true);
  expect(b.steps).toBe(a.steps); // the warm-up step at load, then nothing
});

test('a Love Field final: nothing of the world is fetched', async ({ page }) => {
  const fetched = worldFetches(page);
  await page.goto(`${BASE}?debug&mission=kdal_31r_final`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.waitForTimeout(4000);
  expect(fetched).toEqual([]);
  expect(await page.evaluate(() => typeof window.openaeroWorld)).toBe('undefined');
});
