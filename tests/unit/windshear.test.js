import { describe, it, expect } from 'vitest';
import {
  shearAt, createShear, stepShear, shearTarget, gradeShear, addShearWind, kidEscape, shearLive,
  SHEAR_PROFILE, SHEAR_END_S, SHEAR_WARN_S, SHEAR_START_FT, SHEAR_END, SHEAR_KEY,
} from '../../src/windshear.js';
import { coachText } from '../../src/coach.js';
import { missionByKey, groupMissions, MISSIONS } from '../../src/missions.js';

// A step input: wheels at aglFt, pitch, throttle; the 737's flaps 30 stall angle (14.1°).
const step = (st, t, o = {}) => stepShear(st, {
  t, dt: 0.1, aglFt: 550, vsFpm: -800, pitchDeg: 2, bankDeg: 0, throttle: 0.25, aoaDeg: 6, stallAoaDeg: 14.1,
  onGround: false, config: 5, ...o,
});

describe('the microburst (ticket 0112)', () => {
  it('builds a headwind, loses 35 kt of it in 15 s with a 1,500 fpm downdraft, and ends', () => {
    expect(shearAt(0)).toEqual({ headKts: 0, downFpm: 0 });
    expect(shearAt(5)).toEqual({ headKts: 15, downFpm: 0 });
    expect(shearAt(20).headKts).toBe(-20);
    expect(shearAt(20).downFpm).toBe(1500);
    expect(shearAt(5).headKts - shearAt(20).headKts).toBe(35);
    expect(shearAt(7.5)).toEqual({ headKts: 7.5, downFpm: 450 });
    expect(shearAt(SHEAR_END_S)).toEqual({ headKts: 0, downFpm: 0 });
    expect(shearAt(-1)).toEqual({ headKts: 0, downFpm: 0 });
    expect(SHEAR_PROFILE.at(-1)[0]).toBe(SHEAR_END_S);
    // Fills the object it is given (no allocation per sub-step).
    const out = { headKts: 9, downFpm: 9 };
    expect(shearAt(14, out)).toBe(out);
    expect(out).toEqual({ headKts: -15, downFpm: 1500 });
  });

  it('blows the headwind against the runway course, and the downdraft down', () => {
    const st = createShear(0.6, -0.8);
    const sim = { simTime: 105, windVec: { x: 1, y: 0, z: 2 }, pos: { y: 300 }, groundY: 0, spec: { gearHeight: 0 } };
    addShearWind(st, sim); // on the final: no shear yet
    expect(sim.windVec).toEqual({ x: 1, y: 0, z: 2 });
    st.phase = 'shear'; st.t0 = 100;
    addShearWind(st, sim); // 5 s in: 15 kt on the nose
    expect(sim.windVec.x).toBeCloseTo(1 - 0.6 * 15 * 0.514444, 6);
    expect(sim.windVec.z).toBeCloseTo(2 + 0.8 * 15 * 0.514444, 6);
    sim.simTime = 120; sim.windVec = { x: 0, y: 0, z: 0 };
    addShearWind(st, sim); // the core: a 20 kt tailwind, 1,500 fpm down
    expect(sim.windVec.x).toBeCloseTo(0.6 * 20 * 0.514444, 6);
    expect(sim.windVec.y).toBeCloseTo(-1500 * 0.3048 / 60, 6);
    // Near the ground the downdraft turns into the outflow: half at 200 ft, none on the runway.
    sim.pos.y = 200 * 0.3048; addShearWind(st, sim);
    expect(sim.windVec.y).toBeCloseTo(-750 * 0.3048 / 60, 6);
    sim.pos.y = 0; addShearWind(st, sim);
    expect(sim.windVec.y).toBeCloseTo(0, 9);
  });
});

