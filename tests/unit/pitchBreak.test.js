// The Cessna's post-stall pitch break (ticket 0109): the tables read off NASA CR-3097 / CR-3201
// (src/pitchBreak.js), and the full-back-stick balance they imply on their own, with no flying.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { elevatorEta, breakDeg, lookup } from '../../src/pitchBreak.js';

const c172 = AIRCRAFT_DATABASE.c172;

describe('pitchBreak.js (0109)', () => {
  it('installs itself on the Cessna only', () => {
    expect(c172.pitchBreak.eta).toBe(elevatorEta);
    expect(AIRCRAFT_DATABASE.b738.pitchBreak).toBeUndefined();
    expect(AIRCRAFT_DATABASE.f16.pitchBreak).toBeUndefined();
  });
  it('leaves the pre-stall airplane alone: full elevator power and no break below α 8°, at any negative α, and no break to the stall', () => {
    for (const a of [-20, -5, 0, 5, 8]) {
      expect(elevatorEta(a, -1)).toBe(1);
      expect(elevatorEta(a, 1)).toBe(1);
      expect(breakDeg(a)).toBe(0);
    }
    expect(breakDeg(14)).toBe(0);
  });
  it('the reports\' points: the up elevator keeps a quarter of its power at α 25-35° (CR-3201 Fig. A15 vs A3), the down one ~0.6 (CR-3097 Fig. A21 vs A3)', () => {
    expect(elevatorEta(25, -1)).toBeCloseTo(0.24, 2);
    expect(elevatorEta(30, -0.5)).toBeCloseTo(0.23, 2);
    expect(elevatorEta(30, 1)).toBeCloseTo(0.62, 2);
    expect(elevatorEta(18, -1)).toBeCloseTo(0.49, 2);
    expect(breakDeg(18)).toBeCloseTo(9.7, 5);
  });
  it('interpolates between the points and holds the last one past α 50°', () => {
    expect(elevatorEta(17, -1)).toBeCloseTo((0.65 + 0.49) / 2, 5);
    expect(lookup([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 47.5)).toBeCloseTo(11.5, 5);
    expect(breakDeg(90)).toBe(breakDeg(50));
  });
  it('on its own tables, full back stick from a cruise trim balances just past the stall (α 16-18°), not at 40°', () => {
    // Moment balance in degrees of α (flightModel.js): η·elevatorAlphaDeg = (α − trim) + break(α).
    const trim = 5;
    let alpha = null;
    for (let a = 0; a <= 60; a += 0.05) {
      if (elevatorEta(a, -1) * c172.elevatorAlphaDeg - (a - trim) - breakDeg(a) <= 0) { alpha = a; break; }
    }
    expect(trim + c172.elevatorAlphaDeg).toBeGreaterThan(40); // the linear model's balance
    expect(alpha).toBeGreaterThan(16);
    expect(alpha).toBeLessThan(18);
  });
});
