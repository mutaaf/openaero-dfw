import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { coachText, coachTarget, createCoach, stepCoach, COACH_MIN_HOLD_S } from '../../src/coach.js';
import {
  createTakeoffCoach, takeoffTarget, takeoffPrompt, takeoffWords, takeoffPromptFor, climbKts, tailStrikeDeg,
  ROTATE_PITCH_DEG, REPEAT_S, DONE_FT, OFF_M, SLOW_VS, TAIL_MARGIN_DEG, slowKtsFor,
} from '../../src/takeoffCoach.js';
import { stallSpeedKts } from '../../src/aero.js';
import { trimSpeedKts, takeoffTrimAoaDeg } from '../../src/trim.js';

// Ticket 0093: the takeoff coach, phase by phase, for the three airframes.
const KEYS = ['c172', 'b738', 'f16'];
// A coach past its takeoff roll (the climb's prompts need one) and past its first quiet frame.
const rolled = (st) => Object.assign(st, { rolled: true, blank: false });
const parked = { onGround: true, raFt: 0, aglFt: 5, iasKts: 0, gsKts: 0, vsiFpm: 0, throttle: 0, brakesOn: false, gearDown: true, kid: false, crossM: 0, crossRateMps: 0, halfWidthM: 23, pitchDeg: 0, pitchRateDegS: 0, autoSteer: false };

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
      const tail = tailStrikeDeg(spec) - 0.5;
      expect(takeoffTarget(st, { ...atVr, pitchDeg: tail })).toBe('toEase');
      expect(takeoffTarget(st, { ...atVr, onGround: false, raFt: 4, vsiFpm: 400, pitchDeg: tail })).toBe('toEase');
      // A firm pull is called half a second ahead (first-timer panel: 1° passes inside a frame).
      expect(takeoffTarget(st, { ...atVr, pitchDeg: tail - 2, pitchRateDegS: 5 })).toBe('toEase');
      expect(takeoffTarget(st, { ...atVr, pitchDeg: tail - 2, pitchRateDegS: 1 })).not.toBe('toEase');
      // The words carry this airframe's numbers.
      expect(coachText('toRoll')).toContain(`${spec.vrKts} kt`);
      expect(coachText('toRotate')).toContain(`${ROTATE_PITCH_DEG[key]}°`);
    });
  }
  it('the rotate pitch clears each airframe\'s tail-strike attitude by 3° or more', () => {
    for (const key of KEYS) expect(tailStrikeDeg(AIRCRAFT_DATABASE[key]) - ROTATE_PITCH_DEG[key]).toBeGreaterThanOrEqual(3);
  });
  // Physics panel: the Cessna's tail first touches at ~14.2° on a pull below Vr (static struts,
  // aircraft.js gear.tail), so its call is a degree short of 13.7°, not of 15°.
  it('the Cessna is told to ease the nose by 12.7°, the 737 by 10°', () => {
    expect(createTakeoffCoach('c172', AIRCRAFT_DATABASE.c172, 1).tailDeg).toBeCloseTo(13.7 - TAIL_MARGIN_DEG, 5);
    expect(createTakeoffCoach('b738', AIRCRAFT_DATABASE.b738, 1).tailDeg).toBe(10);
  });
});

