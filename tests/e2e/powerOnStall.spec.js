import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
// A long flight: sim time at 4x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Power-on stall drill (ticket 0191): the Cessna at 4,500 ft over Grapevine Lake, flaps 10 at 60 KIAS.
// The coach's first line asks for full power, then the nose (Kid on a phone: powerOnStall.mobile.spec.js).
// The recoveries are flown headless (tests/flight/powerOnStall.test.js, tests/unit/powerOnStall.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('keyboard, Learner: flaps 10 spawn, the coach\'s power and nose, the stall, one F press for flaps up, the card, FLY AGAIN', async ({ page }) => {
  test.setTimeout(240_000);
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
  // Nose up (Learner's cap is lifted until the stall) and hold it to the stall...
  await page.keyboard.down('KeyS');
  await expect.poll(async () => (await snap(page)).stallDrill.phase, { timeout: 90_000 }).toBe('stalled');
  await page.keyboard.up('KeyS');
  await expect(page.locator('#txtCoach')).toHaveText(/Stall! Nose down/);
  // ...nose down until it flies; then one press of F brings flaps 10 up (not down to 20°).
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await snap(page)).stallDrill.phase, { timeout: 20_000 }).toBe('unstalled');
  await page.keyboard.up('KeyW');
  expect((await snap(page)).flapsIndex).toBe(1);
  await page.keyboard.press('KeyF');
  expect((await snap(page)).flapsIndex).toBe(0);
  // A climb attitude (~7°); Learner's auto-trim holds it while the speed builds to Vx.
  // Short taps toward 5-9° until it reads there twice running (the hold keeps where a tap leaves it).
  for (let inBand = 0, i = 0; inBand < 2 && i < 100; i++) {
    const p = (await snap(page)).pitchDeg;
    if (p >= 5 && p <= 9) { inBand++; await page.waitForTimeout(300); continue; }
    inBand = 0;
    const key = p < 5 ? 'KeyS' : 'KeyW';
    await page.keyboard.down(key); await page.waitForTimeout(120); await page.keyboard.up(key);
  }
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Power-on stall recovered');
  // FLY AGAIN arms the drill at once from the kept chunk (panel: no frame without it).
  await page.locator('#btnFlyAgain').click();
  await expect.poll(async () => (await snap(page)).stallDrill?.phase, { timeout: 1_000 }).toBe('armed');
  expect(errors).toEqual([]);
});
