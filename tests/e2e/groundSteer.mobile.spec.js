import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Touch has no pedals (0110): taxiing (below 40 kt), the stick's sideways push steers the nose
// wheel, so a phone player on Pilot can steer on the runway. On the 35C takeoff roll, full power
// from the throttle, then the stick held right early in the roll: the nose turns right. Early means
// a couple of knots: the 737 gains ~6 kt/s, a CDP touch reaches the sim up to a second late, and
// the tiller hands back to the ailerons from 20 kt, so at > 8 kt the stick landed at ~22 kt and the
// turn (4-9°) hung on that timing (main red on ff2d5d5).
const turnRight = (from, to) => ((to - from + 540) % 360) - 180;

for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  test(`phone ${name}, Pilot, touch: on the takeoff roll the stick held right steers the nose wheel right`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    const errors = collectErrors(page);
    await stubTiles(page);
    await page.goto(`${BASE}?mission=kdfw_takeoff`);
    await page.locator('#onboardingModal').waitFor({ state: 'visible' });
    await page.locator('#btnStartFlight').click();
    await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
    const snap = () => page.evaluate(() => window.openaeroDebug());
    expect(await snap()).toMatchObject({ assist: 'pilot', onGround: true });
    const cdp = await page.context().newCDPSession(page);
    const thr = await page.locator('#touchThrottle').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: thr.x + thr.width / 2, y: thr.y + 4, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await snap()).gsKts, { timeout: 45_000, intervals: [100] }).toBeGreaterThan(2);
    const s0 = await snap();
    const stick = await page.locator('#touchStick').boundingBox();
    const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x + stick.width * 0.9, y, id: 2 }] });
    await expect.poll(async () => turnRight(s0.headingDeg, (await snap()).headingDeg), { timeout: 15_000 }).toBeGreaterThan(5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const s = await snap();
    console.log(`[0110 ${name}] ${s0.headingDeg.toFixed(1)}° → ${s.headingDeg.toFixed(1)}° at ${s.gsKts} kt GS, still on the wheels: ${s.onGround}`);
    expect(s.onGround).toBe(true);
    expect(errors).toEqual([]);
  });
}
