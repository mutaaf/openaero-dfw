// The rectangular course (ticket 0223): the lesson's pure logic. The flying is tests/flight/rectCourse.test.js.
import { describe, it, expect } from 'vitest';
import {
  createRectCourse, rectStep, rectPrompt, rectKidGuide, rectBankDeg, gradeRectCourse, spreadFt, lessonWx, fieldDistance, toCornerM, kidGuide,
  makeMarker, seatMarker, rectSimStep, LAPS_DEG, SPREAD_B_FT, SPREAD_C_FT, SPREAD_D_FT, ASSIST_BANK_DEG, RECT_TEXT, KID_NOTE, SNAP, ROLL_LEAD_M,
} from '../../src/rectCourse.js';
import * as rc from '../../src/rectCourse.js';
import * as tap from '../../src/aroundPoint.js';
import { MISSIONS } from '../../src/missions.js';
import { DRILL_TEXT, TOUCH_WORDS } from '../../src/coach.js';
import { FT_TO_M } from '../../src/constants.js';

const MISSION = MISSIONS.find((m) => m.key === 'rectangular_course');
const D = 2640 * FT_TO_M;
const DT = 0.1;
const V = 46;

// The path asked, as a function of its length s from the east side's south end (left-hand: anticlockwise from above,
// north up; in the sim's frame +x east, +z south): legs and quarter circles round the corners, `off` metres out.
function pathAt(st, s, off = 0) {
  const r = st.D + off, hx = st.hx, hz = st.hz, q = Math.PI / 2 * r;
  const legs = [2 * hz, q, 2 * hx, q, 2 * hz, q, 2 * hx, q];
  const per = legs.reduce((a, b) => a + b, 0);
  s = ((s % per) + per) % per;
  let i = 0;
  while (s > legs[i]) { s -= legs[i]; i++; }
  const arc = (cx, cz, th0) => { const th = th0 - s / r; return [cx + r * Math.cos(th), cz + r * Math.sin(th), Math.sin(th), -Math.cos(th)]; };
  const [x, z, ux, uz] = [
    () => [hx + r, hz - s, 0, -1], () => arc(hx, -hz, 0), () => [hx - s, -hz - r, -1, 0], () => arc(-hx, -hz, -Math.PI / 2),
    () => [-hx - r, -hz + s, 0, 1], () => arc(-hx, hz, -Math.PI), () => [-hx + s, hz + r, 1, 0], () => arc(hx, hz, -1.5 * Math.PI),
  ][i]();
  return { x: st.cx + x, z: st.cz + z, vx: V * ux, vz: V * uz };
}
const input = (st, p, extra = {}) => ({ dt: DT, ...p, wx: 0, wz: -6, altFt: 1700, iasKts: 90, bankDeg: 0, stalled: false, ...extra });
// Spawn to abeam the field up the entry line, then round the path until done; off(s): metres out from it.
function flyLesson(st, { off = () => 0, extra = () => ({}), maxS = 1200 } = {}) {
  const evs = [];
  let z = MISSION.pos[1], t = 0;
  while (st.phase === 'entry' && t < 60) {
    const ev = rectStep(st, input(st, { x: MISSION.pos[0], z, vx: 0, vz: -V }));
    if (ev) evs.push(ev);
    z -= V * DT; t += DT;
  }
  let s = st.cz + st.hz - z;
  for (; t < maxS && st.phase === 'course'; t += DT, s += V * DT) {
    const ev = rectStep(st, input(st, pathAt(st, s, off(s)), extra(s)));
    if (ev) evs.push(ev);
  }
  return evs;
}

