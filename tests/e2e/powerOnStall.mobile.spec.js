import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
// A long flight: sim time at 4x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Ticket 0191 on a phone (390x844, touch), at Kid level: the drill lifts Kid's pitch cap and its guide
// raises the nose at full power until the wing stalls, then the protection lowers it and Kid climbs away.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('Kid, hands off: the nose comes up at full power, it stalls, recovers itself, and the card fits', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=c172_power_on_stall`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  expect((await snap(page)).assist).toBe('kid');
  await expect(page.locator('#txtCoach')).toHaveText(/the nose comes up/, { timeout: 10_000 });
  // The coach card clears the HUD's top strip (read in one evaluate: the sim runs between calls).
  const rects = await page.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); const b = e && e.getBoundingClientRect(); return b && b.width ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right } : null; };
    return { coach: r('txtCoach'), w: innerWidth, h: innerHeight };
  });
  expect(rects.coach.left).toBeGreaterThanOrEqual(0);
  expect(rects.coach.right).toBeLessThanOrEqual(rects.w);
  await page.screenshot({ path: test.info().outputPath('power-on-stall-390-coach.png') });
  await expect.poll(async () => (await snap(page)).stallDrill?.phase, { timeout: 150_000 }).not.toBe('armed');
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Power-on stall recovered');
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('power-on-stall-390.png') });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
  expect(stored.missions['c172_power_on_stall@kid']).toBeTruthy();
  expect(errors).toEqual([]);
});
