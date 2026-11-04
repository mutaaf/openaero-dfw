import { test, expect } from './fixtures.js';
import { BASE, stubMetar, collectErrors, TEST_METAR } from './helpers.js';

// Ticket 0100 on a phone (390x844, touch), Kid level, hands off: a crosswind final is flown crabbed
// on the centreline (0097) and Kid's rudder takes the crab out just before the wheels touch, so they
// meet the runway pointing down it. The de-crab's cards are flown headless in
// tests/flight/pattern.test.js and kidFinal.test.js; the desktop flight is in assists.spec.js.
const debug = (page) => page.evaluate(() => window.openaeroDebug());

test.describe(() => {
  // Sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
  test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

  test('phone, Kid hands off in a 15 kt crosswind: crabbed on short final, straight at touchdown', async ({ page }) => {
    test.setTimeout(90_000);
    await page.unroute('**/openaero/api/metar*');
    await stubMetar(page, [{ ...TEST_METAR, wdir: 270, wspd: 15, rawOb: 'METAR KDFW 161953Z 27015KT 10SM FEW250 24/10 A3002' }]);
    const errors = collectErrors(page);
    await page.goto(`${BASE}?debug`);
    await page.locator('.btnAssist[data-assist="kid"]').tap();
    await page.locator('#btnStartFlight').tap();
    await expect(page.locator('#onboardingModal')).toBeHidden();
    await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 0.8));
    expect((await debug(page)).assist).toBe('kid');
    await expect.poll(async () => (await debug(page)).distM, { timeout: 60_000, intervals: [500] }).toBeLessThan(400);
    const short = await debug(page);
    const shortNoseDeg = ((short.headingDeg - short.runwayHdgT + 540) % 360) - 180;
    expect(shortNoseDeg).toBeLessThan(-2); // crabbed into the wind from the left
    const wheels = await page.evaluate(() => new Promise((r) => { const f = () => { const d = window.openaeroDebug(); if (d.onGround) r(d); else requestAnimationFrame(f); }; f(); })); // the first frame on the wheels
    const tdNoseDeg = ((wheels.headingDeg - wheels.runwayHdgT + 540) % 360) - 180;
    console.log(`[0100 phone] short final nose ${shortNoseDeg.toFixed(1)}°, touchdown nose ${tdNoseDeg.toFixed(1)}°, ${wheels.crossM.toFixed(1)} m off`);
    expect(Math.abs(tdNoseDeg)).toBeLessThan(2.5);
    expect(Math.abs(wheels.crossM)).toBeLessThan(8);
    await expect.poll(async () => (await debug(page)).lastLanding, { timeout: 30_000, intervals: [250] }).not.toBeNull();
    expect((await debug(page)).lastLanding.grade).not.toBe('CRASH');
    expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
    expect(errors).toEqual([]);
  });
});
