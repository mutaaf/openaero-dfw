import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, collectErrors, TEST_METAR } from './helpers.js';

// Ticket 0075: the wind is on the HUD in the default (clean) view, on a phone too. A live
// 080° at 12 kt on the default KDFW 35C final is a 12 kt crosswind from the right; the box
// (canvas, hudLayout.js windBoxRect) clears every DOM panel, the tapes and the horizon band.
const XW_METAR = { ...TEST_METAR, wdir: 80, wspd: 12, wgst: null, rawOb: 'METAR KDFW 161953Z 08012KT 10SM FEW250 24/10 A3002' };
const CALM_METAR = { ...TEST_METAR, wdir: 0, wspd: 0, wgst: null, rawOb: 'METAR KDFW 161953Z 00000KT 10SM FEW250 24/10 A3002' };
const PANELS = ['#topRow', '#coach', '#touchThrottle', '#touchStick', '#touchButtons', '#masterAlertBanner', '#stallAlertBanner', '#keyHints'];
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function fly(page, metars) {
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, ...(metars ? [metars] : [[], 500]));
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
}

for (const v of [{ width: 1280, height: 720, touch: false }, { width: 390, height: 844, touch: true }]) {
  test.describe(`${v.width}x${v.height}`, () => {
    // An empty profile: the clean view players get by default.
    test.use({ viewport: { width: v.width, height: v.height }, hasTouch: v.touch, isMobile: v.touch, storageState: { cookies: [], origins: [] } });

    test('shows the live wind and its crosswind on final, clear of everything else', async ({ page }) => {
      const errors = collectErrors(page);
      await fly(page, [XW_METAR]);
      await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).hudWind.xw, { timeout: 10_000 }).toBe('XW 12R');
      const d = await page.evaluate(() => window.openaeroDebug());
      expect(d.activeRunway).toBe('KDFW_35C');
      expect(d.hudWind).toMatchObject({ source: 'METAR WIND', calm: false, speed: '080/12', xwKts: 12, hw: 'HW 2' });
      expect(d.wetRunway).toBe(false); // a dry METAR (0108)
      // Blowing from the right, so the arrow points left (about 270° from the nose).
      expect(Math.abs(d.hudWind.arrowDeg - (80 - d.headingDeg + 180 + 360) % 360)).toBeLessThan(1);
      expect(d.hudWind.arrowDeg).toBeGreaterThan(240);
      expect(d.hudWind.arrowDeg).toBeLessThan(300);

      const box = { x: d.hudWind.box.x, y: d.hudWind.box.y, width: d.hudWind.box.w, height: d.hudWind.box.h };
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(v.width);
      // Alerts forced on: they toggle every frame and take the coach's slot.
      await page.addStyleTag({ content: '#masterAlertBanner.hidden, #stallAlertBanner.hidden { display: block !important; }' });
      for (const id of PANELS) {
        const b = await page.locator(id).boundingBox();
        if (b) expect(overlaps(box, b), `wind box vs ${id}`).toBe(false);
      }
      const cx = v.width / 2, cy = v.height / 2;
      const clear = [
        ['speed tape', { x: cx - 175, y: cy - 90, width: 44, height: 180 }],
        ['altitude tape', { x: cx + 130, y: cy - 90, width: 56, height: 180 }],
        ['heading box', { x: cx - 52, y: Math.max(cy - 145, 72), width: 104, height: 24 }],
        ['horizon band', { x: v.width * 0.3, y: v.height * 0.35, width: v.width * 0.4, height: v.height * 0.3 }],
      ];
      for (const [name, r] of clear) expect(overlaps(box, r), `wind box vs ${name}`).toBe(false);
      // Nothing in the DOM sits on top of it: the HUD canvas is what is under its centre.
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [box.x + box.width / 2, box.y + box.height / 2]);
      expect(['simCanvas', 'hudCanvas']).toContain(top);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('honest labels', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('calm is dimmed text with no arrow; offline weather says SCENARIO', async ({ page }) => {
    await fly(page, [CALM_METAR]);
    await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).hudWind.speed, { timeout: 10_000 }).toBe('CALM');
    let d = await page.evaluate(() => window.openaeroDebug());
    expect(d.hudWind).toMatchObject({ source: 'METAR WIND', calm: true, xw: '', arrowDeg: null });

    const offline = await page.context().newPage();
    await fly(offline, null);
    await expect.poll(async () => (await offline.evaluate(() => window.openaeroDebug())).hudWind.source, { timeout: 10_000 }).toBe('SCENARIO');
    d = await offline.evaluate(() => window.openaeroDebug());
    expect(d.wxLive).toBe(false);
    expect(d.hudWind.speed).toMatch(/^\d{3}\/\d+/);
  });
});

// Ticket 0108: rain on the METAR wets the runway: the wind box says WET RWY, the brakes get the
// wet friction (sim.wetRunway) and the coach says so on the final. A dry METAR says none of it.
const WET_METAR = { ...TEST_METAR, wdir: 350, wspd: 8, wgst: null, visib: 4, rawOb: 'METAR KDFW 161953Z 35008KT 4SM -RA BR OVC015 18/16 A2992' };
test.describe('wet runway at 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: { cookies: [], origins: [] } });
  test('a METAR with rain: WET RWY on the HUD, wet brakes, and the coach says to expect a longer roll', async ({ page }) => {
    const errors = collectErrors(page);
    await fly(page, [WET_METAR]);
    await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).hudWind.source, { timeout: 10_000 }).toBe('WET RWY');
    expect((await page.evaluate(() => window.openaeroDebug())).wetRunway).toBe(true);
    await expect(page.locator('#coach')).toContainText(/wet runway/i, { timeout: 15_000 });
    expect(errors).toEqual([]);
  });
});
