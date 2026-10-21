import { test, expect } from '@playwright/test';
import { stubTiles, enterCockpit } from './helpers.js';

// A fake standard-mapping gamepad whose state the test can change.
async function installFakePad(page) {
  await page.addInitScript(() => {
    const pad = {
      id: 'Test Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    window.__pad = pad;
    navigator.getGamepads = () => [pad, null, null, null];
    window.__connectPad = () => {
      const e = new Event('gamepadconnected');
      e.gamepad = pad;
      window.dispatchEvent(e);
    };
  });
}

test('a gamepad stick flies the aircraft and its buttons work the systems', async ({ page }) => {
  await stubTiles(page);
  await installFakePad(page);
  await enterCockpit(page);
  await page.evaluate(() => window.__connectPad());
  await expect(page.locator('#toast')).toContainText('Test Pad');

  await page.evaluate(() => { window.__pad.axes[0] = 1; });
  await expect.poll(() => page.locator('#meterAil').textContent(), { timeout: 5_000 }).not.toBe('0%');
  await page.evaluate(() => { window.__pad.axes[0] = 0; });

  // A = flaps (edge-triggered: one press = one notch). The lever is at 40 at once; the
  // flaps follow on the hydraulics ("33→40°", 0072).
  await page.evaluate(() => { window.__pad.buttons[0] = { pressed: true, value: 1 }; });
  await expect(page.locator('#txtFlaps')).toHaveText(/(^|→)40°$/);
  await page.evaluate(() => { window.__pad.buttons[0] = { pressed: false, value: 0 }; });
  await page.waitForTimeout(200);
  await expect(page.locator('#txtFlaps')).toHaveText(/(^|→)40°$/);

  // RT spools the engines, and the desktop slider follows (ticket 0017), even when the
  // player last used it (a range input keeps focus after a click).
  await page.locator('#rngThrottle').fill('44');
  await expect(page.locator('#rngThrottle')).toBeFocused();
  const before = parseInt(await page.locator('#txtThrottle').textContent(), 10);
  const sliderBefore = Number(await page.locator('#rngThrottle').inputValue());
  await page.evaluate(() => { window.__pad.buttons[7] = { pressed: true, value: 1 }; });
  await expect.poll(async () => parseInt(await page.locator('#txtThrottle').textContent(), 10), { timeout: 5_000 }).toBeGreaterThan(before + 5);
  await expect.poll(async () => Number(await page.locator('#rngThrottle').inputValue()), { timeout: 5_000 }).toBeGreaterThan(sliderBefore + 5);

  // An arrow key steps from where the throttle is now, never back to a stale slider value.
  await page.evaluate(() => { window.__pad.buttons[7] = { pressed: false, value: 0 }; });
  await page.waitForTimeout(300);
  const now = parseInt(await page.locator('#txtThrottle').textContent(), 10);
  await page.locator('#rngThrottle').press('ArrowDown');
  const after = parseInt(await page.locator('#txtThrottle').textContent(), 10);
  expect(Math.abs(after - (now - 1))).toBeLessThanOrEqual(1);
});
