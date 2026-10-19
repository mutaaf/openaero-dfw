import { test, expect } from '@playwright/test';
import { stubTiles, stubMetar, enterCockpit, TEST_METAR } from './helpers.js';

// Stabilized-approach gate (ticket 0020): evaluated once at 500 ft above the runway in VMC
// (1,000 ft in IMC), recorded on the landing and shown on the results card.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('the recommended final on autoland passes the 500 ft gate and the card says so', async ({ page }) => {
  test.setTimeout(240_000);
  await enterCockpit(page);
  expect((await snap(page)).mission).toBe('kdfw_35c_final');
  expect((await snap(page)).stabilizedGate).toBeNull();
  await page.click('#btnApApr');
  await expect.poll(async () => (await snap(page)).stabilizedGate, { timeout: 150_000 }).not.toBeNull();
  const gate = (await snap(page)).stabilizedGate;
  expect(gate).toEqual({ gateHeight: 500, stable: true, failing: [] });
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtStabilized')).toHaveText('Stabilized at 500 ft ✓');
  expect((await snap(page)).lastLanding.stabilized).toBe(true);
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
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
    window.speechSynthesis.cancel = () => {};
  });
  await enterCockpit(page);
  // Full power and the nose pushed down from the 4 NM final: well over Vref+20 by 500 ft.
  await page.locator('#rngThrottle').fill('100');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await snap(page)).pitchDeg, { timeout: 20_000 }).toBeLessThan(-6);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => (await snap(page)).stabilizedGate, { timeout: 90_000 }).not.toBeNull();
  const s = await snap(page);
  expect(s.stabilizedGate.stable).toBe(false);
  expect(s.stabilizedGate.failing).toContain('FAST');
  expect(s.iasKts).toBeGreaterThan(136 + 30);
  await expect.poll(() => page.evaluate(() => window.__spoken), { timeout: 10_000 }).toContain('unstabilized');
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
