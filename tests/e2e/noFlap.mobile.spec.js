import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 4 });

// Ticket 0210 on a phone (390x844, touch), Kid: the no-flap lesson's coach fits, tapping FLAPS leaves the flaps at 0, and a
// short final ends on the results card with the roll against flaps 30, inside the screen.
test('phone, Kid: the no-flap lesson\'s lever is stuck on touch, and the landing shows the card', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?debug&mission=kads_16_no_flap`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  await expect(page.locator('#txtCoach')).toHaveText(/No flaps today: your plane lands faster/, { timeout: 10_000 });
  const coach = await page.locator('#txtCoach').boundingBox();
  expect(coach.x).toBeGreaterThanOrEqual(0);
  expect(coach.x + coach.width).toBeLessThanOrEqual(390);
  await page.locator('#touchFlaps').tap();
  await expect(page.locator('#toast')).toContainText('Flaps stuck at 0°');
  expect((await snap()).flapsIndex).toBe(0);
  await page.screenshot({ path: test.info().outputPath('no-flap-390-coach.png') });
  // Then a short final of it, and BRAKES on the ground.
  await page.evaluate(() => window.openaeroDebugFinal('KADS', '16', 0.6, 0, { aircraft: 'c172', kias: 70, flaps: 0, noFlap: true }));
  await expect.poll(async () => (await snap()).noFlap?.end, { timeout: 10_000 }).toBe('KADS_16');
  await expect.poll(async () => (await snap()).onGround, { timeout: 90_000 }).toBe(true);
  await page.locator('#touchBrakes').tap();
  const card = page.locator('#resultsCard');
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#resultsFactors')).toContainText(/Landing roll\s*[\d,]+ ft \(flaps 30 est\. ≈ [\d,]+/);
  const box = await card.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('no-flap-390-card.png') });
  expect(errors).toEqual([]);
});
