import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0182 on a phone (390x844, touch), at Kid level: the coach's touch words, full power from the touch throttle,
// the stick held up from the start of the roll and let go once flying (Kid climbs away by itself); the card fits.
test('phone, Kid: the soft-field lesson by touch, stick up through the roll, the card fits the screen', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=kads_16_soft_field&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  await expect.poll(async () => (await snap()).softField?.end, { timeout: 10_000 }).toBe('KADS_16');
  await expect(page.locator('#txtCoach')).toHaveText('Push the throttle to the top, then hold the stick up', { timeout: 10_000 });
  const coach = await page.locator('#coach').boundingBox();
  expect(coach.x + coach.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('soft-field-390.png') });
  const cdp = await page.context().newCDPSession(page);
  const thr = await page.locator('#touchThrottle').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: thr.x + thr.width / 2, y: thr.y + 4, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const stick = await page.locator('#touchStick').boundingBox();
  const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - stick.height * 0.3, id: 2 }] });
  await expect(page.locator('#txtCoach')).toHaveText(/Keep the stick up: the nose wheel stays light|Not so high/, { timeout: 30_000 });
  await expect.poll(async () => (await snap()).softField?.liftKts ?? null, { timeout: 90_000 }).not.toBeNull();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Soft-field takeoff');
  await expect(page.locator('#resultsFactors')).toContainText('the plane climbed for you');
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: test.info().outputPath('soft-field-card-390.png') });
  expect(errors).toEqual([]);
});
