import { describe, it, expect } from 'vitest';
import {
  STALL_KEY, createStallDrill, stallDrillState, gradeStallRecovery, stallResultInput, drillAssist,
  STALL_SECONDARY_S, STALL_HELD_CAP, STALL_SECONDARY_CAP,
} from '../../src/stallDrill.js';
import { coachTarget, coachText, stallTarget } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallAoaDeg } from '../../src/aero.js';
import { assistConfig, createAssistState, shapeControls, assistBestKey } from '../../src/assists.js';
import { makeBody, fly, attitude, vsFpm } from '../flight/harness.js';
import { M_TO_FT } from '../../src/constants.js';

const SA = 14.1;
const DT = 0.1;
// Flies a trace of [aoaDeg, altFt, vsFpm, bankDeg, pullIn, throttle] samples, DT apart,
// through the state machine; returns every transition.
function trace(st, samples, t0 = { t: 0 }) {
  const events = [];
  for (const [aoaDeg, altFt, vsFpm = 0, bankDeg = 0, pullIn = 0, throttle = 1] of samples) {
    t0.t += DT;
    const e = stallDrillState(st, { t: t0.t, dt: DT, altFt, aglFt: altFt, aoaDeg, stallAoaDeg: SA, vsFpm, bankDeg, pullIn, throttle });
    if (e) events.push(e);
  }
  return events;
}
const hold = (n, sample) => Array.from({ length: n }, () => sample);
const climbOut = (n, alt) => Array.from({ length: n }, (_, i) => [6, alt + i * 2, 500, 2]);

