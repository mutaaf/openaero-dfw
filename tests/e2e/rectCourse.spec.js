import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// The rectangular course (ticket 0223): the deep link opens the lesson's briefing; behind the start screen the Cessna
// is held at its spawn on the downwind leg, the field off its left; the course starts abeam the field and the coach calls
// the first corner; Learner rolls left round it on the stick. Two whole laps are flown headless
// (tests/flight/rectCourse.test.js): here the lesson is fast-forwarded to its end (openaeroDebugRectCourse) and the
// card's track plot checked at 1280x720.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=rectangular_course: held at the spawn, the coach calls the corner, Learner turns it and the card plots the box', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?mission=rectangular_course`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const card = page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="rectangular_course"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/Fly two laps round it/);
  await expect.poll(async () => (await snap(page)).rectCourse?.phase, { timeout: 10_000 }).toBe('entry');
  const a = await snap(page);
  expect(a).toMatchObject({ mission: 'rectangular_course', aircraft: 'c172', onGround: false });
  expect(a.rectCourse).toMatchObject({ live: false, windKts: 12, windDirDeg: 180 });
  expect(a.aroundPoint).toBeUndefined();
  expect(a.aglFt).toBeGreaterThan(900);
  expect(a.aglFt).toBeLessThan(1100);
  expect(Math.abs(a.iasKts - 90)).toBeLessThan(5);
  await expect(page.locator('#wxBadge')).toHaveText('SCENARIO WX');
  await page.waitForTimeout(2000);
  expect(Math.abs((await snap(page)).rectCourse.d - a.rectCourse.d)).toBeLessThan(5); // held behind the start screen
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText(/Fly on: the field is on your left/, { timeout: 10_000 });
  await expect.poll(async () => (await snap(page)).rectCourse.phase, { timeout: 30_000 }).toBe('course');
  // Up the downwind leg (~25 s at 2x) to the north-east corner: the wind behind, a steep turn.
  await expect(page.locator('#txtCoach')).toHaveText(/Corner abeam: roll left, steep/, { timeout: 60_000 });
  await page.keyboard.down('KeyA');
  await expect.poll(async () => (await snap(page)).bankRightDeg, { timeout: 20_000 }).toBeLessThan(-25);
  const s = await snap(page);
  expect(s.bankRightDeg).toBeGreaterThan(-50); // full stick is the handbook's 45° at most
  expect(s.activeRunway).toBeNull(); // no PAPI or runway wind over the fields
  await page.screenshot({ path: test.info().outputPath('rect-course-1280.png') });
  await page.keyboard.up('KeyA');
  await page.evaluate(() => window.openaeroDebugRectCourse(719));
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText(/Rectangular course/);
  await expect(page.locator('#resultsFactors')).toContainText(/Distance held/);
  await expect(page.locator('#resultsFactors')).toContainText(/Altitude held \(test: ±100 ft\)/);
  const plot = page.locator('#trackPlot');
  await expect(plot).toBeVisible();
  await expect(plot).toHaveAttribute('aria-label', /2,640 ft off the field's edges/);
  await expect(plot).toContainText(/dashed: the path asked/);
  expect(await plot.locator('svg rect').count()).toBe(2); // the field and the path asked
  const box = await plot.boundingBox();
  expect(box.height).toBeGreaterThan(100);
  await page.screenshot({ path: test.info().outputPath('rect-course-card-1280.png') });
  expect(errors).toEqual([]);
});
