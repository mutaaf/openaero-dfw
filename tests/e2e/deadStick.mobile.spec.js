import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0036 on a phone (390x844, touch), Kid level: the dead-stick glide put on a 1.2 NM
// final far too low to make it (the ?debug hook), hands off. Kid's guide holds best glide and
// flares it into the field short of the runway: the card says by how much, and fits.
test('phone, Kid: a dead-stick glide that falls short says how far it missed the runway', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?debug&mission=deadstick_kads_16`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  await expect(page.locator('#txtCoach')).toHaveText(/Engine failure!/, { timeout: 10_000 });
  await expect(page.locator('#txtTouchThr')).toHaveText('OUT'); // the touch throttle's readout
  await page.screenshot({ path: test.info().outputPath('deadstick-390-coach.png') });
  // 1.2 NM out at 250 ft: a 9:1 glide needs ~810 ft.
  await page.evaluate(() => window.openaeroDebugDeadStick(1.2, 250));
  await expect(page.locator('#txtCoach')).toHaveText(/Low: turn straight for the runway/, { timeout: 10_000 });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Dead-stick landing');
  await expect(page.locator('#txtGrade')).toHaveText('D');
  await expect(page.locator('#txtGradeReason')).toHaveText(/^Missed the runway by [\d,]+ ft/);
  await expect(page.locator('#resultsFactors li').first()).toContainText(/missed by [\d,]+ ft/);
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const btn = await page.locator('#btnFlyAgain').boundingBox();
  expect(btn.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  expect((await snap()).lastLanding.grade).toBe('D');
  await page.screenshot({ path: test.info().outputPath('deadstick-390.png') });
  expect(errors).toEqual([]);
});
