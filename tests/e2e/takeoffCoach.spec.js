import { test, expect } from './fixtures.js';
import { stubTiles, enterCockpit } from './helpers.js';
// A takeoff roll: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

test.beforeEach(async ({ page }) => { await stubTiles(page); });

const debug = (page) => page.evaluate(() => window.openaeroDebug());

// Ticket 0093: the takeoff mission with the coach on: full power, the roll, "Rotate" with the
// 737's lift-off attitude at Vr, then positive rate, gear up. Each prompt is recorded as it shows
// (a short-lived line is read from its history, LESSONS 2026-11-01), and spoken once.
test('737 takeoff with the coach: full power, rotate to 8°, positive rate gear up, spoken under 100 ft too', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
    window.speechSynthesis.cancel = () => {};
  });
  await enterCockpit(page); // first visit: the coach is ticked, sound on
  await page.selectOption('#selScenario', 'kdfw_takeoff');
  await page.evaluate(() => {
    window.__coach = [];
    const el = document.getElementById('txtCoach');
    new MutationObserver(() => { if (window.__coach.at(-1) !== el.textContent) window.__coach.push(el.textContent); })
      .observe(el, { childList: true, characterData: true, subtree: true });
  });
  await expect(page.locator('#txtCoach')).toHaveText(/Full power/, { timeout: 10_000 });
  await page.click('#btnToga');
  await expect.poll(() => page.evaluate(() => window.__coach), { timeout: 90_000 }).toContainEqual('Rotate: nose up (S or ↑) to 8°');
  // Nose up to the attitude and let go there (the takeoff trim climbs it): held to lift-off, a slow
  // runner's frames over-rotated it past "Too steep" (device panel).
  // Let go inside the page on the frame it passes 6° (a poll from the test lags by up to a second of a busy
  // runner's sim time, and the nose went on to "Too steep": a true call for that pull, device panel).
  await page.evaluate(() => new Promise((done) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp' }));
    const watch = () => {
      if (window.openaeroDebug().pitchDeg > 6) { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp' })); done(); }
      else requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }));
  await expect.poll(async () => (await debug(page)).onGround, { timeout: 30_000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__coach), { timeout: 30_000 }).toContainEqual('Positive rate: gear up (G)');
  const shown = await page.evaluate(() => window.__coach);
  const i = (re) => shown.findIndex((t) => re.test(t));
  expect(i(/^On the centreline: rotate at 145 kt$/)).toBeGreaterThan(i(/Full power/));
  expect(i(/^Rotate/)).toBeGreaterThan(i(/^On the centreline/));
  expect(i(/^Positive rate/)).toBeGreaterThan(i(/^Rotate/));
  // Spoken (sound on), each prompt once, never cutting off a takeoff callout.
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken).toContain('Rotate: nose up (S or ↑) to 8°');
  expect(spoken.filter((t) => t.startsWith('Rotate:'))).toHaveLength(1);
  expect(spoken).toContain('rotate');
  // The climb-out's first prompt comes under 100 ft, where a final's GPWS heights would be (first-timer panel).
  expect(spoken).toContain('Positive rate: gear up (G)');
});

// Sound off: the card still coaches, nothing is spoken. Skip hides it for the flight.
test('Cessna takeoff, sound off: the card coaches silently and Skip hides it', async ({ page }) => {
  test.setTimeout(120_000);
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
  await expect(page.locator('#txtCoach')).toHaveText(/Full power/, { timeout: 10_000 });
  await page.click('#btnToga');
  await expect(page.locator('#txtCoach')).toHaveText('On the centreline: rotate at 55 kt', { timeout: 30_000 });
  await page.locator('#btnCoachSkip').click();
  await expect(page.locator('#coach')).toBeHidden();
  await page.waitForTimeout(3_000);
  await expect(page.locator('#coach')).toBeHidden();
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});
