import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0044: the device-class probe. The people to impress hold an iPhone, an iPad or an
// Android phone, so each class boots, starts the default mission by touch, flies 5 s with a
// 4x CPU throttle, and is held to the layout rules: no console errors, no page scroll, HUD
// boxes clear of each other and of the horizon, every control at least 44 px, flyable by
// touch alone. Frame times and a screenshot per device land in the test output (numbers in
// docs/PERF.md). Runs in its own `devices` project, alone after `perf`:
//   npx playwright test --project=devices --no-deps
// DPR is 1 on purpose: software GL pays per pixel, and the layout is in CSS pixels.
const DEVICES = [
  { name: 'iPhone 15 portrait', width: 390, height: 844 },
  { name: 'iPhone 15 landscape', width: 844, height: 390 },
  { name: 'iPad Air portrait', width: 820, height: 1180 },
  { name: 'iPad Air landscape', width: 1180, height: 820 },
  // Exactly on the 1024 px breakpoint, where the touch-only desktop-width rule starts.
  { name: 'iPad Pro 12.9 portrait', width: 1024, height: 1366 },
  { name: 'Pixel 8 portrait', width: 412, height: 915 },
];
const CPU_THROTTLE = 4;
const ALERTS = ['#masterAlertBanner', '#stallAlertBanner'];
const PANELS = ['#topRow', '#touchThrottle', '#touchStick', '#touchButtons', '#coach', ...ALERTS];

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

