// Turns around a point (ticket 0211): the lesson's pure logic. The flying is tests/flight/aroundPoint.test.js.
import { describe, it, expect } from 'vitest';
import {
  createAroundPoint, aroundStep, aroundPrompt, aroundKidGuide, circleBankDeg, gradeAroundPoint, spreadFt, lessonWx, aroundSimStep, kidGuide,
  poleClockOf, CIRCLES_DEG, SPREAD_B_FT, SPREAD_D_FT, TRACK_MAX, ASSIST_BANK_DEG, AROUND_TEXT, KID_NOTE,
} from '../../src/aroundPoint.js';
import { MISSIONS } from '../../src/missions.js';
import { DRILL_TEXT } from '../../src/coach.js';
import { FT_TO_M } from '../../src/constants.js';

const MISSION = MISSIONS.find((m) => m.key === 'turns_around_point');
const R = 1500 * FT_TO_M;
const DT = 0.1;

// A step's input at angle a (rad, sim frame atan2(z, x)) on a circle of radius r round the pole, flying round it
// with the pole on the left (counter-clockwise on a north-up map: the angle falls in the sim's frame).
function onCircle(st, a, r, extra = {}) {
  const v = 46;
  return { dt: DT, x: st.px + r * Math.cos(a), z: st.pz + r * Math.sin(a), vx: v * Math.sin(a), vz: -v * Math.cos(a), wx: 0, wz: -6,
    altFt: 1700, iasKts: 90, bankDeg: -27, stalled: false, ...extra };
}
// Spawn to abeam: straight north up the entry line, then round the circle at ω = v / r until done.
function flyLesson(st, { r = () => R, extra = () => ({}), maxS = 400 } = {}) {
  const evs = [];
  let z = st.pz + 926, t = 0;
  while (st.phase === 'entry' && t < 60) {
    const ev = aroundStep(st, { dt: DT, x: st.px + R, z, vx: 0, vz: -46, wx: 0, wz: -6, altFt: 1700, iasKts: 90, bankDeg: 0, stalled: false });
    if (ev) evs.push(ev);
    z -= 46 * DT; t += DT;
  }
  let a = 0;
  for (; t < maxS && st.phase === 'circle'; t += DT) {
    const ev = aroundStep(st, onCircle(st, a, r(a), extra(a)));
    if (ev) evs.push(ev);
    a -= (46 / R) * DT;
  }
  return evs;
}

describe('turns around a point (0211): the mission', () => {
  it('flies the Cessna on the downwind entry, the pole half a mile ahead and the circle\'s radius off the left wing', () => {
    expect(MISSION).toMatchObject({ kind: 'drill', aircraft: 'c172', aglFt: 1000, kias: 90, radiusFt: 1500, aroundPoint: true });
    const [fromDeg, kts] = MISSION.wind;
    expect(kts).toBeGreaterThanOrEqual(10); // the ticket's 10-15 kt
    expect(kts).toBeLessThanOrEqual(15);
    expect((fromDeg + 180) % 360).toBe(MISSION.hdg); // heading the way the wind blows: downwind (AFH p. 7-4)
    const dx = MISSION.point[0] - MISSION.pos[0], dz = MISSION.point[1] - MISSION.pos[1];
    expect(dx).toBeCloseTo(-R, 0); // west of the track heading north: off the left wing
    expect(dz).toBeCloseTo(-926, 0); // half a mile north: ahead
  });
  it('its wind is a scenario (labelled so) from the mission', () => {
    const wx = lessonWx(MISSION);
    expect(wx).toMatchObject({ windDirDeg: 180, windKts: 12, gustKts: 12, live: false, scripted: true });
    expect(wx.raw).toMatch(/^SCENARIO .* 18012KT /);
  });
  it('every coach word is in the drill text', () => {
    for (const k of Object.keys(AROUND_TEXT)) expect(DRILL_TEXT[k]).toBe(AROUND_TEXT[k]);
  });
});

