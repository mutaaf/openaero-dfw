// Ticket 0145 on a phone (the `phone` project: touch), upright and held sideways: the tower's clearance, the longest
// line the caption carries, stays between the tapes and clear of the heading box, the wind box and the coach.
import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
import { recordCaptions, overlaps } from './captionHelpers.js';
import { headingBoxTop, HEADING_BOX_H, windBoxRect } from '../../src/hudLayout.js';

for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test.describe(`tower clearance ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });

    test('the clearance caption fits and stays clear of the HUD', async ({ page }) => {
      test.setTimeout(60_000);
      await stubTiles(page);
      const errors = collectErrors(page);
      await page.goto(`${BASE}?debug`);
      const start = page.locator('#btnStartFlight');
      await start.scrollIntoViewIfNeeded();
      await start.tap();
      await expect(page.locator('#onboardingModal')).toBeHidden();
      await recordCaptions(page);
      await page.evaluate(() => window.openaeroDebugFinal('KDFW', '18L', 2.3));
      await expect(page.locator('#calloutCaption')).toContainText(/runway 18L, cleared to land/i, { timeout: 30_000 });
      const caps = (await page.evaluate(() => window.__captions)).filter((c) => /cleared to land/i.test(c.text));
      expect(caps.length).toBeGreaterThan(0);
      for (const c of caps) {
        const hb = { x: c.w / 2 - 52, y: headingBoxTop(c.h / 2), width: 104, height: HEADING_BOX_H };
        expect(c.rect.width, c.text).toBeLessThanOrEqual(248);
        expect(c.rect.x).toBeGreaterThanOrEqual(0);
        expect(c.rect.x + c.rect.width).toBeLessThanOrEqual(c.w);
        expect(overlaps(c.rect, hb), `${c.text}: heading box`).toBe(false);
        const wb = windBoxRect(c.w, c.h);
        expect(overlaps(c.rect, { x: wb.x, y: wb.y, width: wb.w, height: wb.h }), `${c.text}: wind box`).toBe(false);
        expect(overlaps(c.rect, c.coach), `${c.text}: coach`).toBe(false);
      }
      expect(errors).toEqual([]);
    });
  });
}
