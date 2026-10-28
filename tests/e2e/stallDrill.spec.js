import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';
// A long flight: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Stall recovery drill (ticket 0087): the Cessna at 4,500 ft over Grapevine Lake; power idle,
// nose up until it stalls, then nose down, full power, and the card grades the recovery.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

// Learner (the first-visit level): its stall protection is off until the stall, and after it
// its auto-trim holds the climb. Pilot's raw recovery is flown headless (tests/flight/c172).
test('fly the drill with the keyboard on Learner: idle, stall, nose down, full power, the card grades it', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?mission=c172_stall_recovery`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  // In the start screen's picker, under Drills.
  await expect(page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="c172_stall_recovery"]')).toBeVisible();
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'c172_stall_recovery', aircraft: 'c172', flapsIndex: 0, onGround: false, missionRunway: null });
  expect(spawn.aglFt).toBeGreaterThan(4300);
  expect(spawn.aglFt).toBeLessThan(4700);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).stallDrill?.phase, { timeout: 10_000 }).toBe('armed');
  await expect(page.locator('#txtCoach')).toHaveText(/Power to idle/, { timeout: 10_000 });
  await page.locator('#rngThrottle').fill('0');
  await expect(page.locator('#txtCoach')).toHaveText(/Ease back/, { timeout: 10_000 });
  // Nose up until the wing stalls...
  await page.keyboard.down('KeyS');
  await expect.poll(async () => (await snap(page)).stallDrill.phase, { timeout: 90_000 }).toBe('stalled');
  await page.keyboard.up('KeyS');
  await expect(page.locator('#txtCoach')).toHaveText(/Stall! Nose down/);
  // ...then nose down until it flies, and full power.
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await snap(page)).stallDrill.phase, { timeout: 20_000 }).toBe('unstalled');
  await page.keyboard.up('KeyW');
  await page.locator('#rngThrottle').fill('100');
  await expect(page.locator('#txtCoach')).toHaveText(/Climb away|Wings level|Power in/);
  // Ease back to a climb attitude; Learner's auto-trim holds it (its protection stops an over-pull).
  await page.keyboard.down('KeyS');
  await expect.poll(async () => (await snap(page)).pitchDeg, { timeout: 20_000 }).toBeGreaterThan(6);
  await page.keyboard.up('KeyS');
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Stall recovered');
  await expect(page.locator('#txtResultRunway')).toHaveText(/Grapevine Lake/);
  await expect(page.locator('#resultsFactors li')).toHaveCount(4);
  await expect(page.locator('#resultsFactors')).toContainText('Altitude lost');
  const s = await snap(page);
  expect(s.stallDrill.phase).toBe('complete');
  expect(s.paused).toBe(true);
  expect(await lowContrastLabels(page, '#resultsCard')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('stall-drill-1280.png') });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
  expect(Object.keys(stored.missions['c172_stall_recovery@learner']).sort()).toEqual(['at', 'grade', 'score']);
  await page.locator('#btnKeepRolling').click();
  expect((await snap(page)).paused).toBe(false);
  expect(errors).toEqual([]);
});
