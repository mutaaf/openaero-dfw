import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, enterCockpit } from './helpers.js';

// iOS's silent switch (0169): with navigator.audioSession present (Safari 16.4+), starting a flight
// with sound sets it to 'playback', so the ringer switch no longer mutes the game; sound off sets
// 'auto', pause 'ambient'. Chromium has no audioSession: the stub stands in for Safari's. A real
// iPhone with its switch on silent can't run in CI.
const FAKE_AUDIO_SESSION = () => {
  window.__ses = [];
  let t = 'auto';
  Object.defineProperty(navigator, 'audioSession', {
    configurable: true,
    value: { get type() { return t; }, set type(v) { t = v; window.__ses.push(v); } },
  });
};
const type = (page) => page.evaluate(() => navigator.audioSession.type);
const click = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);

test('Start flight with sound plays through the silent switch; sound off and pause let it go', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(FAKE_AUDIO_SESSION);
  await stubTiles(page);
  await enterCockpit(page);
  await expect.poll(() => type(page)).toBe('playback');
  await click(page, 'btnAudio'); // sound OFF
  await expect.poll(() => type(page)).toBe('auto');
  await click(page, 'btnAudio'); // sound ON
  await expect.poll(() => type(page)).toBe('playback');
  await click(page, 'btnPause');
  await expect.poll(() => type(page)).toBe('ambient');
  await click(page, 'btnPause'); // RESUME
  await expect.poll(() => type(page)).toBe('playback');
  // Written only on a change, not every frame.
  expect(await page.evaluate(() => window.__ses)).toEqual(['playback', 'auto', 'playback', 'ambient', 'playback']);
  expect(errors).toEqual([]);
});

test('without navigator.audioSession (Chromium) the flight starts with sound and no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await stubTiles(page);
  await enterCockpit(page);
  await expect.poll(() => page.evaluate(() => window.openaeroDebug().audio)).toBe('running');
  expect(await page.evaluate(() => 'audioSession' in navigator)).toBe(false);
  expect(errors).toEqual([]);
});