describe('rectangular course (0223): the mission', () => {
  it('flies the Cessna on the downwind leg, the field on its left, the distance asked off the field\'s east edge', () => {
    expect(MISSION).toMatchObject({ kind: 'drill', aircraft: 'c172', aglFt: 1000, kias: 90, distFt: 2640, rectCourse: true, hdg: 0 });
    const [fromDeg, kts] = MISSION.wind;
    expect(kts).toBe(12);
    expect((fromDeg + 180) % 360).toBe(MISSION.hdg); // heading the way the wind blows: downwind (AFH p. 7-4)
    // FAA-H-8083-3C ch. 7: the path one-half to three-fourths of a mile from the field's boundaries (the field's size is the game's).
    expect(MISSION.distFt).toBeGreaterThanOrEqual(2640);
    expect(MISSION.distFt).toBeLessThanOrEqual(3960);
    const hx = MISSION.fieldFt[0] / 2 * FT_TO_M, hz = MISSION.fieldFt[1] / 2 * FT_TO_M;
    expect(MISSION.pos[0] - MISSION.field[0]).toBeCloseTo(hx + D, 0); // east of the field: off the left wing heading north
    expect(MISSION.pos[1] - MISSION.field[1]).toBeCloseTo(hz + 2640 * FT_TO_M, 0); // half a statute mile short of abeam its south-east corner
  });
  it('its wind is a scenario (labelled so) from the mission', () => {
    expect(lessonWx(MISSION)).toMatchObject({ windDirDeg: 180, windKts: 12, live: false, scripted: true });
  });
  it('every coach word is in the drill text, and every one turns left (a left-hand course)', () => {
    for (const k of Object.keys(RECT_TEXT)) expect(DRILL_TEXT[k]).toBe(RECT_TEXT[k]);
    for (const k of ['rcCornerDown', 'rcCornerUp', 'rcCorner']) expect(RECT_TEXT[k]).toMatch(/roll left/);
  });
  it('exports the ground-reference calls main.js makes, as aroundPoint.js does', () => {
    for (const k of ['create', 'live', 'simStep', 'coachWord', 'grade', 'PLACE', 'drawHud', 'kidGuide', 'makeMarker', 'seatMarker', 'debugSnap', 'SNAP']) {
      expect(rc[k], k).toBeDefined();
      expect(tap[k], k).toBeDefined();
    }
    expect(SNAP).toBe('rectCourse');
    expect(tap.SNAP).toBe('aroundPoint');
  });
});

describe('rectangular course (0223): the field\'s distance', () => {
  const st = createRectCourse(MISSION);
  it('off an edge it is the distance to that edge; off a corner, to the corner; over the field, negative', () => {
    expect(fieldDistance(st, st.cx + st.hx + 300, st.cz)).toBeCloseTo(300);
    expect(st.corner).toBe(false);
    expect([st.nx, st.nz]).toEqual([1, 0]);
    expect(fieldDistance(st, st.cx, st.cz - st.hz - 200)).toBeCloseTo(200);
    expect(st.nz).toBe(-1);
    expect(fieldDistance(st, st.cx + st.hx + 300, st.cz - st.hz - 400)).toBeCloseTo(500);
    expect(st.corner).toBe(true);
    expect(st.nx).toBeCloseTo(0.6); expect(st.nz).toBeCloseTo(-0.8);
    expect(fieldDistance(st, st.cx + st.hx - 50, st.cz)).toBeCloseTo(-50);
  });
  it('the way to the next corner along each leg, left-hand', () => {
    const at = (x, z) => { fieldDistance(st, st.cx + x, st.cz + z); return toCornerM(st, { x: st.cx + x, z: st.cz + z }); };
    expect(at(st.hx + D, st.hz - 100)).toBeCloseTo(2 * st.hz - 100); // east side going north
    expect(at(st.hx - 100, -st.hz - D)).toBeCloseTo(2 * st.hx - 100); // north side going west
    expect(at(-st.hx - D, -st.hz + 100)).toBeCloseTo(2 * st.hz - 100); // west side going south
    expect(at(-st.hx + 100, st.hz + D)).toBeCloseTo(2 * st.hx - 100); // south side going east
    expect(at(st.hx + D, -st.hz - 10)).toBe(-1); // past it: round the corner
  });
});

