import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
// A long flight: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

// Static pitch stability (ticket 0090), Pilot: in the Cessna drill, trimmed level at
// 90 KIAS, push the nose down and let go. The nose comes back up by itself (before, a released
// stick held the dive). On a phone (390x844, touch): the keyboard path is the same physics, flown
// headless by tests/flight/c172.test.js's hands-off cards, so it has no desktop spec (CI time).
async function pushAndRelease(page, push, release) {
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(`${BASE}?mission=c172_stall_recovery`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  const spawn = await snap();
  expect(spawn).toMatchObject({ assist: 'pilot', aircraft: 'c172' });
  await push();
  await expect.poll(async () => (await snap()).pitchDeg, { timeout: 20_000 }).toBeLessThan(spawn.pitchDeg - 8);
  await release();
  // Within 25 s of sim time, still in the air: a released stick held the dive (-38° and 200 kt
  // after 20 s) before 0090, and only the crash and respawn brought the nose back.
  const t0 = (await snap()).simTime;
  let s = await snap();
  while (s.pitchDeg <= spawn.pitchDeg - 3 && s.simTime - t0 < 25) {
    await page.waitForTimeout(250);
    s = await snap();
  }
  console.log(`[pitch trim] nose ${s.pitchDeg.toFixed(1)}° ${(s.simTime - t0).toFixed(1)} s sim after the push, ${s.iasKts.toFixed(0)} kt, ${s.aglFt.toFixed(0)} ft`);
  expect(s.pitchDeg).toBeGreaterThan(spawn.pitchDeg - 3);
  expect(s.simTime - t0).toBeLessThan(25);
  expect(s.mission).toBe('c172_stall_recovery');
  expect(s.aglFt).toBeGreaterThan(1500);
  expect(errors).toEqual([]);
}

test('phone, Pilot, touch: push the stick, lift the thumb, and the nose comes back up by itself', async ({ page }) => {
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  let stick;
  await pushAndRelease(page, async () => {
    stick = await page.locator('#touchStick').boundingBox();
    const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: stick.y + stick.height * 0.85, id: 1 }] });
  }, () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
});

// Pitch trim (0094): Pilot's touch rocker over the stick trims while held, in reach of the
// thumb (nothing over it) and clear of the stick; Kid has no rocker (its assists trim).
test('phone, Pilot, touch: holding NOSE UP trims the hands-off speed down, NOSE DN back up', async ({ page }) => {
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(`${BASE}?mission=c172_stall_recovery`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const snap = () => page.evaluate(() => window.openaeroDebug());
  const s0 = await snap();
  expect(s0.trimKts).toBeGreaterThan(80);
  const cdp = await page.context().newCDPSession(page);
  for (const id of ['#touchTrimUp', '#touchTrimDn']) {
    const b = await page.locator(id).boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [b.x + b.width / 2, b.y + b.height / 2]);
    expect(hit).toBe(id.slice(1));
  }
  const stick = await page.locator('#touchStick').boundingBox();
  const up = await page.locator('#touchTrimUp').boundingBox();
  expect(up.y + up.height).toBeLessThanOrEqual(stick.y);
  const hold = async (id) => {
    const b = await page.locator(id).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 }] });
  };
  const lift = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await hold('#touchTrimUp');
  await expect.poll(async () => (await snap()).trimKts, { timeout: 10_000 }).toBeLessThan(s0.trimKts - 8);
  await lift();
  const s1 = await snap();
  await hold('#touchTrimDn');
  await expect.poll(async () => (await snap()).trimKts, { timeout: 10_000 }).toBeGreaterThan(s1.trimKts + 8);
  await lift();
  const s2 = await snap();
  await page.waitForTimeout(500);
  expect((await snap()).trimAlphaDeg).toBeCloseTo(s2.trimAlphaDeg, 1);
  expect(errors).toEqual([]);
});

test('phone, Kid: no trim rocker (the assists trim)', async ({ page }) => {
  await stubTiles(page);
  await page.goto(BASE);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#assistPicker .btnAssist[data-assist="kid"]').click();
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#touchStick')).toBeVisible();
  await expect(page.locator('#touchTrim')).toBeHidden();
});
