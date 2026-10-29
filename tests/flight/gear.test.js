// Landing gear on struts (gear.js, ticket 0074): flown headless. The airframe stands on its
// nose and main wheels with the weight shared by their positions, the nose comes down by
// itself after a mains-first touchdown, a wing-low touchdown lands on one main and rolls
// level, the pedals steer the nose wheel, and the nose can't be lifted at taxi speed.
// Ticket 0082: the tyres' friction acts at the axles, below the CG, so braking loads the nose
// wheel; the brakes are on the mains only; the C172's mains sit at their POH weighing arm.
import { describe, it, expect } from 'vitest';
import { Euler, Vector3 } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { gearConstants, gearForces, gearFriction } from '../../src/gear.js';
import { DEG_TO_RAD, KTS_TO_MPS } from '../../src/constants.js';
import { makeBody, fly, attitude } from './harness.js';
import { surfaceWindFactor } from '../../src/weather.js';

const b738 = AIRCRAFT_DATABASE.b738, c172 = AIRCRAFT_DATABASE.c172, f16 = AIRCRAFT_DATABASE.f16;
const G = 9.80665;

function parked(spec) {
  const b = makeBody(spec);
  fly(b, spec, 5, (x) => { x.brakesOn = true; });
  return b;
}

describe('landing gear on struts', () => {
  for (const [name, spec, share] of [['737', b738, 0.094], ['C172', c172, 0.265]]) {
    it(`${name}: parked level at gearHeight, the nose carrying ~${Math.round(share * 100)}% of the weight`, () => {
      const b = parked(spec);
      expect(Math.abs(b.pos.y - spec.gearHeight)).toBeLessThan(0.02);
      expect(Math.abs(attitude(b).pitchDeg)).toBeLessThan(0.3);
      const total = b.wheelLoads.reduce((a, l) => a + l, 0);
      expect(total / (spec.massKg * G)).toBeCloseTo(1, 1);
      expect(b.wheelLoads[0] / total).toBeCloseTo(gearConstants(spec).noseShare, 2);
      expect(Math.abs(b.wheelLoads[0] / total - share)).toBeLessThan(0.02);
    });
  }

  it('737: after a mains-first touchdown at 5° nose-up, the nose comes down by itself with the stick neutral', () => {
    const v = 140 * KTS_TO_MPS;
    const b = makeBody(b738, { kts: 140, altM: b738.gearHeight + 1.5, flaps: 2 });
    b.quat.setFromEuler(new Euler(5 * DEG_TO_RAD, 0, 0, 'YXZ'));
    b.vel.set(0, -1, -v);
    b.throttle = 0; b.apMaster = false;
    let mainsFirst = null, noseDownS = null;
    fly(b, b738, 20, (x) => { x.elevInput = 0; x.autobrake = 3; }, (x) => {
      if (mainsFirst === null && x.onGround) mainsFirst = x.wheelLoads[1] > 0 && x.wheelLoads[0] === 0;
      if (noseDownS === null && x.wheelLoads?.[0] > 0) noseDownS = x.t;
      return noseDownS !== null;
    });
    expect(mainsFirst).toBe(true);
    expect(noseDownS).not.toBeNull();
    expect(noseDownS).toBeLessThan(10);
  });

  it('737: a wing-low touchdown lands on one main and rolls level', () => {
    const v = 140 * KTS_TO_MPS;
    const b = makeBody(b738, { kts: 140, altM: b738.gearHeight + 1, flaps: 2 });
    // 3° right wing low (roll right = negative z rotation in three.js), 4° nose up.
    b.quat.setFromEuler(new Euler(4 * DEG_TO_RAD, 0, -3 * DEG_TO_RAD, 'YXZ'));
    b.vel.set(0, -1, -v);
    b.throttle = 0; b.apMaster = false;
    let first = null;
    fly(b, b738, 6, (x) => { x.elevInput = 0; x.aileronInput = 0; }, (x) => {
      if (first === null && x.onGround) first = x.wheelLoads.map((l) => l > 0);
      return false;
    });
    expect(first).toEqual([false, false, true]); // right main only
    expect(Math.abs(attitude(b).bankRightDeg)).toBeLessThan(0.5);
  });

  it('737: the pedals steer the nose wheel: full rudder at 10 kt turns at v·tan 7° / wheelbase', () => {
    const b = parked(b738);
    b.brakesOn = false;
    b.vel.set(0, 0, -10 * KTS_TO_MPS);
    b.throttle = 0.05;
    let rate = 0, along = 0;
    fly(b, b738, 4, (x) => { x.rudderInput = 1; rate = -x.angVel.y; along = x.vAlongMps; }); // + = yaw right
    // At the speed it is rolling (it slows from 10 kt at idle as the brakes release): the loaded
    // nose wheel holds its steered rate (0110), where the old soft blend lagged it by ~25%.
    const expected = along * Math.tan(7 * DEG_TO_RAD) / gearConstants(b738).wheelbase;
    expect(along).toBeGreaterThan(5 * KTS_TO_MPS);
    expect(Math.abs(rate - expected) / expected).toBeLessThan(0.05);
  });

  it('737: full back stick at 60 kt does not lift the nose wheel', () => {
    const b = parked(b738);
    b.brakesOn = false;
    b.vel.set(0, 0, -60 * KTS_TO_MPS);
    b.throttle = 0.6;
    fly(b, b738, 3, (x) => { x.elevInput = -1; });
    expect(b.wheelLoads[0]).toBeGreaterThan(0);
    expect(attitude(b).pitchDeg).toBeLessThan(0.5);
  });

  // From the three-wheel attitude at 50 kt, flaps up, idle: the POH's short-field rollout.
  function rollout(spec, { brakes, elev, s = 30 }) {
    const b = parked(spec);
    b.brakesOn = brakes;
    b.vel.set(0, 0, -50 * KTS_TO_MPS);
    b.throttle = 0;
    let maxPitch = -90, minNose = Infinity, noseSum = 0, n = 0;
    fly(b, spec, s, (x) => { x.elevInput = elev; x.brakesOn = brakes; }, (x) => {
      if (Math.hypot(x.vel.x, x.vel.z) < 0.3) return true;
      maxPitch = Math.max(maxPitch, attitude(x).pitchDeg);
      minNose = Math.min(minNose, x.wheelLoads[0]);
      noseSum += x.wheelLoads[0]; n++;
      return false;
    });
    return { b, maxPitch, minNose, meanNose: noseSum / n };
  }

  it('C172: hard braking with the wheel full back keeps the nose wheel on the runway to the stop', () => {
    const r = rollout(c172, { brakes: true, elev: -1 });
    expect(Math.hypot(r.b.vel.x, r.b.vel.z)).toBeLessThan(0.3);
    expect(r.minNose).toBeGreaterThan(0);
    expect(r.maxPitch).toBeLessThanOrEqual(1);
  });

  it('C172: braking moves load onto the nose wheel (the tyres pull below the CG)', () => {
    const braking = rollout(c172, { brakes: true, elev: 0, s: 3 });
    const rolling = rollout(c172, { brakes: false, elev: 0, s: 3 });
    expect(braking.meanNose).toBeGreaterThan(rolling.meanNose * 1.3);
  });

  it('C172: the brakes are on the mains only: braking on the nose wheel alone does nothing more than rolling', () => {
    const lifted = (brakes) => {
      // Only the nose wheel touches: 15 cm above the parked height, pitched 6° nose down.
      const b = makeBody(c172, { kts: 30, altM: c172.gearHeight + 0.1 });
      b.quat.setFromEuler(new Euler(-6 * DEG_TO_RAD, 0, 0, 'YXZ'));
      b.vel.set(0, 0, -30 * KTS_TO_MPS);
      b.throttle = 0; b.apMaster = false; b.brakesOn = brakes; b.brakePress = brakes ? 1 : 0;
      const f = new Vector3(), m = new Vector3();
      gearForces(b, c172, f, m);
      expect(b.wheelLoads[0]).toBeGreaterThan(0);
      expect(b.wheelLoads[1] + b.wheelLoads[2]).toBe(0);
      const fric = new Vector3(), fm = new Vector3();
      gearFriction(b, c172, new Vector3(0, 0, -1), 30 * KTS_TO_MPS, fric, fm);
      return fric.length();
    };
    expect(lifted(true)).toBeCloseTo(lifted(false), 6);
    expect(lifted(false)).toBeGreaterThan(0);
  });

  it('C172: after a mains-first touchdown at 11° nose-up (a tail-low flare), the nose comes down by itself with the stick neutral', () => {
    const b = makeBody(c172, { kts: 50, altM: c172.gearHeight + 0.6, flaps: 3, throttle: 0 });
    b.quat.setFromEuler(new Euler(11 * DEG_TO_RAD, 0, 0, 'YXZ'));
    b.vel.set(0, -0.5, -50 * KTS_TO_MPS);
    b.apMaster = false;
    let td = null, noseDownS = null;
    fly(b, c172, 15, (x) => { x.elevInput = 0; x.throttle = 0; }, (x) => {
      if (td === null && x.onGround) td = x.t;
      if (noseDownS === null && x.wheelLoads?.[0] > 0) noseDownS = x.t;
      return noseDownS !== null;
    });
    expect(td).not.toBeNull();
    expect(noseDownS).not.toBeNull();
    expect(noseDownS - td).toBeLessThan(5);
  });

  it('F-16: full braking from 120 kt dips the nose but does not bottom it onto the pitch floor', () => {
    const b = parked(f16);
    b.vel.set(0, 0, -120 * KTS_TO_MPS);
    b.throttle = 0;
    let minPitch = 90;
    fly(b, f16, 40, (x) => { x.brakesOn = true; x.throttle = 0; }, (x) => {
      minPitch = Math.min(minPitch, attitude(x).pitchDeg);
      return Math.hypot(x.vel.x, x.vel.z) < 0.3;
    });
    expect(minPitch).toBeLessThan(-1); // the brakes do load the nose
    expect(minPitch).toBeGreaterThan(-5); // the floor is -6.9°
  });
});