describe('stallDrillState (0087)', () => {
  it('a correct recovery: armed → stalled → unstalled → complete after the secondary-stall window', () => {
    const st = createStallDrill(), clock = { t: 0 };
    expect(trace(st, [[8, 4500], [12, 4495, -200], [13.9, 4490, -300]], clock)).toEqual([]);
    expect(st.phase).toBe('armed');
    expect(trace(st, [[14.5, 4488, -400, 3]], clock)).toEqual(['stalled']);
    // Nose down: the wing flies again in 0.3 s, the lowest point is 60 ft below the break.
    expect(trace(st, [[13, 4470, -800, 4], [10.8, 4450, -900, 6]], clock)).toEqual(['unstalled']);
    expect(trace(st, [[8, 4430, -400, 3], [7, 4428, 50, 1]], clock)).toEqual([]);
    // Climbing, wings level, but still inside the 10 s window: not yet complete...
    const n = Math.round(STALL_SECONDARY_S / DT);
    expect(trace(st, climbOut(n - 5, 4430), clock)).toEqual([]);
    // ...then complete, once.
    expect(trace(st, climbOut(5, 4500), clock)).toEqual(['complete']);
    expect(trace(st, climbOut(5, 4520), clock)).toEqual([]);
    expect(st).toMatchObject({ phase: 'complete', stallFt: 4488, lowFt: 4428, peakBankDeg: 6, secondary: false });
    expect(st.recoverS).toBeCloseTo(0.2, 5);
    const r = gradeStallRecovery(stallResultInput(st));
    expect(['S', 'A']).toContain(r.grade);
    expect(r.kind).toBe('stall');
    expect(r.factors.find((f) => f.key === 'height').value).toMatch(/^60 ft/);
  });

  it('a late recovery (stick held back 4 s) is capped at D, even with little height lost', () => {
    const st = createStallDrill(), clock = { t: 0 };
    trace(st, [[14.5, 4500, -300]], clock);
    trace(st, hold(40, [16, 4480, -600]), clock);
    expect(trace(st, [[10, 4460, -700]], clock)).toEqual(['unstalled']);
    trace(st, climbOut(Math.round(STALL_SECONDARY_S / DT) + 1, 4460), clock);
    expect(st.phase).toBe('complete');
    const r = gradeStallRecovery(stallResultInput(st));
    expect(r.grade).toBe('D');
    expect(r.score).toBeLessThanOrEqual(STALL_HELD_CAP);
    expect(r.reason).toMatch(/Held the stick back/);
  });

  it('back stick held after the stall counts as held even when an assist unstalls the wing at once (panel)', () => {
    const st = createStallDrill(), clock = { t: 0 };
    trace(st, [[14.5, 4500, -300, 0, 1]], clock);
    // The protection has the wing flying in 0.1 s, but the stick stays full back.
    expect(trace(st, [[10, 4480, -800, 0, 1]], clock)).toEqual(['unstalled']);
    trace(st, hold(50, [8, 4460, 200, 0, 1]), clock);
    trace(st, climbOut(Math.round(STALL_SECONDARY_S / DT) + 1, 4460), clock);
    expect(st.phase).toBe('complete');
    const r = gradeStallRecovery(stallResultInput(st));
    expect(r.grade).toBe('D');
    expect(r.reason).toMatch(/Held the stick back/);
    // A gentle pull to climb away is not holding it back.
    const ok = createStallDrill(), c2 = { t: 0 };
    trace(ok, [[14.5, 4500, -300]], c2);
    trace(ok, [[10, 4480, -800]], c2);
    trace(ok, hold(50, [8, 4460, 200, 0, 0.3]), c2);
    expect(ok.stalledS).toBeLessThan(0.5);
  });

  it('a zoom climb at idle is not a recovery: climbing away needs power (panel)', () => {
    const st = createStallDrill(), clock = { t: 0 };
    trace(st, [[14.5, 4500, -300]], clock);
    trace(st, [[10, 4480, -800, 0, 0, 0]], clock);
    const zoom = Array.from({ length: 150 }, (_, i) => [6, 4480 + i, 300, 0, 0, 0]);
    expect(trace(st, zoom, clock)).toEqual([]);
    expect(st.phase).toBe('unstalled');
    expect(trace(st, [[6, 4640, 300, 0, 0, 1]], clock)).toEqual(['complete']);
  });

  it('a re-stall within 10 s is a secondary stall, capped at C', () => {
    const st = createStallDrill(), clock = { t: 0 };
    trace(st, [[14.5, 4500, -300]], clock);
    trace(st, [[10, 4480, -800]], clock);
    expect(st.phase).toBe('unstalled');
    // Yanked out of the dive: past the stall angle again 2 s later.
    trace(st, hold(20, [8, 4440, -900]), clock);
    expect(trace(st, [[15, 4430, -200]], clock)).toEqual(['secondary']);
    expect(st.secondary).toBe(true);
    expect(trace(st, [[10, 4425, -300]], clock)).toEqual(['unstalled']);
    trace(st, climbOut(Math.round(STALL_SECONDARY_S / DT) + 1, 4425), clock);
    expect(st.phase).toBe('complete');
    const r = gradeStallRecovery(stallResultInput(st));
    expect(r.grade).toBe('C');
    expect(r.score).toBeLessThanOrEqual(STALL_SECONDARY_CAP);
    expect(r.factors.find((f) => f.key === 'secondary').value).toBe('yes');
  });

  it('no stall at all: nothing happens and nothing is graded', () => {
    const st = createStallDrill();
    expect(trace(st, hold(300, [12, 4500, -100]))).toEqual([]);
    expect(st.phase).toBe('armed');
  });

  it('not recovered (1,000 ft lost, 30 s, or below 1,000 ft above the ground) fails at D', () => {
    for (const [samples, why] of [
      [hold(10, [16, 3400, -2000]), 'height'],
      [hold(310, [16, 4400, -100]), 'time'],
    ]) {
      const st = createStallDrill(), clock = { t: 0 };
      trace(st, [[14.5, 4500]], clock);
      expect(trace(st, samples, clock), why).toContain('failed');
      const r = gradeStallRecovery(stallResultInput(st));
      expect(r.grade, why).toBe('D');
      expect(r.reason, why).toMatch(/Not recovered/);
    }
    const low = createStallDrill();
    stallDrillState(low, { t: 0, dt: DT, altFt: 1500, aglFt: 1100, aoaDeg: 15, stallAoaDeg: SA, vsFpm: -500, bankDeg: 0 });
    expect(stallDrillState(low, { t: 0.1, dt: DT, altFt: 1450, aglFt: 990, aoaDeg: 15, stallAoaDeg: SA, vsFpm: -500, bankDeg: 0 })).toBe('failed');
  });

  it('altitude lost is one input, not the only one: a slow, banked recovery that lost little is no A', () => {
    const r = gradeStallRecovery({ recoverS: 2.8, lostFt: 100, peakBankDeg: 30, secondary: false, stalledS: 2.8, failed: false });
    expect(r.factors.find((f) => f.key === 'height').score).toBe(100);
    expect(['S', 'A']).not.toContain(r.grade);
    // Diving the height away is no S either.
    const dive = gradeStallRecovery({ recoverS: 0.3, lostFt: 650, peakBankDeg: 2, secondary: false, stalledS: 0.3, failed: false });
    expect(dive.grade).not.toBe('S');
    expect(dive.score).toBeLessThan(gradeStallRecovery({ recoverS: 0.3, lostFt: 120, peakBankDeg: 2, secondary: false, stalledS: 0.3, failed: false }).score);
  });
});

