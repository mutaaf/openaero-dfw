import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, enterCockpit } from './helpers.js';

// Ticket 0022: sound, camera and the last mission flown come back on the next visit
// (openaero_prefs_v1, src/prefs.js). Sound still starts only on the Fly tap (autoplay policy).
test.beforeEach(async ({ page }) => { await stubTiles(page); });

const prefs = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('openaero_prefs_v1') || 'null'));

test('sound, camera and the last mission are restored after a reload; bests untouched', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(BASE);
  // A first visit: the default final, sound box ticked, the cockpit, the plain Fly button.
  await expect(page.locator('#btnStartFlight')).toHaveText(/Fly/);
  await expect(page.locator('#chkAutoSound')).toBeChecked();
  expect(await prefs(page)).toBeNull();
  const best = JSON.stringify({ v: 1, missions: { kdfw_35c_final: { score: 80, grade: 'A', at: 0 } } });
  await page.evaluate((b) => localStorage.setItem('openaero_best', b), best);

  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.selectOption('#selScenario', 'kdal_13l_final');
  await page.locator('#btnCamera').click();
  await page.locator('#btnCamera').click();
  await expect(page.locator('#txtCamMode')).toHaveText('Spotter Flyby');
  await page.locator('#btnAudio').click(); // sound was on (Fly): now off
  await expect(page.locator('#txtAudioState')).toHaveText('OFF');
  expect(await prefs(page)).toMatchObject({ v: 1, sound: false, camera: 2, mission: 'kdal_13l_final' });

  await page.reload();
  await expect(page.locator('#onboardingModal')).toBeVisible();
  await expect(page.locator('.btnMission.active')).toHaveAttribute('data-scenario', 'kdal_13l_final');
  await expect(page.locator('#selScenario')).toHaveValue('kdal_13l_final');
  await expect(page.locator('#btnStartFlight')).toHaveText('Continue ✈');
  await expect(page.locator('#chkAutoSound')).not.toBeChecked();
  await expect(page.locator('#chkAutoSound')).toBeVisible(); // a remembered mute is shown, not hidden in Options
  await expect(page.locator('.btnMission.active')).toBeInViewport();
  await expect(page.locator('#txtCamMode')).toHaveText('Spotter Flyby');
  expect(await page.evaluate(() => localStorage.getItem('openaero_best'))).toBe(best);
  // Nothing started the sound before the tap, and with the box clear Fly leaves it off.
  await expect(page.locator('#txtAudioState')).toHaveText('OFF');
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await expect(page.locator('#txtAudioState')).toHaveText('OFF');
  await expect(page.locator('#selScenario')).toHaveValue('kdal_13l_final');

  // Continue is the remembered mission's word only: another pick reads Fly again.
  await page.locator('#btnOpenMissions').click();
  await expect(page.locator('#btnStartFlight')).toHaveText(/Fly/);
  await page.locator('.btnMission[data-scenario="kdfw_takeoff"]').click();
  await expect(page.locator('#btnStartFlight')).toHaveText(/Fly/);
  await page.locator('#btnStartFlight').click();

  // A deep link still wins over the remembered mission, and is not stored until it is flown.
  await page.goto(`${BASE}?mission=kdfw_takeoff`);
  await expect(page.locator('.btnMission.active')).toHaveAttribute('data-scenario', 'kdfw_takeoff');
  await expect(page.locator('#btnStartFlight')).toHaveText(/Fly/);
  expect((await prefs(page)).mission).toBe('kdal_13l_final');
  expect(errors).toEqual([]);
});

test('a stored mission that no longer exists falls back to the default final', async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('openaero_prefs_v1', '{"v":1,"sound":true,"camera":99,"mission":"gone"}'));
  await page.reload();
  await expect(page.locator('.btnMission.active')).toHaveAttribute('data-scenario', 'kdfw_35c_final');
  await expect(page.locator('#btnStartFlight')).toHaveText(/Fly/);
  await expect(page.locator('#txtCamMode')).toHaveText('Cockpit 3D');
});

test('storage that throws on access boots clean and still flies', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
  });
  const errors = collectErrors(page);
  await enterCockpit(page);
  await page.keyboard.press('h'); // no stored view: the clean view hides the buttons
  await page.locator('#btnCamera').click();
  await page.locator('#btnAudio').click();
  await expect(page.locator('#txtCamMode')).toHaveText('Orbit Chase');
  expect(errors).toEqual([]);
});
