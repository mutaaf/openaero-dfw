import { test } from './fixtures.js';
import { pushAndRelease } from './pitchTrim.js';

// Ticket 0090 on a phone (390x844, touch, Pilot): thumb on the stick, down (nose down), lift it.
test('phone, Pilot, touch: push the stick, lift the thumb, and the nose comes back up by itself', async ({ page }) => {
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  let stick;
  await pushAndRelease(page, async () => {
    stick = await page.locator('#touchStick').boundingBox();
    const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: stick.y + stick.height * 0.85, id: 1 }] });
  }, () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
});
