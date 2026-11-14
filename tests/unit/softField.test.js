// Soft-field takeoff lesson (ticket 0182): softField.js's step, coach and grade, and gear.js's surface μ.
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { runwayEnd, takeoffSpawn } from '../../src/airports.js';
import { gearForces, gearFriction, gearConstants } from '../../src/gear.js';
import { ROLLING_MU } from '../../src/systems.js';
import { DRILL_TEXT, TOUCH_WORDS, coachText } from '../../src/coach.js';
import {
  createSoftField, softFieldStep, softFieldTarget, gradeSoftField, softFieldDone, softFieldSimStep, softFieldPrompt,
  SURFACE_MU, ACCEL_KTS, DONE_FT, PITCH_HIGH_DEG, CAP_B, CAP_C, FAIL_CAP, GIVE_UP_S, VY_KTS,
} from '../../src/softField.js';

const E16 = runwayEnd('KADS', '16');
const c172 = AIRCRAFT_DATABASE.c172;
const base = (o = {}) => ({ onGround: true, wheelFt: 0, iasKts: 0, gsKts: 0, throttle: 1, noseFrac: 1, tailOn: false, alongM: 0, leftM: 2000, crossM: 0, halfWidthM: 15, pitchDeg: 0, kid: false, ...o });

// A whole lesson in a few steps: the roll at noseFrac from 20 kt to the lift-off at liftKts, then the wheels at lowFt to 70 kt, then 200 ft.
function lesson({ noseFrac = 0.2, liftKts = 53, lowFt = 8, settle = false, kid = false } = {}) {
  const st = createSoftField(E16);
  softFieldStep(st, base({ iasKts: 10, throttle: 1 }), 1);
  for (let k = 20; k < liftKts; k += 2) softFieldStep(st, base({ iasKts: k, noseFrac, alongM: k * 10 }), 1);
  softFieldStep(st, base({ onGround: false, wheelFt: 2, iasKts: liftKts, alongM: liftKts * 10 }), 1);
  if (settle) softFieldStep(st, base({ iasKts: liftKts + 2 }), 1);
  softFieldStep(st, base({ onGround: false, wheelFt: lowFt, iasKts: 65 }), 1);
  softFieldStep(st, base({ onGround: false, wheelFt: lowFt, iasKts: ACCEL_KTS }), 1);
  expect(softFieldStep(st, base({ onGround: false, wheelFt: DONE_FT, iasKts: VY_KTS }), 1)).toBe('done');
  return { st, r: gradeSoftField(st, kid) };
}

