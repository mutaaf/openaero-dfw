import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ deviceScaleFactor: 0.25 });

// Ticket 0162: the Cessna burns fuel at the POH's rate (src/fuel.js, in the runway lights' lazy
// chunk). Pilot (the desktop project's level, panels shown) sees FUEL in the EICAS; an airborne
// spawn has paid for its climb; a dry tank stops the engine through the dead-stick path (ENG OUT)
// and the readout says why. Kid has no fuel to manage, and the 737 none in this ticket. The burn
// itself is flown headless against the POH (tests/flight/c172.test.js).
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const fuel = (page) => page.evaluate(() => window.openaeroFuel.debug());

async function fly(page, url) {
  await page.goto(`${BASE}?debug&${url}`);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.openaeroFuel);
}

test('Pilot, the Cessna aloft: FUEL with gallons and endurance; a dry tank stops the engine and says so', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await fly(page, 'mission=steep_turns');
  const el = page.locator('#txtFuel');
  await expect(el).toBeVisible();
  await expect(el).toHaveText(/^FUEL \d+\.\d GAL \d+:\d\d$/);
  // 3,000 ft over Grapevine Lake (~3,500 ft MSL): 53 less 1.4 to start and take off, ~1.3 to climb.
  const f0 = await fuel(page);
  expect(f0.gal).toBeGreaterThan(49.5);
  expect(f0.gal).toBeLessThan(51);
  expect(f0.gph).toBeGreaterThan(4);
  expect(f0.gph).toBeLessThan(13.5);
  await expect.poll(async () => (await fuel(page)).gal, { timeout: 10_000 }).toBeLessThan(f0.gal);
  await page.evaluate(() => window.openaeroFuel.set(0.0005));
  await expect.poll(async () => (await fuel(page)).out, { timeout: 15_000 }).toBe(true);
  await expect(el).toHaveText('FUEL EXHAUSTED');
  await expect(el).toHaveAttribute('data-fuel', 'out');
  await expect(page.locator('#txtThrottle')).toHaveText('ENG OUT');
  // Full throttle does nothing now.
  await page.locator('#rngThrottle').fill('100');
  await page.waitForTimeout(1000);
  await expect(page.locator('#txtThrottle')).toHaveText('ENG OUT');
  await page.screenshot({ path: test.info().outputPath('fuel-out-1280.png') });
  expect(errors).toEqual([]);
});

test('Kid flies the Cessna with no fuel to manage; the 737 shows none', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await fly(page, 'mission=steep_turns');
  await page.waitForTimeout(1000);
  await expect(page.locator('#txtFuel')).toBeHidden();
  await expect(page.locator('#txtTouchFuel')).toBeHidden();
  expect((await fuel(page)).gal).toBeNull();
  expect(errors).toEqual([]);
});

test('Pilot in the 737 (the default final): no fuel readout', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await fly(page, 'airport=KDFW');
  await page.waitForTimeout(1000);
  await expect(page.locator('#txtFuel')).toBeHidden();
  expect((await fuel(page)).gal).toBeNull();
  expect(errors).toEqual([]);
});
