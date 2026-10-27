import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0091 on a phone (390x844, touch): the bounce prompt and the results card with its
// "Bounced once" line and the next-time tip (0061) fit the screen without a scroll, upright
// and held sideways.
test('phone: the bounce prompt and the capped results card fit 390x844', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(`${BASE}?debug&mission=kdfw_35c_flare`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.evaluate(() => document.getElementById('btnApApr').click());
  const snap = () => page.evaluate(() => window.openaeroDebug());
  await expect.poll(async () => (await snap()).lastLanding, { timeout: 120_000, intervals: [50] }).not.toBeNull();
  await page.evaluate(() => {
    for (const id of ['btnApApr', 'btnApMaster']) {
      const b = document.getElementById(id);
      if (b.classList.contains('active')) b.click();
    }
    window.openaeroDebugHop(3);
  });
  // The prompt shows only while the wheels are up (well under a second on a 3 m/s hop): read
  // its box in the same frame its text says bounce, or a slow runner sees it already gone.
  const c = await (await page.waitForFunction(() => {
    const el = document.getElementById('coach');
    if (el.classList.contains('hidden') || !/bounce/i.test(document.getElementById('txtCoach').textContent)) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, width: r.width };
  }, null, { timeout: 5_000, polling: 'raf' })).jsonValue();
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.x + c.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('bounce-390-coach.png') });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#txtGradeReason')).toContainText('Bounced once');
  await expect(page.locator('#txtTip')).toContainText('You bounced off a'); // 0061
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('bounce-390.png') });
  // Held sideways (844x390): both buttons stay on screen with the bounce line showing.
  await page.setViewportSize({ width: 844, height: 390 });
  for (const id of ['#tipRow', '#btnFlyAgain', '#btnKeepRolling']) {
    await expect(page.locator(id)).toBeInViewport({ ratio: 1 });
  }
  await page.screenshot({ path: test.info().outputPath('bounce-844.png') });
  expect(errors).toEqual([]);
});
