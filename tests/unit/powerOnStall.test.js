import { describe, it, expect } from 'vitest';
import {
  POWER_ON_KEY, PO_TEXT, createStallDrill, stallDrillState, gradeStallRecovery, stallResultInput, drillAssist, powerOnPrompt,
  PO_ENTRY_THROTTLE, PO_FAIL_AGL_FT, PO_MIN_KTS, PO_NOSE_HIGH_CAP, PO_PITCH_DEG,
} from '../../src/powerOnStall.js';
import { STALL_HELD_CAP, STALL_SECONDARY_CAP } from '../../src/stallDrill.js';
import { coachTarget, coachText, RANK } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallAoaDeg, stallWarningKts } from '../../src/aero.js';
import { assistConfig, createAssistState, shapeControls, assistBestKey } from '../../src/assists.js';
import { makeBody, fly, attitude, vsFpm } from '../flight/harness.js';
import { M_TO_FT, RAD_TO_DEG } from '../../src/constants.js';
import { rollHoldScale } from '../../src/flightModel.js';
import { Euler } from 'three';

const SA = 14.1;
const DT = 0.1;
// Flies samples { aoa, alt, vs, bank, pull, thr, kts, hdg, pitch } through the state machine.
function trace(st, samples, t0 = { t: 0 }) {
  const events = [];
  for (const x of samples) {
    t0.t += DT;
    const e = stallDrillState(st, { t: t0.t, dt: DT, altFt: x.alt ?? 4500, aglFt: x.agl ?? x.alt ?? 4500, aoaDeg: x.aoa, stallAoaDeg: SA,
      vsFpm: x.vs ?? 0, bankDeg: x.bank ?? 0, pullIn: x.pull ?? 0, throttle: x.thr ?? 1, iasKts: x.kts ?? 60, warnKts: 55,
      hdgDeg: x.hdg ?? 0, pitchDeg: x.pitch ?? 5, flapsIndex: x.flaps ?? 1 });
    if (e) events.push(e);
  }
  return events;
}
const hold = (n, x) => Array.from({ length: n }, () => x);

describe('powerOnStall state machine (0191)', () => {
  it('a full-power stall at climb attitude arms, stalls, flies again and completes climbing at Vx', () => {
    const st = createStallDrill();
    const ev = trace(st, [
      ...hold(10, { aoa: 10, pitch: 18, kts: 52 }),
      { aoa: 15, pitch: 19, kts: 48, alt: 4600 },
      ...hold(3, { aoa: 9, pitch: 2, kts: 50, alt: 4580 }),
      ...hold(110, { aoa: 7, pitch: 8, kts: 62, vs: 600, alt: 4600 }),
    ]);
    expect(ev).toEqual(['stalled', 'unstalled', 'complete']);
    expect(st.stallKts).toBe(48);
    expect(st.minPitchDeg).toBe(2);
    expect(st.recoverS).toBeCloseTo(0.1, 5);
    const r = gradeStallRecovery(stallResultInput(st));
    expect(r.grade).toBe('S');
    expect(r.reason).toMatch(/Lost 20 ft/);
  });

  it('a stall under 65% power is not this drill (ACS S4): it stays armed', () => {
    const st = createStallDrill();
    expect(trace(st, hold(5, { aoa: 15, thr: PO_ENTRY_THROTTLE - 0.01, kts: 48 }))).toEqual([]);
    expect(st.phase).toBe('armed');
  });

  it('a yank at cruise speed is not the drill\'s stall either', () => {
    const st = createStallDrill();
    expect(trace(st, hold(5, { aoa: 15, kts: 75 }))).toEqual([]);
  });

  it('measures the heading wander under power only (ACS S6), from the first frame\'s heading', () => {
    const st = createStallDrill();
    trace(st, [{ aoa: 5, hdg: 0, thr: 0.4 }, { aoa: 5, hdg: 30, thr: 0.4 }, { aoa: 5, hdg: -7, thr: 1 }, { aoa: 5, hdg: 355, thr: 1 }]);
    expect(st.entryHdgDeg).toBe(7);
  });

  it('not recovered: falling through 1,500 ft AGL fails (ACS S2), and the card says why', () => {
    const st = createStallDrill();
    const ev = trace(st, [{ aoa: 15, kts: 48, agl: 1600 }, { aoa: 15, kts: 48, agl: PO_FAIL_AGL_FT - 1 }]);
    expect(ev).toEqual(['stalled', 'failed']);
    const r = gradeStallRecovery(stallResultInput(st, false, PO_FAIL_AGL_FT - 1));
    expect(r.score).toBeLessThanOrEqual(STALL_HELD_CAP);
    expect(r.reason).toMatch(/1,500 ft/);
    expect(r.title).toBe('Power-on stall not recovered');
  });

  it('flying again too slow is not complete: the climb is at Vx less 5 kt or faster (ACS S9)', () => {
    const st = createStallDrill();
    trace(st, [{ aoa: 15, kts: 48 }, ...hold(120, { aoa: 7, pitch: 3, kts: PO_MIN_KTS - 1, vs: 600 })]);
    expect(st.phase).toBe('unstalled');
    trace(st, hold(2, { aoa: 7, pitch: 3, kts: PO_MIN_KTS, vs: 600 }), { t: 12.1 });
    expect(st.phase).toBe('complete');
  });
});

