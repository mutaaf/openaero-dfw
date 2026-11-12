import { describe, it, expect } from 'vitest';
import {
  SLOW_KEY, SLOW_TEXT, SLOW_ACS_CAP, SLOW_WARN_CAP, SLOW_LOST_CAP, SLOW_HOLD_S, SLOW_HOLD_MAX_S, SLOW_FAIL_SLOWING_S,
  SLOW_TARGET_OVER_WARN_KTS, SLOW_KTS_OVER, SLOW_KID_DECEL_KTS_S, SLOW_GUST_SHARE,
  createSlowFlight, slowFlightStep, slowSimStep, slowPrompt, slowKidGuide, slowKidKts, gradeSlowFlight, slowBandWords, warnAoaDeg,
} from '../../src/slowFlight.js';
import { coachText, DRILL_TEXT } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { quietMission } from '../../src/tower.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallWarningKts, stallAoaDeg, stallSpeedKts, liftCoefficient } from '../../src/aero.js';
import { M_TO_FT } from '../../src/constants.js';

const DT = 0.1;
const WARN = 58;
const TARGET = WARN + SLOW_TARGET_OVER_WARN_KTS; // 63

// A scripted slow flight: `started` after 1 s on the start screen, then kts(t), alt(t), hdg(t) each step
// until graded or `seconds` pass. Returns every transition.
function flySlow(st, { kts = (t) => Math.max(68, 95 - t), alt = () => 5000, hdg = () => 0, stalledAt = null, seconds = 400, warn = WARN, aoa = () => 6, gustAdd = 0 } = {}) {
  const events = [];
  let t = 0;
  for (let i = 0; i < 10; i++) { const e = slowFlightStep(st, { dt: DT, started: false, altFt: 5000, iasKts: 95, warnKts: warn, gustAddKts: 0, aoaDeg: 2, warnAoaDeg: 11, hdgDeg: 0, stalled: false }); if (e) events.push(e); }
  for (let n = 0; n < seconds / DT && st.phase !== 'complete' && st.phase !== 'failed'; n++) {
    t += DT;
    const e = slowFlightStep(st, { dt: DT, started: true, altFt: alt(t), iasKts: kts(t), warnKts: warn, gustAddKts: gustAdd, aoaDeg: aoa(t), warnAoaDeg: 11, hdgDeg: (hdg(t) + 360) % 360, stalled: stalledAt !== null && t >= stalledAt });
    if (e) events.push(e);
  }
  return events;
}

