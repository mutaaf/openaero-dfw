// Unusual-attitude recovery (ticket 0174, src/upset.js): the drill's state machine, order and grade
// driven by synthetic traces; its two missions in the picker; and the boot's WebXR stand-in (src/noXr.js).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three';
import {
  UPSETS, UPSET_TEXT, UPSET_HANDS_S, UPSET_ORDER_CAP, UPSET_LOST_CAP, UPSET_KID_NOTE, UPSET_LEARNER_NOTE,
  createUpset, upsetStep, upsetPrompt, orderKept, gradeUpset, applyUpset, upsetSimStep,
} from '../../src/upset.js';
import { coachText } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions, RECOMMENDED_KEY } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { KTS_TO_MPS } from '../../src/constants.js';
import { WebXRManager } from '../../src/noXr.js';

const DT = 0.05;
const base = (o = {}) => ({ dt: DT, started: true, altFt: 5500, iasKts: 100, pitchDeg: 0, bankDeg: 0, aoaDeg: 3, stallAoaDeg: 14.1,
  throttle: 0.55, pitchIn: 0, rollIn: 0, assisted: false, g: 1, vneKts: 163, ...o });

// Run the drill to the hand-over, then feed `trace(t)` (the step's input overrides) until it ends.
function run(kind, trace, maxS = 30) {
  const st = createUpset(kind);
  while (upsetStep(st, base()) !== 'handover') { /* the instructor's 1.5 s */ }
  let ev = '';
  for (let t = 0; t < maxS && !ev; t += DT) ev = upsetStep(st, base(trace(t)));
  return { st, ev, grade: gradeUpset(st) };
}

// Nose-high, the handbook's way: power in at once, the nose down to the horizon over 2 s, speed builds.
const highGood = (t) => ({ throttle: 1, pitchDeg: Math.max(-2, 35 - t * 18), iasKts: Math.max(55, 60 + (t - 2) * 6), pitchIn: t < 2 ? 0.5 : 0 });
// Nose-low, the handbook's way: idle, the wings level over 2 s, then ease back to the horizon.
const lowGood = (t) => ({ throttle: 0, bankDeg: Math.min(0, -60 + t * 30), pitchDeg: t < 2 ? -25 : Math.min(0, -25 + (t - 2) * 8),
  iasKts: 130 + Math.min(t, 3) * 3, rollIn: t < 2 ? 0.6 : 0, pitchIn: t < 2 ? 0 : -0.15, altFt: 5500 - t * 60, g: t < 2 ? 1.1 : 1.6 });

describe('unusual-attitude missions (0174)', () => {
  it('both drills are in the picker\'s Drills group for the Cessna, deep-linkable, never the recommended first flight', () => {
    const drills = groupMissions(MISSIONS).find((g) => g.id === 'drills').missions.map((m) => m.key);
    for (const [key, kind] of [['upset_nose_high', 'high'], ['upset_nose_low', 'low']]) {
      const m = missionByKey(key);
      expect(m).toMatchObject({ key, kind: 'drill', aircraft: 'c172', upset: kind, aglFt: 5000, kias: 100 });
      expect(drills).toContain(key);
      expect(missionFromLink(`?mission=${key}`)).toBe(key);
      expect(key).not.toBe(RECOMMENDED_KEY);
    }
  });
  it('the set-ups are the ticket\'s: +35° slowing through 60 kt; −25° in a 60° bank, 130 kt and building', () => {
    expect(UPSETS.high).toMatchObject({ pitchDeg: 35, bankDeg: 0, kts: 60 });
    expect(UPSETS.low).toMatchObject({ pitchDeg: -25, bankDeg: -60, kts: 130 });
  });
});

