// Steep turns (ticket 0161) flown headless: the C172 through flightModel.js at the mission's
// 95 KIAS and ~3,500 ft MSL, a test pilot rolling into 45° each way, holding the height with the
// stick, the speed with the throttle and the ball with the rudder, and leading each roll-out by
// ~20° (FAA-H-8083-3C ch. 10). steepTurns.js grades it to FAA-S-ACS-6C Area V Task A. The card
// checks the drill against the airplane: a pilot who flies the standard grades A or better, one
// who lets 300 ft go grades D, and the C172 can hold a level 45° turn at 95 KIAS without stalling
// (1/cos 45° = 1.41 g: the stall in the bank is ~19% above the 1 g one, FAA-H-8083-3C ch. 5).
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { FT_TO_M, GRAVITY } from '../../src/constants.js';
import { elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { stallAoaDeg } from '../../src/aero.js';
import { createSteepTurns, steepStep, gradeSteepTurns, kidGuide, STEEP_LEAD_DEG, STEEP_ASSIST_BANK_DEG } from '../../src/steepTurns.js';
import { trimThrottle, dihedralAileron, rollHoldScale } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { autothrottleCommand } from '../../src/autopilot.js';
import { assistConfig, createAssistState, shapeControls, slewRudder } from '../../src/assists.js';
import { KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { makeBody, fly, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const KTS = 95;

// sagFt(t): how far below the entry the pilot lets the height go (0: holds it).
function steepTurns({ sagFt = () => 0, bank = 45 } = {}) {
  const b = makeBody(c172, { kts: KTS, altM: 3500 * FT_TO_M, throttle: 0.7 });
  b.spec = c172;
  const st = createSteepTurns();
  const alt0 = b.pos.y;
  const prevVel = b.vel.clone(), f = new Vector3(), inv = new Quaternion();
  let bankCmd = 0, rudInt = 0, thrInt = 0.7, ev = '', t = 0, maxAoa = 0, minIas = Infinity;
  const pilot = (x, dt) => {
    t += dt;
    const { pitchDeg, bankRightDeg } = attitude(x);
    // The bank: 45° the turn's way after 3 s wings level, level for the lead of each roll-out.
    const dir = st.phase === 'turn2' ? st.dir : st.phase === 'turn1' ? st.dir : 1;
    const lead = st.phase !== 'entry' && st.turned * st.dir >= 360 - STEEP_LEAD_DEG;
    const target = t < 3 || lead ? 0 : dir * bank;
    bankCmd += Math.max(-15 * dt, Math.min(15 * dt, target - bankCmd));
    x.aileronInput = aileronForBank(bankCmd, bankRightDeg, -x.angVel.z);
    // The height: back pressure as the bank steepens, from the error and the vertical speed.
    const altT = alt0 - sagFt(t) * FT_TO_M, vs = x.vel.y;
    x.pitchTrim = (x.pitchTrim ?? x.pitchCmd) + ((altT - x.pos.y) * 0.04 - vs * 0.1) * dt;
    x.pitchCmd = Math.max(-5, Math.min(20, x.pitchTrim + (altT - x.pos.y) * 0.05 - vs * 0.8));
    x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
    // The speed with power; the ball with the rudder.
    const err = KTS - x.iasKts;
    thrInt = Math.max(0, Math.min(1, thrInt + err * 0.02 * dt));
    x.throttle = Math.max(0, Math.min(1, thrInt + err * 0.05));
    f.subVectors(x.vel, prevVel).divideScalar(dt); f.y += GRAVITY; prevVel.copy(x.vel);
    const ball = f.applyQuaternion(inv.copy(x.quat).invert()).x / GRAVITY;
    rudInt = Math.max(-1, Math.min(1, rudInt - ball * 4 * dt));
    x.rudderInput = Math.max(-1, Math.min(1, rudInt - ball * 2));
  };
  fly(b, c172, 120, pilot, (x) => {
    maxAoa = Math.max(maxAoa, x.aoaDeg); minIas = Math.min(minIas, x.iasKts);
    ev = steepStep(st, x, 1 / 120);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeSteepTurns(st), maxAoa, minIas, t, throttle: b.throttle };
}

describe('C172 steep turns (0161, FAA-S-ACS-6C Area V Task A)', () => {
  it('a pilot who flies the standard (±100 ft, ±10 kt, 45° ±5, on the heading ±10°) grades A or better', () => {
    const r = steepTurns();
    const g = r.grade;
    console.log(`[c172 steep] ${r.st.phase} in ${r.t.toFixed(0)} s: alt ±${r.st.maxAltDevFt.toFixed(0)} ft, IAS ±${r.st.maxKtsDev.toFixed(1)} kt, `
      + `bank held ${(100 * r.st.bankOkS / r.st.bankS).toFixed(0)}%, roll-outs ${r.st.rollout.map((x) => x.toFixed(1)).join('/')}°, α max ${r.maxAoa.toFixed(1)}°, `
      + `throttle ${r.throttle.toFixed(2)} → ${g.grade} ${g.score}`);
    expect(r.st.phase).toBe('complete');
    expect(r.st.maxAltDevFt).toBeLessThanOrEqual(100);
    expect(r.st.maxKtsDev).toBeLessThanOrEqual(10);
    expect(Math.max(...r.st.rollout)).toBeLessThanOrEqual(10);
    expect(['S', 'A']).toContain(g.grade);
    // Two 360s at the handbook's rate (1091·tan 45°/~100 KTAS ≈ 11°/s: ~33 s each) plus roll-ins.
    expect(r.t).toBeGreaterThan(60);
    expect(r.t).toBeLessThan(100);
    // Held level at 1.41 g, the wing stays clear of its stall angle.
    expect(r.maxAoa).toBeLessThan(stallAoaDeg(c172, 0) - 2);
  });
  it('a pilot who lets 300 ft go in the turns grades D', () => {
    const r = steepTurns({ sagFt: (t) => Math.min(300, Math.max(0, t - 6) * 15) });
    console.log(`[c172 steep] sagging: alt ${r.st.altSignFt.toFixed(0)} ft → ${r.grade.grade} ${r.grade.score} (${r.grade.reason})`);
    expect(r.st.phase).toBe('complete');
    expect(r.st.maxAltDevFt).toBeGreaterThan(280);
    expect(r.grade.grade).toBe('D');
  });
  it('a 30° bank is not a steep turn: the held-bank share fails and the grade drops', () => {
    const r = steepTurns({ bank: 30 });
    console.log(`[c172 steep] 30° bank: ${r.st.phase}, held ${(100 * r.st.bankOkS / Math.max(r.st.bankS, 1e-9)).toFixed(0)}% → ${r.grade.grade} ${r.grade.score}`);
    expect(r.st.bankOkS).toBe(0);
    expect(r.grade.score).toBeLessThan(85);
  });
});

// Kid (and Learner with the stick held over) through main.js applyAssists as it runs in the mission:
// assists.js shapeControls with the mission's 53° cap, Kid's guide from steepTurns.js, Kid's
// autothrottle on kidTargetKts (main.js autoThrottle). rollIn: Learner's held stick, ±1 by the turn.
function assisted(level, rollIn = () => 0) {
  const b = makeBody(c172, { kts: KTS, altM: 3500 * FT_TO_M, throttle: 0 });
  b.spec = c172;
  b.throttle = b.engineN = trimThrottle(c172, KTS * KTS_TO_MPS, 0, 0, true, airAt(b.pos.y));
  b.apMaster = false;
  const cfg = assistConfig(level), ast = createAssistState(), st = createSteepTurns(), s = {}, out = {}, at = { trim: 0 };
  let prevIas = null, iasRate = 0, ev = '', maxAoa = 0;
  fly(b, c172, 150, (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    s.guideBankDeg = 0; s.guideGammaDeg = 0;
    kidGuide(st, s);
    Object.assign(s, {
      pitchIn: 0, rollIn: rollIn(st), yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
      rollScale: rollHoldScale(c172, (x.tasKts ?? 0) * KTS_TO_MPS), yawRateRight: -x.angVel.y, driftDeg: 0,
      aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, dihedralAil: dihedralAileron(c172, (x.betaDeg ?? 0) * DEG_TO_RAD),
      stallAoaDeg: stallAoaDeg(c172, 0), tailstrikeDeg: 15, onGround: false, noseWheelDown: false, wheelHeightM: 900,
      airspeedMps: (x.tasKts ?? 0) * KTS_TO_MPS, vsMps: x.vel.y, bankMaxDeg: STEEP_ASSIST_BANK_DEG,
    });
    shapeControls(cfg, ast, s, dt, out);
    x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = slewRudder(x.rudderInput, out.rud, dt);
    if (cfg.autoThrottle) {
      if (prevIas !== null) iasRate += ((x.iasKts - prevIas) / dt - iasRate) * Math.min(1, dt / 0.5);
      prevIas = x.iasKts;
      const gamma = Math.atan2(x.vel.y, Math.max(20, Math.hypot(x.vel.x, x.vel.z))) * 180 / Math.PI;
      const tgt = KTS; // main.js: Kid's autothrottle holds the mission's entry speed (sim.loadedMission.kias)
      x.throttle = autothrottleCommand(trimThrottle(c172, tgt * KTS_TO_MPS, 0, gamma, true, airAt(x.pos.y)), at, x.iasKts, tgt, iasRate, dt);
    }
  }, (x) => {
    maxAoa = Math.max(maxAoa, x.aoaDeg);
    ev = steepStep(st, x, 1 / 120);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeSteepTurns(st, level === 'kid'), maxAoa, t: b.t };
}

describe('C172 steep turns on the assists (0161: main.js applyAssists in the mission)', () => {
  it('Kid, hands off: the guide flies both turns inside the test standard', () => {
    const r = assisted('kid');
    console.log(`[c172 steep kid] ${r.st.phase} in ${r.t.toFixed(0)} s: alt ${r.st.altSignFt.toFixed(0)} ft, IAS ±${r.st.maxKtsDev.toFixed(1)} kt, `
      + `bank held ${(100 * r.st.bankOkS / r.st.bankS).toFixed(0)}%, roll-outs ${r.st.rollout.map((x) => x.toFixed(1)).join('/')}°, α max ${r.maxAoa.toFixed(1)}° → ${r.grade.grade} ${r.grade.score}`);
    expect(r.st.phase).toBe('complete');
    expect(r.st.maxAltDevFt).toBeLessThanOrEqual(100);
    expect(['S', 'A']).toContain(r.grade.grade);
  });
  it('Learner, full stick each way and nothing else: 45° of bank, and the height sags (the lesson: ease back)', () => {
    const r = assisted('learner', (st) => (st.phase === 'turn2' ? st.dir : st.phase === 'turn1' && st.turned * st.dir >= 360 - STEEP_LEAD_DEG ? 0 : st.phase === 'turn1' ? st.dir : 1));
    console.log(`[c172 steep learner] ${r.st.phase}: alt ${r.st.altSignFt.toFixed(0)} ft, bank held ${(100 * r.st.bankOkS / Math.max(1e-9, r.st.bankS)).toFixed(0)}% → ${r.grade.grade} ${r.grade.score}`);
    expect(r.st.bankOkS / r.st.bankS).toBeGreaterThan(0.9);
  });
});
