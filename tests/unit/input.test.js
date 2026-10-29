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

import { combineTargets, throttleFromPoint } from '../../src/input.js';

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
  it('on the ground the stick sideways steers the nose wheel (touch has no pedals, 0110); never in the air', () => {
    const none = { pitch: 0, roll: 0, yaw: 0 };
    expect(combineTargets(none, { x: 0.6, y: 0, active: true }, null, true).yaw).toBe(0.6);
    expect(combineTargets(none, { x: -1, y: 0, active: true }, null, true).yaw).toBe(-1);
    expect(combineTargets(none, { x: 0.6, y: 0, active: true }, null, false).yaw).toBe(0);
    // a thumb pulling back for the rotation, a little off centre, does not steer
    expect(combineTargets(none, { x: 0.08, y: -1, active: true }, null, true).yaw).toBe(0);
    // the keys or a gamepad's rudder win over the tiller
    expect(combineTargets({ pitch: 0, roll: 0, yaw: -1 }, { x: 0.6, y: 0, active: true }, null, true).yaw).toBe(-1);
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
