import { test, expect } from '@playwright/test';
import { stubTiles, collectErrors, enterCockpit } from './helpers.js';

test.beforeEach(async ({ page }) => { await stubTiles(page); });

// The autopilot shows and teaches: it explains what it's doing in the coach's card, the
// controls it moves glow, and "Your turn" hands the aircraft (and the coach) back.
test('autoland explains itself, lights its controls, and Your turn hands control back', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  await page.click('#btnApApr');
  await expect(page.locator('#txtCoachLabel')).toHaveText('Autopilot', { timeout: 5_000 });
  await expect(page.locator('#txtCoach')).toHaveText(/glidepath|line up|Speed|throttle|PAPI/);
  const panel = (await page.viewportSize()).width >= 1024 ? '#virtualStickPad' : '#touchStick';
  await expect(page.locator(panel)).toHaveClass(/ap-flying/);
  await expect(page.locator('#btnTakeover')).toBeVisible();
  await expect(page.locator('#btnCoachSkip')).toHaveText('Hide');

  await page.click('#btnTakeover');
  await expect(page.locator('#btnApApr')).not.toHaveClass(/(^|\s)active(\s|$)/);
  await expect(page.locator(panel)).not.toHaveClass(/ap-flying/);
  await expect(page.locator('#btnTakeover')).toBeHidden();
  // The coach picks up the hand-flown final.
  await expect(page.locator('#txtCoachLabel')).toHaveText('Coach', { timeout: 5_000 });
  await expect(page.locator('#btnCoachSkip')).toHaveText('Skip');
  expect(errors).toEqual([]);
});

test('the tutor works on any mission, and Hide turns it off for good', async ({ page }) => {
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'downtown_skyline');
  await page.click('#btnApMaster');
  await expect(page.locator('#txtCoachLabel')).toHaveText('Autopilot', { timeout: 5_000 });
  await expect(page.locator('#txtCoach')).toHaveText(/Holding heading \d{3}° and \d+ ft/);

  await page.locator('#btnCoachSkip').click();
  await expect(page.locator('#coach')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_tutor_v1')))).toMatchObject({ v: 1, on: false });

  await page.reload();
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await expect(page.locator('#chkTutor')).not.toBeChecked();
});
