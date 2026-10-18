import { test, expect } from '@playwright/test';
import { BASE, stubTiles, collectErrors, distinctColours } from './helpers.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('phone: boots, starts a flight, renders, no errors, no page scroll', async ({ page }) => {
  await stubTiles(page);
  const errors = collectErrors(page);
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  // Poll: under parallel load SwiftShader can take a few seconds to draw the first frames.
  await expect.poll(() => distinctColours(page, '#simCanvas'), { timeout: 15_000 }).toBeGreaterThan(3);
  const scroll = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth, vw: window.innerWidth,
  }));
  expect(scroll.w).toBeLessThanOrEqual(scroll.vw);
  expect(errors).toEqual([]);
});

async function startFlight(page) {
  await stubTiles(page);
  await page.goto(BASE);
  const start = page.locator('#btnStartFlight');
  await start.scrollIntoViewIfNeeded();
  await start.tap();
  await expect(page.locator('#onboardingModal')).toBeHidden();
}

const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('phone: the start button is reachable without scrolling the page', async ({ page }) => {
  await stubTiles(page);
  await page.goto(BASE);
  const start = page.locator('#btnStartFlight');
  await start.scrollIntoViewIfNeeded();
  const box = await start.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('phone: two thumbs fly — stick deflects the surfaces while the throttle moves', async ({ page }) => {
  await startFlight(page);
  const stick = await page.locator('#touchStick').boundingBox();
  const thr = await page.locator('#touchThrottle').boundingBox();
  expect(stick.width).toBeGreaterThanOrEqual(120);
  const cdp = await page.context().newCDPSession(page);
  const s = centre(stick);
  const t = centre(thr);
  // Thumb 1 on the stick, thumb 2 on the throttle, then both move.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { x: s.x, y: s.y, id: 1 }, { x: t.x, y: t.y, id: 2 } ] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
    { x: stick.x + stick.width - 4, y: stick.y + 4, id: 1 }, { x: t.x, y: thr.y + 2, id: 2 } ] });
  await expect.poll(() => page.locator('#meterAil').textContent(), { timeout: 5_000 }).not.toBe('0%');
  await expect.poll(() => page.locator('#meterElev').textContent(), { timeout: 5_000 }).not.toBe('0%');
  await expect.poll(() => page.locator('#txtTouchThr').textContent(), { timeout: 5_000 }).toMatch(/^(9\d|100)%$/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Releasing the stick re-centres it.
  await expect.poll(() => page.locator('#meterAil').textContent(), { timeout: 5_000 }).toBe('0%');
});

test('phone: controls never overlap each other or the horizon', async ({ page }) => {
  await startFlight(page);
  const ids = ['#phoneHeader', '#touchStick', '#touchThrottle', '#touchButtons'];
  const boxes = [];
  for (const id of ids) {
    const b = await page.locator(id).boundingBox();
    expect(b, `${id} visible`).not.toBeNull();
    boxes.push([id, b]);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlaps(boxes[i][1], boxes[j][1]), `${boxes[i][0]} vs ${boxes[j][0]}`).toBe(false);
    }
  }
  // The horizon band (middle fifth of the screen) is free of panels.
  const band = { x: 0, y: 844 * 0.4, width: 390, height: 844 * 0.2 };
  for (const [id, b] of boxes) expect(overlaps(b, band), `${id} covers the horizon`).toBe(false);
  // Every touch target is at least 44px.
  const targets = await page.locator('#touchButtons button').evaluateAll((els) =>
    els.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
  expect(targets.length).toBeGreaterThanOrEqual(4);
  for (const [w, h] of targets) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
});

test('phone: touch buttons work the gear, flaps and brakes', async ({ page }) => {
  await startFlight(page);
  await page.locator('#touchFlaps').tap();
  await expect(page.locator('#touchFlaps')).toContainText('40°');
  await page.locator('#touchBrakes').tap();
  await expect(page.locator('#txtBrakes')).toHaveText('SET');
});

