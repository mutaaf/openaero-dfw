// Unusual-attitude recovery (ticket 0174) flown headless: the C172 through flightModel.js at 100 KIAS,
// ~5,500 ft MSL, trimmed for it (stick-fixed trim: the pilot holds the pressures), handed over in
// upset.js's set-ups. A test pilot recovers in the Instrument Flying Handbook's order
// (FAA-H-8083-15B pp. 7-27/7-28: nose-high, power then nose down then wings; nose-low, power idle,
// wings level, then ease back), another pulls in the diving turn, a third does nothing. The card
// checks the drill against the airplane: the handbook's recovery is flyable inside the POH's limits
// (VNE 163 KIAS, +3.8 g) and grades A or better; the instinctive pull and doing nothing fail, each
// with its own words.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { FT_TO_M, KTS_TO_MPS } from '../../src/constants.js';
import { elevatorForPitch, aileronForBank, trimAoaDeg } from '../../src/autopilot.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { createUpset, upsetSimStep, gradeUpset, UPSETS } from '../../src/upset.js';
import { makeBody, fly, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const KTS = 100;

// pilot(x, dt, st, t): the recovery after the hand-over (nothing before it).
function upset(kind, pilot) {
  const b = makeBody(c172, { kts: KTS, altM: 5500 * FT_TO_M, throttle: 0 });
  b.spec = c172;
  b.throttle = b.engineN = trimThrottle(c172, KTS * KTS_TO_MPS, 0, 0, true, airAt(b.pos.y));
  b.apMaster = false;
  b.autoTrim = false;
  b.trimAlphaDeg = trimAoaDeg(c172, KTS * KTS_TO_MPS, 0);
  const st = createUpset(kind);
  let ev = '', at = null, maxKts = 0, minKts = Infinity, maxG = 0, start = null;
  fly(b, c172, 40, (x, dt) => {
    if (st.phase === 'recover') pilot(x, dt, st);
  }, (x) => {
    ev = upsetSimStep(st, x, 1 / 120, true);
    if (ev === 'handover') start = { ...attitude(x), kts: x.iasKts, thr: x.throttle };
    if (st.phase === 'recover' && st.t > 0) { maxKts = Math.max(maxKts, x.iasKts); minKts = Math.min(minKts, x.iasKts); maxG = Math.max(maxG, x.loadFactor); }
    return ev === 'done' || ev === 'failed';
  });
  at = attitude(b);
  return { st, grade: gradeUpset(st), start, end: { ...at, kts: b.iasKts }, maxKts, minKts, maxG };
}

// Slew a command toward a target at `rate` per second (a pilot's hand, not a step).
const slew = (v, target, rate, dt) => v + Math.max(-rate * dt, Math.min(rate * dt, target - v));

const log = (name, r) => console.log(`[0174 ${name}] ${r.st.phase}${r.st.why ? ` (${r.st.why})` : ''} in ${r.st.t.toFixed(1)} s: `
  + `IAS ${r.minKts.toFixed(0)}-${r.maxKts.toFixed(0)} kt, ${r.maxG.toFixed(2)} g, ±${r.st.maxAltDevFt.toFixed(0)} ft, pulled ${r.st.pulled}, `
  + `end pitch ${r.end.pitchDeg.toFixed(1)}° bank ${r.end.bankRightDeg.toFixed(1)}° → ${r.grade.grade} ${r.grade.score}${r.grade.reason ? ` (${r.grade.reason})` : ''}`);

// Nose-high, the handbook's way: full power, push to the horizon (the nose a little low until the
// speed builds), wings level; then level at 75 KIAS and up.
function noseHighPilot() {
  let cmd = null;
  return (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    x.throttle = slew(x.throttle, 1, 4, dt);
    cmd ??= pitchDeg;
    cmd = slew(cmd, x.iasKts < 75 ? -3 : 1, 25, dt);
    x.elevInput = elevatorForPitch(cmd, pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
  };
}
// Nose-low, the handbook's way: power idle, roll wings level holding the nose where it is, then
// ease back to the horizon at 5°/s.
function noseLowPilot({ pullFirst = false } = {}) {
  let cmd = null;
  return (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    x.throttle = slew(x.throttle, pullFirst ? x.throttle : 0, 4, dt);
    cmd ??= pitchDeg;
    if (pullFirst) { x.elevInput = -0.6; x.aileronInput = 0; return; }
    const level = Math.abs(bankRightDeg) < 15;
    cmd = slew(cmd, level ? 1 : pitchDeg, 5, dt);
    x.elevInput = elevatorForPitch(cmd, pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
  };
}

describe('C172 unusual-attitude recovery (0174, FAA-H-8083-15B ch. 7)', () => {
  it('the hand-over puts the airplane in each set-up: nose-high +35° at 60 KIAS, nose-low −25° in a 60° left bank at 130 KIAS', () => {
    for (const k of ['high', 'low']) {
      const r = upset(k, () => {});
      const u = UPSETS[k];
      expect(r.start.pitchDeg).toBeCloseTo(u.pitchDeg, 1);
      expect(r.start.bankRightDeg).toBeCloseTo(u.bankDeg, 1);
      expect(r.start.kts).toBeCloseTo(u.kts, 0);
      expect(r.start.thr).toBe(u.throttle);
    }
  });
  it('nose-high: power, nose down, wings level recovers inside the limits and grades A or better', () => {
    const r = upset('high', noseHighPilot());
    log('high, handbook', r);
    expect(r.st.phase).toBe('done');
    expect(r.maxG).toBeLessThan(3.8);
    expect(['S', 'A']).toContain(r.grade.grade);
  });
  // Hands off, the stick-fixed Cessna is stable: the nose falls through and a phugoid dive follows
  // (~145 KIAS), never level inside 20 s.
  it('nose-high, doing nothing: the drill fails, not recovered', () => {
    const r = upset('high', () => {});
    log('high, nothing', r);
    expect(r.st.phase).toBe('failed');
    expect(r.st.moved).toBe(false);
    expect(r.grade.reason).not.toMatch(/pulled/);
  });
  it('nose-low: power idle, wings level, then ease back recovers under VNE and +3.8 g and grades A or better', () => {
    const r = upset('low', noseLowPilot());
    log('low, handbook', r);
    expect(r.st.phase).toBe('done');
    expect(r.st.pulled).toBe(false);
    expect(r.maxKts).toBeLessThan(c172.vneKts);
    expect(r.maxG).toBeLessThan(3.8);
    expect(['S', 'A']).toContain(r.grade.grade);
  });
  it('nose-low, pulling in the bank: the spiral tightens and the drill fails with the pull named', () => {
    const r = upset('low', noseLowPilot({ pullFirst: true }));
    log('low, pull', r);
    expect(r.st.phase).toBe('failed');
    expect(r.st.pulled).toBe(true);
    expect(r.grade.reason).toMatch(/pulled while banked/);
  });
  // Hands off, flightModel.js's Cessna rolls itself out of the bank (dihedral and the roll damping)
  // and levels at ~157 KIAS: the drill fails it as not flown, in other words than the pull's.
  it('nose-low, doing nothing: the drill fails, in other words than the pull\'s', () => {
    const r = upset('low', () => {});
    log('low, nothing', r);
    expect(r.st.phase).toBe('failed');
    expect(r.st.pulled).toBe(false);
    expect(r.grade.reason).not.toMatch(/pulled/);
    expect(r.grade.reason).not.toBe(upset('low', noseLowPilot({ pullFirst: true })).grade.reason);
  });
});