describe('turns around a point (0211): the steps', () => {
  it('the circle starts abeam the pole and ends after two full turns', () => {
    const st = createAroundPoint(MISSION);
    const evs = flyLesson(st);
    expect(evs).toEqual(['circle', 'complete']);
    expect(st.side).toBe(-1); // the pole on the left
    expect(Math.abs(st.swept)).toBeGreaterThanOrEqual(CIRCLES_DEG);
    expect(Math.abs(st.swept)).toBeLessThan(CIRCLES_DEG + 5);
    const { meanFt, sdFt } = spreadFt(st);
    expect(meanFt).toBeCloseTo(1500, -1);
    expect(sdFt).toBeLessThan(1);
    expect(st.trackStart).toBeGreaterThan(0); // the entry's samples first
    expect(st.trackN).toBeGreaterThan(st.trackStart);
  });
  it('a perfect circle at the height and speed grades S; the Kid note when the guide flew it', () => {
    const st = createAroundPoint(MISSION);
    flyLesson(st);
    const g = gradeAroundPoint(st, true);
    expect(g.grade).toBe('S');
    expect(g.reason).toBeNull();
    expect(g.note).toBe(KID_NOTE);
    expect(g.track.n).toBe(st.trackN);
    expect(g.track.pts.length).toBe(2 * st.trackN);
    expect(g.track.R).toBeCloseTo(R);
    expect(g.track.wind).toEqual([180, 12]);
  });
  it('an oval (the distance swinging ±400 ft) caps at D and says so', () => {
    const st = createAroundPoint(MISSION);
    flyLesson(st, { r: (a) => R + 170 * Math.cos(a) });
    const g = gradeAroundPoint(st);
    expect(spreadFt(st).sdFt).toBeGreaterThan(SPREAD_D_FT);
    expect(g.grade).toBe('D');
    expect(g.reason).toMatch(/oval/);
  });
  it('a spread past the game\'s ±150 ft is no better than a B, and the card says the test sets no number', () => {
    const st = createAroundPoint(MISSION);
    flyLesson(st, { r: (a) => R + 75 * Math.cos(a) });
    const { sdFt } = spreadFt(st);
    expect(sdFt).toBeGreaterThan(SPREAD_B_FT);
    expect(sdFt).toBeLessThan(SPREAD_D_FT);
    const g = gradeAroundPoint(st);
    expect(g.score).toBeLessThanOrEqual(84);
    expect(g.reason).toMatch(/sets no number/);
  });
  it('past 45° of bank for over a second is no better than a B (AFH p. 7-1)', () => {
    const st = createAroundPoint(MISSION);
    flyLesson(st, { extra: () => ({ bankDeg: -50 }) });
    const g = gradeAroundPoint(st);
    expect(g.score).toBeLessThanOrEqual(84);
    expect(g.reason).toMatch(/45°/);
  });
  it('150 ft off the height is outside the test (B); 250 ft caps at D', () => {
    for (const [ft, cap] of [[150, 84], [250, 54]]) {
      const st = createAroundPoint(MISSION);
      flyLesson(st, { extra: (a) => ({ altFt: 1700 - ft * Math.min(1, -a) }) });
      expect(gradeAroundPoint(st).score).toBeLessThanOrEqual(cap);
    }
  });
  it('the speed is graded against the lesson\'s 90 KIAS and the height against where flying started, not the abeam instant (panel)', () => {
    const st = createAroundPoint(MISSION);
    // Flown at a steady 70 KIAS from start to finish: 20 kt slow all the way, outside the test's ±10.
    let z = st.pz + 926;
    while (st.phase === 'entry') { aroundStep(st, { dt: DT, x: st.px + R, z, vx: 0, vz: -46, wx: 0, wz: 0, altFt: 1700, iasKts: 70, bankDeg: 0, stalled: false }); z -= 4.6; }
    let a = 0;
    while (st.phase === 'circle') { aroundStep(st, onCircle(st, a, R, { iasKts: 70 })); a -= (46 / R) * DT; }
    expect(st.maxKtsDev).toBeGreaterThan(15);
    expect(gradeAroundPoint(st).score).toBeLessThanOrEqual(84);
    // A climb of 150 ft on the entry, then held there round the circles: 150 ft off the height flying started at.
    const st2 = createAroundPoint(MISSION);
    z = st2.pz + 926;
    let alt = 1700;
    while (st2.phase === 'entry') { aroundStep(st2, { dt: DT, x: st2.px + R, z, vx: 0, vz: -46, wx: 0, wz: 0, altFt: alt, iasKts: 90, bankDeg: 0, stalled: false }); z -= 4.6; alt = Math.min(1850, alt + 2); }
    a = 0;
    while (st2.phase === 'circle') { aroundStep(st2, onCircle(st2, a, R, { altFt: 1850 })); a -= (46 / R) * DT; }
    expect(st2.maxAltDevFt).toBeCloseTo(150, 0);
    expect(gradeAroundPoint(st2).score).toBeLessThanOrEqual(84);
  });
  it('drifting three radii from the pole fails (the wind carried it off)', () => {
    const st = createAroundPoint(MISSION);
    const evs = flyLesson(st, { r: (a) => R * (1 - a * 0.5) });
    expect(evs.at(-1)).toBe('failed');
    expect(st.why).toBe('drift');
    const g = gradeAroundPoint(st);
    expect(g.grade).toBe('D');
    expect(g.title).toMatch(/not finished/);
  });
  it('passing the pole far off (never within two radii) fails as missed', () => {
    const st = createAroundPoint(MISSION);
    let z = st.pz + 926, ev = '';
    for (let i = 0; i < 400 && !ev; i++) { ev = aroundStep(st, { dt: DT, x: st.px + 4 * R, z, vx: 0, vz: -46, wx: 0, wz: 0, altFt: 1700, iasKts: 90, bankDeg: 0, stalled: false }); z -= 4.6; }
    expect(ev).toBe('failed');
    expect(st.why).toBe('missed');
  });
  it('the track buffer stops at its size (no allocation, no overrun)', () => {
    const st = createAroundPoint(MISSION);
    for (let i = 0; i < TRACK_MAX * 6; i++) aroundStep(st, { dt: DT, x: st.px + R, z: st.pz + 900, vx: 0, vz: 0, wx: 0, wz: 0, altFt: 1700, iasKts: 90, bankDeg: 0, stalled: false });
    expect(st.trackN).toBeLessThanOrEqual(TRACK_MAX);
  });
});