describe('upset.js state machine', () => {
  it('waits for the player to be flying, then the instructor\'s 1.5 s, then hands over', () => {
    const st = createUpset('high');
    for (let i = 0; i < 100; i++) expect(upsetStep(st, base({ started: false }))).toBe('');
    expect(st.phase).toBe('brief');
    let n = 0, ev = '';
    while (!ev) { ev = upsetStep(st, base()); n++; }
    expect(ev).toBe('handover');
    expect(n * DT).toBeCloseTo(UPSET_HANDS_S, 1);
    expect(st.phase).toBe('recover');
  });
  it('nose-high, power then nose down: done, order kept, A or better', () => {
    const r = run('high', highGood);
    expect(r.ev).toBe('done');
    expect(orderKept(r.st)).toBe(true);
    expect(['S', 'A']).toContain(r.grade.grade);
    expect(r.grade.reason).toBeNull();
  });
  it('nose-high, nose down before the power: recovered but out of order, no better than a B', () => {
    const r = run('high', (t) => ({ ...highGood(t), throttle: t < 3 ? 0.55 : 1 }));
    expect(r.ev).toBe('done');
    expect(orderKept(r.st)).toBe(false);
    expect(r.grade.score).toBeLessThanOrEqual(UPSET_ORDER_CAP);
    expect(r.grade.reason).toMatch(/full power first/);
  });
  it('nose-high, held up: the stall warning after 3 s fails it, and a stall fails it', () => {
    const warn = run('high', (t) => ({ pitchDeg: 30, iasKts: 50, aoaDeg: t > 4 ? 11.5 : 5, pitchIn: 0.2 }));
    expect(warn.ev).toBe('failed');
    expect(warn.st.why).toBe('warn');
    const stall = run('high', (t) => ({ pitchDeg: 30, iasKts: 45, aoaDeg: t > 1 ? 15 : 5, pitchIn: -0.5 }));
    expect(stall.st.why).toBe('stall');
    expect(stall.grade.score).toBeLessThanOrEqual(UPSET_LOST_CAP);
    expect(stall.grade.reason).toMatch(/Stalled/);
    // inside the first 3 s the warning is the set-up's, not the pilot's
    expect(run('high', (t) => ({ ...highGood(t), aoaDeg: t < 2.5 ? 12 : 3 })).ev).toBe('done');
  });
  it('nose-low, idle, wings, then ease back: done, A or better', () => {
    const r = run('low', lowGood);
    expect(r.ev).toBe('done');
    expect(r.st.pulled).toBe(false);
    expect(['S', 'A']).toContain(r.grade.grade);
  });
  it('nose-low, pulling in the bank: the pull is named, recovered or not', () => {
    const pullThenLevel = run('low', (t) => ({ ...lowGood(t), pitchIn: t < 1 ? -0.5 : lowGood(t).pitchIn }));
    expect(pullThenLevel.st.pulled).toBe(true);
    expect(pullThenLevel.grade.score).toBeLessThanOrEqual(UPSET_ORDER_CAP);
    expect(pullThenLevel.grade.reason).toMatch(/pulled while banked/);
    const overG = run('low', (t) => ({ bankDeg: -60, pitchDeg: -20, pitchIn: -0.8, rollIn: 0, g: 2 + t * 4, throttle: 0.75 }));
    expect(overG.st.why).toBe('g');
    expect(overG.grade.reason).toMatch(/pulled while banked/);
  });
  it('VNE fails it, and so do 20 s without level', () => {
    expect(run('low', (t) => ({ bankDeg: -60, pitchDeg: -25, iasKts: 130 + t * 8, rollIn: 0.3, throttle: 0.75 })).st.why).toBe('vne');
    const slow = run('low', () => ({ bankDeg: -20, pitchDeg: -3, iasKts: 120, rollIn: 0.3, throttle: 0 }));
    expect(slow.st.why).toBe('time');
    expect(slow.grade.reason).toMatch(/20 s/);
  });
  it('hands off the whole way is not a recovery: failed in its own words', () => {
    const r = run('low', (t) => ({ throttle: 0.75, bankDeg: Math.min(0, -60 + t * 10), pitchDeg: t < 6 ? -10 : 0, iasKts: 150 }));
    expect(r.st.why).toBe('hands');
    expect(r.grade.reason).toMatch(/hardly touched the stick.*throttle to idle/);
    expect(r.grade.reason).not.toMatch(/pulled/);
  });
  it('Kid\'s recovery carries the note; a failed one does not', () => {
    const st = run('high', highGood).st;
    expect(gradeUpset(st, 'kid').note).toBe(UPSET_KID_NOTE);
    expect(gradeUpset(run('high', () => ({ pitchDeg: 30, iasKts: 45, aoaDeg: 15 })).st, 'kid').note).toBeNull();
  });
  // Panel (first-timer): Learner's assists roll back past 45° and hold the nose. The drill reads the player's own
  // stick (main.js sim.pitchIn / rollIn), never the assists' output: hands off on Kid or Learner is the assists'
  // recovery (a note), not a fail and not the player's pull.
  it('the throttle alone, or a nudge of the stick, is not flying it (physics panel: idle only graded B 78)', () => {
    const idleOnly = run('low', (t) => ({ throttle: 0, bankDeg: Math.min(0, -60 + t * 10), pitchDeg: t < 6 ? -10 : 0, iasKts: 140 }));
    expect(idleOnly.st.why).toBe('hands');
    const nudge = run('low', (t) => ({ throttle: 0, rollIn: t < 0.3 ? 0.5 : 0, bankDeg: Math.min(0, -60 + t * 10), pitchDeg: t < 6 ? -10 : 0, iasKts: 140 }));
    expect(nudge.st.why).toBe('hands');
  });
  it('a gentle pull in the bank is caught by the g it pulls; a brush with the stall band is not a stall warning', () => {
    const gentle = run('low', (t) => ({ ...lowGood(t), pitchIn: t < 3 ? -0.1 : lowGood(t).pitchIn, g: t < 3 ? 2.4 : lowGood(t).g, bankDeg: t < 3 ? -55 : 0 }));
    expect(gentle.st.pulled).toBe(true);
    // α in the band for 0.5 s with the nose up, after 3 s: not the warning; nose below the horizon: not either.
    expect(run('high', (t) => ({ ...highGood(t), aoaDeg: t > 3.2 && t < 3.7 ? 11.5 : 3 })).ev).toBe('done');
    expect(run('high', (t) => ({ ...highGood(t), aoaDeg: t > 3.2 && t < 5 ? 11.5 : 3, pitchDeg: -4 })).ev).toBe('done');
  });
  it('Kid and Learner hands off: the assists level it, no "hands" fail, no pull, Learner gets its own note', () => {
    const assists = (t) => ({ assisted: true, throttle: 0.75, bankDeg: Math.min(0, -60 + t * 20), pitchDeg: Math.min(0, -25 + t * 6), iasKts: 140 });
    const r = run('low', assists);
    expect(r.ev).toBe('done');
    expect(r.st.moved).toBe(false);
    expect(r.st.pulled).toBe(false);
    expect(gradeUpset(r.st, 'learner').note).toBe(UPSET_LEARNER_NOTE);
    expect(gradeUpset(r.st, 'kid').note).toBe(UPSET_KID_NOTE);
    // A Learner who flew it gets no note.
    const flown = run('low', (t) => ({ ...lowGood(t), assisted: true }));
    expect(gradeUpset(flown.st, 'learner').note).toBeNull();
  });
});

