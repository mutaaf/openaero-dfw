// Deep links: the site launcher picks the flight; Start flight is still a tap.
import { test, expect } from './fixtures.js';
import { BASE, stubTiles } from './helpers.js';

test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('?airport=KDAL lines up at Love Field, keeps the Start flight tap, and cleans the URL', async ({ page }) => {
  await page.goto(`${BASE}?airport=KDAL`);
  await expect(page.locator('#onboardingModal')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.openaeroDebug().mission)).toBe('kdal_31r_final');
  await expect(page.locator('#selScenario')).toHaveValue('kdal_31r_final');
  await expect(page.locator('.btnMission.active')).toHaveAttribute('data-scenario', 'kdal_31r_final');
  expect(await page.evaluate(() => location.search)).toBe('');
});

test('?mission=downtown_skyline starts that mission; junk falls back to the default', async ({ page }) => {
  await page.goto(`${BASE}?mission=downtown_skyline`);
  await expect.poll(() => page.evaluate(() => window.openaeroDebug().mission)).toBe('downtown_skyline');
  await page.goto(`${BASE}?mission=nope&airport=KJFK`);
  await expect.poll(() => page.evaluate(() => window.openaeroDebug().mission)).toBe('kdfw_35c_final');
});

test('?view=terrain never asks for the Google key, even with ?photoreal', async ({ page }) => {
  let config = 0;
  await page.route('**/openaero/api/config*', (r) => { config++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{"googleTilesKey":"TEST"}' }); });
  await page.goto(`${BASE}?photoreal&view=terrain`);
  await page.locator('#btnStartFlight').click();
  await page.waitForTimeout(1500);
  expect(config).toBe(0);
});