describe('turns around a point (0211): the coach and Kid\'s guide', () => {
  const live = () => { const st = createAroundPoint(MISSION); st.live = true; return st; };
  it('the entry: fly on until abeam, then roll toward the pole', () => {
    const st = live();
    aroundStep(st, { dt: DT, x: st.px + R, z: st.pz + 900, vx: 0, vz: -46, wx: 0, wz: -6, altFt: 1700, iasKts: 90, bankDeg: 0, stalled: false });
    expect(aroundPrompt(st, {}, false)).toBe('tptFlyOnL');
    aroundStep(st, { dt: DT, x: st.px + R, z: st.pz + 60, vx: 0, vz: -46, wx: 0, wz: -6, altFt: 1700, iasKts: 90, bankDeg: 0, stalled: false });
    expect(aroundPrompt(st, {}, false)).toBe('tptRollL');
    expect(aroundPrompt(st, {}, true)).toBe('tptKidIn');
  });
  it('round the circle: wide, close, and the wind behind or ahead names the bank', () => {
    const st = live();
    flyLesson(st, { maxS: 30 });
    const at = (r, a, wz) => { const s = onCircle(st, a, r, { wz }); st.d = r; return aroundPrompt(st, s, false); };
    expect(at(R + 60, 0, -6)).toBe('tptWide');
    expect(at(R - 60, 0, -6)).toBe('tptClose');
    // At a = 0 (east of the pole) the track is north: a south wind (blowing north, wz < 0) is behind, a north one ahead.
    expect(at(R, 0, -6)).toBe('tptDown');
    expect(at(R, 0, 6)).toBe('tptUp');
    expect(at(R, 0, 0)).toBe('tptHold');
    expect(aroundPrompt(st, onCircle(st, 0, R, { bankDeg: -50 }), false)).toBe('tptSteep');
    expect(aroundPrompt(st, onCircle(st, 0, R, { altFt: 1700 - 80 }), false)).toBe('tptLow');
  });
  it('nothing to say before the player is flying, or once graded', () => {
    const st = createAroundPoint(MISSION);
    expect(aroundPrompt(st, {}, false)).toBeNull();
    st.live = true; st.phase = 'complete';
    expect(aroundPrompt(st, {}, false)).toBeNull();
  });
  it('the circle bank: left for the pole on the left, steeper downwind than upwind, steeper when wide', () => {
    const st = createAroundPoint(MISSION);
    const s = (vx, vz, r = R) => ({ x: st.px + r, z: st.pz, vx, vz });
    const down = circleBankDeg(st, s(0, -52), -1), up = circleBankDeg(st, s(0, -40), -1);
    expect(down).toBeLessThan(0);
    expect(-down).toBeGreaterThan(-up + 8);
    // tan φ = V² / (g R) on the circle (AFH p. 7-3): 52 m/s round 457 m is ~31°.
    expect(-down).toBeCloseTo(Math.atan(52 * 52 / (9.80665 * R)) * 180 / Math.PI, 0);
    expect(-circleBankDeg(st, s(0, -46, R + 50), -1)).toBeGreaterThan(-circleBankDeg(st, s(0, -46), -1));
    expect(circleBankDeg(st, s(0, -46), 1)).toBeGreaterThan(0);
    expect(-circleBankDeg(st, s(0, -90), -1)).toBeLessThanOrEqual(45); // never past the handbook's 45°
  });
  it('Kid: wings level on the entry until just before abeam; then the circle; level once graded', () => {
    const st = createAroundPoint(MISSION), out = {};
    aroundStep(st, { dt: DT, x: st.px + R, z: st.pz + 900, vx: 0, vz: -46, wx: 0, wz: -6, altFt: 1700, iasKts: 90, bankDeg: 0, stalled: false });
    aroundKidGuide(st, { x: st.px + R, z: st.pz + 900, vx: 0, vz: -46, altFt: 1700, aoaDeg: 4, bankDeg: 0 }, out);
    expect(out.guideBankDeg).toBe(0);
    aroundStep(st, { dt: DT, x: st.px + R, z: st.pz + 20, vx: 0, vz: -46, wx: 0, wz: -6, altFt: 1700, iasKts: 90, bankDeg: 0, stalled: false });
    aroundKidGuide(st, { x: st.px + R, z: st.pz + 20, vx: 0, vz: -46, altFt: 1700, aoaDeg: 4, bankDeg: 0 }, out);
    expect(out.guideBankDeg).toBeLessThan(-20);
    expect(kidGuide(st, out)).toBe(0); // not live yet: no cap, no guide
    st.live = true;
    expect(kidGuide(st, out)).toBe(ASSIST_BANK_DEG);
    st.phase = 'complete';
    expect(kidGuide(st, out)).toBe(0);
  });
});

