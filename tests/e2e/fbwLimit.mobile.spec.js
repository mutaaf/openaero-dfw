import { test } from './fixtures.js';
import { fullPullF16 } from './fbwHelpers.js';

// Ticket 0121 on a phone (390x844, touch): the stick dragged to its top edge is full back stick,
// and the F-16's limiter holds it at the AoA limit as on the keyboard (fbwLimit.spec.js).
test('phone, Pilot, touch: the stick pulled to its top edge in the F-16 stops at the AoA limit', async ({ page }) => {
  test.setTimeout(90_000);
  const cdp = await page.context().newCDPSession(page);
  await fullPullF16(page, async () => {
    const stick = await page.locator('#touchStick').boundingBox();
    const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: stick.y, id: 1 }] });
  }, () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
});
