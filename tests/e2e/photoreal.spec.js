// The photoreal layer without Google: a stubbed config (fake key), a stubbed root tileset
// and one generated glTF tile — a flat 2 km square on the ground at KDFW, placed in ECEF
// the way Google's tiles are. Proves: the key gates it, the root is fetched once per page
// and only after "start flying", the ECEF → sim remap lands the tile on the sim's ground,
// mission changes reuse the session, and 403/429 fall back to the free terrain cleanly.
import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, BASE } from './helpers.js';
import { geodeticToEcef, geoidN } from '../../src/ecef.js';
import { REF_ELEV_M } from '../../src/terrain.js';
import { DFW_ORIGIN_LAT, DFW_ORIGIN_LON } from '../../src/constants.js';

const snap = (page) => page.evaluate(() => window.openaeroDebug());

// ENU → ECEF at the KDFW origin, field elevation (column-major, 3D Tiles convention).
function enuToEcef(latDeg, lonDeg, h) {
  const r = Math.PI / 180, lat = latDeg * r, lon = lonDeg * r;
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  const o = geodeticToEcef(latDeg, lonDeg, h);
  return [-so, co, 0, 0, -sl * co, -sl * so, cl, 0, cl * co, cl * so, sl, 0, o.x, o.y, o.z, 1];
}

// Minimal GLB: one 2 km × 2 km quad on the glTF XZ plane (y-up → the tile's ground plane).
function quadGlb() {
  const pos = new Float32Array([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]);
  const idx = new Uint16Array([0, 2, 1, 0, 3, 2]);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer)]);
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.1, 0.1, 1] } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 12 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-1000, 0, -1000], max: [1000, 0, 1000] },
      { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
  };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const binPad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + js.length + 8 + binPad.length, 8);
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
  return Buffer.concat([header, chunk(0x4e4f534a, js), chunk(0x004e4942, binPad)]);
}

const ROOT = {
  asset: { version: '1.0', copyright: 'Test Imagery Co' },
  geometricError: 5000,
  root: {
    boundingVolume: { box: [0, 0, 0, 1000, 0, 0, 0, 1000, 0, 0, 0, 50] },
    geometricError: 0,
    refine: 'REPLACE',
    transform: enuToEcef(DFW_ORIGIN_LAT, DFW_ORIGIN_LON, REF_ELEV_M + geoidN(DFW_ORIGIN_LAT, DFW_ORIGIN_LON)),
    content: { uri: '/v1/3dtiles/datasets/TEST/files/quad.glb?session=TESTSESSION' },
  },
};

async function stubGoogle(page, { rootStatus = 200 } = {}) {
  const hits = { config: 0, root: 0, tile: 0, tileKeyOk: 0 };
  await page.route('**/openaero/api/config*', (r) => { hits.config++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ googleTilesKey: 'TEST-KEY' }) }); });
  await page.route('https://tile.googleapis.com/v1/3dtiles/root.json*', (r) => {
    hits.root++;
    hits.rootReferer = r.request().headers().referer || '';
    if (rootStatus !== 200) return r.fulfill({ status: rootStatus, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(ROOT) });
  });
  await page.route('https://tile.googleapis.com/v1/3dtiles/datasets/**', (r) => {
    hits.tile++;
    const u = new URL(r.request().url());
    const ref = r.request().headers().referer || '';
    if (u.searchParams.get('key') === 'TEST-KEY' && u.searchParams.get('session') === 'TESTSESSION' && ref.includes('/openaero/')) hits.tileKeyOk++;
    return r.fulfill({ status: 200, contentType: 'model/gltf-binary', headers: { 'Access-Control-Allow-Origin': '*' }, body: quadGlb() });
  });
  return hits;
}

test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('photoreal tiles load once flying, land exactly on the sim ground, and reuse the session', async ({ page }) => {
  const errors = collectErrors(page);
  const hits = await stubGoogle(page);
  await page.goto(`${BASE}?photoreal`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  expect(hits.config + hits.root, 'nothing billable before the player starts flying').toBe(0);

  await page.locator('#btnStartFlight').click();
  await expect.poll(async () => (await snap(page)).photoreal.status, { timeout: 30_000 }).toBe('active');
  const s = await snap(page);
  expect(hits.root).toBe(1);
  expect(hits.tileKeyOk).toBeGreaterThan(0); // tile requests signed with key + session, full referrer
  expect(hits.rootReferer).toContain('/openaero/'); // the key is path-restricted to /openaero/*
  // The 2 km quad at the KDFW origin, field elevation: centred on (0, 0) and flat at y ≈ 0
  // (calibration may shift it slightly toward the nearest threshold, within a few metres).
  const [minX, minY, minZ] = s.photoreal.bounds.min, [maxX, maxY, maxZ] = s.photoreal.bounds.max;
  expect(Math.abs((minX + maxX) / 2)).toBeLessThan(5);
  expect(Math.abs((minZ + maxZ) / 2)).toBeLessThan(5);
  expect(maxX - minX).toBeGreaterThan(1990);
  expect(maxX - minX).toBeLessThan(2010);
  expect(maxY - minY).toBeLessThan(1); // a flat square stays flat (no curvature tilt)
  expect(Math.abs(minY)).toBeLessThan(30);
  // Google attribution is shown, the free credits are not.
  await expect(page.locator('#creditsGoogle img')).toBeVisible();
  await expect(page.locator('#creditsFree')).toBeHidden();

  // A mission change keeps the same session: no second root request.
  await page.selectOption('#selScenario', 'kdal_31r_final');
  await page.selectOption('#selScenario', 'kdfw_35c_final');
  await page.waitForTimeout(500);
  expect(hits.root).toBe(1);
  expect((await snap(page)).photoreal.page.reuses).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

for (const status of [429, 403]) {
  test(`a ${status} on the root falls back to the free terrain and stops asking`, async ({ page }) => {
    const errors = collectErrors(page);
    const hits = await stubGoogle(page, { rootStatus: status });
    await page.goto(`${BASE}?photoreal`);
    await page.locator('#btnStartFlight').click();
    await expect.poll(async () => (await snap(page)).photoreal.status, { timeout: 20_000 }).toBe('unavailable');
    const s = await snap(page);
    expect(s.photoreal.reason).toBe(status === 429 ? 'quota' : 'forbidden');
    expect(s.terrain.drawn).toBeGreaterThan(0);
    await expect(page.locator('#creditsFree')).toBeVisible();
    // Reload: remembered, so no second root request.
    await page.reload();
    await page.locator('#btnStartFlight').click();
    await expect.poll(async () => (await snap(page)).photoreal.status, { timeout: 20_000 }).toBe('unavailable');
    expect(hits.root).toBe(1);
    // Chrome itself logs the refused request; nothing else may error.
    expect(errors.filter((e) => !/Failed to load resource: the server responded with a status of (403|429)/.test(e))).toEqual([]);
  });
}

test('without a key nothing Google-related happens', async ({ page }) => {
  const errors = collectErrors(page);
  let google = 0;
  await page.route('https://tile.googleapis.com/**', (r) => { google++; return r.abort(); });
  await page.route('**/openaero/api/config*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"googleTilesKey":null}' }));
  await page.goto(`${BASE}?photoreal`);
  await page.locator('#btnStartFlight').click();
  await page.waitForTimeout(1500);
  expect((await snap(page)).photoreal.status).toBe('off');
  expect(google).toBe(0);
  expect(errors).toEqual([]);
});
