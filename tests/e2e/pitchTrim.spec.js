import { test, expect } from './fixtures.js';
import { stubTiles, enterCockpit, collectErrors } from './helpers.js';

// Pitch trim (ticket 0094), desktop, Pilot: ] trims nose up (the hands-off speed falls), [ nose
// down. The physics of a trimmed speed holding hands off is a flight card
// (tests/flight/c172.test.js); this pins the keys reaching it.
const snap = (page) => page.evaluate(() => window.openaeroDebug());

test('keyboard: ] trims nose up and [ nose down in Pilot', async ({ page }) => {
  const errors = collectErrors(page);
  await stubTiles(page);
  await enterCockpit(page);
  const s0 = await snap(page);
  expect(s0.assist).toBe('pilot');
  expect(s0.trimKts).toBeGreaterThan(100);
  await page.keyboard.down('BracketRight');
  await expect.poll(async () => (await snap(page)).trimKts, { timeout: 10_000 }).toBeLessThan(s0.trimKts - 8);
  await page.keyboard.up('BracketRight');
  const s1 = await snap(page);
  await page.keyboard.down('BracketLeft');
  await expect.poll(async () => (await snap(page)).trimKts, { timeout: 10_000 }).toBeGreaterThan(s1.trimKts + 8);
  await page.keyboard.up('BracketLeft');
  // Let go and it stays where it was put.
  const s2 = await snap(page);
  await page.waitForTimeout(500);
  expect((await snap(page)).trimAlphaDeg).toBeCloseTo(s2.trimAlphaDeg, 1);
  expect(errors).toEqual([]);
});
