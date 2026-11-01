import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, recordVibrate } from './helpers.js';

// Ticket 0033 on a phone (390x844, touch): haptics. navigator.vibrate is stubbed to record every
// pattern (helpers.js recordVibrate). Kept short (CI's 30 min e2e limit): the touchdown
// buzz rides on assists.spec's Kid landing, and "no Vibration API" on mobile.spec's boot test.
// Sim time at 2x wall time, a quarter of the pixels (fixtures.js); nothing here is sub-second.
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// A dive at 300 ft: past 1,400 fpm under 450 ft is the GPWS pull-up (aero.js isGpwsWarning).
// Held until the warning shows (and a moment more), then thrown back up and held until it clears,
// so the airplane is not flown into the ground. Resolves whether the PULL UP banner was seen.
const dive = (page) => page.evaluate(() => new Promise((done) => {
  const banner = document.getElementById('masterAlertBanner');
  const pullUp = () => !banner.classList.contains('hidden') && /PULL UP/.test(banner.textContent);
  let seenAt = null;
  const t0 = performance.now();
  const step = () => {
    const now = performance.now();
    if (seenAt === null && pullUp()) seenAt = now;
    if ((seenAt === null && now - t0 < 8000) || (seenAt !== null && now - seenAt < 600)) {
      window.openaeroDebugHop(-12);
    } else if (seenAt !== null && pullUp() && now - seenAt < 8000) {
      window.openaeroDebugHop(6);
    } else {
      done(seenAt !== null);
      return;
    }
    requestAnimationFrame(step);
  };
  step();
}));

test('phone: nothing behind the start screen; the pull-up pulses once; Vibrate is a 44 px toggle, and off is silent and remembered', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.addInitScript(recordVibrate);
  await stubTiles(page);
  await page.goto(`${BASE}?debug&mission=kdfw_35c_flare`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  // Behind the start screen the boot flight runs, but nothing buzzes there.
  expect(await dive(page)).toBe(true);
  expect(await page.evaluate(() => window.__vibes)).toEqual([]);
  await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 1)); // a fresh final, level again
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  // One pattern for the warning, however many frames it lasted.
  expect(await dive(page)).toBe(true);
  expect(await page.evaluate(() => window.__vibes)).toEqual([[120, 80, 120]]);
  // The toggle lives in ☰ Menu with the other HUD buttons, on by default.
  await page.locator('#btnMenu').tap();
  const btn = page.locator('#btnHaptics');
  await expect(btn).toContainText('Vibrate: ON');
  const box = await btn.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  await btn.tap();
  await expect(btn).toContainText('Vibrate: OFF');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_haptics_v1')))).toMatchObject({ v: 1, on: false });
  await page.locator('#btnMenu').tap();
  // Off: the next warning stays silent.
  await page.evaluate(() => { window.__vibes.length = 0; window.openaeroDebugFinal('KDFW', '35C', 1); });
  expect(await dive(page)).toBe(true);
  expect(await page.evaluate(() => window.__vibes)).toEqual([]);
  expect(errors).toEqual([]);
});
