import { describe, it, expect } from 'vitest';
import { engineThrust, spoolEngine, throttleForThrust, pistonPowerLapse } from '../../src/engine.js';
import { airAt } from '../../src/atmosphere.js';
import { AIRCRAFT_DATABASE as DB } from '../../src/aircraft.js';

const sl = airAt(0);

describe('piston prop', () => {
  it('measured static thrust at full throttle, and less at 120 kt than at rest', () => {
    expect(engineThrust(DB.c172, 1, 0, sl, 0, 0)).toBeCloseTo(2070, 0);
    expect(engineThrust(DB.c172, 1, 62, sl, 0.18, 2350)).toBeLessThan(engineThrust(DB.c172, 1, 0, sl, 0, 0));
  });
  it('power lapse: ~71% at 10,000 ft ISA, a hot day costs only a few %', () => {
    const a = airAt(3048);
    expect(pistonPowerLapse(a.pressurePa, a.tempK)).toBeCloseTo(0.713, 2);
    const hot = airAt(0, 25);
    expect(pistonPowerLapse(hot.pressurePa, hot.tempK)).toBeGreaterThan(0.95);
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
