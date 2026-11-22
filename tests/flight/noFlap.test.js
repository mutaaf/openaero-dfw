// No-flap landing lesson (ticket 0210, src/noFlap.js), flown headless on flightModel.js from the mission's spawn as
// main.js sets it up (loadScenario: 4 NM final to Addison 16 on the PAPI's 3° path, 70 KIAS, flaps 0, in trim), sea
// level ISA, calm, flat ground at the threshold. A scripted pilot flies the path with pitch and the speed with power
// (tests/flight/shortField.test.js's), flares on the same sink profile with the wing under its stall angle, then
// lowers the nose, brakes and steers. The same pilot flies flaps 30 at 61 KIAS for the comparison. Graded by the game's
// own grader (landing.js gradeLanding, noFlap.js noFlapResult). AFH ch. 9 (FAA-H-8083-3C): no flaps means a higher pitch
// (p. 9-8), a faster landing and a longer roll (p. 9-1); the ticket's flying notes say ~50% further, the POH gives none.
import { describe, it, expect } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, KTS_TO_MPS, DEG_TO_RAD, RAD_TO_DEG } from '../../src/constants.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt, tasFromIas } from '../../src/atmosphere.js';
import { stallAoaDeg } from '../../src/aero.js';
import { gradeLanding } from '../../src/landing.js';
import { missionByKey } from '../../src/missions.js';
import { NO_FLAP_KEY, createNoFlap, noFlapStep, noFlapResult, flaps30RollFt, CAP_C, DONE_NOTE } from '../../src/noFlap.js';
import { autothrottleCommand, trimAoaDeg, elevatorForPitch, aileronForBank, glidepathGammaDeg } from '../../src/autopilot.js';
import { runwayEnd, approachGeometry, approachSpawn } from '../../src/airports.js';
import { kidLocalizerBankDeg } from '../../src/assists.js';
import { makeBody, fly, attitude, noseWheelOn } from './harness.js';
const c172 = AIRCRAFT_DATABASE.c172;
const _e = new Euler(0, 0, 0, 'YXZ');
// flaps: the notch held the whole way (the lesson's is 0); kts: the approach speed; brakeS: the brakes that long after
// touchdown (null: never).
function run({ flaps = 0, kts = 70, brakeS = 0.5, idleFt = 20, flareFt = 20 } = {}) {
  const m = missionByKey(NO_FLAP_KEY);
  const end = { ...runwayEnd(m.airport, m.rwy), thrY: 0 };
  const k0 = m.kias;
  const sp = approachSpawn(end, m.distNm, tasFromIas(k0 * KTS_TO_MPS, airAt(0).sigma));
  const b = makeBody(c172, { kts: k0, altM: sp.pos.y, flaps: 0 });
  b.pos.set(sp.pos.x, sp.pos.y, sp.pos.z); b.vel.set(sp.vel.x, sp.vel.y, sp.vel.z);
  b.quat.setFromEuler(_e.set((trimAoaDeg(c172, k0 * KTS_TO_MPS, 0) - 3) * DEG_TO_RAD, sp.yawRad, 0));
  b.throttle = b.engineN = trimThrottle(c172, k0 * KTS_TO_MPS, 0, -3, true, airAt(b.pos.y));
  b.apMaster = false;
  const nf = createNoFlap(end);
  const nIn = { alongM: 0, crossM: 0, aglFt: 0, vsFpm: 0, iasKts: 0, onGround: false, gsKts: 0, wx: null };
  const at = { trim: 0 }; let prevIas = null, iasRate = 0, flareI = null, td = null, lastVs = 0, thrFt = null, pitch500 = null, stop = null; // pitch500: the pitch at 300 ft
  const aoaMax = stallAoaDeg(c172, flaps) - 1;
  fly(b, c172, 500, (x, dt) => {
    const ap = approachGeometry(end, x.pos);
    const wheelM = x.pos.y - c172.gearHeight, wheelFt = wheelM * M_TO_FT;
    if (thrFt === null && ap.distM <= 0) thrFt = wheelFt;
    const { pitchDeg, bankRightDeg } = attitude(x);
    const noseDeg = -_e.setFromQuaternion(x.quat, 'YXZ').y * RAD_TO_DEG;
    const trackDeg = Math.atan2(x.vel.x, -x.vel.z) * RAD_TO_DEG;
    x.flapsIndex = flaps; x.rudderInput = 0;
    Object.assign(nIn, { alongM: -ap.distM, crossM: ap.crossM, aglFt: wheelFt, vsFpm: x.vel.y * M_TO_FT * 60, iasKts: x.iasKts, onGround: !!x.onGround, gsKts: Math.hypot(x.vel.x, x.vel.z) / KTS_TO_MPS });
    noFlapStep(nf, nIn, dt);
    if (td) {
      const s = x.t - td.t; x.throttle = 0;
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z) / 0.6;
      x.brakesOn = brakeS !== null && s >= brakeS;
      if (td.noseS === null && noseWheelOn(x)) td.noseS = s;
      x.elevInput = td.noseS !== null ? -Math.min(1, (s - td.noseS) / 2) : elevatorForPitch(0, pitchDeg, x.angVel.x);
      x.rudderInput = Math.max(-1, Math.min(1, -((noseDeg - end.hdgT + 540) % 360 - 180) * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15 - ap.crossM * 0.05));
      return;
    }
    x.aileronInput = aileronForBank(kidLocalizerBankDeg(end.hdgT, trackDeg, ap.crossM), bankRightDeg, -x.angVel.z);
    if (wheelFt > flareFt) {
      const gamma = Math.max(-6, Math.min(2, glidepathGammaDeg(ap.heightAbovePathM)));
      x.pitchCmd = gamma + (x.aoaDeg ?? 0);
      x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
      if (prevIas !== null) iasRate += ((x.iasKts - prevIas) / dt - iasRate) * Math.min(1, dt / 0.5);
      prevIas = x.iasKts;
      const g = Math.atan2(x.vel.y, Math.max(20, Math.hypot(x.vel.x, x.vel.z))) * RAD_TO_DEG;
      x.throttle = wheelFt < idleFt ? Math.max(0, x.throttle - dt * 0.5) : autothrottleCommand(trimThrottle(c172, kts * KTS_TO_MPS, x.flapsIndex, g, true, airAt(x.pos.y)), at, x.iasKts, kts, iasRate, dt);
      if (pitch500 === null && wheelFt < 300) pitch500 = pitchDeg;
      return;
    }
    x.throttle = Math.max(0, x.throttle - dt * 0.5);
    const sinkErr = -x.vel.y - Math.max(0.05, (wheelM - 0.3) / 2);
    const aoaRoom = aoaMax - x.aoaDeg;
    flareI ??= pitchDeg;
    if (sinkErr < 0 || aoaRoom > 0) flareI += sinkErr * 3 * dt;
    x.pitchCmd = Math.max(-5, Math.min(pitchDeg + aoaRoom, flareI + sinkErr * 5));
    x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
    lastVs = x.vel.y;
  }, (x) => {
    const g = approachGeometry(end, x.pos);
    if (!td && x.onGround) {
      const { pitchDeg, bankRightDeg } = attitude(x);
      td = { t: x.t, noseS: null, m: -g.distM, ias: x.iasKts, gs: Math.hypot(x.vel.x, x.vel.z) / KTS_TO_MPS, vs: lastVs * M_TO_FT * 60, pitch: pitchDeg,
        grade: gradeLanding({ vsFpm: lastVs * M_TO_FT * 60, crossM: g.crossM, pastThresholdM: -g.distM, runwayLengthM: end.lengthM - end.displacedM,
          runwayWidthM: end.widthM, pitchDeg, bankDeg: -bankRightDeg, iasKts: x.iasKts, vrefKts: c172.vrefKts }) };
    }
    if (td && nf.stopped) { stop = nf.stopM; return true; }
    return false;
  });
  const r = { nf, td, thrFt, pitch300: pitch500, tdFt: td.m * M_TO_FT, rollFt: (stop - td.m) * M_TO_FT, totalFt: stop * M_TO_FT, result: noFlapResult(td.grade, nf) };
  console.log(`[c172 no flap] flaps ${flaps} ${kts} kt brake ${brakeS}: thr ${thrFt?.toFixed(0)} ft, pitch@300 ft ${pitch500?.toFixed(1)}°, td ${r.tdFt.toFixed(0)} ft at ${td.ias.toFixed(1)} KIAS, ${td.vs.toFixed(0)} fpm, pitch ${td.pitch.toFixed(1)}°, roll ${r.rollFt.toFixed(0)} ft, total ${r.totalFt.toFixed(0)} ft; ${r.result.grade} ${r.result.score} ${r.result.reason ?? ''}`);
  return r;
}
describe('Cessna 172S no-flap landing lesson (0210) at Addison 16', () => {
  const noFlap = run();
  const flaps30 = run({ flaps: 3, kts: 61 });
  const slow = run({ kts: 61 });

  it('the coached technique (70 KIAS, flaps 0): over the threshold near 50 ft, inside the band, stopped on the runway, A or S with the done note', () => {
    expect(noFlap.thrFt).toBeGreaterThan(40);
    expect(noFlap.thrFt).toBeLessThan(55);
    expect(noFlap.nf.slowOut).toBe(false);
    expect(noFlap.nf.fastOut).toBe(false);
    expect(noFlap.nf.off).toBe(false);
    expect(['S', 'A']).toContain(noFlap.result.grade);
    expect(noFlap.result.note).toBe(DONE_NOTE);
  });

  it('AFH ch. 9: against flaps 30 at 61 the nose is higher, the touchdown further in and faster, the roll and the whole landing longer', () => {
    expect(noFlap.pitch300 - flaps30.pitch300).toBeGreaterThan(1); // p. 9-8: "considerably lower" with full flaps
    expect(noFlap.tdFt).toBeGreaterThan(flaps30.tdFt + 100); // the float
    expect(noFlap.td.ias).toBeGreaterThan(flaps30.td.ias + 5);
    expect(noFlap.rollFt).toBeGreaterThan(flaps30.rollFt * 1.1); // p. 9-1: flaps reduce the roll
    // The ticket's flying notes say ~50% more; the game's, the same pilot and brakes: ~20% with brakes, ~40% without.
    expect(noFlap.totalFt / flaps30.totalFt).toBeGreaterThan(1.1);
    expect(noFlap.totalFt / flaps30.totalFt).toBeLessThan(1.6);
  });

  it('the card\'s flaps-30 roll (the same braking from the flaps-30 stall\'s margin) is within 15% of the flaps-30 landing flown', () => {
    const est = flaps30RollFt(noFlap.rollFt, noFlap.nf.tdKts, noFlap.nf.tdGsKts);
    expect(Math.abs(est / flaps30.rollFt - 1)).toBeLessThan(0.15);
    expect(noFlap.result.factors.find((f) => f.key === 'roll').value).toMatch(/flaps 30 ≈/);
  });

  it('flown at the flaps-30 speed with the flaps up (61): nose high, too slow for no flaps, best grade C', () => {
    expect(slow.pitch300 - noFlap.pitch300).toBeGreaterThan(2);
    expect(slow.nf.slowOut).toBe(true);
    expect(slow.result.score).toBeLessThanOrEqual(CAP_C);
    expect(slow.result.reason).toMatch(/Too slow for no flaps/);
  });

  it('no brakes: the no-flap landing still stops on Addison\'s runway (6,224 ft past the displaced threshold)', () => {
    const r = run({ brakeS: null });
    expect(r.nf.off).toBe(false);
    expect(r.totalFt).toBeLessThan(6224);
  });
});
