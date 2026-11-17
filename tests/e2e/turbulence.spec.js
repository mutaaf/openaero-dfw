import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, collectErrors, TEST_METAR } from './helpers.js';

// Ticket 0195: a gusty METAR's turbulence (turbulence.js, in metar.js's lazy chunk) shakes the airplane and
// the weather ribbon says BUMPY at moderate or more (MIL-F-8785C: W20 30 kt). 20G40: a 20 kt spread is
// ~6.7 kt of σ_u at 10 m, σ_w ~3.5 kt: moderate. The default stub (18005KT) is smooth: no word.
const GUSTY = { ...TEST_METAR, wdir: 360, wspd: 20, wgst: 40, rawOb: 'METAR KDFW 161953Z 36020G40KT 10SM FEW250 24/10 A3002' };

async function fly(page, metars) {
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, metars);
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
}

// The vertical gust (openaeroDebug().windUpMps) over ~2 s of the default final: its spread and largest size.
const sampleUp = (page) => page.evaluate(() => new Promise((done) => {
  const xs = [];
  const t = setInterval(() => {
    xs.push(window.openaeroDebug().windUpMps);
    if (xs.length >= 40) { clearInterval(t); done(xs); }
  }, 50);
}));

for (const v of [{ width: 1280, height: 720, touch: false }, { width: 390, height: 844, touch: true }]) {
  test.describe(`${v.width}x${v.height}`, () => {
    test.use({ viewport: { width: v.width, height: v.height }, hasTouch: v.touch, isMobile: v.touch });

    test('a 20G40 METAR shakes the airplane and the ribbon says BUMPY, with no console errors', async ({ page }) => {
      const errors = collectErrors(page);
      await fly(page, [GUSTY]);
      // The HUD wind box (every screen, the clean view too) heads its line BUMPY METAR, inside the box.
      await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).hudWind.source, { timeout: 10_000 }).toBe('BUMPY METAR');
      const { hudWind } = await page.evaluate(() => window.openaeroDebug());
      expect(hudWind.bumpy).toBe(true);
      const textW = await page.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); c.font = 'bold 9px monospace'; return c.measureText('BUMPY METAR').width; });
      expect(3 + textW).toBeLessThanOrEqual(hudWind.box.w);
      // The weather ribbon (desktop; folded into the ☰ Menu sheet on a phone) says BUMPY beside LIVE METAR.
      if (!v.touch) {
        await expect(page.locator('#wxBadge')).toHaveText('LIVE METAR');
        await expect(page.locator('#wxBumpy')).toBeVisible();
        await expect(page.locator('#wxBumpy')).toHaveText('BUMPY');
      }
      const up = await sampleUp(page);
      const distinct = new Set(up.map((x) => x.toFixed(3))).size;
      console.log(`[turbulence e2e ${v.width}] vertical gust over 2 s: ${Math.min(...up).toFixed(2)} to ${Math.max(...up).toFixed(2)} m/s, ${distinct} values`);
      expect(distinct).toBeGreaterThan(10);
      expect(Math.max(...up.map(Math.abs))).toBeGreaterThan(0.2);
      expect(Math.max(...up.map(Math.abs))).toBeLessThan(15);
      await page.screenshot({ path: `test-results/turbulence-${v.width}.png` });
      expect(errors).toEqual([]);
    });

    test('a smooth day (the default 5 kt stub) shows no BUMPY', async ({ page }) => {
      const errors = collectErrors(page);
      await fly(page, [TEST_METAR]);
      await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).hudWind.live, { timeout: 10_000 }).toBe(true);
      await page.waitForTimeout(1500); // the ribbon repaints once a second
      await expect(page.locator('#wxBumpy')).toBeHidden();
      expect((await page.evaluate(() => window.openaeroDebug())).hudWind.source).toBe('METAR WIND');
      expect(errors).toEqual([]);
    });
  });
}
