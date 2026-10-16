import { describe, it, expect } from 'vitest';
import { shapeAxis, gamepadTargets, buttonEdges } from '../../src/gamepad.js';

describe('shapeAxis', () => {
  it('returns 0 inside the deadzone', () => {
    expect(shapeAxis(0.1)).toBe(0);
    expect(shapeAxis(-0.11)).toBe(0);
  });
  it('keeps sign and reaches full scale', () => {
    expect(shapeAxis(1)).toBeCloseTo(1);
    expect(shapeAxis(-1)).toBeCloseTo(-1);
    expect(shapeAxis(0.5)).toBeGreaterThan(0);
    expect(shapeAxis(-0.5)).toBeLessThan(0);
  });
  it('expo makes the centre gentler than linear', () => {
    const linear = (0.5 - 0.12) / (1 - 0.12);
    expect(shapeAxis(0.5)).toBeLessThan(linear);
  });
});

const btn = (pressed, value = pressed ? 1 : 0) => ({ pressed, value });
const idleButtons = () => Array.from({ length: 17 }, () => btn(false));

describe('gamepadTargets', () => {
  it('is inactive at rest', () => {
    const t = gamepadTargets([0, 0, 0, 0], idleButtons());
    expect(t.active).toBe(false);
    expect(t.throttleRate).toBe(0);
  });
  it('left stick → roll/pitch (stick back = nose up = negative pitch input)', () => {
    const t = gamepadTargets([1, 1, 0, 0], idleButtons());
    expect(t.active).toBe(true);
    expect(t.roll).toBeCloseTo(1);
    expect(t.pitch).toBeCloseTo(-1);
  });
  it('triggers drive throttle rate, shoulders drive rudder', () => {
    const b = idleButtons();
    b[7] = btn(true, 1); // RT
    b[4] = btn(true);    // LB
    const t = gamepadTargets([0, 0, 0, 0], b);
    expect(t.throttleRate).toBeCloseTo(1);
    expect(t.yaw).toBe(-1);
    expect(t.active).toBe(true);
  });
});

describe('buttonEdges', () => {
  it('reports only newly pressed buttons', () => {
    const prev = [false, true, false];
    const now = [btn(true), btn(true), btn(false)];
    expect(buttonEdges(prev, now)).toEqual([0]);
  });
});
