import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0221: a left-handed touch layout. The Options chip swaps the stick and the throttle (with the
// trim rocker and the function buttons' column), remembered as openaero_hand_v1. Runs in the `phone`
// project (touch, mobile, the Pilot profile, so the trim rocker shows beside the throttle).
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const mid = (b) => b.x + b.width / 2;
const DECK = ['#touchStick', '#touchThrottle', '#touchButtons', '#touchTrim'];
const LEFTY = { name: 'openaero_hand_v1', value: '{"v":1,"left":true,"at":0}' };

async function fly(page, coach = true) {
  await page.locator('#btnStartFlight').tap();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  // The coach shows on the default final: part of the layout under test.
  if (coach) await expect(page.locator('#coach')).toBeVisible({ timeout: 10_000 });
}

test.describe('left-handed chip (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the Options chip swaps the stick to the left and survives a reload (0221)', async ({ page }) => {
    const errors = collectErrors(page);
    await stubTiles(page);
    await page.goto(BASE);
    const left = page.locator('#handPicker [data-hand="left"]');
    const right = page.locator('#handPicker [data-hand="right"]');
    // Right-handed by default: the stick right of the throttle.
    await expect(right).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).not.toHaveClass(/lefty/);
    await page.locator('#handPicker').evaluate((e) => e.closest('details').open = true);
    for (const b of [left, right]) {
      await b.scrollIntoViewIfNeeded();
      const box = await b.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await left.tap();
    await expect(left).toHaveAttribute('aria-pressed', 'true');
    await expect(right).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('html')).toHaveClass(/lefty/);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('openaero_hand_v1')))).toMatchObject({ v: 1, left: true });
    // The How to fly card names the thumbs the way round they now are.
    await page.locator('.how-to').evaluate((e) => { e.open = true; });
    const how = await page.locator('.how-to .lg\\:hidden').evaluate((e) => e.innerText);
    expect(how).toMatch(/^Left thumb: the stick/);
    expect(how).toContain('Right thumb: throttle');
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/lefty/);
    await expect(left).toHaveAttribute('aria-pressed', 'true');
    await fly(page);
    expect(mid(await page.locator('#touchStick').boundingBox())).toBeLessThan(mid(await page.locator('#touchThrottle').boundingBox()));
    // And back: right-handed again, stored.
    await page.evaluate(() => localStorage.setItem('openaero_hand_v1', '{"v":1,"left":false,"at":0}'));
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/lefty/);
    await fly(page, false);
    expect(mid(await page.locator('#touchStick').boundingBox())).toBeGreaterThan(mid(await page.locator('#touchThrottle').boundingBox()));
    expect(errors).toEqual([]);
  });

  test('junk in storage falls back to right-handed (0221)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('openaero_hand_v1', '{"v":1,"left":"yes"'));
    await stubTiles(page);
    await page.goto(BASE);
    await expect(page.locator('html')).not.toHaveClass(/lefty/);
    await expect(page.locator('#handPicker [data-hand="right"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

// Both phone orientations (and the narrowest phone held sideways), left-handed from storage.
const SIZES = [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 568, height: 320 }];
for (const vp of SIZES) {
  test.describe(`left-handed deck ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });

    test('the deck mirrors and still clears the HUD, the horizon and the screen edges (0221)', async ({ page }, info) => {
      const errors = collectErrors(page);
      await page.addInitScript((kv) => localStorage.setItem(kv.name, kv.value), LEFTY);
      await stubTiles(page);
      await page.goto(BASE);
      await fly(page);
      await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).hudTapes?.speedX ?? 0).toBeGreaterThan(0);
      const box = async (id) => page.locator(id).boundingBox();
      const stick = await box('#touchStick'), thr = await box('#touchThrottle'), btns = await box('#touchButtons'), trim = await box('#touchTrim');
      // The stick's centre is left of the throttle's, the buttons between them, the trim inboard of the throttle.
      expect(mid(stick)).toBeLessThan(mid(thr));
      expect(mid(stick)).toBeLessThan(mid(btns));
      expect(mid(btns)).toBeLessThan(mid(thr));
      expect(mid(trim)).toBeLessThan(mid(thr) + 1); // beside it inboard, or over it when sideways
      expect(thr.x + thr.width).toBeGreaterThan(vp.width - 80); // under the right thumb
      expect(stick.x).toBeLessThan(80); // under the left thumb
      // Nothing overlaps another control, the top bar, the canvas HUD's tapes, wind box or MSL tab.
      const boxes = [];
      const top = vp.height > vp.width ? ['#phoneHeader'] : ['#phoneTelemetry', '#btnMenu']; // upright, the menu button is in the header
      for (const id of [...DECK, ...top, '#coach']) {
        const b = await box(id);
        expect(b, `${id} visible`).not.toBeNull();
        expect(b.x, `${id} left edge`).toBeGreaterThanOrEqual(0);
        expect(b.y, `${id} top edge`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `${id} right edge`).toBeLessThanOrEqual(vp.width);
        expect(b.y + b.height, `${id} bottom edge`).toBeLessThanOrEqual(vp.height);
        boxes.push([id, b]);
      }
      const { hudTapes, hudAltCaption, hudWind } = await page.evaluate(() => window.openaeroDebug());
      const cy = vp.height / 2, k = hudTapes.scale || 1;
      const rect = (r) => ({ x: r.x, y: r.y, width: r.w, height: r.h });
      const hud = [
        ['speed tape', { x: hudTapes.speedX - 60 * k, y: cy - 90 * k, width: 60 * k, height: 180 * k }],
        ['alt tape', { x: hudTapes.altX, y: cy - 90 * k, width: 64 * k, height: 180 * k }],
        ['MSL tab', rect(hudAltCaption)],
        ['wind box', rect(hudWind.box)], // as drawn this frame (mirrored left of the speed tape when sideways)
      ];
      if (hudWind.plainBox) hud.push(['wind words', rect(hudWind.plainBox)]);
      if (hudWind.baroBox?.show) hud.push(['altimeter setting', rect(hudWind.baroBox)]);
      if (vp.width > vp.height) expect(hudWind.box.x + hudWind.box.w).toBeLessThanOrEqual(hudTapes.speedX - 60 * k);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i][1], boxes[j][1]), `${boxes[i][0]} vs ${boxes[j][0]}`).toBe(false);
        }
        for (const [name, h] of hud) {
          if (boxes[i][0] === '#coach' && name === 'wind box') continue; // the coach's slot is its own spec's (coachSlot)
          expect(overlaps(boxes[i][1], h), `${boxes[i][0]} covers the ${name}`).toBe(false);
        }
      }
      // The horizon around the boresight stays clear.
      const centre = vp.height > vp.width
        ? { x: 0, y: vp.height * 0.4, width: vp.width, height: vp.height * 0.2 }
        : { x: vp.width * 0.3, y: vp.height * 0.35, width: vp.width * 0.4, height: vp.height * 0.3 };
      for (const [id, b] of boxes) expect(overlaps(b, centre), `${id} covers the horizon`).toBe(false);
      // Every touch target is still at least 44 px; no page scroll.
      const targets = await page.locator('#touchButtons button, #touchTrim button').evaluateAll((els) =>
        els.map((e) => { const r = e.getBoundingClientRect(); return [e.id, r.width, r.height]; }));
      expect(targets.length).toBe(6);
      for (const [id, w, h] of targets) { expect(w, id).toBeGreaterThanOrEqual(44); expect(h, id).toBeGreaterThanOrEqual(44); }
      for (const b of [stick, thr]) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
      const scroll = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, y: window.scrollY }));
      expect(scroll.w).toBeLessThanOrEqual(vp.width);
      expect(scroll.h).toBeLessThanOrEqual(vp.height);
      expect(scroll.y).toBe(0);
      // The stick still flies from its new side: a drag up-left deflects the ailerons and elevator.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mid(stick), y: stick.y + stick.height / 2, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x + 4, y: stick.y + 4, id: 1 }] });
      await expect.poll(() => page.locator('#meterAil').textContent(), { timeout: 5_000 }).not.toBe('0%');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      // The ATIS card (asked for: its top-left slot when sideways) leaves the moved wind box uncovered.
      await page.evaluate(() => document.getElementById('btnAtis').click());
      await expect(page.locator('#atis')).toBeVisible();
      const atis = await box('#atis');
      const wbNow = (await page.evaluate(() => window.openaeroDebug())).hudWind.box;
      expect(overlaps(atis, rect(wbNow)), 'ATIS card covers the wind box').toBe(false);
      for (const id of DECK) expect(overlaps(atis, await box(id)), `ATIS card vs ${id}`).toBe(false);
      await info.attach(`lefty-${vp.width}x${vp.height}`, { body: await page.screenshot(), contentType: 'image/png' });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('left-handed deck with a notch (844x390)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('the notch side insets push the mirrored controls inward (0221)', async ({ page }) => {
    await page.addInitScript((kv) => localStorage.setItem(kv.name, kv.value), LEFTY);
    await stubTiles(page);
    await page.goto(BASE);
    await fly(page);
    await page.addStyleTag({ content: ':root { --safe-left: 47px; --safe-right: 47px; }' });
    const stick = await page.locator('#touchStick').boundingBox();
    const thr = await page.locator('#touchThrottle').boundingBox();
    expect(stick.x).toBeGreaterThanOrEqual(47);
    expect(thr.x + thr.width).toBeLessThanOrEqual(844 - 47);
    // The stick stays left of the speed tape's scale (cx - 131 - 60) with the inset taken from its own side.
    expect(stick.x + stick.width).toBeLessThanOrEqual(422 - 191);
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false });
  test('no chip and no mirror on a screen with a mouse, whatever is stored (0221)', async ({ page }) => {
    await page.addInitScript((kv) => localStorage.setItem(kv.name, kv.value), LEFTY);
    await stubTiles(page);
    await page.goto(BASE);
    await expect(page.locator('#handPicker')).toBeHidden();
    await expect(page.locator('html')).not.toHaveClass(/lefty/);
  });
});

// The crosswind lessons' rudder pedals take the trim's slot, inboard of the throttle: left-handed they
// stand beside it under the right thumb (the lessons' blurbs say "beside the throttle"), clear of the
// HUD both ways round, and ◀ RUD still steps the rudder left.
for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
  test.describe(`left-handed pedals ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });
    test('the wing-low lesson\'s pedals stand beside the throttle on the right, clear of the HUD (0221)', async ({ page }) => {
      const errors = collectErrors(page);
      await page.addInitScript((kv) => localStorage.setItem(kv.name, kv.value), LEFTY);
      await stubTiles(page);
      await page.goto(`${BASE}?mission=kads_crosswind_wing_low&debug`);
      expect(await page.locator('.btnMission.active').innerText()).toContain('beside the throttle');
      await fly(page, false);
      await expect(page.locator('#touchRudder')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('#touchTrim')).toBeHidden();
      const box = async (id) => page.locator(id).boundingBox();
      const rud = await box('#touchRudder'), thr = await box('#touchThrottle'), stick = await box('#touchStick'), btns = await box('#touchButtons');
      expect(mid(rud)).toBeGreaterThan(mid(btns));
      expect(mid(rud)).toBeLessThan(mid(thr) + 1);
      expect(mid(stick)).toBeLessThan(mid(btns));
      for (const [a, b] of [[rud, thr], [rud, btns], [rud, stick]]) expect(overlaps(a, b)).toBe(false);
      expect(rud.x + rud.width).toBeLessThanOrEqual(vp.width);
      expect(rud.y).toBeGreaterThanOrEqual(0);
      const { hudTapes, hudAltCaption, hudWind } = await page.evaluate(() => window.openaeroDebug());
      const cy = vp.height / 2, k = hudTapes.scale || 1;
      const rect = (r) => ({ x: r.x, y: r.y, width: r.w, height: r.h });
      const hud = [['alt tape', { x: hudTapes.altX, y: cy - 90 * k, width: 64 * k, height: 180 * k }], ['MSL tab', rect(hudAltCaption)], ['wind box', rect(hudWind.box)]];
      if (hudWind.plainBox) hud.push(['wind words', rect(hudWind.plainBox)]);
      if (hudWind.baroBox?.show) hud.push(['altimeter setting', rect(hudWind.baroBox)]);
      for (const [name, h] of hud) expect(overlaps(rud, h), `pedals cover the ${name}`).toBe(false);
      // The coach card (z above the deck; its top-right slot when sideways) leaves the pedals and their readout whole.
      await expect(page.locator('#coach')).toBeVisible({ timeout: 10_000 });
      expect(overlaps(await box('#coach'), rud), 'coach card covers the pedals').toBe(false);
      expect((await box('#touchThrottle')).height).toBeGreaterThanOrEqual(44);
      for (const b of await page.locator('#touchRudder button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(b).toBeGreaterThanOrEqual(44);
      await page.locator('#touchRudL').tap();
      await expect(page.locator('#txtTouchRud')).toHaveText(/% L$/);
      expect(errors).toEqual([]);
    });
  });
}
