import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Soft-field takeoff lesson (ticket 0182): the deep link opens the lesson in the picker's Drills, the Cessna sits on
// Addison 16 flaps 10 with the soft surface's rolling μ (a game surface, named in the briefing), and the coach starts
// it. Then it is flown: full power, the nose held up by the arrow key from the start of the roll, let go once airborne
// (the takeoff trim climbs it), and the card comes at 200 ft with the nose wheel, lift-off and ground-effect rows. The
// grade itself is flown headless (tests/flight/softField.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=kads_16_soft_field: in Drills, flaps 10 on the soft surface, the briefing names it, flown to the card', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
  await page.goto(`${BASE}?mission=kads_16_soft_field&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="kads_16_soft_field"]')).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/a game surface, the real runway is paved/);
  await expect.poll(async () => (await snap(page)).softField?.end, { timeout: 10_000 }).toBe('KADS_16');
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'kads_16_soft_field', aircraft: 'c172', flapsIndex: 1, onGround: true, surfaceMu: 0.07 });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText(/Soft field: hold S or ↑ \(nose up\), then hold Shift to full power/, { timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath('soft-field-1280.png') });
  await page.click('#btnToga');
  // Nose up from the start (the arrow held while under 8°: the nose carries on ~3-5° after the key comes up, frame-timing
  // dependent; holding to 10° overshot to 11-13° in 2 of 5 runs, the tail struck, the lesson ended before lift-off), hands off once flying.
  await page.evaluate(() => {
    let held = false;
    const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'ArrowUp', key: 'ArrowUp' }));
    const step = () => {
      const d = window.openaeroDebug();
      const want = d.onGround && d.pitchDeg < 8;
      if (want !== held) { key(want ? 'keydown' : 'keyup'); held = want; }
      if (d.onGround || d.aglFt < 30) requestAnimationFrame(step);
      else if (held) key('keyup');
    };
    requestAnimationFrame(step);
  });
  await expect.poll(async () => (await snap(page)).softField?.liftKts ?? null, { timeout: 90_000 }).not.toBeNull();
  const lift = await snap(page);
  expect(lift.softField.noseN).toBeGreaterThan(0);
  expect(lift.softField.liftKts).toBeLessThan(62);
  const card = page.locator('#resultsCard');
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#resultsFactors')).toContainText(/Weight on the nose wheel\s*\d+% of normal/);
  await expect(page.locator('#resultsFactors')).toContainText(/Lift-off speed\s*\d+ kt, after [\d,]+ ft/);
  await expect(page.locator('#resultsFactors')).toContainText(/Height until 70 kt/);
  await page.screenshot({ path: test.info().outputPath('soft-field-card-1280.png') });
  expect(errors).toEqual([]);
});
