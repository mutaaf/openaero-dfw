import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Hot-day takeoff lesson (ticket 0226): the deep link opens it in Drills; the start screen says the scenario's density
// altitude (and SCENARIO WX on the ribbon, never live); the coach gives it and the handbook roll on the brakes, then the
// short-field lesson's words. Flown with the keyboard: full power, B, the nose up from 45 kt, F once the coach says flaps
// up, and the card at 400 ft shows the roll and the climb beside a cool day's. The grade is flown headless
// (tests/flight/hotTakeoff.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=kads_16_hot_takeoff: the scenario\'s density altitude on the start screen and the coach, flown to the card', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
  await page.goto(`${BASE}?mission=kads_16_hot_takeoff&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="kads_16_hot_takeoff"]')).toBeVisible();
  await expect.poll(async () => (await snap(page)).shortTakeoff?.hot, { timeout: 10_000 }).toBe(true);
  await expect(page.locator('#txtDaValue')).toHaveText('Density altitude KADS 16: 3,500 ft (scenario, 38 °C).', { timeout: 5_000 });
  await expect(page.locator('#txtThinAir')).toHaveText(/longer takeoff roll and a weaker climb/);
  await expect(page.locator('#wxBadge')).toHaveText('SCENARIO WX');
  expect(await snap(page)).toMatchObject({ mission: 'kads_16_hot_takeoff', aircraft: 'c172', flapsIndex: 1, onGround: true, brakesOn: true });
  await page.screenshot({ path: test.info().outputPath('hot-takeoff-menu-1280.png') });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText('Scenario 38 °C, density altitude 3,500 ft: the handbook roll is 1,200 ft, not 1,020. Hold Shift: full power', { timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath('hot-takeoff-1280.png') });
  await page.click('#btnToga');
  await expect(page.locator('#txtCoach')).toHaveText('Full power. The same 45 knots, a longer roll (1,200 ft). Let the brakes go (B)', { timeout: 10_000 });
  await page.keyboard.press('KeyB');
  await expect.poll(async () => (await snap(page)).shortTakeoff.phase, { timeout: 5_000 }).toBe('roll');
  // short-field's spec's keyboard pilot: the nose up from 45 kt, held to 30 ft, then the takeoff trim climbs it.
  await page.evaluate(() => {
    let held = false;
    const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'ArrowUp', key: 'ArrowUp' }));
    const step = () => {
      const d = window.openaeroDebug();
      const want = d.iasKts >= 45 && d.pitchDeg < (d.onGround ? 8 : 6);
      if (want !== held) { key(want ? 'keydown' : 'keyup'); held = want; }
      if (d.onGround || d.aglFt < 30) requestAnimationFrame(step);
      else if (held) key('keyup');
    };
    requestAnimationFrame(step);
  });
  await expect.poll(async () => (await snap(page)).shortTakeoff?.phase, { timeout: 90_000 }).toBe('air');
  const lift = await snap(page);
  expect(lift.shortTakeoff.poh.rollFt).toBeCloseTo(1202, 0);
  // Flaps up once past 60 kt above the obstacle: one press of F brings the lever up from 10.
  await expect.poll(async () => (await snap(page)).shortTakeoff?.flapsUp, { timeout: 60_000 }).toBe(true);
  await expect(page.locator('#txtCoach')).toHaveText('Above 60 knots: flaps up, press F. Climb at 74', { timeout: 5_000 });
  await page.keyboard.press('KeyF');
  await expect.poll(async () => (await snap(page)).flapsIndex, { timeout: 5_000 }).toBe(0);
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Hot-day takeoff');
  await expect(page.locator('#resultsFactors')).toContainText(/Ground roll\s*[\d,]+ ft \(handbook 1,202; 15 °C: 1,017\)/);
  await expect(page.locator('#resultsFactors')).toContainText(/To 50 ft\s*[\d,]+ ft \(handbook 2,037; 15 °C: 1,729\)/);
  await expect(page.locator('#resultsFactors')).toContainText(/Climb, 200-400 ft\s*[\d,]+ fpm at \d+ kt \(handbook 625; 15 °C: 701\)/);
  await expect(page.locator('#resultsCard')).toContainText(/Scenario day: 38 °C/);
  await page.screenshot({ path: test.info().outputPath('hot-takeoff-card-1280.png') });
  expect(errors).toEqual([]);
});

// Another mission after the hot day flies the day's own weather again (the scenario is the lesson's only).
test('leaving the lesson gives the weather back', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE}?mission=kads_16_hot_takeoff&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#txtDaValue')).toHaveText(/3,500 ft \(scenario, 38 °C\)/, { timeout: 10_000 });
  await page.locator('[data-scenario="kads_16_short_field_takeoff"]').click();
  await expect(page.locator('#txtDaValue')).not.toHaveText(/38 °C/, { timeout: 5_000 });
  expect((await snap(page)).shortTakeoff.hot).toBe(false);
  expect(errors).toEqual([]);
});