describe('upset.js coach', () => {
  it('says each step in the handbook\'s order, and every word resolves', () => {
    const st = createUpset('high');
    expect(upsetPrompt(st, base(), false)).toBe('uaHands');
    st.phase = 'recover'; st.thr0 = 0.55;
    expect(upsetPrompt(st, base({ pitchDeg: 30, throttle: 0.55 }), false)).toBe('uaPower');
    st.tPower = 0.5;
    expect(upsetPrompt(st, base({ pitchDeg: 30, throttle: 1 }), false)).toBe('uaPush');
    expect(upsetPrompt(st, base({ pitchDeg: 0, iasKts: 60, throttle: 1 }), false)).toBe('uaBuild');
    expect(upsetPrompt(st, base({ pitchDeg: 0, iasKts: 80, throttle: 1 }), false)).toBe('uaHold');
    expect(upsetPrompt(st, base(), true)).toBe('uaKid');
    const low = createUpset('low');
    low.phase = 'recover';
    expect(upsetPrompt(low, base({ bankDeg: -60, pitchDeg: -25, iasKts: 130, throttle: 0.75 }), false)).toBe('uaIdle');
    expect(upsetPrompt(low, base({ bankDeg: -60, pitchDeg: -25, iasKts: 130, throttle: 0 }), false)).toBe('uaRoll');
    expect(upsetPrompt(low, base({ bankDeg: 0, pitchDeg: -20, iasKts: 130, throttle: 0 }), false)).toBe('uaEase');
    for (const k of Object.keys(UPSET_TEXT)) expect(coachText(k)).toBe(UPSET_TEXT[k]);
  });
});

