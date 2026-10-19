import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion, Euler } from 'three';
import { stepFlightModel } from '../../src/flightModel.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { dynamicPressure, liftCoefficient, dragCoefficient } from '../../src/aero.js';
import { DEG_TO_RAD } from '../../src/constants.js';

// No engine block: zero thrust at idle, so only the airframe's forces act.
const spec = { ...AIRCRAFT_DATABASE.c172, engine: undefined };

// Level flight path north at 35 m/s, nose up `aoaDeg`, no thrust, sea-level air, ground far below.
function bodyAt(aoaDeg) {
  return {
    pos: new Vector3(0, 0, 0), vel: new Vector3(0, 0, -35),
    quat: new Quaternion().setFromEuler(new Euler(aoaDeg * DEG_TO_RAD, 0, 0, 'YXZ')),
    angVel: new Vector3(), windVec: new Vector3(), groundY: -10000,
    elevInput: 0, aileronInput: 0, rudderInput: 0, throttle: 0,
    flapsIndex: 0, gearDown: true, brakesOn: false, apMaster: false,
  };
}

describe('flight model forces', () => {
  it('lift is perpendicular to the relative wind: along the path only drag acts', () => {
    const b = bodyAt(10);
    const dt = 1e-4;
    stepFlightModel(b, spec, dt);
    const alongForce = ((-b.vel.z) - 35) / dt * spec.massKg;
    const cl = liftCoefficient(spec, 10 * DEG_TO_RAD, 0);
    const drag = dragCoefficient(spec, cl, true, 0, 1) * dynamicPressure(35) * spec.wingAreaM2;
    expect(alongForce / -drag).toBeCloseTo(1, 2);
  });

  it('at 10° AoA the lift has no aft component (would be ~17% of lift in body axes)', () => {
    const b = bodyAt(10);
    const dt = 1e-4;
    stepFlightModel(b, spec, dt);
    const upForce = (b.vel.y / dt + 9.80665) * spec.massKg;
    const lift = liftCoefficient(spec, 10 * DEG_TO_RAD, 0) * dynamicPressure(35) * spec.wingAreaM2;
    expect(upForce / lift).toBeCloseTo(1, 2);
  });
});

describe('trimThrottle', () => {
  it('holds speed on the 3° path: the 737 final neither speeds up nor slows down', async () => {
    const { trimThrottle } = await import('../../src/flightModel.js');
    const { trimAoaDeg } = await import('../../src/autopilot.js');
    const b738 = AIRCRAFT_DATABASE.b738;
    const v = (b738.vrefKts + 5) * 0.514444, g = -3 * DEG_TO_RAD;
    const pitch = (trimAoaDeg(b738, v, 2) - 3) * DEG_TO_RAD;
    const b = {
      pos: new Vector3(0, 0, 0), vel: new Vector3(0, v * Math.sin(g), -v * Math.cos(g)),
      quat: new Quaternion().setFromEuler(new Euler(pitch, 0, 0, 'YXZ')),
      angVel: new Vector3(), windVec: new Vector3(), groundY: -10000,
      elevInput: 0, aileronInput: 0, rudderInput: 0, throttle: trimThrottle(b738, v, 2, -3),
      flapsIndex: 2, gearDown: true, brakesOn: false, apMaster: false,
    };
    const dt = 1e-4;
    stepFlightModel(b, b738, dt);
    const accel = (b.vel.length() - v) / dt;
    expect(Math.abs(accel)).toBeLessThan(0.05); // m/s²
    expect(b.throttle).toBeGreaterThan(0.05);
    expect(b.throttle).toBeLessThan(0.5);
  });
});
