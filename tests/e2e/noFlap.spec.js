import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// No-flap landing lesson (ticket 0210): the deep link opens the lesson in the picker's Drills, the Cessna spawns on
// Addison 16's 4 NM final flaps 0 at 70 KIAS, the coach briefs it, and the flap lever refuses to move (F and the FLAPS
// button). Then Kid flies a short final of it (?debug openaeroDebugFinal with the lesson's flag): the card waits for the
// stop and shows the roll against a flaps-30 roll. The grade itself is flown headless (tests/flight/noFlap.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=kads_16_no_flap: in Drills, flaps 0 at 70, the briefing, and the lever stays at 0', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
  await page.goto(`${BASE}?mission=kads_16_no_flap&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="kads_16_no_flap"]')).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/flaps stuck up/);
  await expect.poll(async () => (await snap(page)).noFlap?.end, { timeout: 10_000 }).toBe('KADS_16');
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'kads_16_no_flap', aircraft: 'c172', flapsIndex: 0, onGround: false, missionRunway: 'KADS_16' });
  expect(Math.abs(spawn.iasKts - 70)).toBeLessThan(5);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText(/No flaps: the lever is stuck at 0°\. Fly 70 knots/, { timeout: 10_000 });
  for (let i = 0; i < 3; i++) await page.keyboard.press('KeyF');
  await page.locator('#btnFlaps').dispatchEvent('click'); // the HUD's FLAPS button too
  await expect(page.locator('#toast')).toContainText('Flaps stuck at 0° for this lesson');
  const after = await snap(page);
  expect(after.flapsIndex).toBe(0);
  await page.screenshot({ path: test.info().outputPath('no-flap-1280.png') });
  expect(errors).toEqual([]);
});

test('Kid on a short final of the lesson: flaps stay 0, the card comes at the stop with the roll vs flaps 30', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=kads_16_no_flap&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.openaeroDebugFinal('KADS', '16', 0.6, 0, { aircraft: 'c172', kias: 70, flaps: 0, noFlap: true }));
  await expect.poll(async () => (await snap(page)).noFlap?.end, { timeout: 10_000 }).toBe('KADS_16');
  await expect.poll(async () => (await snap(page)).onGround, { timeout: 90_000 }).toBe(true);
  expect((await snap(page)).flapsIndex).toBe(0); // Kid's automatic flaps are held at the stuck notch
  await page.keyboard.press('KeyB');
  const card = page.locator('#resultsCard');
  await expect(card).toBeVisible({ timeout: 60_000 });
  const done = await snap(page);
  expect(done.noFlap.stopped).toBe(true);
  expect(done.noFlap.off).toBe(false);
  await expect(page.locator('#resultsFactors')).toContainText(/Landing roll\s*[\d,]+ ft \(flaps 30 est\. ≈ [\d,]+/);
  await expect(page.locator('#resultsFactors')).toContainText(/Touchdown zone\s*[\d,]+ ft past threshold \(full marks to [\d,]+\)/);
  await page.screenshot({ path: test.info().outputPath('no-flap-card-1280.png') });
  expect(errors).toEqual([]);
});
