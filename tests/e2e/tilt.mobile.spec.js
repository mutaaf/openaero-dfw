import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0231: opt-in phone tilt steering. Chromium fires no real deviceorientation, so the spec
// runs a stand-in sensor (a synthetic DeviceOrientationEvent every 30 ms once orient() sets a hold,
// as a phone streams them) and stands in for iOS's permission prompt with a
// recorded DeviceOrientationEvent.requestPermission (iOS 13+ shape: a promise of 'granted' or
// 'denied', callable only from a tap). Runs in the `phone` project (Pixel 7 at 390x844, touch, Pilot).
const fakeIos = (answer) => {
  window.__asks = 0;
  DeviceOrientationEvent.requestPermission = () => { window.__asks++; return Promise.resolve(window.__answer ?? answer); };
};
const sensor = () => {
  window.__o = null; window.__n = 0;
  setInterval(() => {
    if (!window.__o) return;
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: window.__o[0], gamma: window.__o[1] }));
    window.__n++;
  }, 30);
};
test.beforeEach(({ page }) => page.addInitScript(sensor));
// Hold the phone at (beta, gamma) and wait for two readings of it.
async function orient(page, beta, gamma) {
  const n = await page.evaluate((o) => { window.__o = o; return window.__n; }, [beta, gamma]);
  await page.waitForFunction((k) => window.__n >= k + 2, n);
}
const snap = (page) => page.evaluate(() => { const d = window.openaeroDebug(); return { tilt: d.tilt, src: d.inputSource, stick: d.stick, t: d.simTime }; });
const asks = (page) => page.evaluate(() => window.__asks);

async function openOptions(page) {
  await page.locator('#tiltPicker').evaluate((e) => { e.closest('details').open = true; });
  await page.locator('#btnTilt').scrollIntoViewIfNeeded();
}
async function fly(page) {
  const start = page.locator('#btnStartFlight');
  await start.scrollIntoViewIfNeeded();
  await start.tap();
  await expect(page.locator('#onboardingModal')).toBeHidden();
}

test('off by default: no ask, no tilt, the stick flies as before (0231)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(fakeIos, 'granted');
  await stubTiles(page);
  await page.goto(BASE);
  await openOptions(page);
  const btn = page.locator('#btnTilt');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#btnTiltCentre')).toBeHidden();
  const box = await btn.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await fly(page);
  await orient(page, 40, 30);
  await page.waitForTimeout(300);
  const s = await snap(page);
  expect(s.tilt).toBe(null);
  expect(s.src).not.toBe('tilt');
  expect(await asks(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('switched on: it asks on the tap, tilt flies, the stick overrides, pause zeroes it, a reload keeps it (0231)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(fakeIos, 'granted');
  await stubTiles(page);
  await page.goto(BASE);
  await openOptions(page);
  const btn = page.locator('#btnTilt');
  await btn.tap();
  await orient(page, 40, 0); // the sensor's readings
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(btn).toHaveText('Tilt: ON');
  await expect(page.locator('#btnTiltCentre')).toBeVisible();
  expect(await asks(page)).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('openaero_prefs_v1')))).toMatchObject({ v: 1, tilt: true });
  // Behind the start screen tilt moves nothing.
  await orient(page, 40, 40);
  expect((await snap(page)).tilt).toMatchObject({ x: 0, y: 0, active: false, on: true });

  await orient(page, 40, 0); // the player holds the phone as they fly it and taps Fly
  await fly(page); // Start flight re-centred: this hold is level
  await orient(page, 40, 0);
  expect((await snap(page)).tilt).toMatchObject({ x: 0, y: 0, active: true });
  await orient(page, 40, 40); // right edge down: full right roll
  expect((await snap(page)).tilt).toMatchObject({ x: 1, active: true });
  await expect.poll(async () => (await snap(page)).src).toBe('tilt');
  await orient(page, 40 + 14, 0); // the top 14° toward you: half nose up (y < 0)
  const half = (await snap(page)).tilt;
  expect(half.x).toBe(0);
  expect(half.y).toBeCloseTo(-0.5, 2);

  // A thumb on the touch stick overrides tilt while held.
  const stick = await page.locator('#touchStick').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - stick.width * 0.3, y: cy, id: 1 }] });
  await expect.poll(async () => (await snap(page)).src).toBe('stick');
  expect((await snap(page)).stick.x).toBeLessThan(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await orient(page, 40, 40);
  await expect.poll(async () => (await snap(page)).src).toBe('tilt');

  // Paused: zero input.
  await page.locator('#btnMenu').tap();
  await page.locator('#btnPause').tap();
  await orient(page, 40, 40);
  expect((await snap(page)).tilt).toMatchObject({ x: 0, y: 0, active: false });
  await page.locator('#btnPause').tap(); // Resume re-centres on the hold it finds
  await page.locator('#btnMenu').tap();
  await orient(page, 40, 40);
  await orient(page, 40, 40);
  expect((await snap(page)).tilt).toMatchObject({ x: 0, y: 0, active: true });

  // Remembered: on after a reload, and Start flight's tap asks again (iOS forgets per page).
  await page.reload();
  await openOptions(page);
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  expect(await asks(page)).toBe(0);
  await fly(page);
  await orient(page, 40, 0);
  await expect.poll(() => asks(page)).toBe(1);
  await orient(page, 40, -40);
  expect((await snap(page)).tilt).toMatchObject({ x: -1, active: true });
  expect(errors).toEqual([]);
});

