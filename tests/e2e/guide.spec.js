import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { BASE, stubTiles } from './helpers.js';

// The player guide (public/guide/index.html → /openaero/guide/): a plain page whose text is in
// the HTML itself (no scripts, no ads, no analytics beacon), under How to fly on the start screen.
test('the guide builds as a plain, readable page with no scripts', () => {
  const html = readFileSync('dist/openaero/guide/index.html', 'utf8');
  expect(html).toContain('<h1>OpenAero DFW Player Guide</h1>');
  expect(html).toContain('<link rel="canonical" href="https://mutaafaziz.com/openaero/guide/">');
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  expect(title.length).toBeLessThan(65);
  const desc = html.match(/<meta name="description" content="(.*?)">/)[1];
  expect(desc.length).toBeGreaterThanOrEqual(70);
  expect(desc.length).toBeLessThanOrEqual(160);
  expect(html).not.toMatch(/<script|ads\.js|googlesyndication/i);
  expect(html).not.toMatch(/—|&mdash;/);
  const words = html.split('<body>')[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').split(/\s+/).filter(Boolean);
  expect(words.length).toBeGreaterThanOrEqual(900);
  // The zone's analytics beacon stays off it, as on the game (headers.spec.js).
  expect(readFileSync('dist/_headers', 'utf8')).toContain('/openaero/guide/\n  Cache-Control: public, max-age=0, must-revalidate, no-transform');
});

for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
  test(`the start screen links the guide at ${size.width}x${size.height}`, async ({ page }) => {
    await stubTiles(page);
    await page.setViewportSize(size);
    await page.goto(BASE);
    const link = page.locator('#lnkGuide');
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await expect(link).toBeInViewport();
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const fly = await page.locator('#btnStartFlight').boundingBox();
    expect(fly.x + fly.width).toBeLessThanOrEqual(size.width);
    await link.click();
    await expect(page).toHaveURL(/\/openaero\/guide\/$/);
    await expect(page.locator('h1')).toHaveText('OpenAero DFW Player Guide');
    await expect(page.locator('a.fly').first()).toHaveAttribute('href', '../');
  });
}
