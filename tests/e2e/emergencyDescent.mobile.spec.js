import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Ticket 0209 on a phone (390x844, touch). Kid, hands off: the plane goes to idle and rolls into the spiral, and the
// coach card stays on screen, clear of the touch deck. Pilot, the stick pushed full forward by touch: a straight
// dive goes through the C172's 163 KIAS VNE and the results card says so, on screen, without a page scroll.
async function open(page, level) {
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript((l) => localStorage.setItem('openaero_assist_v1', `{"v":1,"level":"${l}","at":0}`), level);
  await page.goto(`${BASE}?mission=c172_emergency_descent`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  return errors;
}
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('phone, Kid, hands off: idle and the spiral down; the coach says the plane flies it', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page, 'kid');
  expect((await snap(page)).assist).toBe('kid');
  await expect(page.locator('#txtCoach')).toHaveText(/Smoke! Let go: the plane goes down to \d,\d00 ft/, { timeout: 10_000 });
  await expect.poll(async () => (await snap(page)).bankRightDeg, { timeout: 30_000 }).toBeGreaterThan(30);
  const s = await snap(page);
  expect(s.throttle).toBeLessThan(0.05);
  expect(s.emergencyDescent.phase).toBe('descending');
  await expect(page.locator('#txtCoach')).toHaveText(/spirals down to \d,\d00 ft: watch SEA LVL/, { timeout: 15_000 });
  // The coach card is on screen and clear of the touch deck (its slot: hudLayout.js coachOverHud / main.js placeCoach).
  const coach = await page.locator('#coach').boundingBox(), stick = await page.locator('#touchStick').boundingBox();
  expect(coach.y).toBeGreaterThanOrEqual(0);
  expect(coach.y + coach.height).toBeLessThan(stick.y);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('emergency-descent-kid-390.png') });
  // Held sideways (844x390) Kid's line stays two lines: the coach card clears the altitude tape (device panel).
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await page.locator('#coach').boundingBox()).height, { timeout: 5_000 }).toBeLessThan(80);
  expect(errors).toEqual([]);
});

test('phone, Pilot: the stick full forward by touch dives through VNE, and the card says why and fits', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page, 'pilot');
  await expect.poll(async () => (await snap(page)).emergencyDescent?.phase, { timeout: 10_000 }).toBe('descending');
  const cdp = await page.context().newCDPSession(page);
  const stick = await page.locator('#touchStick').boundingBox();
  const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + stick.height / 2, id: 1 }] }); // down = stick forward, nose down
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + stick.height / 2 + 1, id: 1 }] });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 60_000 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#resultsCard')).toContainText(/Emergency descent not finished/);
  await expect(page.locator('#resultsCard')).toContainText(/never-exceed/);
  const card = await page.locator('#resultsCard').boundingBox();
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(card.y + card.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('emergency-descent-card-390.png') });
  expect(errors).toEqual([]);
});
