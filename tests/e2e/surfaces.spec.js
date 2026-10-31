import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, enterCockpit, FULL_RES } from './helpers.js';

// Ticket 0063: the control surfaces follow the stick in the chase view. At the start of the
// takeoff roll, idle and brakes set, a held stick moves the ailerons but not the airplane, so two paused
// frames differ only where the surfaces are.
test.use(FULL_RES);
test.beforeEach(async ({ page }) => { await stubTiles(page); });
const snap = (page) => page.evaluate(() => window.openaeroDebug());
const part = (s, name) => s.parts.find((p) => p.name === name);
// A DOM click: Playwright's actionability waits cost seconds a frame under SwiftShader.
const pause = (page) => page.evaluate(() => document.getElementById('btnPause').click());

// Holds `key`, lets the surfaces get there, pauses, and returns the canvas as RGBA + the snapshot.
async function frameWith(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(1200);
  await pause(page);
  await page.waitForTimeout(600);
  const s = await snap(page);
  const png = await page.locator('#simCanvas').screenshot();
  await pause(page);
  await page.keyboard.up(key);
  return { s, png: png.toString('base64') };
}

// Pixels (of a 4-px grid) whose colour differs by more than 40 between two frames, split
// into the screen's left and right halves: the chase view has one wing on each side.
function diff(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height);
    };
    const [x, y] = [await load(a), await load(b)];
    const out = { left: 0, right: 0 };
    for (let j = 0; j < x.height; j += 4) for (let i = 0; i < x.width; i += 4) {
      const k = (j * x.width + i) * 4;
      const d = Math.abs(x.data[k] - y.data[k]) + Math.abs(x.data[k + 1] - y.data[k + 1]) + Math.abs(x.data[k + 2] - y.data[k + 2]);
      if (d > 40) out[i < x.width / 2 ? 'left' : 'right']++;
    }
    return out;
  }, [a, b]);
}

test('full left vs full right stick moves the Cessna\'s ailerons in the chase view', async ({ page }, info) => {
  test.setTimeout(120_000); // six full-resolution software-GL frames
  const errors = collectErrors(page);
  await enterCockpit(page);
  await page.selectOption('#selScenario', 'kdfw_takeoff');
  await page.locator('#selAircraft').selectOption('c172');
  await page.locator('#btnCamera').click(); // Orbit Chase
  await page.keyboard.press('KeyB'); // brakes: the idling Cessna must not creep between frames
  await expect.poll(async () => (await snap(page)).brakesOn).toBe(true);
  await expect.poll(async () => (await snap(page)).parts.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(6);
  const names = (await snap(page)).parts.map((p) => p.name).sort();
  expect(names).toEqual(['ctl_aileron_L', 'ctl_aileron_R', 'ctl_elevator', 'ctl_flap_L', 'ctl_flap_R', 'ctl_rudder']);

  const left = await frameWith(page, 'KeyA');
  const right = await frameWith(page, 'KeyD');
  const right2 = await frameWith(page, 'KeyD');
  // Full left: left aileron up 20°, right down 15° (TCDS 3A12); and the other way round.
  expect(left.s.aileronInput).toBeLessThan(-0.95);
  expect(part(left.s, 'ctl_aileron_L').deg).toBeCloseTo(20 * Math.abs(left.s.aileronInput), 0);
  expect(part(left.s, 'ctl_aileron_R').deg).toBeCloseTo(15 * Math.abs(left.s.aileronInput), 0);
  expect(part(right.s, 'ctl_aileron_R').deg).toBeCloseTo(20 * right.s.aileronInput, 0);
  expect(right.s.onGround).toBe(true);
  expect(right2.s.gsKts).toBeLessThan(1);

  const moved = await diff(page, left.png, right.png);
  const still = await diff(page, right.png, right2.png); // the same stick twice: the noise floor
  info.annotations.push({ type: 'pixels', description: JSON.stringify({ moved, still }) });
  // The wings change clearly more than the same stick held twice does (the noise: the prop,
  // the airplane settling on its struts). Measured: moved 105-111 sampled pixels, still 0-13;
  // 2026-10-31 at 1280x720: moved 245-280, still 4-45 (an AoA badge flickering "-0.0°"/"0.0°"
  // shifted the top bar's line and read ~80 until hudLayout.js fixed1).
  const sum = (d) => d.left + d.right;
  expect(sum(moved)).toBeGreaterThan(3 * sum(still) + 30);
  expect(Math.min(moved.left, moved.right)).toBeGreaterThan(5); // both wings, not one
  expect(errors).toEqual([]);
});
