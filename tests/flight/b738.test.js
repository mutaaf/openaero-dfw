// Flight test cards for the Boeing 737-800 (65 t). Fewer public numbers than the C172 POH,
// so these pin operational facts pilots know rather than chart values.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { trimThrottle } from '../../src/flightModel.js';
import { engineThrust } from '../../src/engine.js';
import { airAt } from '../../src/atmosphere.js';
import { liftCoefficient, dragCoefficient } from '../../src/aero.js';
import { trimAoaDeg } from '../../src/autopilot.js';

const b738 = AIRCRAFT_DATABASE.b738;
const vApp = (b738.vrefKts + 5) * 0.514444;

describe('Boeing 737-800', () => {
  it('flies a 3° final at Vref+5 on ~20–35% thrust (N1 ~55–60%), not near idle', () => {
    const thr = trimThrottle(b738, vApp, 2, -3, true, airAt(200));
    expect(thr).toBeGreaterThan(0.2);
    expect(thr).toBeLessThan(0.35);
  });

  it('landing configuration L/D is about 7–8', () => {
    const aoa = trimAoaDeg(b738, vApp, 2) * Math.PI / 180;
    const cl = liftCoefficient(b738, aoa, 2);
    const ld = cl / dragCoefficient(b738, cl, true, 2, 1);
    expect(ld).toBeGreaterThan(7);
    expect(ld).toBeLessThan(8.2);
  });

  it('at idle on the final it cannot hold the path without slowing down (drag > idle thrust)', () => {
    const air = airAt(200);
    const aoa = trimAoaDeg(b738, vApp, 2) * Math.PI / 180;
    const cl = liftCoefficient(b738, aoa, 2);
    const q = 0.5 * 1.225 * vApp * vApp;
    const drag = dragCoefficient(b738, cl, true, 2, 1) * q * b738.wingAreaM2;
    const along = engineThrust(b738, 0, vApp, air, vApp / 340, q) + b738.massKg * 9.80665 * Math.sin(3 * Math.PI / 180) - drag;
    expect(along).toBeLessThan(0);
  });
});
