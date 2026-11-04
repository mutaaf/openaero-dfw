import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0151: a first flight never opens in the dark. With no When? picked this visit and the
// live sun below civil twilight (-6°), the start screen preselects Day; Live stays one tap away
// and still gives the real (dark) sky. Dallas is on CST (UTC-6) in November 2026.
const DARK_MORNING = '2026-11-04T12:15:00Z'; // 06:15 CST, sun ~-12°
const LATE_EVENING = '2026-11-05T04:00:00Z'; // 22:00 CST
const NOON = '2026-11-04T18:00:00Z'; // 12:00 CST

const snap = (page) => page.evaluate(() => window.openaeroDebug());
const chip = (page, label) => page.locator('#timePicker .btnTime', { hasText: label });

test.beforeEach(async ({ page }) => { await stubTiles(page); });

for (const [name, at] of [['06:15', DARK_MORNING], ['22:00', LATE_EVENING]]) {
  test(`at ${name} Dallas time the first flight opens in daylight, not a dark Live (0151)`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.clock.setSystemTime(new Date(at));
    await page.goto(`${BASE}?debug`);
    await page.locator('#onboardingModal').waitFor({ state: 'visible' });
    await expect(page.locator('#timePicker .btnTime.active')).toHaveText(/Day/);
    await expect(chip(page, 'Day')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'Live')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#txtSkyNow')).toContainText("Today's midday in Dallas");
    await expect(page.locator('#txtSkyNow')).not.toContainText('Live');
    const s = (await snap(page)).sun;
    expect(s.mode).toBe('Noon');
    expect(s.elevationDeg).toBeGreaterThan(30);
    await page.locator('#btnStartFlight').click();
    await expect(page.locator('#txtTimeBadge')).toHaveText('Noon');
    expect(errors).toEqual([]);
  });
}

test('tapping Live while it is dark gives the real dark sky, labelled Live (0151)', async ({ page }) => {
  await page.clock.setSystemTime(new Date(DARK_MORNING));
  await page.goto(`${BASE}?debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await chip(page, 'Live').click();
  await expect(chip(page, 'Live')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#txtSkyNow')).toContainText('Live over Dallas');
  await expect(page.locator('#txtSkyNow')).toContainText('dark');
  const s = (await snap(page)).sun;
  expect(s.mode).toBe('Now');
  expect(s.elevationDeg).toBeLessThan(-6);
  // The pick is kept through Start flight.
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#txtTimeBadge')).toHaveText('Now');
});

test('at noon Dallas time Live stays the default (0151)', async ({ page }) => {
  await page.clock.setSystemTime(new Date(NOON));
  await page.goto(BASE);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#timePicker .btnTime.active')).toHaveText(/Live/);
  await expect(page.locator('#txtSkyNow')).toContainText('Live over Dallas');
});

test('a night mission still flies at night when the first flight opened in daylight (0151)', async ({ page }) => {
  await page.clock.setSystemTime(new Date(DARK_MORNING));
  await page.goto(`${BASE}?debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#missionList .btnMission[data-scenario="kdfw_35c_night"]').click();
  await expect.poll(async () => (await snap(page)).sun.mode).toBe('Night');
  await expect(chip(page, 'Night')).toHaveAttribute('aria-pressed', 'true');
  // The next mission without its own sky gives back the preselected Day.
  await page.locator('#missionList .btnMission[data-scenario="kdfw_35c_final"]').click();
  await expect.poll(async () => (await snap(page)).sun.mode).toBe('Noon');
});
