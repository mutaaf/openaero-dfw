import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0128: a red band on the speed tape from its bottom up to the 1 g stall speed for the
// flaps (amber up to 1.1 Vs). Kid has none.
const snap = (page) => page.evaluate(() => window.openaeroDebug());

async function fly(page, assist) {
  await stubTiles(page);
  await page.goto(`${BASE}?debug`);
  await page.locator(`.btnAssist[data-assist="${assist}"]`).click();
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
}

// The HUD canvas pixel in the band's column (x - 7 … x - 4 of the speed tape at cx - 131) at the
// speed `mul` × (the stall speed, or the IAS with `of: 'ias'`) + `add` (2 px per kt from the box),
// read in the same evaluate as the IAS.
const bandPixel = (page, { of = 'stall', mul = 1, add = 0 }) => page.evaluate(([o, m, a]) => {
  const c = document.getElementById('hudCanvas');
  const s = window.openaeroDebug();
  const kts = (o === 'ias' ? s.iasKts : s.stallKts) * m + a;
  const x = Math.round(c.width / 2 - 131 - 6), y = Math.round(c.height / 2 + (s.iasKts - kts) * 2);
  return [...c.getContext('2d').getImageData(x, y, 1, 1).data];
}, [of, mul, add]);

const isRed = ([r, g, b]) => r > 180 && g < 110 && b < 110;

for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`Learner on the 737's default final (${size.width}x${size.height}): the red band ends at the flaps-30 stall speed, under the box`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(size);
    const errors = collectErrors(page);
    await fly(page, 'learner');
    await expect.poll(async () => (await snap(page)).stallKts).not.toBeNull();
    const s = await snap(page);
    expect(s.mission).toBe('kdfw_35c_final');
    // The model's own 1 g stall at flaps 30 (tests/flight/b738.test.js flies it): ~122 kt.
    expect(s.stallKts).toBeGreaterThan(118);
    expect(s.stallKts).toBeLessThan(126);
    expect(s.iasKts - s.stallKts).toBeLessThan(42); // 3 kt under Vs is still on the tape's 45 kt
    // Red 3 kt under the stall speed, amber just over it, the tape's own colour well above 1.1 Vs.
    expect(isRed(await bandPixel(page, { add: -3 }))).toBe(true);
    const amber = await bandPixel(page, { mul: 1.05 });
    expect(amber[0]).toBeGreaterThan(180);
    expect(amber[1]).toBeGreaterThan(100);
    expect(amber[2]).toBeLessThan(90);
    expect(isRed(await bandPixel(page, { mul: 1.1, add: 5 }))).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('Kid has no low-speed band', async ({ page }) => {
  test.setTimeout(60_000);
  await fly(page, 'kid');
  const s = await snap(page);
  expect(s.stallKts).toBeNull();
  expect(isRed(await bandPixel(page, { of: 'ias', add: -30 }))).toBe(false);
});