describe('softField.js grade (0182)', () => {
  it('the Handbook lesson: light nose, slow lift-off, low to Vy: S', () => {
    const { st, r } = lesson();
    expect(softFieldDone(st)).toBe(true);
    expect(r.kind).toBe('softField');
    expect(r.grade).toBe('S');
    expect(r.reason).toBeNull();
    expect(r.factors.map((f) => f.key)).toEqual(['nose', 'liftoff', 'accel']);
    expect(r.factors[0].value).toBe('20% of normal');
    expect(r.factors[1].value).toMatch(/^53 kt, after [\d,]+ ft$/);
    expect(r.note).toMatch(/game setting/);
  });
  it('a full-weight nose wheel and a late lift-off: below B, the nose named', () => {
    const { r } = lesson({ noseFrac: 1.2, liftKts: 63 });
    expect(r.score).toBeLessThan(70);
    expect(r.reason).toMatch(/nose wheel/);
    expect(r.reason).not.toMatch(/stick|pull/); // the card is the same on touch and keyboard
  });
  it('climbing to 80 ft before 70 kt costs the ground-effect marks', () => {
    const { r } = lesson({ lowFt: 80 });
    expect(r.factors[2].score).toBeLessThan(30);
    expect(r.reason).toMatch(/Climbed too soon/);
  });
  it('a settle back onto the runway caps at C; Kid is not capped and its climb is the plane\'s', () => {
    expect(lesson({ settle: true }).r.score).toBeLessThanOrEqual(CAP_C);
    expect(lesson({ settle: true }).r.reason).toMatch(/Settled back/);
    const kid = lesson({ settle: true, lowFt: 90, kid: true }).r;
    expect(kid.score).toBeGreaterThan(CAP_C);
    expect(kid.factors[2].value).toBe('the plane climbed for you');
  });
  it('an overrun, a run-off and an abandoned roll end it at D or worse, with the reason', () => {
    for (const [s, why] of [[{ iasKts: 40, leftM: -1 }, /out of runway/], [{ iasKts: 40, crossM: 20 }, /side of the runway/]]) {
      const st = createSoftField(E16);
      softFieldStep(st, base({ iasKts: 30 }), 1);
      expect(softFieldStep(st, base(s), 1)).toBe('done');
      const r = gradeSoftField(st);
      expect(r.score).toBeLessThanOrEqual(FAIL_CAP);
      expect(r.reason).toMatch(why);
      expect(r.title).toMatch(/failed/);
    }
    const st = createSoftField(E16);
    softFieldStep(st, base({ iasKts: 30 }), 1);
    expect(softFieldStep(st, base({ throttle: 0, gsKts: 1, iasKts: 1 }), 1)).toBe('done');
    expect(gradeSoftField(st).reason).toMatch(/Never got airborne/);
    const idle = createSoftField(E16);
    expect(softFieldStep(idle, base({ throttle: 0 }), GIVE_UP_S + 1)).toBe('done');
  });
  it('the tail on the runway caps at B and says so', () => {
    const st = createSoftField(E16);
    softFieldStep(st, base({ iasKts: 30, tailOn: true }), 1);
    st.liftKts = 52; st.rollM = 300; st.noseSum = 0.2; st.noseN = 1; st.accelFt = 8; st.phase = 'done';
    const r = gradeSoftField(st);
    expect(r.score).toBeLessThanOrEqual(CAP_B);
    expect(r.reason).toMatch(/tail touched/);
  });
  it('a 1 ft bump is not the lift-off', () => {
    const st = createSoftField(E16);
    softFieldStep(st, base({ onGround: false, wheelFt: 0.5, iasKts: 40 }), 1);
    expect(st.phase).toBe('roll');
  });
});

