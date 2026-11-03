import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion, Euler } from 'three';
import { stepFlightModel } from '../../src/flightModel.js';
import { fbwLoadLimit } from '../../src/fbw.js';
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

describe('ground spoilers (737)', () => {
  const b738 = AIRCRAFT_DATABASE.b738;
  // Rolling north at 140 kt on flat ground, wings level, flaps 30.
  const rolling = (throttle) => ({
    pos: new Vector3(0, b738.gearHeight, 0), vel: new Vector3(0, 0, -72),
    quat: new Quaternion(), angVel: new Vector3(), windVec: new Vector3(), groundY: 0,
    elevInput: 0, aileronInput: 0, rudderInput: 0, throttle, engineN: 0,
    flapsIndex: 2, gearDown: true, brakesOn: true, apMaster: false, onGround: true,
  });
  const run = (b, s) => { for (let i = 0; i < s * 120; i++) stepFlightModel(b, b738, 1 / 120); return b; };

  it('deploy over ~1 s on the ground at idle and brake harder than with the wing lifting', () => {
    const b = run(rolling(0), 0.5);
    expect(b.spoilers).toBeCloseTo(0.5, 1);
    const withSp = run(rolling(0), 3), without = rolling(0);
    for (let i = 0; i < 360; i++) stepFlightModel(without, { ...b738, groundSpoilers: undefined }, 1 / 120);
    expect(withSp.spoilers).toBe(1);
    expect(-withSp.vel.z).toBeLessThan(-without.vel.z - 2); // m/s slower after 3 s
  });

  it('stay in with thrust (takeoff) and stow when the levers are advanced', () => {
    expect(run(rolling(1), 1).spoilers).toBe(0);
    const b = run(rolling(0), 2);
    b.throttle = 1;
    expect(run(b, 1.1).spoilers).toBe(0);
  });

  it('never deploy in the air', () => {
    const b = rolling(0);
    b.pos.y = 300; b.groundY = 0; b.onGround = false;
    expect(run(b, 1).spoilers).toBe(0);
  });
});

describe('ground spoilers dump lift at every flap setting', () => {
  const b738 = AIRCRAFT_DATABASE.b738;
  // Upward aero force at 140 kt, nose level, with the spoilers held at `spoilers` (onGround
  // keeps them deploying; 100 m up, so no gear force), as a share of the same without.
  const lift = (flapsIndex, spoilers) => {
    const b = {
      pos: new Vector3(0, 100, 0), vel: new Vector3(0, 0, -72), quat: new Quaternion(), angVel: new Vector3(),
      windVec: new Vector3(), groundY: 0, elevInput: 0, aileronInput: 0, rudderInput: 0, throttle: 0, engineN: 0,
      flapsIndex, gearDown: true, brakesOn: false, apMaster: false, onGround: true, spoilers,
    };
    stepFlightModel(b, b738, 1e-4);
    return (b.vel.y / 1e-4 + 9.80665) * b738.massKg;
  };
  it('leaves the same small share of lift (never downforce) at flaps 0, 30 and 40', () => {
    for (const f of [0, 2, 3]) {
      const share = lift(f, 1) / lift(f, 0);
      expect(share).toBeGreaterThan(0.1);
      expect(share).toBeLessThan(0.3);
    }
  });
});

// Ticket 0121: NASA TP-1538 App. A and Fig. 63, the F-16's maximum commandable normal acceleration:
// 8 g incremental (9 g) to α 15°, less 0.322 g/deg to 20.4°, less 1.322 g/deg above, so 1 g at ~25°.
describe('F-16 g and AoA limiter (TP-1538 Fig. 63)', () => {
  it('is 9 g up to 15° AoA', () => {
    for (const a of [-5, 0, 10, 15]) expect(fbwLoadLimit(a)).toBeCloseTo(9, 6);
  });
  it('falls 0.322 g/deg from 15° to 20.4° (7.26 g there)', () => {
    expect(fbwLoadLimit(20.4)).toBeCloseTo(9 - 0.322 * 5.4, 6);
    expect(fbwLoadLimit(18)).toBeCloseTo(9 - 0.322 * 3, 6);
  });
  it('falls 1.322 g/deg above 20.4° and reaches 1 g near 25° (TP-1538: "approximately 25°")', () => {
    expect(fbwLoadLimit(22)).toBeCloseTo(9 - 0.322 * 5.4 - 1.322 * 1.6, 6);
    const a1g = 20.4 + (8 - 0.322 * 5.4) / 1.322;
    expect(fbwLoadLimit(a1g)).toBeCloseTo(1, 6);
    expect(a1g).toBeGreaterThan(24.5);
    expect(a1g).toBeLessThan(25.5);
  });
});

describe('seat load factor (body.loadFactor, the HUD G)', () => {
  it('reads the aero force along the body up axis over the weight (gravity itself is not felt)', () => {
    // Level flight path, nose 5° up, wings level, no thrust: lift and drag's components on the
    // body's up axis, over the weight.
    const b = bodyAt(5);
    stepFlightModel(b, spec, 1 / 120);
    const lift = liftCoefficient(spec, 5 * DEG_TO_RAD, 0) * dynamicPressure(35) * spec.wingAreaM2;
    expect(b.loadFactor).toBeCloseTo((lift * Math.cos(5 * DEG_TO_RAD) + dragCoefficient(spec, liftCoefficient(spec, 5 * DEG_TO_RAD, 0), true, 0, 1, 0) * dynamicPressure(35) * spec.wingAreaM2 * Math.sin(5 * DEG_TO_RAD)) / (spec.massKg * 9.80665), 2);
  });
});
