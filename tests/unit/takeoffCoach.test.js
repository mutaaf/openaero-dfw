import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { coachText, coachTarget, createCoach, stepCoach, COACH_MIN_HOLD_S } from '../../src/coach.js';
import {
  createTakeoffCoach, takeoffTarget, takeoffPrompt, takeoffWords, ROTATE_PITCH_DEG, REPEAT_S, DONE_FT, OFF_M,
} from '../../src/takeoffCoach.js';

// Ticket 0093: the takeoff coach, phase by phase, for the three airframes.
const KEYS = ['c172', 'b738', 'f16'];
const parked = { onGround: true, raFt: 0, aglFt: 5, iasKts: 0, gsKts: 0, vsiFpm: 0, throttle: 0, brakesOn: false, gearDown: true, kid: false, crossM: 0, pitchDeg: 0 };

describe('takeoffTarget: the roll', () => {
  for (const key of KEYS) {
    const spec = AIRCRAFT_DATABASE[key];
    it(`${key}: power, brakes, centreline, rotate at Vr ${spec.vrKts} kt to ${ROTATE_PITCH_DEG[key]}°, then hold`, () => {
      const st = createTakeoffCoach(key, spec);
      expect(takeoffTarget(st, parked)).toBe('toPower');
      expect(takeoffTarget(st, { ...parked, throttle: 1, brakesOn: true })).toBe('toBrakes');
      const rolling = { ...parked, throttle: 1, iasKts: 40, gsKts: 40 };
      expect(takeoffTarget(st, rolling)).toBe('toRoll');
      expect(takeoffTarget(st, { ...rolling, crossM: OFF_M + 1 })).toBe('toRight');
      expect(takeoffTarget(st, { ...rolling, crossM: -(OFF_M + 1) })).toBe('toLeft');
      // A lever pulled back mid-roll is not "set takeoff power" again once it is moving.
      expect(takeoffTarget(st, { ...rolling, throttle: 0.5 })).toBe('toRoll');
      const atVr = { ...rolling, iasKts: spec.vrKts, gsKts: spec.vrKts };
      expect(takeoffTarget(st, atVr)).toBe('toRotate');
      expect(takeoffTarget(st, { ...atVr, pitchDeg: ROTATE_PITCH_DEG[key] })).toBe('toHold');
      // Near the tail-strike attitude: ease the nose, on the runway and in the first feet.
      const tail = (spec.maxGroundPitchDeg ?? 15) - 0.5;
      expect(takeoffTarget(st, { ...atVr, pitchDeg: tail })).toBe('toEase');
      expect(takeoffTarget(st, { ...atVr, onGround: false, raFt: 4, vsiFpm: 400, pitchDeg: tail })).toBe('toEase');
      // The words carry this airframe's numbers.
      expect(coachText('toRoll')).toContain(`${spec.vrKts} kt`);
      expect(coachText('toRotate')).toContain(`${ROTATE_PITCH_DEG[key]}°`);
    });
  }
  it('the rotate pitch clears each airframe\'s tail-strike attitude by 3° or more', () => {
    for (const key of KEYS) expect((AIRCRAFT_DATABASE[key].maxGroundPitchDeg ?? 15) - ROTATE_PITCH_DEG[key]).toBeGreaterThanOrEqual(3);
  });
});

describe('takeoffTarget: the climb', () => {
  const air = { ...parked, onGround: false, throttle: 1, raFt: 40, aglFt: 50, vsiFpm: 800, pitchDeg: 9 };
  it('737 and F-16: positive rate, gear up; then the climb speed', () => {
    for (const key of ['b738', 'f16']) {
      const spec = AIRCRAFT_DATABASE[key];
      const st = createTakeoffCoach(key, spec);
      const climb = { ...air, iasKts: spec.vrKts + 10 };
      expect(takeoffTarget(st, climb)).toBe('toGear');
      expect(takeoffTarget(st, { ...climb, raFt: 3 })).toBe('toClimb'); // not before 5 ft
      expect(takeoffTarget(st, { ...climb, vsiFpm: 100 })).toBe('toClimb'); // not before positive rate
      expect(takeoffTarget(st, { ...climb, gearDown: false })).toBe('toClimb');
      expect(coachText('toClimb')).toContain(`${Math.round(1.2 * spec.vrKts)} kt`);
    }
  });
  it('Cessna: fixed gear, no gear call; climbs at Vy 74 kt (the takeoff trim, 0141)', () => {
    const st = createTakeoffCoach('c172', AIRCRAFT_DATABASE.c172);
    expect(takeoffTarget(st, { ...air, iasKts: 65 })).toBe('toClimb');
    expect(coachText('toClimb')).toContain('74 kt');
  });
  it('slow after lift-off: lower the nose', () => {
    const st = createTakeoffCoach('c172', AIRCRAFT_DATABASE.c172);
    expect(takeoffTarget(st, { ...air, iasKts: 50 })).toBe('toSlow');
  });
  it(`over above ${DONE_FT} ft, for good`, () => {
    const st = createTakeoffCoach('b738', AIRCRAFT_DATABASE.b738);
    expect(takeoffTarget(st, { ...air, iasKts: 170, aglFt: DONE_FT + 1 })).toBeNull();
    expect(st.over).toBe(true);
    expect(takeoffTarget(st, { ...air, iasKts: 170, aglFt: 500 })).toBeNull();
  });
  it('the autopilot silences it (coach.js)', () => {
    expect(coachTarget({ ...air, autopilot: true, ds: 'toClimb' })).toBeNull();
  });
});

