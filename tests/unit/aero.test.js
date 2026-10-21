import { describe, it, expect } from 'vitest';
import {
  clamp, lerp, dynamicPressure, liftCoefficient, groundEffectFactor, dragCoefficient,
  inducedDragK, headingError, headingFromYaw, papiWhiteLights, gpwsCalloutIndex,
  GPWS_ALT_THRESHOLDS, isStallWarning, isGpwsWarning, takeoffCalloutIndex, TAKEOFF_CALLOUTS,
} from '../../src/aero.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { DEG_TO_RAD, KTS_TO_MPS, MPS_TO_KTS, M_TO_FT, FT_TO_M } from '../../src/constants.js';

const b738 = AIRCRAFT_DATABASE.b738;

describe('units', () => {
  it('round-trips knots and feet', () => {
    expect(100 * KTS_TO_MPS * MPS_TO_KTS).toBeCloseTo(100, 10);
    expect(1000 * FT_TO_M * M_TO_FT).toBeCloseTo(1000, 10);
  });
});

describe('basic math', () => {
  it('clamps and lerps', () => {
    expect(clamp(5, -1, 1)).toBe(1);
    expect(clamp(-5, -1, 1)).toBe(-1);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });
  it('computes dynamic pressure q = ½ρv²', () => {
    expect(dynamicPressure(100)).toBeCloseTo(0.5 * 1.225 * 10000, 6);
  });
});

describe('liftCoefficient', () => {
  it('is linear in AoA below stall, plus the airframe\'s flap increment per notch', () => {
    const a = 5 * DEG_TO_RAD;
    expect(liftCoefficient(b738, a, 0)).toBeCloseTo(b738.cl0 + b738.clAlpha * a, 10);
    expect(liftCoefficient(b738, a, 2) - liftCoefficient(b738, a, 0)).toBeCloseTo(b738.flapCl[2], 10);
  });
  it('drops off past the stall angle', () => {
    const atStall = liftCoefficient(b738, b738.alphaStallDeg * DEG_TO_RAD, 0);
    const deepStall = liftCoefficient(b738, (b738.alphaStallDeg + 10) * DEG_TO_RAD, 0);
    expect(deepStall).toBeLessThan(atStall);
  });
  it('the F-16 stalls much later than the 737', () => {
    const a = 20 * DEG_TO_RAD;
    const f16 = AIRCRAFT_DATABASE.f16;
    expect(liftCoefficient(f16, a, 0)).toBeCloseTo(f16.cl0 + f16.clAlpha * a, 10);
    expect(liftCoefficient(b738, a, 0)).toBeLessThan(b738.cl0 + b738.clAlpha * a);
  });
});

describe('groundEffectFactor', () => {
  it('reduces drag near the ground and tends to 1 at altitude', () => {
    const low = groundEffectFactor(2, b738.wingSpanM);
    const high = groundEffectFactor(500, b738.wingSpanM);
    expect(low).toBeLessThan(high);
    expect(high).toBeGreaterThan(0.99);
    expect(high).toBeLessThanOrEqual(1);
  });
  it('treats heights below 1 m as 1 m', () => {
    expect(groundEffectFactor(0, 10)).toBe(groundEffectFactor(1, 10));
  });
});

describe('dragCoefficient', () => {
  it('ground effect reduces only the induced drag, never the parasite drag', () => {
    const k = 1 / (Math.PI * b738.aspectRatio * b738.oswaldEfficiency);
    expect(dragCoefficient(b738, 0, true, 0, 0.5)).toBeCloseTo(b738.cd0 + 0.018, 10);
    expect(dragCoefficient(b738, 1, false, 0, 0.5)).toBeCloseTo(b738.cd0 + 0.5 * k, 10);
  });

  it('adds gear and flap drag', () => {
    const clean = dragCoefficient(b738, 0.5, false, 0, 1);
    expect(dragCoefficient(b738, 0.5, true, 0, 1) - clean).toBeCloseTo(0.018, 10);
    expect(dragCoefficient(b738, 0.5, false, 3, 1) - clean).toBeCloseTo(b738.flapCd[3], 10);
    const f16 = { ...b738, flapCd: undefined }; // no table: 0.012 per notch
    expect(dragCoefficient(f16, 0.5, false, 3, 1) - dragCoefficient(f16, 0.5, false, 0, 1)).toBeCloseTo(0.036, 10);
  });
  it('fixed gear is always down: the C172 cannot shed its gear drag', () => {
    const c172 = AIRCRAFT_DATABASE.c172;
    expect(dragCoefficient(c172, 0.3, false, 0, 1)).toBeCloseTo(dragCoefficient(c172, 0.3, true, 0, 1), 10);
  });
  it('includes induced drag k·CL²', () => {
    const k = inducedDragK(b738);
    expect(dragCoefficient(b738, 1, false, 0, 1)).toBeCloseTo(b738.cd0 + k, 10);
  });
});

