// Ticket 0007: the accessibility floor in AGENTS.md (reduced motion, contrast, keyboard).
import { test, expect } from '@playwright/test';
import { BASE, stubTiles, collectErrors, lowContrastLabels } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await stubTiles(page);
});

test('reduced motion: no CSS animation runs, alerts stay visible but still (0007)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  // Force the pulsing alerts on, and reopen the modal (its live dot pings).
  await page.evaluate(() => {
    for (const id of ['masterAlertBanner', 'stallAlertBanner']) {
      const el = document.getElementById(id);
      el.classList.remove('hidden');
      el.style.setProperty('display', 'block', 'important');
    }
  });
  await page.locator('#btnOpenMissions').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#masterAlertBanner')).toBeVisible();
  const running = await page.evaluate(() => document.getAnimations()
    .map((a) => `${a.constructor.name} ${a.animationName || a.transitionProperty || ''} on ${a.effect?.target?.id || a.effect?.target?.className}`));
  expect(running).toEqual([]);
  // The scanline overlay is a constant flicker-like pattern: gone under reduce.
  await expect(page.locator('.scanlines')).toBeHidden();
  expect(errors).toEqual([]);
});

test('without reduced motion the alert still pulses (0007)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(BASE);
  const names = await page.evaluate(() => document.getAnimations().map((a) => a.animationName));
  expect(names).toContain('ping');
  await expect(page.locator('.scanlines')).toBeVisible();
});

test('keyboard: Tab reaches ENTER COCKPIT with a visible focus ring, Enter starts the flight (0007)', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.locator('#onboardingModal')).toBeVisible();
  let reached = false;
  for (let i = 0; i < 30 && !reached; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.id);
    // Focus never leaves the open modal.
    expect(await page.evaluate(() => document.getElementById('onboardingModal').contains(document.activeElement))).toBe(true);
    reached = id === 'btnStartFlight';
  }
  expect(reached).toBe(true);
  const outline = await page.locator('#btnStartFlight').evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Enter');
  await expect(page.locator('#onboardingModal')).toBeHidden();
});

test('keyboard: the modal traps focus both ways (0007)', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('#btnStartFlight').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('btnCloseModal');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('btnStartFlight');
  await expect(page.locator('#onboardingModal')).toHaveAttribute('aria-modal', 'true');
});

test('keyboard: Escape closes the modal and focus returns to Missions (0007)', async ({ page }) => {
  await page.goto(BASE);
  await page.keyboard.press('Escape');
  await expect(page.locator('#onboardingModal')).toBeHidden();
  // Reopened from the HUD: focus goes into the modal, and back to the opener on Escape.
  await page.locator('#btnOpenMissions').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#onboardingModal')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('onboardingModal').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#onboardingModal')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('btnOpenMissions');
});

test('focus rings show on HUD buttons and selects (0007)', async ({ page }) => {
  await page.goto(BASE);
  await page.keyboard.press('Escape');
  for (const sel of ['#btnPause', '#selAircraft', '#btnApApr']) {
    await page.locator(sel).focus();
    // Keyboard-initiated focus: Playwright's .focus() counts as programmatic; press a no-op key.
    await page.keyboard.press('Shift');
    const s = await page.locator(sel).evaluate((el) => {
      const c = getComputedStyle(el);
      const alpha = Number((c.outlineColor.match(/[\d.]+/g) || [])[3] ?? 1);
      return { style: c.outlineStyle, width: parseFloat(c.outlineWidth), alpha };
    });
    expect(s.style, sel).not.toBe('none');
    expect(s.width, sel).toBeGreaterThanOrEqual(2);
    expect(s.alpha, sel).toBeGreaterThan(0.5);
  }
});

test('small HUD labels reach 4.5:1 against their panels (0007)', async ({ page }) => {
  await page.goto(BASE);
  expect(await lowContrastLabels(page, '#onboardingModal')).toEqual([]);
  await page.keyboard.press('Escape');
  expect(await lowContrastLabels(page, 'header, aside, .hud-glass')).toEqual([]);
});

test('8 px HUD labels are gone (0007)', async ({ page }) => {
  await page.goto(BASE);
  const tiny = await page.evaluate(() => [...document.querySelectorAll('header *, aside *, #touchDeck *')]
    .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 9)
    .map((el) => el.textContent.trim()));
  expect(tiny).toEqual([]);
});

test('keyboard: Space flies, it does not press the focused HUD button (0007)', async ({ page }) => {
  await page.goto(BASE);
  await page.keyboard.press('Escape');
  await page.locator('#btnOpenMissions').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  await expect(page.locator('#onboardingModal')).toBeHidden();
  // Enter still activates it: the keyboard path stays.
  await page.keyboard.press('Enter');
  await expect(page.locator('#onboardingModal')).toBeVisible();
});

test('keyboard: Tab from outside the modal and Shift+Tab from its first control stay inside (0007)', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('btnStartFlight');
  await page.locator('#btnCloseModal').focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('btnStartFlight');
});

test('mouse: ENTER COCKPIT leaves no HUD button focused (0007)', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await page.locator('#btnOpenMissions').click();
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});
