import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0223 on a phone (390x844, touch), at Kid level: hands off, the guide flies up the downwind leg and rolls left
// round the first corner; fast-forwarded to the end (openaeroDebugRectCourse), the card's plot and FLY AGAIN fit the screen.
test('phone, Kid, hands off: the plane flies the course, the flaps stay up and the card plots the box on screen', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=rectangular_course`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  expect((await snap()).assist).toBe('kid');
  await expect(page.locator('#txtCoach')).toHaveText(/flies round the field/, { timeout: 10_000 });
  await expect.poll(async () => (await snap()).rectCourse?.phase, { timeout: 40_000 }).toBe('course');
  await expect(page.locator('#txtCoach')).toHaveText(/Watch the nose/, { timeout: 10_000 });
  // Round the first corner (~25 s at 2x up the leg): the guide banks left.
  await expect.poll(async () => (await snap()).bankRightDeg, { timeout: 60_000 }).toBeLessThan(-20);
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.y + coach.height).toBeLessThan(844 / 2);
  await page.screenshot({ path: test.info().outputPath('rect-course-390.png') });
  const s = await snap();
  expect(s.flapsIndex).toBe(0); // Kid's auto-config leaves the flaps up in the lesson
  expect(Math.abs(s.rectCourse.d - s.rectCourse.D)).toBeLessThan(120);
  await page.evaluate(() => window.openaeroDebugRectCourse(719));
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#txtStabilized')).toContainText(/flew the course for you/);
  const [plot, fly, cardBox] = await Promise.all([page.locator('#trackPlot').boundingBox(), page.locator('#btnFlyAgain').boundingBox(), page.locator('#resultsCard').boundingBox()]);
  expect(plot.width).toBeGreaterThan(200);
  expect(plot.height).toBeGreaterThan(100);
  expect(fly.y + fly.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);
  expect(cardBox.y).toBeGreaterThanOrEqual(0);
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('rect-course-card-390.png') });
  expect(errors).toEqual([]);
});