describe('Kid', () => {
  it('throttle up, pull back at Vr, then let go: no gear, rudder or speed numbers to manage', () => {
    const spec = AIRCRAFT_DATABASE.b738;
    const st = createTakeoffCoach('b738', spec);
    const kid = { ...parked, kid: true };
    expect(takeoffTarget(st, kid)).toBe('toKidPower');
    expect(takeoffTarget(st, { ...kid, throttle: 1, iasKts: 60, gsKts: 60 })).toBe('toKidRoll');
    expect(takeoffTarget(st, { ...kid, throttle: 1, iasKts: spec.vrKts, gsKts: spec.vrKts })).toBe('toKidRotate');
    expect(takeoffTarget(st, { ...kid, onGround: false, raFt: 40, aglFt: 50, iasKts: 150, vsiFpm: 900, pitchDeg: 9 })).toBe('toKidClimb');
    expect(coachText('toKidClimb')).toMatch(/let go/i);
  });
});

describe('words', () => {
  it('every prompt fits a phone (48 characters), keys and touch, for every airframe', () => {
    for (const key of KEYS) {
      const w = takeoffWords(key, AIRCRAFT_DATABASE[key]);
      for (const t of [...Object.values(w.keys), ...Object.values(w.touch)]) expect(t.length).toBeLessThanOrEqual(48);
    }
  });
  it('a touch screen names the buttons, not the keys', () => {
    createTakeoffCoach('b738', AIRCRAFT_DATABASE.b738);
    expect(coachText('toGear', { touch: true })).toMatch(/tap GEAR/);
    expect(coachText('toGear')).toMatch(/\(G\)/);
    expect(coachText('toBrakes', { touch: true })).toMatch(/tap BRAKES/i);
    expect(coachText('toPower', { touch: true })).toMatch(/slide the throttle/);
    expect(coachText('toPower')).toMatch(/Shift/);
  });
});

describe('takeoffPrompt: no repeat within 4 s', () => {
  it('a prompt that just left holds the one showing instead of coming back', () => {
    const spec = AIRCRAFT_DATABASE.b738;
    const st = createTakeoffCoach('b738', spec);
    const roll = { ...parked, throttle: 1, iasKts: 60, gsKts: 60 };
    const off = { ...roll, crossM: OFF_M + 1 };
    expect(takeoffPrompt(st, off, 10)).toBe('toRight');
    expect(takeoffPrompt(st, roll, 11)).toBe('toRoll');
    expect(takeoffPrompt(st, off, 12)).toBe('toRoll'); // 2 s after it left: held
    expect(takeoffPrompt(st, off, 11 + REPEAT_S + 0.1)).toBe('toRight');
  });
  it('the tail-strike call is never held back', () => {
    const spec = AIRCRAFT_DATABASE.b738;
    const st = createTakeoffCoach('b738', spec);
    const atVr = { ...parked, throttle: 1, iasKts: spec.vrKts, gsKts: spec.vrKts };
    expect(takeoffPrompt(st, { ...atVr, pitchDeg: 10.5 }, 20)).toBe('toEase');
    expect(takeoffPrompt(st, { ...atVr, pitchDeg: 8 }, 20.5)).toBe('toHold');
    expect(takeoffPrompt(st, { ...atVr, pitchDeg: 10.5 }, 21)).toBe('toEase');
  });
});

describe('through coach.js (the card main.js shows)', () => {
  it('the roll then the rotation: debounced and rotate interrupts at once', () => {
    const spec = AIRCRAFT_DATABASE.c172;
    const st = createTakeoffCoach('c172', spec);
    const c = createCoach();
    const step = (s, t, dt) => { const k = takeoffPrompt(st, s, t); return stepCoach(c, { ...s, autopilot: false, ds: k, dsGround: s.onGround ? k : null }, dt); };
    step(parked, 0, 0.1);
    expect(c.prompt).toBe('toPower');
    const roll = { ...parked, throttle: 1, iasKts: 30, gsKts: 30 };
    step(roll, 1, 0.1);
    expect(c.prompt).toBe('toPower'); // a lower rank waits COACH_MIN_HOLD_S
    step(roll, 1 + COACH_MIN_HOLD_S, COACH_MIN_HOLD_S);
    expect(c.prompt).toBe('toRoll');
    step({ ...roll, iasKts: 55, gsKts: 55 }, 5, 0.016);
    expect(c.prompt).toBe('toRotate'); // a higher rank at once
  });
});
