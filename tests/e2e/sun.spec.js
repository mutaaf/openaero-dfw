import { test, expect } from '@playwright/test';
import { stubTiles, collectErrors, enterCockpit, FULL_RES } from './helpers.js';

test.use(FULL_RES);

// Ticket 0014: the sun is real by default (Now) and the button cycles today's
// Dawn / Noon / Dusk / Night over DFW.

const snap = (page) => page.evaluate(() => window.openaeroDebug());

// Mean luminance (0-255) of the top tenth of the 3D canvas (sky on the default final),
// with everything layered over the canvas hidden (docs/LESSONS.md 2026-10-16).
async function skyLuminance(page) {
  const style = await page.addStyleTag({
    content: 'body * { visibility: hidden !important; } #simCanvas { visibility: visible !important; }',
  });
  const png = await page.locator('#simCanvas').screenshot();
  await style.evaluate((el) => el.remove());
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 6).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

async function setMode(page, mode) {
  for (let i = 0; i < 5 && (await page.locator('#txtTimeBadge').textContent()) !== mode; i++) {
    await page.locator('#btnTimeOfDay').click();
  }
  await expect(page.locator('#txtTimeBadge')).toHaveText(mode);
}

test.beforeEach(async ({ page }) => {
  await stubTiles(page);
});

test('defaults to the real sun and cycles Now / Dawn / Noon / Dusk / Night', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  await expect(page.locator('#txtTimeBadge')).toHaveText('Now');
  expect((await snap(page)).sun.mode).toBe('Now');

  const seen = [];
  for (let i = 0; i < 5; i++) {
    await page.locator('#btnTimeOfDay').click();
    const s = (await snap(page)).sun;
    seen.push(s.mode);
    if (s.mode === 'Noon') expect(s.elevationDeg).toBeGreaterThan(30);
    if (s.mode === 'Night') expect(s.elevationDeg).toBeLessThan(-18);
    if (s.mode === 'Dawn' || s.mode === 'Dusk') expect(s.elevationDeg).toBeGreaterThan(0);
  }
  expect(seen).toEqual(['Dawn', 'Noon', 'Dusk', 'Night', 'Now']);
  expect(errors).toEqual([]);
});

test('forcing Night darkens the sky; Noon is bright', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  await setMode(page, 'Noon');
  await expect.poll(() => skyLuminance(page), { timeout: 15_000 }).toBeGreaterThan(100);
  await setMode(page, 'Night');
  await expect.poll(() => skyLuminance(page), { timeout: 15_000 }).toBeLessThan(40);
  expect(errors).toEqual([]);
});
