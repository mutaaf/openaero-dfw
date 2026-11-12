import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Unusual attitudes (ticket 0174): the deep link opens the nose-low drill's briefing; once the player
// starts flying, the instructor hands the Cessna over in a 60° left bank, 25° nose down, and the coach
// says the handbook's first step. Hands off, it is not the pilot's recovery: the results card says so.
// The recoveries themselves are flown headless (tests/flight/upset.test.js): this spec stays short.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=upset_nose_low on Pilot: the briefing, the hand-over in a diving left turn, "throttle to idle", and a card for doing nothing', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
  await page.goto(`${BASE}?mission=upset_nose_low`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const card = page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="upset_nose_low"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#missionList [data-scenario="upset_nose_high"]')).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/diving turn/);
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'upset_nose_low', aircraft: 'c172', flapsIndex: 0, onGround: false });
  expect(spawn.upset.phase).toBe('brief'); // nothing happens behind the start screen
  expect(Math.abs(spawn.bankRightDeg)).toBeLessThan(5);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).upset?.phase, { timeout: 10_000 }).toBe('recover');
  const s = await snap(page);
  expect(s.bankRightDeg).toBeLessThan(-40);
  expect(s.pitchDeg).toBeLessThan(-12);
  expect(s.iasKts).toBeGreaterThan(120);
  await expect(page.locator('#txtCoach')).toHaveText(/Your airplane! Diving: throttle to idle/, { timeout: 5_000 });
  await page.screenshot({ path: test.info().outputPath('upset-low-1280.png') });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#resultsCard')).toContainText(/Not recovered/);
  await expect(page.locator('#resultsCard')).toContainText(/didn't touch the controls/);
  await expect(page.locator('#resultsCard')).not.toContainText(/pulled/);
  await page.screenshot({ path: test.info().outputPath('upset-low-card-1280.png') });
  expect(errors).toEqual([]);
});

// Panel (first-timer): on Learner the assists roll a bank past 45° back and hold the nose. Hands off, the card never
// blames the player for the assists' pull nor grades their recovery as the player's: either the assists levelled it
// (its note) or, as measured here, it is not level in 20 s.
test('?mission=upset_nose_low on Learner, hands off: the card never blames the player for the assists', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?mission=upset_nose_low`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).upset?.phase, { timeout: 10_000 }).toBe('recover');
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#resultsCard')).toContainText(/assists levelled it for you|Not level in 20 s/);
  await expect(page.locator('#resultsCard')).not.toContainText(/pulled|didn't touch/);
  expect(errors).toEqual([]);
});
