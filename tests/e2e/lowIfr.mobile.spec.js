import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
import { overlaps } from './captionHelpers.js';

// Ticket 0092 on a phone, both ways up (touch, Pilot): the Weather group's card, the HUD wind box's
// LIFR SCN line in its box, and the decision height's coach card (the longest words: Pilot's) on
// screen, clear of the wind box, with no page scroll.
const snap = (page) => page.evaluate(() => window.openaeroDebug());

for (const [w, h] of [[390, 844], [844, 390]]) {
  test(`${w}x${h}: low-ceiling ILS card, LIFR wind box, minimums on the coach card`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await stubTiles(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}?debug&mission=kdfw_35c_low_ifr`);
    await page.locator('#onboardingModal').waitFor({ state: 'visible' });
    const card = page.locator('#missionList section', { has: page.locator('h2', { hasText: /^Weather$/ }) }).locator('[data-scenario="kdfw_35c_low_ifr"]');
    await card.scrollIntoViewIfNeeded();
    await card.tap();
    const box = await card.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect.poll(async () => (await snap(page)).fltCat, { timeout: 10_000 }).toBe('LIFR');
    await page.locator('#btnStartFlight').tap();
    await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
    const s = await snap(page);
    expect(s.hudWind.source).toBe('LIFR SCN');
    expect(s.hudWind.box.w).toBeGreaterThan(0);
    // The trimmed airplane on a 1 NM final, hands off, down through 200 ft.
    await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 1.0, 0, { lowIfr: true }));
    await expect.poll(async () => (await snap(page)).dh?.calls, { timeout: 60_000, intervals: [100] }).toBe(1);
    await expect(page.locator('#txtCoach')).toHaveText(/Minimums: runway lights in sight\? Land\. If not, full power: go around/);
    const coach = await page.locator('#coach').boundingBox();
    expect(coach.x).toBeGreaterThanOrEqual(0);
    expect(coach.y).toBeGreaterThanOrEqual(0);
    expect(coach.x + coach.width).toBeLessThanOrEqual(w);
    expect(coach.y + coach.height).toBeLessThanOrEqual(h);
    const wb = (await snap(page)).hudWind.box;
    expect(overlaps(coach, { x: wb.x, y: wb.y, width: wb.w, height: wb.h })).toBe(false);
    expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
    await page.screenshot({ path: test.info().outputPath(`lowifr-${w}x${h}.png`) });
    expect(errors).toEqual([]);
  });
}
