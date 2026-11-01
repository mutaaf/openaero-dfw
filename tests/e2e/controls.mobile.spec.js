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

// A tap on the dimmed backdrop closes the sheet and goes no further (validation panel: closing on
// pointerdown let the tap's click raise the gear behind it). An iPad held sideways (touch, 1180 wide)
// leaves backdrop beside the panel.
test('a tap on the backdrop closes the sheet without pressing the control behind it (0049)', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await stubTiles(page);
  await page.goto(BASE);
  await page.locator('#btnStartFlight').tap();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  await page.locator('#btnMenu').tap();
  await page.locator('#btnControls').tap();
  const sheet = page.locator('#controlsSheet');
  await expect(sheet).toBeVisible();
  // Every press that lands anywhere, logged: under the old pointerdown close the tap's mousedown/click
  // went to whatever was behind the sheet once it hid.
  await page.evaluate(() => {
    window.__hits = [];
    for (const t of ['pointerdown', 'mousedown', 'click']) {
      document.addEventListener(t, (e) => window.__hits.push(`${t}:${e.target.id || e.target.tagName}`), true);
    }
  });
  const panel = await page.locator('#controlsPanel').boundingBox();
  expect(panel.x + panel.width + 40, 'room to tap right of the panel').toBeLessThan(1180);
  await page.touchscreen.tap(panel.x + panel.width + 30, panel.y + panel.height / 2);
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(300);
  const hits = await page.evaluate(() => window.__hits);
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.filter((h) => !h.endsWith(':controlsSheet'))).toEqual([]);
});
