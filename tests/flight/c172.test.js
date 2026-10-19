// Flight test cards: the Cessna 172S flown headless (harness.js) against the Pilot's
// Operating Handbook (Cessna 172S POH, Section 5, 2550 lb, sea level ISA unless noted;
// Fig. 5-3 stall speeds, 5-5 short field takeoff, 5-6 maximum rate of climb, 3-1 maximum
// glide). The model has no instrument error, so stall speeds compare with KCAS.
//
// A card the model does not yet meet is a KNOWN GAP: `it.fails` keeps the gate green
// while the gap exists and turns it red the day the model is fixed, so the fixing PR
// must promote the card to `it` (and the gap can never silently come back).
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT } from '../../src/constants.js';
import { stallAoaDeg } from '../../src/aero.js';
import { makeBody, fly, speedHoldPilot, settle, vsFpm, shortFieldTakeoff } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const within = (measured, ref, tol) => expect(Math.abs(measured - ref) / ref).toBeLessThanOrEqual(tol);

// 1 kt/s deceleration at idle, wings level, until the wing passes its stall angle.
function stallKts(flaps) {
  const b = makeBody(c172, { kts: 70, altM: 1500, flaps });
  let kts = null;
  fly(b, c172, 60, speedHoldPilot((x) => Math.max(20, 70 - x.t)), (x) => {
    if (x.aoaDeg > stallAoaDeg(c172, flaps)) { kts = x.iasKts; return true; }
    return false;
  });
  return kts;
}

const rocFpm = (altM) => settle(makeBody(c172, { kts: 74, altM, throttle: 1 }), c172, 10, speedHoldPilot(() => 74), vsFpm, 60);

describe('Cessna 172S vs POH', () => {
  it('stalls clean near 53 KCAS (POH: 48 KIAS / 53 KCAS, ±10%)', () => {
    within(stallKts(0), 53, 0.10);
  });

  it('stalls with flaps 10 near 50 KCAS (POH: 42 KIAS / 50 KCAS, ±10%)', () => {
    within(stallKts(1), 50, 0.10);
  });

  it('stalls with full flaps near 48 KCAS (POH: 40 KIAS / 48 KCAS, ±10%)', () => {
    within(stallKts(3), 48, 0.10);
  });

  // POH short-field technique: flaps 10, full power, rotate nose-high, lift off at 51 KIAS.
  it('short-field ground roll near 960 ft, lift-off near 51 kt (POH, ±15%)', () => {
    const { rollFt, liftoffKts } = shortFieldTakeoff(c172, 0);
    within(rollFt, 960, 0.15);
    within(liftoffKts, 51, 0.08);
  });

  it('brakes stop the aircraft from 58 kt in about 100 m (μ 0.45 ≈ 0.43 g)', () => {
    const b = makeBody(c172);
    b.vel.set(0, 0, -30);
    b.brakesOn = true;
    fly(b, c172, 30, null, (x) => -x.vel.z < 0.5);
    within(b.distM, 30 * 30 / (2 * 0.45 * 9.80665), 0.25);
  });

  // POH Fig. 5-5 at sea level: 960 ft at 15 °C (interpolated), 1150 ft at 40 °C (+20%).
  it('a hot day lengthens the ground roll like the POH table (ISA +25 °C: +20%, ±8%)', () => {
    within(shortFieldTakeoff(c172, 25).rollFt / shortFieldTakeoff(c172, 0).rollFt, 1.198, 0.08);
  });

  // POH Fig. 5-6: 785 fpm at 0 °C, 710 at 20 °C → 729 fpm at 15 °C.
  it('climbs about 729 fpm at Vy 74 KIAS, full throttle, sea level (POH, ±10%)', () => {
    within(rocFpm(1), 729, 0.10);
  });

  // Thinner air for the wing (0038) and less power from the engine (0039, Gagg-Ferrar).
  // POH Fig. 5-6 at 10,000 ft: 360 fpm at −20 °C, 300 at 0 °C → 315 fpm at ISA (−4.8 °C).
  it('climbs about 315 fpm at 10,000 ft, ISA (POH, ±15%)', () => {
    within(rocFpm(3048), 315, 0.15);
  });

  // Was 4.6:1 with lift in body axes (0037); the idle prop windmills (0039).
  it('glides about 9:1 at 68 KIAS, idle (POH: ~1.5 NM per 1000 ft, ±15%)', () => {
    const g = makeBody(c172, { kts: 68, altM: 1500 });
    const pilot = speedHoldPilot(() => 68);
    fly(g, c172, 60, pilot);
    const h0 = g.pos.y, d0 = g.distM;
    fly(g, c172, 30, pilot);
    within((g.distM - d0) / (h0 - g.pos.y), 9.1, 0.15);
  });
});