test('Re-centre on the start screen is kept through Fly (0231 first-timer panel)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(fakeIos, 'granted');
  await stubTiles(page);
  await page.goto(BASE);
  await openOptions(page);
  await page.locator('#btnTilt').tap();
  await orient(page, 40, 0);
  await expect(page.locator('#btnTilt')).toHaveAttribute('aria-pressed', 'true');
  await orient(page, 60, 20); // the way this player flies it
  await page.locator('#btnTiltCentre').tap();
  await orient(page, 60, 20);
  await orient(page, 40, 0); // slumped while reaching for Fly
  await fly(page);
  await orient(page, 60, 20);
  expect((await snap(page)).tilt).toMatchObject({ x: 0, y: 0, active: true });
  await orient(page, 40, 0);
  expect((await snap(page)).tilt.y).toBeGreaterThan(0.5); // well nose down from the chosen level (had Fly re-centred, 0)
  expect(errors).toEqual([]);
});

test('iOS says no: off with the reason, nothing listens, no console error (0231)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(fakeIos, 'denied');
  await stubTiles(page);
  await page.goto(BASE);
  await openOptions(page);
  const btn = page.locator('#btnTilt');
  await btn.tap();
  await expect(page.locator('#txtTiltWhy')).toContainText('Motion access was not allowed');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('openaero_prefs_v1')))).toMatchObject({ tilt: false });
  await fly(page);
  await orient(page, 40, 40);
  await page.waitForTimeout(300);
  expect((await snap(page)).src).not.toBe('tilt');
  expect(errors).toEqual([]);
});

test('no sensor answers: off with the reason (0231)', async ({ page }) => {
  const errors = collectErrors(page);
  // No permission call at all (Android before it had one): the first-reading wait decides.
  await page.addInitScript(() => { DeviceOrientationEvent.requestPermission = undefined; });
  await stubTiles(page);
  await page.goto(BASE);
  await openOptions(page);
  await page.locator('#btnTilt').tap();
  await expect(page.locator('#txtTiltWhy')).toContainText('No tilt reading came from this device', { timeout: 6000 });
  await expect(page.locator('#btnTilt')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test.describe('a mouse and keyboard screen', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 720 } });
  test('has no tilt toggle (0231)', async ({ page }) => {
    await stubTiles(page);
    await page.goto(BASE);
    await expect(page.locator('#tiltPicker')).toBeHidden();
    await expect(page.locator('#tiltPicker')).toHaveClass(/hidden/);
  });
});
