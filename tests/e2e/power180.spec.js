import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';
// A long flight: sim time at 4x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Power-off 180 (ticket 0189): the Cessna on a left downwind for Addison 16, 1,000 ft up, abeam
// the spot, its engine dead once the flight starts. Kid level, hands off from the spawn: its guide
// glides on, turns when the coach would and lands; the card grades the touchdown against the spot
// and its strip shades the ACS window (the spot to 200 ft past it).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('power-off 180, Kid hands off from the spawn: engine out, round to 16, graded against the spot', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?debug&mission=pad_180_kads_16`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  // In the start screen's picker, under Drills.
  await expect(page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="pad_180_kads_16"]')).toBeVisible();
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'pad_180_kads_16', aircraft: 'c172', flapsIndex: 0, onGround: false, engineFailed: true, throttle: 0 });
  expect(spawn.aglFt).toBeGreaterThan(900);
  expect(spawn.aglFt).toBeLessThan(1100);
  expect(Math.abs(spawn.headingDeg - 340)).toBeLessThan(3);
  // Behind the start screen nothing flies: once the lesson's chunk has armed, the Cessna is held at
  // the spawn (power180.js p180Step), the same place a second later and near where it appeared.
  await page.waitForTimeout(1500);
  const held = await snap(page);
  await page.waitForTimeout(1000);
  expect((await snap(page)).pos).toEqual(held.pos);
  expect(Math.hypot(held.pos.x - spawn.pos.x, held.pos.z - spawn.pos.z)).toBeLessThan(30);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText('Engine stopped! Let go: the plane glides to the white blocks', { timeout: 10_000 });
  await expect(page.locator('#txtThrottle')).toHaveText('ENG OUT');
  await expect(page.locator('#txtCoach')).toHaveText('No engine: the plane glides round to the white blocks', { timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath('power180-1280-downwind.png') });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Power-off 180');
  await expect(page.locator('#txtResultRunway')).toHaveText('KADS 16');
  await expect(page.locator('#resultsFactors li').first()).toContainText('The spot');
  await expect(page.locator('#resultsFactors li').first()).toContainText(/[\d,]+ ft (past|short)/);
  // Kid's guide lands in the ACS window (its own turn, power180.js KID_TURN_FT): ~135 ft past, an S or A.
  const pastFt = (await snap(page)).lastLanding.pastThresholdM * 3.28084 - 1000.66;
  console.log(`[power180 e2e] Kid hands off: ${pastFt.toFixed(0)} ft past the spot`);
  expect(pastFt).toBeGreaterThanOrEqual(0);
  expect(pastFt).toBeLessThanOrEqual(200);
  expect(['S', 'A']).toContain((await page.locator('#txtGrade').textContent()).trim());
  expect(await lowContrastLabels(page, '#resultsCard')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('power180-1280.png') });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
  expect(Object.keys(stored.missions['pad_180_kads_16@kid']).sort()).toEqual(['at', 'grade', 'score']);
  await page.locator('#btnFlyAgain').click();
  expect((await snap(page)).engineFailed).toBe(true);
  expect(errors).toEqual([]);
});
