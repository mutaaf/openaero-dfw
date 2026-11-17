import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Short-field landing lesson (ticket 0181): the deep link opens the lesson in the picker's Drills, the Cessna spawns on
// Addison 16's 3 NM final flaps up at 70 KIAS (POH Section 4), and the coach briefs it. Then Kid flies a short final of
// it (?debug openaeroDebugFinal with the lesson's flag) and the brakes go on at the touchdown: the card waits for the
// stop and shows the roll against the POH's. The grade itself is flown headless (tests/flight/shortField.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=kads_16_short_field: in Drills, the spawn flaps up at 70, the briefing, the 61 kt target', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
  await page.goto(`${BASE}?mission=kads_16_short_field&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="kads_16_short_field"]')).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/before the big white blocks \(1,000 ft\)/);
  await expect.poll(async () => (await snap(page)).shortField?.end, { timeout: 10_000 }).toBe('KADS_16');
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'kads_16_short_field', aircraft: 'c172', flapsIndex: 0, onGround: false, missionRunway: 'KADS_16' });
  expect(Math.abs(spawn.iasKts - 70)).toBeLessThan(5);
  expect(spawn.aglFt).toBeGreaterThan(800);
  expect(spawn.aglFt).toBeLessThan(1150);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText(/Short field: full flaps, 61 knots on the PAPI/, { timeout: 10_000 });
  // Then the landing coach, with the lesson's flaps first (the spawn is flaps up).
  await expect(page.locator('#txtCoach')).toHaveText(/Landing flaps: press F until 30°/, { timeout: 20_000 });
  await page.screenshot({ path: test.info().outputPath('short-field-1280.png') });
  expect(errors).toEqual([]);
});

test('Kid on a short final of the lesson, brakes on at the touchdown: the card comes at the stop with the roll vs the POH', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=kads_16_short_field&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.openaeroDebugFinal('KADS', '16', 0.6, 0, { aircraft: 'c172', kias: 61, flaps: 3, shortField: true }));
  await expect.poll(async () => (await snap(page)).shortField?.end, { timeout: 10_000 }).toBe('KADS_16');
  await expect.poll(async () => (await snap(page)).onGround, { timeout: 90_000 }).toBe(true);
  await page.keyboard.press('KeyB'); // brakes on (the coach's "Brakes on (B) to stop")
  const card = page.locator('#resultsCard');
  // Not at the touchdown: the lesson grades at the stop (750 ms is 3 s of sim time at 4x).
  await page.waitForTimeout(750);
  const rolling = await snap(page);
  if (rolling.gsKts > 10) await expect(card).toBeHidden();
  await expect(card).toBeVisible({ timeout: 60_000 });
  const done = await snap(page);
  expect(done.shortField.stopped).toBe(true);
  expect(done.shortField.off).toBe(false);
  expect(done.shortField.brakeS).not.toBeNull();
  await expect(page.locator('#resultsFactors')).toContainText(/Landing roll\s*[\d,]+ ft \(handbook [\d,]+\)/);
  await expect(page.locator('#resultsFactors')).toContainText(/Brakes\s*on (\d+\.\d s after|before) touchdown/);
  await expect(page.locator('#resultsFactors')).toContainText(/Touchdown point/);
  await page.screenshot({ path: test.info().outputPath('short-field-card-1280.png') });
  expect(errors).toEqual([]);
});
