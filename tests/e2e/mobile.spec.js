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
