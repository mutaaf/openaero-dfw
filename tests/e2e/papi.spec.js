import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0131: the PAPI turns at the AC 150/5340-30J setting angles (G +-10', +-30'). The HUD's
// PAPI line, the coach's count and the active runway's four 3D lamps are one reading (airports.js
// papiWhite): sampled on the default final and as the nose is pulled up off the path, they agree.
const TEXT = ['LOW', 'SLIGHTLY LOW', 'ON GLIDESLOPE', 'SLIGHTLY HIGH', 'HIGH'];

test('the HUD PAPI line and the 3D lamps agree on and off the 3° path (0131)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(`${BASE}?debug`);
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  const read = () => page.evaluate(() => {
    const s = window.openaeroDebug();
    return { white: s.papiWhite, lamps: s.papiLampsWhite, text: document.getElementById('txtPapiStatus').textContent, hgt: s.heightAbovePathM, dist: s.distM };
  });
  await expect.poll(async () => (await read()).lamps).not.toBeNull();
  const first = await read();
  // The default final is spawned on the path: two white, two red, everywhere it is shown.
  expect(first).toMatchObject({ white: 2, lamps: 2, text: 'ON GLIDESLOPE' });
  // Pull the nose up: it climbs above the path (more white), then slows and sinks under it (more red).
  const seen = new Set();
  await page.keyboard.down('ArrowUp');
  for (let i = 0; i < 100 && seen.size < 3; i++) {
    const r = await read();
    expect(r.lamps, JSON.stringify(r)).toBe(r.white);
    expect(r.text, JSON.stringify(r)).toBe(TEXT[r.white]);
    seen.add(r.white);
    await page.waitForTimeout(200);
  }
  await page.keyboard.up('ArrowUp');
  expect(seen.has(2) && seen.size >= 3, [...seen].join()).toBe(true);
  expect(errors).toEqual([]);
});
