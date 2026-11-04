// The level-turn card (ticket 0152), shared by the 737 and F-16 cards: flies harness.js levelTurn
// and checks it against FAA-H-8083-25B ch. 5 (rate = 1091·tan(bank)/V[kt TAS] °/s, load factor
// 1/cos(bank)) after checking it flew the handbook's turn. Returns the run.
// What it checks: in a level turn with the ball centred the formula is Newton's whatever the lift
// and drag, so the rate pins the integrator, the frames, the bank's sign and the true airspeed the
// game reports (flightModel.js's tasKts 10% high fails every card); the HUD's G (body.loadFactor,
// 0121) is checked as well as the seat's (its gravity term 10% off fails six of seven). The ball is
// centred against the harness's g, so a wrong gravity in the model is flown out as a slip: these
// cards do not catch that (measured: gravity 15% strong still passes).
import { expect } from 'vitest';
import { DEG_TO_RAD } from '../../src/constants.js';
import { levelTurn } from './harness.js';

const within = (measured, ref, tol) => expect(Math.abs(measured - ref) / ref).toBeLessThanOrEqual(tol);

export function checkLevelTurn(tag, spec, bank, kts, opts) {
  const r = levelTurn(spec, bank, kts, opts);
  const book = (1091 * Math.abs(r.tanBank)) / r.tasKts;
  const nBook = 1 / Math.cos(r.bankDeg * DEG_TO_RAD);
  console.log(`[${tag}] ${bank}° at ${kts} KIAS: ${Math.abs(r.rateDegS).toFixed(2)}°/s vs ${book.toFixed(2)}°/s `
    + `(${((Math.abs(r.rateDegS) / book - 1) * 100).toFixed(1)}%), seat ${r.loadG.toFixed(3)} g, HUD ${r.hudG.toFixed(3)} g vs ${nBook.toFixed(3)}, `
    + `TAS ${r.tasKts.toFixed(0)} kt, ball ${r.ballG.toFixed(4)} g, alt ${r.minAltErrM.toFixed(0)}/${r.maxAltErrM.toFixed(0)} m, α ${r.maxAoaDeg.toFixed(1)}°`);
  // It flew the handbook's turn: the bank asked for, coordinated, level, at the speed.
  expect(Math.abs(r.bankDeg - bank)).toBeLessThan(1);
  expect(Math.abs(r.ballG)).toBeLessThan(0.01);
  expect(Math.max(-r.minAltErrM, r.maxAltErrM)).toBeLessThan(60);
  expect(Math.abs(r.body.iasKts - kts)).toBeLessThan(5);
  within(Math.abs(r.rateDegS), book, 0.08);
  within(r.loadG, nBook, 0.03);
  within(r.hudG, nBook, 0.03); // the G the player reads (0121)
  return r;
}
