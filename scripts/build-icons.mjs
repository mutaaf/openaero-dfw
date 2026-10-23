// Renders the installable app's icons (ticket 0086) from assets-src/icons/icon.svg.
//
//   node scripts/build-icons.mjs
//
// Output (committed): public/icons/icon-192.png and icon-512.png (purpose "any": rounded
// corners, transparent outside), icon-maskable-512.png (full bleed; the sun and the jet sit
// inside the 80% safe circle, so any launcher mask keeps them) and apple-touch-icon.png
// (180 px, full bleed and opaque: iOS rounds it itself). Drawn by headless Chromium, the
// browser Playwright already uses; PLAYWRIGHT_CHROMIUM=<path> picks another build.
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

export const ICONS = [
  { out: 'public/icons/icon-192.png', size: 192, rounded: true },
  { out: 'public/icons/icon-512.png', size: 512, rounded: true },
  { out: 'public/icons/icon-maskable-512.png', size: 512, rounded: false },
  { out: 'public/icons/apple-touch-icon.png', size: 180, rounded: false },
];

const svg = readFileSync('assets-src/icons/icon.svg', 'utf8');
mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
for (const { out, size, rounded } of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const radius = rounded ? Math.round(size * 0.22) : 0;
  await page.setContent(`<style>html,body{margin:0;background:transparent}
    div{width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden}svg{display:block;width:100%;height:100%}</style><div>${svg}</div>`);
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
  console.log(out, `${size}x${size}`);
}
await browser.close();