describe('headings', () => {
  it('wraps heading error to [-180, 180]', () => {
    expect(headingError(10, 350)).toBe(20);
    expect(headingError(350, 10)).toBe(-20);
    expect(headingError(180, 0)).toBe(180);
  });
  it('converts YXZ yaw to compass heading', () => {
    expect(headingFromYaw(0)).toBe(0);
    expect(headingFromYaw(-Math.PI / 2)).toBeCloseTo(90, 10);
    expect(headingFromYaw(Math.PI / 2)).toBeCloseTo(270, 10);
  });
});

describe('PAPI', () => {
  it('shows two white / two red on a 3° glidepath', () => {
    expect(papiWhiteLights(3.0)).toBe(2);
  });
  it('goes all white when high and all red when low', () => {
    expect(papiWhiteLights(4.0)).toBe(4);
    expect(papiWhiteLights(3.2)).toBe(3);
    expect(papiWhiteLights(2.6)).toBe(1);
    expect(papiWhiteLights(2.0)).toBe(0);
  });
});

describe('GPWS callouts', () => {
  it('fires inside the 35 ft window under each threshold', () => {
    expect(gpwsCalloutIndex(990, -1)).toBe(0);
    expect(GPWS_ALT_THRESHOLDS[gpwsCalloutIndex(480, -1)]).toBe(500);
    expect(gpwsCalloutIndex(700, -1)).toBe(-1);
  });
  it('does not repeat the last callout', () => {
    expect(gpwsCalloutIndex(990, 0)).toBe(-1);
  });
});

// Takeoff callouts (0035): a roll from 0 to Vr + 10 kt, lift-off 2 kt after Vr, then a
// climb at 800 fpm. Returns the words in the order they fire.
function sweepTakeoff(vrKts, { liftoffVsFpm = 800 } = {}) {
  const words = [];
  let last = -1;
  for (let ias = 0; ias <= vrKts + 10; ias += 0.25) {
    const airborne = ias >= vrKts + 2;
    const agl = airborne ? (ias - vrKts - 2) * 4 : 0;
    const i = takeoffCalloutIndex(ias, airborne ? liftoffVsFpm : 0, agl, vrKts, last);
    if (i >= 0) { words.push(TAKEOFF_CALLOUTS[i]); last = i; }
  }
  return words;
}

describe('takeoff callouts (0035)', () => {
  it('the 737 hears eighty knots, V1, rotate, positive rate, each once and in order', () => {
    expect(sweepTakeoff(AIRCRAFT_DATABASE.b738.vrKts)).toEqual(['eighty knots', 'V1', 'rotate', 'positive rate']);
  });
  it('the Cessna (Vr 55) gets no 80 kt check and no V1: rotate, positive rate', () => {
    expect(AIRCRAFT_DATABASE.c172.vrKts).toBeLessThan(60);
    expect(sweepTakeoff(AIRCRAFT_DATABASE.c172.vrKts)).toEqual(['rotate', 'positive rate']);
  });
  it('fires at 80 kt, at Vr - 3 and at Vr', () => {
    expect(takeoffCalloutIndex(79.9, 0, 0, 135, -1)).toBe(-1);
    expect(takeoffCalloutIndex(80, 0, 0, 135, -1)).toBe(0);
    expect(takeoffCalloutIndex(131.9, 0, 0, 135, 0)).toBe(-1);
    expect(takeoffCalloutIndex(132, 0, 0, 135, 0)).toBe(1);
    expect(takeoffCalloutIndex(134.9, 0, 0, 135, 1)).toBe(-1);
    expect(takeoffCalloutIndex(135, 0, 0, 135, 1)).toBe(2);
  });
  it('a big speed jump still calls every word, one per call, in order', () => {
    expect(takeoffCalloutIndex(140, 0, 0, 135, -1)).toBe(0);
    expect(takeoffCalloutIndex(140, 0, 0, 135, 0)).toBe(1);
    expect(takeoffCalloutIndex(140, 0, 0, 135, 1)).toBe(2);
  });
  it('positive rate only after rotate, never on a bounce or a descending lift-off', () => {
    // Airborne and climbing before Vr (an early lift-off or a bounce): no positive rate yet.
    expect(takeoffCalloutIndex(130, 600, 12, 135, 0)).toBe(-1);
    expect(takeoffCalloutIndex(133, 600, 12, 135, 1)).toBe(-1);
    // After rotate: a hop under 5 ft, a level or sinking airplane: nothing.
    expect(takeoffCalloutIndex(140, 600, 4, 135, 2)).toBe(-1);
    expect(takeoffCalloutIndex(140, 200, 20, 135, 2)).toBe(-1);
    expect(takeoffCalloutIndex(140, -300, 20, 135, 2)).toBe(-1);
    expect(takeoffCalloutIndex(140, 301, 6, 135, 2)).toBe(3);
    expect(sweepTakeoff(135, { liftoffVsFpm: -100 })).toEqual(['eighty knots', 'V1', 'rotate']);
  });
  it('nothing after positive rate', () => {
    expect(takeoffCalloutIndex(160, 1500, 400, 135, 3)).toBe(-1);
  });
});

