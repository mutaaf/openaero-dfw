import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0087 on a phone (390x844, touch), at Kid level: the stall protection is off until
// the stall, so hands off at idle the Cessna slows and stalls by itself, then lowers its
// nose and climbs away at full power; the card fits the screen.
test('phone, Kid, hands off: the drill still stalls, recovers itself and fits the card', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=c172_stall_recovery`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  expect((await snap()).assist).toBe('kid');
  await expect(page.locator('#txtCoach')).toHaveText(/Let go/, { timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath('stall-drill-390-coach.png') });
  await expect.poll(async () => (await snap()).stallDrill?.phase, { timeout: 150_000 }).not.toBe('armed');
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Stall recovered');
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const btn = await page.locator('#btnFlyAgain').boundingBox();
  expect(btn.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('stall-drill-390.png') });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
  expect(stored.missions['c172_stall_recovery@kid']).toBeTruthy();
  expect(errors).toEqual([]);
});
