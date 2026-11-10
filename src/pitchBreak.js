// The Cessna's post-stall pitch break (ticket 0109), a lazy chunk main.js loads right after boot
// (tests/flight/harness.js imports it): loading it gives the C172 its spec.pitchBreak, which
// flightModel.js reads in the pitch moment; until then the pitching moment is linear to any angle
// (Roskam's Cmα and Cmδe), as before 0109, and a held full back stick settles near α 40°.
//
// Sources: NASA Langley spin-tunnel rotary-balance reports on 1/6-scale models of typical single-engine
// high-wing general aviation airplanes, static points (Ωb/2V = 0), moments about 0.25c̄ / 0.216c̄, read
// off the plots (±0.01-0.02 in Cm) on 2026-11-10:
// - NASA CR-3097 (Bihrle & Hultberg, 1979), "High-Wing Model B": NACA 2412 wing, aspect ratio 7.37,
//   1.5° root incidence, tail at -3.5° (a Skyhawk's layout). Fig. A3 (δe 0) and Fig. A21 (δe +23°,
//   trailing edge down) give Cm(α) and the nose-down elevator's increment.
// - NASA CR-3201 (Hultberg, Chu & Dickens, 1980), "High-Wing Model C": the only one of the series
//   with an up elevator. Fig. A3 (δe 0) and Fig. A15 (δe -15°) give the nose-up elevator's increment.
// Both models stall near α 14-15° (CR-3097 Fig. A139), as our C172 does (14.8°), so the tables are
// in the reports' own α. Re 1.2-1.6 x 10^5: the tunnel's, far under the airplane's; the shapes, not
// the absolute values, are what we take.
//
// What they show: (1) past the stall the elevator loses most of its power. Up 15° on model C is
// worth ΔCm 0.49 at α 8°, 0.24 at 18°, 0.12 at 25-35°, 0.04-0.06 at 40-50°; down 23° on model B
// keeps ~1.0 to α 16°, then 0.74 at 18°, ~0.6 at 30° and ~0.5 at 40-50° (TN D-6573's T-tail jet,
// another airplane, says the same: about a fourth past α 24°). (2) Model B's Cm breaks nose down at
// the stall: against its own pre-stall slope (-0.0208/°, α 8-14°) it is 0.12 more nose-down at 16°,
// 0.20 at 18°, then flattens and is less nose-down than the line from ~28° on.
// The up-elevator ratio is model C's applied to the C172 (model B has no up-elevator run): that
// is the assumption here. The break is model B's, in degrees of α at its own slope, so it scales
// with our Cmα (the same moment as so many degrees of α more). Spins, sideslip and the rotary
// terms are out of scope (the rotary data are why the reports exist).
// Static only: no stall hysteresis or unsteady Cm, so a held full back stick settles steadily (idle:
// α ~17°, nose ~10° up, ~54 KIAS, ~700 fpm down; power on it climbs at α 17° with the warning on)
// where a real 172 bobs and buffets. Until this chunk loads (or if it fails: console.warn) the
// pitch is the old linear one; no flight starts before the Start flight tap (fbw.js's pattern).
import { AIRCRAFT_DATABASE } from './aircraft.js';

const ALPHA = [8, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40, 45, 50];
// Nose-up elevator, model C (CR-3201 Figs. A15 vs A3): ΔCm(α) / ΔCm(8°).
const ETA_UP = [1, 0.96, 0.88, 0.76, 0.65, 0.49, 0.37, 0.24, 0.23, 0.24, 0.11, 0.07, 0.12];
// Nose-down elevator, model B (CR-3097 Figs. A21 vs A3): ΔCm(α) / ΔCm(8°), capped at 1.
const ETA_DOWN = [1, 1, 1, 1, 1, 0.74, 0.71, 0.65, 0.62, 0.56, 0.47, 0.5, 0.5];
// Model B's Cm at δe 0 less its pre-stall line, over that line's slope: the extra nose-down moment as
// degrees of α (+ = nose down). 0 up to the stall.
const BREAK_DEG = [0, 0, 0, 0, 5.7, 9.7, 8.2, 3.7, -1.8, -3.9, -4.6, -6.7, -7.4];

// Linear interpolation in the table, held at its ends.
export function lookup(table, aoaDeg) {
  if (!(aoaDeg > ALPHA[0])) return table[0]; // NaN too: the pre-stall end
  for (let i = 1; i < ALPHA.length; i++) {
    if (aoaDeg <= ALPHA[i]) {
      const f = (aoaDeg - ALPHA[i - 1]) / (ALPHA[i] - ALPHA[i - 1]);
      return table[i - 1] + (table[i] - table[i - 1]) * f;
    }
  }
  return table[table.length - 1];
}

// The elevator's share of its pre-stall power at this α: elev < 0 is back stick (nose up).
export const elevatorEta = (aoaDeg, elev) => lookup(elev < 0 ? ETA_UP : ETA_DOWN, aoaDeg);
// The pitch break as extra degrees of α in the restoring moment (+ = nose down).
export const breakDeg = (aoaDeg) => lookup(BREAK_DEG, aoaDeg);

AIRCRAFT_DATABASE.c172.pitchBreak = { eta: elevatorEta, breakDeg };
