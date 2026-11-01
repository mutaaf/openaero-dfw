import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, enterCockpit, lowContrastLabels } from './helpers.js';

// Ticket 0049: a controls cheat sheet one "?" or one Controls button away; the flight pauses under it.
test.beforeEach(async ({ page }) => { await stubTiles(page); });

const debug = (page) => page.evaluate(() => window.openaeroDebug());

test('"?" opens the controls sheet over a paused flight; flight keys stay out; Escape resumes (0049)', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  expect((await debug(page)).paused).toBe(false);
  await page.keyboard.press('Shift+Slash'); // "?"
  const sheet = page.locator('#controlsSheet');
  await expect(sheet).toBeVisible();
  // The keyboard section first on a laptop, every bound key listed (the unit test holds the rows to main.js).
  await expect(page.locator('#controlsBody h3').first()).toHaveText('Keyboard and mouse');
  await expect(page.locator('#controlsBody h3')).toHaveText(['Keyboard and mouse', 'Gamepad', 'Touch']);
  await expect(page.locator('#controlsBody dd', { hasText: 'Gear up / down' }).first()).toBeVisible();
  expect((await debug(page)).paused).toBe(true);
  await expect(page.locator('#btnPause')).toHaveText('RESUME');

  // A flight key does nothing behind the sheet; Tab stays inside it.
  const gear = (await debug(page)).gearDown;
  await page.keyboard.press('g');
  expect((await debug(page)).gearDown).toBe(gear);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
    expect(await page.evaluate(() => document.getElementById('controlsSheet').contains(document.activeElement))).toBe(true);
  }

  // Fits the 1280x720 view without scrolling the page; small text reads 4.5:1.
  const box = await page.locator('#controlsPanel').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  expect(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight)).toBe(true);
  expect(await lowContrastLabels(page, '#controlsSheet')).toEqual([]);
  await page.screenshot({ path: 'test-results/controls-1280x720.png' });

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect((await debug(page)).paused).toBe(false);
  // Escape closed the sheet, not the start screen behind nothing, and G flies again.
  await page.keyboard.press('g');
  await expect.poll(async () => (await debug(page)).gearDown).toBe(!gear);
  expect(errors).toEqual([]);
});

test('the Controls button opens it, Close returns focus there, and a paused flight stays paused (0049)', async ({ page }) => {
  await enterCockpit(page);
  await page.locator('#btnPause').click();
  const btn = page.locator('#btnControls');
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#controlsSheet')).toBeVisible();
  await page.locator('#btnCloseControls').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#controlsSheet')).toBeHidden();
  await expect(btn).toBeFocused();
  expect((await debug(page)).paused).toBe(true); // the player's own pause is theirs to lift
});

test('"?" on the start screen opens it over the picker; Escape closes only the sheet (0049)', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.keyboard.press('Shift+Slash');
  await expect(page.locator('#controlsSheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#controlsSheet')).toBeHidden();
  await expect(page.locator('#onboardingModal')).toBeVisible();
});
