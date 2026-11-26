import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Ticket 0226 on a phone (390x844, touch). Pilot: the density altitude and the roll in the coach's touch words, which fit;
// the throttle to the top, then BRAKES. Kid: the throttle to the top is all, the stick up through the lift-off, and the
// Kid card (the roll and the 50 ft beside a cool day's) fits the screen.
const snap = (page) => page.evaluate(() => window.openaeroDebug());
async function open(page, level) {
  await stubTiles(page);
  await page.addInitScript((l) => localStorage.setItem('openaero_assist_v1', `{"v":1,"level":"${l}","at":0}`), level);
  await page.goto(`${BASE}?mission=kads_16_hot_takeoff&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#txtDaValue')).toHaveText(/3,500 ft \(scenario, 38 °C\)/, { timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath(`hot-takeoff-menu-390-${level}.png`) });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).shortTakeoff?.hot, { timeout: 10_000 }).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const thr = await page.locator('#touchThrottle').boundingBox();
  const throttleUp = async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: thr.x + thr.width / 2, y: thr.y + 4, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  return { cdp, throttleUp };
}

test('phone, Pilot: the hot day\'s touch words fit, throttle to the top, BRAKES lets them go', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  const { throttleUp } = await open(page, 'pilot');
  await expect(page.locator('#txtCoach')).toHaveText('Scenario 38 °C, density altitude 3,500 ft: the handbook roll is 1,202 ft, not 1,017. Throttle to the top', { timeout: 10_000 });
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.x).toBeGreaterThanOrEqual(0);
  expect(coach.x + coach.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('hot-takeoff-390.png') });
  await throttleUp();
  await expect(page.locator('#txtCoach')).toHaveText('Full power. The same 45 knots, a longer roll (1,202 ft). Tap BRAKES to let them go', { timeout: 10_000 });
  await page.locator('#touchBrakes').tap();
  await expect.poll(async () => (await snap(page)).shortTakeoff.phase, { timeout: 5_000 }).toBe('roll');
  expect(errors).toEqual([]);
});

test('phone, Kid: the throttle to the top, the stick up to the lift-off, the card fits with a cool day beside it', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  const { cdp, throttleUp } = await open(page, 'kid');
  await expect(page.locator('#txtCoach')).toHaveText('Hot day: thin air, a longer run. Push the throttle to the top', { timeout: 10_000 });
  await throttleUp();
  await expect.poll(async () => (await snap(page)).shortTakeoff.phase, { timeout: 10_000 }).toBe('roll');
  await expect.poll(async () => (await snap(page)).iasKts, { timeout: 60_000 }).toBeGreaterThan(44);
  const stick = await page.locator('#touchStick').boundingBox();
  const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - stick.height * 0.25, id: 2 }] });
  await expect.poll(async () => (await snap(page)).shortTakeoff?.phase, { timeout: 60_000 }).toBe('air');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Hot-day takeoff');
  await expect(page.locator('#resultsFactors')).toContainText(/15 °C: 1,017/);
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: test.info().outputPath('hot-takeoff-card-390.png') });
  expect(errors).toEqual([]);
});