describe('slowFlightStep (0164): slow to the band, hold it 45 s', () => {
  it('waits for the player, slows, holds, completes; the band is the warning + 5, +10/-0', () => {
    const st = createSlowFlight();
    expect(flySlow(st)).toEqual(['slowing', 'holding', 'complete']);
    expect(st.targetKts).toBe(TARGET);
    expect(st.okS).toBeGreaterThanOrEqual(SLOW_HOLD_S);
    expect(st.alt0).toBe(5000);
    expect(st.warned).toBe(false);
    const g = gradeSlowFlight(st);
    expect(g.grade).toBe('S');
    expect(g.kind).toBe('slowFlight');
    expect(g.factors.map((f) => f.key)).toEqual(['alt', 'hdg', 'speed']);
    expect(g.factors[2].label).toMatch(/63-73 kt/);
  });
  it('on the start screen nothing runs: the height and heading are taken when the player starts', () => {
    const st = createSlowFlight();
    for (let i = 0; i < 50; i++) slowFlightStep(st, { dt: DT, started: false, altFt: 5000 - i, iasKts: 95, warnKts: WARN, gustAddKts: 0, aoaDeg: 2, warnAoaDeg: 11, hdgDeg: i, stalled: false });
    expect(st.phase).toBe('wait');
    expect(st.t).toBe(0);
    expect(st.alt0).toBe(4951);
    expect(st.hdg0).toBe(49);
  });
  it('the band follows the flaps: the target is the warning speed for where the wing is', () => {
    const st = createSlowFlight();
    flySlow(st, { warn: 53, kts: (t) => Math.max(62, 95 - t) });
    expect(st.targetKts).toBe(58);
    expect(st.phase).toBe('complete');
  });
  it('a hold that trips the stall warning for over a second is capped at C', () => {
    const st = createSlowFlight();
    // In the band, but a 3 s dip under the horn's 58 at 50 s.
    flySlow(st, { kts: (t) => (t > 50 && t < 53 ? 57 : Math.max(66, 95 - t)) });
    expect(st.warned).toBe(true);
    const g = gradeSlowFlight(st);
    expect(g.score).toBeLessThanOrEqual(SLOW_WARN_CAP);
    expect(g.grade).toBe('C');
    expect(g.reason).toMatch(/stall warning/);
  });
  it('the wing at the horn\'s angle warns at any speed (a gust, a pull): held 1 s it caps at C', () => {
    const st = createSlowFlight();
    flySlow(st, { aoa: (t) => (t > 50 && t < 52 ? 11.5 : 6) });
    expect(st.warned).toBe(true);
    expect(gradeSlowFlight(st).grade).toBe('C');
  });
  it('short warnings add up: over 2 s in all is a warning', () => {
    const st = createSlowFlight();
    flySlow(st, { kts: (t) => (t > 40 && t < 75 && (t % 5) < 0.6 ? 57 : Math.max(66, 95 - t)) });
    expect(st.warnRunS).toBeLessThan(1);
    expect(st.warned).toBe(true);
  });
  it('a gusty METAR raises the band by half the gust spread', () => {
    const st = createSlowFlight();
    flySlow(st, { gustAdd: 5, kts: (t) => Math.max(72, 95 - t) });
    expect(st.targetKts).toBe(TARGET + 5);
    expect(st.phase).toBe('complete');
    expect(SLOW_GUST_SHARE).toBe(0.5);
  });
  it('a gust\'s blip under the horn (under a second) is not the pilot\'s', () => {
    const st = createSlowFlight();
    flySlow(st, { kts: (t) => (t > 50 && t < 50.5 ? 57 : Math.max(66, 95 - t)) });
    expect(st.warned).toBe(false);
    expect(st.warnS).toBeGreaterThan(0);
  });
  it('a stall fails the drill (D)', () => {
    const st = createSlowFlight();
    expect(flySlow(st, { stalledAt: 40 })).toEqual(['slowing', 'holding', 'failed']);
    const g = gradeSlowFlight(st);
    expect(st.why).toBe('stall');
    expect(g.score).toBeLessThanOrEqual(SLOW_LOST_CAP);
    expect(g.grade).toBe('D');
    expect(g.title).toMatch(/not finished/);
    expect(g.reason).toMatch(/Stalled/);
  });
  it('never slowing down fails after two minutes', () => {
    const st = createSlowFlight();
    expect(flySlow(st, { kts: () => 95 })).toEqual(['slowing', 'failed']);
    expect(st.why).toBe('time');
    expect(st.t).toBeGreaterThan(SLOW_FAIL_SLOWING_S);
    expect(gradeSlowFlight(st).reason).toMatch(/Never slowed/);
  });
  it('a height let go past the standard: 150 ft is a B, 250 ft a D, 600 ft fails', () => {
    for (const [ft, grade, phase] of [[150, 'B', 'complete'], [250, 'D', 'complete'], [600, 'D', 'failed']]) {
      const st = createSlowFlight();
      flySlow(st, { alt: (t) => 5000 - Math.min(ft, Math.max(0, t - 30) * 10) });
      expect(st.phase).toBe(phase);
      expect(gradeSlowFlight(st).grade).toBe(grade);
    }
  });
  it('the heading off by 15° caps the hold at B', () => {
    const st = createSlowFlight();
    flySlow(st, { hdg: (t) => (t > 40 && t < 45 ? -15 : 0) });
    expect(st.maxHdgDev).toBeCloseTo(15, 5);
    const g = gradeSlowFlight(st);
    expect(g.score).toBeLessThanOrEqual(SLOW_ACS_CAP);
    expect(g.grade).toBe('B');
  });
  it('too slow (under the band, over the horn) the whole time: the timer never fills, graded at 90 s, no better than a B', () => {
    const st = createSlowFlight();
    flySlow(st, { kts: (t) => Math.max(60, 95 - t) });
    expect(st.phase).toBe('complete');
    expect(st.holdS).toBeGreaterThanOrEqual(SLOW_HOLD_MAX_S);
    expect(st.okS).toBeLessThan(SLOW_HOLD_S);
    expect(st.underKts).toBeGreaterThan(2);
    const g = gradeSlowFlight(st);
    expect(g.score).toBeLessThanOrEqual(SLOW_ACS_CAP);
    expect(['C', 'D']).toContain(g.grade);
  });
});

