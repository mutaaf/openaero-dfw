import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Marquee ads (operator decision 2026-10-30, src/ads.js): the start screen and the results card
// only, never in flight; none on Kid; the reward is opt-in. A recording loader stands in for
// mutaafaziz.com/ads/v1/ads.js: every slot fills, every call is logged with where the player was.
const LOADER = `
  window.__adCalls = [];
  const where = () => {
    const shown = (id) => !document.getElementById(id).classList.contains('hidden');
    return shown('onboardingModal') || shown('resultsCard') ? 'menu' : 'flight';
  };
  const log = (kind, id) => window.__adCalls.push({ kind, id, where: where() });
  window.marquee = {
    v: 1,
    ready: () => Promise.resolve({ enabled: true, slots: {
      title: { source: 'direct' }, postflight: { source: 'direct' }, livery: { source: 'direct' } } }),
    banner: (el, id) => log('banner', id),
    interstitial: (id, h) => { log('interstitial', id); h.beforeAd(); window.__adPaused = window.openaeroDebug().paused; h.afterAd(); return Promise.resolve(); },
    rewarded: (id, h) => { log('rewarded', id); h.beforeAd(); h.afterAd(); return Promise.resolve(true); },
  };`;

test.beforeEach(async ({ page }) => {
  await stubTiles(page);
  await page.route('**/ads/v1/ads.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: LOADER }));
});

const calls = (page) => page.evaluate(() => window.__adCalls);

test('no ad call fires in flight; the menu banner and opt-in reward do', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(BASE);
  await expect(page.locator('#btnLivery')).toBeVisible();
  await expect.poll(() => calls(page)).toEqual([{ kind: 'banner', id: 'title', where: 'menu' }]);
  await page.locator('#btnLivery').click();
  await expect(page.locator('#btnLivery')).toBeHidden(); // earned: gold for this visit
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  const before = (await calls(page)).length;
  await page.waitForTimeout(5000); // flying
  const after = await calls(page);
  expect(after.length).toBe(before);
  expect(after.filter((c) => c.where === 'flight')).toEqual([]);
  expect(after.map((c) => c.kind)).toEqual(['banner', 'rewarded']);
  expect(errors).toEqual([]);
});

test('the post-flight break skips the first FLY AGAIN and shows paused behind the card', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  const flyAgain = async () => {
    await page.evaluate(() => document.getElementById('resultsCard').classList.remove('hidden'));
    await page.locator('#btnFlyAgain').click();
    await expect(page.locator('#resultsCard')).toBeHidden();
  };
  await flyAgain();
  expect((await calls(page)).filter((c) => c.kind === 'interstitial')).toEqual([]);
  await flyAgain();
  expect((await calls(page)).filter((c) => c.kind === 'interstitial')).toEqual([{ kind: 'interstitial', id: 'postflight', where: 'menu' }]);
  expect(await page.evaluate(() => window.__adPaused)).toBe(true);
  await flyAgain(); // capped: the next break is minutes away
  expect((await calls(page)).filter((c) => c.kind === 'interstitial').length).toBe(1);
  expect((await page.evaluate(() => window.openaeroDebug())).paused).toBe(false);
});

test('Kid shows no ads at all', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.locator('#btnLivery')).toBeVisible();
  await page.locator('.btnAssist[data-assist="kid"]').click();
  await expect(page.locator('#btnLivery')).toBeHidden();
  await expect(page.locator('#adTitle')).toBeHidden();
  await page.locator('.btnAssist[data-assist="pilot"]').click();
  await expect(page.locator('#btnLivery')).toBeVisible();
});

test.describe('without the loader', () => {
  test('a missing loader is a no-op', async ({ page }) => {
    await page.route('**/ads/v1/ads.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    const errors = collectErrors(page);
    await page.goto(BASE);
    await page.waitForTimeout(1000);
    await expect(page.locator('#btnLivery')).toBeHidden();
    await expect(page.locator('#adTitle')).toBeHidden();
    expect(errors).toEqual([]);
  });
});
