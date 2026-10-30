import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
import { recordCaptions, overlaps } from './captionHelpers.js';
import { headingBoxTop, HEADING_BOX_H } from '../../src/hudLayout.js';

// Ticket 0117 on a phone (the `phone` project: touch), upright and held sideways: a real
// callout's caption stays between the tapes and clear of the coach, the banners and the heading box.
for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test.describe(`captions ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });

    test('a callout caption stays clear of the HUD', async ({ page }) => {
      test.setTimeout(90_000);
      await stubTiles(page);
      const errors = collectErrors(page);
      await page.goto(`${BASE}?debug`);
      const start = page.locator('#btnStartFlight');
      await start.scrollIntoViewIfNeeded();
      await start.tap();
      await expect(page.locator('#onboardingModal')).toBeHidden();
      await recordCaptions(page);
      await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 1.1));
      await expect.poll(() => page.evaluate(() => window.__captions.length), { timeout: 45_000 }).toBeGreaterThan(1);
      for (const c of await page.evaluate(() => window.__captions)) {
        const hb = { x: c.w / 2 - 52, y: headingBoxTop(c.h / 2), width: 104, height: HEADING_BOX_H };
        expect(c.rect.width, c.text).toBeLessThanOrEqual(260);
        expect(overlaps(c.rect, hb), `${c.text}: heading box`).toBe(false);
        expect(overlaps(c.rect, c.coach), `${c.text}: coach`).toBe(false);
        expect(overlaps(c.rect, c.master), `${c.text}: banner`).toBe(false);
        expect(overlaps(c.rect, c.stall), `${c.text}: stall banner`).toBe(false);
        // Held sideways, above the horizon box the layout keeps free (35% … 65% of the height).
        if (c.w > c.h) expect(c.rect.y + c.rect.height, c.text).toBeLessThanOrEqual(c.h * 0.35);
      }
      await page.screenshot({ path: test.info().outputPath(`captions-${vp.width}x${vp.height}.png`) });
      expect(errors).toEqual([]);
    });
  });
}