// Ticket 0106: the METAR's wind now reaches the runway (the log law at the CG's height, not a
// fade to zero on the wheels), so a parked airplane holds still on its tyres' friction (gear.js),
// not on calm air. A 25 kt crosswind (and a 25 kt tailwind) for 30 s, brakes set, idle.
describe('parked in a 25 kt METAR wind with the brakes set (ticket 0106)', () => {
  for (const [name, spec] of [['C172', c172], ['737', b738], ['F-16', f16]]) {
    for (const [what, wx, wz] of [['crosswind', -1, 0], ['tailwind', 0, -1]]) {
      it(`${name}: a 25 kt ${what} moves it less than 0.3 m and turns it less than 2°`, () => {
        const b = parked(spec);
        const x0 = b.pos.x, z0 = b.pos.z;
        const hdg0 = attitude(b);
        const e = new Euler().setFromQuaternion(b.quat, 'YXZ'), yaw0 = e.y;
        fly(b, spec, 30, (x) => {
          x.brakesOn = true;
          x.throttle = 0;
          const k = 25 * KTS_TO_MPS * surfaceWindFactor(x.pos.y - x.groundY);
          x.windVec.set(wx * k, 0, wz * k);
        });
        e.setFromQuaternion(b.quat, 'YXZ');
        expect(Math.hypot(b.pos.x - x0, b.pos.z - z0)).toBeLessThan(0.3);
        expect(Math.abs(e.y - yaw0) / DEG_TO_RAD).toBeLessThan(2);
        expect(Math.abs(attitude(b).bankRightDeg - hdg0.bankRightDeg)).toBeLessThan(2);
        expect(b.wheelLoads.every((l) => l > 0)).toBe(true);
      });
    }
  }
});
