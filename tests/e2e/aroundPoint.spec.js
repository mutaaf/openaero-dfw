import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Turns around a point (ticket 0211): the deep link opens the lesson's briefing; behind the start screen the Cessna
// is held at its spawn, the pole half a mile ahead; the coach says when to roll; Learner rolls left round the pole
// on the stick. Two whole circles are flown headless (tests/flight/aroundPoint.test.js): here the lesson is
// fast-forwarded to its end (openaeroDebugAroundPoint) and the card's track plot checked at 1280x720.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('?mission=turns_around_point: held at the spawn, the coach calls the roll, Learner circles the pole and the card plots the track', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?mission=turns_around_point`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const card = page.locator('#missionList section', { hasText: 'Drills' }).locator('[data-scenario="turns_around_point"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/circle it twice/);
  await expect.poll(async () => (await snap(page)).aroundPoint?.phase, { timeout: 10_000 }).toBe('entry');
  const a = await snap(page);
  expect(a).toMatchObject({ mission: 'turns_around_point', aircraft: 'c172', onGround: false });
  expect(a.aroundPoint).toMatchObject({ live: false, windKts: 12, windDirDeg: 180 });
  expect(a.aglFt).toBeGreaterThan(900);
  expect(a.aglFt).toBeLessThan(1100);
  expect(Math.abs(a.iasKts - 90)).toBeLessThan(5);
  await expect(page.locator('#wxBadge')).toHaveText('SCENARIO WX');
  // Behind the start screen it stays put (the sim flies on there): no closer to the pole.
  await page.waitForTimeout(2000);
  expect(Math.abs((await snap(page)).aroundPoint.along - a.aroundPoint.along)).toBeLessThan(5);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText(/Wait until it is off your left wingtip/, { timeout: 10_000 });
  await expect(page.locator('#txtCoach')).toHaveText(/Pole abeam: roll left/, { timeout: 30_000 });
  await page.keyboard.down('KeyA');
  await expect.poll(async () => (await snap(page)).aroundPoint.phase, { timeout: 20_000 }).toBe('circle');
  await expect.poll(async () => (await snap(page)).bankRightDeg, { timeout: 20_000 }).toBeLessThan(-25);
  const s = await snap(page);
  expect(s.aroundPoint.side).toBe(-1);
  expect(s.bankRightDeg).toBeGreaterThan(-50); // full stick is the handbook's 45° at most
  await page.screenshot({ path: test.info().outputPath('around-point-1280.png') });
  await page.keyboard.up('KeyA');
  await page.evaluate(() => window.openaeroDebugAroundPoint(719));
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText(/Turns around a point/);
  await expect(page.locator('#resultsFactors')).toContainText(/Circle held round/);
  await expect(page.locator('#resultsFactors')).toContainText(/Altitude held \(test: ±100 ft\)/);
  const plot = page.locator('#trackPlot');
  await expect(plot).toBeVisible();
  await expect(plot).toHaveAttribute('aria-label', /1,500 ft asked for/);
  expect(await plot.locator('svg path').count()).toBeGreaterThanOrEqual(2); // the entry and the circling
  const box = await plot.boundingBox();
  expect(box.height).toBeGreaterThan(100);
  await page.screenshot({ path: test.info().outputPath('around-point-card-1280.png') });
  expect(errors).toEqual([]);
});
