import { test, expect } from './fixtures.js';
import { stubTiles, enterCockpit, collectErrors } from './helpers.js';

const snap = (page) => page.evaluate(() => window.openaeroDebug());
const FT = 0.3048;

test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('the elevation grid loads and the streamed imagery sharpens under the aircraft', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  await expect.poll(async () => (await snap(page)).terrain.demLoaded, { timeout: 20_000 }).toBe(true);
  // On a 4 NM final at ~1,300 ft the finest imagery (z16, ~2 m/px) is drawn near the aircraft.
  await expect.poll(async () => (await snap(page)).terrain.finestZoom, { timeout: 20_000 }).toBeGreaterThanOrEqual(15);
  const t = (await snap(page)).terrain;
  expect(t.drawn).toBeGreaterThan(10);
  expect(t.failed).toBe(0);
  expect(errors).toEqual([]);
});

test('every field sits at its real elevation: takeoff at DFW, finals at Love Field and Alliance', async ({ page }) => {
  await enterCockpit(page);
  await expect.poll(async () => (await snap(page)).terrain.demLoaded, { timeout: 20_000 }).toBe(true);

  await page.selectOption('#selScenario', 'kdfw_takeoff');
  await page.waitForTimeout(300);
  let s = await snap(page);
  expect(s.onGround).toBe(true);
  expect(s.aglFt).toBeLessThan(15);
  // 35C is surveyed at 562 ft: ~13 m below the y = 0 reference (KDFW's 606 ft).
  expect(s.groundY).toBeCloseTo((562 - 606) * FT, 0);
  expect(Math.abs(s.mslFt - 562)).toBeLessThan(20);

  // Love Field is ~40 m lower than DFW, Alliance ~20–35 m higher: the 3° path starts at
  // each field's own height, and MSL reads accordingly.
  for (const [mission, fieldFt] of [['kdal_31r_final', 487], ['kafw_34l_final', 665]]) {
    await page.selectOption('#selScenario', mission);
    await page.waitForTimeout(300);
    s = await snap(page);
    expect(Math.abs(s.heightAbovePathM), mission).toBeLessThan(5);
    const pathFt = (s.distM + 305) * Math.tan(3 * Math.PI / 180) / FT;
    expect(Math.abs(s.mslFt - (fieldFt + pathFt)), `${mission} MSL ${s.mslFt}`).toBeLessThan(40);
  }
});

test('the aircraft can roll and sit on a runway that is not at y = 0', async ({ page }) => {
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdfw_takeoff');
  await page.waitForTimeout(2000);
  const s = await snap(page);
  expect(s.onGround).toBe(true);
  expect(s.pos.y - s.groundY).toBeGreaterThan(0.5); // resting on its gear, not sunk in or floating
  expect(s.pos.y - s.groundY).toBeLessThan(4);
});
