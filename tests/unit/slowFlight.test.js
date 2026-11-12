import { describe, it, expect } from 'vitest';
import {
  SLOW_KEY, SLOW_TEXT, SLOW_ACS_CAP, SLOW_WARN_CAP, SLOW_LOST_CAP, SLOW_HOLD_S, SLOW_HOLD_MAX_S, SLOW_FAIL_SLOWING_S,
  SLOW_TARGET_OVER_WARN_KTS, SLOW_KTS_OVER, SLOW_KID_DECEL_KTS_S,
  createSlowFlight, slowFlightStep, slowSimStep, slowPrompt, slowKidGuide, slowKidKts, gradeSlowFlight,
} from '../../src/slowFlight.js';
import { coachText } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { quietMission } from '../../src/tower.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallWarningKts, stallAoaDeg } from '../../src/aero.js';
import { M_TO_FT } from '../../src/constants.js';

const DT = 0.1;
const WARN = 58;
const TARGET = WARN + SLOW_TARGET_OVER_WARN_KTS; // 63

// A scripted slow flight: `started` after 1 s on the start screen, then kts(t), alt(t), hdg(t) each step
// until graded or `seconds` pass. Returns every transition.
function flySlow(st, { kts = (t) => Math.max(68, 95 - t), alt = () => 5000, hdg = () => 0, stalledAt = null, seconds = 400, warn = WARN } = {}) {
  const events = [];
  let t = 0;
  for (let i = 0; i < 10; i++) { const e = slowFlightStep(st, { dt: DT, started: false, altFt: 5000, iasKts: 95, warnKts: warn, hdgDeg: 0, stalled: false }); if (e) events.push(e); }
  for (let n = 0; n < seconds / DT && st.phase !== 'complete' && st.phase !== 'failed'; n++) {
    t += DT;
    const e = slowFlightStep(st, { dt: DT, started: true, altFt: alt(t), iasKts: kts(t), warnKts: warn, hdgDeg: (hdg(t) + 360) % 360, stalled: stalledAt !== null && t >= stalledAt });
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
    for (let i = 0; i < 50; i++) slowFlightStep(st, { dt: DT, started: false, altFt: 5000 - i, iasKts: 95, warnKts: WARN, hdgDeg: i, stalled: false });
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
  const s = (o) => ({ dt: DT, started: true, altFt: 5000, iasKts: 68, warnKts: WARN, hdgDeg: 0, stalled: false, ...o });
  it('every prompt has words, and the horn outranks the rest', () => {
    for (const key of Object.keys(SLOW_TEXT)) expect(coachText(key)).toBe(SLOW_TEXT[key]);
    const st = createSlowFlight();
    flySlow(st, { seconds: 40 });
    expect(st.phase).toBe('holding');
    expect(slowPrompt(st, s({ iasKts: 57 }), false)).toBe('sfwHorn');
    st.iasF = 61; expect(slowPrompt(st, s({ iasKts: 61 }), false)).toBe('sfwTooSlow');
    st.iasF = 68; expect(slowPrompt(st, s({ altFt: 4900 }), false)).toBe('sfwSink');
    expect(slowPrompt(st, s({ altFt: 5100 }), false)).toBe('sfwClimb');
    st.iasF = 76; expect(slowPrompt(st, s({ iasKts: 76 }), false)).toBe('sfwFast');
    st.iasF = 68; expect(slowPrompt(st, s({ hdgDeg: 8 }), false)).toBe('sfwHdg');
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
    const sim = { quat: { x: 0, y: 0, z: 0, w: 1 }, pos: { y: 5000 / M_TO_FT }, iasKts: 95, spec: c172, flapsIndex: 0, flapPos: 0, aoaDeg: 2 };
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
