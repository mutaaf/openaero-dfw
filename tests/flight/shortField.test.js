// Short-field landing lesson (ticket 0181, src/shortField.js), flown headless on flightModel.js from the mission's
// spawn as main.js sets it up (loadScenario: 3 NM final to Addison 16 on the PAPI's 3° path, 70 KIAS, flaps up, in
// trim). Addison's runway geometry, flat ground at the threshold (the harness's air: sea level ISA, so the POH roll
// is Fig. 5-11's 575 ft). The lesson's pilot flies the POH's technique (Section 4: full flaps, 61 KIAS to the
// flare on a 3° path to the numbers, idle after the obstacle, main wheels first, heavy braking, flaps up, the wheel
// full back) and is graded by the game's own grader (landing.js gradeLanding, shortField.js shortFieldResult).
// The ticket's test plan: it stops inside POH x 1.15. Pilots that miss a step must lose the grade the lesson says.
import { describe, it, expect } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, KTS_TO_MPS, DEG_TO_RAD, RAD_TO_DEG } from '../../src/constants.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt, tasFromIas } from '../../src/atmosphere.js';
import { stallAoaDeg } from '../../src/aero.js';
import { autothrottleCommand, trimAoaDeg, elevatorForPitch, aileronForBank, glidepathGammaDeg } from '../../src/autopilot.js';
import { runwayEnd, approachGeometry, approachSpawn } from '../../src/airports.js';
import { kidLocalizerBankDeg } from '../../src/assists.js';
import { gradeLanding } from '../../src/landing.js';
import { missionByKey } from '../../src/missions.js';
import {
  SHORT_FIELD_KEY, createShortField, shortFieldStep, shortFieldResult, pohRollFt, APPROACH_KTS, LONG_M, POH_AIR_FT, CAP_C, DONE_NOTE,
} from '../../src/shortField.js';
import { makeBody, fly, attitude, noseWheelOn } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const _e = new Euler(0, 0, 0, 'YXZ');
const POH_FT = pohRollFt(0, 29.92, 15); // 575

