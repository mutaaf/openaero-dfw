import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, TEST_METAR } from './helpers.js';

// Ticket 0208: an in-air mission spawns at its kias through the air (main.js loadScenario adds the wind at the spawn's
// height to the velocity along the heading), so the slow-flight drill (heading 360, 95 KIAS) opens at 95 KIAS in a
// 25 kt tailwind and headwind alike. Spawned over the ground, the tailwind would read ~70 and the headwind ~120.
// The METAR's turbulence (a steady 25 kt is σ_w ~1.2 m/s) moves the needle a knot or two, so the reading is a median.
const snap = (page) => page.evaluate(() => window.openaeroDebug());
const metar = (dir, kt) => ({ ...TEST_METAR, wdir: dir, wspd: kt, wgst: null, rawOb: `METAR KDFW 161953Z ${String(dir).padStart(3, '0')}${kt}KT 10SM FEW250 24/10 A3002` });

for (const [label, dir, gsSign] of [['tailwind', 180, 1], ['headwind', 360, -1]]) {
  test(`?mission=c172_slow_flight in a 25 kt ${label}: the drill opens at 95 KIAS, the wind in the ground speed`, async ({ page }) => {
    await stubTiles(page);
    await page.unroute('**/openaero/api/metar*');
    await stubMetar(page, [metar(dir, 25)]);
    await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"pilot","at":0}'));
    await page.goto(`${BASE}?mission=c172_slow_flight`);
    await page.locator('#onboardingModal').waitFor({ state: 'visible' });
    await expect.poll(async () => (await snap(page)).hudWind?.source, { timeout: 10_000 }).toBe('METAR WIND');
    await expect.poll(async () => (await snap(page)).slowFlight?.phase, { timeout: 10_000 }).toBe('wait');
    const ias = [], gs = [];
    for (let i = 0; i < 5; i++) {
      const s = await snap(page);
      ias.push(s.iasKts); gs.push(s.gsKts);
      await page.waitForTimeout(200);
    }
    const median = (a) => [...a].sort((x, y) => x - y)[2];
    expect(Math.abs(median(ias) - 95)).toBeLessThan(3);
    // The ground speed carries the wind (TAS ~102 kt at 5,100 ft MSL ± ~25 kt).
    expect(gsSign * (median(gs) - median(ias))).toBeGreaterThan(15);
  });
}
