// Ticket 0192: honour the OS contrast setting (iOS Increase Contrast, Windows contrast themes,
// Android high-contrast text). `prefers-contrast: more` makes the HUD glass opaque with a firm
// light border and lifts the secondary text, so every HUD label reads >= 7:1 (WCAG 1.4.6) even
// over a white day scene; `forced-colors: active` keeps panel edges and the ON state of a button.
// CSS only: no box changes size, nothing new runs at boot.
import { test, expect } from './fixtures.js';
import { BASE, stubTiles, lowContrastLabels } from './helpers.js';

const HUD = 'header, aside, .hud-glass, #touchDeck';

test.beforeEach(async ({ page }) => {
  await stubTiles(page);
});

// Every visible HUD box, by position in the document (ids are not on every cell).
const rects = (page) => page.evaluate((sel) => [...document.querySelectorAll(sel)]
  .flatMap((root) => [root, ...root.querySelectorAll('*')])
  .filter((el) => el.checkVisibility())
  .map((el, i) => { const r = el.getBoundingClientRect(); return `${i} ${el.id || el.tagName} ${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`; }), HUD);

const glass = (page) => page.locator('.hud-glass').first().evaluate((el) => {
  const s = getComputedStyle(el);
  const a = (s.backgroundColor.match(/[\d.]+/g) || []).map(Number);
  return { alpha: a[3] ?? 1, border: parseFloat(s.borderTopWidth) };
});

for (const [w, h] of [[1280, 720], [390, 844]]) test(`prefers-contrast: more makes the glass opaque and every HUD label 7:1 over a white scene at ${w}x${h} (0192)`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: h });
  await page.emulateMedia({ contrast: 'more' });
  await page.goto(BASE);
  await page.keyboard.press('Escape');
  const g = await glass(page);
  expect(g.alpha).toBe(1);
  // The blur goes too. The build ships only -webkit-backdrop-filter (Safari's), which Chromium's
  // CSSOM drops, so read the shipped stylesheet text rather than the computed style.
  const css = await page.evaluate(async () => (await Promise.all([...document.querySelectorAll('link[rel=stylesheet]')]
    .map((l) => fetch(l.href).then((r) => r.text())))).join('\n'));
  const block = css.replace(/\s+/g, '').match(/@media\(prefers-contrast:more\)\{\.hud-glass,\.hud-btn\{[^}]*\}/)?.[0] ?? '';
  expect(block).toMatch(/backdrop-filter:none/);
  // Active states too (they are where the colour carries the meaning).
  await page.evaluate(() => { document.getElementById('btnBrakes').click(); document.getElementById('btnApMaster').click(); });
  await expect(page.locator('#btnApMaster')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#btnBrakes')).toHaveClass(/active-amber/);
  expect(await lowContrastLabels(page, HUD, { backdrop: [255, 255, 255], minRatio: 7, maxFont: Infinity })).toEqual([]);
  expect(await lowContrastLabels(page, '#onboardingModal', { minRatio: 7, maxFont: Infinity })).toEqual([]);
});

test('without the query the glass stays translucent (0192)', async ({ page }) => {
  await page.emulateMedia({ contrast: 'no-preference' });
  await page.goto(BASE);
  const g = await glass(page);
  expect(g.alpha).toBeLessThan(1);
});

for (const [w, h] of [[1280, 720], [390, 844]]) {
  test(`no reflow at ${w}x${h}: every HUD box keeps its rectangle (0192)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ contrast: 'no-preference' });
    await page.goto(BASE);
    await page.keyboard.press('Escape');
    // Freeze the readouts so a changing number can't move a box between the two reads.
    await page.evaluate(() => document.getElementById('btnPause').click());
    // Wait until the layout has settled (the mission name fills its select after boot).
    let before = await rects(page);
    await expect(async () => {
      await page.waitForTimeout(300);
      const again = await rects(page);
      const same = JSON.stringify(again) === JSON.stringify(before);
      before = again;
      expect(same).toBe(true);
    }).toPass({ timeout: 10_000 });
    await page.emulateMedia({ contrast: 'more' });
    expect((await glass(page)).alpha).toBe(1);
    const after = await rects(page);
    expect(after.length).toBeGreaterThan(20);
    expect(after).toEqual(before);
  });
}

test('forced colors: panels keep an edge and an ON button stands apart from OFF (0192)', async ({ page }) => {
  // Reduced motion stops the 0.12 s border transition, so the read is the settled colour.
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto(BASE);
  await page.keyboard.press('Escape');
  // GEAR DN is ON at the spawn (no click: a mouse left over a button would read its :hover edge).
  await expect(page.locator('#btnGear')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#btnPause')).not.toHaveClass(/\bactive/);
  const edge = (sel) => page.locator(sel).first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.borderTopStyle, width: parseFloat(s.borderTopWidth), color: s.borderTopColor };
  });
  const panel = await edge('.hud-glass');
  expect(panel.style).toBe('solid');
  expect(panel.width).toBeGreaterThanOrEqual(1);
  const on = await edge('#btnGear');
  const off = await edge('#btnPause');
  expect(on.color).not.toBe(off.color);
});
