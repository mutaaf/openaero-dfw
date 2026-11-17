import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Wing-low crosswind lesson (ticket 0188): the deep link opens it in the picker's Drills, the Cessna spawns on Addison 16's
// 2 NM final at 70 KIAS with flaps 10 (POH p. 4-34), the wind is the scenario's 12 kt from 250° (the test has no live METAR)
// and the coach names the right wing and the left rudder. Then Kid flies a short final of it (?debug openaeroDebugFinal
// with the lesson's flag) to the card (the landing's own: Kid's de-crab flew the wing). The grade itself is flown headless
// (tests/flight/wingLow.test.js); the touch pedals are tests/e2e/wingLow.mobile.spec.js.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=kads_crosswind_wing_low: in Drills, flaps 10 at 70, the scenario crosswind, the briefing names the wing', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
  await page.goto(`${BASE}?mission=kads_crosswind_wing_low&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="kads_crosswind_wing_low"]')).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/touch down on the upwind wheel first/);
  await expect.poll(async () => (await snap(page)).wingLow?.end, { timeout: 10_000 }).toBe('KADS_16');
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'kads_crosswind_wing_low', aircraft: 'c172', flapsIndex: 1, onGround: false, missionRunway: 'KADS_16' });
  expect(spawn.wingLow).toMatchObject({ side: 'R', windDirDeg: 250, windKts: 12, live: false });
  expect(Math.abs(spawn.iasKts - 70)).toBeLessThan(5);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText('Wind from the right: lower the right wing, left rudder (Q) to hold the line', { timeout: 10_000 });
  // The pedals are the touch deck's: not on a desktop.
  await expect(page.locator('#touchRudder')).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('wing-low-1280.png') });
  // Q holds left rudder on the keyboard (the briefing's pedal).
  await page.keyboard.down('KeyQ');
  await expect.poll(async () => (await snap(page)).rudderInput, { timeout: 5_000 }).toBeLessThan(-0.5);
  await page.keyboard.up('KeyQ');
  expect(errors).toEqual([]);
});

test('Kid on a short final of the lesson: lands itself, the touchdown is recorded, the card is the landing\'s own', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=kads_crosswind_wing_low&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.openaeroDebugFinal('KADS', '16', 0.6, 0, { aircraft: 'c172', kias: 65, flaps: 1, wingLow: true }));
  await expect.poll(async () => (await snap(page)).wingLow?.end, { timeout: 10_000 }).toBe('KADS_16');
  await expect(page.locator('#txtCoach')).toHaveText('Wind from the right: let go, your plane lines itself up', { timeout: 10_000 });
  const card = page.locator('#resultsCard');
  await expect(card).toBeVisible({ timeout: 120_000 });
  const done = await snap(page);
  expect(done.wingLow.td).not.toBeNull();
  await expect(page.locator('#resultsFactors')).toContainText(/Touchdown rate/);
  await expect(page.locator('#resultsFactors')).not.toContainText(/Wing into the wind/); // its de-crab flew it
  await page.screenshot({ path: test.info().outputPath('wing-low-card-1280.png') });
  expect(errors).toEqual([]);
});
