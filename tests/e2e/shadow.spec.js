// The aircraft's ground shadow (ticket 0190): on a day final it lies where the sun throws it,
// h / tan(sun elevation) from under the airplane on terrain.js's ground, and darkens the runway; at
// night and above 600 ft AGL it is gone.
import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, collectErrors, FULL_RES } from './helpers.js';

test.use(FULL_RES);

const snap = (page) => page.evaluate(() => window.openaeroDebug());
const shadow = (page) => page.evaluate(() => ({ ...window.openaeroShadow.state, meshVisible: window.openaeroShadow.mesh.visible }));
const frames = (page, n = 3) => page.evaluate(async (n) => {
  for (let k = 0; k < n; k++) await new Promise((r) => requestAnimationFrame(() => r()));
}, n);

async function pickTime(page, label) {
  await page.locator('#btnOpenMissions').click();
  await page.locator('#timePicker .btnTime', { hasText: label }).click();
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
}

// A final distNm out, one physics frame, then paused (as night.spec.js's landing light).
async function finalAt(page, distNm) {
  await page.evaluate(async (d) => {
    window.openaeroDebugFinal('KDFW', '35C', d);
    await new Promise((r) => requestAnimationFrame(() => r()));
    document.getElementById('btnPause').click();
  }, distNm);
  await expect.poll(async () => (await snap(page)).paused).toBe(true);
  await frames(page);
}

test.beforeEach(async ({ page }) => {
  await stubTiles(page);
  await stubMetar(page); // FEW250: a sunny day
});

test('the shadow lies where the sun throws it under 300 ft by day, darkens the ground, and is gone at night and above 600 ft', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(`${BASE}?debug`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#timePicker .btnTime', { hasText: 'Day' }).click();
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect.poll(() => page.evaluate(() => !!window.openaeroShadow), { timeout: 20_000 }).toBe(true);
  // The chase camera: from the cockpit a noon shadow on a northbound final lies under the nose.
  for (let i = 0; i < 6 && (await page.locator('#txtCamMode').textContent()) !== 'Orbit Chase'; i++) await page.keyboard.press('KeyC');
  await expect(page.locator('#txtCamMode')).toHaveText('Orbit Chase');

  await finalAt(page, 0.15); // ~100 ft
  await expect.poll(async () => (await shadow(page)).meshVisible, { timeout: 10_000 }).toBe(true);
  const s = await shadow(page);
  const d = await snap(page);
  expect(s.aglFt, JSON.stringify(s)).toBeLessThan(300);
  expect(s.sunElevationDeg).toBeGreaterThan(10);
  expect(s.opacity).toBeGreaterThan(0.3);
  expect(s.sizeM).toBeGreaterThan(30); // the 737's 35.8 m span
  // h / tan(el) from under the main wheels (their height over the ground where the shadow falls; the runway is flat),
  // away from the sun, and the nose corners (0, 1) on the nose's side of the centre.
  const hM = s.aglFt * 0.3048;
  expect(s.offsetM, JSON.stringify(s)).toBeCloseTo(hM / Math.tan((s.sunElevationDeg * Math.PI) / 180), 0);
  const geo = await page.evaluate(() => {
    const r = window.openaeroShadow.mesh.parent.children.find((o) => o.isDirectionalLight).position.clone().normalize();
    return { sun: { x: r.x, z: r.z } };
  });
  expect(s.awayX * geo.sun.x + s.awayZ * geo.sun.z, JSON.stringify({ s, geo })).toBeLessThan(0);
  // On the ground there (terrain.js), lifted under 1 m.
  const mesh = await page.evaluate(() => Array.from(window.openaeroShadow.mesh.geometry.attributes.position.array));
  for (let i = 0; i < 4; i++) {
    expect(mesh[i * 3 + 1] - s.groundY).toBeGreaterThan(0);
    expect(mesh[i * 3 + 1] - s.groundY).toBeLessThan(1);
  }
  // On 35C (heading ~359° true, nose north, -Z): the nose corners lie north of the tail corners.
  expect((mesh[2] + mesh[5]) / 2).toBeLessThan((mesh[8] + mesh[11]) / 2);
  expect(d.mission).toBe('debug_KDFW_35C_0.15');

  // It darkens what it covers: the bare canvas with and without it.
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #simCanvas { visibility: visible !important; }' });
  const shot = async (on) => {
    await page.evaluate((v) => { window.openaeroShadow.mesh.material.visible = v; }, on);
    await frames(page);
    return (await page.locator('#simCanvas').screenshot()).toString('base64');
  };
  const withIt = await shot(true), without = await shot(false), without2 = await shot(false);
  await info.attach('shadow-100ft.png', { body: Buffer.from(withIt, 'base64'), contentType: 'image/png' });
  const darker = (a, b) => page.evaluate(async ([a, b]) => {
    const load = async (s) => {
      const img = new Image();
      img.src = `data:image/png;base64,${s}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height).data;
    };
    const A = await load(a), B = await load(b);
    let n = 0;
    for (let i = 0; i < A.length; i += 4) {
      const la = 0.2126 * A[i] + 0.7152 * A[i + 1] + 0.0722 * A[i + 2];
      const lb = 0.2126 * B[i] + 0.7152 * B[i + 1] + 0.0722 * B[i + 2];
      if (la < lb - 8) n++;
    }
    return n;
  }, [a, b]);
  expect(await darker(without2, without)).toBe(0); // a still frame is a still frame
  // Measured 2026-11-16 at 1280x720, ~80 ft: ~6,400 pixels darker (the grass's luma 54 → 32 under it).
  expect(await darker(withIt, without)).toBeGreaterThan(1000);
  await page.evaluate(() => { window.openaeroShadow.mesh.material.visible = true; document.querySelectorAll('style').forEach((el) => { if (el.textContent.includes('visibility: hidden !important')) el.remove(); }); });

  // Above 600 ft AGL: no cue, no shadow.
  await page.locator('#btnPause').click();
  await finalAt(page, 3);
  expect((await shadow(page)).aglFt).toBeGreaterThan(600);
  await expect.poll(async () => (await shadow(page)).meshVisible).toBe(false);

  // At night: none.
  await page.locator('#btnPause').click();
  await pickTime(page, 'Night');
  await finalAt(page, 0.15);
  const n = await shadow(page);
  expect(n.sunElevationDeg).toBeLessThan(3);
  expect(n.meshVisible).toBe(false);
  expect(errors).toEqual([]);
});
