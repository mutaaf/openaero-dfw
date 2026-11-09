import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0147: a firm touchdown puffs tyre smoke at the mains (touchdownFeel.js, in the runway
// lights' lazy chunk), reduced motion puffs nothing. A 0.3 NM final to DFW 35C (?debug
// openaeroDebugFinal), 3.5 s in the air (a touchdown counts after 3 s airborne), then pushed down
// at ~600 fpm every frame until the wheels touch.
const firmTouchdown = (page) => page.evaluate(() => new Promise((done) => {
  window.openaeroDebugFinal('KDFW', '35C', 0.3);
  const t0 = performance.now();
  const step = () => {
    const d = window.openaeroDebug();
    if (d.onGround && performance.now() - t0 > 3500) { done(window.openaeroTouchdownFeel.debug()); return; }
    if (performance.now() - t0 > 3500) window.openaeroDebugHop(-3); // ~590 fpm
    if (performance.now() - t0 > 20000) { done(null); return; }
    requestAnimationFrame(step);
  };
  step();
}));

async function fly(page) {
  await stubTiles(page);
  await page.goto(`${BASE}?debug&mission=kdfw_35c_flare`);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.openaeroDebugFinal && window.openaeroDebugHop && window.openaeroTouchdownFeel);
  await page.evaluate(() => { document.getElementById('btnCamera').click(); }); // the chase view, behind the mains
}

test('a firm touchdown puffs smoke at both mains, and it fades', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await fly(page);
  const d = await firmTouchdown(page);
  expect(d).not.toBeNull();
  expect(d.touches).toBeGreaterThanOrEqual(1);
  expect(d.last.sink).toBeGreaterThan(400);
  expect(d.last.thump).toBeGreaterThan(0);
  expect(d.visible).toBe(2);
  await page.screenshot({ path: test.info().outputPath('touchdown-puff-1280.png') });
  // Gone within its 1.4 s life (wall clock), whatever the sim does.
  await expect.poll(() => page.evaluate(() => window.openaeroTouchdownFeel.debug().visible), { timeout: 5_000 }).toBe(0);
  expect(errors).toEqual([]);
});

test('reduced motion: the touchdown puffs nothing', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fly(page);
  const d = await firmTouchdown(page);
  expect(d).not.toBeNull();
  expect(d.touches).toBeGreaterThanOrEqual(1);
  expect(d.puffs).toBe(0);
  expect(d.visible).toBe(0);
  expect(errors).toEqual([]);
});
