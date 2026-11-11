import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { trimStep, trimSpeedKts, trimLimits, clampTrim, TRIM_SPEED_RATE, takeoffTrimAoaDeg } from '../../src/trim.js';
import { trimAoaDeg } from '../../src/autopilot.js';
import { stallAoaDeg } from '../../src/aero.js';
import { KTS_TO_MPS } from '../../src/constants.js';
import { trimDirection } from '../../src/input.js';
import { gamepadTargets } from '../../src/gamepad.js';

const c172 = AIRCRAFT_DATABASE.c172;
const b738 = AIRCRAFT_DATABASE.b738;

describe('pitch trim (ticket 0094)', () => {
  const kts = (spec, a, f = 0) => trimSpeedKts(spec, a, f);

  it('held, it moves the hands-off speed ~9% a second on any airframe, + = nose up (slower)', () => {
    for (const [spec, v, f] of [[c172, 80, 0], [b738, 250, 0], [b738, 150, 2]]) {
      const a = trimAoaDeg(spec, v * KTS_TO_MPS, f);
      const dt = 0.05;
      const up = kts(spec, trimStep(a, 1, dt, spec, f), f);
      const dn = kts(spec, trimStep(a, -1, dt, spec, f), f);
      expect((v - up) / v / dt).toBeCloseTo(TRIM_SPEED_RATE, 2);
      expect((dn - v) / v / dt).toBeCloseTo(TRIM_SPEED_RATE, 2);
    }
    expect(trimStep(3, 0, 0.5, c172, 0)).toBe(3);
  });

  it('stops: nose up 4° short of the stall, nose down at Vne / Vmo for the flaps set', () => {
    expect(trimLimits(c172, 0).max).toBeCloseTo(stallAoaDeg(c172, 0) - 4, 9);
    expect(kts(c172, trimLimits(c172, 0).min)).toBeCloseTo(163, 6);
    expect(kts(b738, trimLimits(b738, 0).min)).toBeCloseTo(340, 6);
    expect(kts(b738, trimLimits(b738, 3).min, 3)).toBeCloseTo(340, 6);
    let a = trimLimits(c172, 0).max - 0.1;
    for (let i = 0; i < 100; i++) a = trimStep(a, 1, 0.1, c172, 0);
    expect(a).toBeCloseTo(trimLimits(c172, 0).max, 9);
    for (let i = 0; i < 400; i++) a = trimStep(a, -1, 0.1, c172, 0);
    expect(a).toBeCloseTo(trimLimits(c172, 0).min, 9);
  });

  it('a stop never pulls the trim the other way', () => {
    const past = trimLimits(c172, 3).max + 0.5; // landing flaps lowered the stall angle
    expect(trimStep(past, 1, 1, c172, 3)).toBe(past);
    expect(trimStep(past, -1, 0.1, c172, 3)).toBeLessThan(past);
    const below = trimLimits(c172, 0).min - 1;
    expect(trimStep(below, -1, 1, c172, 0)).toBe(below);
    expect(clampTrim(past + 1, past, c172, 3)).toBe(past);
    expect(clampTrim(20, 3, c172, 0)).toBeCloseTo(trimLimits(c172, 0).max, 9);
  });

  it('the hands-off speed is the speed trimAoaDeg trims for', () => {
    for (const [spec, flaps, v] of [[c172, 0, 70], [c172, 0, 90], [c172, 0, 120], [c172, 3, 62], [b738, 2, 150]]) {
      expect(kts(spec, trimAoaDeg(spec, v * KTS_TO_MPS, flaps), flaps)).toBeCloseTo(v, 6);
    }
    expect(kts(c172, -6)).toBeNull();
  });

  it('trims the Cessna from 90 to 70 KIAS in under 3 s', () => {
    let a = trimAoaDeg(c172, 90 * KTS_TO_MPS, 0), t = 0;
    while (kts(c172, a) > 70) { a = trimStep(a, 1, 0.01, c172, 0); t += 0.01; }
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(3);
  });

  it('keys: [ and Numpad7 nose down, ] and Numpad1 nose up', () => {
    expect(trimDirection({})).toBe(0);
    expect(trimDirection({ BracketLeft: true })).toBe(-1);
    expect(trimDirection({ Numpad7: true })).toBe(-1);
    expect(trimDirection({ BracketRight: true })).toBe(1);
    expect(trimDirection({ Numpad1: true })).toBe(1);
    expect(trimDirection({ BracketLeft: true, BracketRight: true })).toBe(0);
  });

  it('gamepad: right stick forward trims nose down, back nose up, only on the standard mapping, and trimming alone does not take the stick', () => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const fwd = gamepadTargets([0, 0, 0, -1], buttons);
    expect(fwd.trim).toBe(-1);
    expect(fwd.active).toBe(false);
    expect(gamepadTargets([0, 0, 0, 1], buttons).trim).toBe(1);
    expect(gamepadTargets([0, 0, 0, 0.05], buttons).trim).toBe(0);
    // A flight stick's throttle slider resting at -1 on axis 3 must not run the trim.
    expect(gamepadTargets([0, 0, 0, -1], buttons, '').trim).toBe(0);
  });
});

describe('takeoff trim (ticket 0141)', () => {
  it('the Cessna\'s takeoff spawn trims for Vy 74 KIAS (POH) flaps up, and keeps 1.2 Vr with flaps set (0170)', () => {
    expect(c172.vyKts).toBe(74);
    expect(trimSpeedKts(c172, takeoffTrimAoaDeg(c172, 0), 0)).toBeCloseTo(74, 6);
    for (const f of [1, 2, 3]) expect(takeoffTrimAoaDeg(c172, f)).toBe(trimAoaDeg(c172, c172.vrKts * 0.617, f));
  });

  it('only the Cessna carries Vy: the jets keep their 1.2 Vr takeoff trim, bit for bit', () => {
    for (const [key, spec] of Object.entries(AIRCRAFT_DATABASE)) {
      if (key === 'c172') continue;
      expect(spec.vyKts).toBeUndefined();
      for (const f of [0, 1, 2]) expect(takeoffTrimAoaDeg(spec, f)).toBe(trimAoaDeg(spec, (spec.vrKtsByFlap?.[f] ?? spec.vrKts) * 0.617, f));
    }
    // The 737's flaps: 1.2 × that flap's Vr (0070): 174 kt at flaps 5, 162 at flaps 10 (as before 0070).
    const b738 = AIRCRAFT_DATABASE.b738;
    expect(Math.round(trimSpeedKts(b738, takeoffTrimAoaDeg(b738, 1), 1))).toBe(174);
    expect(Math.round(trimSpeedKts(b738, takeoffTrimAoaDeg(b738, 2), 2))).toBe(162);
    {
    }
  });
});
