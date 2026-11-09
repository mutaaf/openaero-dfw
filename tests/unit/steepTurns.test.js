import { describe, it, expect } from 'vitest';
import { Quaternion, Euler } from 'three';
import {
  STEEP_KEY, STEEP_TEXT, STEEP_ACS_CAP, STEEP_LOST_CAP, STEEP_ASSIST_BANK_DEG, STEEP_BANK_DEG,
  createSteepTurns, steepTurnStep, steepStep, steepPrompt, steepKidGuide, gradeSteepTurns,
} from '../../src/steepTurns.js';
import { coachText, coachTarget } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { assistConfig, createAssistState, shapeControls } from '../../src/assists.js';
import { stallAoaDeg } from '../../src/aero.js';
import { M_TO_FT } from '../../src/constants.js';

const DT = 0.1;
const RATE = 11; // °/s: a C172 at 45° and ~97 KTAS (1091 tan φ / V)

// A scripted steep turn: rolls in at 15°/s, holds `bank`, turns at RATE, rolls out `leadDeg`
// short, then the other way. alt(t, deg) and kts(t) shape the run. Returns every transition.
function flyTurns(st, { bank = 45, leadDeg = 20, alt = () => 3000, kts = () => 95, firstDir = 1, stalledAt = null } = {}) {
  const events = [];
  let hdg = 10, t = 0, phi = 0;
  const step = (bankDeg) => {
    t += DT;
    phi = bankDeg;
    hdg = (hdg + RATE * Math.sin(phi * Math.PI / 180) / Math.sin(Math.PI / 4) * DT + 360) % 360;
    const e = steepTurnStep(st, { dt: DT, altFt: alt(t, st), iasKts: kts(t), bankDeg: phi, hdgDeg: hdg, stalled: stalledAt !== null && t >= stalledAt });
    if (e) events.push(e);
    return e;
  };
  for (let i = 0; i < 10; i++) step(0); // wings level: the entry
  for (const dir of [firstDir, -firstDir]) {
    let turned = 0, last = hdg;
    for (let b = 0; b < bank; b += 15 * DT) { step(dir * b); }
    for (let n = 0; n < 2000 && st.phase !== 'complete' && st.phase !== 'failed'; n++) {
      const d = ((hdg - last + 540) % 360) - 180; last = hdg; turned += d * dir;
      if (turned >= 360 - leadDeg) break;
      step(dir * bank);
    }
    for (let b = bank; b > 0; b -= 15 * DT) { if (step(dir * b)) break; }
    if (st.phase === 'turn1' || st.phase === 'turn2') step(0);
    if (st.phase === 'complete' || st.phase === 'failed') break;
  }
  return { events, hdgEnd: hdg };
}

describe('steepTurnStep (0161): two 360° turns, one each way', () => {
  it('rolls in, reverses, completes; the entry is where the roll-in began', () => {
    const st = createSteepTurns();
    const { events } = flyTurns(st);
    expect(events).toEqual(['turn1', 'reverse', 'complete']);
    expect(st.alt0).toBe(3000);
    expect(st.kts0).toBe(95);
    expect(st.rollout).toHaveLength(2);
    for (const r of st.rollout) expect(r).toBeLessThan(10);
  });
  it('a left turn first works the same way, the second turn to the right', () => {
    const st = createSteepTurns();
    expect(flyTurns(st, { firstDir: -1 }).events).toEqual(['turn1', 'reverse', 'complete']);
  });
  it('a too-shallow bank still turns, but the held-bank share drops', () => {
    const good = createSteepTurns(), shallow = createSteepTurns();
    flyTurns(good);
    flyTurns(shallow, { bank: 35 });
    expect(good.bankOkS / good.bankS).toBeGreaterThan(0.95);
    expect(shallow.bankOkS / shallow.bankS).toBe(0);
  });
  it('fails when the height wanders 500 ft or the wing stalls', () => {
    const sinking = createSteepTurns();
    const { events } = flyTurns(sinking, { alt: (t) => 3000 - t * 20 });
    expect(events.at(-1)).toBe('failed');
    expect(sinking.why).toBe('height');
    const stalled = createSteepTurns();
    expect(flyTurns(stalled, { stalledAt: 8 }).events.at(-1)).toBe('failed');
    expect(stalled.why).toBe('stall');
  });
  it('does nothing once graded', () => {
    const st = createSteepTurns();
    flyTurns(st);
    expect(steepTurnStep(st, { dt: DT, altFt: 0, iasKts: 0, bankDeg: 60, hdgDeg: 0, stalled: true })).toBe('');
  });
});

