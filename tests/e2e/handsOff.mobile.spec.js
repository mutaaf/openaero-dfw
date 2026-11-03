import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0136: a first-timer on a phone taps Fly and lets go. The default final (KDFW 35C, Learner on a
// first visit) must fly its 3° path hands-off, as it does on desktop, and the touch stick must read
// exactly centred until a thumb is on it. A stick whose pointerup never reaches it (iOS Safari drops it
// when the captured element loses the pointer, or the app is switched mid-hold) must not stay deflected.
test.use({ storageState: { cookies: [], origins: [] } }); // a first visit: Learner, as the Scout flew it
const OFF_DECK = { x: 195, y: 120 }; // the top of an upright phone, well off the touch deck

async function tapFly(page, vp) {
  await page.setViewportSize(vp);
  await stubTiles(page);
  await page.goto(BASE);
  const start = page.locator('#btnStartFlight');
  await start.scrollIntoViewIfNeeded();
  await start.tap(); // a touch tap; on a phone held upright Fly sits over the touch stick
  await expect(page.locator('#onboardingModal')).toBeHidden();
}

const sample = (page) => page.evaluate(() => {
  const d = window.openaeroDebug();
  return { t: d.simTime, pitch: d.pitchDeg, msl: d.mslFt, gs: d.gsKts, stick: d.stick, src: d.inputSource, assist: d.assist };
});

for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`a hands-off Learner final holds its path on a ${vp.width}x${vp.height} touch screen (0136)`, async ({ page }) => {
    const errors = collectErrors(page);
    await tapFly(page, vp);
    const first = await sample(page);
    expect(first.assist).toBe('learner');
    const samples = [first];
    while (samples.at(-1).t - first.t < 10) {
      await page.waitForTimeout(1000);
      samples.push(await sample(page));
    }
    for (const s of samples) {
      expect(s.stick, `stick at ${s.t.toFixed(1)} s`).toEqual({ x: 0, y: 0, active: false });
      expect(s.src).not.toBe('stick');
      expect(Math.abs(s.pitch - first.pitch), `pitch at ${s.t.toFixed(1)} s`).toBeLessThan(4);
    }
    const last = samples.at(-1);
    const sinkFpm = (first.msl - last.msl) / ((last.t - first.t) / 60);
    // The 3° path's sink at this groundspeed (~800 fpm at 153 kt); the Scout's phone dive was ~4,700.
    const pathFpm = Math.tan(3 * Math.PI / 180) * last.gs * 6076.12 / 60;
    expect(Math.abs(sinkFpm - pathFpm), `sink ${sinkFpm.toFixed(0)} fpm vs the path's ${pathFpm.toFixed(0)}`).toBeLessThan(300);
    expect(errors).toEqual([]);
  });
}

test('a held touch stick that loses its pointer, or the app, lets go (0136)', async ({ page, context }) => {
  const errors = collectErrors(page);
  await tapFly(page, { width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  const stick = await page.locator('#touchStick').boundingBox();
  const x = stick.x + stick.width / 2, y = stick.y + stick.height * 0.2; // pulled back
  const hold = async () => {
    await page.evaluate(() => {
      document.getElementById('touchStick').addEventListener('pointerdown', (e) => { window.__stickPointer = e.pointerId; }, { once: true });
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await expect.poll(async () => (await sample(page)).stick.active).toBe(true);
    expect((await sample(page)).stick.y).toBeLessThan(-0.3);
  };
  const slide = (to) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
  const lift = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  // The stick loses its capture mid-hold (as iOS can when the captured element stops getting the
  // pointer), the thumb slides off and lifts somewhere else: the pointerup lands on the canvas, not
  // the stick (before 0136 the stick stayed pulled back, hands-off, for the rest of the flight).
  await hold();
  await page.evaluate(() => document.getElementById('touchStick').releasePointerCapture(window.__stickPointer));
  await slide(OFF_DECK);
  await lift();
  await page.waitForTimeout(300);
  const after = await sample(page);
  expect(after.stick).toEqual({ x: 0, y: 0, active: false });
  expect(after.src).not.toBe('stick');

  // The phone switches app (the window loses focus) with a thumb on the stick: it comes back centred.
  await hold();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await sample(page)).stick).toEqual({ x: 0, y: 0, active: false });
  await lift();
  expect((await sample(page)).stick).toEqual({ x: 0, y: 0, active: false });
  expect(errors).toEqual([]);
});
