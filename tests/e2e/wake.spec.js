import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, collectErrors } from './helpers.js';
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

// Wake turbulence (ticket 0115): the deep link opens the lesson's briefing in the KDFW group. Behind the start screen
// no jet flies; once the player starts, the traffic 737 (traffic.js) appears ahead on the player's own runway, 35C,
// the coach says to stay at or above its path, then (once it lands) that Kid's plane will land past it. Kid's guide
// flies a path past that point and the card grades the landing clear of the wake. The grade's rules are unit-tested
// (tests/unit/wake.test.js) and the paths flown headless (tests/flight/wake.test.js, kidFinal.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); await stubMetar(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());
const traffic = (page) => page.evaluate(() => window.openaeroTraffic?.() ?? null);

test('?mission=kdfw_35c_wake on Kid: the jet lands ahead on 35C, the coach says so, Kid lands beyond it', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?mission=kdfw_35c_wake&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const card = page.locator('#missionList section', { hasText: 'KDFW' }).locator('[data-scenario="kdfw_35c_wake"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#onboardingModal')).toContainText(/No real wake will push you/);
  await expect.poll(async () => (await snap(page)).wake?.end, { timeout: 10_000 }).toBe('KDFW_35C');
  const spawn = await snap(page);
  expect(spawn).toMatchObject({ mission: 'kdfw_35c_wake', aircraft: 'c172', activeRunway: 'KDFW_35C' });
  expect(spawn.wake.spawned).toBe(false); // nothing flies behind the start screen
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await traffic(page))?.jet?.endId, { timeout: 15_000 }).toBe('KDFW_35C');
  const [t, me] = await Promise.all([traffic(page), snap(page)]);
  expect(t.jet.distNm).toBeLessThan(me.distM / 1852 - 1); // ahead of the player on the same final
  await expect(page.locator('#txtCoach')).toHaveText(/A jet is landing ahead/, { timeout: 10_000 });
  await expect.poll(async () => (await traffic(page))?.visible, { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path: test.info().outputPath('wake-jet-1280.png') });
  // It lands (~70 s of sim time from 3 NM) and the coach says so (Kid's words: its plane lands past it).
  await expect(page.locator('#txtCoach')).toHaveText(/The jet touched down: your plane will land past it/, { timeout: 60_000 });
  const td = (await snap(page)).wake.tdAlongM;
  expect(td).toBeGreaterThan(300);
  expect(td).toBeLessThan(915);
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('#resultsCard')).toContainText(/Past the jet's touchdown/);
  await expect(page.locator('#resultsCard')).toContainText(/clear of its wake/);
  await page.screenshot({ path: test.info().outputPath('wake-card-1280.png') });
  expect(errors).toEqual([]);
});