describe('turns around a point (0211): the game adapter holds the spawn until flying starts', () => {
  const vec = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
  const fakeSim = () => ({ pos: vec(MISSION.pos[0] + 300, 500, MISSION.pos[1] - 900), vel: vec(0, 0, -50), quat: { x: 0, y: 0, z: 0, w: 1, set(a, b, c, d) { Object.assign(this, { x: a, y: b, z: c, w: d }); } },
    angVel: vec(1, 1, 1), aglFt: 1200, windVec: { x: 0, z: -6 }, iasKts: 90, aoaDeg: 4, spec: { alphaStallDeg: 16 }, flapsIndex: 0 });
  it('behind the start screen it puts the Cessna back on the spawn point at the lesson\'s height', () => {
    const st = createAroundPoint(MISSION), sim = fakeSim();
    expect(aroundSimStep(st, sim, 1 / 60, false)).toBe('');
    expect(sim.pos.x).toBe(MISSION.pos[0]);
    expect(sim.pos.z).toBe(MISSION.pos[1]);
    expect(sim.pos.y).toBeCloseTo(500 - 200 * FT_TO_M, 6); // 1,200 ft above the ground there → 1,000
    expect(sim.angVel.x).toBe(0);
    expect(st.live).toBe(false);
    expect(st.t).toBe(0);
    sim.pos.set(0, 0, 0);
    aroundSimStep(st, sim, 1 / 60, false); // the hold is the first one's, not the new place
    expect(sim.pos.x).toBe(MISSION.pos[0]);
    aroundSimStep(st, sim, 1 / 60, true);
    expect(st.live).toBe(true);
    expect(st.t).toBeGreaterThan(0);
  });
});

describe('turns around a point (0211): the HUD\'s pole readout', () => {
  it('names the pole\'s clock position from the nose', () => {
    const st = { px: 0, pz: 0 };
    // Heading north (0°): a pole due west is off the left wing, 9 o'clock; north of it, 12; east, 3; south, 6.
    expect(poleClockOf(st, 500, 0, 0)).toBe(9);
    expect(poleClockOf(st, 0, 500, 0)).toBe(12);
    expect(poleClockOf(st, -500, 0, 0)).toBe(3);
    expect(poleClockOf(st, 0, -500, 0)).toBe(6);
    // Heading east (90°): a pole due north is off the left wing.
    expect(poleClockOf(st, 0, 500, 90)).toBe(9);
    // The lesson's spawn: half a mile before abeam, R off the left: ~11 o'clock.
    expect(poleClockOf(st, R, 926, 0)).toBe(11);
  });
});
