import { describe, it, expect } from 'vitest';
import { engineThrust, spoolEngine, throttleForThrust, pistonPowerLapse, maxClimbThrustN } from '../../src/engine.js';
import { airAt } from '../../src/atmosphere.js';
import { AIRCRAFT_DATABASE as DB } from '../../src/aircraft.js';

const sl = airAt(0);

describe('piston prop', () => {
  it('measured static thrust at full throttle, and less at 120 kt than at rest', () => {
    expect(engineThrust(DB.c172, 1, 0, sl, 0, 0)).toBeCloseTo(2070, 0);
    expect(engineThrust(DB.c172, 1, 62, sl, 0.18, 2350)).toBeLessThan(engineThrust(DB.c172, 1, 0, sl, 0, 0));
  });
  // Indicated power δ/√θ (SAE J1349) less a fixed friction power, a tenth of sea-level
  // indicated: 0.713 indicated at 10,000 ft is 0.681 at the propeller (0099).
  it('power lapse: ~68% at 10,000 ft ISA, ~58% at 14,000 ft, a hot day costs only a few %', () => {
    const a = airAt(3048);
    expect(pistonPowerLapse(a.pressurePa, a.tempK)).toBeCloseTo(0.681, 3);
    const ceiling = airAt(14000 / 3.28084);
    expect(pistonPowerLapse(ceiling.pressurePa, ceiling.tempK)).toBeCloseTo(0.575, 3);
    expect(pistonPowerLapse(airAt(0).pressurePa, airAt(0).tempK)).toBeCloseTo(1, 6);
    const hot = airAt(0, 25);
    expect(pistonPowerLapse(hot.pressurePa, hot.tempK)).toBeCloseTo(0.955, 3);
  });
  it('a fixed-pitch prop runs out of thrust in a dive instead of holding it past the table', () => {
    const at80 = engineThrust(DB.c172, 1, 80, sl, 0.24, 0);
    expect(engineThrust(DB.c172, 1, 100, sl, 0.3, 0)).toBeLessThan(at80 * 0.6);
    expect(engineThrust(DB.c172, 1, 130, sl, 0.38, 0)).toBeCloseTo(0, 6);
  });
  it('piston power answers the throttle almost at once, even from idle', () => {
    let n = 0, t = 0;
    const dt = 1 / 60;
    while (n < 0.95 && t < 5) { n = spoolEngine(DB.c172, n, 1, dt); t += dt; }
    expect(t).toBeLessThan(1);
  });
  it('at idle the windmilling prop is drag, growing with dynamic pressure', () => {
    expect(engineThrust(DB.c172, 0, 35, sl, 0.1, 750)).toBeLessThan(0);
    expect(engineThrust(DB.c172, 0, 50, sl, 0.15, 1500)).toBeLessThan(engineThrust(DB.c172, 0, 35, sl, 0.1, 750));
  });
});

describe('turbofan', () => {
  it('loses thrust with Mach (~18% by Mach 0.23) and with altitude', () => {
    const t0 = engineThrust(DB.b738, 1, 0, sl, 0, 0);
    expect(engineThrust(DB.b738, 1, 78, sl, 0.23, 0) / t0).toBeCloseTo(0.82, 1);
    expect(engineThrust(DB.b738, 1, 230, airAt(10668), 0.78, 0) / t0).toBeLessThan(0.3);
  });
  // 0116: σ^0.94 puts full thrust on CFM's max climb (26.5 kN per engine at FL350, Mach 0.8;
  // tests/flight/b738.test.js); below FL100 it costs only a few % against the old σ^0.7.
  it('lapses to ~22% of static thrust at FL350, Mach 0.8, and the same Mach lapse at any height', () => {
    const t0 = engineThrust(DB.b738, 1, 0, sl, 0, 0);
    const fl350 = airAt(35000 / 3.28084);
    expect(engineThrust(DB.b738, 1, 237, fl350, 0.8, 0) / t0).toBeCloseTo(0.221, 3);
    expect(engineThrust(DB.b738, 1, 0, airAt(600 / 3.28084), 0, 0) / t0).toBeCloseTo(0.984, 3);
    expect(engineThrust(DB.b738, 1, 0, fl350, 0, 0) / t0).toBeCloseTo(Math.pow(fl350.sigma, 0.94), 6);
  });
  it('idles at a few % of static thrust', () => {
    expect(engineThrust(DB.b738, 0, 0, sl, 0, 0) / DB.b738.engine.staticThrustN).toBeCloseTo(0.04, 3);
  });
  it('spools from idle to 95% thrust in 4–5.5 s (FAR 33.73: ≤ 5 s from flight idle)', () => {
    let n = 0, t = 0;
    const dt = 1 / 120;
    while (n < 0.95 && t < 20) { n = spoolEngine(DB.b738, n, 1, dt); t += dt; }
    expect(t).toBeGreaterThan(4);
    expect(t).toBeLessThan(5.5);
  });
  it('throttleForThrust inverts engineThrust', () => {
    const air = airAt(500);
    const want = engineThrust(DB.b738, 0.37, 72, air, 0.21, 3200);
    expect(throttleForThrust(DB.b738, want, 72, air, 0.21, 3200)).toBeCloseTo(0.37, 6);
  });
});