describe('the coach and Kid (0164)', () => {
  const s = (o) => ({ dt: DT, started: true, altFt: 5000, iasKts: 68, warnKts: WARN, gustAddKts: 0, aoaDeg: 6, warnAoaDeg: 11, hdgDeg: 0, stalled: false, throttle: 0.6, ...o });
  it('every prompt has words, and the horn outranks the rest', () => {
    for (const key of Object.keys(SLOW_TEXT)) expect(coachText(key)).toBeTruthy();
    const st = createSlowFlight();
    flySlow(st, { seconds: 40 });
    expect(st.phase).toBe('holding');
    expect(slowPrompt(st, s({ iasKts: 57 }), false)).toBe('sfwHorn');
    expect(slowPrompt(st, s({ aoaDeg: 11.2 }), false)).toBe('sfwHorn');
    st.iasF = 61; expect(slowPrompt(st, s({ iasKts: 61 }), false)).toBe('sfwTooSlow');
    st.iasF = 68; expect(slowPrompt(st, s({ altFt: 4900 }), false)).toBe('sfwSink');
    expect(slowPrompt(st, s({ altFt: 5100 }), false)).toBe('sfwClimb');
    st.iasF = 76; expect(slowPrompt(st, s({ iasKts: 76 }), false)).toBe('sfwFast');
    expect(slowPrompt(st, s({ iasKts: 76, altFt: 4900 }), false)).toBe('sfwFastSink'); // power would speed the dive
    st.iasF = 68;
    expect(slowPrompt(st, s({ altFt: 5100, throttle: 0.1 }), false)).toBe('sfwClimbNose');
    expect(slowPrompt(st, s({ hdgDeg: 8 }), false)).toBe('sfwHdgR');
    expect(slowPrompt(st, s({ hdgDeg: 352 }), false)).toBe('sfwHdgL');
    expect(slowPrompt(st, s(), false)).toBe('sfwHold');
    expect(slowPrompt(st, s(), true)).toBe('sfwKid');
  });
  it('before and while slowing: throttle back and raise the nose', () => {
    const st = createSlowFlight();
    expect(slowPrompt(st, s({ iasKts: 95 }), false)).toBe('sfwSlow');
    expect(slowPrompt(st, s({ iasKts: 95 }), true)).toBe('sfwKidIn');
    flySlow(st, { seconds: 5 });
    expect(st.phase).toBe('slowing');
    expect(slowPrompt(st, s({ iasKts: 90, altFt: 4920 }), false)).toBe('sfwSlowing');
    expect(slowPrompt(st, s({ iasKts: 90, altFt: 5080 }), false)).toBe('sfwSlowHigh');
    st.iasF = 76; expect(slowPrompt(st, s({ iasKts: 76 }), false)).toBe('sfwNear');
  });
  it('Kid\'s guide: back to the start heading (≤ 10° of bank) and height; the autothrottle slows 1 kt/s to the band\'s middle', () => {
    const st = createSlowFlight();
    const out = { guideBankDeg: 0, guideGammaDeg: 0 };
    slowKidGuide(st, s({ hdgDeg: 30 }), out);
    expect(out.guideBankDeg).toBe(0); // waiting: nothing
    flySlow(st, { seconds: 1 });
    slowKidGuide(st, s({ hdgDeg: 30, altFt: 4800 }), out);
    expect(out.guideBankDeg).toBe(-10);
    expect(out.guideGammaDeg).toBe(3);
    slowKidGuide(st, s({ hdgDeg: 355, altFt: 5050 }), out);
    expect(out.guideBankDeg).toBeCloseTo(5, 5);
    expect(out.guideGammaDeg).toBeCloseTo(-1, 5);
    expect(slowKidKts(st)).toBeCloseTo(95 - SLOW_KID_DECEL_KTS_S * 1, 1);
    flySlow(st, { seconds: 60 });
    expect(slowKidKts(st)).toBe(TARGET + SLOW_KTS_OVER / 2);
    expect(gradeSlowFlight({ ...st, phase: 'complete', holdS: 45, inBandS: 45 }, true).note).toMatch(/for you/);
  });
});

