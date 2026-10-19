import { test, expect } from '@playwright/test';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Adaptive render resolution (0026). Only the 3D canvas's drawing buffer changes; its CSS
// size and the 2D HUD canvas (drawn at CSS pixels) stay put.
const buffer = (page) => page.evaluate(() => {
  const c = document.getElementById('simCanvas');
  const h = document.getElementById('hudCanvas');
  return {
    w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight,
    hudW: h.width, hudH: h.height, ratio: window.openaeroDebug().pixelRatio,
  };
});

async function fly(page, query = '') {
  await page.goto(`${BASE}${query}`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
}

test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('a 1x screen renders at 1x and stays there', async ({ page }) => {
  const errors = collectErrors(page);
  await fly(page);
  await page.waitForTimeout(3000);
  const b = await buffer(page);
  expect(b.ratio).toBe(1);
  expect(b.w).toBe(b.cssW);
  expect(b.h).toBe(b.cssH);
  expect(errors).toEqual([]);
});

test.describe('on a 2x screen', () => {
  test.use({ deviceScaleFactor: 2 });

  test('boots at the device cap, steps down when frames run long, HUD stays at CSS size', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(BASE);
    expect((await buffer(page)).ratio).toBe(2);
    await page.locator('#btnStartFlight').click();
    await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
    // SwiftShader cannot draw 2560x1440 in 22 ms: the ratio must come down.
    await expect.poll(async () => (await buffer(page)).ratio, { timeout: 20_000 }).toBeLessThan(2);
    const b = await buffer(page);
    expect([1.5, 1.25, 1]).toContain(b.ratio);
    expect(b.w).toBe(Math.floor(b.cssW * b.ratio));
    expect(b.h).toBe(Math.floor(b.cssH * b.ratio));
    expect(b.hudW).toBe(b.cssW); // HUD canvas untouched: crisp text at CSS pixels
    expect(b.hudH).toBe(b.cssH);
    expect(errors).toEqual([]);
  });

  test('?debug shows the current pixel ratio', async ({ page }) => {
    await fly(page, '?debug');
    const ratio = (await buffer(page)).ratio;
    await expect(page.getByText(/· px (2|1\.5|1\.25|1)$/)).toBeVisible();
    expect([2, 1.5, 1.25, 1]).toContain(ratio);
  });
});
