import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';

// Go-around drill (ticket 0047): spawned 20 kt fast and a dot high on the 35C final, the
// 500 ft gate calls "unstabilized, go around", and the climb away is graded.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

async function startDrill(page) {
  await page.goto(`${BASE}?mission=go_around_drill`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  // Read the spawn right after the mission loads, before the sim runs on (lesson 2026-10-18).
  const s = await snap(page);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  return s;
}

test('fly the drill: the gate calls it, full power and climb, the card says go-around complete', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  const spawn = await startDrill(page);
  expect(spawn.mission).toBe('go_around_drill');
  expect(spawn.activeRunway).toBe('KDFW_35C');
  // 1 glideslope dot (0.35°) high at 4 NM is ~47 m; the normal final spawns on the path.
  expect(spawn.heightAbovePathM).toBeGreaterThan(35);
  expect(spawn.heightAbovePathM).toBeLessThan(60);
  // Hands off, the airplane keeps its fast, high path down to the gate.
  await expect.poll(async () => (await snap(page)).stabilizedGate, { timeout: 120_000 }).not.toBeNull();
  const gate = (await snap(page)).stabilizedGate;
  expect(gate.stable).toBe(false);
  expect(gate.failing).toContain('FAST');
  expect((await snap(page)).goAround.phase).toBe('goAround');
  await expect(page.locator('#txtCoach')).toHaveText(/Go around! Full power/, { timeout: 5_000 });
  // Full power, nose up until it climbs, flaps up a notch (F raises it in the go-around).
  await page.locator('#rngThrottle').fill('100');
  const flapsBefore = (await snap(page)).flapsIndex;
  await page.keyboard.down('KeyS');
  await expect.poll(async () => (await snap(page)).pitchDeg, { timeout: 20_000 }).toBeGreaterThan(7);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyF');
  expect((await snap(page)).flapsIndex).toBe(flapsBefore - 1);
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Go-around complete');
  await expect(page.locator('#txtStabilized')).toContainText('Unstabilized at 500 ft');
  await expect(page.locator('#resultsFactors li')).toHaveCount(4);
  const s = await snap(page);
  expect(s.goAround.phase).toBe('complete');
  expect(s.goAround.climbFpm).toBeGreaterThan(100);
  // In the air the card pauses the flight; KEEP FLYING resumes it.
  expect(s.paused).toBe(true);
  await expect(page.locator('#btnKeepRolling')).toHaveText('KEEP FLYING');
  expect(await lowContrastLabels(page, '#resultsCard')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('go-around-1280.png') });
  // The best is kept under the drill's own key, in the save format (score, grade, at).
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
  expect(Object.keys(stored.missions.go_around_drill).sort()).toEqual(['at', 'grade', 'score']);
  await page.locator('#btnKeepRolling').click();
  await expect(page.locator('#resultsCard')).toBeHidden();
  expect((await snap(page)).paused).toBe(false);
  expect(errors).toEqual([]);
});

test('landing the drill anyway is graded "should have gone around"', async ({ page }) => {
  test.setTimeout(240_000);
  await startDrill(page);
  // The autoland flies the approach with flaps 10 (F cycles 30 → 40 → up → 10): a landing
  // it can make, through a gate that calls the flaps and says go around.
  await page.click('#btnApApr');
  for (let i = 0; i < 3; i++) await page.keyboard.press('KeyF');
  expect((await snap(page)).flapsIndex).toBe(1);
  await expect.poll(async () => (await snap(page)).stabilizedGate, { timeout: 120_000 }).not.toBeNull();
  const gate = (await snap(page)).stabilizedGate;
  expect(gate.stable).toBe(false);
  expect(gate.failing).toContain('FLAPS');
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#txtResultTitle')).toHaveText('Landing grade');
  await expect(page.locator('#txtGradeReason')).toContainText('Should have gone around');
  await expect(page.locator('#txtGrade')).toHaveText('D');
  expect((await snap(page)).goAround.phase).toBe('landed');
});
