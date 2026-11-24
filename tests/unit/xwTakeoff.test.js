// Crosswind takeoff lesson (ticket 0220): xwTakeoff.js's wind pick, coach words for a wind from either side, the step's
// bookkeeping and the grade (flown headless in tests/flight/xwTakeoff.test.js).
import { describe, it, expect } from 'vitest';
import { DRILL_TEXT, TOUCH_WORDS } from '../../src/coach.js';
import {
  createXwTakeoff, lessonWx, xwTakeoffStep, xwTakeoffPrompt, gradeXwTakeoff, xwInput, debugSnap,
  XW_TAKEOFF_KEY, VR_KTS, AIL_TO_KTS, DONE_FT, TRACK_FROM_FT, FAIL_CAP, CAP_C,
} from '../../src/xwTakeoff.js';
import { missionByKey, groupMissions, MISSIONS } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { runwayEnd } from '../../src/airports.js';

const end = runwayEnd('KADS', '16');
const FT = 0.3048;
const base = () => ({ onGround: true, wheelFt: 0, iasKts: 0, tasKts: 0, gsKts: 0, throttle: 0, ail: 0, bankRightDeg: 0, crossM: 0, halfWidthM: 15, leftM: 2000, noseOffDeg: 0, trackOffDeg: 0, kid: false });
// A wind from the right of 16 (true ~160°: from ~250°) or the left (~070°).
const wind = (side, kts = 12) => ({ live: true, icao: 'KADS', windDirDeg: side === 'R' ? 250 : 70, windKts: kts, gustKts: null });

function ready(side = 'R') {
  const st = createXwTakeoff(end);
  lessonWx(st, wind(side));
  xwTakeoffStep(st, base(), 0.1);
  return st;
}
// A takeoff flown as a script: the roll to lift-off, then the climb to DONE_FT. o: per-phase inputs.
function flyScript(side, { ail = 1, offM = 0, liftKts = 60, bank = 0, track = 0, skip = false, crossAtTop = 0 } = {}) {
  const st = ready(side), sgn = side === 'R' ? 1 : -1;
  for (let kts = 0; kts < liftKts; kts += 0.5) {
    xwTakeoffStep(st, { ...base(), throttle: 1, gsKts: kts + 6, iasKts: kts, ail: kts < AIL_TO_KTS ? sgn * ail : 0, crossM: offM * Math.min(1, kts / 30) }, 0.1);
    if (st.phase === 'done') return st;
  }
  xwTakeoffStep(st, { ...base(), onGround: false, wheelFt: 2, throttle: 1, gsKts: liftKts, iasKts: liftKts, bankRightDeg: sgn * bank }, 0.1);
  if (skip) {
    xwTakeoffStep(st, { ...base(), throttle: 1, gsKts: liftKts, iasKts: liftKts }, 0.1);
    xwTakeoffStep(st, { ...base(), onGround: false, wheelFt: 3, throttle: 1, gsKts: liftKts, iasKts: liftKts }, 0.1);
  }
  for (let ft = 5; ft <= DONE_FT + 5 && st.phase !== 'done'; ft += 5) {
    xwTakeoffStep(st, { ...base(), onGround: false, wheelFt: ft, throttle: 1, gsKts: 65, iasKts: 70, tasKts: 71, noseOffDeg: sgn * 9, trackOffDeg: -sgn * track, crossM: ft >= DONE_FT ? crossAtTop : 0 }, 0.5);
  }
  return st;
}

describe('xwTakeoff.js mission', () => {
  it('is a Cessna takeoff on Addison 16 in the Drills group, not the airport link\'s takeoff', () => {
    const m = missionByKey(XW_TAKEOFF_KEY);
    expect(m).toMatchObject({ kind: 'takeoff', airport: 'KADS', rwy: '16', aircraft: 'c172', xwTakeoff: true, group: 'drills', fullLength: true });
    expect(groupMissions(MISSIONS).find((g) => g.id === 'drills').missions.map((x) => x.key)).toContain(XW_TAKEOFF_KEY);
    expect(missionFromLink('?airport=KADS')).not.toBe(XW_TAKEOFF_KEY);
  });
});