describe('gradeSteepTurns (0161): FAA-S-ACS-6C Area V Task A', () => {
  it('a ±100 ft / ±5° turn pair grades A or better', () => {
    const st = createSteepTurns();
    flyTurns(st, { bank: 47, alt: (t, s) => (s.phase === 'entry' ? 3000 : 3000 - 95 * Math.sin(t / 6)), kts: (t) => 95 + 6 * Math.sin(t / 4) });
    const g = gradeSteepTurns(st);
    expect(st.maxAltDevFt).toBeLessThanOrEqual(100);
    expect(['S', 'A']).toContain(g.grade);
    expect(g.reason).toBeNull();
    expect(g.kind).toBe('steepTurns');
  });
  it('a pilot who loses 300 ft grades D, and says so', () => {
    const st = createSteepTurns();
    flyTurns(st, { alt: (t, s) => (s.phase === 'entry' ? 3000 : Math.max(2700, 3000 - t * 15)) });
    expect(st.phase).toBe('complete');
    const g = gradeSteepTurns(st);
    expect(g.grade).toBe('D');
    expect(g.score).toBeLessThanOrEqual(STEEP_LOST_CAP);
    expect(g.reason).toMatch(/Lost 30\d ft/);
  });
  it('outside one tolerance (150 ft) is no better than a B', () => {
    const st = createSteepTurns();
    flyTurns(st, { alt: (t, s) => (s.phase === 'entry' ? 3000 : 3000 + Math.min(150, t * 10)) });
    const g = gradeSteepTurns(st);
    expect(g.score).toBeLessThanOrEqual(STEEP_ACS_CAP);
    expect(g.reason).toMatch(/tolerance/);
  });
  it('a roll-out 30° past the heading costs the roll-out factor', () => {
    const st = createSteepTurns();
    flyTurns(st, { leadDeg: -15 });
    const f = gradeSteepTurns(st).factors.find((x) => x.key === 'rollout');
    expect(f.score).toBeLessThan(85);
  });
  it('not finished is a D with the reason; Kid gets its note only when it finished', () => {
    const st = createSteepTurns();
    flyTurns(st, { stalledAt: 8 });
    const g = gradeSteepTurns(st, true);
    expect(g.grade).toBe('D');
    expect(g.reason).toMatch(/Stalled/);
    expect(g.note).toBeNull();
    const ok = createSteepTurns();
    flyTurns(ok);
    expect(gradeSteepTurns(ok, true).note).toMatch(/Kid/);
  });
});

describe('steepStep reads the sim like main.js (YXZ: heading = −y, bank right = −z)', () => {
  it('heading 090 with 30° of right bank', () => {
    const st = createSteepTurns();
    const quat = new Quaternion().setFromEuler(new Euler(0.05, -Math.PI / 2, -30 * Math.PI / 180, 'YXZ'));
    const sim = { quat, pos: { y: 1000 }, iasKts: 95, aoaDeg: 4, spec: AIRCRAFT_DATABASE.c172, flapsIndex: 0 };
    steepStep(st, sim, 0.1);
    expect(st.lastHdg).toBeCloseTo(90, 3);
    expect(st.phase).toBe('turn1');
    expect(st.dir).toBe(1);
    sim.aoaDeg = stallAoaDeg(AIRCRAFT_DATABASE.c172, 0) + 1;
    expect(steepStep(st, sim, 0.1)).toBe('failed');
    expect(st.alt0).toBeCloseTo(1000 * M_TO_FT, 3);
  });
});

