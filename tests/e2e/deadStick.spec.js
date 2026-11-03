import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';
// A long flight: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Dead-stick challenge (ticket 0036): the Cessna 3,500 ft over North Dallas, abeam Addison, its
// engine dead. The throttle can't bring it back; the coach says pitch for 68 knots. The ?debug
// hook then puts the glide on a 0.35 NM final with a little height to spare, and Kid's
// hands-off glide guide lands it on the runway: the card says the runway was made.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('engine out at Addison: no thrust at full throttle, coached, and a glide that makes the runway is graded made', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?debug&mission=deadstick_kads_16`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  // In the start screen's picker, with Addison's final.
  await expect(page.locator('#missionList section', { hasText: 'Addison' }).locator('[data-scenario="deadstick_kads_16"]')).toBeVisible();
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'deadstick_kads_16', aircraft: 'c172', flapsIndex: 0, onGround: false, engineFailed: true, throttle: 0 });
  expect(spawn.aglFt).toBeGreaterThan(3300);
  expect(spawn.aglFt).toBeLessThan(3700);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  // Kid level: its guide flies the glide and the turns (Pilot's words are unit-tested in deadStick.test.js).
  await expect(page.locator('#txtCoach')).toHaveText('Engine stopped! Let go: the plane glides', { timeout: 10_000 });
  await expect(page.locator('#txtThrottle')).toHaveText('ENG OUT');
  // Full throttle: the lever moves, the engine stays dead (the prop windmills, n = 0).
  await page.locator('#rngThrottle').fill('100');
  await page.waitForTimeout(1000);
  const dead = await snap(page);
  expect(dead.throttle).toBe(1);
  expect(dead.engineN).toBeLessThan(0.01);
  expect(dead.engineFailed).toBe(true);
  await page.screenshot({ path: test.info().outputPath('deadstick-1280-coach.png') });
  // 0.35 NM out, ~80 ft above the 9:1 glide to the threshold: hands off, Kid glides and flares.
  // (Short: CI's e2e suite runs close to its 30 min job limit.)
  await page.evaluate(() => window.openaeroDebugDeadStick(0.35, Math.round(0.35 * 6076 / 9) + 80));
  await expect.poll(async () => (await snap(page)).activeRunway, { timeout: 5_000 }).toBe('KADS_16');
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Dead-stick landing');
  await expect(page.locator('#txtResultRunway')).toHaveText('KADS 16');
  await expect(page.locator('#resultsFactors li').first()).toContainText('Made the runway');
  await expect(page.locator('#resultsFactors li').first()).toContainText('yes');
  await expect(page.locator('#txtStabilized')).toContainText('Made the runway with the engine out');
  expect(['S', 'A', 'B', 'C']).toContain((await page.locator('#txtGrade').textContent()).trim());
  expect(await lowContrastLabels(page, '#resultsCard')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('deadstick-1280.png') });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
  expect(Object.keys(stored.missions['deadstick_kads_16@kid']).sort()).toEqual(['at', 'grade', 'score']);
  // Fly again: the same challenge, the engine still out.
  await page.locator('#btnFlyAgain').click();
  expect((await snap(page)).engineFailed).toBe(true);
  expect(errors).toEqual([]);
});
