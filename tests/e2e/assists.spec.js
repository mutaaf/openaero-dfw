import { test, expect } from '@playwright/test';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0042: assist levels Kid · Learner · Pilot over the same physics.
test.beforeEach(async ({ page }) => { await stubTiles(page); });

const debug = (page) => page.evaluate(() => window.openaeroDebug());

test('the level picker defaults to Pilot and remembers a choice across a reload', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.locator('.btnAssist[data-assist="pilot"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await debug(page)).assist).toBe('pilot');
  await page.locator('.btnAssist[data-assist="learner"]').click();
  await expect(page.locator('.btnAssist[data-assist="learner"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.btnAssist[data-assist="pilot"]')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_assist_v1')))).toMatchObject({ v: 1, level: 'learner' });
  await page.reload();
  await expect(page.locator('.btnAssist[data-assist="learner"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await debug(page)).assist).toBe('learner');
});

for (const [w, h] of [[390, 844], [844, 390], [820, 1180], [1280, 720]]) {
  test(`the level picker is readable and tappable at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(BASE);
    for (const level of ['kid', 'learner', 'pilot']) {
      const btn = page.locator(`.btnAssist[data-assist="${level}"]`);
      await btn.scrollIntoViewIfNeeded();
      const b = await btn.boundingBox();
      expect(b.height, level).toBeGreaterThanOrEqual(64);
      expect(b.width, level).toBeGreaterThanOrEqual(64);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(w);
      // Nothing inside the button is clipped (the blurb wraps instead of overflowing).
      const clipped = await btn.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
      expect(clipped, `${level} text clipped`).toBe(false);
    }
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scroll).toBeLessThanOrEqual(w);
  });
}

test('Learner: full stick right stays inside 45° of bank', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('.btnAssist[data-assist="learner"]').click();
  await page.locator('#btnStartFlight').click();
  await page.keyboard.down('KeyD');
  let maxBank = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 6_000) {
    maxBank = Math.max(maxBank, Math.abs((await debug(page)).bankRightDeg));
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyD');
  expect(maxBank).toBeGreaterThan(20);
  expect(maxBank).toBeLessThanOrEqual(45);
});

test.describe('Kid on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('touch only: Kid flies the default final down to a graded landing, no crash', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await page.goto(BASE);
    const kid = page.locator('.btnAssist[data-assist="kid"]');
    await kid.scrollIntoViewIfNeeded();
    await kid.tap();
    const start = page.locator('#btnStartFlight');
    await start.scrollIntoViewIfNeeded();
    await start.tap();
    await expect(page.locator('#onboardingModal')).toBeHidden();
    expect((await debug(page)).assist).toBe('kid');

    // A kid yanks the stick hard over and back for two seconds: the envelope holds.
    const stick = await page.locator('#touchStick').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x + stick.width - 2, y: stick.y + stick.height - 2, id: 1 }] });
    let maxBank = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 2_000) {
      maxBank = Math.max(maxBank, Math.abs((await debug(page)).bankRightDeg));
      await page.waitForTimeout(100);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(maxBank).toBeGreaterThan(3);
    expect(maxBank).toBeLessThanOrEqual(30);

    // Hands off from here: Kid flies the speed, the flare and the power down to the runway.
    await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 200_000 });
    const grade = (await page.locator('#txtGrade').textContent()).trim();
    expect(['S', 'A', 'B', 'C', 'D']).toContain(grade);
    const best = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
    expect(best.missions['kdfw_35c_final@kid'].grade).toBe(grade);
    expect(best.missions.kdfw_35c_final).toBeUndefined(); // Pilot's best is untouched
    expect(errors).toEqual([]);
  });
});
