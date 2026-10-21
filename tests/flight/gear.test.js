// Landing gear on struts (gear.js, ticket 0074): flown headless. The airframe stands on its
// nose and main wheels with the weight shared by their positions, the nose comes down by
// itself after a mains-first touchdown, a wing-low touchdown lands on one main and rolls
// level, the pedals steer the nose wheel, and the nose can't be lifted at taxi speed.
import { describe, it, expect } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { gearConstants } from '../../src/gear.js';
import { DEG_TO_RAD, KTS_TO_MPS } from '../../src/constants.js';
import { makeBody, fly, attitude } from './harness.js';

const b738 = AIRCRAFT_DATABASE.b738, c172 = AIRCRAFT_DATABASE.c172;
const G = 9.80665;

function parked(spec) {
  const b = makeBody(spec);
  fly(b, spec, 5, (x) => { x.brakesOn = true; });
  return b;
}

describe('landing gear on struts', () => {
  for (const [name, spec, share] of [['737', b738, 0.094], ['C172', c172, 0.18]]) {
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
    let rate = 0;
    fly(b, b738, 4, (x) => { x.rudderInput = 1; rate = -x.angVel.y; }); // + = yaw right
    const expected = 10 * KTS_TO_MPS * Math.tan(7 * DEG_TO_RAD) / gearConstants(b738).wheelbase;
    expect(Math.abs(rate - expected) / expected).toBeLessThan(0.25);
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
});