describe('rectangular course (0223): the steps and the grade', () => {
  it('the course starts abeam the field and ends after two laps', () => {
    const st = createRectCourse(MISSION);
    const evs = flyLesson(st);
    expect(evs).toEqual(['course', 'complete']);
    expect(st.swept).toBeLessThanOrEqual(-LAPS_DEG); // left-hand: the angle falls in the sim's frame
    expect(st.swept).toBeGreaterThan(-LAPS_DEG - 5);
    const { meanFt, sdFt } = spreadFt(st);
    expect(meanFt).toBeCloseTo(2640, -1);
    expect(sdFt).toBeLessThan(1);
    expect(st.trackStart).toBeGreaterThan(0);
    expect(st.ct).toBeGreaterThan(330); // ~9 km a lap at 46 m/s
  });
  it('the exact path at the height and speed grades S; the Kid note when the guide flew it', () => {
    const st = createRectCourse(MISSION);
    flyLesson(st);
    const g = gradeRectCourse(st, true);
    expect(g).toMatchObject({ kind: 'rectCourse', title: 'Rectangular course', grade: 'S', reason: null, note: KID_NOTE });
    expect(g.factors.map((f) => f.key)).toEqual(['spread', 'dist', 'alt', 'speed', 'bank']);
    expect(g.track.rect).toEqual([st.hx, st.hz]);
    expect(g.track.R).toBe(st.D);
    expect(g.track.n).toBe(st.trackN);
  });
  // The distance swung in and out by `amp` metres over each leg: its spread is amp / √2.
  const swung = (ampFt) => { const st = createRectCourse(MISSION); flyLesson(st, { off: (s) => ampFt * FT_TO_M * Math.sin(s / 300) }); return st; };
  it('a spread past the B band caps B; past the C band, C; past the D band, D', () => {
    const b = gradeRectCourse(swung((SPREAD_B_FT + 40) * Math.SQRT2));
    expect(b.grade).toBe('B');
    expect(b.reason).toMatch(/No better than a B/);
    const c = gradeRectCourse(swung((SPREAD_C_FT + 40) * Math.SQRT2));
    expect(c.grade).toBe('C');
    expect(c.reason).toMatch(/Crab into it/);
    const d = gradeRectCourse(swung((SPREAD_D_FT + 40) * Math.SQRT2));
    expect(d.grade).toBe('D');
  });
  it('drifting off three times the distance fails it, and says why', () => {
    const st = createRectCourse(MISSION);
    const evs = flyLesson(st, { off: (s) => Math.max(0, s - 500) * 0.5 });
    expect(evs).toEqual(['course', 'failed']);
    expect(st.why).toBe('drift');
    const g = gradeRectCourse(st);
    expect(g.grade).toBe('D');
    expect(g.title).toBe('Rectangular course not finished');
    expect(g.reason).toMatch(/wind carried you away/);
  });
  it('flying over the field fails it', () => {
    const st = createRectCourse(MISSION);
    flyLesson(st, { off: (s) => -Math.max(0, s - 500) * 0.5 });
    expect(st.why).toBe('over');
    expect(gradeRectCourse(st).reason).toMatch(/over the field/);
  });
  it('a height lost past the tolerance caps the grade; a stall fails it', () => {
    const st = createRectCourse(MISSION);
    flyLesson(st, { extra: (s) => ({ altFt: 1700 - Math.min(250, s / 20) }) });
    expect(gradeRectCourse(st).grade).toBe('D');
    const st2 = createRectCourse(MISSION);
    flyLesson(st2, { extra: (s) => ({ stalled: s > 3000 }) });
    expect(st2.why).toBe('stall');
  });
  it('the other way round (right-hand) neither joins on the east side nor completes: a quarter lap clockwise fails it (panel)', () => {
    const st = createRectCourse(MISSION);
    // Heading south along the east side: the field on the right.
    rectStep(st, input(st, { x: MISSION.pos[0], z: st.cz, vx: 0, vz: V }));
    expect(st.phase).toBe('entry');
    // Joined the left-hand way, then turned round and flown clockwise.
    const st2 = createRectCourse(MISSION);
    flyLesson(st2, { maxS: 0 });
    expect(st2.phase).toBe('course');
    const per = 2 * (2 * st2.hx + 2 * st2.hz) + 2 * Math.PI * st2.D;
    let ev = '';
    for (let s = 0, t = 0; t < 400 && !ev; t += DT, s -= V * DT) {
      const p = pathAt(st2, ((s % per) + per) % per);
      ev = rectStep(st2, input(st2, { ...p, vx: -p.vx, vz: -p.vz }));
    }
    expect(ev).toBe('failed');
    expect(st2.why).toBe('wrongWay');
    expect(gradeRectCourse(st2).reason).toMatch(/left-hand/);
  });
  it('never joining the course fails it after two minutes', () => {
    const st = createRectCourse(MISSION);
    let ev = '';
    for (let t = 0; t < 130 && !ev; t += DT) ev = rectStep(st, input(st, { x: MISSION.pos[0] + 3000, z: MISSION.pos[1] + 2000, vx: 0, vz: 0 }));
    expect(ev).toBe('failed');
    expect(st.why).toBe('missed');
  });
});

