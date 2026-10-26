import { test } from './fixtures.js';
import { pushAndRelease } from './pitchTrim.js';

// Ticket 0090 at 1280x720, keyboard (W = nose down).
test('Pilot, keyboard: push the nose down, let go, and it comes back up by itself', async ({ page }) => {
  test.setTimeout(120_000);
  await pushAndRelease(page, () => page.keyboard.down('KeyW'), () => page.keyboard.up('KeyW'));
});
