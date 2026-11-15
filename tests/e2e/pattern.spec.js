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
  await expect(page.locator('#txtCoach')).toHaveText('Downwind: hold 1,000 ft above the field, parallel to the runway', { timeout: 10_000 });
  expect(await lowContrastLabels(page, '#coach')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('pattern-1280-downwind.png') });
  expect(errors).toEqual([]);
});

// Joining the pattern (ticket 0187): 4 NM out on the 45° to the downwind's middle, level at 1,000 ft.
// The join, circuit and landing are flown headless (tests/flight/pattern.test.js), the words and the
// card's caps unit-tested (tests/unit/pattern.test.js).
test('join the pattern: in the picker under Addison, spawned on the 45° at 1,000 ft, the entry coached', async ({ page }) => {
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(`${BASE}?mission=pattern_entry_kads`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const card = page.locator('#missionList section', { hasText: 'Addison' }).locator('[data-scenario="pattern_entry_kads"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('KADS Join the Pattern (Cessna)');
  await expect(card).toContainText('45°');
  const spawn = await page.evaluate(() => window.openaeroDebug());
  expect(spawn).toMatchObject({ mission: 'pattern_entry_kads', aircraft: 'c172', assist: 'pilot', flapsIndex: 0, onGround: false });
  expect(spawn.aglFt).toBeGreaterThan(950);
  expect(spawn.aglFt).toBeLessThan(1050);
  expect(Math.abs(spawn.headingDeg - 295)).toBeLessThan(3);
  expect(spawn.iasKts).toBeGreaterThan(80);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtCoach')).toHaveText('Level at 1,000 ft: fly toward the middle of the runway, 45° to the downwind', { timeout: 10_000 });
  expect(await lowContrastLabels(page, '#coach')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('pattern-entry-1280.png') });
  expect(errors).toEqual([]);
});
