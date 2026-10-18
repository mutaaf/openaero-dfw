import { test, expect } from '@playwright/test';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0025: a phone held sideways. Runs in the `phone` project (touch, mobile).
const SIZES = [{ width: 844, height: 390 }, { width: 667, height: 375 }];
const CONTROLS = ['#btnMenu', '#phoneTelemetry', '#touchThrottle', '#touchStick', '#touchButtons', '#coach'];

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function startFlight(page) {
  await stubTiles(page);
  await page.goto(BASE);
  const start = page.locator('#btnStartFlight');
  await start.scrollIntoViewIfNeeded();
  await start.tap();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  // The coach shows on the default final: it is part of the layout under test.
  await expect(page.locator('#coach')).toBeVisible({ timeout: 5_000 });
}

for (const vp of SIZES) {
  test.describe(`phone landscape ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });

    test('HUD and controls never overlap each other or the horizon (0025)', async ({ page }, info) => {
      const errors = collectErrors(page);
      await startFlight(page);
      const boxes = [];
      for (const id of CONTROLS) {
        const b = await page.locator(id).boundingBox();
        expect(b, `${id} visible`).not.toBeNull();
        expect(b.x, `${id} left edge`).toBeGreaterThanOrEqual(0);
        expect(b.y, `${id} top edge`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `${id} right edge`).toBeLessThanOrEqual(vp.width);
        expect(b.y + b.height, `${id} bottom edge`).toBeLessThanOrEqual(vp.height);
        boxes.push([id, b]);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i][1], boxes[j][1]), `${boxes[i][0]} vs ${boxes[j][0]}`).toBe(false);
        }
      }
      // The centre 40% x 30% around the horizon is free of DOM overlays.
      const centre = { x: vp.width * 0.3, y: vp.height * 0.35, width: vp.width * 0.4, height: vp.height * 0.3 };
      for (const [id, b] of boxes) expect(overlaps(b, centre), `${id} covers the horizon`).toBe(false);
      // The canvas HUD's speed and altitude tapes (renderHud: cx - 175 … cx + 186, cy - 90 … cy + 90)
      // stay unobstructed by the controls.
      const cx = vp.width / 2, cy = vp.height / 2;
      const tapes = { x: cx - 175, y: cy - 90, width: 361, height: 180 };
      for (const [id, b] of boxes) expect(overlaps(b, tapes), `${id} covers the tapes`).toBe(false);
      // Every touch target is at least 44 px.
      const targets = await page.locator('#touchButtons button, #btnMenu, #btnCoachSkip').evaluateAll((els) =>
        els.map((e) => { const r = e.getBoundingClientRect(); return [e.id, r.width, r.height]; }));
      expect(targets.length).toBe(6);
      for (const [id, w, h] of targets) { expect(w, id).toBeGreaterThanOrEqual(44); expect(h, id).toBeGreaterThanOrEqual(44); }
      for (const id of ['#touchThrottle', '#touchStick']) {
        const b = await page.locator(id).boundingBox();
        expect(Math.min(b.width, b.height), `${id} size`).toBeGreaterThanOrEqual(44);
      }
      // No page scroll.
      const scroll = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, y: window.scrollY,
      }));
      expect(scroll.w).toBeLessThanOrEqual(vp.width);
      expect(scroll.h).toBeLessThanOrEqual(vp.height);
      expect(scroll.y).toBe(0);
      await info.attach(`landscape-${vp.width}x${vp.height}`, { body: await page.screenshot(), contentType: 'image/png' });
      expect(errors).toEqual([]);
    });

    test('the menu sheet opens clear of the stick and the function buttons (0025)', async ({ page }) => {
      await startFlight(page);
      await page.locator('#btnMenu').tap();
      await expect(page.locator('#hudMenu')).toBeVisible();
      const sheet = await page.locator('#hudMenu').boundingBox();
      expect(sheet.x).toBeGreaterThanOrEqual(0);
      expect(sheet.x + sheet.width).toBeLessThanOrEqual(vp.width);
      expect(sheet.y + sheet.height).toBeLessThanOrEqual(vp.height);
      for (const id of ['#touchStick', '#touchButtons']) {
        expect(overlaps(sheet, await page.locator(id).boundingBox()), `sheet vs ${id}`).toBe(false);
      }
      await expect(page.locator('#btnPause')).toBeVisible();
    });
  });
}

test.describe('safe-area insets in landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('the notch side insets push the controls inward (0025)', async ({ page }) => {
    await startFlight(page);
    // Simulate a notch: the CSS reads env() through custom properties we can override.
    const before = {
      menu: (await page.locator('#btnMenu').boundingBox()).x,
      thr: (await page.locator('#touchThrottle').boundingBox()).x,
      stick: await page.locator('#touchStick').boundingBox(),
    };
    await page.addStyleTag({ content: ':root { --safe-left: 47px; --safe-right: 47px; }' });
    const after = {
      menu: (await page.locator('#btnMenu').boundingBox()).x,
      thr: (await page.locator('#touchThrottle').boundingBox()).x,
      stick: await page.locator('#touchStick').boundingBox(),
    };
    expect(after.menu).toBeGreaterThanOrEqual(47);
    expect(after.thr).toBeGreaterThanOrEqual(47);
    expect(after.stick.x + after.stick.width).toBeLessThanOrEqual(844 - 47);
    expect(after.menu).toBeGreaterThan(before.menu);
    expect(after.thr).toBeGreaterThan(before.thr);
  });
});
