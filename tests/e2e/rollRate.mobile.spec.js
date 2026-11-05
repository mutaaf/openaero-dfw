import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, enterCockpit } from './helpers.js';

// Ticket 0156 on a phone (390x844, touch, Pilot): the roll rate follows the airframe. The F-16's stick
// commands up to 308°/s (NASA TP-1538) as far as the airframe can make it, the Cessna's ailerons roll
// it at Roskam's p·b/2V; and the F-16's stick has a curve (src/fbw.js pilotRoll), so half of it is a
// gentle roll. The stick is dragged right from its centre and held for 1 s of sim time on the default
// final; the bank's change over that second (unwrapped through ±180°) is the measure. The cruise
// rates (308°/s at 350 KIAS) are tests/flight's (f16.test.js, rollHold.test.js): a phone e2e has no
// cruise spawn.
async function rollFor(page, ac, share, errors) {
  await page.evaluate((key) => {
    const sel = document.getElementById('selAircraft');
    sel.value = key;
    sel.dispatchEvent(new Event('change'));
  }, ac);
  const snap = () => page.evaluate(() => window.openaeroDebug());
  await expect.poll(async () => (await snap()).aircraft).toBe(ac);
  expect((await snap()).assist).toBe('pilot');
  await page.evaluate(() => {
    const s = (window.__roll = { turned: 0, last: null, t0: null, on: true, frames: 0 });
    const tick = () => {
      const d = window.openaeroDebug();
      if (s.t0 !== null && d.simTime - s.t0 <= 1) {
        if (s.last !== null) s.turned += ((d.bankRightDeg - s.last + 540) % 360) - 180;
        s.last = d.bankRightDeg;
        s.frames++;
      }
      if (s.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cdp = await page.context().newCDPSession(page);
  const stick = await page.locator('#touchStick').boundingBox();
  const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (stick.width / 2) * share, y, id: 1 }] });
  const t0 = (await snap()).simTime;
  await page.evaluate((t) => { window.__roll.t0 = t; }, t0);
  await expect.poll(async () => (await snap()).simTime - t0, { timeout: 30_000 }).toBeGreaterThan(1.1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const r = await page.evaluate(() => { window.__roll.on = false; return window.__roll; });
  console.log(`[roll] ${ac} ${share === 1 ? 'full' : 'half'} stick: ${r.turned.toFixed(0)}° in 1 s of sim time, ${r.frames} frames`);
  expect(errors).toEqual([]);
  return r.turned;
}

async function start(page) {
  const errors = collectErrors(page);
  await stubTiles(page);
  await enterCockpit(page);
  return errors;
}

// Full stick on the final: the F-16 (~140 KIAS, under its command, at the airframe's p·b/2V 0.128) rolls
// faster than the Cessna (~70 KIAS, 0.116): about as much faster as it flies (measured 92° vs 53°).
test('phone, Pilot, touch: full stick rolls the F-16 faster than the Cessna on the final', async ({ page, context }) => {
  test.setTimeout(150_000);
  const f16 = await rollFor(page, 'f16', 1, await start(page));
  await page.close();
  const p2 = await context.newPage(); // a fresh flight for the Cessna (the context keeps the fixtures)
  const c172 = await rollFor(p2, 'c172', 1, await start(p2));
  expect(c172).toBeGreaterThan(15);
  expect(f16).toBeGreaterThan(1.3 * c172);
});

// Half the stick in the F-16 is 0.275 of the command (fbw.js pilotRoll's curve): on the final ~30°/s.
test('phone, Pilot, touch: half the stick rolls the F-16 gently (≤ ~90°/s)', async ({ page }) => {
  test.setTimeout(90_000);
  const half = await rollFor(page, 'f16', 0.5, await start(page));
  expect(half).toBeGreaterThan(10);
  expect(half).toBeLessThan(90);
});
