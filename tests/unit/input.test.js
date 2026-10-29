import { describe, it, expect } from 'vitest';
import { pilotTargets, stickFromPoint } from '../../src/input.js';

describe('pilotTargets', () => {
  it('is neutral with no keys', () => {
    expect(pilotTargets({})).toEqual({ pitch: 0, roll: 0, yaw: 0 });
  });
  it('maps W/S and arrows to pitch (W = nose down)', () => {
    expect(pilotTargets({ KeyW: true }).pitch).toBe(1);
    expect(pilotTargets({ ArrowUp: true }).pitch).toBe(-1);
  });
  it('maps A/D to roll and Q/E to yaw', () => {
    expect(pilotTargets({ KeyA: true }).roll).toBe(-1);
    expect(pilotTargets({ ArrowRight: true }).roll).toBe(1);
    expect(pilotTargets({ KeyQ: true, KeyE: true }).yaw).toBe(0);
  });
});

describe('stickFromPoint', () => {
  const rect = { left: 100, top: 100, width: 96, height: 96 };
  it('centre is neutral', () => {
    expect(stickFromPoint(148, 148, rect)).toEqual({ x: 0, y: 0 });
  });
  it('clamps outside the pad', () => {
    expect(stickFromPoint(0, 1000, rect)).toEqual({ x: -1, y: 1 });
  });
});

import { combineTargets, throttleFromPoint, tillerRudder } from '../../src/input.js';

describe('combineTargets', () => {
  const kb = { pitch: 1, roll: -1, yaw: 0 };
  it('uses the keyboard when nothing else is active', () => {
    expect(combineTargets(kb, null, null)).toEqual({ pitch: 1, roll: -1, yaw: 0, source: 'keyboard' });
  });
  it('an active touch/drag stick wins over everything', () => {
    const stick = { x: 0.5, y: -0.25, active: true };
    const pad = { roll: 1, pitch: 1, yaw: 1, active: true };
    expect(combineTargets(kb, stick, pad)).toEqual({ pitch: -0.25, roll: 0.5, yaw: 1, source: 'stick' });
  });
  it('a deflected gamepad wins over the keyboard', () => {
    const pad = { roll: 0.3, pitch: -0.4, yaw: 0.1, active: true };
    expect(combineTargets(kb, { x: 0, y: 0, active: false }, pad)).toEqual({ pitch: -0.4, roll: 0.3, yaw: 0.1, source: 'gamepad' });
  });
  it('keyboard yaw still works while the touch stick is held', () => {
    expect(combineTargets({ pitch: 0, roll: 0, yaw: -1 }, { x: 0.2, y: 0.1, active: true }, null).yaw).toBe(-1);
  });
});

describe('throttleFromPoint', () => {
  const rect = { top: 100, height: 200 };
  it('top of the track is full power, bottom is idle', () => {
    expect(throttleFromPoint(100, rect)).toBe(1);
    expect(throttleFromPoint(300, rect)).toBe(0);
    expect(throttleFromPoint(200, rect)).toBeCloseTo(0.5);
  });
  it('clamps outside the track', () => {
    expect(throttleFromPoint(0, rect)).toBe(1);
    expect(throttleFromPoint(999, rect)).toBe(0);
  });
});

// Ticket 0110: Pilot's touch tiller on the runway.
describe('tillerRudder', () => {
  const wb = 1.651, steer = 10; // C172 (aircraft.js gear)
  it('a thumb resting near the centre of the pad does not steer', () => {
    expect(tillerRudder(0.2, 5, wb, steer)).toBe(0);
    expect(tillerRudder(-0.25, 5, wb, steer)).toBe(-0);
  });
  it('full nose wheel at walking pace, either way', () => {
    expect(tillerRudder(1, 1, wb, steer)).toBe(1);
    expect(tillerRudder(-1, 1, wb, steer)).toBe(-1);
  });
  it('on the roll full stick turns no faster than 8°/s (v·tan δ / wheelbase)', () => {
    for (const gs of [10, 25, 70]) {
      const rud = tillerRudder(1, gs, wb, steer);
      const rateDegS = gs * Math.tan(rud * steer * Math.PI / 180) / wb * 180 / Math.PI;
      expect(rateDegS).toBeLessThanOrEqual(8.05);
      expect(rateDegS).toBeGreaterThan(7);
    }
  });
});
