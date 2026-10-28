import { test, expect } from './fixtures.js';
import { stubTiles, stubMetar, enterCockpit, lowContrastLabels, TEST_METAR } from './helpers.js';
// A long flight: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Stabilized-approach gate (ticket 0020): evaluated once at 500 ft above the runway in VMC
// (1,000 ft in IMC), recorded on the landing and shown on the results card.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('the recommended final on autoland passes the 500 ft gate and the card says so', async ({ page }) => {
  test.setTimeout(300_000);
  await enterCockpit(page);
  expect((await snap(page)).mission).toBe('kdfw_35c_final');
  expect((await snap(page)).stabilizedGate).toBeNull();
  await page.click('#btnApApr');
  await expect.poll(async () => (await snap(page)).stabilizedGate, { timeout: 150_000 }).not.toBeNull();
  const gate = (await snap(page)).stabilizedGate;
  expect(gate).toMatchObject({ gateHeight: 500, stable: true, failing: [], runway: 'KDFW_35C' });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtStabilized')).toHaveText('Stabilized at 500 ft ✓');
  expect((await snap(page)).lastLanding.stabilized).toBe(true);
  expect(await lowContrastLabels(page, '#resultsCard')).toEqual([]);
  // Save data is unchanged: openaero_best stays { v: 1, missions: { key: { score, grade, at } } }.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best') || 'null'));
  if (stored) {
    expect(stored.v).toBe(1);
    expect(Object.keys(stored.missions.kdfw_35c_final).sort()).toEqual(['at', 'grade', 'score']);
  }
});

test('a fast, steep approach is called unstabilized at the gate', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    // A queue like the real one: cancel() drops whatever has not finished speaking yet.
    window.__spoken = [];
    window.__cancelled = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
    window.speechSynthesis.cancel = () => { window.__cancelled.push(window.__spoken[window.__spoken.length - 1]); };
  });
  await enterCockpit(page);
  // Full power and the nose pushed down from the 4 NM final: well over Vref+20 by 500 ft.
  await page.locator('#rngThrottle').fill('100');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await snap(page)).pitchDeg, { timeout: 20_000 }).toBeLessThan(-6);
  await page.keyboard.up('KeyW');
  // Keep it there: a stable airplane (0090) lifts its nose back towards its trim when the stick
  // is let go, so the pilot holds a -8° dive with taps of W, as a player would, until the gate
  // (a shallower dive sinks too slowly: the 400 ft call comes > 2.5 s after the gate and cuts it).
  let s = await snap(page);
  for (const until = Date.now() + 90_000; !s.stabilizedGate && Date.now() < until; s = await snap(page)) {
    if (s.pitchDeg > -8) { await page.keyboard.down('KeyW'); await page.waitForTimeout(80); await page.keyboard.up('KeyW'); }
    await page.waitForTimeout(100);
  }
  expect(s.stabilizedGate).not.toBeNull();
  expect(s.stabilizedGate.stable).toBe(false);
  expect(s.stabilizedGate.failing).toContain('FAST');
  expect(s.stabilizedGate.iasKt).toBeGreaterThan(136 + 30); // measured at the gate
  await expect.poll(() => page.evaluate(() => window.__spoken), { timeout: 10_000 }).toContain('unstabilized, go around');
  // The next altitude callout comes within a second or two of the gate: it must queue, not cut it off.
  await expect.poll(() => page.evaluate(() => window.__spoken.slice(window.__spoken.indexOf('unstabilized, go around') + 1).length),
    { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__cancelled)).not.toContain('unstabilized, go around');
});

test('under a 800 ft ceiling the gate moves up to 1,000 ft', async ({ page }) => {
  test.setTimeout(150_000);
  await stubMetar(page, [{ ...TEST_METAR, rawOb: 'METAR KDFW 161953Z 18005KT 4SM BR OVC008 18/16 A3002',
    visib: '4', clouds: [{ cover: 'OVC', base: 800 }], fltCat: 'IFR' }]);
  await enterCockpit(page);
  await expect.poll(async () => (await snap(page)).wxLive, { timeout: 20_000 }).toBe(true);
  await page.click('#btnApApr');
  await expect.poll(async () => (await snap(page)).stabilizedGate, { timeout: 90_000 }).not.toBeNull();
  const s = await snap(page);
  expect(s.stabilizedGate.gateHeight).toBe(1000);
  expect(s.stabilizedGate.stable).toBe(true);
  // Evaluated at the gate: the aircraft is still near 1,000 ft above the runway, not at 500.
  expect(s.aglFt).toBeGreaterThan(800);
});

test('the 1 NM flare challenge starts below the gate: no verdict, no card row', async ({ page }) => {
  test.setTimeout(150_000);
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdfw_35c_flare');
  await page.click('#btnApApr');
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtStabilized')).toBeHidden();
  const s = await snap(page);
  expect(s.stabilizedGate).toBeNull();
  expect(s.lastLanding.stabilized).toBeNull();
});
