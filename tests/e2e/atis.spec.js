// Ticket 0030: an ATIS-style briefing from the METAR the game flies (src/atis.js, a lazy chunk), labelled live or
// scenario. Pilot sees it after Start flight; every level opens it from ATIS in the weather ribbon; a tap or Esc
// closes it. Spoken only when asked for and no coach is talking (validation panel).
import { test, expect } from './fixtures.js';
import { BASE, stubTiles, stubMetar, collectErrors, TEST_METAR } from './helpers.js';

const GUSTY = { ...TEST_METAR, wdir: 350, wspd: 23, wgst: 32, rawOb: 'METAR KDFW 162053Z 35023G32KT 10SM FEW050 BKN250 18/03 A3041', temp: 18, dewp: 3, altim: 1029.9 };
const overlaps = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
const spokenAtis = (page) => page.evaluate(() => window.__spoken.filter((t) => /information/.test(t)));
const recordSpeech = (page) => page.addInitScript(() => {
  window.__spoken = [];
  if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
});

test('Start flight shows Pilot the briefing from the live METAR; Esc closes it, ATIS opens it again', async ({ page }) => {
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
  // Under the header (the full view's panels and weather ribbon), not over it.
  const head = await page.locator('#phoneHeader').boundingBox();
  expect((await atis.boundingBox()).y).toBeGreaterThanOrEqual(head.y + head.height);
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

test('never spoken by itself; ATIS speaks it above 1,000 ft, not with Sound off', async ({ page }) => {
  await stubTiles(page);
  await recordSpeech(page);
  await page.goto(BASE);
  // The default 4 NM final (~1,270 ft AGL): shown, not spoken.
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#atis')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await spokenAtis(page)).toEqual([]);
  // Asked for from the ribbon, above 1,000 ft: spoken, digit by digit.
  await page.locator('#btnAtis').click();
  await expect.poll(async () => (await spokenAtis(page)).length).toBe(1);
  const said = (await spokenAtis(page))[0];
  expect(said).toMatch(/wind one eight zero at five/);
  expect(said).toMatch(/altimeter three zero zero two/);
  // Sound off: nothing spoken.
  await page.locator('#atis').click();
  await page.evaluate(() => { window.__spoken = []; });
  await page.locator('#btnAudio').click();
  await page.locator('#btnAtis').click();
  await expect(page.locator('#atis')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await spokenAtis(page)).toEqual([]);
});

test('a coached takeoff is not talked over: ATIS shows it but does not speak it', async ({ page }) => {
  await stubTiles(page);
  await recordSpeech(page);
  await page.goto(BASE);
  await page.locator('#missionList .btnMission[data-scenario="kdfw_takeoff"]').click();
  await page.locator('#btnStartFlight').click();
  await expect(page.locator('#atis')).toBeVisible();
  await page.locator('#atis').click();
  await page.locator('#btnAtis').click();
  await expect(page.locator('#atis')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await spokenAtis(page)).toEqual([]);
});

test('Kid is not shown ATIS words by itself; the ATIS button still opens them', async ({ page }) => {
  await stubTiles(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', JSON.stringify({ v: 1, level: 'kid', at: 0 })));
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#btnAtis')).toBeVisible();
  await expect(page.locator('#atis')).toBeHidden();
  await page.locator('#btnAtis').click();
  await expect(page.locator('#atis')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('not shown by itself on a phone (the coach has the first 30 s); from the Menu it fits at 390x844 and a tap closes it', async ({ page }) => {
    await stubTiles(page);
    await page.goto(BASE);
    await page.locator('#btnStartFlight').click();
    await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
    const atis = page.locator('#atis');
    await page.waitForTimeout(500);
    await expect(atis).toBeHidden();
    await page.locator('#btnMenu').tap();
    await page.locator('#btnAtis').tap();
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

test.describe('on a short phone held upright', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });

  test('the panel sits under the coach card in its top slot, never over it', async ({ page }) => {
    await stubTiles(page);
    await page.goto(BASE);
    await page.locator('#btnStartFlight').click();
    const coach = page.locator('#coach');
    await expect(coach).toBeVisible();
    // Opened again once the coach has taken its slot, as a player would.
    await page.waitForTimeout(1000);
    const atis = page.locator('#atis');
    if (await atis.isVisible()) await atis.tap();
    await page.locator('#btnMenu').tap();
    await page.locator('#btnAtis').tap();
    await expect(atis).toBeVisible();
    expect(overlaps(await atis.boundingBox(), await coach.boundingBox())).toBe(false);
  });
});

test.describe('on a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('not shown by itself (it would cover the Menu); from the Menu it docks top-left, clear of the coach card', async ({ page }) => {
    await stubTiles(page);
    await page.goto(BASE);
    await page.locator('#btnStartFlight').click();
    await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
    const atis = page.locator('#atis');
    await page.waitForTimeout(500);
    await expect(atis).toBeHidden();
    await page.locator('#btnMenu').tap();
    await page.locator('#btnAtis').tap();
    await expect(atis).toBeVisible();
    const box = await atis.boundingBox();
    expect(box.x + box.width).toBeLessThan(844 / 2); // the heading box and the boresight are at the centre
    expect(box.y + box.height).toBeLessThan(390 * 0.35); // the horizon and the speed readout sit lower
    const coach = page.locator('#coach');
    if (await coach.isVisible()) expect(overlaps(box, await coach.boundingBox())).toBe(false);
  });
});
