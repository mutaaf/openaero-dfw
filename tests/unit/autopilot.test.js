import { describe, it, expect } from 'vitest';
import {
  localizerInterceptDeg, bankCommandForHeading, aileronForBank, glidepathGammaDeg,
  flareSinkMps, elevatorForPitch, throttleForSpeed, sideslipYawAccel, trimAoaDeg,
} from '../../src/autopilot.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';

// Sign conventions (see AGENTS.md): aileron + = roll right, elevator + = nose down,
// bank/roll rate "right" positive, pitch/pitch rate "up" positive, cross-track + = right.
describe('lateral laws', () => {
  it('right of the centreline → intercept to the left', () => {
    expect(localizerInterceptDeg(50)).toBeLessThan(0);
    expect(localizerInterceptDeg(-50)).toBeGreaterThan(0);
    expect(Math.abs(localizerInterceptDeg(5000))).toBeLessThanOrEqual(25);
  });
  it('heading error to the right → bank right, capped at 25°', () => {
    expect(bankCommandForHeading(10)).toBeGreaterThan(0);
    expect(bankCommandForHeading(-90)).toBe(-25);
  });
  it('need more right bank → right aileron; rolling right already → less', () => {
    expect(aileronForBank(20, 0, 0)).toBeGreaterThan(0);
    expect(aileronForBank(5, 0, 0.5)).toBeLessThan(aileronForBank(5, 0, 0));
    expect(Math.abs(aileronForBank(180, -180, 0))).toBeLessThanOrEqual(0.6);
  });
});

describe('vertical laws', () => {
  it('above the glidepath → steeper flight path, never a climb', () => {
    expect(glidepathGammaDeg(30)).toBeLessThan(-3);
    expect(glidepathGammaDeg(-30)).toBeGreaterThan(-3);
    expect(glidepathGammaDeg(-500)).toBeLessThan(0);
  });
  it('a standing offset above the path builds a steeper command over time (integral)', () => {
    expect(glidepathGammaDeg(2, 50)).toBeLessThan(glidepathGammaDeg(2, 0));
    expect(glidepathGammaDeg(-2, -50)).toBeGreaterThan(glidepathGammaDeg(-2, 0));
    expect(glidepathGammaDeg(0, -1e6)).toBeLessThan(0);
  });
  it('flare: sink rate shrinks as the wheels near the runway', () => {
    expect(flareSinkMps(12)).toBeLessThan(flareSinkMps(3));
    expect(flareSinkMps(0)).toBeLessThan(0);
  });
  it('nose above the command → elevator nose-down (positive)', () => {
    expect(elevatorForPitch(0, 10, 0)).toBeGreaterThan(0);
    expect(elevatorForPitch(10, 0, 0)).toBeLessThan(0);
    // pitching up fast adds nose-down damping
    expect(elevatorForPitch(0, 0, 0.3)).toBeGreaterThan(0);
  });
  it('slow → more throttle, fast → less, always within 0..1', () => {
    expect(throttleForSpeed(120, 140, 0.4, 0.1)).toBeGreaterThan(0.4);
    expect(throttleForSpeed(160, 140, 0.4, 0.1)).toBeLessThan(0.4);
    expect(throttleForSpeed(10, 140, 0.99, 10)).toBeLessThanOrEqual(1);
  });
  it('autothrottle leads the speed trend: accelerating → less throttle than steady', () => {
    // On speed but gaining 2 kt/s: pull power now, before the overshoot (ticket 0016).
    expect(throttleForSpeed(140, 140, 0.5, 0.1, 2)).toBeLessThan(0.5);
    expect(throttleForSpeed(140, 140, 0.5, 0.1, -2)).toBeGreaterThan(0.5);
    expect(throttleForSpeed(140, 140, 0.5, 0.1)).toBe(0.5);
  });
});

describe('directional stability', () => {
  it('drifting right (v > 0) yaws the nose right (negative body yaw accel)', () => {
    expect(sideslipYawAccel(0.1)).toBeLessThan(0);
    expect(sideslipYawAccel(-0.1)).toBeGreaterThan(0);
  });
});

describe('trimAoaDeg', () => {
  it('737 at Vref+5 with flaps 25 trims at ~5° AoA', () => {
    const s = AIRCRAFT_DATABASE.b738;
    const a = trimAoaDeg(s, (s.vrefKts + 5) * 0.514444, 2);
    expect(a).toBeGreaterThan(4);
    expect(a).toBeLessThan(6);
  });
  it('faster needs less AoA', () => {
    const s = AIRCRAFT_DATABASE.b738;
    expect(trimAoaDeg(s, 100, 2)).toBeLessThan(trimAoaDeg(s, 70, 2));
  });
});

import { autothrottleCommand } from '../../src/autopilot.js';
describe('autothrottle with feed-forward', () => {
  it('on speed and steady it flies the feed-forward throttle', () => {
    expect(autothrottleCommand(0.3, { trim: 0 }, 141, 141, 0, 0.01)).toBeCloseTo(0.3, 6);
  });
  it('slow → more power, fast → less, accelerating → less (leads the change)', () => {
    expect(autothrottleCommand(0.3, { trim: 0 }, 135, 141, 0, 0.01)).toBeGreaterThan(0.3);
    expect(autothrottleCommand(0.3, { trim: 0 }, 147, 141, 0, 0.01)).toBeLessThan(0.3);
    expect(autothrottleCommand(0.3, { trim: 0 }, 141, 141, 1, 0.01)).toBeLessThan(0.3);
  });
  it('the integral soaks up a steady error, bounded', () => {
    const st = { trim: 0 };
    for (let i = 0; i < 1000000; i++) autothrottleCommand(0.3, st, 131, 141, 0, 0.01);
    expect(st.trim).toBeCloseTo(0.3, 6);
  });
});
