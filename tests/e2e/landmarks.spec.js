// Landmarks at their true coordinates (ticket 0010): the tours point you at the real thing.
import { test, expect } from '@playwright/test';
import { stubTiles, enterCockpit, collectErrors } from './helpers.js';
import { LANDMARKS, landmarkPos, DOWNTOWN_DALLAS, ATT_STADIUM } from '../../src/landmarks.js';
import { missionByKey } from '../../src/missions.js';

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
    const spawn = missionByKey(mission).pos;
    expect(Math.hypot(s.pos.x - spawn[0], s.pos.z - spawn[2])).toBeLessThan(400); // ~0.5–2 s of flight at 108 m/s; old spawns were km off
    expect(Math.abs(offNose(s, target))).toBeLessThan(15);
    const d = Math.hypot(target.x - s.pos.x, target.z - s.pos.z);
    expect(d).toBeGreaterThan(1500);
    expect(d).toBeLessThan(6000);
    expect(errors).toEqual([]);
  });
}

test('every landmark model stands at its true position on its own ground', async ({ page }) => {
  await enterCockpit(page);
  // The DEM loads after boot and re-seats the landmarks; wait for it.
  await expect.poll(() => page.evaluate(() => window.openaeroDebug().terrain?.demLoaded)).toBe(true);
  const placed = (await page.evaluate(() => window.openaeroDebug())).landmarks;
  for (const key of Object.keys(LANDMARKS)) {
    const want = landmarkPos(key), got = placed[key];
    expect(got, key).toBeTruthy();
    expect(Math.hypot(got.x - want.x, got.z - want.z), key).toBeLessThan(1);
    expect(Math.abs(got.seatY - got.groundY), key).toBeLessThan(0.5);
  }
});