describe('takeoffTarget: the climb', () => {
  const air = { ...parked, onGround: false, throttle: 1, raFt: 40, aglFt: 50, vsiFpm: 800, pitchDeg: 9 };
  it('737 and F-16 (the mission\'s flaps notch 1): positive rate, gear up; then the climb', () => {
    for (const key of ['b738', 'f16']) {
      const spec = AIRCRAFT_DATABASE[key];
      const st = rolled(createTakeoffCoach(key, spec, 1));
      const climb = { ...air, iasKts: spec.vrKts + 15 };
      expect(takeoffTarget(st, climb)).toBe('toGear');
      expect(takeoffTarget(st, { ...climb, raFt: 3 })).toBe('toClimb'); // not before 5 ft
      expect(takeoffTarget(st, { ...climb, vsiFpm: 100 })).toBe('toClimb'); // not before positive rate
      expect(takeoffTarget(st, { ...climb, gearDown: false })).toBe('toClimb');
    }
  });
  // Physics panel: the called speed is the one the takeoff trim flies at the flaps set (the Cessna
  // takes off at flaps 10 here, trimmed for 1.2 Vr = 66 kt; Vy 74 only flaps up), so letting go
  // agrees with the coach.
  for (const key of ['c172', 'b738']) {
    for (const flaps of [0, 1]) {
      it(`${key} flaps ${flaps}: "hold N kt" is the takeoff trim's speed`, () => {
        const spec = AIRCRAFT_DATABASE[key];
        createTakeoffCoach(key, spec, flaps);
        const trimKts = Math.round(trimSpeedKts(spec, takeoffTrimAoaDeg(spec, flaps), flaps));
        expect(climbKts(spec, flaps)).toBe(trimKts);
        expect(coachText('toClimb')).toBe(`Climbing: hold ${trimKts} kt, wings level`);
      });
    }
  }
  it('Cessna: 74 kt (Vy) flaps up, 66 kt at flaps 10', () => {
    expect(climbKts(AIRCRAFT_DATABASE.c172, 0)).toBe(74);
    expect(climbKts(AIRCRAFT_DATABASE.c172, 1)).toBe(66);
  });
  it('F-16 (fly-by-wire: the trim holds no speed): an attitude, not a speed', () => {
    createTakeoffCoach('f16', AIRCRAFT_DATABASE.f16, 1);
    expect(climbKts(AIRCRAFT_DATABASE.f16, 1)).toBeNull();
    expect(coachText('toClimb')).toBe('Climbing: nose 10° up, wings level');
  });
  it('Cessna: fixed gear, no gear call', () => {
    const st = rolled(createTakeoffCoach('c172', AIRCRAFT_DATABASE.c172, 1));
    expect(takeoffTarget(st, { ...air, iasKts: 65 })).toBe('toClimb');
  });
  // Physics panel: Vr - 3 was ~1.05 Vs; "Slow" now starts at 1.13 Vs (V2's floor) for the flaps set.
  for (const key of KEYS) {
    it(`${key}: "Slow" from below 1.13 Vs at the flaps set`, () => {
      const spec = AIRCRAFT_DATABASE[key];
      const st = rolled(createTakeoffCoach(key, spec, 1));
      st.slowKts = slowKtsFor(spec, spec.pitchFbw ? null : stallSpeedKts(spec, 1)); // as takeoffPromptFor reads sim.stallKts
      const floor = SLOW_VS * stallSpeedKts(spec, 1);
      expect(st.slowKts).toBeGreaterThanOrEqual(floor);
      expect(takeoffTarget(st, { ...air, iasKts: floor - 1 })).toBe('toSlow');
      expect(takeoffTarget(st, { ...air, iasKts: Math.max(floor, spec.vrKts) + 1, vsiFpm: 100 })).toBe('toClimb');
    });
  }
  it('a flap notch changed on the roll re-words the climb speed (main.js passes the sim)', () => {
    const spec = AIRCRAFT_DATABASE.c172;
    const st = createTakeoffCoach('c172', spec, 1);
    const sim = { aircraftKey: 'c172', spec, flapsIndex: 0, onGround: true, raFt: 0, aglFt: 5, iasKts: 0, gsKts: 0, vsiFpm: 0, throttle: 0, brakesOn: false, gearDown: true, assist: 'pilot', approach: { crossM: 0 }, simTime: 0 };
    takeoffPromptFor(st, sim, 0);
    expect(coachText('toClimb')).toContain('74 kt');
    sim.aircraftKey = 'b738'; sim.spec = AIRCRAFT_DATABASE.b738; sim.flapsIndex = 1;
    takeoffPromptFor(st, sim, 0);
    expect(st.vrKts).toBe(135);
    expect(coachText('toRoll')).toContain('135 kt');
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
    const st = Object.assign(createTakeoffCoach('b738', spec), { blank: false });
    const roll = { ...parked, throttle: 1, iasKts: 60, gsKts: 60 };
    const off = { ...roll, crossM: OFF_M + 1 };
    expect(takeoffPrompt(st, off, 10)).toBe('toRight');
    expect(takeoffPrompt(st, roll, 11)).toBe('toRoll');
    expect(takeoffPrompt(st, off, 12)).toBe('toRoll'); // 2 s after it left: held
    expect(takeoffPrompt(st, off, 11 + REPEAT_S + 0.1)).toBe('toRight');
  });
  it('the tail-strike call is never held back', () => {
    const spec = AIRCRAFT_DATABASE.b738;
    const st = Object.assign(createTakeoffCoach('b738', spec), { blank: false });
    const atVr = { ...parked, throttle: 1, iasKts: spec.vrKts, gsKts: spec.vrKts };
    expect(takeoffPrompt(st, { ...atVr, pitchDeg: 10.5 }, 20)).toBe('toEase');
    expect(takeoffPrompt(st, { ...atVr, pitchDeg: 8 }, 20.5)).toBeNull(); // the card clears at once
    expect(takeoffPrompt(st, { ...atVr, pitchDeg: 8 }, 20.6)).toBe('toHold');
    expect(takeoffPrompt(st, { ...atVr, pitchDeg: 10.5 }, 21)).toBe('toEase');
  });
});