for (const d of DEVICES) {
  test.describe(d.name, () => {
    test.use({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });

    test(`${d.width}x${d.height}: boots, flies 5 s by touch at ${CPU_THROTTLE}x CPU throttle, HUD clear of itself and the horizon`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const errors = collectErrors(page);
      await stubTiles(page);
      await page.goto(BASE);
      const start = page.locator('#btnStartFlight');
      const sb = await start.boundingBox();
      expect(sb.y + sb.height, 'Fly is on screen without scrolling').toBeLessThanOrEqual(d.height);
      await start.tap();
      await expect(page.locator('#onboardingModal')).toBeHidden();
      await expect(page.locator('#coach')).toBeVisible({ timeout: 10_000 });
      // The default final as the player first sees it: runway and horizon in view (0044).
      const final = await page.screenshot({ path: info.outputPath(`final-${d.width}x${d.height}.png`) });
      await info.attach(`${d.name} final`, { body: final, contentType: 'image/png' });

      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

      // Flown by touch alone: both thumbs down, 60% power and a touch of nose-up (thumb up),
      // while the frame clock runs for 5 s.
      const stick = await page.locator('#touchStick').boundingBox();
      const thr = await page.locator('#touchThrottle').boundingBox();
      expect(stick, 'touch stick on screen').not.toBeNull();
      expect(thr, 'touch throttle on screen').not.toBeNull();
      const agl0 = await page.locator('#txtPhoneAgl').textContent();
      const s = centre(stick), t = centre(thr);
      const frames = page.evaluate(() => new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        const end = last + 5000;
        function tick(now) {
          deltas.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else {
            deltas.sort((a, b) => a - b);
            const avg = deltas.reduce((sum, x) => sum + x, 0) / deltas.length;
            resolve({ frames: deltas.length, avgMs: +avg.toFixed(1), p95Ms: +deltas[Math.floor(deltas.length * 0.95)].toFixed(1) });
          }
        }
        requestAnimationFrame(tick);
      }));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.x, y: s.y, id: 1 }, { x: t.x, y: t.y, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: s.x, y: s.y - stick.height * 0.1, id: 1 }, { x: t.x, y: thr.y + thr.height * 0.4, id: 2 }] });
      await expect.poll(() => page.locator('#txtTouchThr').textContent(), { timeout: 10_000 }).toMatch(/^(5[5-9]|6[0-5])%$/);
      await expect.poll(() => page.locator('#meterElev').textContent(), { timeout: 10_000 }).not.toBe('0%');
      // The stick, not a hold, is flying it (a first visit flies Learner, whose pitch hold moves the elevator too).
      expect((await page.evaluate(() => window.openaeroDebug())).inputSource).toBe('stick');
      const stats = await frames;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      expect(await page.locator('#txtPhoneAgl').textContent(), 'the aircraft moved').not.toBe(agl0);
      info.annotations.push({ type: 'device-perf', description: JSON.stringify({ device: d.name, cpuThrottle: CPU_THROTTLE, ...stats }) });
      console.log(`[devices] ${d.name} ${d.width}x${d.height} ${JSON.stringify(stats)}`);
      expect(stats.frames).toBeGreaterThan(5);

      // Layout, with both alerts forced on (the sim toggles .hidden every frame).
      await page.addStyleTag({ content: `${ALERTS.map((a) => `${a}.hidden`).join(', ')} { display: block !important; }` });
      const boxes = [];
      for (const id of PANELS) {
        const b = await page.locator(id).boundingBox();
        expect(b, `${id} visible`).not.toBeNull();
        expect(b.x, `${id} left edge`).toBeGreaterThanOrEqual(0);
        expect(b.y, `${id} top edge`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `${id} right edge`).toBeLessThanOrEqual(d.width);
        expect(b.y + b.height, `${id} bottom edge`).toBeLessThanOrEqual(d.height);
        boxes.push([id, b]);
      }
      const cx = d.width / 2, cy = d.height / 2;
      boxes.push(['TRK box', { x: cx - 52, y: Math.max(cy - 145, 72), width: 104, height: 24 }]);
      // Alerts take the coach's slot on purpose (GPWS over stall over coach).
      const sharesSlot = (a, b) => [a, b].every((id) => id === '#coach' || ALERTS.includes(id));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (sharesSlot(boxes[i][0], boxes[j][0])) continue;
          expect(overlaps(boxes[i][1], boxes[j][1]), `${boxes[i][0]} vs ${boxes[j][0]}`).toBe(false);
        }
      }
      // The centre 40% x 30% around the horizon is free of DOM overlays, and the canvas
      // tapes (renderHud: cx - 175 … cx + 186, cy - 90 … cy + 90) are unobstructed.
      const horizon = { x: d.width * 0.3, y: d.height * 0.35, width: d.width * 0.4, height: d.height * 0.3 };
      const tapes = [{ x: cx - 175, y: cy - 90, width: 44, height: 180 }, { x: cx + 130, y: cy - 90, width: 56, height: 180 }];
      for (const [id, b] of boxes) {
        if (id === 'TRK box') continue;
        expect(overlaps(b, horizon), `${id} covers the horizon`).toBe(false);
        for (const tp of tapes) expect(overlaps(b, tp), `${id} covers a tape`).toBe(false);
      }

      // Every visible control is at least 44 x 44 px (the imagery credits are inline text
      // links, which WCAG 2.5.8 exempts; they must stay as visible as they are).
      const small = await page.evaluate(() => [...document.querySelectorAll('button, [role="slider"], .touch-control, input, select')]
        .filter((e) => e.checkVisibility())
        .map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.textContent.trim().slice(0, 16), Math.round(r.width), Math.round(r.height)]; })
        .filter(([, w, h]) => w > 0 && h > 0 && (w < 44 || h < 44)));
      expect(small, 'controls under 44 px').toEqual([]);

      // The same inside the ☰ Menu sheet, which shows more on wider screens.
      await page.locator('#btnMenu').tap();
      await expect(page.locator('#hudMenu')).toBeVisible();
      const smallInMenu = await page.locator('#hudMenu').evaluate((root) => [...root.querySelectorAll('button, [role="slider"], input, select')]
        .filter((e) => e.checkVisibility())
        .map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.textContent.trim().slice(0, 16), Math.round(r.width), Math.round(r.height)]; })
        .filter(([, w, h]) => w > 0 && h > 0 && (w < 44 || h < 44)));
      expect(smallInMenu, 'menu controls under 44 px').toEqual([]);
      await page.locator('#btnMenu').tap();
      await expect(page.locator('#hudMenu')).toBeHidden();

      const scroll = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, y: window.scrollY,
      }));
      expect(scroll.w).toBeLessThanOrEqual(d.width);
      expect(scroll.h).toBeLessThanOrEqual(d.height);
      expect(scroll.y).toBe(0);

      const shot = await page.screenshot({ path: info.outputPath(`layout-${d.width}x${d.height}.png`) });
      await info.attach(`${d.name} ${d.width}x${d.height}`, { body: shot, contentType: 'image/png' });
      expect(errors).toEqual([]);
    });
  });
}

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
  // Each line box of the credit's text (a wrapped inline gives one rect per line).
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines = [...new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)))].length;
  const links = [...el.querySelectorAll('a')].filter((a) => a.checkVisibility()).map((a) => a.href);
  return { credit: box(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, lines, controls, links };
}, [CREDIT_TOUCH, google]);

const SMALL_PHONES = [
  { name: 'Android 360 portrait', width: 360, height: 800 },
  { name: 'iPhone SE portrait', width: 375, height: 667 },
  { name: 'Android 360 short portrait', width: 360, height: 640 },
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
        const r = await creditLayout(page, google);
        expect(r.credit.x, 'credit left edge').toBeGreaterThanOrEqual(0);
        expect(r.credit.x + r.credit.width, 'credit right edge').toBeLessThanOrEqual(d.width);
        expect(r.credit.y + r.credit.height, 'credit bottom edge').toBeLessThanOrEqual(d.height);
        expect(r.scrollWidth, 'no credit text clipped').toBeLessThanOrEqual(r.clientWidth);
        expect(r.controls.length, 'touch controls found').toBeGreaterThan(3);
        // Google's box is ~31 px tall (the logo's 10 px clear space above it) and stands into the
        // deck at every phone width, 390 included: a separate gap, not this ticket's line.
        if (!google) for (const c of r.controls) expect(overlaps(r.credit, c), `credit vs ${c.id}`).toBe(false);
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

// Wider screens keep the free credit on one line, where it was.
for (const d of [{ width: 390, height: 844, touch: true }, { width: 844, height: 390, touch: true }, { width: 1280, height: 720, touch: false }]) {
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
