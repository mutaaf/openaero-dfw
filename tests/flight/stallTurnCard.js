// The accelerated-stall card (ticket 0159), shared by the 737 and F-16 cards. FAA-H-8083-3C ch. 5
// "Load Factor and Stalling Speed" (and FAA-H-8083-25B ch. 5, "Load Factors and Stalling Speeds"):
// the stall speed rises with the square root of the load factor, and a level, coordinated turn
// at bank φ pulls 1/cos φ g, so the break comes at the 1-g break × √(1/cos φ): +19% at 45°, +41%
// at 60°. Flown by harness.js stallInTurn (the C172's 0067 card): a level turn bled at ~1 kt/s on
// the throttle until the wing passes `breakAoa`, and the same pilot wings level for the 1-g break.
// Checked three ways, after checking it flew the turn (bank, ball, level, bleed, load factor):
//  1. the ticket's book number: the 1-g break × √(1/cos φ), ±8%;
//  2. the √n law, tighter: the 1-g break × √(n / n₁g) with the load factors actually flown, ±3%
//     (a lift that scaled like n^0.4 would break ~7% low at 60°);
//  3. the wing's own lift line: the speed at which the spec's straight CL line at `breakAoa`
//     (cl0 + clAlpha·α + flaps, what the speed tape's red band reads, aero.js stallSpeedKts)
//     carries the load the wing holds (harness nWing: the load less the thrust's lift), ±3%.
//     The first two are ratios of the same flight model, so a lift model 10% low everywhere
//     passes them; this one fails it (the PR shows the mutation).
// `breakAoa` is the stall angle where the wing can reach it. Every speed is IAS (EAS here).
import { expect } from 'vitest';
import { DEG_TO_RAD, GRAVITY, RHO_SEA_LEVEL } from '../../src/constants.js';
import { flapDeltaCl } from '../../src/aero.js';
import { stallInTurn } from './harness.js';

const within = (measured, ref, tol) => expect(Math.abs(measured - ref) / ref).toBeLessThanOrEqual(tol);

// The 1-g speed (kt EAS) at which the spec's straight lift line at `aoaDeg` carries the weight.
export const lineSpeedKts = (spec, flaps, aoaDeg) => Math.sqrt((2 * spec.massKg * GRAVITY)
  / (RHO_SEA_LEVEL * spec.wingAreaM2 * (spec.cl0 + spec.clAlpha * aoaDeg * DEG_TO_RAD + flapDeltaCl(spec, flaps)))) / 0.514444;

const levelBreaks = new Map();

// Starts the bleed 15 kt + 15% above the line speed at the turn's load factor, so the 15 s
// settling hold is well clear of the break.
export function checkStallInTurn(tag, spec, bank, breakAoa, { flaps = 0, altM }) {
  const from = (n) => Math.ceil(lineSpeedKts(spec, flaps, breakAoa) * Math.sqrt(n) * 1.15 + 15);
  const key = `${tag}|${flaps}|${breakAoa}|${altM}`;
  if (!levelBreaks.has(key)) levelBreaks.set(key, stallInTurn(spec, 0, breakAoa, { fromKts: from(1), flaps, altM }));
  const r0 = levelBreaks.get(key);
  const nBook = 1 / Math.cos(bank * DEG_TO_RAD);
  const r = stallInTurn(spec, bank, breakAoa, { fromKts: from(nBook), flaps, altM });
  const book = r0.kts * Math.sqrt(nBook);
  const sqrtLaw = r0.kts * Math.sqrt(r.n / r0.n);
  const line = lineSpeedKts(spec, flaps, breakAoa) * Math.sqrt(r.nWing);
  const pct = (v) => `${((r.kts / v - 1) * 100).toFixed(1)}%`;
  console.log(`[${tag}] ${bank}° turn: break ${r.kts.toFixed(1)} KEAS at α ${breakAoa}° (1 g: ${r0.kts.toFixed(1)}); `
    + `book √(1/cos) ${book.toFixed(1)} (${pct(book)}), √n law ${sqrtLaw.toFixed(1)} (${pct(sqrtLaw)}), lift line ${line.toFixed(1)} (${pct(line)}); `
    + `${r.n.toFixed(3)} g (wing ${r.nWing.toFixed(3)}), bank ${r.bankDeg.toFixed(1)}°, β ${r.betaDeg.toFixed(2)}°, alt ${r.altErrM.toFixed(1)} m, bleed ${r.bleedKtsS.toFixed(2)} kt/s`);
  // It flew the turn: the bank asked for, coordinated, level, bleeding about 1 kt/s, and both
  // runs reached the break. The load is the body bank's 1/cos within 5%: at high α the wind-axis
  // bank is a little under the body's (a 60° body bank at α 20° is ~58.5°, 1.91 g).
  expect(r0.kts).not.toBeNull();
  expect(r.kts).not.toBeNull();
  expect(Math.abs(r.bankDeg - bank)).toBeLessThan(2);
  expect(Math.abs(r.betaDeg)).toBeLessThan(1);
  within(r.n, nBook, 0.05);
  expect(Math.abs(r.altErrM)).toBeLessThan(30);
  expect(r.bleedKtsS).toBeGreaterThan(0.5);
  expect(r.bleedKtsS).toBeLessThan(1.5);
  within(r.kts, book, 0.08);
  within(r.kts, sqrtLaw, 0.03);
  within(r.kts, line, 0.03);
  // The 1-g break holds the same check (so a wings-level error cannot hide in both ratios).
  within(r0.kts, lineSpeedKts(spec, flaps, breakAoa) * Math.sqrt(r0.nWing), 0.03);
  return r;
}
