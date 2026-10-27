import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';

// Traffic pattern at Addison (ticket 0048): the Cessna on a left downwind for 16 at 1,000 ft,
// 0.75 NM east of the runway. In the picker with Addison's missions; on Pilot the coach's first
// words are the downwind's. The whole circuit is flown headless from this spawn at Kid level
// (tests/flight/pattern.test.js) and the legs' words are unit-tested (tests/unit/pattern.test.js).
test('the traffic pattern: in the picker under Addison, spawned on the downwind, coached from the first second', async ({ page }) => {
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(`${BASE}?mission=pattern_kads_16`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const card = page.locator('#missionList section', { hasText: 'Addison' }).locator('[data-scenario="pattern_kads_16"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('KADS Traffic Pattern (Cessna)');
  const snap = () => page.evaluate(() => window.openaeroDebug());
  const spawn = await snap();
  expect(spawn).toMatchObject({ mission: 'pattern_kads_16', aircraft: 'c172', assist: 'pilot', flapsIndex: 0, onGround: false, engineFailed: false });
  expect(spawn.aglFt).toBeGreaterThan(950);
  expect(spawn.aglFt).toBeLessThan(1050);
  expect(Math.abs(spawn.headingDeg - 340)).toBeLessThan(3);
  expect(spawn.iasKts).toBeGreaterThan(80);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText('Downwind: hold 1,000 ft, parallel to the runway', { timeout: 10_000 });
  expect(await lowContrastLabels(page, '#coach')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('pattern-1280-downwind.png') });
  expect(errors).toEqual([]);
});
