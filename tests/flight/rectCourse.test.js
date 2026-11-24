// The rectangular course (ticket 0223) flown headless: the C172 through flightModel.js at the lesson's 90 KIAS and
// ~1,700 ft MSL, two left-hand laps round a 1/2 by 3/4 mile field half a mile (2,640 ft) off its edges, in a 12 kt wind.
// FAA-H-8083-3C ch. 7 (the rectangular course): the legs flown at an equal distance (one-half to three-fourths of a mile)
// from the field's boundaries, the drift corrected by crabbing into the wind, and the bank steepest where the
// groundspeed is highest (wind behind) and shallowest into the wind; the turns begun abeam each corner are the game's cue. The cards check the lesson against that:
// a pilot who crabs on the legs and banks for the groundspeed round the corners (Vt²/d plus a spring to the distance:
// the same physics as the lesson's Kid guide, other gains) grades A or better in a wind from any side; one who flies
// the compass headings with no crab and turns every corner at a fixed 20° grades C or worse (drifted off the box in
// 12 kt); and the corners' banks are the handbook's: steepest with the wind behind.
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
import { createRectCourse, rectSimStep, gradeRectCourse, spreadFt, kidGuide, fieldDistance, ASSIST_BANK_DEG, MAX_BANK_DEG, SPREAD_B_FT } from '../../src/rectCourse.js';
import { MISSIONS } from '../../src/missions.js';
import { makeBody, fly, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const KTS = 90;
const ALT_M = 1700 * FT_TO_M;
const WIND_KTS = 12;
const M = MISSIONS.find((m) => m.key === 'rectangular_course');
// The mission's geometry moved to the origin: the field centred at (0, 0), the Cessna where missions.js puts it
// relative to the field (south of its south-east corner on the downwind leg's line, heading north).
function lesson(fromDeg, windKts = WIND_KTS) {
  return { ...M, field: [0, 0], pos: [M.pos[0] - M.field[0], M.pos[1] - M.field[1]], wind: [fromDeg, windKts] };
}
const D_FT = M.distFt;
const hdgE = new Euler();

// pilot: 'handbook' crabs on the legs and banks for the groundspeed round the corners, with an eye on the distance;
// 'fixed' flies the compass heading of each leg (no crab) and turns every corner from abeam at 20° of bank.
function rect(fromDeg, pilot, { windKts = WIND_KTS } = {}) {
  const b = makeBody(c172, { kts: KTS, altM: ALT_M, throttle: 0.6 });
  b.spec = c172;
  const m = lesson(fromDeg, windKts);
  b.pos.x = m.pos[0]; b.pos.z = m.pos[1];
  b.quat.setFromEuler(new Euler(b.pitchCmd * DEG_TO_RAD, 0, 0, 'YXZ'));
  const w = windVector(fromDeg, windKts * KTS_TO_MPS);
  b.windVec.set(w.x, 0, w.z);
  b.vel.add(b.windVec);
  const st = createRectCourse(m);
  const probe = { ...st }; // the pilot's own look at the field (fieldDistance writes into it)
  const alt0 = b.pos.y;
  const prevVel = b.vel.clone(), f = new Vector3(), inv = new Quaternion();
  let bankCmd = 0, rudInt = 0, thrInt = 0.6, ev = '', maxAoa = 0, iasF = KTS, leg = 0, turning = false;
  const corners = []; // [bank, wind behind the track: −1 ahead … 1 behind]
  const pilotFn = (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    const headingDeg = (-hdgE.setFromQuaternion(x.quat, 'YXZ').y / DEG_TO_RAD + 360) % 360;
    let target = 0;
    if (pilot === 'handbook') {
      fieldDistance(probe, x.pos.x, x.pos.z);
      if (st.phase === 'entry') { probe.corner = false; probe.nx = 1; probe.nz = 0; probe.d = x.pos.x - probe.cx - probe.hx; }
      const vr = x.vel.x * probe.nx + x.vel.z * probe.nz;
      const vt2 = x.vel.x ** 2 + x.vel.z ** 2 - vr * vr;
      // Begin the turn abeam the corner (a little before: the bank takes a moment), the corner's radius the distance.
      const near = !probe.corner && st.phase === 'course' && (
        probe.nx > 0 ? x.pos.z + probe.hz < 60 : probe.nx < 0 ? probe.hz - x.pos.z < 60 : probe.nz < 0 ? x.pos.x + probe.hx < 60 : probe.hx - x.pos.x < 60);
      const a = (probe.corner || near ? vt2 / probe.D : 0) + 0.01 * (probe.d - probe.D) + 0.15 * vr;
      target = -Math.min(45, Math.max(-10, Math.atan(a / GRAVITY) / DEG_TO_RAD));
      if (probe.corner) corners.push([-bankRightDeg, (w.x * x.vel.x + w.z * x.vel.z) / (windKts * KTS_TO_MPS * Math.hypot(x.vel.x, x.vel.z))]);
    } else {
      // The legs' headings: north, west, south, east; the corner abeam when past the field's edge along the leg.
      const hdgs = [0, 270, 180, 90];
      const abeam = [x.pos.z < -st.hz, x.pos.x < -st.hx, x.pos.z > st.hz, x.pos.x > st.hx][leg % 4];
      if (!turning && st.phase === 'course' && abeam) turning = true;
      const want = hdgs[(leg + (turning ? 1 : 0)) % 4];
      const err = ((want - headingDeg) % 360 + 540) % 360 - 180;
      if (turning && Math.abs(err) < 3) { turning = false; leg++; }
      target = turning ? -20 : Math.max(-20, Math.min(20, err * 1.5));
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
  fly(b, c172, 1000, pilotFn, (x) => {
    maxAoa = Math.max(maxAoa, x.aoaDeg);
    ev = rectSimStep(st, x, 1 / 120, true);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeRectCourse(st), ...spreadFt(st), maxAoa, corners, tas: tasFromIas(KTS * KTS_TO_MPS, airAt(ALT_M).sigma) };
}

const fmt = (r) => `${r.st.phase}${r.st.why ? ` (${r.st.why})` : ''} in ${r.st.ct.toFixed(0)} s: distance ${r.meanFt.toFixed(0)} ±${r.sdFt.toFixed(0)} ft, `
  + `alt ±${r.st.maxAltDevFt.toFixed(0)} ft, IAS ±${r.st.maxKtsDev.toFixed(1)} kt, bank max ${r.st.maxBankDeg.toFixed(1)}°, α max ${r.maxAoa.toFixed(1)}° → ${r.grade.grade} ${r.grade.score}`;

describe('C172 rectangular course (0223, FAA-H-8083-3C ch. 7): two left-hand laps in a 12 kt wind', () => {
  for (const dir of [180, 0, 90, 270]) {
    it(`wind from ${dir}°: crabbing on the legs and banking for the groundspeed at the corners holds the course, A or better`, () => {
      const r = rect(dir, 'handbook');
      console.log(`[c172 rect ${dir}° handbook] ${fmt(r)}`);
      expect(r.st.phase).toBe('complete');
      expect(r.sdFt).toBeLessThan(SPREAD_B_FT); // the game's B band (the ACS sets no number)
      expect(Math.abs(r.meanFt - D_FT)).toBeLessThan(150);
      expect(r.st.maxAltDevFt).toBeLessThanOrEqual(100);
      expect(r.st.maxKtsDev).toBeLessThanOrEqual(10);
      expect(r.st.maxBankDeg).toBeLessThanOrEqual(MAX_BANK_DEG);
      expect(r.maxAoa).toBeLessThan(stallAoaDeg(c172, 0) - 2);
      expect(['S', 'A']).toContain(r.grade.grade);
      // Two laps of ~9 km at ~47 m/s TAS: ~6.5 minutes.
      expect(r.st.ct).toBeGreaterThan(330);
      expect(r.st.ct).toBeLessThan(450);
    }, 60000);
  }
  it('the mission\'s south wind: the compass headings with no crab and a fixed 20° bank at every corner drift off the box, C or worse', () => {
    const r = rect(180, 'fixed');
    console.log(`[c172 rect 180° fixed 20°] ${fmt(r)} (${r.grade.reason})`);
    expect(r.sdFt).toBeGreaterThan(250);
    expect(['C', 'D']).toContain(r.grade.grade);
  }, 60000);
  it('the corners\' banks are the handbook\'s: steepest with the wind behind, shallowest into it', () => {
    const r = rect(180, 'handbook');
    const avg = (sel) => { const xs = r.corners.filter(sel); return xs.reduce((s, x) => s + x[0], 0) / xs.length; };
    const down = avg((x) => x[1] > 0.8), up = avg((x) => x[1] < -0.8);
    const afh = (vg) => Math.atan(vg * vg / (GRAVITY * D_FT * FT_TO_M)) / DEG_TO_RAD;
    console.log(`[c172 rect corner banks] wind behind ${down.toFixed(1)}° (formula ${afh(r.tas + WIND_KTS * KTS_TO_MPS).toFixed(1)}°), into it ${up.toFixed(1)}° (formula ${afh(r.tas - WIND_KTS * KTS_TO_MPS).toFixed(1)}°)`);
    expect(down - up).toBeGreaterThan(6); // ~20° vs ~12° at half a mile
    expect(Math.abs(down - afh(r.tas + WIND_KTS * KTS_TO_MPS))).toBeLessThan(3);
    expect(Math.abs(up - afh(r.tas - WIND_KTS * KTS_TO_MPS))).toBeLessThan(3);
    expect(down).toBeLessThan(MAX_BANK_DEG);
  }, 60000);
});

// Kid hands off through main.js applyAssists as it runs in the lesson (aroundPoint.test.js's harness): shapeControls with
// the lesson's 53° cap and the guide from rectCourse.js, Kid's autothrottle on the lesson's 90 KIAS.
function assisted(level, fromDeg) {
  const b = makeBody(c172, { kts: KTS, altM: ALT_M, throttle: 0 });
  b.spec = c172;
  b.throttle = b.engineN = trimThrottle(c172, KTS * KTS_TO_MPS, 0, 0, true, airAt(b.pos.y));
  b.apMaster = false;
  const m = lesson(fromDeg);
  b.pos.x = m.pos[0]; b.pos.z = m.pos[1];
  const w = windVector(fromDeg, WIND_KTS * KTS_TO_MPS);
  b.windVec.set(w.x, 0, w.z);
  b.vel.add(b.windVec);
  const cfg = assistConfig(level), ast = createAssistState(), st = createRectCourse(m), s = {}, out = {}, at = { trim: 0 };
  let prevIas = null, iasRate = 0, ev = '';
  fly(b, c172, 1000, (x, dt) => {
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
    ev = rectSimStep(st, x, 1 / 120, true);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeRectCourse(st, level === 'kid'), ...spreadFt(st) };
}

describe('C172 rectangular course on the assists (0223: main.js applyAssists in the lesson)', () => {
  for (const dir of [180, 90]) {
    it(`Kid, hands off, wind from ${dir}°: the guide flies both laps at the distance and level`, () => {
      const r = assisted('kid', dir);
      console.log(`[c172 rect kid ${dir}°] ${r.st.phase}${r.st.why ? ` (${r.st.why})` : ''}: distance ${r.meanFt.toFixed(0)} ±${r.sdFt.toFixed(0)} ft, `
        + `alt ±${r.st.maxAltDevFt.toFixed(0)} ft, IAS ±${r.st.maxKtsDev.toFixed(1)} kt, bank max ${r.st.maxBankDeg.toFixed(1)}° → ${r.grade.grade} ${r.grade.score}`);
      expect(r.st.phase).toBe('complete');
      expect(r.sdFt).toBeLessThan(150);
      expect(r.st.maxAltDevFt).toBeLessThanOrEqual(100);
      expect(r.st.maxBankDeg).toBeLessThanOrEqual(ASSIST_BANK_DEG);
      expect(['S', 'A']).toContain(r.grade.grade);
      expect(r.grade.note).toMatch(/flew the course/);
    }, 60000);
  }
});