describe('warnings', () => {
  it('stall warning only when airborne and slow', () => {
    expect(isStallWarning(100, 114, false)).toBe(true);
    expect(isStallWarning(100, 114, true)).toBe(false);
    expect(isStallWarning(130, 114, false)).toBe(false);
  });
  it('terrain warning needs low altitude and a high sink rate', () => {
    expect(isGpwsWarning(300, -2000, false)).toBe(true);
    expect(isGpwsWarning(300, -800, false)).toBe(false);
    expect(isGpwsWarning(800, -2000, false)).toBe(false);
  });
});

import { liftCoefficient as lc } from '../../src/aero.js';
import { AIRCRAFT_DATABASE as DB } from '../../src/aircraft.js';
describe('flap lift per airframe', () => {
  it('C172 stall speeds by flap setting match the POH (53 / 50 / 48 KCAS, ±3 kt)', async () => {
    const { stallSpeedKts } = await import('../../src/aero.js');
    expect(Math.abs(stallSpeedKts(DB.c172, 0) - 53)).toBeLessThan(3);
    expect(Math.abs(stallSpeedKts(DB.c172, 1) - 50)).toBeLessThan(3);
    expect(Math.abs(stallSpeedKts(DB.c172, 3) - 48)).toBeLessThan(3);
  });
  it('the stall warning sounds 5 kt above the configuration stall speed', async () => {
    const { stallSpeedKts, stallWarningKts } = await import('../../src/aero.js');
    for (const f of [0, 1, 2, 3]) expect(stallWarningKts(DB.c172, f) - stallSpeedKts(DB.c172, f)).toBeCloseTo(5, 6);
    expect(stallWarningKts(DB.c172, 3)).toBeLessThan(stallWarningKts(DB.c172, 0));
  });

  it('the 737 needs ~4–6° AoA for 1 g at Vref+5 with flaps 30', () => {
    const s = DB.b738;
    const q = 0.5 * 1.225 * ((s.vrefKts + 5) * 0.514444) ** 2;
    const clNeeded = (s.massKg * 9.80665) / (q * s.wingAreaM2);
    const aoaDeg = ((clNeeded - s.cl0 - s.flapCl[2]) / s.clAlpha) * 180 / Math.PI;
    expect(aoaDeg).toBeGreaterThan(4);
    expect(aoaDeg).toBeLessThan(6);
    expect(lc(s, aoaDeg * Math.PI / 180, 2)).toBeCloseTo(clNeeded, 3);
  });
  it('airframes without a value keep the original 0.28 per notch', () => {
    const s = { ...DB.f16, flapClPerNotch: undefined, flapCl: undefined };
    expect(lc(s, 0, 2) - lc(s, 0, 0)).toBeCloseTo(0.56, 6);
  });
});

import { calloutWord, GPWS_ALT_THRESHOLDS as T } from '../../src/aero.js';
describe('calloutWord', () => {
  it('maps 1:1 to the GPWS thresholds', () => {
    expect(T.map((_, i) => calloutWord(i))).toEqual([
      'one thousand', 'five hundred', 'four hundred', 'three hundred', 'two hundred',
      'one hundred', 'fifty', 'forty', 'thirty', 'twenty', 'ten']);
  });
});