describe('applyUpset', () => {
  it('sets the attitude, keeps the heading, and points the velocity aoaDeg under the nose at the set-up\'s IAS', () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2); // heading 090
    const body = { quat: q, vel: new Vector3(55, 0, 0), angVel: new Vector3(1, 2, 3), iasKts: 100, tasKts: 55 / KTS_TO_MPS, throttle: 0.6, engineN: 0.6 }; // east, 55 m/s TAS at 100 KIAS
    applyUpset(body, UPSETS.low);
    const st = createUpset('low');
    const sim = { ...body, pos: new Vector3(0, 1600, 0), aoaDeg: 1, spec: AIRCRAFT_DATABASE.c172, flapsIndex: 0, elevInput: 0, aileronInput: 0, loadFactor: 1 };
    st.phase = 'recover';
    upsetSimStep(st, sim, DT, true);
    // read back through the game's adapter: −25° pitch, 60° left, heading still 090
    const fwd = new Vector3(0, 0, -1).applyQuaternion(body.quat);
    expect(Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI).toBeCloseTo(90, 3);
    expect(Math.asin(fwd.y) * 180 / Math.PI).toBeCloseTo(-25, 3);
    const v = body.vel.clone().normalize();
    expect(Math.acos(v.dot(fwd)) * 180 / Math.PI).toBeCloseTo(UPSETS.low.aoaDeg, 3);
    expect(body.vel.length()).toBeCloseTo(130 * KTS_TO_MPS * 55 / (100 * KTS_TO_MPS), 3);
    expect(body.angVel.length()).toBe(0);
    expect(body.throttle).toBe(0.75);
    expect(st.maxKts).toBe(130); // the adapter read the set-up's IAS
  });
});

describe('noXr.js (the boot\'s WebXRManager stand-in)', () => {
  it('answers WebGLRenderer with XR off', () => {
    const xr = new WebXRManager();
    expect(xr.enabled).toBe(false);
    expect(xr.isPresenting).toBe(false);
    expect(xr.hasDepthSensing()).toBe(false);
    const f = () => {};
    xr.addEventListener('sessionstart', f);
    xr.removeEventListener('sessionstart', f);
    expect(() => { xr.setAnimationLoop(null); xr.dispose(); }).not.toThrow();
    expect(xr.getEnvironmentBlendMode()).toBeUndefined();
  });
  it('has every member three\'s WebGL renderer reads outside a presenting session (a three upgrade that asks for more fails here)', () => {
    const dir = 'node_modules/three/src/renderers/';
    const files = ['WebGLRenderer.js', ...readdirSync(`${dir}webgl`).map((f) => `webgl/${f}`)];
    const used = new Set();
    for (const f of files) for (const m of readFileSync(dir + f, 'utf8').matchAll(/\bxr\.(\w+)/g)) used.add(m[1]);
    // Only behind `xr.isPresenting === true`, which the stand-in never is.
    const presenting = ['getCamera', 'updateCamera', 'getDepthSensingMesh'];
    const xr = new WebXRManager();
    for (const k of used) if (!presenting.includes(k)) expect(k in xr, `renderer reads xr.${k}`).toBe(true);
    expect(used.has('getEnvironmentBlendMode')).toBe(true);
  });
});
