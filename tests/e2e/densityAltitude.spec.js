// Ticket 0111: density altitude from the field's METAR on the start screen and in the takeoff
// briefing, labelled live or scenario, with a thin-air hint on a hot day.
import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, collectErrors, TEST_METAR } from './helpers.js';

// A 38 °C afternoon at 29.80 inHg: density altitude ~3,630 ft at KDFW (unit test by hand).
const HOT = { ...TEST_METAR, temp: 38, dewp: 12, altim: 1009.1, rawOb: 'METAR KDFW 292153Z 18008KT 10SM FEW060 38/12 A2980' };

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a hot METAR shows the density altitude and the thin-air hint on the start screen', async ({ page }) => {
    const errors = collectErrors(page);
    await stubTiles(page);
    await page.unroute('**/openaero/api/metar*');
    await stubMetar(page, [HOT]);
    await page.goto(BASE);
    const line = page.locator('#txtDensityAlt');
    await expect(line).toContainText(/Density altitude KDFW 35C: 3,[4-7]00 ft \(live METAR, 38 °C\)/);
    await expect(page.locator('#txtThinAir')).toBeVisible();
    // The default mission is a final: the hint is about the landing, not a takeoff.
    await expect(page.locator('#txtThinAir')).toHaveText(/Thin air: a faster touchdown over the ground and a longer rollout/);
    await page.locator('#missionList .btnMission[data-scenario="kdfw_takeoff"]').click();
    await expect(page.locator('#txtThinAir')).toHaveText(/Thin air: expect a longer takeoff roll/);
    // It wraps inside the modal: no sideways scroll at 390 px.
    const box = await line.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
  });
});

test('the takeoff briefing says it when Fly is pressed', async ({ page }) => {
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, [HOT]);
  await page.goto(BASE);
  await page.locator('#missionList .btnMission[data-scenario="kdfw_takeoff"]').click();
  await expect(page.locator('#txtDensityAlt')).toContainText('KDFW 35C');
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('#toast')).toContainText(/DA 3,[4-7]00 ft at KDFW 35C: thin air, longer roll, weaker climb/);
  // One or two lines, not a column over the horizon.
  expect((await page.locator('#toast').boundingBox()).height).toBeLessThan(60);
});

test('scenario weather is labelled scenario and a mild day has no hint', async ({ page }) => {
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, [], 503);
  await page.goto(BASE);
  // Scenario 18 °C, A3000 at 35C (562 ft): ~1,000 ft.
  await expect(page.locator('#txtDensityAlt')).toContainText(/Density altitude KDFW 35C: (900|1,000|1,100) ft/);
  await expect(page.locator('#txtDensityAlt')).toContainText('(scenario, 18 °C)');
  await expect(page.locator('#txtThinAir')).toBeHidden();
  const text = await page.locator('#txtDensityAlt').innerText();
  expect(text).not.toMatch(/\blive\b/i);
  // A drill with no runway under it names no runway it isn't on.
  await page.locator('#missionList .btnMission[data-scenario="deadstick_kads_16"]').click();
  await expect(page.locator('#txtDensityAlt')).toContainText('Density altitude DFW area:');
});
