import { test, expect } from './fixtures.js';
import { stubTiles, enterCockpit, FULL_RES } from './helpers.js';
import { trueToMag, magHeadingText } from '../../src/magvar.js';

test.use(FULL_RES);

test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('every approach mission starts lined up on its real runway', async ({ page }) => {
  await enterCockpit(page);
  const finals = await page.locator('#selScenario option').evaluateAll((o) =>
    o.map((x) => x.value).filter((v) => v.endsWith('_final')));
  expect(finals.length).toBeGreaterThanOrEqual(8);
  for (const m of finals) {
    await page.selectOption('#selScenario', m);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => window.openaeroDebug());
    expect(s.activeRunway, m).toBe(s.missionRunway);
    const dh = Math.abs(((s.headingDeg - s.runwayHdgT) % 360 + 540) % 360 - 180);
    expect(dh, `${m} heading ${s.headingDeg} vs runway ${s.runwayHdgT}`).toBeLessThan(2);
    expect(Math.abs(s.crossM), `${m} cross-track`).toBeLessThan(30);
  }
});

// 0078: the compass agrees with the runway, like a pilot's: 35C is 0.3° true, 357.6° magnetic
// today (WMM), so the HUD reads 358°M, not 000°.
test('lined up on 35C the HUD heading, TRK and NAV1 course read magnetic', async ({ page }) => {
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdfw_takeoff');
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => window.openaeroDebug());
  expect(s.activeRunway).toBe('KDFW_35C');
  expect(s.hudHeading).toBe(`${magHeadingText(s.headingDeg)}°M`);
  expect(Math.abs(trueToMag(s.headingDeg) - 357.6)).toBeLessThan(1);
  expect(s.hudHeading).not.toMatch(/^(000|360)/);
  await expect(page.locator('#txtRadarHdg')).toHaveText(/^35[789]°M$/);
  await expect(page.locator('#txtNav1')).toContainText('358°M');
});

test('the runway is visible ahead on a 4 NM final (no depth-fight with the imagery)', async ({ page }) => {
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdfw_35c_final');
  // The real sun ("Now") tints the ground and runway by the hour in Dallas; this test is
  // about depth, not light, so fly it at Noon (CI failed at 08:28 CDT, passed at 05:51).
  for (let i = 0; i < 5 && (await page.locator('#txtTimeBadge').textContent()) !== 'Noon'; i++) {
    await page.locator('#btnTimeOfDay').click();
  }
  await expect(page.locator('#txtTimeBadge')).toHaveText('Noon');
  await page.click('#btnPause');
  await page.waitForTimeout(800);
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #simCanvas { visibility: visible !important; }' });
  const png = await page.locator('#simCanvas').screenshot();
  const dark = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    // Below the horizon, around the nose: count asphalt-coloured pixels. The stubbed
    // imagery is bright green (g > 180) and the sky is light blue (g > 180), so a
    // blue-grey pixel with low green can only be runway.
    const x0 = Math.floor(img.width / 2 - 60), y0 = Math.floor(img.height * 0.5);
    const d = ctx.getImageData(x0, y0, 120, Math.floor(img.height * 0.25)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 2] >= d[i + 1] && d[i] < 140 && d[i + 1] < 150) n++;
    return n;
  }, png.toString('base64'));
  expect(dark).toBeGreaterThan(12);
});

test('approach guidance follows whichever runway you fly to', async ({ page }) => {
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdal_31r_final');
  await page.waitForTimeout(400);
  await expect(page.locator('#txtNav1')).toContainText('KDAL 31R');
  await expect(page.locator('#txtNavDist')).toContainText(/DME [345]\.\d NM/);
});
