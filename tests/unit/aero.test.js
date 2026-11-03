import { describe, it, expect } from 'vitest';
import {
  clamp, lerp, dynamicPressure, liftCoefficient, groundEffectFactor, dragCoefficient, waveDragCd, dragDivergenceMach,
  inducedDragK, headingError, headingFromYaw, papiWhiteLights, PAPI_SETTING_OFFSETS_DEG, gpwsCalloutIndex, gpwsRearm,
  GPWS_ALT_THRESHOLDS, isStallWarning, isGpwsWarning, takeoffCalloutIndex, TAKEOFF_CALLOUTS,
  TAKEOFF_CALLOUT_HUD_PLAIN,
} from '../../src/aero.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { searsHaackCd } from '../../src/supersonic.js';
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

// Ticket 0120: Mason's Korn-equation drag rise (Configuration Aerodynamics, Sect. 7.5.2, eq. 7-8),
// the expected numbers worked by hand from the formula, not read back from the code:
//   MDD = κA/cosΛ − (t/c)/cos²Λ − CL/(10 cos³Λ), Mcrit = MDD − (0.1/80)^(1/3), ΔCD = 20 (M − Mcrit)^4
// 737-800: κA 0.95, t/c 0.1289, Λ 25°: κA/cosΛ 1.04821, (t/c)/cos²Λ 0.15693, 1/(10 cos³Λ) 0.134330.
describe('waveDragCd (0120: Korn + Lock drag rise)', () => {
  it('drag divergence Mach falls with lift: 0.8241 at CL 0.5, 0.7972 at CL 0.7', () => {
    expect(dragDivergenceMach(b738, 0.5)).toBeCloseTo(0.82412, 4);
    expect(dragDivergenceMach(b738, 0.7)).toBeCloseTo(0.79726, 4);
  });
  it('is zero below the critical Mach (MDD − 0.1077) and 20 (M − Mcrit)^4 above it', () => {
    expect(waveDragCd(b738, 0.5, 0.6)).toBe(0);
    expect(waveDragCd(b738, 0.5, 0.716)).toBe(0); // Mcrit 0.716394
    expect(waveDragCd(b738, 0.5, 0.79)).toBeCloseTo(20 * (0.79 - 0.716394) ** 4, 6); // ≈ 5.9 counts
    expect(waveDragCd(b738, 0.7, 0.79)).toBeCloseTo(20 * (0.79 - 0.689528) ** 4, 6); // ≈ 20 counts
  });
  it('is 0.1 per Mach of slope at MDD (Mason\'s definition of the divergence Mach)', () => {
    const mdd = dragDivergenceMach(b738, 0.5), h = 1e-5;
    expect((waveDragCd(b738, 0.5, mdd + h) - waveDragCd(b738, 0.5, mdd - h)) / (2 * h)).toBeCloseTo(0.1, 4);
  });
  it('past MDD it goes on at MDD\'s 0.1 slope instead of the runaway fourth power (bounded at Mach 1)', () => {
    const mdd = dragDivergenceMach(b738, 0.2); // 0.86455
    const atMdd = 20 * (0.1 / 80) ** (4 / 3); // 0.002692
    expect(waveDragCd(b738, 0.2, 0.95)).toBeCloseTo(atMdd + 0.1 * (0.95 - mdd), 6); // ~112 counts (Lock alone: 279)
    expect(waveDragCd(b738, 0.2, 1.1)).toBeCloseTo(atMdd + 0.1 * (1.1 - mdd), 6); // ~262 counts (Lock alone: ~4,000)
    expect(waveDragCd(b738, 0.2, 1.0)).toBeLessThan(0.03);
  });
  it('a pushover loads the wing too: a negative CL rises like a positive one', () => {
    expect(waveDragCd(b738, -0.3, 0.8)).toBeCloseTo(waveDragCd(b738, 0.3, 0.8), 10);
  });
  it('only an airframe with transonic data has it (C172 none; F-16 none below its Mcrit), and dragCoefficient adds it', () => {
    expect(waveDragCd(AIRCRAFT_DATABASE.c172, 0.5, 0.9)).toBe(0);
    expect(waveDragCd(AIRCRAFT_DATABASE.f16, 0.5, 0.78)).toBe(0); // Mcrit 0.786 at CL 0.5
    expect(dragCoefficient(b738, 0.6, false, 0, 1, 0.8) - dragCoefficient(b738, 0.6, false, 0, 1))
      .toBeCloseTo(waveDragCd(b738, 0.6, 0.8), 10);
    expect(dragCoefficient(b738, 0.6, false, 0, 1, 0.3)).toBe(dragCoefficient(b738, 0.6, false, 0, 1));
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
  // Ticket 0131: AC 150/5340-30J Table 7-2 aims a 4-box PAPI's units at the glide path G
  // +30', +10', -10', -30' (standard installation), so two white / two red is G +-10'.
  it('turns at the AC 150/5340-30J setting angles around a 3.0° path', () => {
    expect(PAPI_SETTING_OFFSETS_DEG).toEqual([-30 / 60, -10 / 60, 10 / 60, 30 / 60]);
    for (const [deg, white] of [[3.0, 2], [2.84, 2], [3.16, 2], [2.82, 1], [3.18, 3], [2.51, 1], [3.49, 3],
      [2.49, 0], [3.51, 4], [0, 0], [-1, 0], [10, 4]]) {
      expect(papiWhiteLights(deg), `${deg}°`).toBe(white);
      expect(papiWhiteLights(deg, 3), `${deg}° (G 3.0)`).toBe(white);
    }
  });
  it('is symmetric about the path: the on-path band is +-10 arc-minutes', () => {
    for (const d of [0.1, 0.16, 0.18, 0.3, 0.49, 0.51, 1]) {
      expect(papiWhiteLights(3 + d) + papiWhiteLights(3 - d), `+-${d}°`).toBe(4);
    }
  });
  it('moves the same offsets with the glide path angle (G = 3.2°)', () => {
    for (const [deg, white] of [[3.2, 2], [3.04, 2], [3.36, 2], [3.02, 1], [3.38, 3], [2.69, 0], [2.71, 1], [3.69, 3], [3.71, 4]]) {
      expect(papiWhiteLights(deg, 3.2), `${deg}° (G 3.2)`).toBe(white);
    }
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
  it('calls each height once, in order, on a descent to the runway (0117)', () => {
    const said = [];
    let last = -1;
    for (let ft = 1010; ft > 0; ft -= 1) { // sim.aglFt is whole feet
      const i = gpwsCalloutIndex(ft, last);
      if (i >= 0) { said.push(GPWS_ALT_THRESHOLDS[i]); last = i; }
    }
    expect(said).toEqual(GPWS_ALT_THRESHOLDS);
  });
  it('a fast descent (3,000 fpm at 4 fps, 12 ft a frame) calls each height it lands in, in order, never twice', () => {
    const said = [];
    let last = -1;
    for (let ft = 1010; ft > 0; ft -= 12.5) {
      const i = gpwsCalloutIndex(Math.round(ft), last);
      if (i >= 0) { said.push(GPWS_ALT_THRESHOLDS[i]); last = i; }
    }
    expect(said.slice(0, 6)).toEqual([1000, 500, 400, 300, 200, 100]);
    expect([...said].sort((a, b) => b - a)).toEqual(said);
    expect(new Set(said).size).toBe(said.length);
  });
  it('a bounce or a dip in the terrain never calls a height above the last one again', () => {
    expect(gpwsCalloutIndex(15, 10)).toBe(-1); // "ten", bounced to 15 ft
    expect(gpwsCalloutIndex(45, 7)).toBe(-1); // "forty", the ground fell away under the final
  });
  it('re-arms 100 ft above the last height called (go-around, touch-and-go)', () => {
    expect(gpwsRearm(400, 1)).toBe(1); // "five hundred", still within 100 ft
    expect(gpwsRearm(601, 1)).toBe(-1);
    expect(gpwsRearm(111, 10)).toBe(-1); // "ten", climbing out of a touch-and-go
    expect(gpwsRearm(50, -1)).toBe(-1);
  });
  it('still calls a height a fast descent jumped into the window of', () => {
    expect(GPWS_ALT_THRESHOLDS[gpwsCalloutIndex(36, 6)]).toBe(40); // "fifty" last, now 36 ft
  });
});

// Takeoff callouts (0035): a roll from 0 to Vr + 10 kt, lift-off 2 kt after Vr, then a
// climb at 800 fpm. Returns the words in the order they fire.
function sweepTakeoff(spec, { liftoffVsFpm = 800 } = {}) {
  const { vrKts } = spec;
  const words = [];
  let last = -1;
  for (let ias = 0; ias <= vrKts + 10; ias += 0.25) {
    const airborne = ias >= vrKts + 2;
    const agl = airborne ? (ias - vrKts - 2) * 4 : 0;
    const i = takeoffCalloutIndex(ias, airborne ? liftoffVsFpm : 0, agl, vrKts, last, !!spec.twoCrew);
    if (i >= 0) { words.push(TAKEOFF_CALLOUTS[i]); last = i; }
  }
  return words;
}

describe('takeoff callouts (0035)', () => {
  it('the 737 hears eighty knots, V1, rotate, positive rate, each once and in order', () => {
    expect(sweepTakeoff(AIRCRAFT_DATABASE.b738)).toEqual(['eighty knots', 'V1', 'rotate', 'positive rate']);
  });
  it('single pilots (Cessna Vr 55, F-16 Vr 155) get no 80 kt check and no V1: rotate, positive rate', () => {
    expect(sweepTakeoff(AIRCRAFT_DATABASE.c172)).toEqual(['rotate', 'positive rate']);
    expect(sweepTakeoff(AIRCRAFT_DATABASE.f16)).toEqual(['rotate', 'positive rate']);
  });
  it('Kid and Learner read what each word asks, in one line that fits the HUD box', () => {
    expect(TAKEOFF_CALLOUT_HUD_PLAIN[2]).toBe('ROTATE · NOSE UP');
    for (const w of TAKEOFF_CALLOUT_HUD_PLAIN) expect(w.length).toBeLessThanOrEqual(24);
  });
  it('fires at 80 kt, at Vr - 3 and at Vr', () => {
    expect(takeoffCalloutIndex(79.9, 0, 0, 135, -1, true)).toBe(-1);
    expect(takeoffCalloutIndex(80, 0, 0, 135, -1, true)).toBe(0);
    expect(takeoffCalloutIndex(131.9, 0, 0, 135, 0, true)).toBe(-1);
    expect(takeoffCalloutIndex(132, 0, 0, 135, 0, true)).toBe(1);
    expect(takeoffCalloutIndex(134.9, 0, 0, 135, 1, true)).toBe(-1);
    expect(takeoffCalloutIndex(135, 0, 0, 135, 1, true)).toBe(2);
  });
  it('a big speed jump still calls every word, one per call, in order', () => {
    expect(takeoffCalloutIndex(140, 0, 0, 135, -1, true)).toBe(0);
    expect(takeoffCalloutIndex(140, 0, 0, 135, 0, true)).toBe(1);
    expect(takeoffCalloutIndex(140, 0, 0, 135, 1, true)).toBe(2);
  });
  it('positive rate only after rotate, never on a bounce or a descending lift-off', () => {
    // Airborne and climbing before Vr (an early lift-off or a bounce): no positive rate yet.
    expect(takeoffCalloutIndex(130, 600, 12, 135, 0, true)).toBe(-1);
    expect(takeoffCalloutIndex(133, 600, 12, 135, 1, true)).toBe(-1);
    // After rotate: a hop under 5 ft, a level or sinking airplane: nothing.
    expect(takeoffCalloutIndex(140, 600, 4, 135, 2, true)).toBe(-1);
    expect(takeoffCalloutIndex(140, 200, 20, 135, 2, true)).toBe(-1);
    expect(takeoffCalloutIndex(140, -300, 20, 135, 2, true)).toBe(-1);
    expect(takeoffCalloutIndex(140, 301, 6, 135, 2, true)).toBe(3);
    // A strut rebound on the runway: the caller passes wheel height 0 while on the ground.
    expect(takeoffCalloutIndex(140, 400, 0, 135, 2, true)).toBe(-1);
    expect(sweepTakeoff(AIRCRAFT_DATABASE.b738, { liftoffVsFpm: -100 })).toEqual(['eighty knots', 'V1', 'rotate']);
  });
  it('nothing after positive rate', () => {
    expect(takeoffCalloutIndex(160, 1500, 400, 135, 3, true)).toBe(-1);
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

// 0133: the F-16's supersonic wave drag (Raymer's Sears-Haack correlation, Sect. 12.5.9-12.5.10).
describe('waveDragCd supersonic (0133: the F-16)', () => {
  const f16 = AIRCRAFT_DATABASE.f16;
  const mdd = (cl) => dragDivergenceMach(f16, cl);
  it('is zero below Mcrit at every lift (the subsonic cards do not move)', () => {
    for (const cl of [-0.5, 0, 0.3, 1.0]) {
      const mcrit = mdd(cl) - Math.cbrt(0.1 / 80);
      expect(waveDragCd(f16, cl, mcrit - 1e-6)).toBe(0);
      expect(waveDragCd(f16, cl, 0.5)).toBe(0);
    }
    expect(mdd(0.1)).toBeCloseTo(0.961, 3);
  });
  it('the Sears-Haack drag area is (9π/2)(Amax/l)², the volume form 128V²/(πl⁴) of the same body', () => {
    const { areaMaxM2: a, lengthM: l, ewd } = f16.supersonic;
    const r = Math.sqrt(a / Math.PI), volume = 3 * Math.PI ** 2 * r * r * l / 16; // Sears-Haack body
    expect(searsHaackCd(f16) * f16.wingAreaM2 / ewd).toBeCloseTo(128 * volume ** 2 / (Math.PI * l ** 4), 10);
    expect(searsHaackCd(f16)).toBeCloseTo(0.02165, 4);
  });
  it('at Mach 1.2 and 1.05 it is the Sears-Haack value; from 1.2 up, Raymer\'s Mach and sweep factor', () => {
    const cd12 = searsHaackCd(f16);
    expect(waveDragCd(f16, 0.1, 1.2)).toBeCloseTo(cd12, 10);
    expect(waveDragCd(f16, 0.1, 1.05)).toBeCloseTo(cd12, 10);
    const raymer = (m) => cd12 * (1 - 0.386 * (m - 1.2) ** 0.57 * (1 - Math.PI * 40 ** 0.77 / 100));
    expect(waveDragCd(f16, 0.1, 2.0)).toBeCloseTo(raymer(2.0), 10); // ≈ 0.0182
    expect(waveDragCd(f16, 0.1, 2.0)).toBeCloseTo(0.0182, 4);
  });
  it('past ~Mach 2.4 it holds at 0.8 of the Mach 1.2 value (Raymer\'s high-Mach limit), out to Mach 10', () => {
    expect(waveDragCd(f16, 0.1, 2.3)).toBeGreaterThan(0.8 * searsHaackCd(f16));
    for (const m of [2.5, 4, 10]) expect(waveDragCd(f16, 0.1, m)).toBeCloseTo(0.8 * searsHaackCd(f16), 10);
  });
  it('is continuous through MDD, 1.05 and 1.2, finite and non-negative everywhere, peaks near Mach 1.1', () => {
    for (const m of [mdd(0.1), 1.05, 1.2]) {
      expect(Math.abs(waveDragCd(f16, 0.1, m + 1e-7) - waveDragCd(f16, 0.1, m - 1e-7))).toBeLessThan(1e-6);
    }
    let peakM = 0, peak = 0;
    for (let m = 0; m <= 4; m += 0.001) {
      const cd = waveDragCd(f16, 0.1, m);
      expect(Number.isFinite(cd)).toBe(true);
      expect(cd).toBeGreaterThanOrEqual(0);
      if (cd > peak) { peak = cd; peakM = m; }
    }
    expect(peakM).toBeGreaterThan(1.05);
    expect(peakM).toBeLessThan(1.2);
    expect(peak / searsHaackCd(f16)).toBeLessThan(1.3);
  });
  // A cross-check, not the source: JSBSim's open F-16 (aircraft/f16/f16.xml, GPL; numbers cited,
  // not copied) adds a Mach drag of 0.023 at Mach 1.1 and 0.015 at Mach 1.8. Ours: within ±30%.
  it('is within ±30% of JSBSim\'s open F-16 Mach drag at Mach 1.1 (0.023) and 1.8 (0.015)', () => {
    expect(Math.abs(waveDragCd(f16, 0.1, 1.1) / 0.023 - 1)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(waveDragCd(f16, 0.1, 1.8) / 0.015 - 1)).toBeLessThanOrEqual(0.3);
  });
  it('installs itself on the F-16 only; the 737 keeps 0120\'s linear continuation past MDD', () => {
    expect(f16.supersonicCd).toBeTypeOf('function');
    expect(b738.supersonicCd).toBeUndefined();
    expect(AIRCRAFT_DATABASE.c172.transonic).toBeUndefined();
    const m = dragDivergenceMach(b738, 0.2);
    expect(waveDragCd(b738, 0.2, 1.1)).toBeCloseTo(20 * Math.cbrt(0.1 / 80) ** 4 + 0.1 * (1.1 - m), 6);
  });
});