describe('the words and the wing (0164)', () => {
  it('the band\'s numbers go into the words', () => {
    slowBandWords(63);
    expect(DRILL_TEXT.sfwSlow).toMatch(/73 kt/);
    expect(DRILL_TEXT.sfwTooSlow).toMatch(/under 63 kt/);
    expect(DRILL_TEXT.sfwFast).toMatch(/over 73 kt/);
    expect(DRILL_TEXT.sfwHold).toMatch(/63-73 kt/);
  });
  it('warnAoaDeg: the wing\'s 1 g angle at the warning speed, between the cruise and the stall', () => {
    const c = AIRCRAFT_DATABASE.c172;
    const a = warnAoaDeg(c, 0), r = stallSpeedKts(c, 0) / stallWarningKts(c, 0);
    expect(a).toBeGreaterThan(8);
    expect(a).toBeLessThan(stallAoaDeg(c, 0));
    expect(liftCoefficient(c, a * Math.PI / 180, 0)).toBeCloseTo(liftCoefficient(c, stallAoaDeg(c, 0) * Math.PI / 180, 0) * r * r, 3);
  });
});

describe('the mission (0164)', () => {
  it('is a Cessna drill over Grapevine Lake, 4,500 ft up, at 95 KIAS, in the Drills group and deep-linkable', () => {
    const m = missionByKey(SLOW_KEY);
    expect(m.key).toBe('c172_slow_flight');
    expect(m).toMatchObject({ kind: 'drill', aircraft: 'c172', aglFt: 4500, kias: 95, slowFlight: true });
    expect(m.flaps ?? 0).toBe(0);
    expect(groupMissions(MISSIONS).find((g) => g.id === 'drills').missions.map((x) => x.key)).toContain(SLOW_KEY);
    expect(missionFromLink('?mission=c172_slow_flight')).toBe(SLOW_KEY);
    expect(quietMission(m)).toBe(true); // no tower clearance over the lake
  });
  it('the adapter reads the sim: the horn\'s speed for where the flaps are, the nose\'s heading, the stall', () => {
    const c172 = AIRCRAFT_DATABASE.c172;
    const st = createSlowFlight();
    const sim = { quat: { x: 0, y: 0, z: 0, w: 1 }, pos: { y: 5000 / M_TO_FT }, iasKts: 95, spec: c172, flapsIndex: 0, flapPos: 0, aoaDeg: 2, throttle: 0.7, wx: { windKts: 8, gustKts: 4 } };
    expect(slowSimStep(st, sim, DT, false)).toBe('');
    expect(st.targetKts).toBeCloseTo(stallWarningKts(c172, 0) + SLOW_TARGET_OVER_WARN_KTS, 5);
    expect(st.hdg0).toBe(0);
    expect(st.alt0).toBeCloseTo(5000, 5);
    expect(slowSimStep(st, sim, DT, true)).toBe('slowing');
    sim.aoaDeg = stallAoaDeg(c172, 0) + 1;
    expect(slowSimStep(st, sim, DT, true)).toBe('failed');
    expect(st.why).toBe('stall');
  });
});