describe('the power-on stall grade (0191)', () => {
  const base = { recoverS: 0.4, lostFt: 60, peakBankDeg: 4, entryHdgDeg: 3, minPitchDeg: 2, secondary: false, stalledS: 0.4, failed: false };
  it('a prompt, level, on-heading recovery is an S; the ACS sets no height figure, so height is told, not scored', () => {
    const r = gradeStallRecovery(base);
    expect(r.grade).toBe('S');
    expect(r.factors.map((f) => f.key)).toEqual(['reaction', 'heading', 'bank', 'secondary']);
    expect(gradeStallRecovery({ ...base, lostFt: 600 }).score).toBe(r.score);
  });
  it('wandering past the ACS\'s ±10° costs the heading factor', () => {
    expect(gradeStallRecovery({ ...base, entryHdgDeg: 10 }).factors[1].score).toBe(100);
    expect(gradeStallRecovery({ ...base, entryHdgDeg: 20 }).factors[1].score).toBe(40);
    expect(gradeStallRecovery({ ...base, entryHdgDeg: 20 }).score).toBeLessThan(gradeStallRecovery(base).score);
  });
  it('the wrong techniques: held stick D, secondary stall C, the nose kept above 10° B', () => {
    expect(gradeStallRecovery({ ...base, stalledS: 4 })).toMatchObject({ grade: 'D' });
    expect(gradeStallRecovery({ ...base, stalledS: 4 }).score).toBeLessThanOrEqual(STALL_HELD_CAP);
    expect(gradeStallRecovery({ ...base, secondary: true }).score).toBe(STALL_SECONDARY_CAP);
    expect(gradeStallRecovery({ ...base, secondary: true }).grade).toBe('C');
    const high = gradeStallRecovery({ ...base, minPitchDeg: 11 });
    expect(high).toMatchObject({ grade: 'B', score: PO_NOSE_HIGH_CAP });
    expect(high.reason).toMatch(/above 10°/);
  });
  it('Kid\'s card says the airplane flew it', () => {
    expect(gradeStallRecovery({ ...base, kid: true }).note).toMatch(/for you/);
    expect(gradeStallRecovery({ ...base, kid: true, failed: true }).note).toBe(null);
  });
});

describe('the power-on stall coach (0191)', () => {
  const st = (o) => ({ ...createStallDrill(), ...o });
  it('steps through the Handbook: power, nose up, hold; stall: nose down; wings, power, flaps, climb', () => {
    expect(powerOnPrompt(st({ phase: 'armed' }), false, 0.5)).toBe('poPower');
    expect(powerOnPrompt(st({ phase: 'armed', pitchDeg: 8 }), false, 1)).toBe('poNose');
    expect(powerOnPrompt(st({ phase: 'armed', pitchDeg: 19 }), false, 1)).toBe('poHold');
    expect(powerOnPrompt(st({ phase: 'stalled' }), false, 1)).toBe('poStall');
    expect(powerOnPrompt(st({ phase: 'unstalled', bankDeg: -12 }), false, 1)).toBe('poWings');
    expect(powerOnPrompt(st({ phase: 'unstalled' }), false, 0.6)).toBe('poPower');
    expect(powerOnPrompt(st({ phase: 'unstalled', flaps: 1, vsFpm: 300, iasKts: 61 }), false, 1)).toBe('poFlaps');
    expect(powerOnPrompt(st({ phase: 'unstalled', flaps: 0, vsFpm: 300, iasKts: 61 }), false, 1)).toBe('poClimb');
    expect(powerOnPrompt(st({ phase: 'complete' }), false, 1)).toBe(null);
  });
  it('Kid hears what the airplane does for them', () => {
    expect(powerOnPrompt(st({ phase: 'armed' }), true, 1)).toBe('poKidUp');
    expect(powerOnPrompt(st({ phase: 'stalled' }), true, 1)).toBe('poKid');
  });
  it('goes through coach.js as s.ds, worded short in the lazy chunk; the stall interrupts at once', () => {
    expect(coachTarget({ aglFt: 4500, vsiFpm: 0, throttle: 1, onGround: false, autopilot: false, stall: null, ds: 'poHold' })).toBe('poHold');
    for (const k of Object.keys(PO_TEXT)) {
      expect(coachText(k)).toBe(PO_TEXT[k]);
      expect(PO_TEXT[k].length).toBeLessThanOrEqual(48);
    }
    expect(RANK.poStall).toBeGreaterThan(RANK.poHold);
  });
});

