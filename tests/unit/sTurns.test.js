// S-turns across a road (ticket 0224): the lesson's pure logic. The flying is tests/flight/sTurns.test.js.
import { describe, it, expect } from 'vitest';
import {
  createSTurns, sStep, sPrompt, sBankDeg, sKidGuide, gradeSTurns, spreadFt, kidGuide, sideOf, centreX, nextPoleRelDeg, makeMarker, seatMarker,
  HALVES, POLES, SPREAD_B_FT, SPREAD_C_FT, SPREAD_D_FT, CROSS_B_DEG, ASSIST_BANK_DEG, S_TEXT, S_TOUCH, KID_NOTE, SNAP, OUT_S, OUT_LEAD_S,
} from '../../src/sTurns.js';
import * as stc from '../../src/sTurns.js';
import * as rc from '../../src/rectCourse.js';
import { MISSIONS } from '../../src/missions.js';
import { DRILL_TEXT, TOUCH_WORDS } from '../../src/coach.js';
import { FT_TO_M } from '../../src/constants.js';

const MISSION = MISSIONS.find((m) => m.key === 's_turns_road');
const R = 1500 * FT_TO_M;
const DT = 0.1;
const V = 48;

// The S asked as a function of its length s from the first pole: half k's middle 2k+1 radii west, north of the road
// for even k (left turns, anticlockwise from above), south for odd (right turns). In the sim's frame +x east, +z south.
function sAt(st, s, rOf = () => st.R, x0 = st.x0) {
  let k = 0;
  for (;;) {
    const r = rOf(k);
    if (s <= Math.PI * r || k === HALVES - 1) {
      const th = s / r, cx = x0 - r, side = sideOf(k);
      // From the half's start (at the east end, x0) round to its west end: angle θ from east, north side z = −r sin θ.
      const z = side < 0 ? -r * Math.sin(th) : r * Math.sin(th);
      const vx = -V * Math.sin(th), vz = side < 0 ? -V * Math.cos(th) : V * Math.cos(th);
      return { x: cx + r * Math.cos(th), z: st.z0 + z, vx, vz, k };
    }
    s -= Math.PI * r; x0 -= 2 * r; k++;
  }
}
const input = (p, extra = {}) => ({ dt: DT, wx: 0, wz: -6, altFt: 1700, iasKts: 90, bankDeg: 0, stalled: false, ...p, ...extra });
function flyLesson(st, { rOf, extra = () => ({}), maxS = 400, across = 0 } = {}) {
  const evs = [];
  let z = MISSION.pos[1], t = 0;
  while (st.phase === 'entry' && t < 60) {
    const ev = sStep(st, input({ x: st.x0 + across, z, vx: 0, vz: -V }));
    if (ev) evs.push(ev);
    z -= V * DT; t += DT;
  }
  for (let s = V * DT; t < maxS && st.phase === 'course'; t += DT, s += V * DT) {
    const p = sAt(st, s, rOf, st.x0 + across);
    const ev = sStep(st, input(p, extra(p, s)));
    if (ev) evs.push(ev);
  }
  return evs;
}

describe('S-turns across a road (0224): the mission', () => {
  it('flies the Cessna downwind toward an east-west road at a right angle, the first pole dead ahead', () => {
    expect(MISSION).toMatchObject({ kind: 'drill', aircraft: 'c172', aglFt: 1000, kias: 90, radiusFt: 1500, sTurns: true, hdg: 0, wind: [180, 12] });
    expect((MISSION.wind[0] + 180) % 360).toBe(MISSION.hdg); // heading the way the wind blows: downwind (AFH 3C p. 7-9)
    expect(MISSION.pos[0]).toBe(MISSION.road[0]); // straight at the first pole
    expect(MISSION.pos[1] - MISSION.road[1]).toBeGreaterThan(800); // south of the road (+z south), a few seconds out
    expect(MISSION.blurb).toMatch(/1,000 ft \(±100\) and 90 knots \(±10\)/);
    expect(MISSION.blurb).toMatch(/never past 45°/);
  });
  it('exports the ground-reference calls main.js uses', () => {
    for (const k of ['create', 'live', 'simStep', 'coachWord', 'grade', 'kidGuide', 'drawHud', 'makeMarker', 'seatMarker', 'debugSnap', 'PLACE', 'SNAP']) {
      expect(typeof stc[k]).toBe(typeof rc[k]);
    }
    expect(SNAP).toBe('sTurns');
  });
  it('adds its coach words, with touch words for the height', () => {
    for (const k of Object.keys(S_TEXT)) expect(DRILL_TEXT[k]).toBe(S_TEXT[k]);
    for (const k of Object.keys(S_TOUCH)) expect(TOUCH_WORDS[k]).toMatch(/stick/);
  });
});

