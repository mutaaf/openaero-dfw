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