test('phone: the landing coach fits between the header and the touch deck, off the horizon', async ({ page }) => {
  await startFlight(page);
  await expect(page.locator('#coach')).toBeVisible({ timeout: 5_000 });
  const coach = await page.locator('#coach').boundingBox();
  for (const id of ['#phoneHeader', '#touchStick', '#touchThrottle', '#touchButtons']) {
    expect(overlaps(coach, await page.locator(id).boundingBox()), `coach vs ${id}`).toBe(false);
  }
  expect(overlaps(coach, { x: 0, y: 844 * 0.4, width: 390, height: 844 * 0.2 }), 'coach covers the horizon').toBe(false);
  expect(coach.x).toBeGreaterThanOrEqual(0);
  expect(coach.x + coach.width).toBeLessThanOrEqual(390);
  const skip = await page.locator('#btnCoachSkip').boundingBox();
  expect(skip.height).toBeGreaterThanOrEqual(44);
  expect(skip.width).toBeGreaterThanOrEqual(44);
  await page.locator('#btnCoachSkip').tap();
  await expect(page.locator('#coach')).toBeHidden();
});

test('phone: the top HUD is one slim row, clear of the tapes and the horizon (0021)', async ({ page }) => {
  await startFlight(page);
  const header = await page.locator('#phoneHeader').boundingBox();
  expect(header.y + header.height, 'top HUD bottom').toBeLessThanOrEqual(110);
  // The canvas HUD's topmost box is the heading arc at cy - 145; the tapes start at cy - 90.
  expect(header.y + header.height).toBeLessThan(844 / 2 - 145);
  expect(overlaps(header, { x: 0, y: 844 * 0.4, width: 390, height: 844 * 0.2 })).toBe(false);
  await expect(page.locator('#hudMenu')).toBeHidden();
  await expect(page.locator('#txtPhoneAgl')).toBeVisible();
  const menu = await page.locator('#btnMenu').boundingBox();
  expect(menu.width).toBeGreaterThanOrEqual(44);
  expect(menu.height).toBeGreaterThanOrEqual(44);
});

test('phone: every folded control is one tap behind ☰ Menu; Pause pauses (0021)', async ({ page }) => {
  const errors = collectErrors(page);
  await startFlight(page);
  await page.locator('#btnMenu').tap();
  await expect(page.locator('#btnMenu')).toHaveAttribute('aria-expanded', 'true');
  for (const id of ['#btnOpenMissions', '#btnCamera', '#btnAudio', '#btnPause', '#btnReset', '#wxBadge']) {
    await expect(page.locator(id), `${id} in the sheet`).toBeVisible();
  }
  const sheet = await page.locator('#hudMenu').boundingBox();
  expect(sheet.x).toBeGreaterThanOrEqual(0);
  expect(sheet.x + sheet.width).toBeLessThanOrEqual(390);
  for (const id of ['#touchStick', '#touchThrottle', '#touchButtons']) {
    expect(overlaps(sheet, await page.locator(id).boundingBox()), `sheet vs ${id}`).toBe(false);
  }
  const targets = await page.locator('#hudMenu button').evaluateAll((els) => els
    .filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [e.id, r.width, r.height]; }));
  expect(targets.length).toBeGreaterThanOrEqual(5);
  for (const [id, w, h] of targets) { expect(w, id).toBeGreaterThanOrEqual(44); expect(h, id).toBeGreaterThanOrEqual(44); }
  await page.locator('#btnPause').tap();
  await expect(page.locator('#btnPause')).toHaveText('RESUME');
  // With the sheet folded the always-visible button still says the sim is paused.
  await expect(page.locator('#btnMenu')).toContainText('PAUSED');
  const agl = await page.locator('#txtPhoneAgl').textContent();
  await page.waitForTimeout(1_000);
  expect(await page.locator('#txtPhoneAgl').textContent(), 'frozen while paused').toBe(agl);
  // Touching the view folds the sheet away again; Missions opens the picker and folds it too.
  await page.locator('#simCanvas').tap({ position: { x: 195, y: 400 } });
  await expect(page.locator('#hudMenu')).toBeHidden();
  await page.locator('#btnMenu').tap();
  await page.locator('#btnOpenMissions').tap();
  await expect(page.locator('#onboardingModal')).toBeVisible();
  await expect(page.locator('#hudMenu')).toBeHidden();
  expect(errors).toEqual([]);
});

test('phone: the menu has a keyboard path and grabbing the stick folds it (0021)', async ({ page }) => {
  await startFlight(page);
  await page.locator('#btnMenu').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudMenu')).toBeVisible();
  await page.locator('#btnCamera').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hudMenu')).toBeHidden();
  await expect(page.locator('#btnMenu')).toBeFocused();
  await page.locator('#btnMenu').tap();
  await expect(page.locator('#hudMenu')).toBeVisible();
  await page.locator('#touchStick').tap();
  await expect(page.locator('#hudMenu')).toBeHidden();
});
