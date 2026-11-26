import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// S-turns across a road (ticket 0224): the deep link opens the lesson's briefing; behind the start screen the Cessna is
// held at its spawn south of the road, heading north at the first pole; it starts as it crosses the road, the coach
// says roll left, steep, and Learner rolls left on the stick. The four half-circles are flown headless
// (tests/flight/sTurns.test.js): here the lesson is ended early (openaeroDebugSTurns) and the card's plot checked at 1280x720.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=s_turns_road: held at the spawn, the coach calls the first turn over the road, Learner rolls it and the card plots the S', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?mission=s_turns_road`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const card = page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="s_turns_road"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/four half-circles 1,500 ft out from the road/);
  await expect.poll(async () => (await snap(page)).sTurns?.phase, { timeout: 10_000 }).toBe('entry');
  const a = await snap(page);
  expect(a).toMatchObject({ mission: 's_turns_road', aircraft: 'c172', onGround: false });
  expect(a.sTurns).toMatchObject({ live: false, windKts: 12, windDirDeg: 180 });
  expect(a.rectCourse).toBeUndefined();
  expect(a.aglFt).toBeGreaterThan(900);
  expect(a.aglFt).toBeLessThan(1100);
  expect(Math.abs(a.iasKts - 90)).toBeLessThan(5);
  await expect(page.locator('#wxBadge')).toHaveText('SCENARIO WX');
  await page.waitForTimeout(2000);
  expect(Math.abs((await snap(page)).sTurns.depth - a.sTurns.depth)).toBeLessThan(5); // held behind the start screen
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText(/Fly on, wings level: straight across the road/, { timeout: 10_000 });
  // ~25 s to the road at 2x: over it, the wind behind, a steep left turn.
  await expect.poll(async () => (await snap(page)).sTurns.phase, { timeout: 40_000 }).toBe('course');
  await expect(page.locator('#txtCoach')).toHaveText(/Over the road: roll left now, steep/, { timeout: 10_000 });
  await page.keyboard.down('KeyA');
  await expect.poll(async () => (await snap(page)).bankRightDeg, { timeout: 20_000 }).toBeLessThan(-25);
  const s = await snap(page);
  expect(s.bankRightDeg).toBeGreaterThan(-50); // full stick is the handbook's 45° at most
  expect(s.activeRunway).toBeNull(); // no PAPI or runway wind over the fields
  await page.screenshot({ path: test.info().outputPath('s-turns-1280.png') });
  await page.keyboard.up('KeyA');
  await page.evaluate(() => window.openaeroDebugSTurns());
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText(/S-turns across a road/);
  await expect(page.locator('#resultsFactors')).toContainText(/Radius held/);
  await expect(page.locator('#resultsFactors')).toContainText(/Wings level over the road/);
  await expect(page.locator('#resultsFactors')).toContainText(/Altitude held \(test: ±100 ft\)/);
  const plot = page.locator('#trackPlot');
  await expect(plot).toBeVisible();
  await expect(plot).toHaveAttribute('aria-label', /4 half-circles of 1,500 ft/);
  await expect(plot).toContainText(/dashed: the S asked/);
  expect(await plot.locator('svg circle').count()).toBe(5); // the road's poles
  const box = await plot.boundingBox();
  expect(box.height).toBeGreaterThan(100);
  await page.screenshot({ path: test.info().outputPath('s-turns-card-1280.png') });
  expect(errors).toEqual([]);
});
