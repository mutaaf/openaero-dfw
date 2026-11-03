import { test } from './fixtures.js';
import { fullPullF16 } from './fbwHelpers.js';

// Ticket 0121 at 1280x720 on the keyboard: see fbwHelpers.js.
test('desktop, Pilot, keyboard: full back stick in the F-16 stops at the AoA limit, and G-LOAD reads the pull', async ({ page }) => {
  test.setTimeout(90_000);
  await fullPullF16(page, () => page.keyboard.down('KeyS'), () => page.keyboard.up('KeyS'));
});