describe('the power-on stall mission (0191)', () => {
  const m = missionByKey(POWER_ON_KEY);
  it('is the Cessna at flaps 10 and lift-off speed, high over Grapevine Lake, in Drills and deep-linkable', () => {
    expect(m.key).toBe(POWER_ON_KEY);
    expect(m).toMatchObject({ kind: 'drill', aircraft: 'c172', aglFt: 4500, kias: 60, flaps: 1, stallDrill: true, powerOn: true });
    expect(MISSIONS.filter((x) => x.key === POWER_ON_KEY)).toHaveLength(1);
    expect(groupMissions(MISSIONS).find((g) => g.missions.includes(m)).id).toBe('drills');
    expect(missionFromLink(`?mission=${POWER_ON_KEY}`)).toBe(POWER_ON_KEY);
    expect(assistBestKey(POWER_ON_KEY, 'kid')).toBe('c172_power_on_stall@kid');
  });
});

// Kid and Learner on the real flight model through shapeControls, as main.js applyAssists wires
// drillAssist: the pitch cap lifted and the protection off until the stall, Kid's guide raising the
// nose to PO_PITCH_DEG at full power; after it the protection lowers the nose and Kid climbs away.
describe('assist levels stall at full power and recover (headless, 0191)', () => {
  const c172 = AIRCRAFT_DATABASE.c172;
  const e = new Euler();
  function flyDrill(level, { pitchIn = 0, holdBack = false } = {}) {
    const cfg = assistConfig(level);
    const ast = createAssistState();
    const st = createStallDrill();
    const b = makeBody(c172, { kts: 60, altM: 1500, flaps: 1, throttle: 1 });
    b.apMaster = false;
    const sa = stallAoaDeg(c172, 1);
    const s = {}, out = {};
    fly(b, c172, 90, (x, dt) => {
      const { pitchDeg, bankRightDeg } = attitude(x);
      const da = drillAssist(st.phase);
      Object.assign(s, {
        pitchIn: st.phase === 'armed' || holdBack ? pitchIn : 0, rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
        rollScale: rollHoldScale(c172, (x.tasKts ?? 0) * 0.514444), aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, stallAoaDeg: da.protect ? sa : 90,
        tailstrikeDeg: 15, onGround: false, wheelHeightM: x.pos.y, airspeedMps: (x.tasKts ?? 0) * 0.514444, pitchUpMaxDeg: da.pitchUpMaxDeg,
        guideBankDeg: 0, guideGammaDeg: da.kidPitchDeg ? da.kidPitchDeg - (x.aoaDeg ?? 0) : da.kidClimb ? 5 : 0,
      });
      shapeControls(cfg, ast, s, dt, out);
      x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
      x.throttle = 1;
      if (st.phase === 'unstalled' && x.iasKts > 60) x.flapsIndex = 0;
    }, (x) => {
      e.setFromQuaternion(x.quat, 'YXZ');
      stallDrillState(st, { t: x.t, dt: 1 / 120, altFt: x.pos.y * M_TO_FT, aglFt: x.pos.y * M_TO_FT, aoaDeg: x.aoaDeg, stallAoaDeg: sa, vsFpm: vsFpm(x),
        bankDeg: attitude(x).bankRightDeg, pullIn: Math.max(0, -s.pitchIn), throttle: x.throttle, iasKts: x.iasKts, warnKts: stallWarningKts(c172, 1),
        hdgDeg: -e.y * RAD_TO_DEG, pitchDeg: attitude(x).pitchDeg, flapsIndex: x.flapsIndex });
      return st.phase === 'complete' || st.phase === 'failed';
    });
    return { st, result: gradeStallRecovery(stallResultInput(st, level === 'kid')) };
  }

  it(`Kid, hands off: the guide raises the nose toward ${PO_PITCH_DEG}°, it stalls, then lowers its nose and climbs away`, () => {
    const { st, result } = flyDrill('kid');
    console.log(`[0191 kid] ${st.phase}, stall ${st.stallKts?.toFixed(1)} KIAS at ${st.stallPitchDeg?.toFixed(1)}°, nose down to ${st.minPitchDeg.toFixed(1)}°, ${result.grade} ${result.score}`);
    expect(st.stallT).not.toBeNull();
    expect(st.phase).toBe('complete');
    expect(st.secondary).toBe(false);
  });

  it('Learner, stick back to the attitude then let go: it stalls, the protection lowers the nose, it recovers', () => {
    const { st, result } = flyDrill('learner', { pitchIn: -1 });
    console.log(`[0191 learner] ${st.phase}, stall ${st.stallKts?.toFixed(1)} KIAS at ${st.stallPitchDeg?.toFixed(1)}°, nose down to ${st.minPitchDeg.toFixed(1)}°, ${result.grade} ${result.score} ${JSON.stringify(result.factors.map((f) => [f.key, f.value, f.score]))} ${result.reason}`);
    expect(st.stallT).not.toBeNull();
    expect(st.phase).toBe('complete');
  });

  it('Learner holding the stick full back through it all: the grade is a D', () => {
    const { st, result } = flyDrill('learner', { pitchIn: -1, holdBack: true });
    expect(st.stallT).not.toBeNull();
    expect(result.grade).toBe('D');
  });

  it('without the drill, Kid\'s and Learner\'s own pitch caps still hold (no lifted cap after it)', () => {
    for (const p of ['complete', 'failed', null]) expect(drillAssist(p)).toMatchObject({ protect: true, pitchUpMaxDeg: null, kidPitchDeg: null });
  });
});
