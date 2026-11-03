import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors, enterCockpit } from './helpers.js';
import { recordCaptions } from './captionHelpers.js';
import { headingBoxTop, HEADING_BOX_H } from '../../src/hudLayout.js';

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

// Ticket 0137: the whole stack at once on a phone held upright, at the stabilized gate of a fast
// final: the GPWS box, a three-call caption, the gate's verdict and the coach. None sits on another,
// on the horizon (the pitch ladder's zero line, ± 12 px), on a tape or on a touch control. The gate's
// verdict is found in the HUD canvas's pixels (its box's fill down the left edge), so the spec reads
// where it was drawn. Paused at the gate, so the verdict and the box hold while the screen resizes.
test('caption, GPWS box, gate verdict and coach never stack over the horizon (0137)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}?debug`);
  const start = page.locator('#btnStartFlight');
  await start.scrollIntoViewIfNeeded();
  await start.tap();
  await expect(page.locator('#onboardingModal')).toBeHidden();
  await recordCaptions(page);
  await page.evaluate(() => window.openaeroDebugFinal('KDFW', '35C', 1.9, 30)); // 30 kt fast: unstabilized
  await expect.poll(() => page.evaluate(() => !!window.openaeroDebug().stabilizedGate), { timeout: 60_000 }).toBe(true);
  await page.locator('#btnMenu').tap();
  await page.locator('#btnPause').tap();
  await page.locator('#btnMenu').tap();
  await expect(page.locator('#hudMenu')).not.toHaveClass(/open/);
  const calls = ['unstabilized, go around', 'five hundred', 'sink rate'];
  for (const [w, h] of [[390, 844], [375, 548], [360, 640]]) {
    await page.setViewportSize({ width: w, height: h });
    await expect.poll(async () => page.evaluate(() => innerHeight)).toBe(h);
    await page.waitForTimeout(150); // a frame or two: the HUD redrawn at this size, placeCoach run
    const s = await page.evaluate((calls) => {
      const rect = (el) => {
        if (!el || el.classList.contains('hidden') || getComputedStyle(el).visibility === 'hidden') return null;
        const r = el.getBoundingClientRect();
        return { l: r.left, t: r.top, r: r.right, b: r.bottom };
      };
      // The GPWS box (paused: it stays) with its longest words, then PULL UP (main.js's other texts).
      const banner = document.getElementById('masterAlertBanner');
      banner.classList.remove('hidden');
      banner.textContent = 'WINDSHEAR — MAX THRUST, PITCH 15°';
      const longest = rect(banner);
      banner.textContent = 'PULL UP — TERRAIN AHEAD';
      calls.forEach((c, i) => window.openaeroDebugCaption(c, i > 0));
      // The gate's box: rgba(15, 23, 42, 0.75) down the column just inside its left edge.
      const cv = document.getElementById('hudCanvas');
      const k = cv.width / innerWidth;
      const x = Math.round((innerWidth / 2 - 116) * k);
      const px = cv.getContext('2d').getImageData(x, 0, 1, cv.height).data;
      let top = -1, bot = -1;
      for (let y = 0; y < cv.height; y++) {
        const i = y * 4, fill = Math.abs(px[i] - 15) < 3 && Math.abs(px[i + 1] - 23) < 3 && Math.abs(px[i + 2] - 42) < 3 && Math.abs(px[i + 3] - 191) < 4;
        if (fill) { if (top < 0) top = y; bot = y + 1; }
      }
      const deck = [...document.querySelectorAll('#touchDeck button, #touchDeck .touch-control')]
        .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(rect).filter(Boolean);
      const d = window.openaeroDebug();
      return { w: innerWidth, h: innerHeight, pitch: d.pitchDeg, roll: d.bankRightDeg, deck,
        gate: top < 0 ? null : { l: innerWidth / 2 - 120, r: innerWidth / 2 + 120, t: top / k, b: bot / k },
        caption: rect(document.getElementById('calloutCaption')), text: document.getElementById('calloutCaption').textContent,
        master: rect(banner), longest, coach: rect(document.getElementById('coach')) };
    }, calls);
    const label = `${w}x${h}`;
    const cx = w / 2, cy = h / 2;
    const meets = (a, b) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    expect(s.gate, `${label}: the gate's verdict is drawn`).not.toBeNull();
    expect(s.caption, `${label}: caption shown`).not.toBeNull();
    expect(s.master, `${label}: GPWS box shown`).not.toBeNull();
    // Newest call wins, two lines at most (13 px words on a 16 px line + padding).
    expect(s.text, label).toBe('five hundred · sink rate');
    expect(s.caption.b - s.caption.t, `${label}: caption two lines at most`).toBeLessThanOrEqual(40);
    // The horizon: the zero rung (cx ± 35, main.js pitch ladder: 7 px a degree, turned by the bank), ± 12 px.
    const dy = s.pitch * 7, a = (s.roll * Math.PI) / 180;
    const ys = [-35, 35].map((x) => cy + x * Math.sin(a) + dy * Math.cos(a));
    const horizon = { l: cx - 47, r: cx + 47, t: Math.min(...ys) - 12, b: Math.max(...ys) + 12 };
    const keepOut = {
      horizon,
      'speed tape': { l: cx - 191, r: cx - 131, t: cy - 90, b: cy + 90 },
      'altitude tape': { l: cx + 130, r: cx + 194, t: cy - 90, b: cy + 90 },
      'heading box': { l: cx - 40, r: cx + 40, t: headingBoxTop(cy), b: headingBoxTop(cy) + HEADING_BOX_H },
    };
    // One line for either text: as tall as PULL UP, and clear of the heading box.
    expect(s.longest.b - s.longest.t, `${label}: the windshear box is one line`).toBeLessThanOrEqual(s.master.b - s.master.t);
    expect(meets(s.longest, keepOut['heading box']), `${label}: the windshear box on the heading box`).toBe(false);
    // A short phone puts the coach under the top bar, where an alert hides it for its seconds (0130):
    // then it is not on screen to collide with anything.
    const shown = { caption: s.caption, 'GPWS box': s.master, 'gate verdict': s.gate, coach: s.coach };
    const names = Object.keys(shown);
    for (const n of names) {
      if (!shown[n]) continue;
      for (const [k, box] of Object.entries(keepOut)) expect(meets(shown[n], box), `${label}: ${n} on the ${k}`).toBe(false);
      for (const d of s.deck) expect(meets(shown[n], d), `${label}: ${n} on a touch control`).toBe(false);
      for (const m of names) if (m > n) expect(meets(shown[n], shown[m]), `${label}: ${n} on the ${m}`).toBe(false);
      expect(shown[n].t, `${label}: ${n} on screen`).toBeGreaterThanOrEqual(0);
    }
    if (h >= 800) expect(s.coach, `${label}: a tall phone keeps the coach in view`).not.toBeNull();
    await page.screenshot({ path: test.info().outputPath(`stack-${label}.png`) });
  }
  // Every call reached the caption line, and so its record (0117): nothing lost to the cap.
  const seen = (await page.evaluate(() => window.__captions)).map((c) => c.text).join(' | ');
  for (const c of calls) expect(seen).toContain(c);
  expect(errors).toEqual([]);
});
