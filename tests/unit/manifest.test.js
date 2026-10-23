import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

// Ticket 0086: Add to Home Screen opens the sim fullscreen, like an app. public/ is copied
// verbatim into dist/openaero/, so the source manifest is the served one; the e2e smoke
// test fetches it from the preview server.
const SITE = 'https://mutaafaziz.com/openaero/';
const MANIFEST_URL = new URL('manifest.webmanifest', SITE);
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const html = readFileSync('index.html', 'utf8');
// What Vite writes for %BASE_URL% (vite.config.js base).
const built = html.replaceAll('%BASE_URL%', '/openaero/');

// Width x height from a PNG's IHDR chunk.
function pngSize(path) {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}
const publicPath = (url) => `public/${url.pathname.slice('/openaero/'.length)}`;

describe('web app manifest', () => {
  it('launches the sim fullscreen under /openaero/', () => {
    expect(manifest.name).toBe('OpenAero DFW');
    expect(manifest.short_name).toBe('OpenAero');
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.display_override).toEqual(['fullscreen', 'standalone']);
    expect(manifest.orientation).toBe('any');
    expect(manifest.background_color).toBe('#020617');
    expect(manifest.theme_color).toBe('#020617');
    expect(new URL(manifest.start_url, MANIFEST_URL).href).toBe(SITE);
    expect(new URL(manifest.scope, MANIFEST_URL).href).toBe(SITE);
    expect(new URL(manifest.id, MANIFEST_URL).href).toBe(SITE);
  });

  it('lists 192, 512 and a maskable 512 icon, each a PNG of its stated size under the base path', () => {
    const want = [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']];
    expect(manifest.icons.map((i) => [i.sizes, i.purpose])).toEqual(want);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(false);
      const url = new URL(icon.src, MANIFEST_URL);
      expect(url.href.startsWith(SITE)).toBe(true);
      expect(icon.type).toBe('image/png');
      expect(existsSync(publicPath(url))).toBe(true);
      expect(pngSize(publicPath(url))).toBe(icon.sizes);
    }
  });
});

describe('index.html', () => {
  const href = (rel) => built.match(new RegExp(`<link rel="${rel}" href="([^"]+)"`))?.[1];
  const meta = (name) => built.match(new RegExp(`<meta name="${name}" content="([^"]+)"`))?.[1];

  it('links the manifest and a 180 px apple-touch-icon through the Vite base', () => {
    expect(html).toContain('<link rel="manifest" href="%BASE_URL%manifest.webmanifest"');
    expect(href('manifest')).toBe('/openaero/manifest.webmanifest');
    expect(html).toContain('<link rel="apple-touch-icon" href="%BASE_URL%icons/apple-touch-icon.png"');
    expect(pngSize(publicPath(new URL(href('apple-touch-icon'), SITE)))).toBe('180x180');
    expect(pngSize(publicPath(new URL(href('icon'), SITE)))).toBe('192x192');
  });

  it('asks iOS and Android for a full-screen launch that draws under the notch', () => {
    expect(meta('apple-mobile-web-app-capable')).toBe('yes');
    expect(meta('mobile-web-app-capable')).toBe('yes');
    expect(meta('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
    expect(meta('apple-mobile-web-app-title')).toBe('OpenAero');
    // black-translucent draws the page under the status bar; only viewport-fit=cover makes
    // env(safe-area-inset-*) report it, so the HUD's insets keep it clear.
    expect(meta('viewport')).toContain('viewport-fit=cover');
  });

  it('adds no root-absolute URL (AGENTS.md invariant 2)', () => {
    // /src/main.js is the module entry: Vite rewrites it, it is not a served URL.
    for (const [, url] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      if (url === '/src/main.js') continue;
      expect(url.startsWith('/') && !url.startsWith('//'), url).toBe(false);
    }
  });
});
