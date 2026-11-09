import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Steep turns (ticket 0161): the deep link opens the mission's briefing in the picker; on Learner
// full stick sideways is the 45° the task asks for, and the coach talks you round. The grade of a
// whole flight is flown headless (tests/flight/steepTurns.test.js): this spec stays short.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=steep_turns: the briefing, then Learner rolls to 45° on full stick and the coach follows the turn', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?mission=steep_turns`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const card = page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="steep_turns"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/45° bank/);
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'steep_turns', aircraft: 'c172', flapsIndex: 0, onGround: false, missionRunway: null });
  expect(spawn.aglFt).toBeGreaterThan(2800);
  expect(spawn.aglFt).toBeLessThan(3200);
  expect(Math.abs(spawn.iasKts - 95)).toBeLessThan(5);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).steepTurns?.phase, { timeout: 10_000 }).toBe('entry');
  await expect(page.locator('#txtCoach')).toHaveText(/Roll into a 45° bank/, { timeout: 10_000 });
  // Full stick right: Learner's bank hold goes to 45° in this mission (its usual cap is 38°).
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await snap(page)).steepTurns.phase, { timeout: 20_000 }).toBe('turn1');
  await expect.poll(async () => (await snap(page)).bankRightDeg, { timeout: 20_000 }).toBeGreaterThan(42);
  const s = await snap(page);
  expect(s.bankRightDeg).toBeLessThan(50);
  expect(s.steepTurns.dir).toBe(1);
  await expect(page.locator('#txtCoach')).toHaveText(/45°|height|ease|power|Hold it/i, { timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath('steep-turns-1280.png') });
  await page.keyboard.up('KeyD');
  expect(errors).toEqual([]);
});
