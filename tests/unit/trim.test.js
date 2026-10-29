import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { trimStep, trimSpeedKts, trimMaxDeg, TRIM_MIN_DEG, TRIM_RATE_DEG_S } from '../../src/trim.js';
import { trimAoaDeg } from '../../src/autopilot.js';
import { stallAoaDeg } from '../../src/aero.js';
import { KTS_TO_MPS } from '../../src/constants.js';
import { trimDirection } from '../../src/input.js';
import { gamepadTargets } from '../../src/gamepad.js';

const c172 = AIRCRAFT_DATABASE.c172;
const b738 = AIRCRAFT_DATABASE.b738;

describe('pitch trim (ticket 0094)', () => {
  it('moves the trim angle at its rate, + = nose up', () => {
    expect(trimStep(3, 1, 0.5, c172, 0)).toBeCloseTo(3 + TRIM_RATE_DEG_S * 0.5, 9);
    expect(trimStep(3, -1, 0.5, c172, 0)).toBeCloseTo(3 - TRIM_RATE_DEG_S * 0.5, 9);
    expect(trimStep(3, 0, 0.5, c172, 0)).toBe(3);
  });

  it('stops 4° short of the stall and at the nose-down stop', () => {
    expect(trimMaxDeg(c172, 0)).toBeCloseTo(stallAoaDeg(c172, 0) - 4, 9);
    expect(trimStep(trimMaxDeg(c172, 0) - 0.1, 1, 1, c172, 0)).toBeCloseTo(trimMaxDeg(c172, 0), 9);
    expect(trimStep(TRIM_MIN_DEG + 0.1, -1, 1, c172, 0)).toBe(TRIM_MIN_DEG);
  });

  it('a stop never pulls the trim the other way', () => {
    const past = trimMaxDeg(c172, 3) + 0.5; // landing flaps lowered the stall angle
    expect(trimStep(past, 1, 1, c172, 3)).toBe(past);
    expect(trimStep(past, -1, 0.1, c172, 3)).toBeCloseTo(past - 0.15, 9);
    expect(trimStep(TRIM_MIN_DEG - 1, -1, 1, c172, 0)).toBe(TRIM_MIN_DEG - 1);
  });

  it('the hands-off speed is the speed trimAoaDeg trims for', () => {
    for (const [spec, flaps, kts] of [[c172, 0, 70], [c172, 0, 90], [c172, 0, 120], [c172, 3, 62], [b738, 2, 150]]) {
      expect(trimSpeedKts(spec, trimAoaDeg(spec, kts * KTS_TO_MPS, flaps), flaps)).toBeCloseTo(kts, 6);
    }
  });

  it('trims the Cessna from 90 to 70 KIAS in under 3 s, and its nose-down stop is short of Vne 163', () => {
    const s = (trimAoaDeg(c172, 70 * KTS_TO_MPS, 0) - trimAoaDeg(c172, 90 * KTS_TO_MPS, 0)) / TRIM_RATE_DEG_S;
    expect(s).toBeGreaterThan(1.5);
    expect(s).toBeLessThan(3);
    expect(trimSpeedKts(c172, TRIM_MIN_DEG, 0)).toBeLessThan(163);
    expect(trimSpeedKts(c172, TRIM_MIN_DEG, 0)).toBeGreaterThan(140);
  });

  it('no lift, no hands-off speed', () => {
    expect(trimSpeedKts(c172, -6, 0)).toBeNull();
  });

  it('keys: [ and Numpad7 nose down, ] and Numpad1 nose up', () => {
    expect(trimDirection({})).toBe(0);
    expect(trimDirection({ BracketLeft: true })).toBe(-1);
    expect(trimDirection({ Numpad7: true })).toBe(-1);
    expect(trimDirection({ BracketRight: true })).toBe(1);
    expect(trimDirection({ Numpad1: true })).toBe(1);
    expect(trimDirection({ BracketLeft: true, BracketRight: true })).toBe(0);
  });

  it('gamepad: right stick forward trims nose down, back nose up, and trimming alone does not take the stick', () => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const fwd = gamepadTargets([0, 0, 0, -1], buttons);
    expect(fwd.trim).toBe(-1);
    expect(fwd.active).toBe(false);
    expect(gamepadTargets([0, 0, 0, 1], buttons).trim).toBe(1);
    expect(gamepadTargets([0, 0, 0, 0.05], buttons).trim).toBe(0);
  });
});
