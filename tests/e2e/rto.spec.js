import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';
// A long roll: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Rejected takeoff drill (ticket 0107): the 737 on DFW 35C at full power; an engine fire warning
// below V1. Pilot, keyboard and buttons: the HUD says ENGINE FIRE, the coach says idle, then
// brakes; IDLE and B stop it on the runway, and the card grades the reaction and the stop.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('rejected takeoff, Pilot: the fire warning before V1, idle and brakes stop it, graded card', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
  await page.goto(`${BASE}?debug&mission=kdfw_35c_rto`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Dallas' }).locator('[data-scenario="kdfw_35c_rto"]')).toContainText('fire');
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).rto?.phase, { timeout: 10_000 }).toBe('armed');
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'kdfw_35c_rto', aircraft: 'b738', onGround: true });
  expect(spawn.rto.failKts).toBeGreaterThanOrEqual(75);
  expect(spawn.rto.failKts).toBeLessThanOrEqual(110);
  await expect(page.locator('#txtCoach')).toHaveText(/^Full power \(TO\/GA\)/, { timeout: 10_000 });
  await page.click('#btnToga');
  await expect.poll(async () => (await snap(page)).rto.phase, { timeout: 90_000, intervals: [100] }).toBe('fire');
  await expect(page.locator('#masterAlertBanner')).toHaveText('ENGINE FIRE — IDLE, BRAKES');
  await expect(page.locator('#masterAlertBanner')).toBeVisible();
  await expect(page.locator('#txtCoach')).toHaveText('ENGINE FIRE! Reject: thrust to idle now');
  await page.screenshot({ path: test.info().outputPath('rto-1280-fire.png') });
  await page.click('#btnIdle');
  await expect(page.locator('#txtCoach')).toHaveText('Full brakes: B, or tap BRAKES');
  await page.keyboard.press('b');
  // The warning has said what to do; with the thrust idle it gives the coach's slot back.
  await expect(page.locator('#masterAlertBanner')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Rejected takeoff');
  await expect(page.locator('#resultsFactors li').nth(0)).toContainText(/Fire to thrust idle\s*\d+\.\d s/);
  await expect(page.locator('#resultsFactors li').nth(1)).toContainText('of runway left');
  expect((await snap(page)).rto.phase).toBe('stopped');
  const done = await snap(page);
  console.log(`[0107] fire at ${done.rto.failKts} kt, idle ${done.rto.idleS?.toFixed(1)} s, brakes ${done.rto.brakeS?.toFixed(1)} s, stop ${Math.round(done.rto.stopM)} m, grade ${await page.locator('#txtGrade').textContent()}`);
  // Stopped on the runway: no failure reason. The letter is the harness's own reaction time (a CDP
  // round trip under 2x warp, ~3.5 s, a C or D); tests/flight/rto.test.js grades a pilot's.
  await expect(page.locator('#txtGradeReason')).toBeHidden();
  expect(['S', 'A', 'B', 'C', 'D']).toContain((await page.locator('#txtGrade').textContent()).trim());
  expect(await lowContrastLabels(page, '#resultsCard')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('rto-1280.png') });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
  expect(Object.keys(stored.missions.kdfw_35c_rto).sort()).toEqual(['at', 'grade', 'score']);
  // Fly again: back on the threshold, armed again.
  await page.locator('#btnFlyAgain').click();
  expect(await snap(page)).toMatchObject({ onGround: true, gsKts: 0 });
  await expect.poll(async () => (await snap(page)).rto?.phase).toBe('armed');
  expect(errors).toEqual([]);
});
