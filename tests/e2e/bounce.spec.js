import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0091: a bounced landing is noticed, coached and graded. The ILS autoland flies the
// flare challenge to touchdown, then the ?debug hook throws the airplane back off the runway
// (a scripted bounce); the card waits for the wheels to settle, says "Bounced ×1" and the
// grade is C at best.
test('a bounce after the touchdown is coached, then caps the grade on the results card', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(`${BASE}?debug&mission=kdfw_35c_flare`);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.click('#btnApApr');
  const snap = () => page.evaluate(() => window.openaeroDebug());
  await expect.poll(async () => (await snap()).lastLanding, { timeout: 120_000, intervals: [50] }).not.toBeNull();
  // Hands on (the coach is quiet under the autopilot), then up: the wheels leave the runway
  // for well over 0.3 s.
  await page.evaluate(() => {
    for (const id of ['btnApApr', 'btnApMaster']) {
      const b = document.getElementById(id);
      if (b.classList.contains('active')) b.click();
    }
    window.openaeroDebugHop(5);
  });
  await expect.poll(async () => (await snap()).onGround, { timeout: 5_000, intervals: [50] }).toBe(false);
  await expect(page.locator('#txtCoach')).toHaveText(/Bounced: hold the attitude/, { timeout: 5_000 });
  await expect(page.locator('#resultsCard')).toBeHidden(); // not over the bounce
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#txtGradeReason')).toContainText('Bounced ×1');
  expect(['C', 'D']).toContain((await page.locator('#txtGrade').textContent()).trim());
  expect((await snap()).lastLanding.bounces).toBe(1);
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: test.info().outputPath('bounce-1280.png') });
  expect(errors).toEqual([]);
});
