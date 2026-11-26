import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Short-field takeoff lesson (ticket 0225): the deep link opens the lesson in the picker's Drills, the Cessna sits on Addison
// 16 flaps 10 with the brakes set, and the coach runs the POH checklist: full power on the brakes, then B lets them go.
// Then it is flown with the keyboard: the nose up from 45 kt, let go once it is climbing (the takeoff trim climbs it), and
// the card comes at 200 ft with the handbook's distances beside the flown ones. The grade itself is flown headless
// (tests/flight/shortTakeoff.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=kads_16_short_field_takeoff: in Drills, flaps 10, the brakes held; full power, B, flown to the card', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
  await page.goto(`${BASE}?mission=kads_16_short_field_takeoff&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="kads_16_short_field_takeoff"]')).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/graded against the handbook's for today's air/);
  await expect.poll(async () => (await snap(page)).shortTakeoff?.end, { timeout: 10_000 }).toBe('KADS_16');
  expect(await snap(page)).toMatchObject({ mission: 'kads_16_short_field_takeoff', aircraft: 'c172', flapsIndex: 1, onGround: true, brakesOn: true });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText('Short field: the brakes are on. Hold Shift: full power first', { timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath('short-takeoff-1280.png') });
  await page.click('#btnToga');
  await expect(page.locator('#txtCoach')).toHaveText('Full power: let the brakes go (B)', { timeout: 10_000 });
  const held = await snap(page);
  expect(held.shortTakeoff.phase).toBe('hold'); // full power on the brakes: still held
  expect(held.gsKts).toBeLessThan(2);
  await page.keyboard.press('KeyB');
  await expect.poll(async () => (await snap(page)).shortTakeoff.phase, { timeout: 5_000 }).toBe('roll');
  // The nose up from 45 kt to ~8° (the key's overshoot carries it to ~10-11°), held to 30 ft so it does not sink back.
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
  expect(lift.shortTakeoff.liftKts).toBeGreaterThan(45);
  expect(lift.shortTakeoff.liftKts).toBeLessThan(62);
  expect(lift.shortTakeoff.poh.rollFt).toBeGreaterThan(900);
  const card = page.locator('#resultsCard');
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Short-field takeoff');
  await expect(page.locator('#resultsFactors')).toContainText(/Ground roll\s*[\d,]+ ft \(handbook [\d,]+\)/);
  await expect(page.locator('#resultsFactors')).toContainText(/To 50 ft\s*[\d,]+ ft \(handbook [\d,]+\)/);
  await expect(page.locator('#resultsFactors')).toContainText(/Lift-off speed\s*\d+ kt \(handbook 51\)/);
  await page.screenshot({ path: test.info().outputPath('short-takeoff-card-1280.png') });
  expect(errors).toEqual([]);
});
