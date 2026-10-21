import { test, expect } from './fixtures.js';
import { stubTiles, stubMetar, enterCockpit, TEST_METAR } from './helpers.js';

// KDFW 27015KT: straight across the 17/18 and 35/36 runways.
const WEST_15 = { ...TEST_METAR, wdir: 270, wspd: 15, wgst: null, rawOb: 'METAR KDFW 161953Z 27015KT 10SM FEW250 24/10 A3002' };
const WEST_8 = { ...TEST_METAR, wdir: 270, wspd: 8, wgst: null, rawOb: 'METAR KDFW 161953Z 27008KT 10SM FEW250 24/10 A3002' };

async function withMetar(page, metars, status = 200) {
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, metars, status);
}

test('today\'s crosswind challenge is offered from the live METAR and spawns aligned', async ({ page }) => {
  await withMetar(page, [WEST_15]);
  await page.goto('/openaero/');
  const card = page.locator('#btnCrosswindToday');
  await expect(card).toBeVisible();
  await expect(card).toContainText('KDFW 18L, 15 kt from the right');
  await expect(page.locator('#selScenario option[value="crosswind_today"]')).toHaveText("Today's crosswind: KDFW 18L, 15 kt from the right");
  await card.click();
  // Read at once: the sim runs behind the modal and the aircraft soon weathervanes into the wind.
  const s = await page.evaluate(() => window.openaeroDebug());
  expect(s.mission).toBe('crosswind_today');
  expect(s.missionRunway).toBe('KDFW_18L');
  expect(s.activeRunway).toBe('KDFW_18L');
  expect(Math.abs(s.headingDeg - s.runwayHdgT)).toBeLessThan(3);
  expect(Math.abs(s.crossM)).toBeLessThan(30);
  expect(s.distM / 1852).toBeGreaterThan(3.5);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  expect((await page.evaluate(() => window.openaeroDebug())).mission).toBe('crosswind_today');
});

test('without live weather there is no crosswind challenge', async ({ page }) => {
  await withMetar(page, [], 503);
  await enterCockpit(page);
  await expect(page.locator('#wxBadge')).toHaveText('SCENARIO WX');
  await expect(page.locator('#btnCrosswindToday')).toBeHidden();
  await expect(page.locator('#selScenario option[value="crosswind_today"]')).toHaveCount(0);
});

// Autoland flies the 4 NM final in the crosswind; the card gains the drift at touchdown.
test('the results card shows the drift angle at touchdown on the crosswind challenge', async ({ page }) => {
  test.setTimeout(240_000);
  await withMetar(page, [WEST_8]);
  await enterCockpit(page);
  await expect(page.locator('#selScenario option[value="crosswind_today"]')).toHaveCount(1);
  await page.selectOption('#selScenario', 'crosswind_today');
  await page.click('#btnApApr');
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 220_000 });
  await expect(page.locator('#resultsFactors li')).toHaveCount(6);
  await expect(page.locator('#resultsFactors li').last()).toContainText(/Crab \/ de-crab.*\d+\.\d° drift/);
});
