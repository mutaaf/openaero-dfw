// Emergency descent (ticket 0209) flown headless: the C172 through flightModel.js from the mission's ~5,500 ft MSL at
// 100 KIAS, three test pilots against FAA-S-ACS-6C Area IX Task A (bank 30-45°, airspeed +0/-10 kt, level off ±100 ft)
// and the Airplane Flying Handbook's technique (FAA-H-8083-3C ch. 18: idle, a 30-45° bank, the maximum allowable
// airspeed, never past VNE): emergencyDescent.js grades the drill against the airplane. The C172S POH has no
// emergency-descent procedure; the drill's 95-105 kt is its VA (Section 3).
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { FT_TO_M, M_TO_FT, GRAVITY, KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { elevatorForPitch, aileronForBank, autothrottleCommand } from '../../src/autopilot.js';
import { stallAoaDeg } from '../../src/aero.js';
import {
  createEmergencyDescent, descentSimStep, gradeEmergencyDescent, kidGuide, kidIdle, levelLeadFt,
  ED_ASSIST_BANK_DEG, ED_KID_LEVEL_KTS, ED_TARGET_KTS, ED_KTS_UNDER,
} from '../../src/emergencyDescent.js';
import { trimThrottle, dihedralAileron, rollHoldScale } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { assistConfig, createAssistState, shapeControls, slewRudder } from '../../src/assists.js';
import { makeBody, fly, attitude, turbulentAir } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const START_FT = 5500;

// A test pilot: rolls to `bank` and pitches for `kts` at `throttle` (the speed on the elevator, damped by its trend), or,
// with vsFpm set, pitches for that vertical speed instead. Levels off on the handbook's 10% lead: wings level, the height
// on the elevator and 95 kt on the power. Holds the ball with the rudder.
// wx: a METAR's wind and turbulence (harness.js turbulentAir, main.js updateWind's), settled for 30 s before the start.
function descent({ bank = 40, kts = 100, throttle = 0, vsFpm = null, level = true, seconds = 300, wx = null, seed = 1 } = {}) {
  const b = makeBody(c172, { kts: 100, altM: START_FT * FT_TO_M, throttle: 0.6 });
  b.spec = c172;
  const st = createEmergencyDescent();
  const prevVel = b.vel.clone(), f = new Vector3(), inv = new Quaternion();
  let bankCmd = 0, rudInt = 0, pc = 2, trend = 0, last = null, thrInt = 0.3, leveling = false, ev = '', maxIas = 0, maxAoa = -9;
  const air = wx ? turbulentAir(c172, wx, { seed }) : null, startS = wx ? 30 : 0.5;
  const pilot = (x, dt) => {
    air?.(x, dt);
    const { pitchDeg, bankRightDeg } = attitude(x);
    const altFt = x.pos.y * M_TO_FT, vs = x.vel.y * M_TO_FT * 60;
    if (last !== null) trend += ((x.iasKts - last) / dt - trend) * Math.min(1, dt / 0.5);
    last = x.iasKts;
    if (st.phase === 'wait') { // in trim at 100 KIAS until the start
      x.throttle = 0.6; pc = Math.max(-10, Math.min(15, pc + ((x.iasKts - 100) * 0.15 + trend * 0.9) * dt));
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z); x.elevInput = elevatorForPitch(pc, pitchDeg, x.angVel.x);
      return;
    }
    if (level && !leveling && altFt - st.targetFt < levelLeadFt(vs) + 50) leveling = true;
    let target = bank;
    if (leveling) {
      target = 0;
      // The round-out: the vertical speed asked for falls with the height left (a ~10 s exponential onto the level-off).
      const vsT = Math.max(-2000, Math.min(500, (st.targetFt - altFt) * 6));
      pc = Math.max(-15, Math.min(15, pc + Math.max(-3, Math.min(3, (vsT - vs) * 0.004 - x.angVel.x * 2)) * dt));
      const e = 95 - x.iasKts;
      thrInt = Math.max(0, Math.min(1, thrInt + e * 0.02 * dt));
      x.throttle = Math.max(0, Math.min(1, thrInt + e * 0.05));
    } else {
      x.throttle = throttle;
      if (vsFpm !== null) pc += Math.max(-3, Math.min(3, (vsFpm - vs) * 0.004 - x.angVel.x * 2)) * dt;
      else pc += ((x.iasKts - kts) * 0.15 + trend * 0.9) * dt;
      pc = Math.max(-35, Math.min(15, pc));
    }
    bankCmd += Math.max(-15 * dt, Math.min(15 * dt, target - bankCmd));
    x.aileronInput = aileronForBank(bankCmd, bankRightDeg, -x.angVel.z);
    x.elevInput = elevatorForPitch(pc, pitchDeg, x.angVel.x);
    f.subVectors(x.vel, prevVel).divideScalar(dt); f.y += GRAVITY; prevVel.copy(x.vel);
    const ball = f.applyQuaternion(inv.copy(x.quat).invert()).x / GRAVITY;
    rudInt = Math.max(-1, Math.min(1, rudInt - ball * 4 * dt));
    x.rudderInput = Math.max(-1, Math.min(1, rudInt - ball * 2));
  };
  fly(b, c172, seconds, pilot, (x) => {
    maxIas = Math.max(maxIas, x.iasKts); maxAoa = Math.max(maxAoa, x.aoaDeg);
    ev = descentSimStep(st, x, 1 / 120, x.t > startS);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeEmergencyDescent(st), maxIas, maxAoa, t: b.t };
}
const line = (tag, r) => console.log(`[c172 ed] ${tag}: ${r.st.phase}${r.st.why ? ` (${r.st.why})` : ''} in ${r.t.toFixed(0)} s, reached ${r.st.reachS.toFixed(0)} s, `
  + `bank ${(100 * r.st.bankOkS / Math.max(1e-9, r.st.heldS)).toFixed(0)}%, band ${(100 * r.st.inBandS / Math.max(1e-9, r.st.heldS)).toFixed(0)}%, g ${r.st.minG.toFixed(2)}-${r.st.maxG.toFixed(2)}, `
  + `level ±${r.st.levelDevFt.toFixed(0)} ft, IAS max ${r.maxIas.toFixed(0)} → ${r.grade.grade} ${r.grade.score}${r.grade.reason ? ` (${r.grade.reason})` : ''}`);

describe('C172 emergency descent (0209, FAA-S-ACS-6C Area IX Task A)', () => {
  it('the handbook\'s descent (idle, 40° of bank, 100 KIAS, a 10% lead) is inside the standard: 3,000 ft in under two minutes, A or better', () => {
    const r = descent();
    line('handbook', r);
    expect(r.st.phase).toBe('complete');
    expect(r.st.targetFt).toBe(2500);
    expect(r.st.levelDevFt).toBeLessThanOrEqual(100);
    expect(r.st.bankOkS / r.st.heldS).toBeGreaterThan(0.8);
    expect(r.st.inBandS / r.st.heldS).toBeGreaterThan(0.8);
    expect(r.st.minG).toBeGreaterThan(0.5); // positive load factors (S4)
    expect(r.st.maxG).toBeLessThan(2.5);
    // ~1,700 fpm at idle and VA in the bank (flightModel.js): 2,900 ft to the level-off's 100 ft in ~100 s.
    expect(r.st.reachS).toBeGreaterThan(75);
    expect(r.st.reachS).toBeLessThan(120);
    expect(r.maxIas).toBeLessThanOrEqual(ED_TARGET_KTS + 3);
    expect(r.maxAoa).toBeLessThan(stallAoaDeg(c172, 0) - 4);
    expect(['S', 'A']).toContain(r.grade.grade);
  });
  it('a gentle 500 fpm let-down with power in is too slow: not finished, D, and says why', () => {
    const r = descent({ bank: 0, throttle: 0.45, vsFpm: -500 });
    line('gentle', r);
    expect(r.st.phase).toBe('failed');
    expect(r.st.why).toBe('time');
    expect(r.grade.grade).toBe('D');
    expect(r.grade.reason).toMatch(/Too slow/);
  });
  it('a straight dive for speed goes through VNE (163 KIAS): not finished, D, with a different message', () => {
    const r = descent({ bank: 0, kts: 180, level: false });
    line('dive', r);
    expect(r.st.phase).toBe('failed');
    expect(r.st.why).toBe('limit');
    expect(r.maxIas).toBeGreaterThan(c172.vneKts);
    expect(r.grade.grade).toBe('D');
    expect(r.grade.reason).toMatch(/163 kt, the never-exceed speed/);
  });
  it('on gusty days (15G25, 25G38, six seeds each) the handbook descent still grades A or better: the bumps\' g is not the pilot\'s', () => {
    for (const [name, wx] of [['15G25', { windDirDeg: 180, windKts: 15, gustKts: 25 }], ['25G38', { windDirDeg: 180, windKts: 25, gustKts: 38 }]]) {
      for (let seed = 1; seed <= 6; seed++) {
        const r = descent({ wx, seed, seconds: 360 });
        line(`${name} s${seed}`, r);
        expect(r.st.phase).toBe('complete');
        expect(r.st.minG).toBeGreaterThan(0.4);
        expect(r.st.maxG).toBeLessThan(2.2);
        expect(['S', 'A']).toContain(r.grade.grade);
      }
    }
  });
  it('wings level at 100 KIAS is a straight dive: capped at C with the bank\'s reason', () => {
    const r = descent({ bank: 0 });
    line('straight', r);
    expect(r.st.phase).toBe('complete');
    expect(r.grade.score).toBeLessThan(70);
    expect(r.grade.reason).toMatch(/straight dive/);
  });
});

// Kid (and Learner with the stick held over) through main.js applyAssists as it runs in the mission: assists.js
// shapeControls with the mission's 47° cap, Kid's guide from emergencyDescent.js, Kid's throttle idle in the descent
// (kidIdle) and its autothrottle on 95 kt after the level-off. rollIn: Learner's held stick; pitchIn: Learner's push.
function assisted(level, { rollIn = () => 0, pitchIn = () => 0 } = {}) { // pitchIn(st, body): the player's stick, + = nose down
  const b = makeBody(c172, { kts: 100, altM: START_FT * FT_TO_M, throttle: 0 });
  b.spec = c172;
  b.throttle = b.engineN = trimThrottle(c172, 100 * KTS_TO_MPS, 0, 0, true, airAt(b.pos.y));
  b.apMaster = false;
  const cfg = assistConfig(level), ast = createAssistState(), st = createEmergencyDescent(), s = {}, out = {}, at = { trim: 0 };
  let prevIas = null, iasRate = 0, ev = '', maxAoa = -9, maxIas = 0;
  fly(b, c172, 300, (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    s.guideBankDeg = 0; s.guideGammaDeg = 0;
    expect(kidGuide(st, s)).toBe(ED_ASSIST_BANK_DEG);
    Object.assign(s, {
      pitchIn: pitchIn(st, x), rollIn: rollIn(st), yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
      rollScale: rollHoldScale(c172, (x.tasKts ?? 0) * KTS_TO_MPS), yawRateRight: -x.angVel.y, driftDeg: 0,
      aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, dihedralAil: dihedralAileron(c172, (x.betaDeg ?? 0) * DEG_TO_RAD), propAil: x.propAil ?? 0,
      stallAoaDeg: stallAoaDeg(c172, 0), tailstrikeDeg: 15, onGround: false, noseWheelDown: false, wheelHeightM: 600,
      airspeedMps: (x.tasKts ?? 0) * KTS_TO_MPS, vsMps: x.vel.y, bankMaxDeg: ED_ASSIST_BANK_DEG,
    });
    shapeControls(cfg, ast, s, dt, out);
    x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = slewRudder(x.rudderInput, out.rud, dt);
    if (cfg.autoThrottle) {
      if (prevIas !== null) iasRate += ((x.iasKts - prevIas) / dt - iasRate) * Math.min(1, dt / 0.5);
      prevIas = x.iasKts;
      const gamma = Math.atan2(x.vel.y, Math.max(20, Math.hypot(x.vel.x, x.vel.z))) * 180 / Math.PI;
      // main.js: idle in the descent; before the start and after the level-off the autothrottle holds 95 kt.
      if (kidIdle(st)) x.throttle = 0;
      else x.throttle = autothrottleCommand(trimThrottle(c172, ED_KID_LEVEL_KTS * KTS_TO_MPS, 0, gamma, true, airAt(x.pos.y)), at, x.iasKts, ED_KID_LEVEL_KTS, iasRate, dt);
    } else x.throttle = 0; // Learner: the player's idle
  }, (x) => {
    maxAoa = Math.max(maxAoa, x.aoaDeg); maxIas = Math.max(maxIas, x.iasKts);
    ev = descentSimStep(st, x, 1 / 120, x.t > 0.5);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeEmergencyDescent(st, level === 'kid'), maxAoa, maxIas, t: b.t };
}

describe('C172 emergency descent on the assists (0209: main.js applyAssists in the mission)', () => {
  it('Kid, hands off: the guide spirals down at idle in the band and levels off inside the standard', () => {
    const r = assisted('kid');
    line('kid', r);
    expect(r.st.phase).toBe('complete');
    expect(r.st.levelDevFt).toBeLessThanOrEqual(100);
    expect(r.st.bankOkS / r.st.heldS).toBeGreaterThan(0.8);
    expect(r.st.inBandS / r.st.heldS).toBeGreaterThan(0.9); // its path starts where the descent settles (physics panel)
    expect(r.maxIas).toBeLessThanOrEqual(ED_TARGET_KTS + 3);
    expect(r.st.reachS).toBeLessThan(150);
    expect(['S', 'A']).toContain(r.grade.grade);
    expect(r.grade.note).toMatch(/flew the descent for you/);
  });
  it('Learner, full stick right, idle and a push for 100 kt: 30-45° of bank in the band; the level-off is the player\'s (here: none, so it goes through)', () => {
    let last = null, rate = 0; // the player's stick for 100 kt: the speed error, damped by its trend (a rate stick otherwise pumps)
    const player = (st, x) => {
      if (last !== null) rate += ((x.iasKts - last) * 120 - rate) * (1 / 60);
      last = x.iasKts;
      return st.t > 2 ? Math.max(-0.5, Math.min(1, (100 - x.iasKts) * 0.04 - rate * 0.4)) : 0;
    };
    const r = assisted('learner', { rollIn: () => 1, pitchIn: player });
    line('learner', r);
    expect(r.st.bankOkS / Math.max(1e-9, r.st.heldS)).toBeGreaterThan(0.8);
    expect(r.st.inBandS / Math.max(1e-9, r.st.heldS)).toBeGreaterThan(0.6); // Learner's pitch cap (-12.75°) lets a push reach VA
    expect(r.maxIas).toBeLessThan(c172.vneKts);
    expect(r.st.phase).toBe('failed');
    expect(r.st.why).toBe('low');
    expect(r.grade.grade).toBe('D');
  });
  it(`the band is ${ED_TARGET_KTS - ED_KTS_UNDER}-${ED_TARGET_KTS} kt: VA at 2,550 lb, under the C172's VNE`, () => {
    expect(ED_TARGET_KTS).toBeLessThan(c172.vneKts);
    expect(ED_TARGET_KTS).toBe(105);
  });
});