describe('the drill', () => {
  it('starts at 600 ft, warns 7 s in, and is clear only past the shear, climbing and high', () => {
    const st = createShear();
    expect(step(st, 0, { aglFt: 700 })).toBe('');
    expect(st.phase).toBe('final');
    expect(step(st, 1, { aglFt: SHEAR_START_FT })).toBe('start');
    expect(shearLive(st)).toBe(true);
    expect(step(st, 1 + SHEAR_WARN_S - 0.1)).toBe('');
    expect(st.phase).toBe('shear');
    expect(kidEscape(st)).toBe(false);
    expect(step(st, 1 + SHEAR_WARN_S)).toBe('warning');
    expect(kidEscape(st)).toBe(true);
    expect(step(st, 9, { throttle: 1 })).toBe('');
    expect(st.maxS).toBeCloseTo(1, 6);
    expect(step(st, 12, { throttle: 1, pitchDeg: 13 })).toBe('');
    expect(st.pitchS).toBeCloseTo(4, 6);
    expect(step(st, 20, { throttle: 1, pitchDeg: 15, aglFt: 420 })).toBe('');
    // Climbing and high but still in it, then past it but too low: not clear yet.
    expect(step(st, 30, { throttle: 1, pitchDeg: 15, aglFt: 900, vsFpm: 1500 })).toBe('');
    expect(step(st, 1 + SHEAR_END_S, { throttle: 1, pitchDeg: 15, aglFt: 450, vsFpm: 1500 })).toBe('');
    expect(step(st, 2 + SHEAR_END_S, { throttle: 1, pitchDeg: 15, aglFt: 1500, vsFpm: 2000 })).toBe('clear');
    expect(st).toMatchObject({ phase: 'clear', startFt: 600, lowFt: 420, minPitchDeg: 15, ground: false, stalled: false });
    expect(step(st, 60)).toBe('');
  });

  it('fails on the ground, or when it is not out of it 40 s past the shear', () => {
    const a = createShear();
    step(a, 0, { aglFt: 600 });
    expect(step(a, 5, { onGround: true, aglFt: 0 })).toBe('failed');
    expect(a).toMatchObject({ phase: 'failed', ground: true, lowFt: 0 });
    const b = createShear();
    step(b, 0, { aglFt: 600 });
    step(b, SHEAR_WARN_S);
    expect(step(b, SHEAR_END_S + 39, { aglFt: 300, vsFpm: 0 })).toBe('');
    expect(step(b, SHEAR_END_S + 40, { aglFt: 300, vsFpm: 0 })).toBe('failed');
    expect(b.ground).toBe(false);
  });

  it('records the stick shaker, a stall, the bank and a gear or flap change', () => {
    const st = createShear();
    step(st, 0, { aglFt: 600 });
    step(st, SHEAR_WARN_S);
    step(st, 8, { aoaDeg: 11.5, bankDeg: -12 });
    expect(st.shakerS).toBeCloseTo(0.1, 6);
    expect(st.stalled).toBe(false);
    step(st, 9, { aoaDeg: 14.5, config: 4 });
    expect(st).toMatchObject({ stalled: true, configChanged: true, peakBankDeg: 12 });
  });

  it('a nose lowered after the power came in is a dive; a sag before it, or low before the pull-up had time, is not', () => {
    const st = createShear();
    step(st, 0, { aglFt: 600 });
    step(st, SHEAR_WARN_S, { pitchDeg: 4 });
    step(st, 7.5, { pitchDeg: 2 }); // a frozen pilot's nose sags: the reaction's, not a dive
    expect(st.diveDeg).toBe(0);
    step(st, 8, { pitchDeg: 2, throttle: 1 });
    step(st, 8.5, { pitchDeg: 1, throttle: 1 });
    expect(st.diveDeg).toBeCloseTo(1, 6);
    expect(st.minPitchDeg).toBe(Infinity); // full power at 1 s: the hold counts from 6 s
    step(st, SHEAR_WARN_S + 6, { pitchDeg: -3, throttle: 1 });
    expect(st.diveDeg).toBeCloseTo(5, 6);
    expect(st.minPitchDeg).toBe(-3);
    // No power yet: the hold counts from 11 s.
    const late = createShear();
    step(late, 0, { aglFt: 600 });
    step(late, SHEAR_WARN_S);
    step(late, SHEAR_WARN_S + 10, { pitchDeg: 2 });
    expect(late.minPitchDeg).toBe(Infinity);
    step(late, SHEAR_WARN_S + 11, { pitchDeg: 2 });
    expect(late.minPitchDeg).toBe(2);
  });
});

