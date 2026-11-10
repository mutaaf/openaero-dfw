// Ambient traffic (ticket 0080, src/traffic.js): on the default 4 NM final into 35C a 737 appears on
// the parallel final ahead, drawn with the twin-jet model, never on the player's runway or within
// 1 NM; none away from DFW. ?debug publishes the jet's state as window.openaeroTraffic.
import { test, expect } from './fixtures.js';
import { stubTiles, stubMetar, collectErrors, BASE } from './helpers.js';

const NM = 1852;

test.beforeEach(async ({ page }) => {
  await stubTiles(page);
  await stubMetar(page);
});

async function fly(page, query = '') {
  await page.goto(`${BASE}?debug${query}`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
}

test('the default final: a 737 on the parallel final ahead, on its own runway, over 1 NM away, with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await fly(page);
  await expect.poll(() => page.evaluate(() => window.openaeroTraffic?.().visible ?? false), { timeout: 20_000 }).toBe(true);
  const [t, me] = await page.evaluate(() => [window.openaeroTraffic(), window.openaeroDebug()]);
  expect(t.model).toBe(true);
  expect(t.jet.endId).toBe('KDFW_35R');
  expect(me.activeRunway).toBe('KDFW_35C');
  expect(t.jet.distNm).toBeLessThan(me.distM / NM); // ahead of the player
  const d = Math.hypot(t.jet.pos.x - me.pos.x, t.jet.pos.y - me.pos.y, t.jet.pos.z - me.pos.z);
  expect(d).toBeGreaterThan(NM);
  // It flies: closer to its runway a few seconds on, descending on its final.
  await expect.poll(async () => (await page.evaluate(() => window.openaeroTraffic().jet?.distNm ?? 0)), { timeout: 15_000 }).toBeLessThan(t.jet.distNm - 0.1);
  const t2 = await page.evaluate(() => window.openaeroTraffic());
  expect(t2.jet.pos.y).toBeLessThan(t.jet.pos.y);
  expect(t2.jet.iasKts).toBeGreaterThan(130);
  expect(errors).toEqual([]);
});

test('no traffic away from DFW (a Love Field final)', async ({ page }) => {
  await fly(page, '&mission=kdal_31r_final');
  // The chunk loads on every flight; on a Love Field final it never places a jet.
  await expect.poll(() => page.evaluate(() => typeof window.openaeroTraffic), { timeout: 15_000 }).toBe('function');
  await page.waitForTimeout(7000); // past the first spawn time (FIRST_SPAWN_S, 5 s of flight)
  const t = await page.evaluate(() => window.openaeroTraffic());
  expect(t.jet).toBeNull();
  expect(t.spawned).toBe(0);
});
