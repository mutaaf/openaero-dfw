import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';
import { DEVICES, ALERTS, PANELS, overlaps } from './devices.js';

// Ticket 0044: the device-class probe. The people to impress hold an iPhone, an iPad or an
// Android phone, so each class boots, starts the default mission by touch, flies 5 s with a
// 4x CPU throttle, and is held to the layout rules: no console errors, no page scroll, HUD
// boxes clear of each other and of the horizon, every control at least 44 px, flyable by
// touch alone. Frame times and a screenshot per device land in the test output (numbers in
// docs/PERF.md). Runs in its own `devices` project, alone after `perf`:
//   npx playwright test --project=devices --no-deps
// The layout-only device checks (credits, short-phone tapes) fly nothing and time no frames, so
// they are tests/e2e/deviceLayout.spec.js, in the parallel phase rather than this serial tail.
// DPR is 1 on purpose: software GL pays per pixel, and the layout is in CSS pixels.
const CPU_THROTTLE = 4;
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
      // The canvas HUD draws at ?debug hudTapes.scale on a tablet (0218, hudLayout.js hudScale): 1 on a phone.
      const { hudTapes } = await page.evaluate(() => window.openaeroDebug());
      const k = hudTapes.scale;
      if (d.width < 600 || d.height < 600) expect(k, 'a phone keeps the phone HUD').toBe(1);
      if (d.width >= 820 && d.height >= 820) expect(k, 'a tablet HUD is at least 1.3x').toBeGreaterThanOrEqual(1.3);
      if (d.width >= 1024 && d.height >= 1024) expect(k).toBe(1.5);
      boxes.push(['TRK box', { x: cx - 52 * k, y: k * Math.max(cy / k - 145, 72), width: 104 * k, height: 24 * k }]);
      // Alerts take the coach's slot on purpose (GPWS over stall over coach).
      const sharesSlot = (a, b) => [a, b].every((id) => id === '#coach' || ALERTS.includes(id));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (sharesSlot(boxes[i][0], boxes[j][0])) continue;
          expect(overlaps(boxes[i][1], boxes[j][1]), `${boxes[i][0]} vs ${boxes[j][0]}`).toBe(false);
        }
      }
      // The centre 40% x 30% around the horizon is free of DOM overlays, and the canvas
      // tapes (renderHud, published as ?debug hudTapes: the speed scale and its readout 60 px left of
      // its edge, the altitude scale and its readout 64 px right of its edge, cy - 90 … cy + 90, all times k) are
      // whole on screen (0217) and unobstructed.
      const horizon = { x: d.width * 0.3, y: d.height * 0.35, width: d.width * 0.4, height: d.height * 0.3 };
      const tapes = [{ x: hudTapes.speedX - 60 * k, y: cy - 90 * k, width: 60 * k, height: 180 * k }, { x: hudTapes.altX, y: cy - 90 * k, width: 64 * k, height: 180 * k }];
      if (d.width >= 390) {
        expect(hudTapes.speedX, 'speed tape where it always was, times the scale').toBeCloseTo(cx - 131 * k, 6);
        expect(hudTapes.altX, 'altitude tape where it always was, times the scale').toBeCloseTo(cx + 130 * k, 6);
        if (k === 1) expect([hudTapes.speedX, hudTapes.altX], 'a phone: to the pixel').toEqual([cx - 131, cx + 130]);
      }
      expect(tapes[0].x, 'speed tape and readout inside the left edge').toBeGreaterThanOrEqual(4);
      expect(tapes[1].x + tapes[1].width, 'altitude tape and readout inside the right edge').toBeLessThanOrEqual(d.width - (d.width >= 390 ? 1 : 4));
      for (const tp of tapes) expect(overlaps(tp, boxes.find(([id]) => id === 'TRK box')[1]), 'a tape vs the TRK box').toBe(false);
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
