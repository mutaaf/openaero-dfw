import { describe, it, expect } from 'vitest';
import { groundEffectFactor } from '../../src/aero.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';

// Ground effect on induced drag (ticket 0179). aero.js groundEffectFactor(h, b) scales the
// induced-drag term (dragCoefficient), so 1 - factor is the induced-drag reduction at wing height h.
//
// Source: FAA Pilot's Handbook of Aeronautical Knowledge, FAA-H-8083-25C, ch. 5 "Aerodynamics of
// Flight", "Ground Effect" (https://www.faa.gov/sites/faa.gov/files/07_phak_ch5.pdf): "When the
// wing is at a height equal to its span, the reduction in induced drag is only 1.4 percent. However,
// when the wing is at a height equal to one-fourth its span, the reduction in induced drag is 23.5
// percent and, when the wing is at a height equal to one-tenth its span, the reduction in induced
// drag is 47.6 percent." (Wieselsberger's fit gives about the same figures at 1/4 and 1/10; the
// ticket's "1.4% at a quarter span" was misremembered: 1.4% is at one full span.)
//
// Tolerance: ±3 percentage points of the cited reduction (the handbook quotes one decimal; a
// curve fit that lands within 3 percentage points at all three heights is the same shape).
//
// The 1 m clamp (Math.max(1.0, heightM)) holds the factor at its 1 m value below 1 m: for the C172
// (b 11.0 m) h/b 1/20 = 0.55 m reads as 1 m (h/b 0.091); for the F-16 (b 10.0 m) h/b 1/20 = 0.50 m
// reads as 1 m (h/b 0.10) and 1/10 sits exactly on it; the 737 (b 35.8 m) is unclamped down to
// 1/20 (1.79 m). flightModel.js passes the CG's height above the ground, not the wing's: that
// difference is outside this card (see 0183).
const PHAK = [
  { hOverB: 1, reductionPct: 1.4 },
  { hOverB: 1 / 4, reductionPct: 23.5 },
  { hOverB: 1 / 10, reductionPct: 47.6 },
];
const TOL_PCT = 3;
const TABLE_H_OVER_B = [1, 1 / 2, 1 / 4, 1 / 8, 1 / 10, 1 / 20];
const AIRCRAFT = ['c172', 'b738', 'f16'];

const reductionPct = (hOverB, b) => (1 - groundEffectFactor(hOverB * b, b)) * 100;

function table() {
  const rows = [];
  for (const id of AIRCRAFT) {
    const b = AIRCRAFT_DATABASE[id].wingSpanM;
    for (const hOverB of TABLE_H_OVER_B) {
      const src = PHAK.find((p) => Math.abs(p.hOverB - hOverB) < 1e-9);
      rows.push({
        aircraft: id,
        'h/b': hOverB === 1 ? '1' : `1/${Math.round(1 / hOverB)}`,
        'h (m)': +(hOverB * b).toFixed(2),
        clamped: hOverB * b < 1 ? 'yes (1 m)' : '',
        factor: +groundEffectFactor(hOverB * b, b).toFixed(3),
        'model reduction %': +reductionPct(hOverB, b).toFixed(1),
        'PHAK reduction %': src ? src.reductionPct : '',
      });
    }
  }
  return rows;
}

describe('ground effect on induced drag (0179, PHAK ch. 5)', () => {
  it('prints the factor at each h/b for the C172, 737 and F-16', () => {
    console.table(table());
    expect(table()).toHaveLength(AIRCRAFT.length * TABLE_H_OVER_B.length);
  });

  for (const id of AIRCRAFT) {
    it(`${id}: induced drag falls in ground effect, more as the wing nears the ground (direction only)`, () => {
      const b = AIRCRAFT_DATABASE[id].wingSpanM;
      let prev = -1;
      // From one span down to a tenth: the cited heights, all unclamped for every airframe here.
      for (const hOverB of [1, 1 / 2, 1 / 4, 1 / 8, 1 / 10]) {
        const red = reductionPct(hOverB, b);
        expect(red, `h/b ${hOverB}`).toBeGreaterThan(0);
        expect(red, `h/b ${hOverB}`).toBeGreaterThan(prev);
        prev = red;
      }
    });
  }

  // Model (r = 16h/b, factor (r/(1+r))²): ~11.4% at one span, ~36% at a quarter, ~62% at a tenth,
  // against 1.4 / 23.5 / 47.6. The curve is the same for every airframe (it is a function of h/b);
  // the clamp does not touch the cited heights. Fixing it moves the flare float and landing cards.
  it.fails('KNOWN GAP (0183): the induced-drag reduction at h/b 1, 1/4 and 1/10 is within 3 percentage points of PHAK\'s 1.4 / 23.5 / 47.6% (model: ~11.4 / 36 / 62%)', () => {
    for (const id of AIRCRAFT) {
      const b = AIRCRAFT_DATABASE[id].wingSpanM;
      for (const { hOverB, reductionPct: cited } of PHAK) {
        expect(Math.abs(reductionPct(hOverB, b) - cited), `${id} h/b ${hOverB}`).toBeLessThanOrEqual(TOL_PCT);
      }
    }
  });
});
