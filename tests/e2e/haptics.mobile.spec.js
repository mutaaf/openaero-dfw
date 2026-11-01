import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0033 on a phone (390x844, touch): haptics. navigator.vibrate is stubbed to record
// every pattern; the real API is Android-only, so the game must also run clean without it.
const recordVibrate = () => {
  window.__vibes = [];
  Object.defineProperty(Navigator.prototype, 'vibrate', {
    configurable: true, value: (p) => { window.__vibes.push(Array.isArray(p) ? p : [p]); return true; },
  });
};

async function startFlare(page) {
  await stubTiles(page);
  await page.goto(`${BASE}?debug&mission=kdfw_35c_flare`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
}

// A dive at 300 ft: past 1,400 fpm under 450 ft is the GPWS pull-up (aero.js isGpwsWarning).
// Held until the warning shows (and a moment more), then thrown back up so the airplane is not
// flown into the ground. Resolves whether the PULL UP banner was seen.
const dive = (page) => page.evaluate(() => new Promise((done) => {
  const banner = document.getElementById('masterAlertBanner');
  let seenAt = null;
  const t0 = performance.now();
  const step = () => {
    const now = performance.now();
    if (seenAt === null && !banner.classList.contains('hidden') && /PULL UP/.test(banner.textContent)) seenAt = now;
    if ((seenAt === null && now - t0 < 4000) || (seenAt !== null && now - seenAt < 300)) {
      window.openaeroDebugHop(-12);
      requestAnimationFrame(step);
      return;
    }
    window.openaeroDebugHop(6);
    done(seenAt !== null);
  };
  step();
}));

test('phone: one buzz at touchdown, scaled by the sink; the toggle is a 44 px button in the menu', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.addInitScript(recordVibrate);
  await startFlare(page);
  // The toggle lives in ☰ Menu with the other HUD buttons, on by default.
  await page.locator('#btnMenu').tap();
  const btn = page.locator('#btnHaptics');
  await expect(btn).toBeVisible();
  await expect(btn).toContainText('Vibrate: ON');
  const box = await btn.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: test.info().outputPath('haptics-menu-390.png') });
  await page.locator('#btnMenu').tap();
  // The autoland flies a final onto 35C: one touchdown, one buzz, nothing before it.
  // A short final (0.4 NM) keeps the spec short (CI's e2e time is tight).
  await page.evaluate(() => { window.openaeroDebugFinal('KDFW', '35C', 0.4); document.getElementById('btnApApr').click(); });
  await page.waitForFunction(() => window.openaeroDebug().lastLanding, null, { timeout: 60_000 });
  await page.waitForTimeout(500);
  const { vibes, sink } = await page.evaluate(() => ({ vibes: window.__vibes, sink: window.openaeroDebug().lastLanding.vsFpm }));
  expect(vibes).toHaveLength(1);
  const down = Math.max(0, -sink);
  const expected = down < 240 ? [40] : down <= 600 ? [80] : [80, 40, 120];
  expect(vibes[0]).toEqual(expected);
  expect(errors).toEqual([]);
});

test('phone: the pull-up pulses once at its onset; off means no buzz, and it is remembered', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.addInitScript(recordVibrate);
  await startFlare(page);
  expect(await dive(page)).toBe(true);
  await page.waitForTimeout(500);
  // One pattern for the warning, however many frames it lasted (no touchdown yet).
  const pulses = await page.evaluate(() => window.__vibes.filter((p) => p.length === 3 && p[0] === 120));
  expect(pulses).toHaveLength(1);
  // Off: the next flight's warning stays silent, and the choice survives a reload.
  await page.locator('#btnMenu').tap();
  await page.locator('#btnHaptics').tap();
  await expect(page.locator('#btnHaptics')).toContainText('Vibrate: OFF');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_haptics_v1')))).toMatchObject({ v: 1, on: false });
  await startFlare(page);
  await page.evaluate(() => { window.__vibes.length = 0; });
  expect(await dive(page)).toBe(true);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__vibes)).toEqual([]);
  await page.locator('#btnMenu').tap();
  await expect(page.locator('#btnHaptics')).toContainText('Vibrate: OFF');
  expect(errors).toEqual([]);
});

test('phone without the Vibration API (iOS Safari): no toggle, no error through a warning', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => { delete Navigator.prototype.vibrate; });
  await startFlare(page);
  expect(await page.evaluate(() => 'vibrate' in navigator)).toBe(false);
  await page.locator('#btnMenu').tap();
  await expect(page.locator('#btnHaptics')).toBeHidden();
  await page.locator('#btnMenu').tap();
  expect(await dive(page)).toBe(true);
  expect(errors).toEqual([]);
});
