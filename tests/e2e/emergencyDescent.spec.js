import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Emergency descent (ticket 0209) at 1280x720 on the keyboard: the deep link opens the briefing in the picker's Drills;
// after Start the coach calls the smoke and names the level-off's height; on Learner, the power key to idle and full
// stick right put the Cessna in S4's 30-45° of bank. The grade of a whole descent is flown headless
// (tests/flight/emergencyDescent.test.js): this spec stays short.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=c172_emergency_descent: the briefing, the smoke call with its height, then Learner idles and banks 30-45°', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?mission=c172_emergency_descent`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const card = page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="c172_emergency_descent"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/Smoke in the cockpit/);
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'c172_emergency_descent', aircraft: 'c172', flapsIndex: 0, onGround: false, missionRunway: null });
  expect(spawn.aglFt).toBeGreaterThan(4800);
  expect(spawn.aglFt).toBeLessThan(5200);
  expect(Math.abs(spawn.iasKts - 100)).toBeLessThan(5);
  expect(spawn.emergencyDescent.phase).toBe('wait');
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).emergencyDescent?.phase, { timeout: 10_000 }).toBe('descending');
  const st = (await snap(page)).emergencyDescent;
  expect(st.targetFt % 100).toBe(0);
  expect(Math.abs(st.alt0 - 3000 - st.targetFt)).toBeLessThanOrEqual(50);
  await expect(page.locator('#txtCoach')).toHaveText(new RegExp(`Smoke in the cockpit! Emergency descent to ${st.targetFt.toLocaleString('en-US')} ft`), { timeout: 10_000 });
  // Idle (Ctrl) and full stick right: Learner's bank hold goes to 40° in this mission (its usual cap is 38°).
  await page.keyboard.down('ControlLeft');
  await expect.poll(async () => (await snap(page)).throttle, { timeout: 20_000 }).toBeLessThan(0.05);
  await page.keyboard.up('ControlLeft');
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await snap(page)).bankRightDeg, { timeout: 20_000 }).toBeGreaterThan(32);
  const s = await snap(page);
  expect(s.bankRightDeg).toBeLessThan(45);
  await expect(page.locator('#txtCoach')).toHaveText(/Nose down|Hold it|105 kt|Too fast/, { timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath('emergency-descent-1280.png') });
  await page.keyboard.up('KeyD');
  expect(errors).toEqual([]);
});
