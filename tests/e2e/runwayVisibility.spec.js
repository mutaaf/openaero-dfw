import { test, expect } from './fixtures.js';
import { stubTiles, BASE, FULL_RES } from './helpers.js';

// Ticket 0068: can you find the runway from a long final? For 35C and 17R at 10 and 3 NM,
// at each sun preset: the runway region (approach lights' outer end to the far end, 1 px
// around it) against a ring of ground out to 24 px, and the lit (luma > 200) pixels in it.
// The ground is a dark urban grey (warehouse roofs, car parks: the night shader lights its
// streets too), the backdrop the Scout found hardest.
//
// Measured 2026-10-22 at 1280x720 (contrast; lit px):
//                        before (main)       after              lights off
//   night 10 NM  35C/17R  1.97;8  2.01;10    2.34;14  2.27;14   1.26;0  1.14;0
//   night  3 NM  35C/17R  2.30     2.04       2.30     2.04      1.00    1.09
//   day    3 NM  35C/17R  1.30     1.32       (lights off by day in VMC, as at the real fields)
//   dawn/day/dusk 10 NM   1.03-1.11           unchanged: haze-limited (below)
// The night 10 NM thresholds sit between the lights-off/before numbers and after; night and
// day 3 NM are regression floors (unchanged by 0068). Runway lights are off by day in VMC (FAA
// JO 7110.65 3-4), and Dawn/Dusk put the sun 2.5° up, before they come on. By day at 10 NM the
// runway is 18.5 km into the "10+ SM" haze (25 km, weather.js): ~70% fogged, and a real 25 km
// day leaves even less (Koschmieder), so those cases are printed only. By day the region's
// approach-light strip is bare ground, which dilutes its number further.
test.use({ ...FULL_RES, reducedMotion: 'reduce' }); // steady flashers: one number per case

const URBAN_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOwsnEAAAFqALe/dgiBAAAAAElFTkSuQmCC', 'base64');
const snap = (page) => page.evaluate(() => window.openaeroDebug());

// Mean luma inside the runway's outline grown by `inner` px, mean luma of the ring from there
// to `outer` px, their contrast ratio ((hi + 12.75) / (lo + 12.75), WCAG's 0.05 offset on a
// 0-255 scale) and the lit (luma > 200) pixels in the region.
async function measure(page, inner = 1, outer = 24) {
  const quad = (await snap(page)).runwayScreen;
  const style = await page.addStyleTag({
    content: 'body * { visibility: hidden !important; } #simCanvas { visibility: visible !important; }',
  });
  const png = await page.locator('#simCanvas').screenshot();
  await style.evaluate((el) => el.remove());
  return page.evaluate(async ([b64, quad, inner, outer]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const k = img.width / window.innerWidth;
    // Corners in order around the outline: near-left, near-right, far-right, far-left.
    const P = [quad[0], quad[1], quad[3], quad[2]].map((p) => ({ x: p.x * k, y: p.y * k }));
    const segDist = (x, y, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len));
      return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
    };
    const inside = (x, y) => {
      let s = 0;
      for (let i = 0; i < 4; i++) {
        const a = P[i], b = P[(i + 1) % 4];
        const cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        if (cr !== 0) { if (s && Math.sign(cr) !== s) return false; s = Math.sign(cr); }
      }
      return true;
    };
    const o = outer * k, n = inner * k;
    const x0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p.x)) - o)), x1 = Math.min(img.width - 1, Math.ceil(Math.max(...P.map((p) => p.x)) + o));
    const y0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p.y)) - o)), y1 = Math.min(img.height - 1, Math.ceil(Math.max(...P.map((p) => p.y)) + o));
    const d = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
    let rs = 0, rn = 0, gs = 0, gn = 0, lit = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dist = inside(x + 0.5, y + 0.5) ? 0 : Math.min(...P.map((a, i) => segDist(x + 0.5, y + 0.5, a, P[(i + 1) % 4])));
        if (dist > o) continue;
        const i = ((y - y0) * (x1 - x0 + 1) + (x - x0)) * 4;
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        if (dist <= n) { rs += l; rn++; if (l > 200) lit++; } else { gs += l; gn++; }
      }
    }
    const runway = rs / rn, ring = gs / gn;
    return {
      runway: Math.round(runway), ring: Math.round(ring), lit, px: rn,
      contrast: +((Math.max(runway, ring) + 12.75) / (Math.min(runway, ring) + 12.75)).toFixed(2),
    };
  }, [png.toString('base64'), quad, inner, outer]);
}

