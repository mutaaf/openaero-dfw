// Kid's hands-off final (ticket 0098), flown headless from a final mission's spawn as main.js
// sets it up (loadScenario: Vref + 5 KIAS, landing flaps index 2, in trim on the 3° path) with the
// guide, assist and autothrottle main.js applyAssists runs. The guide used to stop at the
// threshold and fall back to level flight: the Cessna crossed at ~45 ft, levelled inside the
// auto-flare band and floated Addison's whole runway. The touchdown zone is landing.js's (full
// marks to 600 m past the threshold). Flat ground (the harness): the threshold height is 0.
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion, Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt, tasFromIas } from '../../src/atmosphere.js';
import { stallAoaDeg } from '../../src/aero.js';
import { autothrottleCommand, trimAoaDeg } from '../../src/autopilot.js';
import { runwayEnd, approachGeometry, approachSpawn } from '../../src/airports.js';
import { assistConfig, createAssistState, shapeControls, autoConfigure, kidTargetKts, kidFinalGuide } from '../../src/assists.js';
import { missionByKey } from '../../src/missions.js';
import { makeBody, fly, attitude } from './harness.js';

const _e = new Euler(0, 0, 0, 'YXZ');

// Kid, hands off, from the mission's spawn to the touchdown. wind: { fromDeg, kts } (steady).
function flyKidFinal(acKey, missionKey, { fromDeg = 0, kts = 0 } = {}, over = null) {
  const spec = AIRCRAFT_DATABASE[acKey];
  const m = missionByKey(missionKey);
  const end = { ...runwayEnd(m.airport, m.rwy), thrY: 0 };
  const vApp = (spec.vrefKts + 5) * KTS_TO_MPS;
  const sp = approachSpawn(end, m.distNm, tasFromIas(vApp, airAt(0).sigma));
  const b = makeBody(spec, { kts: spec.vrefKts + 5, altM: sp.pos.y, flaps: 2 });
  b.pos.set(sp.pos.x, sp.pos.y, sp.pos.z);
  b.vel.set(sp.vel.x, sp.vel.y, sp.vel.z);
  let gamma = -3;
  // over: { pastM, ft } lets go level over the runway instead, pastM past the threshold, ft up.
  if (over) {
    const d = { x: Math.sin(end.hdgT * DEG_TO_RAD), z: -Math.cos(end.hdgT * DEG_TO_RAD) }, v = b.vel.length();
    b.pos.set(end.thrX + d.x * over.pastM, spec.gearHeight + over.ft / M_TO_FT, end.thrZ + d.z * over.pastM);
    b.vel.set(d.x * v, 0, d.z * v);
    gamma = 0;
  }
  b.quat.setFromEuler(_e.set((trimAoaDeg(spec, vApp, 2) + gamma) * DEG_TO_RAD, sp.yawRad, 0));
  b.throttle = b.engineN = trimThrottle(spec, vApp, 2, gamma, true, airAt(b.pos.y));
  b.apMaster = false;
  b.autoTrim = true; // Kid's assist trims (main.js: sim.autoTrim with an assist)
  const w = fromDeg * Math.PI / 180;
  b.windVec.set(-Math.sin(w) * kts * KTS_TO_MPS, 0, Math.cos(w) * kts * KTS_TO_MPS);
  b.vel.add(b.windVec);
  const cfg = assistConfig('kid'), ast = createAssistState();
  const s = {}, out = {}, conf = { gearDown: true, flapsIndex: 2 }, at = { trim: 0 };
  let prevIas = null, iasRate = 0, lastVs = 0, td = null, thrFt = null, minVs = 0;
  fly(b, spec, 240, (x, dt) => {
    const ap = approachGeometry(end, x.pos);
    const wheelM = x.pos.y - spec.gearHeight;
    if (thrFt === null && ap.distM <= 0) thrFt = wheelM * M_TO_FT;
    minVs = Math.min(minVs, x.vel.y);
    const { pitchDeg, bankRightDeg } = attitude(x);
    s.guideBankDeg = 0; s.guideGammaDeg = 0;
    const noseDeg = -_e.setFromQuaternion(x.quat, 'YXZ').y * 180 / Math.PI;
    kidFinalGuide(end, ap, noseDeg, Math.atan2(x.vel.x, -x.vel.z) * 180 / Math.PI, s);
    Object.assign(s, {
      pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
      aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, dihedralAil: 0, stallAoaDeg: stallAoaDeg(spec, x.flapsIndex),
      tailstrikeDeg: spec.maxGroundPitchDeg ?? 15, onGround: !!x.onGround, wheelHeightM: wheelM,
      airspeedMps: (x.tasKts ?? 0) * KTS_TO_MPS,
    });
    shapeControls(cfg, ast, s, dt, out);
    x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
    // Kid's gear, flaps and power (main.js applyAssists).
    conf.flapsIndex = x.flapsIndex; conf.gearDown = x.gearDown;
    autoConfigure(spec, { onGround: false, vsiFpm: x.vel.y * M_TO_FT * 60, aglFt: wheelM * M_TO_FT, iasKts: x.iasKts }, conf);
    x.flapsIndex = conf.flapsIndex; x.gearDown = conf.gearDown;
    if (prevIas !== null) iasRate += ((x.iasKts - prevIas) / dt - iasRate) * Math.min(1, dt / 0.5);
    prevIas = x.iasKts;
    if (wheelM > 8) {
      const gamma = Math.atan2(x.vel.y, Math.max(20, Math.hypot(x.vel.x, x.vel.z))) * 180 / Math.PI;
      const tgt = kidTargetKts(spec, x.flapsIndex);
      const ff = trimThrottle(spec, tgt * KTS_TO_MPS, x.flapsIndex, gamma, x.gearDown, airAt(x.pos.y));
      x.throttle = autothrottleCommand(ff, at, x.iasKts, tgt, iasRate, dt);
    } else x.throttle = Math.max(0, x.throttle - dt * 0.5);
    lastVs = x.vel.y;
  }, (x) => {
    if (!x.onGround) return false;
    const g = approachGeometry(end, x.pos);
    td = { pastThrM: -g.distM, crossM: g.crossM, vsFpm: lastVs * M_TO_FT * 60, iasKts: x.iasKts, t: x.t };
    return true;
  });
  return { td, thrFt, minVsFpm: minVs * M_TO_FT * 60 };
}

