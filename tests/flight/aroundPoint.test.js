// Turns around a point (ticket 0211) flown headless: the C172 through flightModel.js at the lesson's 90 KIAS and
// ~1,700 ft MSL, in a 12 kt wind from each of four sides, circling a pole 1,500 ft off its left wing twice.
// FAA-H-8083-3C ch. 7: a constant radius over the ground needs a bank "proportional to groundspeed" (p. 7-3, its
// examples follow tan φ = Vg² / (g R)), steepest downwind and shallowest upwind; a constant bank flies a constant
// circle in the air, and "the path over the ground is not circular" (p. 7-4). The cards check the lesson against
// that: a pilot who holds one bank grades D as an oval in every wind, one who banks for the groundspeed grades A or
// better, and the steepest and shallowest banks it needs are the handbook's formula at the downwind and upwind points.
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion, Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { FT_TO_M, M_TO_FT, GRAVITY, KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { elevatorForPitch, aileronForBank, autothrottleCommand } from '../../src/autopilot.js';
import { stallAoaDeg } from '../../src/aero.js';
import { windVector } from '../../src/weather.js';
import { airAt, tasFromIas } from '../../src/atmosphere.js';
import { trimThrottle, dihedralAileron, rollHoldScale } from '../../src/flightModel.js';
import { assistConfig, createAssistState, shapeControls, slewRudder } from '../../src/assists.js';
import { createAroundPoint, aroundSimStep, gradeAroundPoint, spreadFt, kidGuide, ASSIST_BANK_DEG, MAX_BANK_DEG } from '../../src/aroundPoint.js';
import { makeBody, fly, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const KTS = 90;
const R_FT = 1500, R = R_FT * FT_TO_M;
const ALT_M = 1700 * FT_TO_M;
const WIND_KTS = 12;
// The lesson's geometry, turned to each wind: the airplane at the origin on the downwind entry (heading the way the
// wind blows, AFH p. 7-4), the pole half a mile ahead and R to the left, as missions.js sets it for its south wind.
const entryHdg = (fromDeg) => (fromDeg + 180) % 360;
function lesson(fromDeg) {
  const h = entryHdg(fromDeg) * DEG_TO_RAD;
  const fx = Math.sin(h), fz = -Math.cos(h), lx = -Math.cos(h), lz = -Math.sin(h); // ahead, to the left
  return { point: [926 * fx + R * lx, 926 * fz + R * lz], hdg: entryHdg(fromDeg), radiusFt: R_FT, wind: [fromDeg, WIND_KTS], pos: [0, 0], aglFt: 1000 };
}
// harness.js makeBody heads north: turn the body (attitude and velocity) to the entry heading.
function headTo(b, hdgDeg) {
  const v = b.vel.length(), h = hdgDeg * DEG_TO_RAD;
  b.quat.setFromEuler(new Euler(b.pitchCmd * DEG_TO_RAD, -h, 0, 'YXZ'));
  b.vel.set(Math.sin(h) * v, 0, -Math.cos(h) * v);
}
const DIRS = [180, 0, 90, 270]; // a south wind (the mission's), north, east, west

// pilot: 'constant' holds the still-air bank for the radius from abeam; 'wind' banks for the groundspeed round
// the pole (its own law, not the lesson's: Vt² / d plus a spring to the radius and damping on the radial speed).
function aroundPoint(fromDeg, pilot) {
  const b = makeBody(c172, { kts: KTS, altM: ALT_M, throttle: 0.6 });
  b.spec = c172;
  headTo(b, entryHdg(fromDeg));
  const w = windVector(fromDeg, WIND_KTS * KTS_TO_MPS);
  b.windVec.set(w.x, 0, w.z);
  b.vel.add(b.windVec); // an airborne spawn flies its airspeed (main.js loadScenario adds the wind)
  const st = createAroundPoint(lesson(fromDeg));
  const alt0 = b.pos.y;
  const prevVel = b.vel.clone(), f = new Vector3(), inv = new Quaternion();
  const tas = tasFromIas(KTS * KTS_TO_MPS, airAt(ALT_M).sigma);
  const stillBank = Math.atan(tas * tas / (GRAVITY * R)) / DEG_TO_RAD;
  let bankCmd = 0, rudInt = 0, thrInt = 0.6, ev = '', maxAoa = 0, iasF = KTS;
  const banks = []; // [bank, how far the wind is behind the track: −1 ahead … 1 behind]
  const pilotFn = (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    const rx = x.pos.x - st.px, rz = x.pos.z - st.pz;
    const d = Math.hypot(rx, rz);
    const abeam = rx * st.ux + rz * st.uz > -40;
    let target = 0;
    if (abeam || st.phase === 'circle') {
      if (pilot === 'constant') target = -stillBank;
      else {
        const vr = (x.vel.x * rx + x.vel.z * rz) / d;
        const vt2 = x.vel.x ** 2 + x.vel.z ** 2 - vr * vr;
        target = -Math.min(45, Math.max(-10, Math.atan((vt2 / d + 0.01 * (d - R) + 0.15 * vr) / GRAVITY) / DEG_TO_RAD));
      }
    }
    bankCmd += Math.max(-15 * dt, Math.min(15 * dt, target - bankCmd));
    x.aileronInput = aileronForBank(bankCmd, bankRightDeg, -x.angVel.z);
    // The height with the stick, the speed (filtered: lesson 2026-11-18) with power, the ball with the rudder.
    const vs = x.vel.y;
    x.pitchTrim = (x.pitchTrim ?? x.pitchCmd) + ((alt0 - x.pos.y) * 0.04 - vs * 0.1) * dt;
    x.pitchCmd = Math.max(-5, Math.min(20, x.pitchTrim + (alt0 - x.pos.y) * 0.05 - vs * 0.8));
    x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
    iasF += (x.iasKts - iasF) * Math.min(1, dt / 1);
    const err = KTS - iasF;
    thrInt = Math.max(0, Math.min(1, thrInt + err * 0.02 * dt));
    x.throttle = Math.max(0, Math.min(1, thrInt + err * 0.05));
    f.subVectors(x.vel, prevVel).divideScalar(dt); f.y += GRAVITY; prevVel.copy(x.vel);
    const ball = f.applyQuaternion(inv.copy(x.quat).invert()).x / GRAVITY;
    rudInt = Math.max(-1, Math.min(1, rudInt - ball * 4 * dt));
    x.rudderInput = Math.max(-1, Math.min(1, rudInt - ball * 2));
    if (st.phase === 'circle' && st.ct > 10) {
      const v = Math.hypot(x.vel.x, x.vel.z);
      banks.push([-bankRightDeg, (w.x * x.vel.x + w.z * x.vel.z) / (WIND_KTS * KTS_TO_MPS * v), v]);
    }
  };
  fly(b, c172, 400, pilotFn, (x) => {
    maxAoa = Math.max(maxAoa, x.aoaDeg);
    ev = aroundSimStep(st, x, 1 / 120, true);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeAroundPoint(st), ...spreadFt(st), maxAoa, banks, tas, stillBank };
}

const fmt = (r) => `${r.st.phase}${r.st.why ? ` (${r.st.why})` : ''} in ${r.st.ct.toFixed(0)} s: radius ${r.meanFt.toFixed(0)} ±${r.sdFt.toFixed(0)} ft, `
  + `alt ±${r.st.maxAltDevFt.toFixed(0)} ft, IAS ±${r.st.maxKtsDev.toFixed(1)} kt, bank max ${r.st.maxBankDeg.toFixed(1)}°, α max ${r.maxAoa.toFixed(1)}° → ${r.grade.grade} ${r.grade.score}`;

describe('C172 turns around a point (0211, FAA-H-8083-3C ch. 7): a 12 kt wind from four sides', () => {
  for (const dir of DIRS) {
    it(`wind from ${dir}°: one bank all the way round is an oval over the ground, graded D`, () => {
      const r = aroundPoint(dir, 'constant');
      console.log(`[c172 around ${dir}° constant ${r.stillBank.toFixed(1)}°] ${fmt(r)}`);
      // Flown at one bank, the circle is round in the air and drifts ~12 kt × its ~60 s period (~370 m) a turn.
      expect(r.sdFt).toBeGreaterThan(350);
      expect(r.grade.grade).toBe('D');
    }, 30000);
    it(`wind from ${dir}°: banking for the groundspeed holds the circle, graded A or better`, () => {
      const r = aroundPoint(dir, 'wind');
      console.log(`[c172 around ${dir}° wind] ${fmt(r)}`);
      expect(r.st.phase).toBe('complete');
      expect(r.sdFt).toBeLessThan(75);
      expect(Math.abs(r.meanFt - R_FT)).toBeLessThan(150);
      expect(r.st.maxAltDevFt).toBeLessThanOrEqual(100);
      expect(r.st.maxKtsDev).toBeLessThanOrEqual(10);
      expect(r.st.maxBankDeg).toBeLessThanOrEqual(MAX_BANK_DEG);
      expect(r.maxAoa).toBeLessThan(stallAoaDeg(c172, 0) - 2);
      expect(['S', 'A']).toContain(r.grade.grade);
      // Two circles of ~2,900 m at ~46 m/s TAS: ~2 minutes (a 12 kt wind evens out over a whole circle).
      expect(r.st.ct).toBeGreaterThan(100);
      expect(r.st.ct).toBeLessThan(160);
    }, 30000);
  }
  it('the bank it takes is the handbook\'s: steepest with the wind behind, shallowest into it, tan φ = Vg² / (g R)', () => {
    const r = aroundPoint(180, 'wind');
    const pick = (sel) => {
      const xs = r.banks.filter(sel);
      return { bank: xs.reduce((s, x) => s + x[0], 0) / xs.length, vg: xs.reduce((s, x) => s + x[2], 0) / xs.length };
    };
    const down = pick((x) => x[1] > 0.95), up = pick((x) => x[1] < -0.95);
    const afh = (vg) => Math.atan(vg * vg / (GRAVITY * R)) / DEG_TO_RAD;
    console.log(`[c172 around banks] downwind ${down.bank.toFixed(1)}° at ${(down.vg / KTS_TO_MPS).toFixed(0)} kt over the ground (formula ${afh(down.vg).toFixed(1)}°), `
      + `upwind ${up.bank.toFixed(1)}° at ${(up.vg / KTS_TO_MPS).toFixed(0)} kt (formula ${afh(up.vg).toFixed(1)}°); still air ${r.stillBank.toFixed(1)}°`);
    // Groundspeeds: TAS ± the wind.
    expect(down.vg / KTS_TO_MPS).toBeGreaterThan(r.tas / KTS_TO_MPS + WIND_KTS - 3);
    expect(up.vg / KTS_TO_MPS).toBeLessThan(r.tas / KTS_TO_MPS - WIND_KTS + 3);
    expect(down.bank - up.bank).toBeGreaterThan(10);
    expect(Math.abs(down.bank - afh(down.vg))).toBeLessThan(3);
    expect(Math.abs(up.bank - afh(up.vg))).toBeLessThan(3);
    expect(down.bank).toBeLessThan(MAX_BANK_DEG); // the lesson's radius keeps the steepest under the handbook's 45°
  }, 30000);
});

// Kid hands off (and Learner with the stick held over) through main.js applyAssists as it runs in the lesson:
// assists.js shapeControls with the lesson's 53° cap and Kid's guide from aroundPoint.js, Kid's autothrottle on
// the lesson's 90 KIAS (main.js drillKts).
function assisted(level, fromDeg, rollIn = () => 0) {
  const b = makeBody(c172, { kts: KTS, altM: ALT_M, throttle: 0 });
  b.spec = c172;
  b.throttle = b.engineN = trimThrottle(c172, KTS * KTS_TO_MPS, 0, 0, true, airAt(b.pos.y));
  b.apMaster = false;
  headTo(b, entryHdg(fromDeg));
  const w = windVector(fromDeg, WIND_KTS * KTS_TO_MPS);
  b.windVec.set(w.x, 0, w.z);
  b.vel.add(b.windVec);
  const cfg = assistConfig(level), ast = createAssistState(), st = createAroundPoint(lesson(fromDeg)), s = {}, out = {}, at = { trim: 0 };
  let prevIas = null, iasRate = 0, ev = '';
  fly(b, c172, 400, (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    s.guideBankDeg = 0; s.guideGammaDeg = 0;
    const cap = kidGuide(st, s);
    Object.assign(s, {
      pitchIn: 0, rollIn: rollIn(st), yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
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
    ev = aroundSimStep(st, x, 1 / 120, true);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeAroundPoint(st, level === 'kid'), ...spreadFt(st) };
}

describe('C172 turns around a point on the assists (0211: main.js applyAssists in the lesson)', () => {
  for (const dir of [180, 90]) {
    it(`Kid, hands off, wind from ${dir}°: the guide flies both circles round and level`, () => {
      const r = assisted('kid', dir);
      console.log(`[c172 around kid ${dir}°] ${r.st.phase}${r.st.why ? ` (${r.st.why})` : ''}: radius ${r.meanFt.toFixed(0)} ±${r.sdFt.toFixed(0)} ft, `
        + `alt ±${r.st.maxAltDevFt.toFixed(0)} ft, IAS ±${r.st.maxKtsDev.toFixed(1)} kt, bank max ${r.st.maxBankDeg.toFixed(1)}° → ${r.grade.grade} ${r.grade.score}`);
      expect(r.st.phase).toBe('complete');
      expect(r.sdFt).toBeLessThan(150);
      expect(r.st.maxAltDevFt).toBeLessThanOrEqual(100);
      expect(['S', 'A']).toContain(r.grade.grade);
      expect(r.grade.note).toMatch(/flew the circles/);
    }, 30000);
  }
  it('Learner, full left stick from abeam and nothing else: 45° all the way round, the height sags and the circle drifts: not the lesson', () => {
    const r = assisted('learner', 180, (st) => (st.phase === 'circle' ? -1 : 0));
    console.log(`[c172 around learner] ${r.st.phase}: radius ${r.meanFt.toFixed(0)} ±${r.sdFt.toFixed(0)} ft, bank max ${r.st.maxBankDeg.toFixed(1)}° → ${r.grade.grade} ${r.grade.score} (${r.grade.reason})`);
    expect(r.st.maxBankDeg).toBeLessThanOrEqual(ASSIST_BANK_DEG); // full stick is the lesson's 45°, not past the cap
    expect(['C', 'D']).toContain(r.grade.grade);
  }, 30000);
});
