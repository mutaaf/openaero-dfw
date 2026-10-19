// Ticket 0029: the start screen lists every mission, grouped by airport, with your best grade.
import { test, expect } from '@playwright/test';
import { BASE, stubTiles, collectErrors } from './helpers.js';
import { MISSIONS } from '../../src/missions.js';

const cards = (page) => page.locator('#missionList .btnMission:not(#btnCrosswindToday)');

test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('one card per mission, grouped by airport, and a card loads its mission', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(BASE);
  await expect(cards(page)).toHaveCount(MISSIONS.length);
  const keys = await cards(page).evaluateAll((els) => els.map((e) => e.dataset.scenario));
  expect(keys.slice().sort()).toEqual(MISSIONS.map((m) => m.key).sort());
  expect(keys[0]).toBe('kdfw_35c_final');
  const heads = await page.locator('#missionList h2').allTextContents();
  expect(heads.map((h) => h.split(' ')[0])).toEqual(['Recommended', 'KDFW', 'KDAL', 'KADS', 'KAFW', 'KFTW', 'KGKY', 'Tours']);
  // Every card says what it is.
  for (const m of MISSIONS) {
    const card = page.locator(`#missionList .btnMission[data-scenario="${m.key}"]`);
    await expect(card).toContainText(m.blurb);
  }
  await page.locator('#missionList .btnMission[data-scenario="kads_16_final"]').click();
  await expect.poll(() => page.evaluate(() => window.openaeroDebug().mission)).toBe('kads_16_final');
  await expect(page.locator('#selScenario')).toHaveValue('kads_16_final');
  await expect(page.locator('#missionList .btnMission.active')).toHaveAttribute('data-scenario', 'kads_16_final');
  expect(errors).toEqual([]);
});

test('cards show the personal-best grade when there is one, nothing when not', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('openaero_best', JSON.stringify({ v: 1, missions: { kdal_13l_final: { score: 88, grade: 'A', at: 1 } } }));
  });
  await page.goto(BASE);
  await expect(page.locator('#missionList .btnMission[data-scenario="kdal_13l_final"] .missionBest')).toHaveText('Best A');
  await expect(page.locator('#missionList .missionBest:not(:empty)')).toHaveCount(1);
  // A new best since the page loaded shows the next time the picker opens.
  await page.locator('#btnStartFlight').click();
  await page.evaluate(() => localStorage.setItem('openaero_best', JSON.stringify({ v: 1, missions: {
    kdal_13l_final: { score: 88, grade: 'A', at: 1 }, kgky_34_final: { score: 97, grade: 'S', at: 2 } } })));
  await page.locator('#btnOpenMissions').click();
  await expect(page.locator('#missionList .btnMission[data-scenario="kgky_34_final"] .missionBest')).toHaveText('Best S');
});

test('junk or unreadable storage shows no grades and no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('openaero_best', '{nope'));
  await page.goto(BASE);
  await expect(cards(page)).toHaveCount(MISSIONS.length);
  await expect(page.locator('#missionList .missionBest:not(:empty)')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('picking from the toolbar dropdown marks that card in the picker', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('#btnStartFlight').click();
  await page.selectOption('#selScenario', 'kftw_16_final');
  await page.locator('#btnOpenMissions').click();
  await expect(page.locator('#missionList .btnMission.active')).toHaveAttribute('data-scenario', 'kftw_16_final');
  await expect(page.locator('#missionList .btnMission.active')).toHaveCount(1);
});

test('the picker at 1280x720 keeps ENTER COCKPIT on screen', async ({ page }) => {
  await page.goto(BASE);
  const box = await page.locator('#btnStartFlight').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: test.info().outputPath('picker-1280.png') });
});
