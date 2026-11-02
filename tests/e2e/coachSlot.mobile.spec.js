import { test, expect } from './fixtures.js';
import { stubTiles, collectErrors, enterCockpit } from './helpers.js';

// Ticket 0130: the coach card never sits on the speed or altitude tape (cy ± 90 px), the SPD target
// label under the speed tape (baseline cy + 106), the stabilized-gate verdict (to cy + 132) or the ground from the horizon down 12% of the
// height (the runway and the PAPI on a final). Its slot over the touch deck clears them on a tall
// phone; on a short one held upright (Safari with its bars, 390x664; an iPhone SE, 375x548) it goes
// up under the top bar. Skip stays a 44 px target with nothing over it. One flight, resized, so the
// spec costs one boot on CI.
const SIZES = [[390, 664], [375, 548], [390, 844], [820, 1180], [1180, 820], [844, 390]];

async function boxes(page) {
  return page.evaluate(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const skip = document.getElementById('btnCoachSkip');
    const s = skip.getBoundingClientRect();
    const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
    const deck = [...document.querySelectorAll('#touchDeck button, #touchDeck .touch-control')]
      .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(rect);
    return { coach: rect(document.getElementById('coach')), skip: rect(skip), skipHit: skip.contains(hit), deck, w: innerWidth, h: innerHeight };
  });
}

function expectClear({ coach, skip, skipHit, deck, w, h }, label) {
  const cx = w / 2, cy = h / 2;
  const meets = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  const keepOut = {
    // As drawn (main.js drawTape): the speed strip x - 60 … x at cx - 131, the altitude readout to cx + 194.
    'speed tape': { l: cx - 191, r: cx - 131, t: cy - 90, b: cy + 90 },
    'altitude tape': { l: cx + 130, r: cx + 194, t: cy - 90, b: cy + 90 },
    'gate verdict': { l: cx - 120, r: cx + 120, t: cy + 76, b: cy + 132 },
    'SPD label': { l: cx - 131 - 60, r: cx - 131, t: cy + 106 - 10, b: cy + 106 + 3 },
    'horizon band': { l: 0, r: w, t: cy, b: cy + 0.12 * h },
  };
  for (const [name, box] of Object.entries(keepOut)) expect(meets(coach, box), `${label}: coach on the ${name}`).toBe(false);
  for (const d of deck) expect(meets(coach, d), `${label}: coach on a touch control`).toBe(false);
  expect(skip.w, `${label}: Skip width`).toBeGreaterThanOrEqual(44);
  expect(skip.h, `${label}: Skip height`).toBeGreaterThanOrEqual(44);
  expect(skipHit, `${label}: Skip under something`).toBe(true);
  expect(coach.t, `${label}: on screen`).toBeGreaterThanOrEqual(0);
}

test.beforeEach(async ({ page }) => { await stubTiles(page); });

test('the coach card clears the tapes, the SPD label and the runway at every size (0130)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 664 });
  await enterCockpit(page);
  await expect(page.locator('#coach')).toBeVisible({ timeout: 5_000 });
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await expect.poll(async () => (await boxes(page)).h).toBe(h);
    await page.waitForTimeout(100); // the resize handler has run (placeCoach)
    expectClear(await boxes(page), `${w}x${h}`);
  }
  // The short screen held upright is the one that moved: under the top bar, above the heading box.
  await page.setViewportSize({ width: 390, height: 664 });
  await expect(page.locator('#coach')).toHaveClass(/coach-top/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#coach')).not.toHaveClass(/coach-top/);

  // Kid's big words wrapped over three lines grow the card up into the band: it moves too.
  await page.evaluate(() => {
    document.body.classList.add('assist-kid');
    document.getElementById('txtCoach').textContent = 'Line up the runway, keep two white and two red lights on the PAPI and hold the speed';
    window.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('#coach')).toHaveClass(/coach-top/);
  expectClear(await boxes(page), '390x844 Kid');

  // The autopilot tutor's card (Your turn + Hide) with Kid's longest tip on the short phones: up
  // there the words run on under the buttons and stay above the heading box (cy - 145).
  // Learner's three-line tip too (its words are already the small size).
  const TIPS = [[true, 'On the glidepath: two white, two red on the PAPI lights by the runway'],
    [false, 'Turning to line up with the runway: watch the stick lean and the wings bank']];
  for (const [w, h] of [[390, 664], [375, 548]]) for (const [kid, tip] of TIPS) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(([kid, tip]) => {
      document.body.classList.toggle('assist-kid', kid);
      document.getElementById('btnTakeover').classList.remove('hidden');
      document.getElementById('coach').classList.add('coach-ap');
      document.getElementById('txtCoachLabel').textContent = 'Autopilot';
      document.getElementById('txtCoach').textContent = tip;
      window.dispatchEvent(new Event('resize'));
    }, [kid, tip]);
    await expect(page.locator('#coach')).toHaveClass(/coach-top/);
    const b = await boxes(page);
    expectClear(b, `${w}x${h} ${kid ? 'Kid' : 'Learner'} tutor`);
    expect(b.coach.b, `${w}x${h} ${kid ? 'Kid' : 'Learner'} tutor: above the heading box`).toBeLessThanOrEqual(Math.max(h / 2 - 145, 72));
    const take = await page.locator('#btnTakeover').boundingBox();
    expect(take.width >= 44 && take.height >= 44, `${w}x${h}: Your turn 44 px`).toBe(true);
    // The buttons don't sit on each other or on the words.
    const hits = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const t = r('btnTakeover'), s = r('btnCoachSkip');
      const range = document.createRange(); range.selectNodeContents(document.getElementById('txtCoach'));
      const lines = [...range.getClientRects()];
      const meet = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return { buttons: meet(t, s), words: lines.some((l) => meet(l, t) || meet(l, s)) };
    });
    expect(hits, `${w}x${h} ${kid ? 'Kid' : 'Learner'} tutor`).toEqual({ buttons: false, words: false });
  }
  expect(errors).toEqual([]);
});
