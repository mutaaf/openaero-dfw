import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE as AIRCRAFT } from '../../src/aircraft.js';
import { stallSpeedKts } from '../../src/aero.js';
import { stallBand, STALL_CAUTION, TAPE_TOP } from '../../src/hudLayout.js';

// Ticket 0128: the low-speed band on the speed tape, red up to the 1 g stall speed for where the
// flaps are, amber from it to 1.1 Vs.
describe('stallSpeedKts: the band\'s top', () => {
  const c172 = AIRCRAFT.c172, b738 = AIRCRAFT.b738;

  // POH Section 2's arcs are indicated: the green arc starts at Vs1 48 KIAS, the white arc at Vs0
  // 40 KIAS. The model's IAS has no instrument error (it is EAS, ~CAS this slow), and Fig. 5-3
  // gives the same stalls calibrated: 48 KIAS = 53 KCAS flaps up, 40 KIAS = 48 KCAS flaps 30.
  it('C172S flaps up is Vs1 and flaps 30 is Vs0 (POH Fig. 5-3 KCAS of the Section 2 arcs, ±3 kt)', () => {
    expect(c172.flapDetentsDeg[3]).toBe(30);
    expect(Math.abs(stallSpeedKts(c172, 0) - 53)).toBeLessThanOrEqual(3);
    expect(Math.abs(stallSpeedKts(c172, 3) - 48)).toBeLessThanOrEqual(3);
  });

  it('lowering flaps lowers the stall speed, so the band shortens: by notch and in transit', () => {
    for (const spec of [c172, b738]) {
      let last = Infinity;
      for (let pos = 0; pos <= spec.flapDetentsDeg.length - 1 + 1e-9; pos += 0.25) {
        const v = stallSpeedKts(spec, pos);
        expect(v).toBeLessThan(last);
        last = v;
      }
    }
    // By value: the 737's band top comes down ~17 kt from flaps up to flaps 30 (34 px of tape).
    expect(stallSpeedKts(b738, 0) - stallSpeedKts(b738, 2)).toBeGreaterThan(15);
  });
});

describe('stallBand: where it sits on the tape (2 px/kt, ±90 px)', () => {
  const cy = 360, bot = cy - TAPE_TOP, top = cy + TAPE_TOP, out = {};

  it('the 737\'s default final (Vref + 5 = 155, Vs 122): red from the tape bottom to Vs, amber to 1.1 Vs', () => {
    stallBand(cy, 122, 155, out);
    expect(out.redTop).toBe(cy + 66);
    expect(out.redBot).toBe(bot);
    expect(out.red).toBe(true);
    expect(out.amberTop).toBeCloseTo(cy - (122 * STALL_CAUTION - 155) * 2, 9);
    expect(out.amberBot).toBe(cy + 66);
    expect(out.amber).toBe(true);
  });

  it('hidden when the stall speed is below the tape\'s range (fast)', () => {
    stallBand(cy, 122, 250, out);
    expect(out.red).toBe(false);
    expect(out.amber).toBe(false);
  });

  it('only the amber strip when 1.1 Vs reaches the tape but Vs does not', () => {
    stallBand(cy, 100, 150, out); // Vs 100 px down, 1.1 Vs 80 px down
    expect(out.red).toBe(false);
    expect(out.amber).toBe(true);
    expect(out.amberTop).toBeCloseTo(cy + 80, 9);
    expect(out.amberBot).toBe(bot);
  });

  it('slower than the stall: the red fills the tape up to Vs, clamped at its top', () => {
    stallBand(cy, 53, 45, out);
    expect(out.redTop).toBe(cy - 16);
    expect(out.redBot).toBe(bot);
    stallBand(cy, 122, 0, out); // far below: never past the tape's ends
    expect(out.redTop).toBe(top);
    expect(out.redBot).toBe(bot);
    expect(out.amber).toBe(false);
  });

  it('reuses the object it is given (no per-frame allocation)', () => {
    expect(stallBand(cy, 122, 140, out)).toBe(out);
  });
});
