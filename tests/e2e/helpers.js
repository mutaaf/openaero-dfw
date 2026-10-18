// Shared e2e helpers. Satellite tiles are stubbed so tests are deterministic, offline-safe,
// and never load Esri's servers from CI.
export const BASE = '/openaero/';

// 1x1 opaque green PNG.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==',
  'base64',
);

// Default weather for tests: a fixed, calm-ish METAR served for the edge API. vite preview
// has no Worker, so without this every page load would log a 404.
export const TEST_METAR = {
  icaoId: 'KDFW', obsTime: Math.floor(Date.now() / 1000) - 600,
  rawOb: 'METAR KDFW 161953Z 18005KT 10SM FEW250 24/10 A3002', temp: 24, dewp: 10,
  wdir: 180, wspd: 5, wgst: null, visib: '10+', altim: 1016.6, clouds: [{ cover: 'FEW', base: 25000 }], fltCat: 'VFR',
};

export async function stubMetar(page, metars = [TEST_METAR], status = 200) {
  await page.route('**/openaero/api/metar*', (route) => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(status === 200 ? { source: 'aviationweather.gov', fetchedAt: new Date().toISOString(), metars } : { error: 'test' }),
  }));
}

export async function stubTiles(page) {
  await stubMetar(page);
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

// WCAG relative luminance contrast of each small HUD label against its panel, with the
// panel's translucent backgrounds composited over the page background (#020617).
export async function lowContrastLabels(page, rootSel) {
  return page.evaluate((rootSel) => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] ?? 1]; };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));
    const bgOf = (el) => {
      const chain = [];
      for (let e = el; e; e = e.parentElement) chain.unshift(e);
      let bg = [2, 6, 23];
      for (const e of chain) bg = over(parse(getComputedStyle(e).backgroundColor), bg);
      return bg;
    };
    const bad = [];
    for (const root of document.querySelectorAll(rootSel)) {
      for (const el of root.querySelectorAll('*')) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own || !el.checkVisibility()) continue;
        const s = getComputedStyle(el);
        if (parseFloat(s.fontSize) > 12) continue;
        const fg = parse(s.color);
        const bg = bgOf(el);
        const col = over(fg, bg);
        const [a, b] = [lum(col), lum(bg)];
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 4.5) bad.push(`${el.id || el.className || el.tagName} "${el.textContent.trim().slice(0, 20)}" ${ratio.toFixed(2)}`);
      }
    }
    return bad;
  }, rootSel);
}