// The bare 3D view around the runway, magnified 4x (attached to the report).
async function shot(page, path) {
  const quad = (await snap(page)).runwayScreen;
  const xs = quad.map((p) => p.x), ys = quad.map((p) => p.y);
  const x = Math.max(0, Math.min(...xs) - 80), y = Math.max(0, Math.min(...ys) - 40);
  const style = await page.addStyleTag({
    content: `body * { visibility: hidden !important; } #simCanvas { visibility: visible !important; }`,
  });
  const clip = { x, y, width: Math.max(...xs) + 80 - x, height: Math.max(...ys) + 40 - y };
  await page.screenshot({ path, clip, scale: 'device' });
  await style.evaluate((el) => el.remove());
}

const PRESETS = ['Dawn', 'Day', 'Dusk', 'Night'];
const MODE = { Dawn: 'Dawn', Day: 'Noon', Dusk: 'Dusk', Night: 'Night' };

async function flyFinal(page, rwy, nm) {
  await page.evaluate(([rwy, nm]) => {
    window.openaeroDebugFinal('KDFW', rwy, nm);
    if (!window.openaeroDebug().paused) document.getElementById('btnPause').click();
  }, [rwy, nm]);
  expect((await snap(page)).activeRunway).toBe(`KDFW_${rwy}`);
}

async function atTime(page, label) {
  await page.evaluate((label) => {
    [...document.querySelectorAll('#timePicker .btnTime')].find((b) => b.textContent.includes(label)).click();
  }, label);
  await expect.poll(async () => (await snap(page)).sun.mode).toBe(MODE[label]);
  // The ground recompiles for the light; then two frames drawn with it.
  await expect.poll(async () => (await snap(page)).sky.cityLights).toBe(label === 'Night' ? 1 : 0);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

for (const rwy of ['35C', '17R']) {
  test(`KDFW ${rwy} from 10 and 3 NM: the runway stands out at dawn, day, dusk and night`, async ({ page }, info) => {
    test.setTimeout(150_000);
    await stubTiles(page);
    await page.route('https://server.arcgisonline.com/**', (route) => route.fulfill({
      status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: URBAN_PNG,
    }));
    await page.goto(`${BASE}?debug`);
    await page.locator('#btnStartFlight').click();
    await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
    await expect.poll(async () => (await snap(page)).sky.runwayLights, { timeout: 15_000 }).toBeGreaterThan(5000);
    for (const nm of [10, 3]) {
      await flyFinal(page, rwy, nm);
      const rows = {};
      for (const label of PRESETS) {
        await atTime(page, label);
        rows[label] = await measure(page);
        if (label === 'Night' || label === 'Day') await shot(page, info.outputPath(`${rwy}-${nm}nm-${label}.png`));
      }
      console.log(`0068 ${rwy} ${nm} NM`, JSON.stringify(rows));
      if (nm === 10) {
        expect(rows.Night.contrast, 'lit runway at night from 10 NM').toBeGreaterThan(2.15);
        expect(rows.Night.lit, 'lit pixels at night from 10 NM').toBeGreaterThan(11);
      } else {
        expect(rows.Night.contrast, 'lit runway at night from 3 NM').toBeGreaterThan(1.9);
        for (const label of ['Dawn', 'Day', 'Dusk']) expect(rows[label].contrast, `${label} from 3 NM`).toBeGreaterThan(1.2);
      }
    }
  });
}