// The lesson flown by a scripted pilot on the PAPI's 3° path (1,000 ft in). kts: the approach speed once the flaps are full; brakeS: the brakes that long after touchdown (null: never);
// idleFt: power to idle below this wheel height (the obstacle); flapsFt: full flaps selected at this height (Infinity: at once).
function flyLesson({ kts = APPROACH_KTS, brakeS = 0.5, idleFt = 50, flapsFt = Infinity } = {}) {
  const m = missionByKey(SHORT_FIELD_KEY);
  const end = { ...runwayEnd(m.airport, m.rwy), thrY: 0 };
  const sp = approachSpawn(end, m.distNm, tasFromIas(m.kias * KTS_TO_MPS, airAt(0).sigma));
  const b = makeBody(c172, { kts: m.kias, altM: sp.pos.y, flaps: m.flaps });
  b.pos.set(sp.pos.x, sp.pos.y, sp.pos.z);
  b.vel.set(sp.vel.x, sp.vel.y, sp.vel.z);
  b.quat.setFromEuler(_e.set((trimAoaDeg(c172, m.kias * KTS_TO_MPS, m.flaps) - 3) * DEG_TO_RAD, sp.yawRad, 0));
  b.throttle = b.engineN = trimThrottle(c172, m.kias * KTS_TO_MPS, m.flaps, -3, true, airAt(b.pos.y));
  b.apMaster = false;
  const sf = createShortField(end);
  const at = { trim: 0 };
  const sIn = { alongM: 0, crossM: 0, aglFt: 0, iasKts: 0, flapsFull: false, onGround: false, gsKts: 0, braking: false, wx: null };
  let prevIas = null, iasRate = 0, flareI = null, td = null, lastVs = 0, maxGammaDeg = 0, minKtsBand = Infinity, thrFt = null;
  const aoaMax = stallAoaDeg(c172, 3) - 1;
  fly(b, c172, 400, (x, dt) => {
    const ap = approachGeometry(end, x.pos);
    const wheelM = x.pos.y - c172.gearHeight;
    const wheelFt = wheelM * M_TO_FT;
    if (thrFt === null && ap.distM <= 0) thrFt = wheelFt;
    const { pitchDeg, bankRightDeg } = attitude(x);
    const noseDeg = -_e.setFromQuaternion(x.quat, 'YXZ').y * RAD_TO_DEG;
    const trackDeg = Math.atan2(x.vel.x, -x.vel.z) * RAD_TO_DEG;
    if (wheelFt < flapsFt) x.flapsIndex = 3;
    Object.assign(sIn, { alongM: -ap.distM, crossM: ap.crossM, aglFt: wheelFt, iasKts: x.iasKts, flapsFull: x.flapsIndex === 3 && x.flapPos >= 2.999,
      onGround: !!x.onGround, gsKts: Math.hypot(x.vel.x, x.vel.z) / KTS_TO_MPS, braking: !!x.brakesOn });
    shortFieldStep(sf, sIn, dt);
    x.rudderInput = 0;
    if (td) { // POH Section 4: lower the nose wheel, heavy braking, flaps up, the wheel full back (harness.js shortFieldLanding)
      const s = x.t - td.t;
      x.throttle = 0;
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z) / 0.6;
      x.brakesOn = brakeS !== null && s >= brakeS;
      if (x.brakesOn) x.flapsIndex = 0;
      if (td.noseS === null && noseWheelOn(x)) td.noseS = s;
      x.elevInput = td.noseS !== null ? -Math.min(1, (s - td.noseS) / 2) : elevatorForPitch(0, pitchDeg, x.angVel.x);
      x.rudderInput = Math.max(-1, Math.min(1, -((noseDeg - end.hdgT + 540) % 360 - 180) * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15 - ap.crossM * 0.05)); // rudder + = yaw right
      return;
    }
    x.aileronInput = aileronForBank(kidLocalizerBankDeg(end.hdgT, trackDeg, ap.crossM), bankRightDeg, -x.angVel.z);
    if (wheelFt > 20) {
      // The path with pitch (a flight-path angle plus the wing's angle), the speed with power (AFH ch. 9: "adjusts the
      // power and the pitch attitude to establish and maintain the proper descent angle and airspeed").
      const gamma = Math.max(-6, Math.min(2, glidepathGammaDeg(ap.heightAbovePathM)));
      x.pitchCmd = gamma + (x.aoaDeg ?? 0);
      x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
      const tgt = x.flapsIndex === 3 && x.flapPos > 2.9 ? kts : m.kias;
      if (prevIas !== null) iasRate += ((x.iasKts - prevIas) / dt - iasRate) * Math.min(1, dt / 0.5);
      prevIas = x.iasKts;
      const g = Math.atan2(x.vel.y, Math.max(20, Math.hypot(x.vel.x, x.vel.z))) * RAD_TO_DEG;
      x.throttle = wheelFt < idleFt ? Math.max(0, x.throttle - dt * 0.5) : autothrottleCommand(trimThrottle(c172, tgt * KTS_TO_MPS, x.flapsIndex, g, true, airAt(x.pos.y)), at, x.iasKts, tgt, iasRate, dt);
      if (wheelFt < 500 && wheelFt > 50) { maxGammaDeg = Math.min(maxGammaDeg, g); minKtsBand = Math.min(minKtsBand, x.iasKts); }
      return;
    }
    // The flare (harness.js shortFieldLanding's): a sink profile to the runway, the wing held under its stall angle.
    x.throttle = Math.max(0, x.throttle - dt * 0.5);
    const sinkErr = -x.vel.y - Math.max(0.05, (wheelM - 0.3) / 2);
    const aoaRoom = aoaMax - x.aoaDeg;
    flareI ??= pitchDeg;
    if (sinkErr < 0 || aoaRoom > 0) flareI += sinkErr * 3 * dt;
    x.pitchCmd = Math.max(-5, Math.min(pitchDeg + aoaRoom, flareI + sinkErr * 5));
    x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
    lastVs = x.vel.y;
  }, (x) => {
    if (!td && x.onGround) {
      const g = approachGeometry(end, x.pos);
      const { pitchDeg, bankRightDeg } = attitude(x);
      td = { t: x.t, noseS: null, grade: gradeLanding({ vsFpm: lastVs * M_TO_FT * 60, crossM: g.crossM, pastThresholdM: -g.distM, runwayLengthM: end.lengthM - end.displacedM,
        runwayWidthM: end.widthM, pitchDeg, bankDeg: -bankRightDeg, iasKts: x.iasKts, vrefKts: c172.vrefKts }) };
    }
    return sf.stopped;
  });
  const result = td && sf.stopped ? shortFieldResult(td.grade, sf, POH_FT) : null;
  return { sf, result, rollFt: sf.stopped ? (sf.stopM - sf.tdM) * M_TO_FT : null, tdFt: sf.tdM * M_TO_FT, maxGammaDeg, minKtsBand, thrFt };
}

