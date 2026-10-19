// Flight test cards: the Cessna 172S flown headless (harness.js) against the Pilot's
// Operating Handbook (Cessna 172S POH, 2550 lb max weight, sea level ISA unless noted;
// the model has no instrument error, so stall speeds compare with KCAS, not KIAS).
//
// A card the model does not yet meet is a KNOWN GAP: `it.fails` keeps the gate green
// while the gap exists and turns it red the day the model is fixed, so the fixing PR
// must promote the card to `it` (and the gap can never silently come back).
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT } from '../../src/constants.js';
import { makeBody, fly, speedHoldPilot, settle, vsFpm } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const within = (measured, ref, tol) => expect(Math.abs(measured - ref) / ref).toBeLessThanOrEqual(tol);

// 1 kt/s deceleration at idle, wings level, until the wing passes its stall angle.
function stallKts(flaps) {
  const b = makeBody(c172, { kts: 70, altM: 1500, flaps });
  let kts = null;
  fly(b, c172, 60, speedHoldPilot((x) => Math.max(20, 70 - x.t)), (x) => {
    if (x.aoaDeg > c172.alphaStallDeg) { kts = x.iasKts; return true; }
    return false;
  });
  return kts;
}

const rocFpm = (altM) => settle(makeBody(c172, { kts: 74, altM, throttle: 1 }), c172, 10, speedHoldPilot(() => 74), vsFpm);

describe('Cessna 172S vs POH', () => {
  it('stalls clean near 53 KCAS (POH: 48 KIAS / 53 KCAS, ±10%)', () => {
    within(stallKts(0), 53, 0.10);
  });

  // Gap 0040: flaps add CL per notch with no CLmax cap and the wrong increment.
  it.fails('stalls with full flaps near 48 KCAS (POH: 40 KIAS / 48 KCAS, ±10%) [gap 0040]', () => {
    within(stallKts(3), 48, 0.10);
  });

  // Gap 0039: constant static thrust at every speed; a fixed-pitch prop's thrust falls off.
  it.fails('short-field ground roll near 960 ft, flaps 10, lift-off 51 kt (POH, ±15%) [gap 0039]', () => {
    const b = makeBody(c172, { throttle: 1, flaps: 1 });
    fly(b, c172, 60, null, (x) => x.iasKts >= 51);
    within(b.distM * M_TO_FT, 960, 0.15);
  });

  it('climbs about 730 fpm at Vy 74 KIAS, full throttle, sea level (POH, ±15%)', () => {
    // Passes today through compensating errors (gaps 0037 and 0039); re-check when they close.
    within(rocFpm(300), 730, 0.15);
  });

  // Gap 0038: constant sea-level density, so the engine and wing never feel altitude.
  it.fails('climbs much slower at 10,000 ft (POH: roughly half the sea-level rate) [gap 0038]', () => {
    expect(rocFpm(3048)).toBeLessThan(0.6 * rocFpm(300));
  });

  // Gap 0037: lift and drag are applied along body axes, not the relative wind, so at
  // glide AoA part of the lift acts as drag (measured ≈ 4.6:1).
  it.fails('glides about 9:1 at 68 KIAS, idle (POH: ~1.5 NM per 1000 ft, ±15%) [gap 0037]', () => {
    const g = makeBody(c172, { kts: 68, altM: 1500 });
    const pilot = speedHoldPilot(() => 68);
    fly(g, c172, 40, pilot);
    const h0 = g.pos.y, d0 = g.distM;
    fly(g, c172, 30, pilot);
    within((g.distM - d0) / (h0 - g.pos.y), 9.1, 0.15);
  });
});
