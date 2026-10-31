import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0123: the HUD's localizer and glideslope fly-to bars read in ILS dots (aero.js ilsDots,
// 30 px a dot, hudLayout.js ilsBarOffsetPx), the scale the 500 ft gate's "1 dot" is judged on.
const PX_PER_DOT = 30;

async function fly(page, mission) {
  await stubTiles(page);
  await page.goto(`${BASE}?debug${mission ? `&mission=${mission}` : ''}`);
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.openaeroDebug().ilsLocBarPx)).not.toBeNull();
}

// The bars' offsets and dots read in one evaluate, with whether the HUD canvas has amber on the
// localizer bar's column and the glideslope bar's row (a dashed line: any of its pixels).
const read = (page) => page.evaluate(() => {
  const s = window.openaeroDebug();
  const c = document.getElementById('hudCanvas');
  const ctx = c.getContext('2d');
  const cx = c.width / 2, cy = c.height / 2;
  const amber = (d) => { for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] > 100 && d[i + 1] < 200 && d[i + 2] < 90) return true; return false; };
  const col = ctx.getImageData(Math.round(cx + s.ilsLocBarPx) - 1, Math.round(cy - 60), 3, 40).data;
  const row = ctx.getImageData(Math.round(cx - 66), Math.round(cy + s.ilsGsBarPx) - 1, 30, 3).data;
  return { ...s, locAmber: amber(col), gsAmber: amber(row) };
});

for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`the default final (${size.width}x${size.height}): both bars sit through the aiming marker, in dots`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(size);
    const errors = collectErrors(page);
    await fly(page);
    const s = await read(page);
    expect(s.mission).toBe('kdfw_35c_final');
    expect(Math.abs(s.ilsLocDots)).toBeLessThan(0.2);
    expect(Math.abs(s.ilsGsDots)).toBeLessThan(0.2);
    // The offset is the dots' and nothing else's: left when right of the centreline, down when high.
    expect(s.ilsLocBarPx).toBeCloseTo(-s.ilsLocDots * PX_PER_DOT, 6);
    expect(s.ilsGsBarPx).toBeCloseTo(s.ilsGsDots * PX_PER_DOT, 6);
    expect(Math.abs(s.ilsLocBarPx)).toBeLessThan(6);
    expect(Math.abs(s.ilsGsBarPx)).toBeLessThan(6);
    expect(s.locAmber).toBe(true);
    expect(s.gsAmber).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('the go-around drill starts one dot high: the glideslope bar sits on the first tick below', async ({ page }) => {
  test.setTimeout(60_000);
  await fly(page, 'go_around_drill');
  const s = await read(page);
  expect(s.mission).toBe('go_around_drill');
  // missions.js highDots: 1, on the gate's own glideslope antenna (abeam the aim point).
  expect(s.ilsGsDots).toBeGreaterThan(0.85);
  expect(s.ilsGsDots).toBeLessThan(1.15);
  expect(s.ilsGsBarPx).toBeGreaterThan(0.85 * PX_PER_DOT);
  expect(s.ilsGsBarPx).toBeLessThan(1.15 * PX_PER_DOT);
  expect(s.gsAmber).toBe(true);
});

test('on the takeoff roll there is no glideslope bar (it would read full-scale fly-up under the path)', async ({ page }) => {
  test.setTimeout(60_000);
  await fly(page, 'kdfw_takeoff');
  const s = await page.evaluate(() => window.openaeroDebug());
  expect(s.mission).toBe('kdfw_takeoff');
  expect(s.ilsGsBarPx).toBeNull();
  expect(Math.abs(s.ilsLocBarPx)).toBeLessThan(6); // lined up on the centreline
});
