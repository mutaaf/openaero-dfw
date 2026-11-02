import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0125: iOS Safari held sideways leaves a page ~340 px tall (an iPhone SE 320). A fully
// loaded results card (the crosswind card's six factors, the reason, the next-time tip, the gate
// line and the best line) must keep FLY AGAIN and KEEP ROLLING in view: the button row sits
// outside the card's scrolling middle, and the factor list scrolls if it must.
const FACTORS = [
  ['Touchdown rate', '310 fpm', 72], ['Centreline', '4.1 m left', 64], ['Touchdown zone', '420 m in', 90],
  ['Flare', 'held 3.2 s', 81], ['Speed', '+6 kt', 77], ['Crosswind', '12 kt, de-crabbed 3°', 58],
];

async function fillCard(page) {
  await page.evaluate((factors) => {
    const byId = (id) => document.getElementById(id);
    const show = (id, text) => { const el = byId(id); if (text != null) el.textContent = text; el.classList.remove('hidden'); };
    byId('txtBest').textContent = 'Learner level · ★ New personal best (was 61)';
    show('txtGradeReason', 'Landed 4 m left of the centreline in a 12 kt crosswind');
    show('tipRow');
    byId('txtTip').textContent = 'Into the wind: hold the upwind wing a little low and keep the nose straight with the rudder.';
    show('txtStabilized', 'Unstabilized at 500 ft ✗ speed, sink rate');
    show('touchdownStrip');
    const list = byId('resultsFactors');
    list.innerHTML = '';
    for (const [label, value, score] of factors) {
      const li = document.createElement('li');
      li.className = 'flex flex-col gap-0.5';
      li.innerHTML = `<div class="flex justify-between"><span class="text-slate-400">${label}</span><span>${value}</span></div>`
        + `<div class="h-1.5 rounded bg-slate-800 overflow-hidden"><div class="h-full bg-amber-400" style="width:${score}%"></div></div>`;
      list.appendChild(li);
    }
    show('resultsCard');
  }, FACTORS);
}

async function expectButtonsInView(page, w, h) {
  const card = await page.locator('#resultsCard').boundingBox();
  expect(card.y, `${w}x${h} card top`).toBeGreaterThanOrEqual(0);
  expect(card.y + card.height, `${w}x${h} card bottom`).toBeLessThanOrEqual(h);
  for (const id of ['#btnFlyAgain', '#btnKeepRolling']) {
    const b = await page.locator(id).boundingBox();
    expect(b.height, `${w}x${h} ${id} height`).toBeGreaterThanOrEqual(44);
    expect(b.y, `${w}x${h} ${id} top`).toBeGreaterThanOrEqual(card.y);
    expect(b.y + b.height, `${w}x${h} ${id} bottom in the card`).toBeLessThanOrEqual(card.y + card.height);
    expect(b.y + b.height, `${w}x${h} ${id} bottom on screen`).toBeLessThanOrEqual(h);
    expect(b.x, `${w}x${h} ${id} left`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `${w}x${h} ${id} right`).toBeLessThanOrEqual(w);
    // Nothing of the card's own sits over the button (a scrolled-under button fails here too).
    const hit = await page.evaluate(([sel, x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el && (el === document.querySelector(sel) || document.querySelector(sel).contains(el));
    }, [id, b.x + b.width / 2, b.y + b.height / 2]);
    expect(hit, `${w}x${h} ${id} is the element at its centre`).toBe(true);
  }
}

test('results card: FLY AGAIN and KEEP ROLLING stay in view on a short phone held sideways (0125)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await stubTiles(page);
  await page.goto(BASE);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').tap();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await fillCard(page);
  for (const [w, h] of [[844, 340], [667, 325], [568, 320]]) {
    await page.setViewportSize({ width: w, height: h });
    await expectButtonsInView(page, w, h);
    // The middle scrolls instead: the last factor can be reached.
    await page.locator('#resultsFactors li').last().scrollIntoViewIfNeeded();
    await expect(page.locator('#resultsFactors li').last()).toBeInViewport({ ratio: 1 });
    await expectButtonsInView(page, w, h);
    await page.screenshot({ path: test.info().outputPath(`results-${w}x${h}.png`) });
  }
  // Upright and on a laptop the full card shows without any scroll at all.
  for (const [w, h] of [[390, 844], [1280, 720]]) {
    await page.setViewportSize({ width: w, height: h });
    await expectButtonsInView(page, w, h);
    expect(await page.locator('#resultsBody').evaluate((el) => el.scrollHeight - el.clientHeight), `${w}x${h} no scroll`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath(`results-${w}x${h}.png`) });
  }
  expect(errors).toEqual([]);
});
