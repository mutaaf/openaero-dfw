import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Ticket 0225 on a phone (390x844, touch). Pilot: the coach's touch words on the brakes, the touch throttle to the top,
// then the BRAKES button lets them go. Kid: the throttle to the top is all (its brakes come off by themselves), the stick
// held up through the lift-off, and the Kid card (the roll and the 50 ft) fits the screen.
const snap = (page) => page.evaluate(() => window.openaeroDebug());
async function open(page, level) {
  await stubTiles(page);
  await page.addInitScript((l) => localStorage.setItem('openaero_assist_v1', `{"v":1,"level":"${l}","at":0}`), level);
  await page.goto(`${BASE}?mission=kads_16_short_field_takeoff&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).shortTakeoff?.end, { timeout: 10_000 }).toBe('KADS_16');
  const cdp = await page.context().newCDPSession(page);
  const thr = await page.locator('#touchThrottle').boundingBox();
  const throttleUp = async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: thr.x + thr.width / 2, y: thr.y + 4, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  return { cdp, throttleUp };
}

test('phone, Pilot: the brakes\' touch words, throttle to the top, BRAKES lets them go', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  const { throttleUp } = await open(page, 'pilot');
  await expect(page.locator('#txtCoach')).toHaveText('Short field: the brakes are on. Slide the throttle to the top first', { timeout: 10_000 });
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.x + coach.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('short-takeoff-390.png') });
  await throttleUp();
  await expect(page.locator('#txtCoach')).toHaveText('Full power: tap BRAKES to let them go', { timeout: 10_000 });
  expect((await snap(page)).brakesOn).toBe(true);
  await page.locator('#touchBrakes').tap();
  await expect.poll(async () => (await snap(page)).shortTakeoff.phase, { timeout: 5_000 }).toBe('roll');
  await expect(page.locator('#txtCoach')).toHaveText('Nose down, let it roll. At 45 knots, stick up gently', { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('phone, Kid: the throttle to the top lets the brakes go, the stick up to the lift-off, the card fits', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  const { cdp, throttleUp } = await open(page, 'kid');
  await expect(page.locator('#txtCoach')).toHaveText('Push the throttle to the top. The brakes hold you', { timeout: 10_000 });
  await throttleUp();
  await expect.poll(async () => (await snap(page)).shortTakeoff.phase, { timeout: 10_000 }).toBe('roll');
  expect((await snap(page)).brakesOn).toBe(false);
  await expect.poll(async () => (await snap(page)).iasKts, { timeout: 60_000 }).toBeGreaterThan(44);
  const stick = await page.locator('#touchStick').boundingBox();
  const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - stick.height * 0.25, id: 2 }] });
  await expect.poll(async () => (await snap(page)).shortTakeoff?.phase, { timeout: 60_000 }).toBe('air');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Short-field takeoff');
  await expect(page.locator('#resultsFactors')).toContainText('To 50 ft');
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: test.info().outputPath('short-takeoff-card-390.png') });
  expect(errors).toEqual([]);
});