describe('stall drill coach prompts (0087)', () => {
  const base = { aglFt: 4500, vsiFpm: 0, papiWhite: null, throttle: 0, onGround: false, autopilot: false, kid: false, bankDeg: 0 };
  it('idle, slow it, nose down, power, wings level, climb away', () => {
    expect(coachTarget({ ...base, stall: 'armed', throttle: 0.6 })).toBe('stIdle');
    expect(coachTarget({ ...base, stall: 'armed' })).toBe('stSlow');
    expect(coachTarget({ ...base, stall: 'stalled' })).toBe('stNose');
    // The Handbook's order once the wing flies: wings level, then power.
    expect(coachTarget({ ...base, stall: 'unstalled', throttle: 0, bankDeg: -12 })).toBe('stWings');
    expect(coachTarget({ ...base, stall: 'unstalled', throttle: 0.5 })).toBe('stPower');
    expect(coachTarget({ ...base, stall: 'unstalled', throttle: 1, bankDeg: -12 })).toBe('stWings');
    expect(coachTarget({ ...base, stall: 'unstalled', throttle: 1, bankDeg: 2 })).toBe('stClimb');
    expect(coachTarget({ ...base, stall: 'complete', throttle: 1 })).toBe(null);
    expect(coachText('stNose')).toMatch(/Nose down/);
  });
  it('Kid hears what the airplane is doing for them', () => {
    expect(stallTarget({ ...base, kid: true, stall: 'armed' })).toBe('stKidSlow');
    expect(stallTarget({ ...base, kid: true, stall: 'stalled' })).toBe('stKid');
  });
});

describe('the stall drill mission (0087)', () => {
  const m = missionByKey(STALL_KEY);
  it('is a C172 drill high over a fixed point, in the picker and deep-linkable', () => {
    expect(m.key).toBe(STALL_KEY);
    expect(m).toMatchObject({ kind: 'drill', aircraft: 'c172', aglFt: 4500, stallDrill: true });
    expect(MISSIONS.filter((x) => x.key === STALL_KEY)).toHaveLength(1);
    const g = groupMissions(MISSIONS).find((x) => x.missions.includes(m));
    expect(g.id).toBe('drills');
    expect(missionFromLink(`?mission=${STALL_KEY}`)).toBe(STALL_KEY);
  });
  it('keeps its best under its own key per assist level (invariant 6)', () => {
    expect(assistBestKey(STALL_KEY, 'pilot')).toBe('c172_stall_recovery');
    expect(assistBestKey(STALL_KEY, 'kid')).toBe('c172_stall_recovery@kid');
    expect(assistBestKey(STALL_KEY, 'learner')).toBe('c172_stall_recovery@learner');
  });
});

