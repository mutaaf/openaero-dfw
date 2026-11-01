import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
import { recordCaptions } from './captionHelpers.js';

// Ticket 0127: past the flaps' placard (or VMO / VNE) one "overspeed" is captioned and spoken and
// the IAS box flashes amber; the tape marks the limit. A warning only. Kid has none.
const snap = (page) => page.evaluate(() => window.openaeroDebug());
const overspeedCaps = (page) => page.evaluate(() => window.__captions.filter((c) => c.text.includes('overspeed')).length);

async function fly(page, assist) {
  await stubTiles(page);
  await page.goto(`${BASE}?debug`);
  if (assist) await page.locator(`.btnAssist[data-assist="${assist}"]`).click();
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  await recordCaptions(page);
}

test('the 737 on the default final (Vref + 5, flaps 30) is inside its 175 kt limit; 50 kt fast it calls overspeed once', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await fly(page, 'learner');
  const s = await snap(page);
  expect(s.mission).toBe('kdfw_35c_final');
  expect(s.speedLimitKts).toBe(175);
  await page.waitForTimeout(2_000);
  expect((await snap(page)).overspeed).toBe(false);
  expect(await overspeedCaps(page)).toBe(0);

  // The same final 50 kt fast (~205 KIAS), flaps 30.
  await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 4, 50));
  await expect.poll(async () => (await snap(page)).overspeed, { timeout: 5_000 }).toBe(true);
  // Learner reads what to do (captions.js PLAIN). Read from the recorded caption history, not the
  // live line: it shows for 1.2 s of wall time from the same frame as the latch, and the poll
  // above can see the latch up to a second late on a busy CI runner (red main after #148).
  await expect.poll(() => page.evaluate(() => window.__captions.map((c) => c.text)), { timeout: 5_000 })
    .toContain('overspeed · slow down');
  // Held over the limit for a few seconds: still the one call, not one per frame or gust.
  await page.waitForTimeout(3_000);
  expect((await snap(page)).overspeed).toBe(true);
  expect(await overspeedCaps(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('Kid has no speed limit to keep: no mark, no call, however fast', async ({ page }) => {
  test.setTimeout(60_000);
  await fly(page, 'kid');
  await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 4, 50));
  await page.waitForTimeout(3_000);
  const s = await snap(page);
  expect(s.speedLimitKts).toBeNull();
  expect(s.overspeed).toBe(false);
  expect(await overspeedCaps(page)).toBe(0);
});
