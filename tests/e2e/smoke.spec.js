import { test, expect } from '@playwright/test';
import { BASE, stubTiles, collectErrors, distinctColours, enterCockpit } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await stubTiles(page);
});

test('boots under the base path with zero console errors', async ({ page }) => {
  const errors = collectErrors(page);
  const res = await page.goto(BASE);
  expect(res.status()).toBe(200);
  await expect(page).toHaveTitle(/Dallas Metroplex/);
  await expect(page.locator('#btnStartFlight')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('only loads assets from its own origin and the Esri tile host', async ({ page }) => {
  const hosts = new Set();
  page.on('request', (r) => hosts.add(new URL(r.url()).host));
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  hosts.delete('localhost:4173');
  hosts.delete('server.arcgisonline.com');
  expect([...hosts]).toEqual([]);
});

test('the 3D scene renders (WebGL canvas is not blank)', async ({ page }) => {
  await enterCockpit(page);
  // Poll: under parallel load SwiftShader can take a few seconds to draw the first frames.
  await expect.poll(() => distinctColours(page, '#simCanvas'), { timeout: 15_000 }).toBeGreaterThan(3);
});

test('shows the satellite imagery attribution', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.locator('.imagery-credit')).toContainText('Esri');
});

test('the simulation advances on its own', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  const agl = page.locator('#txtAltAgl');
  await expect(agl).toHaveText(/\d+ FT/);
  const first = await agl.textContent();
  await expect.poll(() => agl.textContent(), { timeout: 10_000 }).not.toBe(first);
  expect(errors).toEqual([]);
});

test('keyboard input deflects the controls', async ({ page }) => {
  await enterCockpit(page);
  await page.keyboard.down('KeyD');
  await expect.poll(() => page.locator('#meterAil').textContent(), { timeout: 5_000 }).not.toBe('0%');
  await page.keyboard.up('KeyD');
});

test('gear, flaps and camera toggles update the panel', async ({ page }) => {
  await enterCockpit(page);
  await page.keyboard.press('KeyF');
  await expect(page.locator('#txtFlaps')).toHaveText('40°');
  await page.keyboard.press('KeyC');
  await expect(page.locator('#txtCamMode')).toHaveText('Orbit Chase');
  await page.keyboard.press('KeyB');
  await expect(page.locator('#txtBrakes')).toHaveText('SET');
});

test('every mission loads without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  const missions = await page.locator('#selScenario option').evaluateAll((o) => o.map((x) => x.value));
  expect(missions.length).toBeGreaterThanOrEqual(6);
  for (const m of missions) {
    await page.selectOption('#selScenario', m);
    await page.waitForTimeout(300);
  }
  for (const plane of ['c172', 'f16', 'b738']) {
    await page.selectOption('#selAircraft', plane);
    await page.waitForTimeout(200);
  }
  expect(errors).toEqual([]);
});