describe('rectangular course (0223): the coach and Kid\'s guide', () => {
  const live = () => { const st = createRectCourse(MISSION); st.live = true; return st; };
  it('the entry says fly on; Kid hears the guide\'s words', () => {
    const st = live();
    const s = input(st, { x: MISSION.pos[0], z: MISSION.pos[1], vx: 0, vz: -V });
    rectStep(st, s);
    expect(rectPrompt(st, s, false)).toBe('rcFlyOn');
    expect(rectPrompt(st, s, true)).toBe('rcKidIn');
  });
  it('abeam a corner, wings level: roll left, steep with the wind behind, gently into it; then hold that bank round it (panel)', () => {
    const st = live();
    flyLesson(st, { maxS: 0 }); // to abeam
    // The north-east corner on the downwind (east) leg in a south wind: the wind behind.
    const a = input(st, { x: st.cx + st.hx + D, z: st.cz - st.hz + ROLL_LEAD_M / 2, vx: 0, vz: -V }, { wz: -6 });
    rectStep(st, a);
    expect(rectPrompt(st, a, false)).toBe('rcCornerDown');
    // Banked in, half way round: hold the steep bank (chosen as it came abeam), not "medium".
    const h = Math.SQRT1_2;
    const mid = input(st, { x: st.cx + st.hx + D * h, z: st.cz - st.hz - D * h, vx: -V * h, vz: -V * h }, { wz: -6, bankDeg: -20 });
    rectStep(st, mid);
    expect(st.corner).toBe(true);
    expect(rectPrompt(st, mid, false)).toBe('rcHoldDown');
    // Swinging wide or cutting inside in the turn: more or less bank, never "turn right".
    const wide = { ...mid, x: st.cx + st.hx + (D + 150) * h, z: st.cz - st.hz - (D + 150) * h };
    rectStep(st, wide);
    expect(rectPrompt(st, wide, false)).toBe('rcTurnWide');
    const inside = { ...mid, x: st.cx + st.hx + (D - 150) * h, z: st.cz - st.hz - (D - 150) * h };
    rectStep(st, inside);
    expect(rectPrompt(st, inside, false)).toBe('rcTurnClose');
    // The same corner reached with the wind ahead (a fresh corner): gently.
    const st2 = live();
    flyLesson(st2, { maxS: 0 });
    const b = { ...a, wz: 6 };
    rectStep(st2, b);
    expect(rectPrompt(st2, b, false)).toBe('rcCornerUp');
    // Far too close just before the corner: that first, not "roll left, steep" toward the field (panel).
    const st3 = live();
    flyLesson(st3, { maxS: 0 });
    const close = { ...a, x: st3.cx + st3.hx + D - 150 };
    rectStep(st3, close);
    expect(rectPrompt(st3, close, false)).toBe('rcClose');
  });
  it('past the corner and still banked on the next leg: roll out (panel)', () => {
    const st = live();
    flyLesson(st, { maxS: 0 });
    const s = input(st, { x: st.cx, z: st.cz - st.hz - D, vx: -V, vz: 0 }, { bankDeg: -30 });
    rectStep(st, s);
    expect(rectPrompt(st, s, false)).toBe('rcRollOut');
  });
  it('on a crosswind leg: crab into the wind while it drifts you, "good crab" when the track runs along the edge, less when over-crabbed', () => {
    const st = live();
    flyLesson(st, { maxS: 0 });
    // The north side, going west, in a south wind (blowing north, outward here): the wind from the left.
    const along = input(st, { x: st.cx, z: st.cz - st.hz - D, vx: -V, vz: 0 }, { wx: 0, wz: -6 });
    rectStep(st, along);
    expect(rectPrompt(st, along, false)).toBe('rcCrabGood');
    const drift = { ...along, vz: -6 }; // carried north, away from the field
    rectStep(st, drift);
    expect(rectPrompt(st, drift, false)).toBe('rcCrabL');
    expect(RECT_TEXT.rcCrabL).toMatch(/nose a little left, into it/);
    const over = { ...along, vz: 6 }; // crabbed so far it closes on the field
    rectStep(st, over);
    expect(rectPrompt(st, over, false)).toBe('rcCrabLess');
    const wide = { ...along, z: st.cz - st.hz - D - 120 };
    rectStep(st, wide);
    expect(rectPrompt(st, wide, false)).toBe('rcWide');
    const close = { ...along, z: st.cz - st.hz - D + 120 };
    rectStep(st, close);
    expect(rectPrompt(st, close, false)).toBe('rcClose');
  });
  it('the height words on a touch screen say the stick, up for nose up', () => {
    expect(TOUCH_WORDS.rcLow).toMatch(/stick up a touch \(nose up\)/);
    expect(TOUCH_WORDS.rcHigh).toMatch(/stick down/);
  });
  it('the guide banks left round a corner, steeper with the wind behind (the handbook\'s Vg² / (g R)), level on a leg', () => {
    const st = live();
    flyLesson(st, { maxS: 0 });
    st.phase = 'course';
    const corner = (v) => rectBankDeg(st, { x: st.cx + st.hx + D * Math.SQRT1_2, z: st.cz - st.hz - D * Math.SQRT1_2, vx: -v * Math.SQRT1_2, vz: -v * Math.SQRT1_2 });
    const down = corner(V + 6), up = corner(V - 6);
    expect(down).toBeLessThan(up); // more negative: steeper left
    expect(up).toBeLessThan(-10);
    expect(-down).toBeCloseTo(Math.atan((V + 6) ** 2 / (9.80665 * D)) * 180 / Math.PI, 0);
    expect(rectBankDeg(st, { x: st.cx + st.hx + D, z: st.cz, vx: 0, vz: -V })).toBeCloseTo(0, 5);
    const out = {};
    rectKidGuide(st, { x: st.cx + st.hx + D, z: st.cz, vx: 0, vz: -V, altFt: 1700, bankDeg: 0, aoaDeg: 4 }, out);
    expect(out.guideBankDeg).toBeCloseTo(0, 5);
  });
  it('the guide returns the lesson\'s bank cap while live, nothing once graded', () => {
    const st = createRectCourse(MISSION);
    const out = {};
    expect(kidGuide(st, out)).toBe(0); // not live yet
    st.live = true;
    expect(kidGuide(st, out)).toBe(ASSIST_BANK_DEG);
    st.phase = 'complete';
    expect(kidGuide(st, out)).toBe(0);
  });
});