describe('the coach and Kid\'s guide (0161)', () => {
  const s = (o) => ({ altFt: 3000, iasKts: 95, bankDeg: 45, aoaDeg: 6, ...o });
  it('says roll in, ease back when sinking, the bank, then roll out / reverse at the lead', () => {
    const st = createSteepTurns();
    expect(steepPrompt(st, s({ bankDeg: 0 }), false)).toBe('sttRollIn');
    Object.assign(st, { phase: 'turn1', dir: 1, turned: 120, alt0: 3000, kts0: 95 });
    expect(steepPrompt(st, s({ altFt: 2930 }), false)).toBe('sttBack');
    expect(steepPrompt(st, s({ altFt: 3070 }), false)).toBe('sttEase');
    expect(steepPrompt(st, s({ bankDeg: 35 }), false)).toBe('sttSteeper');
    expect(steepPrompt(st, s({ bankDeg: 55 }), false)).toBe('sttShallower');
    expect(steepPrompt(st, s({ iasKts: 86 }), false)).toBe('sttPower');
    expect(steepPrompt(st, s(), false)).toBe('sttHold');
    st.turned = 345;
    expect(steepPrompt(st, s(), false)).toBe('sttReverse');
    Object.assign(st, { phase: 'turn2', dir: -1, turned: -345 });
    expect(steepPrompt(st, s({ bankDeg: -45 }), false)).toBe('sttRollOut');
    expect(steepPrompt(st, s(), true)).toBe('sttKid');
    st.phase = 'complete';
    expect(steepPrompt(st, s(), false)).toBeNull();
  });
  it('every word reaches the coach (coach.js DRILL_TEXT, through s.ds)', () => {
    for (const k of Object.keys(STEEP_TEXT)) {
      expect(coachText(k)).toBe(STEEP_TEXT[k]);
      expect(coachTarget({ ds: k, aglFt: 3000, vsiFpm: 0, papiWhite: null, throttle: 0.7 })).toBe(k);
    }
    expect(STEEP_TEXT.sttBack).toMatch(/ease back/i);
    expect(STEEP_TEXT.sttRollOut).toMatch(/wings level/i);
  });
  it('Kid\'s guide banks 45° each way, levels at the lead, and asks the path back to the entry height', () => {
    const st = createSteepTurns(), out = {};
    steepKidGuide(st, s({ bankDeg: 0 }), out);
    expect(out.guideBankDeg).toBe(STEEP_BANK_DEG);
    expect(out.guideGammaDeg).toBe(0);
    Object.assign(st, { phase: 'turn2', dir: -1, turned: -100, alt0: 3000 });
    steepKidGuide(st, s({ altFt: 2900, bankDeg: -45 }), out);
    expect(out.guideBankDeg).toBe(-45);
    expect(out.guideGammaDeg).toBeCloseTo(2 - 6 * (1 - Math.SQRT1_2), 6);
    st.turned = -350;
    steepKidGuide(st, s(), out);
    expect(out.guideBankDeg).toBe(0);
  });
  it('the mission cap lets Kid and Learner reach 45° with full stick, and only in the mission', () => {
    const base = { pitchIn: 0, rollIn: 1, yawIn: 0, pitchDeg: 3, bankRightDeg: 44, pitchRateUp: 0, rollRateRight: 0, aoaDeg: 5,
      betaDeg: 0, stallAoaDeg: 14, tailstrikeDeg: 15, onGround: false, wheelHeightM: 900, airspeedMps: 50, vsMps: 0, guideBankDeg: 0, guideGammaDeg: 0 };
    for (const level of ['kid', 'learner']) {
      const out = {};
      shapeControls(assistConfig(level), createAssistState(), { ...base }, 0.01, out);
      expect(out.ail).toBeLessThan(0); // past its own cap (30° / 45° × 0.85): rolled back
      shapeControls(assistConfig(level), createAssistState(), { ...base, bankMaxDeg: STEEP_ASSIST_BANK_DEG }, 0.01, out);
      expect(out.ail).toBeGreaterThan(0); // 0.85 × 53 = 45°: still rolling in at 44°
    }
    expect(STEEP_ASSIST_BANK_DEG * 0.85).toBeCloseTo(45, 0);
  });
});

describe('the mission (0161)', () => {
  const m = missionByKey(STEEP_KEY);
  it('is a Cessna drill at 3,000 ft AGL and 95 KIAS (under the C172S POH\'s 105 KIAS VA), in the drills group', () => {
    expect(m.key).toBe(STEEP_KEY);
    expect(m).toMatchObject({ kind: 'drill', aircraft: 'c172', aglFt: 3000, kias: 95, steepTurns: true });
    expect(MISSIONS.filter((x) => x.steepTurns)).toHaveLength(1);
    expect(groupMissions(MISSIONS).find((g) => g.id === 'drills').missions.map((x) => x.key)).toContain(STEEP_KEY);
    expect(m.blurb).toMatch(/45°/);
  });
  it('deep links as ?mission=steep_turns', () => {
    expect(missionFromLink('?mission=steep_turns')).toBe(STEEP_KEY);
  });
});
