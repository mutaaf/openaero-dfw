import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion, Euler } from 'three';
import { radioAltitudeM } from '../../src/gear.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { DEG_TO_RAD, M_TO_FT, FT_TO_M } from '../../src/constants.js';

// Ticket 0122: the GPWS callouts read a radio altitude, the main wheels' height, not the CG's.
// Expected values from the geometry by hand: a main axle mainZ aft of the CG and
// gearHeight + strokeM below it (struts out in the air), pitched θ nose up, sits
// (gearHeight + strokeM)·cos θ + mainZ·sin θ below the CG.
const body = (cgOverGroundM, pitchDeg = 0, bankDeg = 0, groundY = -40) => ({
  pos: new Vector3(120, groundY + cgOverGroundM, -900),
  groundY,
  quat: new Quaternion().setFromEuler(new Euler(pitchDeg * DEG_TO_RAD, 0, -bankDeg * DEG_TO_RAD, 'YXZ')),
});
const below = (spec, pitchDeg) => {
  const h = spec.gearHeight + spec.gear.strokeM, t = pitchDeg * DEG_TO_RAD;
  return h * Math.cos(t) + spec.gear.mainZ * Math.sin(t);
};

describe('radio altitude at the main wheels (0122)', () => {
  for (const key of ['b738', 'c172', 'f16']) {
    const spec = AIRCRAFT_DATABASE[key];
    it(`${key}: 20 ft on the wheels at 0° and at 5° nose up`, () => {
      for (const pitch of [0, 5]) {
        const ra = radioAltitudeM(body(below(spec, pitch) + 20 * FT_TO_M, pitch), spec) * M_TO_FT;
        expect(ra, `${pitch}°`).toBeCloseTo(20, 1);
      }
    });
    it(`${key}: 0 the moment a main tyre touches, and 0 (not negative) on the runway`, () => {
      expect(radioAltitudeM(body(below(spec, 0)), spec)).toBeCloseTo(0, 6);
      expect(radioAltitudeM(body(spec.gearHeight), spec)).toBe(0); // static, struts in
    });
  }

  it('the 737 CG reads ~12 ft over the runway at touchdown; the wheels read 0', () => {
    const spec = AIRCRAFT_DATABASE.b738;
    const cg = below(spec, 5);
    expect(cg * M_TO_FT).toBeGreaterThan(11);
    expect(radioAltitudeM(body(cg, 5), spec)).toBeCloseTo(0, 6);
  });

  it('nose up lowers the mains; a bank lowers the low wing\'s main', () => {
    const spec = AIRCRAFT_DATABASE.b738;
    const level = radioAltitudeM(body(10), spec);
    expect(radioAltitudeM(body(10, 8), spec)).toBeLessThan(level);
    const banked = radioAltitudeM(body(10, 0, 10), spec);
    const h = spec.gearHeight + spec.gear.strokeM, s = spec.gear.trackM / 2, b = 10 * DEG_TO_RAD;
    expect(banked).toBeCloseTo(10 - (h * Math.cos(b) + s * Math.sin(b)), 6);
    expect(radioAltitudeM(body(10, 0, -10), spec)).toBeCloseTo(banked, 6);
  });

  it('without gear geometry: the CG height less gearHeight', () => {
    const spec = { gearHeight: 2 };
    expect(radioAltitudeM(body(12), spec)).toBeCloseTo(10, 6);
    expect(radioAltitudeM(body(1), spec)).toBe(0);
  });
});