describe('xwTakeoff.js wind', () => {
  it('takes Addison\'s live wind when it blows 5-15 kt across, else the 12 kt scenario from the right', () => {
    const st = createXwTakeoff(end);
    expect(lessonWx(st, wind('L', 10)).live).toBe(true);
    expect(st.side).toBe('L');
    expect(st.xwKts).toBeGreaterThan(9);
    const calm = createXwTakeoff(end);
    const wx = lessonWx(calm, { live: true, icao: 'KADS', windDirDeg: 160, windKts: 8, gustKts: null }); // straight down the runway
    expect(wx.scripted).toBe(true);
    expect(calm.side).toBe('R');
    expect(calm.xwKts).toBeCloseTo(12, 0);
    expect(lessonWx(createXwTakeoff(end), { ...wind('R'), icao: 'KDFW' }).scripted).toBe(true); // DFW's lent report is not Addison's
  });
  it('offline, keeps its scenario wind object (no re-pick for each new fallback report)', () => {
    const st = createXwTakeoff(end);
    const first = lessonWx(st, { live: false, windDirDeg: 160, windKts: 5 });
    expect(lessonWx(st, { live: false, windDirDeg: 160, windKts: 5 })).toBe(first);
    expect(lessonWx(st, wind('L')).live).toBe(true); // a live report that suits still takes over before the roll
  });
  it('keeps the wind it chose once the roll starts', () => {
    const st = ready('R');
    xwTakeoffStep(st, { ...base(), throttle: 1, gsKts: 10, iasKts: 15 }, 0.1);
    expect(st.rolled).toBe(true);
    const before = st.wx;
    expect(lessonWx(st, wind('L'))).toBe(before);
    expect(st.side).toBe('R');
  });
});

describe('xwTakeoff.js coach', () => {
  it('names the stick and the pedal for a wind from the right', () => {
    const st = ready('R');
    expect(DRILL_TEXT[xwTakeoffPrompt(st, base())]).toBe('Wind from the right: stick full right (D), then full power (Shift)');
    expect(TOUCH_WORDS.xtBriefR).toBe('Wind from the right: stick full right, then throttle to the top');
    expect(xwTakeoffPrompt(st, { ...base(), ail: 1 })).toBe('xtPower');
    xwTakeoffStep(st, { ...base(), throttle: 1, gsKts: 10, iasKts: 15 }, 0.1);
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: 20 })]).toBe('Aileron into the wind: hold the stick full right (D)');
    expect(xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: 20, ail: -1 })).toBe('xtAilR'); // the wrong way is no aileron into the wind
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: 20, ail: 1 })]).toMatch(/^Hold the stick right/);
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: 45, ail: 1 })]).toMatch(/^Speed building: ease the stick/);
    // Downwind of the centreline (left): right rudder (E); upwind (right): left (Q).
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: 30, ail: 1, crossM: -6 })]).toBe('Left of the centreline: right rudder (E)');
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: 30, ail: 1, crossM: 6 })]).toBe('Right of the centreline: left rudder (Q)');
    expect(TOUCH_WORDS.xtLineL).toBe('Left of the centreline: tap RUD ▶');
    expect(xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: VR_KTS })).toBe('xtRotate');
    expect(TOUCH_WORDS.xtRotate).toMatch(/stick up a little \(nose up\)/); // the touch stick: up is nose up (softField.js's words)
    expect(TOUCH_WORDS.xtKidRotate).toMatch(/hold the stick up/);
    const air = { ...base(), onGround: false, throttle: 1, iasKts: 65 };
    xwTakeoffStep(st, { ...air, wheelFt: 2 }, 0.1);
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...air, wheelFt: 20 })]).toBe('Flying! Keep the right wing a little low, rudder holds the line');
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...air, wheelFt: 80 })]).toMatch(/^Turn a little right, into the wind: crab/);
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...air, wheelFt: 80, trackOffDeg: -6 })]).toBe('Drifting left: turn a little more right, into the wind');
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...air, wheelFt: 80, trackOffDeg: 6 })]).toBe('Drifting right: a little less right');
  });
  it('names the stick and the pedal for a wind from the left', () => {
    const st = ready('L');
    expect(DRILL_TEXT[xwTakeoffPrompt(st, base())]).toBe('Wind from the left: stick full left (A), then full power (Shift)');
    expect(xwTakeoffPrompt(st, { ...base(), ail: -1 })).toBe('xtPower');
    xwTakeoffStep(st, { ...base(), throttle: 1, gsKts: 10, iasKts: 15 }, 0.1);
    expect(xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: 20, ail: 1 })).toBe('xtAilL');
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: 20, ail: -1 })]).toMatch(/^Hold the stick left: the left wing stays down/);
    const air = { ...base(), onGround: false, throttle: 1, iasKts: 65 };
    xwTakeoffStep(st, { ...air, wheelFt: 2 }, 0.1);
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...air, wheelFt: 80 })]).toMatch(/^Turn a little left, into the wind/);
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...air, wheelFt: 80, trackOffDeg: 6 })]).toBe('Drifting right: turn a little more left, into the wind');
  });
  it('first-timer panel: the stick comes out before the rotate and in the slip; a good crab is held; a centred stick past 40 kt keeps a little in', () => {
    const st = ready('R');
    xwTakeoffStep(st, { ...base(), throttle: 1, gsKts: 10, iasKts: 15 }, 0.1);
    expect(xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: VR_KTS + 2, ail: 0.95 })).toBe('xtEaseR');
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: VR_KTS + 2, ail: 0.3 })]).toMatch(/^55 knots or a little more: ease back/);
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: 45, ail: 0 })]).toBe('Keep a little right stick in, rudder keeps the line');
    expect(xwTakeoffPrompt(st, { ...base(), throttle: 1, iasKts: 45, ail: 0.4 })).toBeNull();
    const air = { ...base(), onGround: false, throttle: 1, iasKts: 65 };
    xwTakeoffStep(st, { ...air, wheelFt: 2 }, 0.1);
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...air, wheelFt: 20, ail: 0.95 })]).toBe('Less right stick: just enough to keep the right wing a little low');
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...air, wheelFt: 80, noseOffDeg: 9, trackOffDeg: 1 })]).toBe('Good crab: hold it, over the centreline');
    // A drift of 1,600 ft off the extended centreline is a D.
    expect(gradeXwTakeoff(flyScript('R', { track: 9, crossAtTop: -1600 * FT })).score).toBeLessThanOrEqual(FAIL_CAP);
    expect(gradeXwTakeoff(flyScript('R'), false, true).note).toMatch(/^Learner level: the plane's pedals help/);
  });
  it('Kid: power, rotate, climb; nothing before the player is flying', () => {
    const st = createXwTakeoff(end);
    lessonWx(st, wind('R'));
    expect(xwTakeoffPrompt(st, base())).toBeNull();
    xwTakeoffStep(st, base(), 0.1);
    expect(DRILL_TEXT[xwTakeoffPrompt(st, { ...base(), kid: true })]).toBe('Wind from the right: full power (Shift), your plane keeps the line');
    expect(xwTakeoffPrompt(st, { ...base(), kid: true, iasKts: VR_KTS })).toBe('xtKidRotate');
    expect(xwTakeoffPrompt(st, { ...base(), kid: true, onGround: false, wheelFt: 10 })).toBe('xtKidClimb');
  });
});