describe('rectangular course (0223): the game\'s adapter and the poles', () => {
  it('holds the Cessna at its spawn until the player flies', () => {
    const st = createRectCourse(MISSION);
    const v3 = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } });
    const sim = { pos: v3(1, 500, 2), vel: v3(0, 0, -46), quat: { x: 0, y: 0, z: 0, w: 1, set() {} }, angVel: v3(1, 1, 1), aglFt: 1000, windVec: v3(0, 0, -6), iasKts: 90, aoaDeg: 3, spec: {}, flapsIndex: 0 };
    expect(rectSimStep(st, sim, 1 / 60, false)).toBe('');
    expect([sim.pos.x, sim.pos.z]).toEqual(MISSION.pos);
    expect(st.live).toBe(false);
  });
  it('four poles at the field\'s corners, one group reused, each seated on the ground', () => {
    const st = createRectCourse(MISSION);
    const g = makeMarker(st);
    expect(makeMarker(st)).toBe(g);
    expect(g.children.length).toBe(4);
    const xs = g.children.map((p) => Math.round(p.position.x)), zs = g.children.map((p) => Math.round(p.position.z));
    expect(new Set(xs)).toEqual(new Set([Math.round(-st.hx), Math.round(st.hx)]));
    expect(new Set(zs)).toEqual(new Set([Math.round(-st.hz), Math.round(st.hz)]));
    seatMarker(st, g, (x, z) => (x > st.cx ? 200 : 180) + (z > st.cz ? 1 : 0));
    expect(g.children.map((p) => p.position.y).sort()).toEqual([180, 181, 200, 201]);
  });
});