describe('S-turns: the course', () => {
  it('starts as the Cessna crosses the road northbound at the first pole, and completes on the fourth crossing back', () => {
    const st = createSTurns(MISSION);
    const evs = flyLesson(st);
    expect(evs).toEqual(['course', 'complete']);
    expect(st.half).toBe(HALVES);
    const { meanFt, sdFt } = spreadFt(st);
    expect(Math.abs(meanFt - 1500)).toBeLessThan(15);
    expect(sdFt).toBeLessThan(15);
    const g = gradeSTurns(st);
    expect(g.grade).toBe('S');
    expect(g.title).toBe('S-turns across a road');
    expect(g.track.sTurns).toBe(HALVES);
    expect(g.track.start).toBeGreaterThanOrEqual(0);
  });
  it('the radius is judged on each half-circle\'s own middle: unequal half-circles spread, an even S of the wrong size does not', () => {
    const uneven = createSTurns(MISSION);
    flyLesson(uneven, { rOf: (k) => (k % 2 ? 0.7 : 1.3) * R });
    expect(uneven.phase).toBe('complete');
    expect(spreadFt(uneven).sdFt).toBeGreaterThan(SPREAD_C_FT);
    expect(['C', 'D']).toContain(gradeSTurns(uneven).grade);
    const small = createSTurns(MISSION);
    flyLesson(small, { rOf: () => 0.75 * R });
    expect(small.phase).toBe('complete');
    expect(spreadFt(small).sdFt).toBeLessThan(15);
    const g = gradeSTurns(small);
    expect(g.grade).toBe('B'); // even, but 375 ft small
    expect(g.reason).toMatch(/not the size asked/);
  });
  it('banked over the road is no better than a B (3C: the wings level just as it crosses)', () => {
    const st = createSTurns(MISSION);
    flyLesson(st, { extra: (p) => ({ bankDeg: 25 * sideOf(p.k) }) });
    expect(st.maxCrossDeg).toBeGreaterThan(CROSS_B_DEG);
    const g = gradeSTurns(st);
    expect(g.grade).toBe('B');
    expect(g.reason).toMatch(/Banked 25° over the road/);
  });
  it('an even S flown from a crossing off the pole, or of the wrong size, is judged on its own half-circles (physics panel)', () => {
    // Crossed 400 m east of the first pole, then an even S from there: the guide, coach and grade all measure from the
    // pilot's own crossing (they fought it, C 69, when the half-circles were anchored on the poles).
    const off = createSTurns(MISSION);
    flyLesson(off, { across: 400 });
    expect(off.phase).toBe('complete');
    expect(gradeSTurns(off).grade).toBe('S');
    // A big even S finishes (it failed 'drift' with a wind message when its middle drifted off the poles' middles).
    const big = createSTurns(MISSION);
    flyLesson(big, { rOf: () => 1.3 * R });
    expect(big.phase).toBe('complete');
    expect(gradeSTurns(big).reason).toMatch(/not the size asked/);
  });
  it('a crossing well off square is no better than a B (3C: "at a 90° angle")', () => {
    const st = createSTurns(MISSION);
    let z = MISSION.pos[1], x = MISSION.road[0] - 600;
    while (st.phase === 'entry') { sStep(st, input({ x, z, vx: V * 0.5, vz: -V * 0.87 })); z -= V * 0.87 * DT; x += V * 0.5 * DT; }
    expect(st.maxSquareDeg).toBeCloseTo(30, 0);
    const x1 = st.xIn;
    for (let s = V * DT; st.phase === 'course'; s += V * DT) sStep(st, input(sAt(st, s, () => R, x1)));
    const g = gradeSTurns(st);
    expect([st.phase, st.why, g.reason]).toEqual(['complete', null, expect.stringMatching(/off square/)]);
    expect(g.grade).toBe('B');
  });
  it('a crossing far from the first pole is a missed entry', () => {
    const st = createSTurns(MISSION);
    expect(flyLesson(st, { across: 2 * R })).toEqual(['failed']);
    expect(st.why).toBe('missed');
    expect(gradeSTurns(st).reason).toMatch(/first pole/);
  });
  it('turning right first (east) is the wrong way', () => {
    const st = createSTurns(MISSION);
    flyLesson(st, { rOf: () => R });
    const east = createSTurns(MISSION);
    let z = MISSION.pos[1];
    while (east.phase === 'entry') { sStep(east, input({ x: east.x0, z, vx: 0, vz: -V })); z -= V * DT; }
    for (let s = V * DT; east.phase === 'course'; s += V * DT) {
      const th = s / R; // a right turn north of the road: the middle east of the pole
      sStep(east, input({ x: east.x0 + R - R * Math.cos(th), z: east.z0 - R * Math.sin(th), vx: V * Math.sin(th), vz: -V * Math.cos(th), bankDeg: 25 }));
    }
    expect(east.why).toBe('wrongWay');
    expect(east.ct).toBeLessThan(15); // told a few seconds in, not a half-circle later (physics panel)
    expect(gradeSTurns(east).reason).toMatch(/wrong way/);
  });
  it('crossing back too soon is shallow; a stall, the height and drifting away fail', () => {
    const st = createSTurns(MISSION);
    let z = MISSION.pos[1];
    while (st.phase === 'entry') { sStep(st, input({ x: st.x0, z, vx: 0, vz: -V })); z -= V * DT; }
    sStep(st, input({ x: st.x0 - 10, z: st.z0 - 50, vx: -20, vz: -10 }));
    sStep(st, input({ x: st.x0 - 30, z: st.z0 + 5, vx: -20, vz: 10 }));
    expect(st.why).toBe('shallow');
    for (const [extra, why] of [[{ stalled: true }, 'stall'], [{ altFt: 2300 }, 'height']]) {
      const s2 = createSTurns(MISSION);
      flyLesson(s2, { extra: (p, s) => (s > 500 ? extra : {}) });
      expect(s2.why).toBe(why);
      expect(gradeSTurns(s2).score).toBeLessThanOrEqual(54);
    }
    const s3 = createSTurns(MISSION);
    flyLesson(s3, { rOf: () => 4 * R });
    expect(s3.why).toBe('drift');
  });
  it('Kid\'s note, and the e2e hook ends it graded on the half-circles done', () => {
    const st = createSTurns(MISSION);
    flyLesson(st);
    expect(gradeSTurns(st, true).note).toBe(KID_NOTE);
    const e = createSTurns(MISSION);
    let z = MISSION.pos[1];
    while (e.phase === 'entry') { sStep(e, input({ x: e.x0, z, vx: 0, vz: -V })); z -= V * DT; }
    globalThis.window = globalThis.window ?? undefined;
    e.done = true;
    expect(sStep(e, input({ x: e.x0 - 10, z: e.z0 - 50, vx: -20, vz: -40 }))).toBe('complete');
  });
});

