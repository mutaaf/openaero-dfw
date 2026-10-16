// Shared e2e helpers. Satellite tiles are stubbed so tests are deterministic, offline-safe,
// and never load Esri's servers from CI.
export const BASE = '/openaero/';

// 1x1 opaque green PNG.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==',
  'base64',
);

export async function stubTiles(page) {
  await page.route('https://server.arcgisonline.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: TILE_PNG,
    }),
  );
}

// Collects console errors and uncaught exceptions for the life of the page.
export function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Number of distinct colours in an element's rendered pixels (sampled on a 32x32 grid).
// A blank or failed WebGL canvas yields 1; the approach scene with stubbed tiles yields ~6
// (sky, horizon haze, ground). Measured 2026-10-16: render on = 6, render off = 1.
// Everything layered over the canvas (HUD, panels, scanlines) is hidden first, so only the
// canvas's own pixels are measured.
export async function distinctColours(page, selector) {
  await page.addStyleTag({
    content: `body * { visibility: hidden !important; } ${selector} { visibility: visible !important; }`,
  });
  const png = await page.locator(selector).screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`);
    return seen.size;
  }, png.toString('base64'));
}

export async function enterCockpit(page) {
  await page.goto(BASE);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
}
