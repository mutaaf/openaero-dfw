import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0086: launched from the home screen the sim is fullscreen, and with the
// black-translucent status bar the page runs under the notch, the status bar and the home
// indicator. Chromium reports an iPhone 15's safe-area insets through the DevTools protocol;
// the start screen, the HUD's top stack, the touch controls and the imagery credit must stay
// inside them. (Nothing in the stylesheet keys on display-mode, so the insets are the test.)
const IPHONE_15 = [
  { name: 'portrait', viewport: { width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } },
  { name: 'landscape', viewport: { width: 844, height: 390 }, insets: { top: 0, right: 59, bottom: 21, left: 59 } },
];
const START = ['#modalPanel', '#btnStartFlight'];
const FLYING = ['#btnMenu', '#phoneTelemetry', '#touchThrottle', '#touchStick', '#touchButtons', '#coach'];

for (const { name, viewport, insets } of IPHONE_15) {
  test.describe(`installed on an iPhone 15, ${name}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the start screen and the flying HUD stay inside the safe area', async ({ page }) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      await stubTiles(page);
      const errors = collectErrors(page);
      await page.goto(BASE);
      const safe = { x0: insets.left, y0: insets.top, x1: viewport.width - insets.right, y1: viewport.height - insets.bottom };
      const outside = async (sels) => {
        const bad = [];
        for (const sel of sels) {
          const b = await page.locator(sel).boundingBox();
          expect(b, sel).not.toBeNull();
          // Half a pixel for subpixel layout.
          if (b.x < safe.x0 - 0.5 || b.y < safe.y0 - 0.5 || b.x + b.width > safe.x1 + 0.5 || b.y + b.height > safe.y1 + 0.5) {
            bad.push(`${sel} ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`);
          }
        }
        return bad;
      };
      expect(await outside(START)).toEqual([]);
      await page.screenshot({ path: `test-results/installed-${name}-start.png` });
      await page.locator('#btnStartFlight').tap();
      await expect(page.locator('#onboardingModal')).toBeHidden();
      await expect(page.locator('#coach')).toBeVisible({ timeout: 5_000 });
      expect(await outside(FLYING)).toEqual([]);
      // The imagery credit sits above the home indicator, under the touch deck's controls. Its
      // width is the font's (one nowrap line, wider than a 390 px phone with some fallback fonts,
      // as on main), so only its height is this ticket's.
      const credit = await page.locator('#mapCredits').boundingBox();
      expect(credit.y + credit.height).toBeLessThanOrEqual(safe.y1 + 0.5);
      const deck = await page.locator('#touchButtons').boundingBox();
      expect(credit.y).toBeGreaterThanOrEqual(deck.y + deck.height - 0.5);
      expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
      await page.screenshot({ path: `test-results/installed-${name}-flying.png` });
      // GPWS and stall alerts stay in the safe area and never cover the top bar (panel, 0086).
      const ALERTS = ['#masterAlertBanner', '#stallAlertBanner'];
      // The sim re-hides them every frame, so force them on with a stylesheet while measuring.
      const forced = await page.addStyleTag({ content: `${ALERTS.join(',')} { display: block !important; }` });
      expect(await outside(ALERTS)).toEqual([]);
      for (const alert of ALERTS) {
        const a = await page.locator(alert).boundingBox();
        for (const bar of ['#btnMenu', '#phoneTelemetry']) {
          const b = await page.locator(bar).boundingBox();
          const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
          expect(overlap, `${alert} over ${bar}`).toBe(false);
        }
      }
      await forced.evaluate((el) => el.remove());
      if (name === 'landscape') {
        // The open menu sheet stops above the function-button row, inset included.
        await page.locator('#btnMenu').tap();
        await expect(page.locator('#hudMenu')).toBeVisible();
        const sheet = await page.locator('#hudMenu').boundingBox();
        const row = await page.locator('#touchButtons').boundingBox();
        expect(sheet.y + sheet.height).toBeLessThanOrEqual(row.y - 8);
      }
      expect(errors).toEqual([]);
    });
  });
}
