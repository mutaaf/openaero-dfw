import { test, expect } from './fixtures.js';
import { stubTiles, enterCockpit } from './helpers.js';

test.beforeEach(async ({ page }) => { await stubTiles(page); });

const debug = (page) => page.evaluate(() => window.openaeroDebug());

// Takeoff callouts (0035): full power on the 35C takeoff roll, rotate at Vr, and the
// crew's words are spoken in order: eighty knots, V1, rotate, positive rate.
test('737 takeoff roll: eighty knots, V1, rotate, positive rate, spoken in order', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
    window.speechSynthesis.cancel = () => {};
  });
  await enterCockpit(page); // sound on (checkbox default)
  await page.selectOption('#selScenario', 'kdfw_takeoff');
  expect((await debug(page)).takeoffCalls).toEqual([]);
  await page.click('#btnToga');
  await expect.poll(() => page.evaluate(() => window.__spoken), { timeout: 90_000 }).toContain('rotate');
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await debug(page)).onGround, { timeout: 20_000 }).toBe(false);
  await page.keyboard.up('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__spoken), { timeout: 30_000 }).toContain('positive rate');
  const order = ['eighty knots', 'V1', 'rotate', 'positive rate'];
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken.filter((w) => order.includes(w))).toEqual(order);
  expect((await debug(page)).takeoffCalls).toEqual(order);
});

// Sound off: nothing is spoken, the HUD still gets the words. The Cessna (Vr 55) hears no
// 80 kt check and no V1.
test('Cessna takeoff with sound off: nothing spoken, rotate and positive rate still called', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
  });
  await page.goto('/openaero/');
  await page.locator('summary', { hasText: 'Options' }).click();
  await page.locator('#chkAutoSound').uncheck();
  await page.click('#btnStartFlight');
  await page.locator('#selAircraft').selectOption('c172');
  await page.selectOption('#selScenario', 'kdfw_takeoff');
  await page.click('#btnToga');
  await expect.poll(async () => (await debug(page)).takeoffCalls, { timeout: 60_000 }).toEqual(['rotate']);
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await debug(page)).onGround, { timeout: 20_000 }).toBe(false);
  await page.keyboard.up('ArrowUp');
  await expect.poll(async () => (await debug(page)).takeoffCalls, { timeout: 30_000 }).toEqual(['rotate', 'positive rate']);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});
