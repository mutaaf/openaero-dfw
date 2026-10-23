import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, enterCockpit } from './helpers.js';

// Ticket 0034 on a phone (390x844, touch): the overlay and its Resume button fit and take a tap.
test('phone: lost GPU overlay fits and Resume is a 44px tap', async ({ page }) => {
  const errors = collectErrors(page);
  await stubTiles(page);
  await enterCockpit(page);
  await page.evaluate(() => {
    window.__lc = document.getElementById('simCanvas').getContext('webgl2').getExtension('WEBGL_lose_context');
    window.__lc.loseContext();
  });
  await expect(page.locator('#gfxLost')).toBeVisible();
  await page.evaluate(() => window.__lc.restoreContext());
  const btn = page.locator('#btnGfxResume');
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await btn.tap();
  await expect(page.locator('#gfxLost')).toBeHidden();
  expect(await page.evaluate(() => window.openaeroDebug().paused)).toBe(false);
  expect(errors).toEqual([]);
});
