import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Slow flight (ticket 0164): the deep link opens the mission's briefing in the picker; nothing is timed on the
// start screen; on Pilot, throttle back and the coach talks the slow-down. The hold and its grade are flown
// headless (tests/flight/slowFlight.test.js); a Kid hold through the results card is the phone spec.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=c172_slow_flight: the briefing, the drill waits for Start, then throttle back and the coach says slow down level', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
  await page.goto(`${BASE}?mission=c172_slow_flight`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const card = page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="c172_slow_flight"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/stall warning/);
  await expect.poll(async () => (await snap(page)).slowFlight?.phase, { timeout: 10_000 }).toBe('wait');
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'c172_slow_flight', aircraft: 'c172', flapsIndex: 0, onGround: false, missionRunway: null });
  expect(spawn.aglFt).toBeGreaterThan(4300);
  expect(spawn.aglFt).toBeLessThan(4700);
  expect(Math.abs(spawn.iasKts - 95)).toBeLessThan(5);
  expect(spawn.slowFlight.targetKts).toBeGreaterThan(60);
  expect(spawn.slowFlight.targetKts).toBeLessThan(66);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).slowFlight.phase, { timeout: 10_000 }).toBe('slowing');
  await expect(page.locator('#txtCoach')).toHaveText(/Throttle back/, { timeout: 10_000 });
  // Throttle back: the Cessna slows.
  const ias0 = (await snap(page)).iasKts;
  await page.keyboard.down('ControlLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ControlLeft');
  await expect.poll(async () => (await snap(page)).iasKts, { timeout: 20_000 }).toBeLessThan(ias0 - 5);
  await page.screenshot({ path: test.info().outputPath('slow-flight-1280.png') });
  expect(errors).toEqual([]);
});