// The assist levels in the drill, on the real flight model: the protection is off until the
// stall (drillAssist), so Kid hands-off and Learner holding the stick back both stall; after
// it the protection is back on, the nose drops, and with power (Kid's autothrottle) it climbs.
describe('assist levels still stall in the drill, then recover (headless, 0087)', () => {
  const c172 = AIRCRAFT_DATABASE.c172;
  function flyDrill(level, { pitchIn, throttleAfter, holdBack = false }) {
    const cfg = assistConfig(level);
    const ast = createAssistState();
    const st = createStallDrill();
    const b = makeBody(c172, { kts: 90, altM: 1500, throttle: 0 });
    b.apMaster = false;
    const s = {}, out = {};
    let maxAoaOverStall = -Infinity;
    const sa = stallAoaDeg(c172, 0);
    fly(b, c172, 90, (x, dt) => {
      const { pitchDeg, bankRightDeg } = attitude(x);
      const da = drillAssist(st.phase);
      Object.assign(s, {
        pitchIn: st.phase === 'armed' || holdBack ? pitchIn : 0, rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
        aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, stallAoaDeg: da.protect ? sa : 90, tailstrikeDeg: 15,
        onGround: false, wheelHeightM: x.pos.y, airspeedMps: (x.tasKts ?? 0) * 0.514444,
        guideBankDeg: 0, guideGammaDeg: da.kidClimb ? 5 : 0,
      });
      shapeControls(cfg, ast, s, dt, out);
      x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
      x.throttle = level === 'kid' ? (da.kidThrottle ?? x.throttle) : st.phase === 'armed' ? 0 : throttleAfter;
      maxAoaOverStall = Math.max(maxAoaOverStall, (x.aoaDeg ?? 0) - sa);
    }, (x) => {
      stallDrillState(st, { t: x.t, dt: 1 / 120, altFt: x.pos.y * M_TO_FT, aglFt: x.pos.y * M_TO_FT, aoaDeg: x.aoaDeg, stallAoaDeg: sa, vsFpm: vsFpm(x),
        bankDeg: attitude(x).bankRightDeg, pullIn: Math.max(0, -s.pitchIn), throttle: x.throttle });
      return st.phase === 'complete' || st.phase === 'failed';
    });
    return { st, maxAoaOverStall, result: gradeStallRecovery(stallResultInput(st)) };
  }

  it('Kid, hands off at idle: it slows, stalls, then the airplane lowers its nose and climbs away', () => {
    const { st, result } = flyDrill('kid', { pitchIn: 0 });
    expect(st.stallT).not.toBeNull();
    expect(st.phase).toBe('complete');
    expect(st.secondary).toBe(false);
    expect(['S', 'A', 'B']).toContain(result.grade);
  });

  it('Learner, stick back at idle: it stalls; let go and add full power, it recovers', () => {
    const { st } = flyDrill('learner', { pitchIn: -1, throttleAfter: 1 });
    expect(st.stallT).not.toBeNull();
    expect(st.phase).toBe('complete');
  });

  it('Learner holding the stick full back through it all: the protection recovers, the grade is a D (panel)', () => {
    const { st, result } = flyDrill('learner', { pitchIn: -1, throttleAfter: 1, holdBack: true });
    expect(st.stallT).not.toBeNull();
    expect(result.grade).toBe('D');
  });

  it('outside the drill the protection still holds (drillAssist after the drill is normal)', () => {
    for (const p of ['complete', 'failed', null, undefined]) expect(drillAssist(p)).toEqual({ protect: true, kidThrottle: null, kidClimb: false });
  });
});

describe('the stall drill results card (0087 panel)', () => {
  const base = { recoverS: 0.3, lostFt: 80, peakBankDeg: 3, secondary: false, stalledS: 0.3, failed: false };
  it('titles the card and, at Kid level, says the airplane recovered for you', () => {
    expect(gradeStallRecovery(base)).toMatchObject({ title: 'Stall recovered', note: null });
    expect(gradeStallRecovery({ ...base, kid: true }).note).toMatch(/for you/);
    expect(gradeStallRecovery({ ...base, kid: true, failed: true })).toMatchObject({ title: 'Stall not recovered', note: null });
  });
});
