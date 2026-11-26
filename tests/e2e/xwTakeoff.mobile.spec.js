import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, touchTap } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0220 on a phone (390x844, touch): the crosswind takeoff on Pilot shows the touch words for the stick, and the rudder
// pedals in the trim rocker's slot under the left thumb (as the wing-low lesson, 0188), on screen and clear of the other
// controls; a tap steps the rudder. Kid's line-up has the rudder: no pedals, and Kid's own words.
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const snap = (page) => page.evaluate(() => window.openaeroDebug());

async function fly(page, level) {
  await stubTiles(page);
  await page.addInitScript((l) => localStorage.setItem('openaero_assist_v1', `{"v":1,"level":"${l}","at":0}`), level);
  await page.goto(`${BASE}?mission=kads_crosswind_takeoff&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).xwTakeoff?.end, { timeout: 10_000 }).toBe('KADS_16');
}

test('phone, Pilot: the stick\'s touch words, the pedals under the left thumb, on screen and clear; a tap steps the rudder', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await fly(page, 'pilot');
  await expect(page.locator('#txtCoach')).toHaveText('Wind from the right: stick full right, then throttle to the top', { timeout: 10_000 });
  await expect(page.locator('#touchRudder')).toBeVisible();
  await expect(page.locator('#touchTrim')).toBeHidden();
  const vp = page.viewportSize();
  const boxes = {};
  for (const id of ['#touchRudL', '#touchRudR', '#touchStick', '#touchButtons', '#touchThrottle', '#coach']) boxes[id] = await page.locator(id).boundingBox();
  for (const id of ['#touchRudL', '#touchRudR']) {
    const b = boxes[id];
    expect(b.width, `${id} width`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${id} height`).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width / 2);
    for (const other of ['#touchStick', '#touchButtons', '#touchThrottle', '#coach']) expect(overlaps(b, boxes[other]), `${id} vs ${other}`).toBe(false);
  }
  await page.screenshot({ path: test.info().outputPath('xw-takeoff-390.png') });
  const cdp = await page.context().newCDPSession(page);
  const b = boxes['#touchRudL'];
  await touchTap(cdp, b.x + b.width / 2, b.y + b.height / 2);
  await expect.poll(async () => (await snap(page)).touchYaw, { timeout: 5_000 }).toBeCloseTo(-0.2, 1);
  expect(errors).toEqual([]);
});

test('phone, Kid: no pedals (its line-up has the rudder), Kid\'s touch words', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await fly(page, 'kid');
  await expect(page.locator('#txtCoach')).toHaveText('Wind from the right: throttle to the top, your plane keeps the line', { timeout: 10_000 });
  await expect(page.locator('#touchRudder')).toBeHidden();
  expect(errors).toEqual([]);
});
