import { test, expect } from './fixtures.js';
import { stubTiles, enterCockpit } from './helpers.js';
import { stripLayout } from '../../src/touchdownStrip.js';
// A long flight: sim time at 4x wall time, a quarter of the pixels (fixtures.js; CI's 30 min limit).
test.use({ simWarp: 4, deviceScaleFactor: 0.25 });

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
  const landed = (await page.evaluate(() => window.openaeroDebug())).lastLanding;
  expect(landed.bounces).toBe(0);
  // 0088: the runway strip puts the dot where the wheels touched, and says it in words.
  const strip = page.locator('#touchdownStrip');
  await expect(strip).toBeVisible();
  const along = Math.round(landed.pastThresholdM), cross = Math.round(Math.abs(landed.crossM));
  await expect(strip).toHaveAttribute('aria-label', new RegExp(`^Touched down ${along} metres past the threshold, `
    + (cross < 1 ? 'on the centreline' : `${cross} metres ${landed.crossM > 0 ? 'right' : 'left'} of centre`)));
  const px = await strip.evaluate((c) => ({ w: c.clientWidth, h: c.clientHeight, sx: c.width / c.clientWidth }));
  const L = stripLayout({ pastThresholdM: landed.pastThresholdM, crossM: landed.crossM, lengthM: 4084, widthM: 45.7 }, px.w, px.h);
  // The dot's colour is under its centre (not the runway's slate grey).
  const rgb = await strip.evaluate((c, [x, y]) => [...c.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data],
    [L.dotX * px.sx, L.dotY * px.sx]);
  expect(rgb[3]).toBe(255);
  expect(rgb[0] + rgb[1] + rgb[2]).toBeGreaterThan(400);
  // 0227: the approach from the side, the 3° path dashed and the autoland's track on it, summed up in words.
  const side = page.locator('#profilePlot');
  await expect(side).toBeVisible();
  await expect(side).toHaveAttribute('role', 'img');
  await expect(side).toHaveAttribute('aria-label', /^Your approach from the side: .+\.$/);
  await expect(side.locator('svg path[stroke-dasharray]')).not.toHaveCount(0);
  await expect(side.locator('svg path[stroke="#38bdf8"]')).toHaveCount(1);
  await expect(page.locator('#trackPlot')).toBeHidden();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best') || 'null'));
  const tracks = await page.evaluate(() => localStorage.getItem('openaero_besttrack_v1'));
  if (grade.trim() !== 'CRASH') {
    expect(stored.v).toBe(1);
    expect(stored.missions.kdfw_35c_flare.grade).toBe(grade.trim());
    // 0229: the first landing is a new best, so its final approach is kept: a second apart, runway metres, the
    // last point the touchdown (where the strip put it), under 1.5 kB, stamped with the best's time.
    expect(tracks.length).toBeLessThan(1500);
    const t = JSON.parse(tracks).tracks.kdfw_35c_flare;
    expect(JSON.parse(tracks).v).toBe(1);
    expect(t.dt).toBe(1);
    expect(t.at).toBe(stored.missions.kdfw_35c_flare.at);
    expect(t.pts.length).toBeGreaterThan(5);
    const td = t.pts[t.pts.length - 1];
    expect(Math.abs(td[2] - landed.pastThresholdM)).toBeLessThan(6);
    expect(Math.abs(td[0] - landed.crossM)).toBeLessThan(2);
    expect(t.pts[0][2]).toBeLessThan(td[2]); // flown towards the runway
    expect(t.pts[0][1]).toBeGreaterThan(td[1]); // and down to it
    await page.reload();
    const again = await page.evaluate(() => JSON.parse(localStorage.getItem('openaero_best')));
    expect(again.missions.kdfw_35c_flare.score).toBe(stored.missions.kdfw_35c_flare.score);
    expect(await page.evaluate(() => localStorage.getItem('openaero_besttrack_v1'))).toBe(tracks);
  } else expect(tracks).toBeNull();
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
