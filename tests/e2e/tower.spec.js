// Ticket 0145: the tower clears you to land, once per final, spoken and captioned (src/tower.js, a lazy chunk).
// FAA Order JO 7110.65 3-10-5: the runway number, then "cleared to land"; 2-4-17's wind words; the METAR's wind
// (350° true is 350 magnetic at DFW's 2.7° E, to the nearest 10).
import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, collectErrors, TEST_METAR } from './helpers.js';
import { recordCaptions, overlaps } from './captionHelpers.js';
import { headingBoxTop, HEADING_BOX_H } from '../../src/hudLayout.js';

const WINDY = { ...TEST_METAR, wdir: 350, wspd: 12, wgst: null, rawOb: 'METAR KDFW 162053Z 35012KT 10SM FEW250 24/10 A3002' };
// A long flight down the 4 NM final: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

test('the KDFW 35C 4 NM final: cleared once at ~800 ft with the METAR wind, spoken and captioned clear of the HUD', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, [WINDY]);
  await page.addInitScript(() => {
    window.__spoken = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
  });
  await page.goto(`${BASE}?debug&mission=kdfw_35c_final`);
  await expect(page.locator('#wxBadge')).toHaveText('LIVE METAR');
  await page.locator('.btnAssist[data-assist="kid"]').click(); // hands off down the path
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  await recordCaptions(page);
  const cleared = () => page.evaluate(() => window.__captions.filter((c) => /cleared to land/i.test(c.text)));
  await expect.poll(async () => (await cleared()).length, { timeout: 90_000, intervals: [250] }).toBeGreaterThan(0);
  const c = (await cleared())[0];
  expect(c.text).toBe('Wind 350 at 12 · Runway 35C, cleared to land');
  // At 800 ft above the 35C threshold, on the 3° path (Kid flies it): ~2.3 NM out, not at the 4 NM spawn
  // (the ground under the final dips, so the CG's AGL reads higher than the height above the threshold).
  const NM = 1852;
  expect(c.distM / NM).toBeGreaterThan(2.0);
  expect(c.distM / NM).toBeLessThan(2.6);
  expect(Math.abs(c.heightAbovePathM)).toBeLessThan(30);
  const spoken = await page.evaluate(() => window.__spoken.filter((t) => /cleared to land/.test(t)));
  expect(spoken).toEqual([expect.stringMatching(/^Boeing seven thirty-seven, wind three five zero at one two, runway three five center, cleared to land\.$/)]);
  // Up while it is said (> the 1.2 s of a callout), clear of the heading box and the coach.
  await page.waitForTimeout(1500); // 3 s of sim time
  await expect(page.locator('#calloutCaption')).toContainText(/cleared to land/i);
  const hb = { x: c.w / 2 - 52, y: headingBoxTop(c.h / 2), width: 104, height: HEADING_BOX_H };
  expect(c.rect.width).toBeLessThanOrEqual(260);
  expect(overlaps(c.rect, hb)).toBe(false);
  expect(overlaps(c.rect, c.coach)).toBe(false);
  // On down through 500 ft (under the window): never said again.
  await expect.poll(() => page.evaluate(() => window.openaeroDebug().distM / 1852), { timeout: 60_000 }).toBeLessThan(1.4);
  expect((await cleared()).filter((x, i, a) => i === 0 || !x.text.startsWith(a[i - 1].text))).toHaveLength(1);
  expect(await page.evaluate(() => window.__spoken.filter((t) => /cleared to land/.test(t)).length)).toBe(1);
  expect(errors).toEqual([]);
});

test('sound off still shows the clearance, and a scenario wind says so', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, [], 503); // offline: the scenario weather
  await page.goto(`${BASE}?debug`);
  await page.locator('summary', { hasText: 'Options' }).click();
  await page.locator('#chkAutoSound').uncheck();
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  await recordCaptions(page);
  await page.evaluate(() => window.openaeroDebugFinal('KDFW', '17C', 2.3));
  await expect(page.locator('#calloutCaption')).toContainText(/scenario wind .* runway 17C, cleared to land/i, { timeout: 30_000 });
  expect((await page.evaluate(() => window.openaeroDebug())).audio).toBe('off');
  expect(errors.filter((e) => !e.includes('503'))).toEqual([]); // the METAR stub's own 503
});
