import { test, expect } from '@playwright/test';
import { stubTiles, enterCockpit } from './helpers.js';

test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('D banks right and a held bank turns the aircraft right', async ({ page }) => {
  // Polls wait in wall time; CI's software GL runs fewer sim-seconds per second, so be generous.
  test.setTimeout(90_000);
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'downtown_skyline');
  const x0 = (await snap(page)).pos.x;
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await snap(page)).bankRightDeg, { timeout: 30_000 }).toBeGreaterThan(12);
  await page.keyboard.up('KeyD');
  // Heading 000 → turning right means the heading climbs and the aircraft drifts east.
  await expect.poll(async () => { const s = await snap(page); return s.headingDeg > 2 && s.headingDeg < 90; }, { timeout: 45_000 }).toBe(true);
  expect((await snap(page)).pos.x).toBeGreaterThan(x0);
});

test('ILS autoland flies the short final to an upright touchdown on the runway', async ({ page }) => {
  test.setTimeout(150_000);
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdfw_35c_flare');
  await page.click('#btnApApr');
  // Assert on the state captured AT touchdown (not when the poll notices it, after rollout).
  await expect.poll(async () => (await snap(page)).lastLanding, { timeout: 120_000 }).not.toBeNull();
  const td = (await snap(page)).lastLanding;
  expect(td.runway).toBe('KDFW_35C');
  expect(Math.abs(td.crossM)).toBeLessThan(15);
  expect(td.pastThresholdM).toBeGreaterThan(0);    // past the threshold
  expect(td.pastThresholdM).toBeLessThan(900);     // inside the 3,000 ft touchdown zone
  expect(Math.abs(td.bankRightDeg)).toBeLessThan(3);
  expect(td.pitchDeg).toBeGreaterThan(0);
  expect(td.pitchDeg).toBeLessThan(10);
  expect(td.vsFpm).toBeGreaterThan(-600);          // not a crash
  expect(td.vsFpm).toBeLessThan(-20);              // a real sink rate was measured (not lost to the ground clamp)
  // The autothrottle moved the throttle; the slider must agree with the readout (ticket 0017).
  await expect.poll(async () => {
    const pct = parseInt(await page.locator('#txtThrottle').textContent(), 10);
    return Number(await page.locator('#rngThrottle').inputValue()) - pct;
  }, { timeout: 5_000 }).toBe(0);
});

test('dragging the throttle slider sets the throttle', async ({ page }) => {
  await enterCockpit(page);
  await page.locator('#rngThrottle').fill('80');
  await expect(page.locator('#txtThrottle')).toHaveText('80%');
  await page.waitForTimeout(500);
  expect(await page.locator('#rngThrottle').inputValue()).toBe('80');
});

test('ILS autoland holds the localizer and glideslope from 4 NM, pitch steady', async ({ page }) => {
  test.setTimeout(120_000);
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdal_31r_final');
  await page.click('#btnApApr');
  // Windows in sim seconds: CI's software GL can fall behind wall time.
  const t0 = (await snap(page)).simTime;
  const pitches = [];
  for (;;) {
    const s = await snap(page);
    const t = s.simTime - t0;
    if (t > 45) break;
    expect(Math.abs(s.crossM), 'localizer').toBeLessThan(20);
    expect(Math.abs(s.heightAbovePathM), 'glideslope').toBeLessThan(20);
    expect(Math.abs(s.bankRightDeg), 'wings').toBeLessThan(30);
    if (t > 10) pitches.push(s.pitchDeg);
    await page.waitForTimeout(250);
  }
  expect(pitches.length).toBeGreaterThan(20);
  // Ticket 0016: no autothrottle/glidepath phugoid. Before the fix pitch swung −2.5°…+6.3°
  // with a ~28 s period; it must stay within ±1.5° of its mean after the first 10 s.
  const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const worst = Math.max(...pitches.map((p) => Math.abs(p - mean)));
  expect(worst, `pitch spread around ${mean.toFixed(2)}°`).toBeLessThan(1.5);
});
