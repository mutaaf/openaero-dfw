import { test, expect } from '@playwright/test';
import { BASE, stubTiles, collectErrors, enterCockpit } from './helpers.js';

const PROMPTS = /PAPI|high|low|Sinking|Flare|Idle/;

test.beforeEach(async ({ page }) => { await stubTiles(page); });

// Ticket 0008: a first-time player gets the coach on the default final, can skip it, and
// a second visit doesn't show it unless re-enabled from the modal.
test('first visit coaches the default final; Skip dismisses it; a reload does not coach', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  await expect(page.locator('#coach')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#txtCoach')).toHaveText(PROMPTS);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_coach_v1')))).toMatchObject({ v: 1, seen: true });

  await page.locator('#btnCoachSkip').click();
  await expect(page.locator('#coach')).toBeHidden();

  await page.reload();
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#chkCoach')).not.toBeChecked();
  await page.locator('#btnStartFlight').click();
  await page.waitForTimeout(500);
  await expect(page.locator('#coach')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the coach can be re-enabled from the modal', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('openaero_coach_v1', JSON.stringify({ v: 1, seen: true, at: 1 })));
  await page.goto(BASE);
  await page.locator('#chkCoach').check();
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#coach')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#txtCoach')).toHaveText(PROMPTS);
});

test('the coach stays out of other missions and steps aside for the autopilot', async ({ page }) => {
  await enterCockpit(page);
  await expect(page.locator('#coach')).toBeVisible({ timeout: 5_000 });
  await page.click('#btnApApr');
  await expect(page.locator('#coach')).toBeHidden();
  await page.click('#btnApApr');
  await page.click('#btnApMaster'); // ILS on set AP master; both off hands the aircraft back
  await expect(page.locator('#coach')).toBeVisible({ timeout: 5_000 });
  await page.selectOption('#selScenario', 'kdfw_35c_flare');
  await page.waitForTimeout(2_000);
  await expect(page.locator('#coach')).toBeHidden();
});

test('Skip works while paused, and picking another mission first does not burn the first visit', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('.btnMission[data-scenario="kdfw_takeoff"]').click();
  await page.locator('#btnStartFlight').click();
  await page.waitForTimeout(500);
  await expect(page.locator('#coach')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('openaero_coach_v1'))).toBeNull();

  await page.locator('#btnOpenMissions').click();
  await page.locator('.btnMission[data-scenario="kdfw_35c_final"]').click();
  await page.locator('#btnCloseModal').click(); // ✕ honours the coach checkbox too
  await expect(page.locator('#coach')).toBeVisible({ timeout: 5_000 });
  await page.click('#btnPause');
  await page.locator('#btnCoachSkip').click();
  await expect(page.locator('#coach')).toBeHidden();
});

test('desktop: the coach sits clear of the panels and the horizon at 1280x720', async ({ page }) => {
  await enterCockpit(page);
  await expect(page.locator('#coach')).toBeVisible({ timeout: 5_000 });
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const coach = await page.locator('#coach').boundingBox();
  for (const sel of ['#phoneHeader', '#mapPanel', '#virtualStickPad', 'aside >> nth=0']) {
    expect(overlaps(coach, await page.locator(sel).boundingBox()), `coach vs ${sel}`).toBe(false);
  }
  expect(overlaps(coach, { x: 0, y: 720 * 0.4, width: 1280, height: 720 * 0.2 }), 'coach covers the horizon').toBe(false);
});
