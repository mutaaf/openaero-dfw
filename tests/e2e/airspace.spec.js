import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, enterCockpit } from './helpers.js';

// Ticket 0197: DFW's Class B shelves on the moving map (src/airspace.js, a lazy chunk), from the FAA's
// Class Airspace layer baked into public/airspace/dfw-classb-v1.json (tests/unit/airspace.test.js
// checks every floor and ceiling). Fetched only where the map panel is shown: not in the clean view
// until the panels come back, never on a phone (the panel is hidden on touch screens).
const isAirspace = (url) => /\/openaero\/airspace\/dfw-classb-v1\.json$/.test(url);
const snap = (page) => page.evaluate(() => window.openaeroDebug().airspace);

function watch(page) {
  const hits = [];
  page.on('request', (r) => { if (isAirspace(r.url())) hits.push(r.url()); });
  return hits;
}

test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('the map draws the Class B around DFW, says where you are and that it is not for navigation', async ({ page }) => {
  const errors = collectErrors(page);
  const hits = watch(page);
  await enterCockpit(page);
  await expect(page.locator('#mapPanel')).toBeVisible();
  await expect.poll(() => snap(page), { timeout: 10_000 }).toMatchObject({ shelves: 15, note: 'NOT FOR NAVIGATION' });
  // The default spawn is a final to DFW: inside the surface area (Area A, surface to 11,000 ft).
  await expect.poll(async () => (await snap(page)).status, { timeout: 5_000 }).toBe('IN CLASS B (SFC-11,000)');
  const a = await snap(page);
  expect(a.area).toBe('A');
  expect(a.drawn).toBeGreaterThan(0);
  expect(a.frames).toBeGreaterThan(0);
  // The canvas is the panel's size, not the 120x80 fallback stretched over it.
  const fit = await page.evaluate(() => {
    const c = document.getElementById('mapCanvas'), r = c.parentElement.getBoundingClientRect();
    return { w: c.width, h: c.height, rw: Math.floor(r.width), rh: Math.floor(r.height) };
  });
  expect([fit.w, fit.h]).toEqual([fit.rw, fit.rh]);
  expect(hits).toHaveLength(1);
  expect(errors).toEqual([]);
});

test.describe('clean view', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('fetches nothing while the map is folded away; H shows it, sized, with the airspace', async ({ page }) => {
    const errors = collectErrors(page);
    const hits = watch(page);
    await enterCockpit(page);
    await expect(page.locator('#mapPanel')).toBeHidden();
    await page.waitForTimeout(500); // a "nothing happened" hold
    expect(hits).toHaveLength(0);
    expect(await snap(page)).toBeNull();
    await page.keyboard.press('h');
    await expect(page.locator('#mapPanel')).toBeVisible();
    await expect.poll(async () => (await snap(page))?.drawn ?? 0, { timeout: 10_000 }).toBeGreaterThan(0);
    const fit = await page.evaluate(() => {
      const c = document.getElementById('mapCanvas'), r = c.parentElement.getBoundingClientRect();
      return { w: c.width, rw: Math.floor(r.width) };
    });
    expect(fit.w).toBe(fit.rw);
    expect(fit.w).toBeGreaterThan(120);
    expect(errors).toEqual([]);
  });
});

test.describe('390x844 phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('has no moving map, so fetches no airspace', async ({ page }) => {
    const errors = collectErrors(page);
    const hits = watch(page);
    await enterCockpit(page);
    await expect(page.locator('#mapPanel')).toBeHidden();
    await page.waitForTimeout(500); // a "nothing happened" hold
    expect(hits).toHaveLength(0);
    expect(await snap(page)).toBeNull();
    expect(errors).toEqual([]);
  });
});
