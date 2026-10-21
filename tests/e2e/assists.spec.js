import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0042: assist levels Kid · Learner · Pilot over the same physics.
test.beforeEach(async ({ page }) => { await stubTiles(page); });

const debug = (page) => page.evaluate(() => window.openaeroDebug());

// 0059: a first visit (nothing stored) starts on Learner; a stored level always wins.
test.describe('first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const freshLearnerFlight = async (page, tap) => {
    const errors = collectErrors(page);
    await page.goto(BASE);
    await expect(page.locator('.btnAssist[data-assist="learner"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.btnAssist[data-assist="pilot"]')).toHaveAttribute('aria-pressed', 'false');
    expect((await debug(page)).assist).toBe('learner');
    const start = page.locator('#btnStartFlight');
    await start.scrollIntoViewIfNeeded();
    if (tap) await start.tap(); else await start.click();
    await expect(page.locator('#onboardingModal')).toBeHidden();
    await expect(page.locator('#coach')).toBeVisible({ timeout: 10_000 });
    expect((await debug(page)).assist).toBe('learner');
    // The default alone writes nothing: no level, no best.
    const stored = await page.evaluate(() => [localStorage.getItem('openaero_assist_v1'), localStorage.getItem('openaero_best')]);
    expect(stored).toEqual([null, null]);
    expect(errors).toEqual([]);
  };

  test('a fresh profile starts on Learner and flies it with the coach on at 1280x720', async ({ page }) => {
    await freshLearnerFlight(page, false);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('a fresh profile starts on Learner and flies it with the coach on at 390x844, touch only', async ({ page }) => {
      await freshLearnerFlight(page, true);
    });
  });

  test('Pilot is one tap away and remembered across a reload', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('.btnAssist[data-assist="pilot"]').click();
    await expect(page.locator('.btnAssist[data-assist="pilot"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.btnAssist[data-assist="learner"]')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_assist_v1')))).toMatchObject({ v: 1, level: 'pilot' });
    await page.reload();
    await expect(page.locator('.btnAssist[data-assist="pilot"]')).toHaveAttribute('aria-pressed', 'true');
    expect((await debug(page)).assist).toBe('pilot');
  });

  test('a player who landed on Pilot without picking a level keeps Pilot and their bests', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.setItem('openaero_best',
      JSON.stringify({ v: 1, missions: { kdfw_35c_final: { score: 80, grade: 'A', at: 0 } } })));
    await page.reload();
    await expect(page.locator('.btnAssist[data-assist="pilot"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.btnMission[data-scenario="kdfw_35c_final"] .missionBest')).toHaveText('Best A');
    expect(await page.evaluate(() => localStorage.getItem('openaero_assist_v1'))).toBeNull();
  });

  test('private mode (storage throws) falls back to Learner without an error', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      const deny = () => { throw new DOMException('denied', 'SecurityError'); };
      Storage.prototype.getItem = deny;
      Storage.prototype.setItem = deny;
    });
    await page.goto(BASE);
    await expect(page.locator('.btnAssist[data-assist="learner"]')).toHaveAttribute('aria-pressed', 'true');
    expect((await debug(page)).assist).toBe('learner');
    expect(errors).toEqual([]);
  });
});

// A first visit flies Learner by touch: bank with the stick, let go, and the wings come back level.
for (const [w, h] of [[390, 844], [844, 390]]) {
  test.describe(`Learner by touch at ${w}x${h}`, () => {
    test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('the stick banks inside 45°, and letting go rolls the wings level', async ({ page }) => {
      await page.goto(BASE);
      const start = page.locator('#btnStartFlight');
      await start.scrollIntoViewIfNeeded();
      await start.tap();
      await expect(page.locator('#onboardingModal')).toBeHidden();
      expect((await debug(page)).assist).toBe('learner');
      const stick = await page.locator('#touchStick').boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x + stick.width - 2, y: cy, id: 1 }] });
      await expect.poll(async () => (await debug(page)).bankRightDeg, { timeout: 15_000 }).toBeGreaterThan(15);
      expect((await debug(page)).inputSource).toBe('stick');
      expect((await debug(page)).bankRightDeg).toBeLessThanOrEqual(45);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(async () => Math.abs((await debug(page)).bankRightDeg), { timeout: 20_000 }).toBeLessThan(5);
    });
  });
}

test('a stored level wins: Kid and Pilot load as stored', async ({ page }) => {
  for (const level of ['kid', 'pilot']) {
    await page.goto(BASE);
    await page.evaluate((l) => localStorage.setItem('openaero_assist_v1', JSON.stringify({ v: 1, level: l, at: 0 })), level);
    await page.reload();
    await expect(page.locator(`.btnAssist[data-assist="${level}"]`)).toHaveAttribute('aria-pressed', 'true');
    expect((await debug(page)).assist).toBe(level);
  }
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

test('Kid takeoff: full power, rotate, let go, and it climbs away (no "landing" graded)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(BASE);
  await page.locator('.btnAssist[data-assist="kid"]').click();
  await page.locator('.btnMission[data-scenario="kdfw_takeoff"]').click();
  await page.locator('#btnStartFlight').click();
  await page.click('#btnToga');
  await expect.poll(async () => (await debug(page)).iasKts, { timeout: 90_000 }).toBeGreaterThan(145);
  await page.keyboard.down('ArrowUp'); // nose up
  await expect.poll(async () => (await debug(page)).onGround, { timeout: 20_000 }).toBe(false);
  await page.keyboard.up('ArrowUp');
  await expect.poll(async () => (await debug(page)).aglFt, { timeout: 90_000 }).toBeGreaterThan(1000);
  const d = await debug(page);
  expect(d.lastLanding).toBeNull();
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