const log = (name, r) => console.log(`[c172 short field] ${name}: threshold ${r.thrFt?.toFixed(0)} ft, touchdown ${r.tdFt.toFixed(0)} ft past it at ${r.sf.tdKts?.toFixed(1)} KIAS, `
  + `roll ${r.rollFt?.toFixed(0)} ft (POH ${POH_FT}), band min ${r.minKtsBand.toFixed(1)} KIAS, steepest ${r.maxGammaDeg.toFixed(1)}°; `
  + `${r.result?.grade} ${r.result?.score} ${r.result?.reason ?? ''}`);

describe('Cessna 172S short-field landing lesson (0181) at Addison 16', () => {
  it('the POH technique: over the threshold near the 50 ft obstacle, down in the first 1,000 ft, stopped inside POH Fig. 5-11 x 1.15, A or S with no cap', () => {
    const r = flyLesson();
    log('POH technique', r);
    expect(r.thrFt).toBeGreaterThan(40); // the PAPI's path: the POH's 50 ft obstacle at the threshold
    expect(r.thrFt).toBeLessThan(55);
    expect(r.sf.stopped).toBe(true);
    expect(r.sf.off).toBe(false);
    expect(r.sf.speedOut).toBe(false);
    expect(r.sf.flapsAt500).toBe(true);
    expect(r.tdFt).toBeGreaterThan(POH_AIR_FT - 400);
    expect(r.sf.tdM).toBeLessThanOrEqual(LONG_M);
    expect(r.rollFt).toBeLessThanOrEqual(POH_FT * 1.15);
    expect(r.rollFt).toBeGreaterThan(POH_FT * 0.8);
    expect(['S', 'A']).toContain(r.result.grade);
    expect(r.result.note).toBe(DONE_NOTE);
  });

  it('8 kt fast with the power held into the flare floats past the first 1,000 ft: best grade C, and says so', () => {
    const r = flyLesson({ kts: 69, idleFt: 5 });
    log('69 KIAS, power to 5 ft', r);
    expect(r.sf.speedOut).toBe(false); // inside the ACS band: the float alone caps it
    expect(r.sf.tdM).toBeGreaterThan(LONG_M);
    expect(r.result.score).toBeLessThanOrEqual(CAP_C);
    expect(r.result.reason).toMatch(/1,000 ft/);
  });

  it('no brakes: the roll runs past 1.5x the POH\'s, best grade C, the brakes "not used"', () => {
    const r = flyLesson({ brakeS: null });
    log('no brakes', r);
    expect(r.rollFt).toBeGreaterThan(POH_FT * 1.5);
    expect(r.result.score).toBeLessThanOrEqual(CAP_C);
    expect(r.result.factors.find((f) => f.key === 'brakes').value).toBe('not used');
  });

  it('flaps left up until 300 ft: best grade B for the flaps (POH: full flaps on the approach)', () => {
    const r = flyLesson({ flapsFt: 300 });
    log('late flaps', r);
    expect(r.sf.flapsAt500).toBe(false);
    expect(r.result.score).toBeLessThanOrEqual(84);
    expect(r.result.reason).toMatch(/Flaps not at 30/);
  });
});
