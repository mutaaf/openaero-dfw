import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { flapNotch, flapTargetDeg, stepSystems, gearLocked, gearInTransit, reversedThrust, brakeMu } from '../../src/systems.js';
import { flapDeltaCl, stallAoaDeg, dragCoefficient, GEAR_CD, GEAR_DOORS_CD, isGearWarning } from '../../src/aero.js';
import { gradeLanding } from '../../src/landing.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';

const b738 = AIRCRAFT_DATABASE.b738, c172 = AIRCRAFT_DATABASE.c172;
const body = (o = {}) => ({ vel: new Vector3(), gearDown: true, flapsIndex: 2, throttle: 0, onGround: false, iasKts: 150, ...o });

describe('systems (hydraulics, brakes, reversers)', () => {
  it('maps flap angles to fractional notches', () => {
    expect(flapNotch([0, 10, 30, 40], 20)).toBeCloseTo(1.5);
    expect(flapNotch([0, 10, 30, 40], 40)).toBe(3);
    expect(flapNotch([0, 10, 30, 40], -1)).toBe(0);
  });
  it('interpolates lift, stall angle and drag between notches; whole notches are unchanged', () => {
    expect(flapDeltaCl(b738, 2)).toBe(b738.flapCl[2]);
    expect(flapDeltaCl(b738, 2.5)).toBeCloseTo((b738.flapCl[2] + b738.flapCl[3]) / 2);
    expect(stallAoaDeg(c172, 2.5)).toBeCloseTo((c172.alphaStallDegByFlap[2] + c172.alphaStallDegByFlap[3]) / 2);
    const clean = dragCoefficient(b738, 0, 0, 0, 1);
    expect(dragCoefficient(b738, 0, 1, 0, 1) - clean).toBeCloseTo(GEAR_CD);
    expect(dragCoefficient(b738, 0, 0.5, 0, 1) - clean).toBeCloseTo(GEAR_CD / 2 + GEAR_DOORS_CD);
    expect(dragCoefficient(b738, 0, true, 0, 1) - clean).toBeCloseTo(GEAR_CD);
  });
  it('starts the surfaces where the levers are, then moves them at their rates', () => {
    const b = body({ gearDown: false, flapsIndex: 0 });
    stepSystems(b, b738, 0.01);
    expect(gearLocked(b)).toBe(false);
    b.gearDown = true;
    stepSystems(b, b738, 5);
    expect(gearInTransit(b)).toBe(true);
    stepSystems(b, b738, 5);
    expect(gearLocked(b)).toBe(true);
    b.flapsIndex = 1;
    stepSystems(b, b738, 2);
    expect(b.flapDeg).toBeCloseTo(3);
  });
  it('fixed gear is always locked', () => {
    const b = body({ gearDown: false });
    stepSystems(b, c172, 0.01);
    expect(gearLocked(b)).toBe(true);
  });
  it('load relief: flaps 40 commanded above 162 kt go to 30', () => {
    expect(flapTargetDeg(b738, { flapsIndex: 3, iasKts: 165 })).toBe(30);
    expect(flapTargetDeg(b738, { flapsIndex: 3, iasKts: 150 })).toBe(40);
  });
  it('reversers deploy on the ground only, and turn thrust around at their effectiveness', () => {
    const b = body({ reverseCmd: true });
    stepSystems(b, b738, 0.01);
    stepSystems(b, b738, 3);
    expect(b.reverserPos).toBe(0); // in the air the command is dropped
    b.onGround = true; b.reverseCmd = true;
    stepSystems(b, b738, 3);
    expect(b.reverserPos).toBe(1);
    expect(reversedThrust(b738, 1000, 1)).toBeCloseTo(-350);
    expect(reversedThrust(c172, 1000, 1)).toBe(1000);
  });
  it('the autobrake disarms on the pedals or forward thrust', () => {
    const b = body({ onGround: true, autobrake: 3 });
    b.vel.set(0, 0, -60);
    stepSystems(b, b738, 0.01);
    stepSystems(b, b738, 0.5);
    expect(b.autobrakeActive).toBe(true);
    expect(b.brakePress).toBeGreaterThan(0.1);
    b.throttle = 0.5;
    stepSystems(b, b738, 0.01);
    expect(b.autobrake).toBe(0);
    expect(b.autobrakeActive).toBe(false);
  });
  it('brake friction runs from rolling to the anti-skid limit', () => {
    expect(brakeMu(b738, 0)).toBeCloseTo(0.03);
    expect(brakeMu(b738, 1)).toBeCloseTo(0.45);
  });
  it('GPWS "too low, gear" and a gear-up landing', () => {
    expect(isGearWarning(400, -700, false, false)).toBe(true);
    expect(isGearWarning(400, -700, true, false)).toBe(false);
    expect(isGearWarning(600, -700, false, false)).toBe(false);
    const g = gradeLanding({ vsFpm: -100, crossM: 0, pastThresholdM: 300, runwayLengthM: 3000, runwayWidthM: 45, pitchDeg: 3, bankDeg: 0, iasKts: 150, vrefKts: 150, gearLocked: false });
    expect(g.grade).toBe('CRASH');
  });
});
