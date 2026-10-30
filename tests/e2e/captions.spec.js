import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';
import { recordCaptions, overlaps } from './captionHelpers.js';
import { headingBoxTop, HEADING_BOX_H, windBoxRect } from '../../src/hudLayout.js';

// Ticket 0117: every spoken callout is captioned on screen, with the sound off too.
// A long flight: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

test('sound off, a final to the runway captions each GPWS height once, in order, clear of the HUD', async ({ page }) => {
  test.setTimeout(150_000);
  await stubTiles(page);
  const errors = collectErrors(page);
  await page.goto(`${BASE}?debug`);
  await page.locator('.btnAssist[data-assist="kid"]').click();
  await page.locator('summary', { hasText: 'Options' }).click();
  await page.locator('#chkAutoSound').uncheck();
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  await recordCaptions(page);
  await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 1.3));
  // Kid flies it down hands off; the line shows each call as it is passed (speech is stubbed and never started).
  await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).lastLanding, { timeout: 90_000, intervals: [250] })
    .not.toBeNull();
  expect((await page.evaluate(() => window.openaeroDebug())).audio).toBe('off');
  const caps = await page.evaluate(() => window.__captions);
  const heights = caps.map((c) => c.text.split(' · ')[0]);
  // From 1.3 NM down: each height once, in order (no "fifty" again after "forty"). No "ten" on
  // the 737: sim.aglFt is the CG's height, ~11 ft over the runway at touchdown (ticket 0122).
  expect(heights.slice(heights.indexOf('four hundred'), heights.indexOf('twenty') + 1)).toEqual(
    ['four hundred', 'three hundred', 'two hundred', 'one hundred', 'fifty', 'forty', 'thirty', 'twenty']);
  expect(new Set(heights).size).toBe(heights.length);
  // Shown, then gone ~1.2 s later.
  await expect(page.locator('#calloutCaption')).toBeHidden({ timeout: 5_000 });
  // Between the tapes, under the heading box, clear of the coach and the alert banners.
  for (const c of caps) {
    const hb = { x: c.w / 2 - 52, y: headingBoxTop(c.h / 2), width: 104, height: HEADING_BOX_H };
    expect(c.rect.width, c.text).toBeLessThanOrEqual(260);
    expect(overlaps(c.rect, hb), `${c.text}: heading box`).toBe(false);
    const wb = windBoxRect(c.w, c.h);
    expect(overlaps(c.rect, { x: wb.x, y: wb.y, width: wb.w, height: wb.h }), `${c.text}: wind box`).toBe(false);
    expect(overlaps(c.rect, c.coach), `${c.text}: coach`).toBe(false);
    expect(overlaps(c.rect, c.master), `${c.text}: banner`).toBe(false);
    expect(overlaps(c.rect, c.stall), `${c.text}: stall banner`).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('the caption reads at 4.5:1 over the brightest ground or sky', async ({ page }) => {
  await stubTiles(page);
  await page.goto(`${BASE}?debug`);
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 1.1));
  await expect(page.locator('#calloutCaption')).toBeVisible({ timeout: 30_000 });
  expect(await lowContrastLabels(page, '#calloutCaption', { backdrop: [255, 255, 255] })).toEqual([]);
});
