// Shared e2e helpers. Satellite tiles are stubbed so tests are deterministic, offline-safe,
// and never load Esri's servers from CI.
export const BASE = '/openaero/';

// Desktop specs render at half resolution (playwright.config.js); the ones that count or
// compare canvas pixels opt back into 1x with test.use(FULL_RES).
export const FULL_RES = { deviceScaleFactor: 1 };

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
// `backdrop: [r, g, b]` models a root that floats over the 3D world instead: only the
// root and what is inside it are composited, over that colour (white = the brightest
// ground or sky the HUD can sit on, ticket 0050).
export async function lowContrastLabels(page, rootSel, { backdrop = null } = {}) {
  return page.evaluate(({ rootSel, backdrop }) => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] ?? 1]; };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));
    const bgOf = (el, root) => {
      const chain = [];
      for (let e = el; e; e = e.parentElement) {
        chain.unshift(e);
        if (backdrop && e === root) break;
      }
      let bg = backdrop || [2, 6, 23];
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
        const bg = bgOf(el, root);
        const col = over(fg, bg);
        const [a, b] = [lum(col), lum(bg)];
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 4.5) bad.push(`${el.id || el.className || el.tagName} "${el.textContent.trim().slice(0, 20)}" ${ratio.toFixed(2)}`);
      }
    }
    return bad;
  }, { rootSel, backdrop });
}

// 0033: an init script that replaces navigator.vibrate with a recorder: window.__vibes gets every
// pattern, a vibrate(0) stop is only counted (window.__stops).
export const recordVibrate = () => {
  window.__vibes = [];
  Object.defineProperty(Navigator.prototype, 'vibrate', {
    configurable: true,
    value: (p) => {
      const q = Array.isArray(p) ? p : [p];
      if (q.some((ms) => ms > 0)) window.__vibes.push(q); else window.__stops = (window.__stops ?? 0) + 1;
      return true;
    },
  });
};

// Ticket 0091's scripted bounce: a 3 m/s hop armed in the physics, fired after 0.4 s of sim
// time on the wheels (?debug openaeroDebugHop). A hop timed in wall-clock time from the test or
// a rAF landed anywhere along the derotation on a slow runner (the nose comes down ~8°/s), and
// its height swung across the 2 ft bounce line (main red on 0e3cbd9). The autopilot lets go at
// the touchdown, as a pilot would; resolves once the wheels are off again.
export async function scriptedBounce(page) {
  await page.evaluate(() => new Promise((done) => {
    window.openaeroDebugHop(3, 0.4);
    let landed = false;
    const tick = () => {
      const d = window.openaeroDebug();
      if (d.lastLanding && !landed) {
        landed = true;
        for (const id of ['btnApApr', 'btnApMaster']) {
          const b = document.getElementById(id);
          if (b.classList.contains('active')) b.click();
        }
      }
      if (landed && !d.onGround) { done(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }));
}

// The runway on screen (?debug's runwayScreen, 0068; runwayVisibility.spec, lowIfr.spec): mean luma inside the runway's outline grown by `inner` px, mean luma of the ring from there
// to `outer` px, their contrast ratio ((hi + 12.75) / (lo + 12.75), WCAG's 0.05 offset on a
// 0-255 scale) and the lit (luma > 200) pixels in the region.
export async function measureRunway(page, inner = 1, outer = 24) {
  const quad = (await page.evaluate(() => window.openaeroDebug())).runwayScreen;
  // Only the runway and its ring are captured: a full-resolution canvas shot is slow on CI.
  const xs = quad.map((p) => p.x), ys = quad.map((p) => p.y), vp = page.viewportSize();
  const cx = Math.max(0, Math.floor(Math.min(...xs) - outer)), cy = Math.max(0, Math.floor(Math.min(...ys) - outer));
  const clip = { x: cx, y: cy, width: Math.min(vp.width, Math.ceil(Math.max(...xs) + outer)) - cx, height: Math.min(vp.height, Math.ceil(Math.max(...ys) + outer)) - cy };
  const style = await page.addStyleTag({
    content: 'body * { visibility: hidden !important; } #simCanvas { visibility: visible !important; }',
  });
  const png = await page.screenshot({ clip });
  await style.evaluate((el) => el.remove());
  return page.evaluate(async ([b64, quad, clip, inner, outer]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const k = img.width / clip.width;
    // Corners in order around the outline: near-left, near-right, far-right, far-left.
    const P = [quad[0], quad[1], quad[3], quad[2]].map((p) => ({ x: (p.x - clip.x) * k, y: (p.y - clip.y) * k }));
    const segDist = (x, y, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len));
      return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
    };
    const inside = (x, y) => {
      let s = 0;
      for (let i = 0; i < 4; i++) {
        const a = P[i], b = P[(i + 1) % 4];
        const cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        if (cr !== 0) { if (s && Math.sign(cr) !== s) return false; s = Math.sign(cr); }
      }
      return true;
    };
    const o = outer * k, n = inner * k;
    const x0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p.x)) - o)), x1 = Math.min(img.width - 1, Math.ceil(Math.max(...P.map((p) => p.x)) + o));
    const y0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p.y)) - o)), y1 = Math.min(img.height - 1, Math.ceil(Math.max(...P.map((p) => p.y)) + o));
    const d = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
    let rs = 0, rn = 0, gs = 0, gn = 0, lit = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dist = inside(x + 0.5, y + 0.5) ? 0 : Math.min(...P.map((a, i) => segDist(x + 0.5, y + 0.5, a, P[(i + 1) % 4])));
        if (dist > o) continue;
        const i = ((y - y0) * (x1 - x0 + 1) + (x - x0)) * 4;
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        if (dist <= n) { rs += l; rn++; if (l > 200) lit++; } else { gs += l; gn++; }
      }
    }
    const runway = rs / rn, ring = gs / gn;
    return {
      runway: Math.round(runway), ring: Math.round(ring), lit, px: rn,
      contrast: +((Math.max(runway, ring) + 12.75) / (Math.min(runway, ring) + 12.75)).toFixed(2),
    };
  }, [png.toString('base64'), quad, clip, inner, outer]);
}