describe('the coach', () => {
  const s = (o = {}) => ({ throttle: 1, pitchDeg: 15, bankDeg: 0, aoaDeg: 8, stallAoaDeg: 14.1, vsFpm: -500, kid: false, ...o });
  it('says nothing on the final above it; in it: power, then pitch, then hold', () => {
    const st = createShear();
    expect(shearTarget(st, s())).toBe(null);
    st.phase = 'shear';
    expect(shearTarget(st, s())).toBe('wsGain');
    expect(shearTarget(st, s({ kid: true }))).toBe(null);
    st.phase = 'warning';
    expect(shearTarget(st, s({ throttle: 0.3, pitchDeg: 2 }))).toBe('wsMax');
    expect(shearTarget(st, s({ pitchDeg: 2 }))).toBe('wsPitch');
    st.pitchS = 4;
    expect(shearTarget(st, s({ pitchDeg: 4 }))).toBe('wsHold');
    expect(shearTarget(st, s({ aoaDeg: 12 }))).toBe('wsShaker');
    expect(shearTarget(st, s({ bankDeg: 15 }))).toBe('wsLevel');
    expect(shearTarget(st, s())).toBe('wsHold');
    expect(shearTarget(st, s({ vsFpm: 1200 }))).toBe('wsClear');
    expect(shearTarget(st, s({ kid: true, throttle: 0 }))).toBe('wsKid');
    st.phase = 'clear';
    expect(shearTarget(st, s())).toBe(null);
    for (const k of ['wsGain', 'wsMax', 'wsPitch', 'wsHold', 'wsShaker', 'wsLevel', 'wsClear', 'wsKid']) expect(coachText(k)).toMatch(/\w/);
    // Which way is nose up: thumb up on the touch stick, S or ↑ on the keyboard.
    expect(coachText('wsPitch', { touch: true })).toMatch(/stick up/);
    expect(coachText('wsShaker', { touch: true })).toMatch(/stick down/);
    expect(coachText('wsPitch')).toMatch(/S or ↑/);
  });
});

describe('the grade', () => {
  const done = (o = {}) => ({ ...createShear(), phase: 'clear', startFt: 600, lowFt: 450, maxS: 0.8, pitchS: 3.5, minPitchDeg: 14, shakerS: 0, ...o });
  it('a prompt escape that held the nose up is an A or better', () => {
    const g = gradeShear(done());
    expect(['S', 'A']).toContain(g.grade);
    expect(g.reason).toBe(null);
    expect(g.factors.map((f) => f.key)).toEqual(['reaction', 'pitch', 'hold', 'height', 'shaker']);
  });
  it('a nose-down chase for speed is capped at C, and grades below the escape', () => {
    const esc = gradeShear(done());
    const chase = gradeShear(done({ minPitchDeg: 6, diveDeg: 6, lowFt: 190, pitchS: null }));
    expect(chase.score).toBeLessThan(esc.score);
    expect(chase.score).toBeLessThanOrEqual(69);
    expect(chase.reason).toMatch(/chase the airspeed/);
  });
  it('the ground is a CRASH; not out of it or a stall is a D at best; a gear or flap change a C', () => {
    expect(gradeShear(done({ phase: 'failed', ground: true, lowFt: 0 }))).toMatchObject({ grade: 'CRASH', score: 0, title: 'Windshear: not out of it' });
    expect(gradeShear(done({ phase: 'failed' })).score).toBeLessThanOrEqual(54);
    expect(gradeShear(done({ stalled: true })).score).toBeLessThanOrEqual(54);
    expect(gradeShear(done({ configChanged: true })).score).toBeLessThanOrEqual(69);
    // Kid's assists flew it: the power is the plane's, and so are its gear and flaps.
    const kid = gradeShear(done({ maxS: 0, configChanged: true }), true);
    expect(kid.note).toMatch(/Kid level/);
    expect(kid.factors[0].value).toBe('the plane did it');
    expect(kid.reason).toBe(null);
  });
  it('a slow escape gets advice on its weakest part', () => {
    expect(gradeShear(done({ maxS: 5 })).reason).toMatch(/Full power the moment/);
  });
});

describe('the mission', () => {
  it('is the 737 on a 3 NM final to DFW 35C, listed with DFW', () => {
    const m = missionByKey(SHEAR_KEY);
    expect(m).toMatchObject({ key: SHEAR_KEY, kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 3, aircraft: 'b738', windshear: true });
    expect(SHEAR_END.id).toMatch(/35C/);
    expect(groupMissions(MISSIONS).find((g) => g.id === 'KDFW').missions.map((x) => x.key)).toContain(SHEAR_KEY);
  });
});
