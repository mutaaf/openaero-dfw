import { test, expect } from './fixtures.js';
import { stubTiles, enterCockpit } from './helpers.js';
// A long flight: sim time at 2x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 2, deviceScaleFactor: 0.25 });

test.beforeEach(async ({ page }) => { await stubTiles(page); });

// The flare challenge spawns on a short final; ILS autoland flies it to touchdown, which
// must produce a graded results card and a versioned personal best.
test('a landing is graded and the personal best survives a reload', async ({ page }) => {
  test.setTimeout(150_000);
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdfw_35c_flare');
  await page.click('#btnApApr');
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  const grade = await page.locator('#txtGrade').textContent();
  expect(['S', 'A', 'B', 'C', 'D', 'CRASH']).toContain(grade.trim());
  await expect(page.locator('#resultsFactors li')).toHaveCount(5);
  // 0061: every grade but an S says the one thing to fix next time.
  if (grade.trim() === 'S') await expect(page.locator('#tipRow')).toBeHidden();
  else await expect(page.locator('#txtTip')).toHaveText(/\S.*\.$/);
  // The autoland's flare is no bounce (0091: no false positive on the card).
  expect((await page.evaluate(() => window.openaeroDebug())).lastLanding.bounces).toBe(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best') || 'null'));
  if (grade.trim() !== 'CRASH') {
    expect(stored.v).toBe(1);
    expect(stored.missions.kdfw_35c_flare.grade).toBe(grade.trim());
    await page.reload();
    const again = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
    expect(again.missions.kdfw_35c_flare.score).toBe(stored.missions.kdfw_35c_flare.score);
  }
  // "Fly again" reloads the mission airborne.
  await page.goto('/openaero/');
});

test('voice callouts speak the altitude words when sound is on', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
    window.speechSynthesis.cancel = () => {};
  });
  await enterCockpit(page); // the start button turns sound on (checkbox default)
  await page.selectOption('#selScenario', 'kdfw_35c_flare');
  await page.click('#btnApApr');
  await expect.poll(() => page.evaluate(() => window.__spoken), { timeout: 120_000 }).toContain('fifty');
});

test('with sound off nothing is spoken', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
  });
  await page.goto('/openaero/');
  await page.locator('summary', { hasText: 'Options' }).click();
  await page.locator('#chkAutoSound').uncheck();
  await page.click('#btnStartFlight');
  await page.selectOption('#selScenario', 'kdfw_35c_flare');
  await page.click('#btnApApr');
  await expect(page.locator('#resultsCard')).toBeVisible({ timeout: 120_000 });
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});
