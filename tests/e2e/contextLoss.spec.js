import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, distinctColours, enterCockpit } from './helpers.js';

// Ticket 0034: the browser can take the WebGL context back (a backgrounded phone, memory
// pressure). WEBGL_lose_context forces it: the sim pauses behind an overlay, comes back
// drawing on restore, and offers Reload when the GPU stays away for 5 s.
const debug = (page) => page.evaluate(() => window.openaeroDebug());
const loseContext = (page) => page.evaluate(() => {
  const gl = document.getElementById('simCanvas').getContext('webgl2');
  window.__lc = gl.getExtension('WEBGL_lose_context');
  window.__lc.loseContext();
});
const restoreContext = (page) => page.evaluate(() => window.__lc.restoreContext());

test.describe('lost WebGL context', () => {
  test.beforeEach(async ({ page }) => { await stubTiles(page); });

  test('loss pauses behind the overlay; restore draws again and Resume flies on', async ({ page }) => {
    const errors = collectErrors(page);
    await enterCockpit(page);
    await expect.poll(async () => (await debug(page)).terrain.drawn, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await debug(page)).simTime).toBeGreaterThan(0.5);

    await loseContext(page);
    await expect(page.locator('#gfxLost')).toBeVisible();
    await expect(page.locator('#txtGfxLost')).toContainText('reclaimed the GPU');
    await expect(page.locator('#btnGfxResume')).toBeHidden();
    const a = await debug(page);
    expect(a.gfxLost).toBe(true);
    expect(a.paused).toBe(true);
    expect(a.terrain.cached).toBe(0); // the imagery cache was dropped
    // PAUSE/RESUME can't fly the airplane blind.
    await page.locator('#btnPause').evaluate((b) => b.click());
    await page.waitForTimeout(500);
    const b = await debug(page);
    expect(b.paused).toBe(true);
    expect(b.simTime).toBe(a.simTime);

    await restoreContext(page);
    await expect(page.locator('#btnGfxResume')).toBeVisible();
    await expect(page.locator('#btnGfxResume')).toBeFocused();
    expect((await debug(page)).gfxLost).toBe(false);
    await page.keyboard.press('Enter'); // a keyboard path to resume
    await expect(page.locator('#gfxLost')).toBeHidden();
    expect((await debug(page)).paused).toBe(false);
    await expect.poll(async () => (await debug(page)).simTime).toBeGreaterThan(a.simTime + 0.3);
    await expect.poll(async () => (await debug(page)).terrain.drawn, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect.poll(() => distinctColours(page, '#simCanvas'), { timeout: 15_000 }).toBeGreaterThan(3);
    expect(errors).toEqual([]);
  });

  test('a player who had paused stays paused after the GPU returns', async ({ page }) => {
    const errors = collectErrors(page);
    await enterCockpit(page);
    await page.locator('#btnPause').click();
    expect((await debug(page)).paused).toBe(true);
    await loseContext(page);
    await expect(page.locator('#gfxLost')).toBeVisible();
    await restoreContext(page);
    await page.locator('#btnGfxResume').click();
    await expect(page.locator('#gfxLost')).toBeHidden();
    expect((await debug(page)).paused).toBe(true);
    expect(errors).toEqual([]);
  });

  test('no restore within 5 s offers Reload', async ({ page }) => {
    const errors = collectErrors(page);
    await enterCockpit(page);
    await loseContext(page);
    await expect(page.locator('#gfxLost')).toBeVisible();
    await expect(page.locator('#btnGfxReload')).toBeHidden();
    await expect(page.locator('#btnGfxReload')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('#txtGfxLost')).toContainText('Reload');
    await page.locator('#btnGfxReload').click();
    await page.locator('#onboardingModal').waitFor({ state: 'visible' }); // a fresh page
    expect(errors).toEqual([]);
  });
});
