import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Ticket 0188 on a phone (390x844, touch): the wing-low lesson on Pilot shows the rudder pedals over the stick (the
// ticket: "rudder reachable"), inside the screen and clear of the other controls; holding ◀ RUD pushes left rudder and
// letting go centres it. Kid's de-crab has the rudder: no pedals. Other flights have none.
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

test('phone, Pilot: the pedals over the stick, on screen and clear of the controls; held, they push the rudder', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await fly(page, 'pilot');
  await expect.poll(async () => (await snap(page)).wingLow?.end, { timeout: 10_000 }).toBe('KADS_16');
  await expect(page.locator('#txtCoach')).toHaveText('Wind from the right: lower the right wing, left rudder (◀ RUD) to hold the line', { timeout: 10_000 });
  await expect(page.locator('#touchRudder')).toBeVisible();
  const vp = page.viewportSize();
  const boxes = {};
  for (const id of ['#touchRudL', '#touchRudR', '#touchStick', '#touchButtons', '#touchThrottle', '#touchTrim', '#coach']) boxes[id] = await page.locator(id).boundingBox();
  for (const id of ['#touchRudL', '#touchRudR']) {
    const b = boxes[id];
    expect(b.width, `${id} width`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${id} height`).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    for (const other of ['#touchStick', '#touchButtons', '#touchThrottle', '#touchTrim', '#coach']) expect(overlaps(b, boxes[other]), `${id} vs ${other}`).toBe(false);
  }
  expect(overlaps(boxes['#touchRudL'], boxes['#touchRudR'])).toBe(false);
  await page.screenshot({ path: test.info().outputPath('wing-low-pedals-390.png') });
  const cdp = await page.context().newCDPSession(page);
  const l = boxes['#touchRudL'];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: l.x + l.width / 2, y: l.y + l.height / 2, id: 1 }] });
  await expect.poll(async () => (await snap(page)).rudderInput, { timeout: 5_000 }).toBeLessThan(-0.3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => Math.abs((await snap(page)).touchYaw), { timeout: 5_000 }).toBe(0);
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
