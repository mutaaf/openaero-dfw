// Ticket 0030: an ATIS-style briefing after Start flight, from the METAR the game flies (src/atis.js, a lazy
// chunk), labelled live or scenario, closed by a tap or Esc, opened again from ATIS in the weather ribbon.
import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, collectErrors, TEST_METAR } from './helpers.js';

const GUSTY = { ...TEST_METAR, wdir: 350, wspd: 23, wgst: 32, rawOb: 'METAR KDFW 162053Z 35023G32KT 10SM FEW050 BKN250 18/03 A3041', temp: 18, dewp: 3, altim: 1029.9 };

test('Start flight shows the briefing from the live METAR; Esc closes it, ATIS opens it again', async ({ page }) => {
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, [GUSTY]);
  await page.goto(BASE);
  await expect(page.locator('#wxBadge')).toHaveText('LIVE METAR');
  await page.locator('#btnStartFlight').click();
  const atis = page.locator('#atis');
  await expect(atis).toBeVisible();
  await expect(atis).toContainText('ATIS-style · live KDFW METAR 2053Z');
  await expect(atis).toContainText('not the real broadcast');
  // 350° true is 350 magnetic at 2.7° E, to the nearest 10.
  for (const s of ['DFW information', 'Wind 350 at 23 gusts 32', 'Visibility 10', 'Few 5,000, ceiling 25,000 broken',
    'Temperature 18, dew point 3', 'Altimeter 30.41', 'Landing runway 35C']) await expect(atis).toContainText(s);
  await page.keyboard.press('Escape');
  await expect(atis).toBeHidden();
  await page.locator('#btnAtis').click();
  await expect(atis).toBeVisible();
  await atis.click();
  await expect(atis).toBeHidden();
  expect(errors).toEqual([]);
});

test('scenario weather is labelled scenario, never live, and a takeoff names the departure runway', async ({ page }) => {
  await stubTiles(page);
  await page.unroute('**/openaero/api/metar*');
  await stubMetar(page, [], 503);
  await page.goto(BASE);
  await page.locator('#missionList .btnMission[data-scenario="kdfw_takeoff"]').click();
  await page.locator('#btnStartFlight').click();
  const atis = page.locator('#atis');
  await expect(atis).toBeVisible();
  await expect(atis).toContainText('SCENARIO weather');
  await expect(atis).toContainText('Departing runway');
  expect(await atis.innerText()).not.toMatch(/\blive\b/i);
});

test('it speaks only with sound on, and only on a ground start unless asked', async ({ page }) => {
  await stubTiles(page);
  await page.addInitScript(() => {
    window.__spoken = [];
    const S = window.speechSynthesis;
    if (S) S.speak = (u) => { window.__spoken.push(u.text); };
  });
  await page.goto(BASE);
  // The default final: shown, not spoken (the coach talks on a final).
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#atis')).toBeVisible();
  await page.waitForTimeout(500);
  expect((await page.evaluate(() => window.__spoken)).filter((t) => /information/.test(t))).toEqual([]);
  // Asked for from the ribbon: spoken, digit by digit.
  await page.locator('#btnAtis').click();
  await expect.poll(async () => (await page.evaluate(() => window.__spoken)).filter((t) => /information/.test(t)).length).toBe(1);
  const said = (await page.evaluate(() => window.__spoken)).find((t) => /information/.test(t));
  expect(said).toMatch(/wind one eight zero at five/);
  expect(said).toMatch(/altimeter three zero zero two/);
  // Sound off: nothing spoken.
  await page.locator('#atis').click();
  await page.evaluate(() => { window.__spoken = []; });
  const audio = page.locator('#btnAudio');
  await audio.click();
  await page.locator('#btnAtis').click();
  await expect(page.locator('#atis')).toBeVisible();
  await page.waitForTimeout(500);
  expect((await page.evaluate(() => window.__spoken)).filter((t) => /information/.test(t))).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the panel fits at 390x844, clear of the touch deck, and a tap closes it', async ({ page }) => {
    await stubTiles(page);
    await page.goto(BASE);
    await page.locator('#btnStartFlight').click();
    const atis = page.locator('#atis');
    await expect(atis).toBeVisible();
    const box = await atis.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const deck = await page.locator('#touchDeck').boundingBox();
    if (deck) expect(box.y + box.height).toBeLessThan(deck.y);
    expect(box.height).toBeLessThan(160);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await atis.tap();
    await expect(atis).toBeHidden();
  });
});

test.describe('on a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('the panel docks top-left, clear of the coach card and the 3D view\'s centre', async ({ page }) => {
    await stubTiles(page);
    await page.goto(BASE);
    await page.locator('#btnStartFlight').click();
    const atis = page.locator('#atis');
    await expect(atis).toBeVisible();
    const box = await atis.boundingBox();
    expect(box.x + box.width).toBeLessThan(844 / 2); // the heading box and the boresight are at the centre
    expect(box.y + box.height).toBeLessThan(390 * 0.35); // the horizon and the speed readout sit lower
    const coach = page.locator('#coach');
    if (await coach.isVisible()) {
      const c = await coach.boundingBox();
      expect(box.x + box.width <= c.x || c.x + c.width <= box.x || box.y + box.height <= c.y).toBe(true);
    }
  });
});
