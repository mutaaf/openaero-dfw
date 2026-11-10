import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, FULL_RES, measureRunway } from './helpers.js';
import { recordCaptions } from './captionHelpers.js';

// Ticket 0092: the low-ceiling ILS. A scripted LIFR report (BKN004 OVC008, 2 SM) over today's live
// one (helpers.js stubs a VFR METAR with a 5 kt tailwind on 35C): labelled scenario, the spawn flown
// in its wind, the runway hidden from 5 NM above the overcast, its lights in sight under the
// ceiling, and "minimums" once at 200 ft. Pixels at full resolution, flashers steady (one number).
test.use({ ...FULL_RES, reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());

async function noon(page) {
  await page.evaluate(() => [...document.querySelectorAll('#timePicker .btnTime')].find((b) => b.textContent.includes('Day')).click());
  await expect.poll(async () => (await snap(page)).sun.mode).toBe('Noon');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const pause = (page, on) => page.evaluate((on) => { if (window.openaeroDebug().paused !== on) document.getElementById('btnPause').click(); }, on);

test('low-ceiling ILS: Weather group, scenario LIFR, hidden from 5 NM, lights at the break-out, minimums once', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"kid","at":0}'));
  await page.goto(`${BASE}?debug&mission=kdfw_35c_low_ifr`);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  const group = page.locator('#missionList section', { has: page.locator('h2', { hasText: /^Weather$/ }) });
  await expect(group.locator('[data-scenario="kdfw_35c_low_ifr"]')).toContainText('Low Ceiling');
  // The live report has arrived (helpers.js: VFR, 180/5) and the mission still flies its own.
  await expect.poll(async () => (await snap(page)).fltCat, { timeout: 10_000 }).toBe('LIFR');
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  const s = await snap(page);
  expect(s).toMatchObject({ mission: 'kdfw_35c_low_ifr', activeRunway: 'KDFW_35C', wxLive: false, fltCat: 'LIFR', cloudBaseFt: 400, onGround: false });
  expect(s.hudWind).toMatchObject({ live: false, source: 'LIFR SCN', speed: '350/12' });
  expect(s.dh).toMatchObject({ armed: true, calls: 0 });
  // Spawned in the scripted wind, not the live 5 kt tailwind: the airspeed is the trim speed, no 17 kt shear.
  expect(Math.abs(s.iasKts - s.trimKts)).toBeLessThan(4);
  // The ribbon (full view) says scenario, and never live, for the whole flight.
  await expect(page.locator('#wxBadge')).toHaveText('SCENARIO WX');
  await expect(page.locator('#txtMetarString')).toContainText('BKN004 OVC008');
  await expect(page.locator('#txtFlow')).toContainText('NORTH'); // DFW's flow from the scripted north wind, not the live south one

  // 5 NM, ~1,600 ft over the threshold, above the 800 ft overcast: no runway, no lights.
  await pause(page, true);
  await noon(page);
  await expect.poll(async () => (await snap(page)).sky.runwayLights, { timeout: 15_000 }).toBeGreaterThan(5000); // on by day under 5 SM
  const above = await measureRunway(page);
  await page.screenshot({ path: test.info().outputPath('lowifr-5nm.png') });

  // In the cloud between the layers (~2.2 NM, ~750 ft): still nothing (the first-timer panel saw the
  // whole field from here before the in-cloud fog).
  await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 2.2, 0, { lowIfr: true }));
  await pause(page, false); // a few steps: the cloud's fog is set from the camera's height each step
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await pause(page, true);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const between = await measureRunway(page);
  await page.screenshot({ path: test.info().outputPath('lowifr-in-cloud.png') });

  // Under the ceiling on the same final (the chunk is in, so the debug final keeps the mission's weather).
  await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 0.9, 0, { lowIfr: true }));
  await pause(page, false);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await pause(page, true);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const t = await snap(page);
  expect(t).toMatchObject({ fltCat: 'LIFR', wxLive: false });
  expect((t.pos.y - t.groundY) * 3.28084).toBeLessThan(400); // under the broken base (CG over the ground)
  const below = await measureRunway(page);
  await page.screenshot({ path: test.info().outputPath('lowifr-breakout.png') });
  console.log(`[0092] 5 NM above the deck: contrast ${above.contrast}, lit ${above.lit}; in cloud at 2.2 NM: contrast ${between.contrast}, lit ${between.lit}; under it at 0.9 NM: contrast ${below.contrast}, lit ${below.lit}`);
  expect(above.lit).toBe(0);
  expect(above.contrast).toBeLessThan(1.05);
  expect(between.lit).toBe(0);
  expect(between.contrast).toBeLessThan(1.05);
  expect(below.lit).toBeGreaterThan(20);

  // Kid flies the ILS down: "minimums" once at the decision height, the coach asks the question.
  await recordCaptions(page);
  await pause(page, false);
  await expect.poll(async () => (await snap(page)).dh?.calls, { timeout: 60_000, intervals: [100] }).toBe(1);
  await expect(page.locator('#txtCoach')).toHaveText(/Minimums \(200 ft\): there are the runway lights/);
  const calledAt = await snap(page);
  expect(calledAt.dh.calledAt).not.toBeNull();
  await expect.poll(async () => (await page.evaluate(() => window.__captions)).some((c) => /minimums/.test(c.text))).toBe(true);
  await expect.poll(async () => (await snap(page)).onGround, { timeout: 60_000 }).toBe(true);
  expect((await snap(page)).dh.calls).toBe(1);
  expect(errors).toEqual([]);
});

// The first-timer panel's go-around: Learner, full power and nose up at minimums. The coach flies the
// missed approach with them (never "you're high: ease the nose down" on the way up).
test('a missed approach at minimums is coached: power, flaps, gear, climb', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_assist_v1', '{"v":1,"level":"learner","at":0}'));
  await page.goto(`${BASE}?debug&mission=kdfw_35c_low_ifr`);
  await expect.poll(async () => (await snap(page)).fltCat, { timeout: 10_000 }).toBe('LIFR');
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 0.9, 0, { lowIfr: true }));
  await expect.poll(async () => (await snap(page)).dh?.calls, { timeout: 60_000, intervals: [100] }).toBe(1);
  await page.evaluate(() => {
    window.__coach = [];
    const el = document.getElementById('txtCoach');
    new MutationObserver(() => window.__coach.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.locator('#rngThrottle').fill('100');
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await snap(page)).dh.missed, { timeout: 10_000 }).toBe(true);
  await expect(page.locator('#txtCoach')).toHaveText(/Flaps up one notch|Nose up: climb away/, { timeout: 15_000 });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('f');
  await expect(page.locator('#txtCoach')).toHaveText(/gear up|Climb straight ahead|Flaps up one notch/, { timeout: 15_000 });
  const said = await page.evaluate(() => window.__coach);
  console.log(`[0092] missed approach coach: ${[...new Set(said)].join(' | ')}`);
  expect(said.some((t) => /high|ease the nose down|Slow: fly/i.test(t))).toBe(false);
  expect((await snap(page)).onGround).toBe(false);
  expect(errors).toEqual([]);
});

