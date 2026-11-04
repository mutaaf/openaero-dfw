import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
import { ALT_TAPE_X, SPEED_TAPE_X, ALT_BOX, TAPE_TOP, windBoxRect } from '../../src/hudLayout.js';
import { altLabels } from '../../src/gateVerdict.js';

// Ticket 0132: the altitude tape reads above sea level and says so ("MSL" under its readout box),
// while the top bar's AGL is the height above the ground. The caption is drawn in the HUD canvas,
// clear of the box's digits, the tape's ticks, the speed tape, the wind box and every DOM panel.
// Ticket 0140: Pilot reads MSL / AGL; Kid and Learner (a first visit flies Learner) read SEA LVL / GROUND.
const PANELS = ['#topRow', '#coach', '#touchThrottle', '#touchStick', '#touchButtons', '#touchTrim', '#keyHints', '#calloutCaption'];
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const VIEWS = [{ width: 1280, height: 720, touch: false }, { width: 390, height: 844, touch: true }, { width: 844, height: 390, touch: true }, { width: 568, height: 320, touch: true }];
const CASES = VIEWS.flatMap((v) => [{ ...v, level: 'pilot' }, { ...v, level: 'learner' }]).concat([{ ...VIEWS[1], level: 'kid' }]);
for (const v of CASES) {
  const words = altLabels(v.level);
  test.describe(`${v.width}x${v.height} ${v.level}`, () => {
    test.use({ viewport: { width: v.width, height: v.height }, hasTouch: v.touch, isMobile: v.touch, storageState: { cookies: [], origins: [] } });

    test(`the altitude tape says ${words.alt}, clear of everything else; the top bar says ${words.agl}`, async ({ page }) => {
      const errors = collectErrors(page);
      await stubTiles(page);
      await page.goto(BASE);
      if (v.level !== 'learner') await page.locator(`#assistPicker .btnAssist[data-assist="${v.level}"]`).click();
      await page.locator('#btnStartFlight').click();
      await expect(page.locator('#onboardingModal')).toBeHidden();
      await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).hudAltCaption?.w ?? 0, { timeout: 10_000 }).toBeGreaterThan(0);
      const d = await page.evaluate(() => window.openaeroDebug());
      expect(d.hudAltCaption.text).toBe(words.alt);
      const r = { x: d.hudAltCaption.x, y: d.hudAltCaption.y, width: d.hudAltCaption.w, height: d.hudAltCaption.h };
      const cx = v.width / 2, cy = v.height / 2, x = cx + ALT_TAPE_X;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(v.width);
      const wb = windBoxRect(v.width, v.height);
      const clear = [
        ['readout box (digits)', { x: x + ALT_BOX.dx, y: cy - ALT_BOX.h / 2, width: ALT_BOX.w, height: ALT_BOX.h }],
        ['tape ticks', { x, y: cy + TAPE_TOP, width: 10, height: -2 * TAPE_TOP }],
        ['speed tape', { x: cx + SPEED_TAPE_X - 60, y: cy + TAPE_TOP, width: 60, height: -2 * TAPE_TOP }],
        ['wind box', { x: wb.x, y: wb.y, width: wb.w, height: wb.h }],
      ];
      for (const [name, b] of clear) expect(overlaps(r, b), `caption vs ${name}`).toBe(false);
      for (const id of PANELS) {
        const b = await page.locator(id).boundingBox();
        if (b) expect(overlaps(r, b), `caption vs ${id}`).toBe(false);
      }
      // Nothing in the DOM covers it, and the canvas really has the tab and its light text there.
      const top = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id, [r.x + r.width / 2, r.y + r.height / 2]);
      expect(['simCanvas', 'hudCanvas']).toContain(top);
      const px = await page.evaluate((rr) => {
        const c = document.getElementById('hudCanvas');
        const k = c.width / c.getBoundingClientRect().width;
        const img = c.getContext('2d').getImageData(Math.round(rr.x * k), Math.round(rr.y * k), Math.round(rr.width * k), Math.round(rr.height * k)).data;
        let opaque = 0, light = 0;
        for (let i = 0; i < img.length; i += 4) {
          if (img[i + 3] > 180) opaque++;
          if (img[i + 3] > 180 && img[i] > 150 && img[i + 2] > 180) light++;
        }
        const ctx = c.getContext('2d');
        ctx.font = 'bold 11px monospace';
        return { opaque, light, n: img.length / 4, textW: ctx.measureText(rr.text).width };
      }, { ...r, text: words.alt });
      expect(px.opaque / px.n, 'the tab is drawn').toBeGreaterThan(0.9);
      expect(px.light, 'the letters are drawn').toBeGreaterThan(8);
      expect(px.textW, 'the word fits its tab unsqueezed').toBeLessThanOrEqual(r.width - 2);
      // The top bar's height is labelled with the level's word wherever it shows, and only that word.
      if (v.width < 1024) {
        const label = page.locator('#txtPhoneAgl').locator('xpath=..').locator('div').first();
        await expect(label).toHaveText(`${words.agl} FT`, { useInnerText: true });
        const lb = await label.boundingBox(), cell = await label.locator('xpath=..').boundingBox();
        expect(lb.x + lb.width, 'the word stays in its cell').toBeLessThanOrEqual(cell.x + cell.width + 0.5);
      }
      expect(errors).toEqual([]);
    });
  });
}