// 0135: the 737's max climb (CLB) rating, Bartel & Young (2008) eqs. 15-19 anchored to CFM's 26.5 kN
// per installed engine at FL350, Mach 0.8. Reference values computed by hand from the paper's equations
// (OpenAP's fits of its tables), ISA, at 290 KCAS (CAS at the top of climb: 271.9 kt).
describe('737 max climb thrust (0135)', () => {
  const b738 = DB.b738;
  const machAt290 = (ft) => {
    const a = airAt(ft / 3.28084);
    const qc = 101325 * (Math.pow(1 + 0.2 * Math.pow((290 * 0.514444) / 340.294, 2), 3.5) - 1);
    return Math.sqrt(5 * (Math.pow(qc / a.pressurePa + 1, 2 / 7) - 1));
  };
  const perEngine = (ft, mach) => maxClimbThrustN(b738, airAt(ft / 3.28084), mach) / 2;
  it('is CFM\'s 26.5 kN max climb per engine at FL350, Mach 0.8 (the anchor)', () => {
    // ±0.5%: capped at full throttle, which is the same CFM figure fitted to ~0.04% (0116).
    expect(Math.abs(perEngine(35000, 0.8) / 26500 - 1)).toBeLessThanOrEqual(0.005);
  });
  it('matches the paper\'s equations at 290 KCAS: 38.1 kN at FL200 (eq. 17), 53.3 kN at 5,000 ft (eq. 19)', () => {
    expect(perEngine(20000, machAt290(20000)) / 1000).toBeCloseTo(38.08, 1);
    expect(perEngine(5000, machAt290(5000)) / 1000).toBeCloseTo(53.27, 1);
  });
  it('is continuous at 10,000 ft and is never more than full throttle (the take-off rating) on the climb schedule', () => {
    expect(perEngine(10001, machAt290(10001)) / perEngine(9999, machAt290(9999))).toBeCloseTo(1, 2);
    for (let ft = 0; ft <= 41000; ft += 2500) {
      const a = airAt(ft / 3.28084), m = Math.min(0.78, machAt290(ft));
      expect(maxClimbThrustN(b738, a, m)).toBeLessThanOrEqual(engineThrust(b738, 1, m * a.speedOfSoundMps, a, m, 0));
    }
    // FL100-FL150, where the APD climb card sits: full throttle is 20-30% above CLB.
    const a = airAt(12500 / 3.28084), m = machAt290(12500);
    const ratio = engineThrust(b738, 1, m * a.speedOfSoundMps, a, m, 0) / maxClimbThrustN(b738, a, m);
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.3);
  });
  // Full throttle is the take-off rating: Bartel & Young eq. 11 (OpenAP's G0 fit of their Fig. 5, eqs.
  // 12-14), CFM56-7B26 117 kN static, bypass ratio 5.1 (CFM fact sheet), at FL125 on the 290 kt
  // schedule (Mach 0.548): 56.0 kN per engine; the model's full throttle there is 57.5 (+2.7%). A single
  // point, and eq. 11 is a take-off (low-Mach) fit: along the schedule the model is +4-8% FL050-FL200.
  it('full throttle at FL125, 290 KCAS is Bartel & Young\'s take-off lapse for a CFM56-7B26 (±3%)', () => {
    const a = airAt(12500 / 3.28084), M = machAt290(12500), bpr = 5.1;
    const dP = a.pressurePa / 101325, g0 = 0.0606 * bpr + 0.6337;
    const A = -0.4327 * dP ** 2 + 1.3855 * dP + 0.0472;
    const Z = 0.9106 * dP ** 3 - 1.7736 * dP ** 2 + 1.8697 * dP;
    const X = 0.1377 * dP ** 3 - 0.4374 * dP ** 2 + 1.3003 * dP;
    const lapse = A - (0.377 * (1 + bpr) / Math.sqrt((1 + 0.82 * bpr) * g0)) * Z * M + (0.23 + 0.19 * Math.sqrt(bpr)) * X * M * M;
    const full = engineThrust(b738, 1, M * a.speedOfSoundMps, a, M, 0) / 2;
    expect(Math.abs(full / (lapse * 117000) - 1)).toBeLessThanOrEqual(0.03);
  });
});
