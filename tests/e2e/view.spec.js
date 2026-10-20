import { test, expect } from '@playwright/test';
import { BASE, stubTiles, collectErrors, enterCockpit } from './helpers.js';

// A first visit gets the clean view on desktop: the world, the HUD, one top row and the keys.
// The panels are one key (H) or one button away, and the choice is remembered.
test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('clean view by default; H brings the panels back and it is remembered', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  await expect(page.locator('#eicasPanel')).toBeHidden();
  await expect(page.locator('#mapPanel')).toBeHidden();
  await expect(page.locator('#topRow')).toBeVisible();
  await expect(page.locator('#keyHints')).toBeVisible();
  await expect(page.locator('#txtPhoneThr')).toHaveText(/\d+%/);
  // The menu sheet still opens over the clean view.
  await page.locator('#btnMenu').click();
  await expect(page.locator('#btnTimeOfDay')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('h');
  await expect(page.locator('#eicasPanel')).toBeVisible();
  await expect(page.locator('#keyHints')).toBeHidden();
  await page.reload();
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#eicasPanel')).toBeVisible();
  await page.locator('#btnPanelsHide').click();
  await expect(page.locator('#eicasPanel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the start screen picks the time of day and says what the sky over Dallas is doing', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.locator('#timePicker .btnTime.active')).toHaveText(/Live/);
  await expect(page.locator('#txtSkyNow')).toContainText('Live over Dallas');
  await page.locator('#timePicker .btnTime', { hasText: 'Night' }).click();
  await expect(page.locator('#txtSkyNow')).toContainText("Today's night in Dallas");
  await expect(page.locator('#txtSkyNow')).toContainText('Moon');
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#txtTimeBadge')).toHaveText('Night');
});
