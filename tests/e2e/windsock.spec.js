// Wind cones by every runway end (ticket 0027): each streams downwind in its own field's METAR,
// stands on its own ground, and can be picked out from a 1 NM final at 1280x720.
import { test, expect } from './fixtures.js';
import { stubTiles, stubMetar, collectErrors, TEST_METAR, FULL_RES, BASE } from './helpers.js';

const metar = (icaoId, wdir, wspd, wgst = null) => ({
  ...TEST_METAR, icaoId, wdir, wspd, wgst,
  rawOb: `METAR ${icaoId} 161953Z ${String(wdir).padStart(3, '0')}${String(wspd).padStart(2, '0')}${wgst ? `G${wgst}` : ''}KT 10SM FEW250 24/10 A3002`,
});
const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test.beforeEach(async ({ page }) => {
  await stubTiles(page);
  // DFW from the west at 18 kt (straight out), Love Field from the east at 7 kt (partly up).
  await stubMetar(page, [metar('KDFW', 270, 18), metar('KDAL', 90, 7)]);
});

async function cockpit(page) {
  await page.goto(`${BASE}?debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(() => page.evaluate(() => window.openaeroDebug().windsocks?.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
}

test('every airport has wind cones on its own ground, each in its own field\'s wind', async ({ page }) => {
  const errors = collectErrors(page);
  await cockpit(page);
  await expect.poll(() => page.evaluate(() => window.openaeroDebug().terrain?.demLoaded)).toBe(true);
  // Let the pendulums settle on the live METAR (they were primed on the first weather seen).
  await expect.poll(async () => {
    const socks = (await page.evaluate(() => window.openaeroDebug())).windsocks;
    return socks.filter((s) => s.airport === 'KDFW').every((s) => angleDiff(s.yawDeg, 90) < 6 && s.extensionDeg > 80);
  }, { timeout: 15_000 }).toBe(true);
  const socks = (await page.evaluate(() => window.openaeroDebug())).windsocks;
  for (const icao of ['KDFW', 'KDAL', 'KAFW', 'KADS', 'KGKY', 'KFTW']) {
    expect(socks.filter((s) => s.airport === icao).length, icao).toBeGreaterThanOrEqual(2);
  }
  for (const s of socks) expect(Math.abs(s.y - s.groundY), s.end).toBeLessThan(0.05);
  // Love Field's own METAR: from 090 at 7 kt, a cone streaming west, partly lifted.
  for (const s of socks.filter((o) => o.airport === 'KDAL')) {
    expect(angleDiff(s.yawDeg, 270), s.end).toBeLessThan(8);
    expect(s.extensionDeg, s.end).toBeGreaterThan(20);
    expect(s.extensionDeg, s.end).toBeLessThan(75);
  }
  expect(errors).toEqual([]);
});

test.describe('from the final', () => {
  test.use(FULL_RES);

  test('the 35C cone is picked out from 1 NM at 1280x720 (orange pixels with it, none without)', async ({ page }, info) => {
    const errors = collectErrors(page);
    await cockpit(page);
    // Pixel tests pin Noon (LESSONS 2026-10-18).
    for (let i = 0; i < 5 && (await page.evaluate(() => window.openaeroDebug().sun.mode)) !== 'Noon'; i++) await page.click('#btnTimeOfDay');
    expect(await page.evaluate(() => window.openaeroDebug().sun.mode)).toBe('Noon');
    await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 1));
    await page.click('#btnPause'); // the same frame twice, with and without the cones
    await expect.poll(() => page.evaluate(() => window.openaeroDebug().paused)).toBe(true);
    await info.attach('35c-1nm.png', { body: await page.screenshot(), contentType: 'image/png' });
    if (process.env.SOCK_SHOT) await page.screenshot({ path: process.env.SOCK_SHOT });
    // The 3D view alone (the HUD canvas and panels over it would count too).
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #simCanvas { visibility: visible !important; }' });
    const frame = async (on) => {
      await page.evaluate((v) => { window.openaeroWindsocks.group.visible = v; }, on);
      // Real frames, not wall time: a SwiftShader frame on CI can take > 250 ms.
      for (let k = 0; k < 3; k++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
      return (await page.locator('#simCanvas').screenshot()).toString('base64');
    };
    const a = await frame(true), b = await frame(false), b2 = await frame(false);
    // Orange pixels that the cones add: in the frame with them, and not in the frame without.
    const count = (withB64, withoutB64) => page.evaluate(async ([p, q]) => {
      const px = async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const [d, e] = [await px(p), await px(q)];
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const changed = Math.abs(d[i] - e[i]) + Math.abs(d[i + 1] - e[i + 1]) + Math.abs(d[i + 2] - e[i + 2]) > 40;
        if (changed && d[i] > d[i + 2] + 40 && d[i] >= d[i + 1]) n++;
      }
      return n;
    }, [withB64, withoutB64]);
    const withSock = await count(a, b);
    const without = await count(b2, b); // the noise floor: two frames without
    console.log(`orange pixels: with ${withSock}, without ${without}`);
    expect(withSock).toBeGreaterThan(without + 5); // measured 13-26 with (0.5°), 0 without
    expect(errors).toEqual([]);
  });
});
