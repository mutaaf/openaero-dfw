import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, collectErrors, TEST_METAR } from './helpers.js';

// Ticket 0146: the altimeter setting under the altitude tape, from the METAR (A3011 = 1019.6 hPa),
// the number physics flies on (sim.altimInHg); offline, the scenario's, labelled SCENARIO. The box
// (canvas, gateVerdict.js baroRect) clears every DOM panel and the tapes.
const BARO_METAR = { ...TEST_METAR, altim: 1019.6, rawOb: 'METAR KDFW 161953Z 18005KT 10SM FEW250 24/10 A3011' };
const PANELS = ['#topRow', '#coach', '#touchThrottle', '#touchStick', '#touchButtons', '#touchTrim', '#masterAlertBanner', '#stallAlertBanner', '#keyHints', '#calloutCaption'];
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function fly(page, metars) {
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, ...(metars ? [metars] : [[], 500]));
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
}
const PILOT_ONLY = { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'openaero_assist_v1', value: '{"v":1,"level":"pilot","at":0}' }] }] };
const hud = (page) => page.evaluate(() => window.openaeroDebug().hudWind);

for (const v of [{ width: 1280, height: 720, touch: false }, { width: 390, height: 844, touch: true }, { width: 844, height: 390, touch: true }, { width: 820, height: 1180, touch: true }, { width: 667, height: 375, touch: true }]) {
  test.describe(`${v.width}x${v.height}`, () => {
    test.use({ viewport: { width: v.width, height: v.height }, hasTouch: v.touch, isMobile: v.touch, storageState: PILOT_ONLY });

    test('shows the METAR altimeter setting under the altitude tape, clear of everything else', async ({ page }) => {
      const errors = collectErrors(page);
      await fly(page, [BARO_METAR]);
      await expect.poll(async () => (await hud(page)).baro, { timeout: 10_000 }).toBe('30.11 IN');
      const d = await page.evaluate(() => window.openaeroDebug());
      expect(d.hudWind.baroSrc).toBe('METAR');
      const b = d.hudWind.baroBox;
      const box = { x: b.x, y: b.y, width: b.w, height: b.h };
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(v.width);
      expect(box.y + box.height).toBeLessThanOrEqual(v.height);
      await page.addStyleTag({ content: '#masterAlertBanner.hidden, #stallAlertBanner.hidden { display: block !important; }' });
      for (const id of PANELS) {
        const r = await page.locator(id).boundingBox();
        if (r) expect(overlaps(box, r), `altimeter box vs ${id}`).toBe(false);
      }
      const cx = v.width / 2, cy = v.height / 2;
      const wb = d.hudWind.box;
      for (const [name, r] of [
        ['speed tape', { x: cx - 191, y: cy - 90, width: 60, height: 180 }],
        ['altitude tape', { x: cx + 130, y: cy - 90, width: 64, height: 180 }],
        ['wind box', { x: wb.x, y: wb.y, width: wb.w, height: wb.h }],
      ]) expect(overlaps(box, r), `altimeter box vs ${name}`).toBe(false);
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [box.x + box.width / 2, box.y + box.height / 2]);
      expect(['simCanvas', 'hudCanvas']).toContain(top);
      await page.screenshot({ path: test.info().outputPath(`baro-${v.width}x${v.height}.png`) });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('568x320 sideways (device panel)', () => {
  test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true, storageState: PILOT_ONLY });

  test('left out: the touch button row would cover it', async ({ page }) => {
    await fly(page, [BARO_METAR]);
    await expect.poll(async () => (await hud(page)).source, { timeout: 10_000 }).toBe('METAR WIND');
    await page.waitForTimeout(500);
    expect((await hud(page)).baro).toBe(null);
  });
});

test.describe('offline (0146)', () => {
  test.use({ storageState: PILOT_ONLY });

  test('no METAR: the scenario setting, labelled SCENARIO', async ({ page }) => {
    await fly(page, null);
    await expect.poll(async () => (await hud(page)).baro, { timeout: 10_000 }).toBe('30.00 IN');
    expect((await hud(page)).baroSrc).toBe('SCENARIO');
  });

});

test.describe('Kid and Learner (0146)', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // a first visit flies Learner

  test('a first visit (Learner) has none', async ({ page }) => {
    await fly(page, [BARO_METAR]);
    await expect.poll(async () => (await hud(page)).source, { timeout: 10_000 }).toBe('METAR WIND');
    await page.waitForTimeout(500);
    expect((await hud(page)).baro).toBe(null);
  });
});
