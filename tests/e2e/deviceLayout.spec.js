import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
import { DEVICES, ALERTS, PANELS, overlaps } from './devices.js';

// Device-size layout checks that fly nothing and time no frames (0216, 0217, PR #60's credits):
// they were the last 17 tests of devices.spec.js, which runs alone after `perf`, one at a time,
// while the other workers sat idle. Here they run in the parallel phase with the rest (own
// `device-layout` project: no Pilot profile, no 0.25x resolution, like `devices`).

// 0217 on a short 360 px Android (360x640), outside the matrix above: the tapes, their readouts and the
// MSL tab are whole on screen and no DOM panel covers them. (The matrix's full alert-overlap check is a
// separate gap at this height: the stall banner, forced on, reaches the TRK box.)
test.describe('Android 360 short portrait tapes', () => {
  test.use({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  test('360x640: both tapes and their readouts are inside the screen and uncovered', async ({ page }) => {
    const errors = collectErrors(page);
    await stubTiles(page);
    await page.goto(BASE);
    await page.locator('#btnStartFlight').tap();
    await expect(page.locator('#coach')).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await page.evaluate(() => window.openaeroDebug())).hudTapes?.speedX ?? 0).toBeGreaterThan(0);
    const { hudTapes, hudAltCaption } = await page.evaluate(() => window.openaeroDebug());
    const cy = 320;
    const tapes = [{ x: hudTapes.speedX - 60, y: cy - 90, width: 60, height: 180 }, { x: hudTapes.altX, y: cy - 90, width: 64, height: 180 }];
    expect(tapes[0].x).toBeGreaterThanOrEqual(4);
    expect(tapes[1].x + tapes[1].width).toBeLessThanOrEqual(356);
    expect(hudAltCaption.x + hudAltCaption.w).toBeLessThanOrEqual(356);
    for (const id of PANELS.filter((p) => !ALERTS.includes(p))) {
      const b = await page.locator(id).boundingBox();
      if (b) for (const tp of tapes) expect(overlaps(b, tp), `${id} covers a tape`).toBe(false);
    }
    expect(errors).toEqual([]);
  });
});

