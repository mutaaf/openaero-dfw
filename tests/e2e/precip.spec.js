import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, collectErrors, TEST_METAR } from './helpers.js';

// Ticket 0196: rain, snow and thunderstorms falling at the flown field's live METAR show on screen
// (src/precip.js, a lazy chunk fetched only then). A +TSRA report: heavy rain streaks under a dark
// storm sky, lightning every 8-25 s (unit-tested: tests/unit/precip.test.js). A dry report fetches nothing.
const STORM = {
  ...TEST_METAR, wdir: 200, wspd: 14, wgst: 24, visib: 2, fltCat: 'IFR',
  rawOb: 'METAR KDFW 161953Z 20014G24KT 2SM +TSRA BR BKN025CB OVC040 22/20 A2985',
  clouds: [{ cover: 'BKN', base: 2500 }, { cover: 'OVC', base: 4000 }],
};
const isPrecipChunk = (url) => /\/assets\/precip-[^/]*\.js$/.test(url);

async function fly(page, metars) {
  const chunks = [];
  page.on('request', (r) => { if (isPrecipChunk(r.url())) chunks.push(r.url()); });
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, metars);
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  return chunks;
}

for (const v of [{ width: 1280, height: 720, touch: false }, { width: 390, height: 844, touch: true }]) {
  test.describe(`${v.width}x${v.height}`, () => {
    test.use({ viewport: { width: v.width, height: v.height }, hasTouch: v.touch, isMobile: v.touch });

    test('a +TSRA METAR rains heavily around the airplane, with no console errors', async ({ page }) => {
      const errors = collectErrors(page);
      const chunks = await fly(page, [STORM]);
      await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).precip, { timeout: 10_000 })
        .toMatchObject({ kind: 'rain', intensity: 2, ts: true, visible: true });
      const { precip } = await page.evaluate(() => window.openaeroDebug());
      expect(precip.count).toBeGreaterThan(2000);
      // The storm has a word: the HUD wind box heads its line T-STORM (amber).
      await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).hudWind.source, { timeout: 5_000 }).toBe('T-STORM');
      expect(chunks.length).toBeGreaterThan(0);
      // The HUD still draws over it: the attitude/speed readouts are DOM above the canvas.
      await page.waitForTimeout(800);
      await page.screenshot({ path: `test-results/precip-${v.width}.png` });
      expect(errors).toEqual([]);
    });

    test('a dry METAR fetches no precipitation chunk', async ({ page }) => {
      const errors = collectErrors(page);
      const chunks = await fly(page, [TEST_METAR]);
      await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).wxLive, { timeout: 10_000 }).toBe(true);
      await page.waitForTimeout(2000);
      expect(chunks).toEqual([]);
      expect((await page.evaluate(() => window.openaeroDebug())).precip).toBeNull();
      expect(errors).toEqual([]);
    });
  });
}

test('reduced motion: the storm draws no streaks and flashes no lightning', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = collectErrors(page);
  await fly(page, [STORM]);
  await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).precip, { timeout: 10_000 })
    .toMatchObject({ kind: 'rain', intensity: 2, ts: true, count: 0, visible: false, flashes: 0 });
  expect(errors).toEqual([]);
});
