import { test, expect } from '@playwright/test';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0045: the twin-jet's detailed glTF model loads after Fly, from our own origin only,
// and replaces the primitive stand-in in the chase view; the credits are one tap from the start.
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());
const MODEL_REQ = /\.glb$|GLTFLoader|meshopt|aircraftModel/;

test('the twin-jet model loads after Fly, same-origin, and swaps in for the stand-in', async ({ page }, info) => {
  const errors = collectErrors(page);
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(BASE);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  expect((await snap(page)).aircraft).toBe('b738');
  // Nothing about the model is fetched at boot.
  expect(requests.filter((u) => MODEL_REQ.test(u))).toEqual([]);
  expect((await snap(page)).aircraftModel).toBeUndefined();

  await page.locator('#btnStartFlight').click();
  await expect.poll(async () => (await snap(page)).aircraftModel, { timeout: 30_000 }).toBe('twinjet');
  const modelReqs = requests.filter((u) => MODEL_REQ.test(u));
  expect(modelReqs.some((u) => u.endsWith('/openaero/models/twinjet-v1.glb'))).toBe(true);
  const origin = new URL(page.url()).origin;
  expect(modelReqs.filter((u) => !u.startsWith(`${origin}/openaero/`))).toEqual([]);
  // Gear up in flight hides the wheels (the model's gear nodes follow sim.gearDown).
  await page.keyboard.press('g');
  await expect.poll(async () => (await snap(page)).gearDown).toBe(false);

  await page.locator('#btnCamera').click(); // Orbit Chase
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath('chase-1280x720.png') });
  expect(errors).toEqual([]);
});

test('switching aircraft drops the model; switching back brings it back without a refetch', async ({ page }) => {
  const errors = collectErrors(page);
  let glb = 0;
  page.on('request', (r) => { if (r.url().endsWith('.glb')) glb++; });
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await expect.poll(async () => (await snap(page)).aircraftModel, { timeout: 30_000 }).toBe('twinjet');
  await page.locator('#selAircraft').selectOption('c172');
  expect((await snap(page)).aircraftModel).toBeUndefined();
  await page.locator('#selAircraft').selectOption('b738');
  await expect.poll(async () => (await snap(page)).aircraftModel, { timeout: 10_000 }).toBe('twinjet');
  expect(glb).toBe(1);
  expect(errors).toEqual([]);
});

test('a model that fails to load leaves the stand-in flying, with a warning, not an error', async ({ page }) => {
  const errors = collectErrors(page);
  await page.route('**/models/*.glb', (route) => route.fulfill({ status: 200, body: 'not a glb' }));
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await page.waitForTimeout(3000);
  expect((await snap(page)).aircraftModel).toBeUndefined();
  expect((await snap(page)).simTime).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

for (const size of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
  test(`credits are one tap from the start screen at ${size.width}x${size.height} and name the model's licence`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(BASE);
    const link = page.locator('#lnkCredits');
    await expect(link).toBeVisible();
    await expect(link).toBeInViewport();
    const box = await link.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    // Fly is still whole and tappable next to it.
    const fly = await page.locator('#btnStartFlight').boundingBox();
    expect(fly.x + fly.width).toBeLessThanOrEqual(size.width);
    expect(box.x + box.width).toBeLessThanOrEqual(fly.x);
    const res = await page.request.get(new URL(await link.getAttribute('href'), page.url()).href);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('weirdybeardyman');
    expect(text).toContain('CC0');
  });
}
