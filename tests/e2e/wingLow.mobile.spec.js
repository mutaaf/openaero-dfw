import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, touchTap } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0188 on a phone (390x844, touch): the wing-low lesson on Pilot shows the rudder pedals in the trim rocker's slot
// under the left thumb (the ticket: "rudder reachable"; the right thumb flies the stick), inside the screen and clear of
// the other controls. A tap steps the rudder 20% and it stays (a slip holds steady pedal; first-timer panel); the other
// pedal brings it back. Kid's de-crab has the rudder: no pedals. Other flights have none.
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const snap = (page) => page.evaluate(() => window.openaeroDebug());

async function fly(page, level, mission = 'kads_crosswind_wing_low') {
  await stubTiles(page);
  await page.addInitScript((l) => localStorage.setItem('openaero_assist_v1', `{"v":1,"level":"${l}","at":0}`), level);
  await page.goto(`${BASE}?mission=${mission}&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
}

test('phone, Pilot: the pedals under the left thumb, on screen and clear of the controls; a tap steps the rudder and it stays', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await fly(page, 'pilot');
  await expect.poll(async () => (await snap(page)).wingLow?.end, { timeout: 10_000 }).toBe('KADS_16');
  await expect(page.locator('#txtCoach')).toHaveText('Wind from the right: right wing down, tap ◀ RUD', { timeout: 10_000 });
  await expect(page.locator('#touchRudder')).toBeVisible();
  await expect(page.locator('#touchTrim')).toBeHidden(); // the pedals take its slot
  const vp = page.viewportSize();
  const boxes = {};
  for (const id of ['#touchRudL', '#touchRudR', '#touchStick', '#touchButtons', '#touchThrottle', '#coach']) boxes[id] = await page.locator(id).boundingBox();
  for (const id of ['#touchRudL', '#touchRudR']) {
    const b = boxes[id];
    expect(b.width, `${id} width`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${id} height`).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width / 2); // the left thumb's half
    for (const other of ['#touchStick', '#touchButtons', '#touchThrottle', '#coach']) expect(overlaps(b, boxes[other]), `${id} vs ${other}`).toBe(false);
  }
  expect(overlaps(boxes['#touchRudL'], boxes['#touchRudR'])).toBe(false);
  await page.screenshot({ path: test.info().outputPath('wing-low-pedals-390.png') });
  const cdp = await page.context().newCDPSession(page);
  const tap = async (id) => {
    const b = boxes[id];
    await touchTap(cdp, b.x + b.width / 2, b.y + b.height / 2);
  };
  await tap('#touchRudL');
  await tap('#touchRudL');
  // Two taps: 40% left, and it stays there after the thumb lifts.
  await expect.poll(async () => (await snap(page)).touchYaw, { timeout: 5_000 }).toBeCloseTo(-0.4, 1);
  await expect(page.locator('#txtTouchRud')).toHaveText('40% L');
  await page.waitForTimeout(1000);
  expect((await snap(page)).touchYaw).toBeCloseTo(-0.4, 1);
  expect((await snap(page)).rudderInput).toBeLessThan(-0.3);
  await tap('#touchRudR');
  await tap('#touchRudR');
  await expect.poll(async () => Math.abs((await snap(page)).touchYaw), { timeout: 5_000 }).toBeLessThan(0.01);
  await expect(page.locator('#txtTouchRud')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('phone, Kid: no pedals on the lesson (its de-crab has the rudder); none on another final', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await fly(page, 'kid');
  await expect.poll(async () => (await snap(page)).wingLow?.end, { timeout: 10_000 }).toBe('KADS_16');
  await expect(page.locator('#txtCoach')).toHaveText('Wind from the right: let go, your plane lines itself up', { timeout: 10_000 });
  await expect(page.locator('#touchRudder')).toBeHidden();
  await page.goto(`${BASE}?mission=kads_16_final&debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(async () => (await snap(page)).mission, { timeout: 10_000 }).toBe('kads_16_final');
  expect((await snap(page)).wingLow).toBeFalsy();
  await expect(page.locator('#touchRudder')).toBeHidden();
  expect(errors).toEqual([]);
});
