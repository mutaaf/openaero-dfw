import { expect } from './fixtures.js';
import { stubTiles, collectErrors, enterCockpit } from './helpers.js';

// Ticket 0121: the F-16's fly-by-wire limits a full pull (NASA TP-1538 App. A, Fig. 63: 9 g, less as
// α passes 15°, 1 g at ~25°; src/fbw.js), and the HUD's G-LOAD is the seat's load factor (the body
// up axis), not the world-vertical acceleration. In Pilot, on the default final (~140 kt, slow
// enough that the AoA limit binds before the g limit), full back stick for 12 s as it slows: α stops at ~25°
// (≤ 27°: before 0121 it ran through it to 90°), and the readout climbs
// past 1.3 g. Flown by fbwLimit.spec.js (keyboard) and fbwLimit.mobile.spec.js (touch).
export async function fullPullF16(page, pull, release) {
  const errors = collectErrors(page);
  await stubTiles(page);
  await enterCockpit(page);
  await page.evaluate(() => {
    const sel = document.getElementById('selAircraft');
    sel.value = 'f16';
    sel.dispatchEvent(new Event('change'));
  });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  await expect.poll(async () => (await snap()).aircraft).toBe('f16');
  expect((await snap()).assist).toBe('pilot');
  // Every frame: the highest α and the highest G-LOAD the HUD printed.
  await page.evaluate(() => {
    const s = (window.__pull = { maxAoa: -90, maxG: 0, frames: 0, on: true });
    const tick = () => {
      const d = window.openaeroDebug();
      s.maxAoa = Math.max(s.maxAoa, d.aoaDeg);
      s.maxG = Math.max(s.maxG, parseFloat(document.getElementById('txtGLoad').textContent));
      s.frames++;
      if (s.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const t0 = (await snap()).simTime;
  await pull();
  await expect.poll(async () => (await snap()).simTime - t0, { timeout: 30_000 }).toBeGreaterThan(12);
  await release();
  const r = await page.evaluate(() => { window.__pull.on = false; return window.__pull; });
  const s = await snap();
  console.log(`[fbw] max α ${r.maxAoa.toFixed(1)}°, max G-LOAD ${r.maxG.toFixed(2)}, ${r.frames} frames, ${s.iasKts.toFixed(0)} kt ${s.aglFt} ft`);
  // ≤ 27°: the limiter's 25° and a transient (the wing lifts to ~35°, 0066). The ticket's ≤ 26° is the headless card (tests/flight/f16.test.js,
  // still air); here the METAR's gusts ride on it (measured 25.4-25.9°; before 0121, 89.9°).
  expect(r.maxAoa).toBeLessThanOrEqual(27);
  expect(r.maxAoa).toBeGreaterThan(15); // the pull reached the limit, not a stick that never moved
  expect(r.maxG).toBeGreaterThan(1.3);
  expect(r.maxG).toBeLessThan(9.5);
  expect(errors).toEqual([]);
}