describe('softField.js coach (0182)', () => {
  const st = createSoftField(E16);
  it('the roll: power and nose up first, "nose up" only to a stick not already back, wait, hold, ease off, the tail call', () => {
    expect(softFieldTarget(st, base({ throttle: 0 }))).toBe('sfoPower');
    softFieldStep(st, base({ iasKts: 20 }), 0.1);
    expect(softFieldTarget(st, base({ iasKts: 30, noseFrac: 0.9, elev: 0 }))).toBe('sfoBack');
    expect(softFieldTarget(st, base({ iasKts: 30, noseFrac: 0.9, elev: -1 }))).toBe('sfoWait');
    expect(softFieldTarget(st, base({ iasKts: 30, noseFrac: 0.1, pitchDeg: 5, elev: -1 }))).toBe('sfoWait');
    expect(softFieldTarget(st, base({ iasKts: 30, noseFrac: 0, pitchDeg: 12 }))).toBe('sfoEaseOff');
    expect(softFieldTarget(st, base({ iasKts: 30, noseFrac: 0.1, pitchDeg: 10 }))).toBe('sfoHold');
    expect(softFieldTarget(st, base({ iasKts: 30, noseFrac: 0, pitchDeg: PITCH_HIGH_DEG + 0.5 }))).toBe('sfoEase');
    expect(softFieldTarget(st, base({ iasKts: 30, kid: true }))).toBe('sfoKidHold');
  });
  it('the air: stay low under 70 kt, then climb', () => {
    softFieldStep(st, base({ onGround: false, wheelFt: 3, iasKts: 52 }), 0.1);
    expect(softFieldTarget(st, base({ onGround: false, wheelFt: 10, iasKts: 60 }))).toBe('sfoAccel');
    expect(softFieldTarget(st, base({ onGround: false, wheelFt: 30, iasKts: 60 }))).toBe('sfoLow');
    expect(softFieldTarget(st, base({ onGround: false, wheelFt: 10, iasKts: ACCEL_KTS }))).toBe('sfoClimb');
    expect(softFieldTarget(st, base({ onGround: false, wheelFt: 10, iasKts: 60, kid: true }))).toBe('sfoKidLow');
  });
  it('every prompt has words; touch words never say "pull" or "back stick"', () => {
    for (const k of ['sfoPower', 'sfoBack', 'sfoWait', 'sfoHold', 'sfoEaseOff', 'sfoEase', 'sfoLow', 'sfoAccel', 'sfoClimb', 'sfoKidPower', 'sfoKidHold', 'sfoKidEase', 'sfoKidLow', 'sfoKidClimb']) {
      expect(DRILL_TEXT[k]).toBeTruthy();
      expect(coachText(k, { touch: true })).not.toMatch(/pull|back stick|stick fully back/i);
    }
    expect(TOUCH_WORDS.sfoPower).toMatch(/throttle to the top, then hold the stick up/);
    for (const k of ['sfoPower', 'sfoBack', 'sfoWait', 'sfoKidPower']) expect(coachText(k)).toMatch(/S or ↑|↑|Shift/); // keyboard words name the keys
  });
});

describe("softField.js on the game's sim (0182)", () => {
  it('reads the runway, the wheels and the nose wheel from main.js\'s sim', () => {
    const s0 = takeoffSpawn(E16, 30 - E16.displacedM);
    const st = createSoftField(E16);
    const noseStatic = gearConstants(c172).noseShare * c172.massKg * 9.80665;
    const sim = { pos: new Vector3(s0.pos.x, c172.gearHeight, s0.pos.z), groundY: 0, spec: c172, onGround: true, iasKts: 10, gsKts: 10, throttle: 1, wheelLoads: [noseStatic / 2, 1, 1, 0], assist: 'pilot' };
    expect(softFieldPrompt(st, sim, 2)).toBe('sfoPower');
    softFieldSimStep(st, sim, 2, 0.1);
    expect(st.startAlongM).toBeCloseTo(30 - E16.displacedM, 3);
    sim.iasKts = 30;
    softFieldSimStep(st, sim, 2, 0.1);
    expect(st.noseSum / st.noseN).toBeCloseTo(0.5, 3);
    sim.wheelLoads[3] = 10;
    softFieldSimStep(st, sim, 2, 0.1);
    expect(st.tail).toBe(true);
  });
});

describe('gear.js surface μ (0182)', () => {
  // The rolling force on a C172 rolling at 20 m/s, on the runway and on the lesson's soft surface.
  function rollingForce(surfaceMu) {
    const body = { pos: new Vector3(0, c172.gearHeight, 0), vel: new Vector3(0, 0, -20), quat: new Quaternion(), angVel: new Vector3(), groundY: 0, brakePress: 0, surfaceMu };
    const force = new Vector3(0, 0, 0), moment = new Vector3();
    gearForces(body, c172, force, moment);
    const f = new Vector3();
    gearFriction(body, c172, new Vector3(0, 0, -1), 20, f, moment);
    const n = body.wheelLoads.slice(0, 3).reduce((a, b) => a + Math.max(0, b), 0);
    return f.z / n;
  }
  it('rolls at the runway\'s μ without one and at SURFACE_MU with it', () => {
    expect(rollingForce(undefined)).toBeCloseTo(ROLLING_MU, 3);
    expect(rollingForce(SURFACE_MU)).toBeCloseTo(SURFACE_MU, 3);
  });
});
