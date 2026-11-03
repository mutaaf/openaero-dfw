// Flight test card (Validator): Vx and Vy are defined by what the climb does, and the
// Cessna 172S's published Vy (POH Section 5, Fig. 5-6: 74 KIAS at sea level) is where the rate peaks.
// Source for the definitions: FAA-H-8083-25B, Pilot's Handbook of Aeronautical Knowledge, ch. 11:
// Vx gives the greatest altitude gained over a given distance (steepest climb angle), Vy the greatest
// altitude gained in a given time (best rate). So the climb rate must be at its peak near the POH Vy,
// and the climb *angle* must peak at a slower speed than Vy (Vx < Vy).
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { makeBody, speedHoldPilot, settle, vsFpm } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const roc = (kts) => settle(makeBody(c172, { kts, altM: 1, throttle: 1 }), c172, 10, speedHoldPilot(() => kts), vsFpm, 60);
// Climb gradient = rate / true airspeed (sea level, ISA: TAS = KIAS).
const gradient = (kts) => roc(kts) / (kts * 101.269);

describe('Cessna 172S best climb speeds (flightModel, FAA-H-8083-25B ch. 11, POH Fig. 5-6)', () => {
  const speeds = [56, 60, 64, 68, 72, 74, 76, 80, 85, 90, 100];
  const rates = speeds.map(roc);
  const grads = speeds.map(gradient);
  const best = (arr) => speeds[arr.indexOf(Math.max(...arr))];

  // Measured (flightModel.js, 2026-11-02, KIAS: fpm): 56: 477, 64: 596, 72: 684, 74: 698, 80: 712, 85: 708,
  // 90: 689, 100: 597. The rate is flat-topped, so Vy sits well inside 3% of the best rate; the peak itself
  // is at ~80 KIAS, 6 above the POH's 74 (ticket 0148).
  it('at the POH Vy, 74 KIAS, the climb rate is within 3% of the best of the sweep', () => {
    expect(roc(74)).toBeGreaterThanOrEqual(0.97 * Math.max(...rates));
  });

  it.fails('KNOWN GAP (0148): the best climb rate is within 3 KIAS of the POH Vy, 74 KIAS (model peaks near 80)', () => {
    expect(Math.abs(best(rates) - 74)).toBeLessThanOrEqual(3);
  });

  it('the best climb angle is at a slower speed than the best rate (Vx < Vy)', () => {
    expect(best(grads)).toBeLessThan(best(rates));
  });

  it('the rate falls away on both sides: 100 KIAS climbs under 90% of the best, and so does 56 KIAS', () => {
    expect(rates[speeds.length - 1]).toBeLessThan(0.9 * Math.max(...rates));
    expect(rates[0]).toBeLessThan(0.9 * Math.max(...rates));
  });
});
