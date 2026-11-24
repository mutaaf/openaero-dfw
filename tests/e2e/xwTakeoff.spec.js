import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Crosswind takeoff lesson (ticket 0220) at 1280x720 on the keyboard: the deep link opens the lesson in the picker's Drills,
// the Cessna sits on Addison 16 flaps up in the lesson's wind (e2e has no METAR: the 12 kt scenario from the right), and the
// coach names the stick. Then it is flown on Learner (its pedals hold the centreline on the roll, assists.js): full power with
// D (stick right) held to 40 kt, the nose eased up at 55, let go once airborne (Learner holds the attitude and climbs). The
// card comes at 200 ft with the lesson's rows. The grade itself is flown headless (tests/flight/xwTakeoff.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=kads_crosswind_takeoff: in Drills, the scenario crosswind, the coach names the stick, flown to the card', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?mission=kads_crosswind_takeoff&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="kads_crosswind_takeoff"]')).toBeVisible();
  await expect.poll(async () => (await snap(page)).xwTakeoff?.end, { timeout: 10_000 }).toBe('KADS_16');
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'kads_crosswind_takeoff', aircraft: 'c172', flapsIndex: 0, onGround: true });
  expect(spawn.xwTakeoff).toMatchObject({ side: 'R', live: false, windKts: 12, phase: 'roll' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText('Wind from the right: stick full right (D), then full power (Shift)', { timeout: 10_000 });
  await page.keyboard.down('KeyD');
  await expect(page.locator('#txtCoach')).toHaveText('Full power (Shift), keep the stick into the wind', { timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath('xw-takeoff-1280.png') });
  await page.click('#btnToga');
  await expect(page.locator('#txtCoach')).toHaveText(/^Hold the stick right: the right wing stays down/, { timeout: 20_000 });
  // The stick right to 40 kt, then centred; the nose eased up from 55 kt to ~8° and let go once the wheels are up.
  await page.evaluate(() => {
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code }));
    let ail = true, up = false;
    const step = () => {
      const d = window.openaeroDebug();
      if (ail && d.iasKts >= 40) { key('keyup', 'KeyD'); ail = false; }
      const want = d.iasKts >= 55 && d.pitchDeg < 8 && (d.onGround || d.aglFt < 15);
      if (want !== up) { key(want ? 'keydown' : 'keyup', 'ArrowUp'); up = want; }
      if (d.onGround || d.aglFt < 30) requestAnimationFrame(step);
      else if (up) key('keyup', 'ArrowUp');
    };
    requestAnimationFrame(step);
  });
  await expect.poll(async () => (await snap(page)).xwTakeoff?.liftKts ?? null, { timeout: 90_000 }).not.toBeNull();
  await page.keyboard.up('KeyD');
  const lift = await snap(page);
  expect(lift.xwTakeoff.rolled).toBe(true);
  expect(lift.xwTakeoff.ailN).toBeGreaterThan(0);
  expect(lift.xwTakeoff.ailSum / lift.xwTakeoff.ailN).toBeGreaterThan(0.5); // the stick was right, into the wind
  expect(lift.xwTakeoff.maxOffM).toBeLessThan(15); // Learner's pedals held it on Addison's 100 ft
  const card = page.locator('#resultsCard');
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#resultsFactors')).toContainText(/Centreline on the roll/);
  await expect(page.locator('#resultsFactors')).toContainText(/Aileron into the wind, to 40 kt\s*\d+% of full right/);
  await expect(page.locator('#resultsFactors')).toContainText(/Lift-off\s*\d+ kt/);
  await expect(page.locator('#resultsFactors')).toContainText(/Track over the centreline, 50-200 ft\s*crab \d+°/);
  await page.screenshot({ path: test.info().outputPath('xw-takeoff-card-1280.png') });
  expect(errors).toEqual([]);
});
