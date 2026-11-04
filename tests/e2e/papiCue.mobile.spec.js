import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0089 on a phone (390x844): the top bar's PAPI cell shows every reading's fly-to glyph and short
// word without wrapping, overflowing, or moving the strip; LOW and SLIGHTLY LOW (both "LOW") differ.
const SHORT = ['LOW', 'LOW', 'ON GS', 'HIGH', 'HIGH'];

test('the phone PAPI cell holds every reading in place (0089)', async ({ page }) => {
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  await expect(page.locator('#txtPhonePapi')).toBeVisible();
  const boxes = await page.evaluate((short) => {
    const el = document.getElementById('txtPhonePapi');
    const strip = document.getElementById('phoneTelemetry');
    return short.map((word, n) => {
      el.dataset.papi = n; el.textContent = word;
      const r = el.getBoundingClientRect(), s = strip.getBoundingClientRect(), cell = el.parentElement;
      return { glyph: getComputedStyle(el, '::before').content, h: Math.round(r.height), stripH: Math.round(s.height),
        inside: r.left >= s.left && r.right <= s.right, fits: cell.scrollWidth <= cell.clientWidth + 1 };
    });
  }, SHORT);
  expect(new Set(boxes.map((b) => b.glyph)).size).toBe(5);
  expect(new Set(boxes.map((b) => b.h)).size, JSON.stringify(boxes)).toBe(1);
  expect(new Set(boxes.map((b) => b.stripH)).size, JSON.stringify(boxes)).toBe(1);
  for (const b of boxes) expect(b, JSON.stringify(b)).toMatchObject({ inside: true, fits: true });
  expect(errors).toEqual([]);
});
