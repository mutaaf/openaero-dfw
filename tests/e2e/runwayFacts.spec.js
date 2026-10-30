// Ticket 0114: the mission runway's chart facts (OurAirports survey) on the start screen,
// one line under the density altitude; nothing for a drill with no runway under it.
import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

const SIZES = [
  { width: 390, height: 844, hasTouch: true },
  { width: 844, height: 390, hasTouch: true },
  { width: 1280, height: 720, hasTouch: false },
];

for (const { width, height, hasTouch } of SIZES) {
  test.describe(`at ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch });

    test('the default final shows 35C\'s facts on one line, clear of the density altitude', async ({ page }) => {
      const errors = collectErrors(page);
      await stubTiles(page);
      await page.goto(BASE);
      const facts = page.locator('#txtRunwayFacts');
      await expect(facts).toBeVisible();
      await expect(facts).toHaveText('RWY 35C: 13,400 × 150 ft · 358°M · THR 562 ft (OurAirports)');
      const line = await page.locator('#txtRunwayFactsLine').boundingBox();
      const p = await facts.boundingBox();
      const da = await page.locator('#txtDensityAlt').boundingBox();
      // The facts are one line of 11 px text inside the column (the source may wrap after them
      // on a wide font), below the density altitude line and not over it.
      expect(line.height).toBeLessThan(20);
      expect(line.x + line.width).toBeLessThanOrEqual(p.x + p.width + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(da.y + da.height - 0.5);
      expect(p.x + p.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(errors).toEqual([]);
    });
  });
}

test('another runway follows the pick, and a drill with no runway shows no line', async ({ page }) => {
  await stubTiles(page);
  await page.goto(BASE);
  // Addison 16's threshold is displaced 979 ft down a rising runway: 634 ft, not the end's 633.
  await page.locator('#missionList .btnMission[data-scenario="kads_16_final"]').click();
  await expect(page.locator('#txtRunwayFacts')).toHaveText(/^RWY 16: 7,203 × 100 ft · 15[78]°M · THR 634 ft \(OurAirports\)$/);
  await page.locator('#missionList .btnMission[data-scenario="deadstick_kads_16"]').click();
  await expect(page.locator('#txtDensityAlt')).toContainText('Density altitude DFW area:');
  await expect(page.locator('#txtRunwayFacts')).toBeHidden();
  await expect(page.locator('#txtRunwayFactsLine')).toHaveText('');
});

test.describe('every mission at 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('each runway\'s facts fit on one line inside the column', async ({ page }) => {
    await stubTiles(page);
    await page.goto(BASE);
    const facts = page.locator('#txtRunwayFacts');
    // CI's and phones' fonts run wider than the sandbox's: leave room for ~15% more.
    await page.addStyleTag({ content: '#txtRunwayFactsLine { letter-spacing: 0.1em; }' });
    const keys = await page.locator('#missionList .btnMission:not(.hidden)').evaluateAll((els) => els.map((e) => e.dataset.scenario));
    let shown = 0;
    for (const key of keys) {
      await page.locator(`#missionList .btnMission[data-scenario="${key}"]`).click();
      if (!(await facts.isVisible())) continue;
      shown++;
      const line = await page.locator('#txtRunwayFactsLine').boundingBox();
      const p = await facts.boundingBox();
      const what = `${key}: ${await facts.innerText()}`;
      expect(line.height, what).toBeLessThan(20);
      expect(line.x + line.width, what).toBeLessThanOrEqual(p.x + p.width + 0.5);
    }
    expect(shown).toBeGreaterThan(10);
  });
});
