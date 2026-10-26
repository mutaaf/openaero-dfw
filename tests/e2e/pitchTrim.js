import { expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Static pitch stability (ticket 0090), Pilot, keyboard: in the Cessna drill, trimmed level at
// 90 KIAS, push the nose down and let go. The nose comes back up by itself (before, a released
// stick held the dive). Flown by pitchTrim.spec.js (keyboard) and pitchTrim.mobile.spec.js (touch).
export async function pushAndRelease(page, push, release) {
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(`${BASE}?mission=c172_stall_recovery`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  const spawn = await snap();
  expect(spawn).toMatchObject({ assist: 'pilot', aircraft: 'c172' });
  await push();
  await expect.poll(async () => (await snap()).pitchDeg, { timeout: 20_000 }).toBeLessThan(spawn.pitchDeg - 8);
  await release();
  // Within 25 s of sim time, still in the air: a released stick held the dive (-38° and 200 kt
  // after 20 s) before 0090, and only the crash and respawn brought the nose back.
  const t0 = (await snap()).simTime;
  let s = await snap();
  while (s.pitchDeg <= spawn.pitchDeg - 3 && s.simTime - t0 < 25) {
    await page.waitForTimeout(250);
    s = await snap();
  }
  console.log(`[pitch trim] nose ${s.pitchDeg.toFixed(1)}° ${(s.simTime - t0).toFixed(1)} s sim after the push, ${s.iasKts.toFixed(0)} kt, ${s.aglFt.toFixed(0)} ft`);
  expect(s.pitchDeg).toBeGreaterThan(spawn.pitchDeg - 3);
  expect(s.simTime - t0).toBeLessThan(25);
  expect(s.mission).toBe('c172_stall_recovery');
  expect(s.aglFt).toBeGreaterThan(1500);
  expect(errors).toEqual([]);
}