describe('through coach.js (the card main.js shows)', () => {
  it('the roll then the rotation: debounced and rotate interrupts at once', () => {
    const spec = AIRCRAFT_DATABASE.c172;
    const st = Object.assign(createTakeoffCoach('c172', spec), { blank: false });
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

describe('first-timer panel', () => {
  const spec = AIRCRAFT_DATABASE.b738;
  const roll = { ...parked, throttle: 1, iasKts: 100, gsKts: 100 };
  it('a rejected takeoff: brakes, then quiet to the stop, and never "full power" again', () => {
    const st = createTakeoffCoach('b738', spec, 1);
    expect(takeoffTarget(st, roll)).toBe('toRoll');
    expect(takeoffTarget(st, { ...roll, throttle: 0 })).toBe('toStop');
    expect(takeoffTarget(st, { ...roll, throttle: 0, brakesOn: true })).toBeNull();
    expect(takeoffTarget(st, { ...roll, throttle: 0, iasKts: 20, gsKts: 20 })).toBe('toStop'); // not toPower
    expect(takeoffTarget(st, { ...roll, throttle: 0, iasKts: 0, gsKts: 1 })).toBeNull();
    expect(st.over).toBe(true);
    // The power coming up at the start is not a reject.
    const st2 = createTakeoffCoach('b738', spec, 1);
    expect(takeoffTarget(st2, { ...parked, throttle: 0.3, iasKts: 5, gsKts: 5 })).toBe('toPower');
  });
  it('off the runway: idle and brakes, never "rotate" in the grass', () => {
    const st = createTakeoffCoach('b738', spec, 1);
    expect(takeoffTarget(st, { ...roll, iasKts: 140, gsKts: 140, crossM: -40 })).toBe('toOff');
    expect(coachText('toOff')).toMatch(/power idle/);
  });
  it('drifting: by where it is heading, so a swerve back across the line is named the way it goes', () => {
    const st = createTakeoffCoach('b738', spec, 1);
    expect(takeoffTarget(st, { ...roll, crossM: 6, crossRateMps: -8 })).toBe('toLeft'); // right of it, swerving left fast
    expect(takeoffTarget(st, { ...roll, crossM: 6, crossRateMps: 0 })).toBe('toRight');
    expect(takeoffTarget(st, { ...roll, crossM: 2, crossRateMps: 2 })).toBe('toRight'); // 6 m right in 2 s
  });
  it('no steering words when the game holds the centreline (Kid, Learner, touch over 40 kt)', () => {
    const st = createTakeoffCoach('b738', spec, 1);
    expect(takeoffTarget(st, { ...roll, crossM: 8, autoSteer: true })).toBe('toRoll');
    expect(takeoffTarget(st, { ...roll, crossM: 8, autoSteer: true, kid: true })).toBe('toKidRoll');
  });
  it('too steep after lift-off (a held pull): nose down, above the gear call', () => {
    const st = rolled(createTakeoffCoach('b738', spec, 1));
    const air = { ...parked, onGround: false, throttle: 1, raFt: 40, aglFt: 50, vsiFpm: 3000, iasKts: 150, pitchDeg: 30 };
    expect(takeoffTarget(st, air)).toBe('toSteep'); // 30° and 12 kt short of 162: the speed is going
    expect(takeoffTarget(st, { ...air, pitchDeg: 15 })).toBe('toGear'); // a 737's normal climb attitude
    expect(takeoffTarget(st, { ...air, pitchDeg: 19, iasKts: 162 })).toBe('toGear'); // trimmed at takeoff thrust: steep, not slow
  });
  it('a hop back onto the runway ends it: the landing grade has the card, not "rotate"', () => {
    const st = rolled(createTakeoffCoach('c172', AIRCRAFT_DATABASE.c172, 1));
    takeoffTarget(st, { ...parked, onGround: false, throttle: 1, raFt: 8, aglFt: 12, iasKts: 60, gsKts: 60, vsiFpm: 300, pitchDeg: 7 });
    expect(takeoffTarget(st, { ...parked, throttle: 1, iasKts: 60, gsKts: 60 })).toBeNull();
    expect(st.over).toBe(true);
  });
  it('Kid near the tail hears plain words', () => {
    const st = createTakeoffCoach('c172', AIRCRAFT_DATABASE.c172, 1);
    expect(takeoffTarget(st, { ...parked, kid: true, throttle: 1, iasKts: 55, gsKts: 55, pitchDeg: 13 })).toBe('toKidEase');
    expect(coachText('toKidEase')).toMatch(/not so high/i);
  });
  it('a touch word never says pull or back: the touch stick goes up for nose up', () => {
    for (const key of KEYS) {
      const w = takeoffWords(key, AIRCRAFT_DATABASE[key], 1);
      for (const k of Object.keys(w.keys)) {
        const touchText = w.touch[k] ?? w.keys[k];
        expect(touchText, k).not.toMatch(/pull|ease back|Shift|\(.\)|↑/i);
      }
    }
  });
  it('the keyboard words name the keys the game binds (S/↑ nose up, Shift power, E/Q rudder)', () => {
    const w = takeoffWords('b738', spec, 1);
    expect(w.keys.toRotate).toMatch(/S or ↑/);
    expect(w.keys.toKidPower).toMatch(/Shift/);
    expect(w.keys.toLeft).toMatch(/\(E\)/);
  });
});

describe('device panel', () => {
  it('no air prompts before a takeoff roll (an airframe swapped in drops onto its struts)', () => {
    const st = createTakeoffCoach('c172', AIRCRAFT_DATABASE.c172, 1);
    expect(takeoffTarget(st, { ...parked, onGround: false, raFt: 20, aglFt: 25 })).toBeNull();
    expect(st.flew).toBe(false);
    expect(takeoffTarget(st, parked)).toBe('toPower');
  });
  it('the tail call clears at once into the climb (a lower rank would linger 1.5 s)', () => {
    const spec = AIRCRAFT_DATABASE.b738;
    const st = Object.assign(createTakeoffCoach('b738', spec, 1), { blank: false, rolled: true });
    const lift = { ...parked, onGround: false, throttle: 1, raFt: 6, aglFt: 15, iasKts: 150, gsKts: 150, vsiFpm: 1500, pitchDeg: 10.5 };
    expect(takeoffPrompt(st, lift, 30)).toBe('toEase');
    expect(takeoffPrompt(st, { ...lift, raFt: 12, pitchDeg: 12 }, 30.1)).toBeNull();
    expect(takeoffPrompt(st, { ...lift, raFt: 13, pitchDeg: 12 }, 30.2)).toBe('toGear');
  });
  it('another airframe mid-mission is a new takeoff with its own words, after one quiet frame', () => {
    const st = createTakeoffCoach('b738', AIRCRAFT_DATABASE.b738, 1);
    const sim = { aircraftKey: 'b738', spec: AIRCRAFT_DATABASE.b738, flapsIndex: 1, onGround: true, raFt: 0, aglFt: 10, iasKts: 0, gsKts: 0, vsiFpm: 0, throttle: 0, brakesOn: false, gearDown: true, assist: 'pilot', approach: { crossM: 0 }, simTime: 1 };
    expect(takeoffPromptFor(st, sim, 0)).toBeNull(); // the quiet frame
    expect(takeoffPromptFor(st, { ...sim, simTime: 1.1 }, 0)).toBe('toPower');
    st.over = true;
    expect(takeoffPromptFor(st, { ...sim, aircraftKey: 'c172', spec: AIRCRAFT_DATABASE.c172, simTime: 2 }, 0)).toBeNull();
    expect(st.over).toBe(false);
    expect(takeoffPromptFor(st, { ...sim, aircraftKey: 'c172', spec: AIRCRAFT_DATABASE.c172, simTime: 2.1 }, 0)).toBe('toPower');
    expect(coachText('toRoll')).toContain('55 kt');
  });
});
