import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, enterCockpit, lowContrastLabels } from './helpers.js';

// Ticket 0171: rebindable keys. The controls sheet's CHANGE KEYS view binds an action to the next key
// pressed; the map is saved on this device (openaero_keys_v1) and survives a reload.
test.beforeEach(async ({ page }) => { await stubTiles(page); });

const debug = (page) => page.evaluate(() => window.openaeroDebug());
const ail = async (page) => (await debug(page)).aileronInput;

async function openKeys(page) {
  await page.keyboard.press('Shift+Slash'); // "?"
  await expect(page.locator('#controlsSheet')).toBeVisible();
  await page.locator('#btnKeys').click();
  await expect(page.locator('#controlsBody h3')).toHaveText('Your keys');
}

test('bank left on J: J banks left, A does nothing, the sheet and key strip say J, and a reload keeps it (0171)', async ({ page }) => {
  const errors = collectErrors(page);
  await enterCockpit(page);
  await openKeys(page);
  await expect(page.locator('#btnKeys_bankLeft')).toHaveText('A');

  // Escape cancels a capture without closing the sheet.
  await page.locator('#btnKeys_bankLeft').click();
  await expect(page.locator('#btnKeys_bankLeft')).toHaveText('Press a key…');
  await page.keyboard.press('Escape');
  await expect(page.locator('#controlsSheet')).toBeVisible();
  await expect(page.locator('#txtKeysMsg')).toHaveText('Not changed.');
  await expect(page.locator('#btnKeys_bankLeft')).toHaveText('A');
  await expect(page.locator('#btnKeys_bankLeft')).toBeFocused();

  // A key another action has is refused, naming the action.
  await page.locator('#btnKeys_bankLeft').click();
  await page.keyboard.press('KeyD');
  await expect(page.locator('#txtKeysMsg')).toHaveText('D is already Bank right: change that one first.');
  await expect(page.locator('#btnKeys_bankLeft')).toHaveText('A');

  await page.locator('#btnKeys_bankLeft').click();
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#btnKeys_bankLeft')).toHaveText('J');
  await expect(page.locator('#txtKeysMsg')).toHaveText('Bank left is now J.');
  // Fits the 1280x720 view; small text reads 4.5:1.
  const box = await page.locator('#controlsPanel').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  expect(await lowContrastLabels(page, '#controlsSheet')).toEqual([]);
  await page.screenshot({ path: 'test-results/keys-1280x720.png' });

  // Back: the sheet's row prints the player's key.
  await page.locator('#btnKeysBack').click();
  await expect(page.locator('#controlsBody dt', { hasText: 'J or ← / D or →' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#controlsSheet')).toBeHidden();
  await expect(page.locator('#keyHints kbd[data-k="bankLeft"]')).toHaveText('J');

  // J banks left; A no longer does.
  await page.keyboard.down('KeyJ');
  await expect.poll(() => ail(page), { timeout: 5_000 }).toBeLessThan(-0.5);
  await page.keyboard.up('KeyJ');
  await expect.poll(() => ail(page), { timeout: 5_000 }).toBeGreaterThan(-0.05);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(600);
  expect(Math.abs(await ail(page))).toBeLessThan(0.05);
  await page.keyboard.up('KeyA');

  // A reload keeps the map.
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('openaero_keys_v1'))).map.bankLeft).toEqual(['KeyJ', 'ArrowLeft']);
  await enterCockpit(page);
  await expect(page.locator('#keyHints kbd[data-k="bankLeft"]')).toHaveText('J');
  await page.keyboard.down('KeyJ');
  await expect.poll(() => ail(page), { timeout: 5_000 }).toBeLessThan(-0.5);
  await page.keyboard.up('KeyJ');

  // Reset to defaults: A banks left again, nothing stored.
  await openKeys(page);
  await page.locator('#btnKeysReset').click();
  await expect(page.locator('#btnKeys_bankLeft')).toHaveText('A');
  await page.keyboard.press('Escape');
  await expect(page.locator('#keyHints kbd[data-k="bankLeft"]')).toHaveText('A');
  expect(await page.evaluate(() => localStorage.getItem('openaero_keys_v1'))).toBe(null);
  await page.keyboard.down('KeyA');
  await expect.poll(() => ail(page), { timeout: 5_000 }).toBeLessThan(-0.5);
  await page.keyboard.up('KeyA');
  expect(errors).toEqual([]);
});

test('a toggle key moves too: brakes on U, B does nothing (0171)', async ({ page }) => {
  await enterCockpit(page);
  await openKeys(page);
  // A key the browser would still act on is refused (panel: Ctrl, the power key, + N opens a window).
  await page.locator('#btnKeys_brakes').click();
  await page.keyboard.press('KeyN');
  await expect(page.locator('#txtKeysMsg')).toContainText("N can't be a flight key");
  await page.locator('#btnKeys_brakes').click();
  await page.keyboard.press('KeyU');
  await page.keyboard.press('Escape');
  await expect(page.locator('#controlsSheet')).toBeHidden();
  const before = await page.locator('#txtBrakes').textContent();
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(200);
  await expect(page.locator('#txtBrakes')).toHaveText(before);
  await page.keyboard.press('KeyU');
  await expect(page.locator('#txtBrakes')).not.toHaveText(before);
});

test('corrupt stored keys fall back to the defaults with no console error (0171)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_keys_v1', '{not json'));
  await enterCockpit(page);
  await page.keyboard.down('KeyA');
  await expect.poll(() => ail(page), { timeout: 5_000 }).toBeLessThan(-0.5);
  await page.keyboard.up('KeyA');
  await expect(page.locator('#keyHints kbd[data-k="bankLeft"]')).toHaveText('A');
  expect(errors).toEqual([]);
});
