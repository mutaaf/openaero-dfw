import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
// A long flight: sim time at 4x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Power-on stall drill (ticket 0191): the Cessna at 4,500 ft over Grapevine Lake, flaps 10 at 60 KIAS.
// The coach's first line asks for full power, then the nose (Kid on a phone: powerOnStall.mobile.spec.js).
// The recoveries are flown headless (tests/flight/powerOnStall.test.js, tests/unit/powerOnStall.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('keyboard, Learner: the mission spawns at flaps 10, in Drills, and the coach asks for full power, then the nose', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?mission=c172_power_on_stall`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="c172_power_on_stall"]')).toBeVisible();
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'c172_power_on_stall', aircraft: 'c172', flapsIndex: 1, onGround: false, missionRunway: null });
  expect(spawn.aglFt).toBeGreaterThan(4300);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).stallDrill?.phase, { timeout: 10_000 }).toBe('armed');
  await expect(page.locator('#txtCoach')).toHaveText(/Full power/, { timeout: 10_000 });
  await page.locator('#rngThrottle').fill('100');
  await expect(page.locator('#txtCoach')).toHaveText(/Raise the nose to 20°/, { timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath('power-on-stall-1280-coach.png') });
  expect(errors).toEqual([]);
});
