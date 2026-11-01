import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';

// Ticket 0049 on a phone (the `phone` project: touch, 390x844), upright and sideways.
for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`☰ Menu → Controls shows the touch controls first and fits ${vp.width}x${vp.height} (0049)`, async ({ page }) => {
    await page.setViewportSize(vp);
    const errors = collectErrors(page);
    await stubTiles(page);
    await page.goto(BASE);
    const start = page.locator('#btnStartFlight');
    await start.scrollIntoViewIfNeeded();
    await start.tap();
    await expect(page.locator('#onboardingModal')).toBeHidden();

    await page.locator('#btnMenu').tap();
    await page.locator('#btnControls').tap();
    const sheet = page.locator('#controlsSheet');
    await expect(sheet).toBeVisible();
    await expect(page.locator('#hudMenu')).not.toHaveClass(/\bopen\b/);
    await expect(page.locator('#controlsBody h3').first()).toHaveText('Touch');
    await expect(page.locator('#controlsBody dt', { hasText: 'Right stick' }).first()).toBeVisible();
    expect((await page.evaluate(() => window.openaeroDebug())).paused).toBe(true);

    const box = await page.locator('#controlsPanel').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    expect(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight && document.scrollingElement.scrollWidth <= innerWidth)).toBe(true);
    const close = await page.locator('#btnCloseControls').boundingBox();
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    expect(await lowContrastLabels(page, '#controlsSheet')).toEqual([]);
    await page.screenshot({ path: `test-results/controls-${vp.width}x${vp.height}.png` });

    await page.locator('#btnCloseControls').tap();
    await expect(sheet).toBeHidden();
    expect((await page.evaluate(() => window.openaeroDebug())).paused).toBe(false);
    expect(errors).toEqual([]);
  });
}
