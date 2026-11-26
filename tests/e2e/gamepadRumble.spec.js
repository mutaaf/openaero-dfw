import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0228: a pad with a vibrationActuator rumbles (dual-rumble) on the ground roll and the
// touchdown, under the haptics setting, only in a flight the player is flying. Sim time at 4x wall
// time, a quarter of the pixels (fixtures.js; the autoland is long).
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// A standard pad whose actuator records every effect (a copy: the sink reuses one params object).
async function installRumblePad(page, { actuator = true } = {}) {
  await page.addInitScript((withActuator) => {
    const pad = {
      id: 'Rumble Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    window.__fx = [];
    window.__resets = 0;
    if (withActuator) {
      pad.vibrationActuator = {
        type: 'dual-rumble',
        playEffect: (type, p) => { window.__fx.push({ type, ...p, at: performance.now() }); return Promise.resolve('complete'); },
        reset: () => { window.__resets++; return Promise.resolve('complete'); },
      };
    }
    window.__pad = pad;
    navigator.getGamepads = () => [pad, null, null, null];
  }, actuator);
}

const fxCount = (page) => page.evaluate(() => window.__fx.length);
const press = (page, i, on) => page.evaluate(([i, on]) => { window.__pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; }, [i, on]);
// Brakes off (X is the brakes toggle) and full throttle (RT held).
async function roll(page) {
  if ((await page.evaluate(() => window.openaeroDebug())).brakesOn) {
    await press(page, 2, true);
    await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).brakesOn).toBe(false);
    await press(page, 2, false);
  }
  await press(page, 7, true);
  // The 737's roll is felt from ~33 kt (∝ gs², full at 120 kt; a slow taxi is all but still).
  await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).gsKts, { timeout: 20_000 }).toBeGreaterThan(40);
}
// No new effect over `ms` of wall time.
async function silentFor(page, ms) {
  const n = await fxCount(page);
  await page.waitForTimeout(ms);
  expect(await fxCount(page)).toBe(n);
}

test('the ground roll rumbles the pad; none behind the start screen, paused, or with Vibrate off (remembered)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await installRumblePad(page);
  await page.goto(`${BASE}?mission=kdfw_takeoff`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  // A pad that can rumble shows the Vibrate toggle on a desktop too (it was phone-only), on by default.
  await expect(page.locator('#btnHaptics')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#btnHaptics')).toContainText('Vibrate: ON');
  // The connect toast says it rumbles and how to stop it.
  await page.evaluate(() => { const e = new Event('gamepadconnected'); e.gamepad = window.__pad; window.dispatchEvent(e); });
  await expect(page.locator('#toast')).toContainText('It rumbles: Vibrate in the menu turns that off');
  // Behind the start screen the boot flight rolls, but the pad stays still.
  await roll(page);
  await page.waitForTimeout(500);
  expect(await fxCount(page)).toBe(0);
  await press(page, 7, false);

  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await roll(page);
  await expect.poll(() => fxCount(page), { timeout: 5_000 }).toBeGreaterThan(3);
  const fx = await page.evaluate(() => window.__fx.slice(-3));
  for (const f of fx) {
    expect(f.type).toBe('dual-rumble');
    expect(f.weakMagnitude).toBeGreaterThan(0);
    expect(f.weakMagnitude).toBeLessThanOrEqual(1);
    expect(f.duration).toBeGreaterThan(100); // each pulse outlasts the 100 ms to the next
  }
  // About ten a second, not one per frame.
  const n0 = await fxCount(page);
  await page.waitForTimeout(1000);
  expect(await fxCount(page) - n0).toBeLessThanOrEqual(13);

  // Paused: still, and the running pulse is stopped.
  await page.locator('#btnPause').click();
  await expect(page.locator('#btnPause')).toHaveText('RESUME');
  expect(await page.evaluate(() => window.__resets)).toBeGreaterThan(0);
  await silentFor(page, 600);
  await page.locator('#btnPause').click();
  await expect.poll(() => fxCount(page), { timeout: 5_000 }).toBeGreaterThan(n0 + 3);

  // Vibrate off: still, and remembered.
  await page.locator('#btnHaptics').click();
  await expect(page.locator('#btnHaptics')).toContainText('Vibrate: OFF');
  await silentFor(page, 600);
  // Back on, it answers with one pulse even standing still (the phone's tick, in kind).
  await press(page, 7, false);
  const nOff = await fxCount(page);
  await page.locator('#btnHaptics').click();
  await expect(page.locator('#btnHaptics')).toContainText('Vibrate: ON');
  await expect.poll(() => fxCount(page)).toBeGreaterThan(nOff);
  await page.locator('#btnHaptics').click();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('openaero_haptics_v1')))).toMatchObject({ v: 1, on: false });
  await press(page, 7, false);
  expect(errors).toEqual([]);
});

test('reduced motion keeps the pad still; a pad with no actuator shows no Vibrate toggle on a desktop', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubTiles(page);
  await installRumblePad(page);
  await page.goto(`${BASE}?mission=kdfw_takeoff`);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await roll(page);
  await page.waitForTimeout(800);
  expect(await fxCount(page)).toBe(0);

  const page2 = await page.context().newPage();
  await installRumblePad(page2, { actuator: false });
  await page2.goto(`${BASE}?mission=kdfw_takeoff`);
  await page2.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page2.evaluate(() => window.__pad.axes[0] = 0);
  await page2.waitForTimeout(1500);
  await expect(page2.locator('#btnHaptics')).toBeHidden();
});

test('the touchdown thumps the pad once, then nothing behind the results card', async ({ page }) => {
  test.setTimeout(150_000);
  await stubTiles(page);
  await installRumblePad(page);
  await page.goto(`${BASE}?mission=kdfw_35c_flare`);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.click('#btnApApr');
  // The thump: on the wheels, the heavy motor at 0.2 or more (the roll's is under 0.1), 120-250 ms.
  await expect.poll(() => page.evaluate(() => window.__fx.filter((f) => f.strongMagnitude >= 0.2).length), { timeout: 120_000 }).toBe(1);
  const thump = await page.evaluate(() => window.__fx.find((f) => f.strongMagnitude >= 0.2));
  expect(thump.duration).toBeGreaterThanOrEqual(120);
  expect(thump.duration).toBeLessThanOrEqual(250);
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 30_000 });
  await silentFor(page, 800);
  expect(await page.evaluate(() => window.__fx.filter((f) => f.strongMagnitude >= 0.2).length)).toBe(1);
});
