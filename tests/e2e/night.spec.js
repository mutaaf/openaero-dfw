import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, enterCockpit, FULL_RES } from './helpers.js';

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

// Ticket 0060: night and dusk missions bring their own sky for their run, then give the
// player's When? choice back.
const pressed = (page, label) => page.locator('#timePicker .btnTime', { hasText: label });

test('the KDFW 35C night ILS flies at night with the lights showing, and the next mission gives When? back (0060)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${BASE}?debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  // The player's own choice first: Dusk.
  await pressed(page, 'Dusk').click();
  await page.locator('#missionList .btnMission[data-scenario="kdfw_35c_night"]').click();
  await expect.poll(async () => (await snap(page)).sun.mode).toBe('Night');
  await expect(pressed(page, 'Night')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  expect((await snap(page)).mission).toBe('kdfw_35c_night');
  await expect.poll(async () => (await snap(page)).sky.runwayLights, { timeout: 15_000 }).toBeGreaterThan(5000);
  // Same threshold as the 0011 test (~850 lit vs ~130 from the PAPIs alone at 1280x720),
  // and the control: with the runway lights' materials off, the count drops below it.
  await expect.poll(async () => (await band(page, 0.5, 0.62)).bright, { timeout: 15_000 }).toBeGreaterThan(450);
  await page.evaluate(() => { window.openaeroRunwayLights.points.traverse((o) => { if (o.material) o.material.visible = false; }); });
  await expect.poll(async () => (await band(page, 0.5, 0.62)).bright, { timeout: 10_000 }).toBeLessThan(450);
  await page.evaluate(() => { window.openaeroRunwayLights.points.traverse((o) => { if (o.material) o.material.visible = true; }); });

  // The next mission without a sky of its own gives the player's Dusk back.
  await page.locator('#btnOpenMissions').click();
  await page.locator('#missionList .btnMission[data-scenario="kdfw_35c_final"]').click();
  await expect.poll(async () => (await snap(page)).sun.mode).toBe('Dusk');
  await expect(pressed(page, 'Dusk')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('the KDAL 31R dusk final flies at dusk; a When? pick during it is the player\'s to keep (0060)', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#missionList .btnMission[data-scenario="kdal_31r_dusk"]').click();
  await expect.poll(async () => (await snap(page)).sun.mode).toBe('Dusk');
  await expect(pressed(page, 'Dusk')).toHaveAttribute('aria-pressed', 'true');
  // The player picks Day while on it: that is theirs now, the next mission keeps it.
  await pressed(page, 'Day').click();
  // A reload of the same mission (the METAR refresh, an assist change, FLY AGAIN) keeps it.
  await page.evaluate(() => document.querySelector('#selScenario').dispatchEvent(new Event('change')));
  expect((await snap(page)).sun.mode).toBe('Noon');
  await expect(pressed(page, 'Day')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#missionList .btnMission[data-scenario="kdal_31r_final"]').click();
  await expect.poll(async () => (await snap(page)).mission).toBe('kdal_31r_final');
  expect((await snap(page)).sun.mode).toBe('Noon');
});