describe('S-turns: the ground-track law and the coach', () => {
  const st = createSTurns(MISSION);
  st.phase = 'course'; st.live = true; st.alt0 = 1700; st.half = 0; st.xIn = st.x0;
  it('banks left north of the road, right south, steeper with the wind behind (tan φ = Vg²/(gR))', () => {
    const top = { x: centreX(st), z: st.z0 - R, vx: -V, vz: 0 };
    const b0 = sBankDeg(st, top);
    expect(b0).toBeLessThan(-20);
    expect(b0).toBeCloseTo(-Math.atan(V * V / (9.80665 * R)) * 180 / Math.PI, 0);
    expect(sBankDeg(st, { ...top, vx: -V * 1.2 })).toBeLessThan(b0);
    const s1 = { ...st, half: 1, xIn: st.x0 - 2 * R };
    expect(sBankDeg(s1, { x: centreX(s1), z: st.z0 + R, vx: -V, vz: 0 })).toBeGreaterThan(20);
  });
  it('eases the bank to level as it closes on the road', () => {
    // On the circle, closing on the road at its west end (the north half: heading south, a little west).
    const on = (depth) => { const a = Math.sqrt(R * R - depth * depth); return { x: centreX(st) - a, z: st.z0 - depth, vx: -V * depth / R, vz: V * a / R }; };
    const full = sBankDeg(st, on(R * 0.7));
    expect(full).toBeLessThan(-20);
    const mid = sBankDeg(st, on(V * (OUT_LEAD_S + OUT_S / 2)));
    expect(mid / full).toBeGreaterThan(0.4);
    expect(mid / full).toBeLessThan(0.65);
    expect(sBankDeg(st, on(V * OUT_LEAD_S * 0.5))).toBeCloseTo(0, 5);
  });
  it('says roll left, steep with the wind behind at the first crossing, once; then roll out before the road', () => {
    const s = createSTurns(MISSION);
    s.phase = 'course'; s.live = true; s.alt0 = 1700; s.kts0 = 90; s.iasF = 90; s.xIn = s.x0;
    s.d = R;
    expect(sPrompt(s, input({ x: s.x0, z: s.z0 - 1, vx: 0, vz: -V, wz: -6 }), false)).toBe('stRollLSteep');
    s.ht = 2; // mid-roll, the wind abeam now: the word holds (lesson 2026-11-24)
    expect(sPrompt(s, input({ x: s.x0 - 50, z: s.z0 - 200, vx: -V, vz: 0, wz: -6, bankDeg: -5 }), false)).toBe('stRollLSteep');
    s.ht = 30; s.depth = 5 * V; s.d = R; s.maxDepth = R;
    expect(sPrompt(s, input({ x: centreX(s) - R + 10, z: s.z0 - 5 * V, vx: 0, vz: V, wz: -6, bankDeg: -20 }), false)).not.toBe('stRollOut');
    s.depth = 3 * V; // 3 s from the road
    expect(sPrompt(s, input({ x: centreX(s) - R + 10, z: s.z0 - 3 * V, vx: 0, vz: V, wz: -6, bankDeg: -20 }), false)).toBe('stRollOut');
    s.depth = V; // held to the road, whatever the bank says (panel: a flash of "shallower" over the road)
    expect(sPrompt(s, input({ x: centreX(s) - R + 200, z: s.z0 - V, vx: -V / 2, vz: V, wz: -6, bankDeg: -2 }), false)).toBe('stRollOut');
    expect(sPrompt(s, input({ x: s.x0, z: s.z0 - 1, vx: 0, vz: -V, bankDeg: -60 }), false)).toBe('stSteep');
    expect(sPrompt(s, input({ x: s.x0, z: s.z0, vx: 0, vz: -V }), true)).toBe('stKid');
    const n = createSTurns(MISSION); n.live = true;
    expect(sPrompt(n, input({ x: n.x0, z: n.z0 + 500, vx: 0, vz: -V }), false)).toBe('stFlyOn');
  });
  it('the second half starts gently into the wind; then steeper or shallower by the law\'s bank, and hold it on it', () => {
    const s = createSTurns(MISSION);
    s.phase = 'course'; s.live = true; s.alt0 = 1700; s.kts0 = 90; s.iasF = 90; s.half = 1; s.d = R; s.xIn = s.x0 - 2 * R;
    expect(sPrompt(s, input({ x: s.x0 - 2 * R, z: s.z0 + 1, vx: 0, vz: V, wz: -6 }), false)).toBe('stRollRGentle');
    s.ht = 15; s.depth = R;
    // At the half's southernmost point heading west, turning right: the wind (from the south) is coming round behind.
    expect(sPrompt(s, input({ x: centreX(s), z: s.z0 + R, vx: -V, vz: 0, wz: -6, bankDeg: 15 }), false)).toBe('stSteeper');
    // On the law's bank (~27° here): hold it.
    expect(sPrompt(s, input({ x: centreX(s), z: s.z0 + R, vx: -V, vz: 0, wz: -6, bankDeg: 27 }), false)).toBe('stHold');
    const s0 = createSTurns(MISSION);
    Object.assign(s0, { phase: 'course', live: true, alt0: 1700, half: 0, d: R, ht: 15, depth: R, ck: 'Steep', xIn: s0.x0 });
    expect(sPrompt(s0, input({ x: centreX(s0), z: s0.z0 - R, vx: -V, vz: 0, wz: -6, bankDeg: -36 }), false)).toBe('stShallower');
  });
  it('Kid\'s guide: the law, the lesson\'s 53° cap; nothing once done', () => {
    const out = {};
    sKidGuide(st, { x: centreX(st), z: st.z0 - R, vx: -V, vz: 0, altFt: 1700, aoaDeg: 4, bankDeg: -25 }, out);
    expect(out.guideBankDeg).toBeLessThan(-20);
    expect(Math.abs(out.guideGammaDeg)).toBeLessThan(1);
    const done = createSTurns(MISSION); done.phase = 'complete';
    expect(kidGuide(done, {})).toBe(0);
    expect(ASSIST_BANK_DEG).toBe(53);
  });
  it('the HUD arrow points to the next pole', () => {
    const s = createSTurns(MISSION);
    expect(nextPoleRelDeg(s, s.x0, s.z0 + 1000, 0)).toBeCloseTo(0, 5); // the first pole dead ahead, heading north
    s.phase = 'course'; s.half = 0; s.xIn = s.x0;
    expect(nextPoleRelDeg(s, s.x0, s.z0, 0)).toBeCloseTo(270, 5); // the next pole 2R west: off the left wing
  });
  it('five poles on the road, one at each crossing, seated on the ground', () => {
    const s = createSTurns(MISSION);
    const m = makeMarker(s);
    expect(m.children.length).toBe(POLES);
    expect(m.children.map((p) => Math.round(p.position.x))).toEqual([0, 1, 2, 3, 4].map((k) => Math.round(-2 * k * R)));
    seatMarker(s, m, (x, z) => (x - s.x0) * 0.001 + z * 0);
    expect(m.children[4].position.y).toBeCloseTo(-8 * R * 0.001, 3);
    expect(makeMarker(s)).toBe(m); // one mesh, reused
  });
});

describe('S-turns: the grade bands', () => {
  it('spread bands: B at the game\'s 150 ft, C past 250, D past 350', () => {
    expect([SPREAD_B_FT, SPREAD_C_FT, SPREAD_D_FT]).toEqual([150, 250, 350]);
  });
});
