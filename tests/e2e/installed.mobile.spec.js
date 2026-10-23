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
const FLYING = ['#btnMenu', '#phoneTelemetry', '#touchThrottle', '#touchStick', '#touchButtons', '#coach', '#mapCredits'];

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
      expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
      await page.screenshot({ path: `test-results/installed-${name}-flying.png` });
      expect(errors).toEqual([]);
    });
  });
}
