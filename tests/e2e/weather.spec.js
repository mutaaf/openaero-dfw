import { test, expect } from '@playwright/test';
import { stubTiles, stubMetar, enterCockpit, TEST_METAR } from './helpers.js';

const NORTH_30 = {
  ...TEST_METAR, wdir: 360, wspd: 30, wgst: null,
  rawOb: 'METAR KDFW 162053Z 36030KT 10SM BKN015 18/03 A3041',
  clouds: [{ cover: 'BKN', base: 1500 }],
};

test('real METAR drives the ribbon and the wind in the physics', async ({ page }) => {
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, [NORTH_30]);
  await enterCockpit(page);
  await expect(page.locator('#wxBadge')).toHaveText('LIVE METAR');
  await expect(page.locator('#txtMetarString')).toContainText('36030KT');
  await expect(page.locator('#txtMetarString')).toContainText('min ago');
  await expect(page.locator('#txtWindBadge')).toHaveText('360° @ 30 KT');
  await expect(page.locator('#txtFlow')).toContainText('NORTH');
  await page.selectOption('#selScenario', 'kdfw_35c_final');
  // 30 kt straight down 35C: indicated airspeed exceeds groundspeed by ~30 kt.
  await expect.poll(async () => {
    const s = await page.evaluate(() => window.openaeroDebug());
    return s.iasKts - s.gsKts;
  }, { timeout: 8_000 }).toBeGreaterThan(20);
  await expect(page.locator('#txtRwyWind')).toContainText('HW');
  const s = await page.evaluate(() => window.openaeroDebug());
  expect(s.cloudBaseFt).toBe(1500);
});

test('without the weather API it falls back to clearly labelled scenario weather', async ({ page }) => {
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, [], 503);
  await enterCockpit(page);
  await expect(page.locator('#wxBadge')).toHaveText('SCENARIO WX');
  await expect(page.locator('#txtMetarString')).toContainText('SCENARIO');
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\blive\b/i);
});