// On a tablet the function buttons are one row along the bottom, and with photoreal on the
// Google attribution (logo + data line, ~31 px tall, z-index above the deck) sits there too:
// it must not cover a button or have a button over its logo (PR #60 panel). Tiles are
// stubbed, so the Google credit line is forced on as photoreal shows it.
const TABLETS = DEVICES.filter((d) => Math.min(d.width, d.height) >= 700);
for (const d of TABLETS) {
  test.describe(`${d.name} credits`, () => {
  test.use({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  test(`${d.width}x${d.height}: the Google attribution clears the function buttons`, async ({ page }) => {
    await stubTiles(page);
    await page.goto(BASE);
    await page.locator('#btnStartFlight').tap();
    await expect(page.locator('#coach')).toBeVisible({ timeout: 10_000 });
    const r = await page.evaluate(() => {
      document.getElementById('creditsGoogle').classList.remove('hidden');
      document.getElementById('creditsFree').classList.add('hidden');
      document.getElementById('txtGoogleData').textContent = 'Google, Airbus, Maxar Technologies, Vexcel Imaging US';
      const box = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
      const buttons = [...document.querySelectorAll('#touchButtons button')].map((e) => {
        const b = e.getBoundingClientRect();
        let blocked = 0; // rows down the button's centre line where a tap lands on something else
        for (let y = Math.ceil(b.top) + 1; y < b.bottom - 1; y++) if (!document.elementFromPoint(b.x + b.width / 2, y)?.closest(`#${e.id}`)) blocked++;
        return { id: e.id, blocked };
      });
      return { credits: box(document.getElementById('mapCredits')), row: box(document.getElementById('touchButtons')), buttons };
    });
    expect(r.credits.height, 'Google credit line shown').toBeGreaterThan(20);
    expect(overlaps(r.credits, r.row), 'credits vs #touchButtons').toBe(false);
    for (const b of r.buttons) expect(b.blocked, `${b.id} fully tappable`).toBe(0);
  });
  });
}

// Ticket 0216: the imagery credit (AGENTS.md invariant 3: attribution stays visible) on the
// commonest small phones, which the matrix above starts above: a Galaxy-class Android at 360 px
// and an iPhone SE / mini at 375. Its one 378 px line ran off both edges there; it now wraps,
// whole, inside the screen and clear of every touch control. On the wider screens it stays one
// line. Both credits are checked whole on screen: the free one (Esri + elevation) and Google's
// (logo + data line, forced on as photoreal shows it; tiles are stubbed).
const CREDIT_TOUCH = ['#touchThrottle', '#touchStick', '#touchButtons', '#touchLeft'];
const creditLayout = (page, google) => page.evaluate(([ids, google]) => {
  if (google) {
    document.getElementById('creditsGoogle').classList.remove('hidden');
    document.getElementById('creditsFree').classList.add('hidden');
    document.getElementById('txtGoogleData').textContent = 'Google, Airbus, Maxar Technologies, Vexcel Imaging US';
  }
  const box = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
  const el = document.getElementById('mapCredits');
  const controls = ids.flatMap((id) => [...document.querySelectorAll(`${id}, ${id} button, ${id} .touch-control`)])
    .filter((e) => e.checkVisibility()).map((e) => ({ id: e.id || e.textContent.trim().slice(0, 12), ...box(e) }));
  // Each line of the credit's text: one rect per line box of the text (the 8 px lines are 10 px
  // tall; taller rects are the wrapping spans').
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines = [...new Set([...range.getClientRects()].filter((r) => r.width > 0 && r.height < 14).map((r) => Math.round(r.top)))].length;
  const links = [...el.querySelectorAll('a')].filter((a) => a.checkVisibility()).map((a) => a.href);
  // A thumb on the bottom edge of the throttle and stick lands on them, not on the credit's box.
  const edgeTaps = ['touchThrottle', 'touchStick'].map((id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    return [id, [2, 6, 10].every((dy) => document.elementFromPoint(b.x + b.width / 2, b.bottom - dy)?.closest(`#${id}`))];
  });
  const thrChip = document.getElementById('txtTouchThr').parentElement.getBoundingClientRect().top;
  const googleData = document.getElementById('txtGoogleData').getBoundingClientRect().height;
  return { credit: box(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, lines, controls, links, edgeTaps, thrChip, googleData };
}, [CREDIT_TOUCH, google]);

// Under 430 px the free credit is two lines, one credit each, whatever the font: at 390 px one
// line had <1% to spare in CI's font, and a wider font (iOS's SF; simulated with letter spacing)
// wrapped it onto ILS AUTO. `spacing` widens the text that way.
const SMALL_PHONES = [
  { name: 'Android 360 portrait', width: 360, height: 800 },
  { name: 'iPhone SE portrait', width: 375, height: 667 },
  { name: 'Android 360 short portrait', width: 360, height: 640 },
  { name: 'iPhone 15 portrait, wide font', width: 390, height: 844, spacing: 0.2 },
  { name: 'iPhone 17 portrait, wide font', width: 402, height: 874, spacing: 0.2 },
];
for (const d of SMALL_PHONES) {
  test.describe(`${d.name} imagery credit`, () => {
    test.use({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    for (const google of [false, true]) {
      test(`${d.width}x${d.height}: the ${google ? 'Google' : 'Esri'} credit is whole on screen${google ? '' : ' and clear of the touch controls'}`, async ({ page }, info) => {
        const errors = collectErrors(page);
        await stubTiles(page);
        await page.goto(BASE);
        await page.locator('#btnStartFlight').tap();
        await expect(page.locator('#coach')).toBeVisible({ timeout: 10_000 });
        if (d.spacing) await page.addStyleTag({ content: `#mapCredits { letter-spacing: ${d.spacing}px; }` });
        const r = await creditLayout(page, google);
        if (!google) expect(r.lines, 'two lines, one credit each').toBe(2);
        expect(r.credit.x, 'credit left edge').toBeGreaterThanOrEqual(0);
        expect(r.credit.x + r.credit.width, 'credit right edge').toBeLessThanOrEqual(d.width);
        expect(r.credit.y + r.credit.height, 'credit bottom edge').toBeLessThanOrEqual(d.height);
        expect(r.scrollWidth, 'no credit text clipped').toBeLessThanOrEqual(r.clientWidth);
        expect(r.controls.length, 'touch controls found').toBeGreaterThan(3);
        // Google's box is ~31 px tall (the logo's 10 px clear space above it) and stands into the
        // deck at every phone width, 390 included: a separate gap, not this ticket's line.
        if (!google) for (const c of r.controls) expect(overlaps(r.credit, c), `credit vs ${c.id}`).toBe(false);
        for (const [id, ok] of r.edgeTaps) expect(ok, `a tap on ${id}'s bottom edge reaches it`).toBeTruthy();
        // The SPD bug readout is drawn at cy + 106 (main.js renderHud's speed tape): the lifted deck's
        // THR chip stays under it.
        expect(r.thrChip, 'THR chip clear of the SPD readout').toBeGreaterThanOrEqual(d.height / 2 + 108);
        if (google) expect(r.googleData, "Google's providers on one line").toBeLessThan(14);
        expect(r.links.length, 'credit links').toBe(google ? 0 : 2);
        if (!google) {
          expect(r.links[0]).toContain('esri.com');
          expect(r.links[1]).toContain('registry.opendata.aws/terrain-tiles');
        }
        const shot = await page.screenshot({ path: info.outputPath(`credit-${google ? 'google' : 'esri'}-${d.width}x${d.height}.png`) });
        await info.attach(`${d.name} credit`, { body: shot, contentType: 'image/png' });
        expect(errors).toEqual([]);
      });
    }
  });
}

// From 430 px the free credit stays on one line, where it was (phones on their side, tablets, desktop).
for (const d of [{ width: 844, height: 390, touch: true }, { width: 568, height: 320, touch: true }, { width: 1280, height: 720, touch: false }]) {
  test.describe(`${d.width}x${d.height} imagery credit`, () => {
    test.use({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: 1, hasTouch: d.touch, isMobile: d.touch });
    test(`${d.width}x${d.height}: the Esri credit stays one line, on screen`, async ({ page }) => {
      await stubTiles(page);
      await page.goto(BASE);
      await page.locator('#btnStartFlight').click();
      await expect(page.locator('#onboardingModal')).toBeHidden();
      const r = await creditLayout(page, false);
      expect(r.lines, 'one line').toBe(1);
      expect(r.credit.x).toBeGreaterThanOrEqual(0);
      expect(r.credit.x + r.credit.width).toBeLessThanOrEqual(d.width);
      for (const c of r.controls) expect(overlaps(r.credit, c), `credit vs ${c.id}`).toBe(false);
    });
  });
}
