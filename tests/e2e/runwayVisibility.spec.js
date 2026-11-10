import { test, expect } from './fixtures.js';
import { stubTiles, BASE, FULL_RES, measureRunway as measure } from './helpers.js';

// Ticket 0068: can you find the runway from a long final? For 35C and 17R from 10 NM at
// each sun preset, and from 3 NM at Night and Day: the runway region (approach lights' outer end to the far end, 1 px
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
  test(`KDFW ${rwy} from 10 and 3 NM: the runway stands out at dawn, day, dusk and night`, async ({ page }) => {
    test.setTimeout(240_000); // CI's SwiftShader at full resolution: ~2.5x a laptop
    await stubTiles(page);
    await page.route('https://server.arcgisonline.com/**', (route) => route.fulfill({
      status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: URBAN_PNG,
    }));
    await page.goto(`${BASE}?debug`);
    await page.locator('#btnStartFlight').click();
    await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
    await expect.poll(async () => (await snap(page)).sky.runwayLights, { timeout: 15_000 }).toBeGreaterThan(5000);
    // 10 NM at every preset, then 3 NM at Night (no switch) and Day: each switch recompiles
    // the ground, the slow part on CI.
    const far = {}, near = {};
    await flyFinal(page, rwy, 10);
    for (const label of PRESETS) {
      await atTime(page, label);
      far[label] = await measure(page);
    }
    await flyFinal(page, rwy, 3);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    near.Night = await measure(page);
    await atTime(page, 'Day');
    near.Day = await measure(page);
    console.log(`0068 ${rwy} 10 NM`, JSON.stringify(far));
    console.log(`0068 ${rwy} 3 NM`, JSON.stringify(near));
    expect(far.Night.contrast, 'lit runway at night from 10 NM').toBeGreaterThan(2.15);
    expect(far.Night.lit, 'lit pixels at night from 10 NM').toBeGreaterThan(11);
    expect(near.Night.contrast, 'lit runway at night from 3 NM').toBeGreaterThan(1.9);
    expect(near.Day.contrast, 'by day from 3 NM').toBeGreaterThan(1.2);
  });
}
