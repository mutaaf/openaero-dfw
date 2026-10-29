import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';
// A long flight: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Engine failure after takeoff (ticket 0104): the Cessna on all of Addison 16, flaps up. Full
// power, rotate at Vr, and Kid's guide climbs; the engine quits at 300 ft, the HUD says ENG OUT, the coach
// says glide, and Kid's guide lands ahead. The card grades the decision and the touchdown.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('engine failure at 300 ft: Kid takes off, the engine quits, it lands ahead and the card grades it', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?debug&mission=efato_kads_16_300`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Addison' }).locator('[data-scenario="efato_kads_16_300"]')).toContainText('land ahead');
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'efato_kads_16_300', aircraft: 'c172', flapsIndex: 0, onGround: true, engineFailed: false });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  // The takeoff is the player's at every level (power and rotation); then Kid's guide climbs.
  await page.click('#btnToga');
  await expect.poll(async () => (await snap(page)).takeoffCalls, { timeout: 60_000 }).toEqual(['rotate']);
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await snap(page)).onGround, { timeout: 20_000 }).toBe(false);
  await page.keyboard.up('ArrowUp');
  await expect(page.locator('#txtCoach')).toHaveText('Climb out at 74 knots, and be ready: the engine will quit', { timeout: 20_000 });
  await expect.poll(async () => (await snap(page)).engineFailed, { timeout: 120_000 }).toBe(true);
  const failed = await snap(page);
  expect(failed.aglFt).toBeGreaterThanOrEqual(290);
  expect(failed.aglFt).toBeLessThan(380);
  await expect(page.locator('#txtCoach')).toHaveText('Engine stopped! Let go: the plane glides ahead');
  await expect(page.locator('#txtThrottle')).toHaveText('ENG OUT');
  await page.screenshot({ path: test.info().outputPath('engineout-1280-coach.png') });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Engine failure after takeoff');
  await expect(page.locator('#resultsFactors li').first()).toContainText('landed ahead');
  expect(['S', 'A', 'B', 'C']).toContain((await page.locator('#txtGrade').textContent()).trim());
  expect(await lowContrastLabels(page, '#resultsCard')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('engineout-1280.png') });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
  expect(Object.keys(stored.missions['efato_kads_16_300@kid']).sort()).toEqual(['at', 'grade', 'score']);
  // Fly again: back on the runway with the engine running.
  await page.locator('#btnFlyAgain').click();
  expect(await snap(page)).toMatchObject({ onGround: true, engineFailed: false });
  expect(errors).toEqual([]);
});