describe('xwTakeoff.js grade', () => {
  const row = (g, k) => g.factors.find((f) => f.key === k);
  it('the handbook takeoff grades A; the rows carry the numbers', () => {
    const g = gradeXwTakeoff(flyScript('R'));
    expect(g.kind).toBe('xwTakeoff');
    expect(g.score).toBeGreaterThanOrEqual(90);
    expect(row(g, 'ail').value).toBe('100% of full right');
    expect(row(g, 'liftoff').value).toBe('60 kt, wings level');
    expect(row(g, 'track').value).toMatch(/^crab 9° right \(the wind's ~10°\), track 0° off, 0 ft right at 200 ft$/);
    expect(g.reason).toBeNull();
    expect(g.note).toMatch(/Addison's live wind: 12 kt across from the right/);
  });
  it('no aileron into the wind grades lower and says so', () => {
    const good = gradeXwTakeoff(flyScript('R'));
    const g = gradeXwTakeoff(flyScript('R', { ail: 0 }));
    expect(row(g, 'ail').score).toBe(0);
    expect(g.score).toBeLessThan(good.score - 20);
    expect(g.reason).toMatch(/Too little aileron into the wind on the roll: full right stick/);
    expect(gradeXwTakeoff(flyScript('L', { ail: 0 })).reason).toMatch(/full left stick/);
  });
  it('a roll off the runway\'s edge ends the lesson at D or worse', () => {
    const st = flyScript('R', { offM: 20 });
    expect(st.why).toBe('off');
    const g = gradeXwTakeoff(st);
    expect(g.score).toBeLessThanOrEqual(FAIL_CAP);
    expect(g.title).toBe('Crosswind takeoff failed');
    expect(g.reason).toMatch(/Left the side of the runway/);
  });
  it('a wander toward the edge grades the centreline row down', () => {
    const g = gradeXwTakeoff(flyScript('R', { offM: 10 }));
    expect(row(g, 'line').value).toBe('33 ft right at most');
    expect(row(g, 'line').score).toBeLessThan(70);
  });
  it('drifting off the extended centreline grades the track down and names the drift', () => {
    const good = gradeXwTakeoff(flyScript('R'));
    const g = gradeXwTakeoff(flyScript('R', { track: 9, crossAtTop: -150 * FT }));
    expect(row(g, 'track').score).toBeLessThan(50);
    expect(g.score).toBeLessThan(good.score - 10);
    expect(g.reason).toMatch(/Drifted 150 ft left of the extended centreline by 200 ft: turn into the wind \(right\)/);
  });
  it('names an early lift-off, a steep bank into the wind and a skip (capped C)', () => {
    expect(gradeXwTakeoff(flyScript('R', { liftKts: 45 })).reason).toMatch(/Lifted off at 45 kt, before 55/);
    expect(gradeXwTakeoff(flyScript('R', { bank: 9 })).reason).toMatch(/A steep 9° bank at the lift-off/);
    const skip = gradeXwTakeoff(flyScript('R', { skip: true }));
    expect(skip.score).toBeLessThanOrEqual(CAP_C);
    expect(skip.reason).toMatch(/^Skipped: it lifted off and settled back/);
  });
  it('physics panel: the downwind wing low at the lift-off, a parallel drift, a roll under full power, a very late lift-off', () => {
    const risen = gradeXwTakeoff(flyScript('R', { bank: -5 }));
    expect(risen.factors.find((f) => f.key === 'liftoff').score).toBeLessThan(40);
    expect(risen.reason).toMatch(/The right wing rose at the lift-off \(left wing 5° low\)/);
    // Tracking parallel to the centreline 150 ft downwind is not over it: the row falls and the grade stops at B.
    const parallel = gradeXwTakeoff(flyScript('R', { crossAtTop: -150 * FT }));
    expect(parallel.factors.find((f) => f.key === 'track').score).toBeLessThan(60);
    expect(parallel.score).toBeLessThanOrEqual(84);
    // 85% power still rolls: the aileron is measured.
    const st = ready('R');
    xwTakeoffStep(st, { ...base(), throttle: 0.85, gsKts: 10, iasKts: 15, ail: 1 }, 0.1);
    expect(st.rolled).toBe(true);
    expect(st.ailN).toBeGreaterThan(0);
    expect(gradeXwTakeoff(flyScript('R', { liftKts: 100 })).factors.find((f) => f.key === 'liftoff').score).toBeLessThan(60);
  });
  it('Kid: the centreline and the lift-off only, the technique rows not scored', () => {
    const g = gradeXwTakeoff(flyScript('R', { ail: 0, track: 9 }), true);
    expect(g.factors.map((f) => f.key)).toEqual(['line', 'liftoff']);
    expect(g.score).toBeGreaterThanOrEqual(90);
    expect(g.reason).toBeNull();
    expect(g.note).toMatch(/^Kid level: your plane kept the line on the roll/);
  });
  it('the track is measured only from 50 ft', () => {
    const st = ready('R');
    xwTakeoffStep(st, { ...base(), onGround: false, wheelFt: TRACK_FROM_FT - 1, iasKts: 60, trackOffDeg: 10 }, 1);
    expect(st.trackN).toBe(0);
  });
});

describe('xwTakeoff.js sim input', () => {
  it('reads the runway frame from the sim: right of the centreline, the nose and the track against 16', () => {
    const st = createXwTakeoff(end);
    const r = end.hdgT * Math.PI / 180;
    // 10 m right of the centreline, 300 m down the runway, moving down it with a little drift right.
    const sim = { pos: { x: end.thrX + Math.sin(r) * 300 + Math.cos(r) * 10, y: 0, z: end.thrZ - Math.cos(r) * 300 + Math.sin(r) * 10 },
      vel: { x: Math.sin(r + 0.05) * 30, y: 0, z: -Math.cos(r + 0.05) * 30 }, onGround: true, groundY: 0, spec: { gearHeight: 1 },
      iasKts: 50, gsKts: 58, throttle: 1, aileronInput: 0.5, assist: 'kid' };
    const s = xwInput(st, sim, end.hdgT + 4, 1);
    expect(s.crossM).toBeCloseTo(10, 3);
    expect(s.leftM).toBeCloseTo(end.lengthM - end.displacedM - 300, 3);
    expect(s.noseOffDeg).toBeCloseTo(4, 6);
    expect(s.trackOffDeg).toBeCloseTo(0.05 * 180 / Math.PI, 3);
    expect(s.kid).toBe(true);
    expect(debugSnap(st)).toMatchObject({ end: 'KADS_16', phase: 'roll' });
  });
});
