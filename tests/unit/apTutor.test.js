import { describe, it, expect } from 'vitest';
import {
  tutorTarget, createTutor, stepTutor, TUTOR_TEXT, TUTOR_MIN_HOLD_S, TUTOR_MIN_READ_S,
  tutorOn, setTutorOn, TUTOR_KEY,
} from '../../src/apTutor.js';

const approach = (o = {}) => ({
  apMaster: true, apApproach: true, apHdgHold: false, apAltHold: false, onGround: false,
  aglFt: 1200, crossM: 0, heightAbovePathM: 0, iasKts: 141, targetKts: 141, ...o,
});

describe('tutorTarget', () => {
  it('is silent when the autopilot is off', () => {
    expect(tutorTarget(approach({ apMaster: false }))).toBe(null);
  });
  it('explains each phase of an autoland, most urgent first', () => {
    expect(tutorTarget(approach({ crossM: 120 }))).toBe('intercept');
    expect(tutorTarget(approach({ heightAbovePathM: 20 }))).toBe('high');
    expect(tutorTarget(approach({ heightAbovePathM: -20 }))).toBe('low');
    expect(tutorTarget(approach({ iasKts: 130 }))).toBe('slow');
    expect(tutorTarget(approach({ iasKts: 150 }))).toBe('fast');
    expect(tutorTarget(approach())).toBe('onpath');
    expect(tutorTarget(approach({ aglFt: 40, crossM: 120 }))).toBe('flare');
    expect(tutorTarget(approach({ aglFt: 10 }))).toBe('retard');
    expect(tutorTarget(approach({ onGround: true }))).toBe('rollout');
  });
  it('explains heading and altitude hold', () => {
    const cruise = { apMaster: true, apApproach: false };
    expect(tutorTarget({ ...cruise, apHdgHold: true, apAltHold: true })).toBe('cruise');
    expect(tutorTarget({ ...cruise, apHdgHold: true, apAltHold: false })).toBe('heading');
    expect(tutorTarget({ ...cruise, apHdgHold: false, apAltHold: true })).toBe('altitude');
  });
});

describe('stepTutor', () => {
  it('shows the first caption at once and holds it long enough to read', () => {
    const t = createTutor();
    stepTutor(t, approach({ crossM: 120 }), 0.016);
    expect(t.caption).toBe('intercept');
    // Lined up after 1 s: the intercept caption stays until it has been readable.
    for (let s = 0; s < 2; s += 0.1) stepTutor(t, approach(), 0.1);
    expect(t.caption).toBe('intercept');
    for (let s = 0; s < TUTOR_MIN_READ_S; s += 0.1) stepTutor(t, approach(), 0.1);
    expect(t.caption).toBe('onpath');
  });
  it('ignores a blip shorter than the hold time', () => {
    const t = createTutor();
    for (let s = 0; s < 5; s += 0.1) stepTutor(t, approach(), 0.1);
    stepTutor(t, approach({ iasKts: 130 }), TUTOR_MIN_HOLD_S / 2);
    stepTutor(t, approach(), 0.1);
    expect(t.caption).toBe('onpath');
  });
  it('the flare interrupts at once; turning the autopilot off clears it', () => {
    const t = createTutor();
    stepTutor(t, approach(), 0.1);
    stepTutor(t, approach({ aglFt: 45 }), 0.016);
    expect(t.caption).toBe('flare');
    stepTutor(t, approach({ apMaster: false }), 0.016);
    expect(t.caption).toBe(null);
  });
});

describe('captions', () => {
  it('every caption has text, with the numbers filled in', () => {
    const v = { targetKts: 141, hdgDeg: 355, altFt: 3000 };
    for (const fn of Object.values(TUTOR_TEXT)) expect(fn(v).length).toBeGreaterThan(10);
    expect(TUTOR_TEXT.slow(v)).toContain('141 kt');
    expect(TUTOR_TEXT.cruise(v)).toContain('355°');
  });
  it('fits a phone: every caption is short enough for two lines', () => {
    const v = { targetKts: 141, hdgDeg: 355, altFt: 13000 };
    for (const fn of Object.values(TUTOR_TEXT)) expect(fn(v).length).toBeLessThanOrEqual(90);
  });
});

describe('tutor setting', () => {
  const store = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  };
  it('is on by default, remembers off, survives storage that throws', () => {
    const s = store();
    expect(tutorOn(s)).toBe(true);
    setTutorOn(s, false, 1);
    expect(JSON.parse(s.getItem(TUTOR_KEY))).toEqual({ v: 1, on: false, at: 1 });
    expect(tutorOn(s)).toBe(false);
    const broken = { getItem: () => { throw new Error('private'); }, setItem: () => { throw new Error('private'); } };
    expect(tutorOn(broken)).toBe(true);
    expect(() => setTutorOn(broken, false)).not.toThrow();
  });
});
