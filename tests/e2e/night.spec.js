import { test, expect } from '@playwright/test';
import { stubTiles, collectErrors, enterCockpit, FULL_RES } from './helpers.js';

test.use(FULL_RES);

// Night keeps the world: the imagery stays readable (moonlight + city lights, never black),
// the runways light up (ticket 0011), and the real stars and Moon are overhead.

const snap = (page) => page.evaluate(() => window.openaeroDebug());

// Mean luminance and the count of bright (lum > 200) pixels in a band of the bare canvas,
// rows from y0 to y1 (fractions of the height), at full resolution (lights are 2-5 px).
async function band(page, y0, y1) {
  const style = await page.addStyleTag({
    content: 'body * { visibility: hidden !important; } #simCanvas { visibility: visible !important; }',
  });
  const png = await page.locator('#simCanvas').screenshot();
  await style.evaluate((el) => el.remove());
  return page.evaluate(async ([b64, y0, y1]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const top = Math.round(y0 * img.height);
    const d = ctx.getImageData(0, top, img.width, Math.round(y1 * img.height) - top).data;
    let sum = 0, bright = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += l;
      if (l > 200) bright++;
    }
    return { mean: sum / (d.length / 4), bright };
  }, [png.toString('base64'), y0, y1]);
}

async function pickTime(page, label) {
  await page.locator('#btnOpenMissions').click();
  await page.locator('#timePicker .btnTime', { hasText: label }).click();
  await page.locator('#btnStartFlight').click();
}

test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('at night the ground stays visible, and the sky has stars, the Moon and lit runways', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  await pickTime(page, 'Day');
  await expect.poll(async () => (await band(page, 0.62, 1)).mean, { timeout: 15_000 }).toBeGreaterThan(60);
  const day = (await band(page, 0.62, 1)).mean;
  expect((await snap(page)).sky.cityLights).toBe(0);

  await pickTime(page, 'Night');
  await expect.poll(async () => (await snap(page)).sky.stars, { timeout: 15_000 }).toBe(1);
  const s = (await snap(page)).sky;
  expect(s.nightness).toBe(1);
  expect(s.cityLights).toBe(1);
  expect(s.runwayLights).toBeGreaterThan(5000);
  expect(s.moonIllumination).toBeGreaterThanOrEqual(0);
  expect(s.moonIllumination).toBeLessThanOrEqual(1);
  // The imagery is moonlit, not gone: before 2026-10-19 night ground was ~3% of day.
  const night = await band(page, 0.62, 1);
  expect(night.mean).toBeGreaterThan(day * 0.25);
  expect(errors).toEqual([]);
});

test('the runway and approach lights show from the 4 NM final at night (ticket 0011)', async ({ page }) => {
  await enterCockpit(page);
  await pickTime(page, 'Night');
  await expect.poll(async () => (await snap(page)).sky.runwayLights, { timeout: 15_000 }).toBeGreaterThan(5000);
  // The runways sit just under the horizon ahead; with the tiles stubbed flat green, the
  // bright pixels there are the lights.
  // Measured 2026-10-19 at 1280x720: ~850 bright pixels with the lights, ~130 from the
  // PAPIs alone without them.
  await expect.poll(async () => (await band(page, 0.5, 0.62)).bright, { timeout: 15_000 }).toBeGreaterThan(450);
});