const log = (ac, key, name, { td, thrFt }) => console.log(`[${ac} kid final] ${key} ${name}: threshold ${thrFt?.toFixed(0)} ft; touchdown ${td && td.pastThrM.toFixed(0)} m past, ${td && td.crossM.toFixed(1)} m off, ${td && td.vsFpm.toFixed(0)} fpm, ${td && td.iasKts.toFixed(0)} KIAS, ${td && td.t.toFixed(0)} s`);
// Down the 3° path, over the threshold near its ~50 ft (AIM 2-1-2: TCH; aim point 1,000 ft in),
// on the centreline, gently.
function expectLanded({ td, thrFt }) {
  expect(td).not.toBeNull();
  expect(thrFt).toBeGreaterThan(25);
  expect(thrFt).toBeLessThan(75);
  expect(td.pastThrM).toBeGreaterThan(60);
  expect(td.vsFpm).toBeGreaterThan(-400);
  expect(Math.abs(td.crossM)).toBeLessThan(8);
}

describe('Kid hands off on a straight-in final in the Cessna lands in the touchdown zone (flightModel, ticket 0098)', () => {
  for (const [key, name, wind] of [['kads_16_final', 'calm', {}], ['kads_16_final', '12 kt headwind', { fromDeg: 160, kts: 12 }], ['kftw_16_final', '4 NM, calm', {}]]) {
    it(`${key}, ${name}: down the 3° path past the threshold to the aim point, the auto-flare lands it`, () => {
      const r = flyKidFinal('c172', key, wind);
      log('c172', key, name, r);
      expectLanded(r);
      expect(r.td.pastThrM).toBeLessThan(600); // landing.js touchdown zone (full marks)
      expect(r.td.vsFpm).toBeGreaterThan(-240); // landing.js: rate scores 75+ under 240 fpm
    });
  }
});

describe('Kid hands off on a straight-in final in the 737 (flightModel, ticket 0098)', () => {
  for (const [name, wind] of [['calm', {}], ['15 kt headwind', { fromDeg: 0, kts: 15 }]]) {
    it(`kdfw_35c_final, ${name}: lands on the runway inside the 3,000 ft touchdown zone`, () => {
      const r = flyKidFinal('b738', 'kdfw_35c_final', wind);
      log('b738', 'kdfw_35c_final', name, r);
      expectLanded(r);
      // Was 1,149 m calm with the guide stopping at the threshold. The touchdown zone is the
      // first 3,000 ft (AIM 2-1-5: TDZ lights); landing.js gives full marks only to 600 m.
      expect(r.td.pastThrM).toBeLessThan(3000 / M_TO_FT);
    });
  }
  // Known gap (ticket 0101): Kid's auto-flare (assists.js: sink 0.2/s of the wheel height from
  // 12 m, no less than 0.8 m/s) is a ~10 s flare at the 737's ~140 kt, ~700 m of float past an
  // aim point the guide now reaches; landing.js's full-marks zone ends at 600 m.
  it.fails('kdfw_35c_final, calm: touches down within landing.js\'s 600 m zone', () => {
    const r = flyKidFinal('b738', 'kdfw_35c_final');
    expect(r.td.pastThrM).toBeLessThan(600);
  });
});

// A kid who lets go over the runway (first-timer panel): past the threshold the guide flies only
// a landing, low (under ~100 ft) over the first third and never steeper than 2° (at 3° the 737 still
// sank ~1,000 fpm from 60-80 ft). It dived the
// 737 at -6° from 60-100 ft into an 880-1,000 fpm "crash"; higher, it now holds level as before.
describe('Kid let go over the runway (flightModel, ticket 0098 panel)', () => {
  for (const [ac, ft] of [['b738', 60], ['b738', 80], ['b738', 95], ['c172', 60], ['c172', 95]]) {
    it(`${ac} level at ${ft} ft, 200 m past 35C's threshold: no hard landing`, () => {
      const r = flyKidFinal(ac, 'kdfw_35c_final', {}, { pastM: 200, ft });
      log(ac, 'over 35C', `${ft} ft`, r);
      if (r.td) expect(r.td.vsFpm).toBeGreaterThan(-600); // landing.js: past 600 fpm is a CRASH
      expect(r.minVsFpm).toBeGreaterThan(-1000);
    });
  }
  for (const ft of [300, 1000]) {
    it(`b738 level at ${ft} ft over 35C (a go-around or a takeoff climbing away): not dived at the runway`, () => {
      const r = flyKidFinal('b738', 'kdfw_35c_final', {}, { pastM: 500, ft });
      expect(r.minVsFpm).toBeGreaterThan(-500);
      if (r.td) expect(r.td.pastThrM).toBeGreaterThan(4084); // never touches down on what's left of 35C
    });
  }
});
