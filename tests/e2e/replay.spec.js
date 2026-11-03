import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
// A long flight: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

test.beforeEach(async ({ page }) => { await stubTiles(page); });

// 0019: after a graded landing, REPLAY plays the last seconds back with the physics paused
// (the aircraft moves, the flight doesn't), any key goes back to the card, and the recording
// also ends by itself and brings the card back.
test('REPLAY plays the landing back while paused and returns to the card', async ({ page }) => {
  test.setTimeout(170_000);
  const errors = collectErrors(page);
  await page.goto(`${BASE}?debug&mission=kdfw_35c_flare`);
  await page.locator('#btnStartFlight').click();
  await page.click('#btnApApr');
  const card = page.locator('#resultsCard'), bar = page.locator('#replayBar');
  await expect(card).toBeVisible({ timeout: 120_000 });
  const before = await page.evaluate(() => window.openaeroDebug());
  expect(before.paused).toBe(true);
  await expect(page.locator('#btnReplay')).toBeVisible();

  await page.click('#btnReplay');
  await expect(bar).toBeVisible();
  await expect(card).toBeHidden();
  const p0 = await page.evaluate(() => ({ ...window.openaeroReplay.pose.pos }));
  await expect.poll(() => page.evaluate(() => window.openaeroReplay.elapsed), { timeout: 10_000 }).toBeGreaterThan(1);
  const p1 = await page.evaluate(() => ({ ...window.openaeroReplay.pose.pos }));
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(20); // flying, on the recording
  const during = await page.evaluate(() => window.openaeroDebug());
  expect(during.paused).toBe(true);
  expect(during.pos).toEqual(before.pos); // the physics stood still
  await expect(page.locator('#txtReplayCam')).toHaveText(/^(Chase|Wing|Side)$/);
  // The HUD makes way; the imagery credit stays.
  await expect(page.locator('#hudCanvas')).toBeHidden();
  await expect(page.locator('#mapCredits')).toBeVisible();

  // A modifier alone doesn't end it; any other key: back to the card, the flight where it was, still paused.
  await page.keyboard.press('Shift');
  await expect(bar).toBeVisible();
  await page.keyboard.press('p');
  await expect(bar).toBeHidden();
  await expect(card).toBeVisible();
  const after = await page.evaluate(() => window.openaeroDebug());
  expect(after.paused).toBe(true);
  expect(after.pos).toEqual(before.pos);
  await expect(page.locator('#hudCanvas')).toBeVisible();

  // Played to the end, it reaches the touchdown from the side and comes back by itself.
  await page.click('#btnReplay');
  await expect(page.locator('#txtReplayCam')).toHaveText('Side', { timeout: 30_000 });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(bar).toBeHidden();
  expect(errors).toEqual([]);
});
