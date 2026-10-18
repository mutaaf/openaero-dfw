// Landmarks at their true coordinates (ticket 0010): the tours point you at the real thing.
import { test, expect } from '@playwright/test';
import { stubTiles, enterCockpit, collectErrors } from './helpers.js';
import { DOWNTOWN_DALLAS, ATT_STADIUM } from '../../src/landmarks.js';

test.beforeEach(async ({ page }) => { await stubTiles(page); });

// Degrees between the nose and the bearing to a target (+X east, -Z north).
const offNose = (s, t) => {
  const brg = Math.atan2(t.x - s.pos.x, -(t.z - s.pos.z)) * 180 / Math.PI;
  return ((brg - s.headingDeg + 540) % 360) - 180;
};

for (const [mission, target, name] of [['downtown_skyline', DOWNTOWN_DALLAS, 'downtown Dallas'], ['att_stadium', ATT_STADIUM, 'AT&T Stadium']]) {
  test(`${mission} loads with ${name} within 15° of the nose`, async ({ page }) => {
    const errors = collectErrors(page);
    await enterCockpit(page);
    await page.selectOption('#selScenario', mission);
    // Read the spawn right away: the sim keeps flying (and weathervaning) after load.
    const s = await page.evaluate(() => window.openaeroDebug());
    expect(s.mission).toBe(mission);
    expect(Math.abs(offNose(s, target))).toBeLessThan(15);
    const d = Math.hypot(target.x - s.pos.x, target.z - s.pos.z);
    expect(d).toBeGreaterThan(1500);
    expect(d).toBeLessThan(6000);
    expect(errors).toEqual([]);
  });
}
