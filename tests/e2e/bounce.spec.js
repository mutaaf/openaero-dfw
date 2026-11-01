import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, scriptedBounce } from './helpers.js';

// Ticket 0091: a bounced landing is noticed, coached and graded. The ILS autoland flies the
// flare challenge to touchdown, then the ?debug hook throws the airplane back off the runway
// (a scripted bounce); the card waits for the wheels to settle, says "Bounced once" and the
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
  // 0.4 s after the touchdown, hands on (the coach is quiet under the autopilot), then up: the
  // wheels leave the runway for well over 0.3 s (helpers.js scriptedBounce, timed in sim time).
  await scriptedBounce(page);
  await expect(page.locator('#txtCoach')).toHaveText(/Bounced: hold the attitude/, { timeout: 5_000 }); // a slight bounce
  await expect(page.locator('#resultsCard')).toBeHidden(); // not over the bounce
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#txtGradeReason')).toContainText('Bounced once');
  // 0061: the one thing to fix next time names what made it bounce.
  await expect(page.locator('#txtTip')).toHaveText(/^You bounced[.:] /);
  expect(['C', 'D']).toContain((await page.locator('#txtGrade').textContent()).trim());
  expect((await snap()).lastLanding.bounces).toBe(1);
  const box = await page.locator('#resultsCard').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: test.info().outputPath('bounce-1280.png') });
  expect(errors).toEqual([]);
});
