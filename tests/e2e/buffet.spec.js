import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
// Sim time at 2x wall time, a quarter of the pixels (fixtures.js), as the stall drill's spec.
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0079: the stall buffet (src/buffet.js, in the runway lights' lazy chunk). The Cessna at
// 4,500 ft over Grapevine Lake (the stall drill), Pilot (the desktop project's level): still in
// level flight; power idle and the nose held up until the wing nears the stall: the camera shakes.
// With reduced motion the camera never moves and the screen's edge glows. (Not waiting for the
// horn: Pilot's full aft stick takes the Cessna into a deep stall, α ~47°, where the model's IAS
// reads 80-110 kt and the IAS-based horn stays silent; the buffet is the cue there.)
const buffet = (page) => page.evaluate(() => window.openaeroBuffet.debug());

async function pullToTheHorn(page) {
  await stubTiles(page);
  await page.goto(`${BASE}?debug&mission=c172_stall_recovery`);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.openaeroBuffet);
  // Level flight first: nothing.
  await page.waitForTimeout(1500);
  const level = await buffet(page);
  expect(level.intensity).toBe(0);
  expect(level.peakShakeDeg).toBe(0);
  await page.locator('#rngThrottle').fill('0');
  await page.keyboard.down('KeyS');
  await expect.poll(async () => (await buffet(page)).intensity, { timeout: 90_000 }).toBeGreaterThan(0.3);
  return buffet(page);
}

test('held nose-up at idle near the stall: the wing buffets and the camera shakes', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  const d = await pullToTheHorn(page);
  expect(d.peakShakeDeg).toBeGreaterThan(0);
  expect(d.peakShakeDeg).toBeLessThanOrEqual(0.38); // pitch ≤ 0.35°, yaw ≤ 0.14°: √(0.35² + 0.14²)
  expect(d.cue).toBe(0);
  await page.keyboard.up('KeyS');
  // Paused (the menu's PAUSE): still, and the rumble's target 0.
  await page.evaluate(() => document.getElementById('btnPause').click());
  await expect.poll(async () => (await buffet(page)).intensity, { timeout: 5_000 }).toBe(0);
  expect((await buffet(page)).shakeDeg).toBe(0);
  expect(errors).toEqual([]);
});

test('reduced motion: the camera never moves; the edge glows instead', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const d = await pullToTheHorn(page);
  expect(d.peakShakeDeg).toBe(0);
  expect(d.shakeDeg).toBe(0);
  expect(d.cue).toBeGreaterThan(0);
  await expect(page.locator('#buffetCue')).toHaveCSS('pointer-events', 'none');
  await page.keyboard.up('KeyS');
  expect(errors).toEqual([]);
});
