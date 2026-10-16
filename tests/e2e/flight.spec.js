import { test, expect } from '@playwright/test';
import { stubTiles, enterCockpit } from './helpers.js';

test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('D banks right and a held bank turns the aircraft right', async ({ page }) => {
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'downtown_skyline');
  const x0 = (await snap(page)).pos.x;
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await snap(page)).bankRightDeg, { timeout: 5_000 }).toBeGreaterThan(12);
  await page.keyboard.up('KeyD');
  // Heading 000 → turning right means the heading climbs and the aircraft drifts east.
  await expect.poll(async () => { const s = await snap(page); return s.headingDeg > 2 && s.headingDeg < 90; }, { timeout: 15_000 }).toBe(true);
  expect((await snap(page)).pos.x).toBeGreaterThan(x0);
});

test('ILS autoland flies the short final to an upright touchdown on the runway', async ({ page }) => {
  test.setTimeout(150_000);
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdfw_35c_flare');
  await page.click('#btnApApr');
  await expect.poll(async () => (await snap(page)).onGround, { timeout: 120_000 }).toBe(true);
  const s = await snap(page);
  expect(Math.abs(s.crossM)).toBeLessThan(15);
  expect(s.distM).toBeLessThan(0);         // past the threshold
  expect(s.distM).toBeGreaterThan(-900);   // and in the touchdown zone-ish
  expect(Math.abs(s.bankRightDeg)).toBeLessThan(3);
  expect(s.pitchDeg).toBeGreaterThan(0);
  expect(s.pitchDeg).toBeLessThan(10);
});

test('ILS autoland holds the localizer and glideslope from 4 NM', async ({ page }) => {
  test.setTimeout(120_000);
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdal_31r_final');
  await page.click('#btnApApr');
  const t0 = Date.now();
  while (Date.now() - t0 < 12_000) {
    const s = await snap(page);
    expect(Math.abs(s.crossM), 'localizer').toBeLessThan(20);
    expect(Math.abs(s.heightAbovePathM), 'glideslope').toBeLessThan(20);
    expect(Math.abs(s.bankRightDeg), 'wings').toBeLessThan(30);
    await page.waitForTimeout(500);
  }
});
