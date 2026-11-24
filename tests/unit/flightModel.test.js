import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion, Euler } from 'three';
import { stepFlightModel, elevatorLiftCl } from '../../src/flightModel.js';
import { gearConstants, gearForces } from '../../src/gear.js';
import { fbwLoadLimit, fbwPushLimit } from '../../src/fbw.js';
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

// Ticket 0138: TP-1538 Fig. 62(b), the negative "g" limit (an increment on 1 g) against q̄: −1 g to
// ~1.55 kN/m², a straight line to −4 g at ~8.75 kN/m², flat above. As load factors: 0 g, then −3 g.
describe('F-16 push limit (TP-1538 Fig. 62(b))', () => {
  it('is 0 g (−1 g incremental) at low dynamic pressure, up to 1.55 kN/m²', () => {
    for (const q of [0, 800, 1550]) expect(fbwPushLimit(q)).toBeCloseTo(0, 6);
  });
  it('falls on a straight line to −3 g (−4 g incremental) at 8.75 kN/m²', () => {
    expect(fbwPushLimit(5150)).toBeCloseTo(-1.5, 6); // halfway
    expect(fbwPushLimit(4000)).toBeCloseTo(-3 * (4000 - 1550) / 7200, 6);
    expect(fbwPushLimit(8750)).toBeCloseTo(-3, 6);
  });
  it('is −3 g above that, at any speed (434 KEAS is ~30 kN/m²)', () => {
    for (const q of [10000, 30500, 60000]) expect(fbwPushLimit(q)).toBeCloseTo(-3, 6);
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

// Ticket 0214: Roskam's CLδe 0.43 on the elevator beyond the one that trims α, as our JSBSim C172 (0203).
describe('the elevator\'s lift beyond trim (C172, 0214)', () => {
  const c172 = AIRCRAFT_DATABASE.c172;
  const E = c172.elevatorAlphaDeg;
  it('only the C172 carries it', () => {
    expect(c172.clElevator).toBe(0.43);
    expect(AIRCRAFT_DATABASE.b738.clElevator).toBeUndefined();
    expect(AIRCRAFT_DATABASE.f16.clElevator).toBeUndefined();
  });
  it('trimmed, or holding any stick in a steady pre-stall flight, it adds nothing (the lift table is a trimmed fit)', () => {
    expect(elevatorLiftCl(c172, 0, 4, 4)).toBeCloseTo(0, 12);
    // The pitch law's steady α for a held stick s is trimα − s·E·η: the elevator there trims that α.
    for (const eta of [1, 0.8]) {
      const s172 = { ...c172, pitchBreak: { eta: (a, elev) => (elev < 0 ? eta : 1), breakDeg: () => 0 } };
      for (const [s, trim] of [[-0.3, 2], [0.1, 6]]) {
        const etaS = s < 0 ? eta : 1;
        expect(elevatorLiftCl(s172, s, trim, trim - s * E * etaS)).toBeCloseTo(0, 12);
      }
    }
  });
  it('full back stick costs lift as JSBSim\'s does: ~−0.2 CL at a rotation\'s α 1°, −0.11 to −0.18 past the stall', () => {
    expect(elevatorLiftCl(c172, -1, 2.9, 1)).toBeCloseTo(-0.2, 1);
    const past = elevatorLiftCl(c172, -1, 2.9, 19); // α held at the clean stall, 14.1°
    expect(past).toBeLessThan(-0.11);
    expect(past).toBeGreaterThan(-0.18);
    // Pushing adds lift; it is linear in the stick.
    expect(elevatorLiftCl(c172, 0.5, 4, 4)).toBeGreaterThan(0);
  });
});

// Ticket 0214: the tail's stiff contact (2.9e5 N/m on ~120 kg) is averaged over the step, so a tail that crosses
// into the runway during a step meets its force in that step. On a prescribed path the step's mean is exact at any
// sub-step (the old start-of-step read missed most of the first step); flown, it never adds energy (at 1/60 s it
// damps a little more than at 1/180 s: the physics panel's 1-DOF check, 0.13 vs 0.51 m/s of rebound).
describe('the tail contact is averaged over the step (C172, 0214)', () => {
  const c172 = AIRCRAFT_DATABASE.c172;
  const impulse = (dt) => {
    const b = {
      pos: new Vector3(), vel: new Vector3(0, -1.7, 0), angVel: new Vector3(), groundY: 0,
      quat: new Quaternion().setFromEuler(new Euler(20 * DEG_TO_RAD, 0, 0, 'YXZ')),
    };
    const tail = gearConstants(c172).wheels[3].clone().applyQuaternion(b.quat);
    b.pos.y = 0.013 - tail.y; // the tail 1.3 cm over the runway, coming down at 1.7 m/s (a rotation's)
    let J = 0;
    for (let i = Math.round(1 / 30 / dt); i > 0; i--) { // 1/30 s: two steps at 1/60 s
      gearForces(b, c172, new Vector3(), new Vector3(), dt);
      J += b.wheelLoads[3] * dt;
      b.pos.y += b.vel.y * dt;
    }
    return J;
  };
  it('on a prescribed path, the impulse at 1/60, 1/120 and 1/180 s is 1/6000 s\'s (within 3%)', () => {
    const ref = impulse(1 / 6000);
    console.log(`[tail] impulse over 1/30 s: 1/6000 s ${ref.toFixed(1)}, ${[60, 120, 180].map((hz) => `1/${hz} s ${impulse(1 / hz).toFixed(1)}`).join(', ')} N·s`);
    expect(ref).toBeGreaterThan(0);
    for (const hz of [60, 120, 180]) expect(Math.abs(impulse(1 / hz) - ref) / ref).toBeLessThan(0.03);
  });
});
