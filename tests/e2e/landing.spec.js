import { test, expect } from './fixtures.js';
import { stubTiles, enterCockpit } from './helpers.js';

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
