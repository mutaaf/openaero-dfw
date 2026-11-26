// S-turns across a road (ticket 0224) flown headless: the C172 through flightModel.js at the lesson's 90 KIAS and
// ~1,700 ft MSL, four half-circles of 1,500 ft either side of an east-west road in a 12 kt wind across it.
// FAA-H-8083-3C ch. 7 (S-Turns, pp. 7-8 to 7-10): cross the line at 90° downwind and begin a 180° constant-radius turn
// at once, the bank steepest as it starts and decreased as the groundspeed falls, the wings level just as the airplane
// re-crosses the line, then the opposite turn, shallow at first and steepening as the wind comes behind. The cards check
// the lesson against that: a pilot who banks for the groundspeed (Vt²/d plus a spring to the radius, the same physics as
// the lesson's Kid guide with other gains, eased to wings level over the road) grades A or better; one who holds the
// no-wind bank (27°) round every half-circle flies an uneven S, C or worse; and the banks are the handbook's: steepest
// starting downwind, shallow starting upwind.
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion, Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { FT_TO_M, GRAVITY, KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { elevatorForPitch, aileronForBank, autothrottleCommand } from '../../src/autopilot.js';
import { stallAoaDeg } from '../../src/aero.js';
import { windVector } from '../../src/weather.js';
import { airAt, tasFromIas } from '../../src/atmosphere.js';
import { trimThrottle, dihedralAileron, rollHoldScale } from '../../src/flightModel.js';
import { assistConfig, createAssistState, shapeControls, slewRudder } from '../../src/assists.js';
import { createSTurns, sSimStep, gradeSTurns, spreadFt, kidGuide, sideOf, centreX, ASSIST_BANK_DEG, MAX_BANK_DEG, SPREAD_B_FT, CROSS_B_DEG } from '../../src/sTurns.js';
import { MISSIONS } from '../../src/missions.js';
import { makeBody, fly, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const KTS = 90;
const ALT_M = 1700 * FT_TO_M;
const WIND_KTS = 12;
const M = MISSIONS.find((m) => m.key === 's_turns_road');
const R_FT = M.radiusFt;
// The mission's geometry moved to the origin: the first pole at (0, 0), the Cessna where missions.js puts it from it.
const lesson = (fromDeg, windKts) => ({ ...M, road: [0, 0], pos: [M.pos[0] - M.road[0], M.pos[1] - M.road[1]], wind: [fromDeg, windKts] });

// pilot: 'handbook' banks for the groundspeed round each half-circle's middle, eased to wings level over the road;
// 'fixed' holds 27° (the bank for this radius in still air) round every half-circle, reversed at each crossing.
function sTurns(pilot, { fromDeg = 180, windKts = WIND_KTS } = {}) {
  const b = makeBody(c172, { kts: KTS, altM: ALT_M, throttle: 0.6 });
  b.spec = c172;
  const m = lesson(fromDeg, windKts);
  b.pos.x = m.pos[0]; b.pos.z = m.pos[1];
  b.quat.setFromEuler(new Euler(b.pitchCmd * DEG_TO_RAD, 0, 0, 'YXZ'));
  const w = windVector(fromDeg, windKts * KTS_TO_MPS);
  b.windVec.set(w.x, 0, w.z);
  b.vel.add(b.windVec);
  const st = createSTurns(m);
  const alt0 = b.pos.y;
  const prevVel = b.vel.clone(), f = new Vector3(), inv = new Quaternion();
  let bankCmd = 0, rudInt = 0, thrInt = 0.6, ev = '', maxAoa = 0, iasF = KTS;
  const starts = []; // [half, bank 8 s into it]
  const pilotFn = (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    let target = 0;
    if (st.phase === 'entry') {
      target = Math.max(-10, Math.min(10, 3 * (-0.02 * x.pos.x - x.vel.x)));
    } else if (st.phase === 'course') {
      const side = sideOf(st.half);
      if (pilot === 'handbook') {
        const rx = x.pos.x - centreX(st, st.half), rz = x.pos.z;
        const d = Math.hypot(rx, rz), vr = (x.vel.x * rx + x.vel.z * rz) / d;
        const vt2 = x.vel.x ** 2 + x.vel.z ** 2 - vr * vr;
        let mag = Math.min(45, Math.max(-10, Math.atan((vt2 / d + 0.01 * (d - st.R) + 0.15 * vr) / GRAVITY) / DEG_TO_RAD));
        const closing = side < 0 ? x.vel.z : -x.vel.z, depth = side < 0 ? -rz : rz;
        if (closing > 1 && rx < 0) mag *= Math.min(1, Math.max(0, depth / closing - 0.7) / 3);
        target = side * mag;
      } else target = side * 27;
      if (Math.abs(st.ht - 8) < 1 / 240) starts.push([st.half, bankRightDeg * side]);
    }
    bankCmd += Math.max(-15 * dt, Math.min(15 * dt, target - bankCmd));
    x.aileronInput = aileronForBank(bankCmd, bankRightDeg, -x.angVel.z);
    const vs = x.vel.y;
    x.pitchTrim = (x.pitchTrim ?? x.pitchCmd) + ((alt0 - x.pos.y) * 0.04 - vs * 0.1) * dt;
    x.pitchCmd = Math.max(-5, Math.min(20, x.pitchTrim + (alt0 - x.pos.y) * 0.05 - vs * 0.8));
    x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
    iasF += (x.iasKts - iasF) * Math.min(1, dt / 1);
    const e = KTS - iasF;
    thrInt = Math.max(0, Math.min(1, thrInt + e * 0.02 * dt));
    x.throttle = Math.max(0, Math.min(1, thrInt + e * 0.05));
    f.subVectors(x.vel, prevVel).divideScalar(dt); f.y += GRAVITY; prevVel.copy(x.vel);
    const ball = f.applyQuaternion(inv.copy(x.quat).invert()).x / GRAVITY;
    rudInt = Math.max(-1, Math.min(1, rudInt - ball * 4 * dt));
    x.rudderInput = Math.max(-1, Math.min(1, rudInt - ball * 2));
  };
  fly(b, c172, 400, pilotFn, (x) => {
    maxAoa = Math.max(maxAoa, x.aoaDeg);
    ev = sSimStep(st, x, 1 / 120, true);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeSTurns(st), ...spreadFt(st), maxAoa, starts, tas: tasFromIas(KTS * KTS_TO_MPS, airAt(ALT_M).sigma) };
}

const fmt = (r) => `${r.st.phase}${r.st.why ? ` (${r.st.why})` : ''} in ${r.st.ct.toFixed(0)} s: radius ${r.meanFt.toFixed(0)} ±${r.sdFt.toFixed(0)} ft, `
  + `crossings ${r.st.crossDeg.map((v) => v.toFixed(0)).join('/')}°, alt ±${r.st.maxAltDevFt.toFixed(0)} ft, IAS ±${r.st.maxKtsDev.toFixed(1)} kt, `
  + `bank max ${r.st.maxBankDeg.toFixed(1)}°, α max ${r.maxAoa.toFixed(1)}° → ${r.grade.grade} ${r.grade.score}`;

describe('C172 S-turns across a road (0224, FAA-H-8083-3C ch. 7): four half-circles of 1,500 ft in a wind across the road', () => {
  for (const [dir, kts] of [[180, 12], [180, 18], [180, 0], [200, 12]]) {
    it(`wind ${kts} kt from ${dir}°: banking for the groundspeed, wings level over the road, holds the radius, A or better`, () => {
      const r = sTurns('handbook', { fromDeg: dir, windKts: kts });
      console.log(`[c172 s-turns ${dir}°/${kts} handbook] ${fmt(r)}`);
      expect(r.st.phase).toBe('complete');
      expect(r.sdFt).toBeLessThan(SPREAD_B_FT); // the game's B band (the ACS sets no number)
      expect(Math.abs(r.meanFt - R_FT)).toBeLessThan(150);
      expect(r.st.maxCrossDeg).toBeLessThanOrEqual(CROSS_B_DEG);
      expect(r.st.maxAltDevFt).toBeLessThanOrEqual(100);
      expect(r.st.maxKtsDev).toBeLessThanOrEqual(10);
      expect(r.st.maxBankDeg).toBeLessThanOrEqual(MAX_BANK_DEG);
      expect(r.maxAoa).toBeLessThan(stallAoaDeg(c172, 0) - 2);
      expect(['S', 'A']).toContain(r.grade.grade);
      // Four half-circles of π·457 m at ~48 m/s TAS: ~2 minutes.
      expect(r.st.ct).toBeGreaterThan(90);
      expect(r.st.ct).toBeLessThan(160);
    }, 60000);
  }
  it('the mission\'s wind: the still-air bank (27°) held round every half-circle is an uneven S, C or worse', () => {
    const r = sTurns('fixed');
    console.log(`[c172 s-turns 180° fixed 27°] ${fmt(r)} (${r.grade.reason})`);
    expect(r.sdFt).toBeGreaterThan(250);
    expect(['C', 'D']).toContain(r.grade.grade);
  }, 60000);
  it('the banks are the handbook\'s: steepest starting downwind, shallow starting upwind', () => {
    const r = sTurns('handbook');
    const afh = (vg) => Math.atan(vg * vg / (GRAVITY * R_FT * FT_TO_M)) / DEG_TO_RAD;
    // 8 s into each half: the downwind starts (halves 0, 2: north of the road) and the upwind ones (1, 3).
    const down = r.starts.filter(([k]) => k % 2 === 0).map(([, v]) => v), up = r.starts.filter(([k]) => k % 2 === 1).map(([, v]) => v);
    const avg = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
    console.log(`[c172 s-turns banks] starting downwind ${down.map((v) => v.toFixed(1)).join(', ')}° (formula ${afh(r.tas + WIND_KTS * KTS_TO_MPS).toFixed(1)}°), `
      + `upwind ${up.map((v) => v.toFixed(1)).join(', ')}° (formula ${afh(r.tas - WIND_KTS * KTS_TO_MPS).toFixed(1)}°)`);
    expect(down.length).toBe(2);
    expect(up.length).toBe(2);
    expect(avg(down) - avg(up)).toBeGreaterThan(8);
    expect(avg(down)).toBeLessThan(MAX_BANK_DEG);
    expect(avg(down)).toBeGreaterThan(afh(r.tas) - 2); // steeper than the still-air bank
    expect(avg(up)).toBeLessThan(afh(r.tas)); // shallower
  }, 60000);
});

// Kid hands off through main.js applyAssists as it runs in the lesson (rectCourse.test.js's harness): shapeControls with
// the lesson's 53° cap and the guide from sTurns.js, Kid's autothrottle on the lesson's 90 KIAS.
function assisted(level, fromDeg = 180, windKts = WIND_KTS) {
  const b = makeBody(c172, { kts: KTS, altM: ALT_M, throttle: 0 });
  b.spec = c172;
  b.throttle = b.engineN = trimThrottle(c172, KTS * KTS_TO_MPS, 0, 0, true, airAt(b.pos.y));
  b.apMaster = false;
  const m = lesson(fromDeg, windKts);
  b.pos.x = m.pos[0]; b.pos.z = m.pos[1];
  const w = windVector(fromDeg, windKts * KTS_TO_MPS);
  b.windVec.set(w.x, 0, w.z);
  b.vel.add(b.windVec);
  const cfg = assistConfig(level), ast = createAssistState(), st = createSTurns(m), s = {}, out = {}, at = { trim: 0 };
  let prevIas = null, iasRate = 0, ev = '';
  fly(b, c172, 400, (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    s.guideBankDeg = 0; s.guideGammaDeg = 0;
    const cap = kidGuide(st, s);
    Object.assign(s, {
      pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
      rollScale: rollHoldScale(c172, (x.tasKts ?? 0) * KTS_TO_MPS), yawRateRight: -x.angVel.y, driftDeg: 0,
      aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, dihedralAil: dihedralAileron(c172, (x.betaDeg ?? 0) * DEG_TO_RAD), propAil: x.propAil ?? 0,
      stallAoaDeg: stallAoaDeg(c172, 0), tailstrikeDeg: 15, onGround: false, noseWheelDown: false, wheelHeightM: 300,
      airspeedMps: (x.tasKts ?? 0) * KTS_TO_MPS, vsMps: x.vel.y, bankMaxDeg: cap,
    });
    shapeControls(cfg, ast, s, dt, out);
    x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = slewRudder(x.rudderInput, out.rud, dt);
    if (cfg.autoThrottle) {
      if (prevIas !== null) iasRate += ((x.iasKts - prevIas) / dt - iasRate) * Math.min(1, dt / 0.5);
      prevIas = x.iasKts;
      const gamma = Math.atan2(x.vel.y, Math.max(20, Math.hypot(x.vel.x, x.vel.z))) * 180 / Math.PI;
      x.throttle = autothrottleCommand(trimThrottle(c172, KTS * KTS_TO_MPS, 0, gamma, true, airAt(x.pos.y)), at, x.iasKts, KTS, iasRate, dt);
    }
  }, (x) => {
    ev = sSimStep(st, x, 1 / 120, true);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeSTurns(st, level === 'kid'), ...spreadFt(st) };
}

describe('C172 S-turns on the assists (0224: main.js applyAssists in the lesson)', () => {
  for (const [dir, kts] of [[180, 12], [200, 12]]) {
    it(`Kid, hands off, wind ${kts} kt from ${dir}°: the guide flies the four half-circles at the radius and level`, () => {
      const r = assisted('kid', dir, kts);
      console.log(`[c172 s-turns kid ${dir}°] ${r.st.phase}${r.st.why ? ` (${r.st.why})` : ''}: radius ${r.meanFt.toFixed(0)} ±${r.sdFt.toFixed(0)} ft, `
        + `crossings ${r.st.crossDeg.map((v) => v.toFixed(0)).join('/')}°, alt ±${r.st.maxAltDevFt.toFixed(0)} ft, IAS ±${r.st.maxKtsDev.toFixed(1)} kt, bank max ${r.st.maxBankDeg.toFixed(1)}° → ${r.grade.grade} ${r.grade.score}`);
      expect(r.st.phase).toBe('complete');
      expect(r.sdFt).toBeLessThan(SPREAD_B_FT);
      expect(r.st.maxAltDevFt).toBeLessThanOrEqual(100);
      expect(r.st.maxBankDeg).toBeLessThanOrEqual(ASSIST_BANK_DEG);
      expect(['S', 'A']).toContain(r.grade.grade);
      expect(r.grade.note).toMatch(/flew the S-turns/);
    }, 60000);
  }
});
