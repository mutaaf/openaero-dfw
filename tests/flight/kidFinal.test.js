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
import { trimThrottle, dihedralAileron, rollHoldScale } from '../../src/flightModel.js';
import { driftAngleDeg, gradeLanding } from '../../src/landing.js';
import { airAt, tasFromIas } from '../../src/atmosphere.js';
import { stallAoaDeg } from '../../src/aero.js';
import { autothrottleCommand, trimAoaDeg } from '../../src/autopilot.js';
import { runwayEnd, approachGeometry, approachSpawn, papiWhite } from '../../src/airports.js';
import { assistConfig, createAssistState, shapeControls, slewRudder, autoConfigure, kidTargetKts, kidFinalGuide } from '../../src/assists.js';
import { missionByKey } from '../../src/missions.js';
import { makeBody, fly, attitude } from './harness.js';

const _e = new Euler(0, 0, 0, 'YXZ');

// Kid, hands off, from the mission's spawn to the touchdown. wind: { fromDeg, kts } (steady).
// stick(ft): the kid's fore/aft stick at a wheel height (+ = push), else hands off.
// rollS: keep rolling that long past the touchdown (idle, no brakes, Kid's pedals: main.js runwayUnderWheels).
// learnerBelowM: the player switches to Learner that low (no de-crab: a crabbed touchdown; the rollout is Learner's).
// every: the assist runs every that many 1/120 s sub-steps, as main.js runs it once a frame (4: 30 fps).
function flyKidFinal(acKey, missionKey, { fromDeg = 0, kts = 0 } = {}, over = null, stick = null, rollS = 0, learnerBelowM = 0, every = 1) {
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
  let cfg = assistConfig('kid');
  const ast = createAssistState();
  const s = {}, out = {}, conf = { gearDown: true, flapsIndex: 2 }, at = { trim: 0 };
  let prevIas = null, iasRate = 0, lastVs = 0, td = null, thrFt = null, minVs = 0;
  const roll = { maxNoseOff3sDeg: 0, maxCrossM: 0, yawSq: 0, n: 0, rudFlips: 0 };
  const bank = { maxDeg: 0, flips: 0, lastP: 0 };
  let step = 0, lastRud = 0, lastStep = 0;
  const papi = [0, 0, 0, 0, 0]; // samples by white lamps (main.js updatePapi: the CG to the box), 200 ft up and higher
  fly(b, spec, 240, (x, dt) => {
    const ap = approachGeometry(end, x.pos);
    const wheelM = x.pos.y - spec.gearHeight;
    if (wheelM < learnerBelowM && !x.onGround) cfg = assistConfig('learner');
    if (thrFt === null && ap.distM <= 0) thrFt = wheelM * M_TO_FT;
    if (wheelM * M_TO_FT > 200 && ap.distM > 0) papi[papiWhite(end, x.pos, ap.distM)]++;
    minVs = Math.min(minVs, x.vel.y);
    const { pitchDeg, bankRightDeg } = attitude(x);
    s.guideBankDeg = 0; s.guideGammaDeg = 0;
    const noseDeg = -_e.setFromQuaternion(x.quat, 'YXZ').y * 180 / Math.PI;
    kidFinalGuide(end, ap, noseDeg, Math.atan2(x.vel.x, -x.vel.z) * 180 / Math.PI, s);
    Object.assign(s, {
      pitchIn: stick ? stick(wheelM * M_TO_FT) : 0, rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z, rollScale: rollHoldScale(spec, (x.tasKts ?? 0) * KTS_TO_MPS),
      yawRateRight: -x.angVel.y, driftDeg: driftAngleDeg(noseDeg, x.vel.x, x.vel.z),
      aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, dihedralAil: dihedralAileron(spec, (x.betaDeg ?? 0) * DEG_TO_RAD), stallAoaDeg: stallAoaDeg(spec, x.flapsIndex),
      tailstrikeDeg: spec.maxGroundPitchDeg ?? 15, onGround: !!x.onGround, noseWheelDown: x.wheelLoads?.[0] > 0, wheelHeightM: wheelM,
      airspeedMps: (x.tasKts ?? 0) * KTS_TO_MPS, vsMps: x.vel.y, flarePerS: spec.kidFlarePerS,
    });
    s.rwyHdgDeg = null;
    if (x.onGround && Math.abs(ap.crossM) < end.widthM / 2 + 3) {
      const r = end.hdgT * DEG_TO_RAD, g = spec.gear;
      Object.assign(s, { rwyHdgDeg: end.hdgT, noseHdgDeg: noseDeg, crossM: ap.crossM, crossVelMps: x.vel.x * Math.cos(r) + x.vel.z * Math.sin(r),
        steerRateDegS: Math.hypot(x.vel.x, x.vel.z) * Math.tan(g.steerDeg * DEG_TO_RAD) / (g.noseZ + g.mainZ) * 180 / Math.PI });
    }
    if (td) {
      const off = Math.abs(((noseDeg - end.hdgT) % 360 + 540) % 360 - 180);
      if (x.t - td.t <= 3) roll.maxNoseOff3sDeg = Math.max(roll.maxNoseOff3sDeg, off);
      roll.maxCrossM = Math.max(roll.maxCrossM, Math.abs(ap.crossM));
    }
    if (step++ % every === 0) shapeControls(cfg, ast, s, dt * every, out);
    if (td && x.t - td.t > 5) { // settled on the rollout: its yaw rate and the pedal's reversals
      roll.yawSq += (x.angVel.y * 180 / Math.PI) ** 2; roll.n++;
      const d = out.rud - lastRud;
      if (d * lastStep < 0) roll.rudFlips++;
      if (d) lastStep = d;
    }
    lastRud = out.rud;
    if (!td && wheelM * M_TO_FT > 50) { // the bank above 50 ft: its largest and its roll-rate reversals (0156)
      const p = -x.angVel.z;
      bank.maxDeg = Math.max(bank.maxDeg, Math.abs(bankRightDeg));
      if (Math.abs(p) > 0.02 && bank.lastP && Math.sign(p) !== Math.sign(bank.lastP)) bank.flips++;
      if (Math.abs(p) > 0.02) bank.lastP = p;
    }
    x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = slewRudder(x.rudderInput, out.rud, dt); // main.js applyAssists
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
    if (td) return x.t - td.t >= rollS;
    if (!x.onGround) return false;
    const g = approachGeometry(end, x.pos);
    td = { pastThrM: -g.distM, crossM: g.crossM, vsFpm: lastVs * M_TO_FT * 60, iasKts: x.iasKts, t: x.t,
      driftDeg: driftAngleDeg(-_e.setFromQuaternion(x.quat, 'YXZ').y * 180 / Math.PI, x.vel.x, x.vel.z), bankDeg: attitude(x).bankRightDeg, pitchDeg: attitude(x).pitchDeg, widthM: end.widthM };
    return rollS <= 0;
  });
  return { td, thrFt, minVsFpm: minVs * M_TO_FT * 60, papi, roll, bank };
}

const log = (ac, key, name, { td, thrFt }) => console.log(`[${ac} kid final] ${key} ${name}: threshold ${thrFt?.toFixed(0)} ft; touchdown ${td && td.pastThrM.toFixed(0)} m past, ${td && td.crossM.toFixed(1)} m off, ${td && td.vsFpm.toFixed(0)} fpm, ${td && td.iasKts.toFixed(0)} KIAS, drift ${td && td.driftDeg.toFixed(1)}°, bank ${td && td.bankDeg.toFixed(1)}°, ${td && td.t.toFixed(0)} s`);
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

// Ticket 0131: the PAPI's on-path band is the glide path +-10' (AC 150/5340-30J Table 7-2), symmetric
// now: a little tighter below the path, wider above it (was 2.8-3.1°); Kid's guide flies the 3° path, so the coach's "two white,
// two red" must be what the box shows all the way down to 200 ft. A regression guard: Kid holds the
// path within ~0.1°, inside the old band too; aero.test.js and airports.test.js pin the angles.
describe('Kid hands off down a final reads two white, two red on the PAPI (ticket 0131)', () => {
  for (const [ac, key] of [['c172', 'kads_16_final'], ['c172', 'kftw_16_final'], ['b738', 'kdfw_35c_final']]) {
    it(`${ac} ${key}, calm: 2 white in at least 95% of the samples above 200 ft, never 0 or 4`, () => {
      const { papi } = flyKidFinal(ac, key);
      const n = papi.reduce((a, b) => a + b, 0);
      console.log(`[${ac} kid final] ${key} PAPI white 0-4: ${papi.join(' / ')}`);
      expect(n).toBeGreaterThan(100);
      expect(papi[2] / n).toBeGreaterThan(0.95);
      expect(papi[0] + papi[4]).toBe(0);
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
  // Ticket 0101: Kid's auto-flare at the Cessna's pace (sink 0.2/s of the wheel height from 12 m)
  // was a ~10 s flare at the 737's ~150 kt: a balloon to ~8 ft, then ~350 fpm 650 m in, past
  // landing.js's full-marks zone. The jet's own profile (spec.kidFlarePerS) starts at the same ~40 ft
  // and lands it ~700-1,150 ft in at about the approach speed: a game assist, shorter and with less
  // float than a real 737 (Boeing's FCTM: flare at ~20-30 ft, touchdown 1,000-1,500 ft in).
  for (const [name, wind] of [['calm', {}], ['15 kt headwind', { fromDeg: 0, kts: 15 }], ['25 kt headwind', { fromDeg: 0, kts: 25 }], ['10 kt crosswind', { fromDeg: 270, kts: 10 }]]) {
    it(`kdfw_35c_final, ${name}: touches down gently within landing.js's 600 m zone`, () => {
      const r = flyKidFinal('b738', 'kdfw_35c_final', wind);
      log('b738', 'kdfw_35c_final', name, r);
      expectLanded(r);
      expect(r.td.pastThrM).toBeGreaterThan(150);
      expect(r.td.pastThrM).toBeLessThan(600);
      expect(r.td.vsFpm).toBeGreaterThan(-240); // landing.js: rate scores 75+ under 240 fpm
    });
  }
  // A tailwind floats it further over the ground (~745 m at 10 kt, ~180 fpm; 724 m before): gentle
  // and inside the 3,000 ft touchdown zone, short of landing.js's full marks.
  it('kdfw_35c_final, 10 kt tailwind: gentle, inside the 3,000 ft touchdown zone', () => {
    const r = flyKidFinal('b738', 'kdfw_35c_final', { fromDeg: 180, kts: 10 });
    log('b738', 'kdfw_35c_final', '10 kt tailwind', r);
    expectLanded(r);
    expect(r.td.pastThrM).toBeLessThan(3000 / M_TO_FT);
    expect(r.td.vsFpm).toBeGreaterThan(-240);
  });
  // First-timer panel: a kid who pulls in the flare, balloons, lets go and pulls again under 20 ft.
  // Hands off, the guide used to lower the nose at 2°/s inside the flare band, and after the balloon
  // that dive out-ran the quicker profile's floor: 622-710 fpm, a CRASH. Inside the band the guide
  // no longer lowers the nose while it climbs.
  for (const pull of [0.25, 0.5, 0.75]) {
    it(`kdfw_35c_final: a ${pull} pull under 20 ft, let go above it, is no crash`, () => {
      const r = flyKidFinal('b738', 'kdfw_35c_final', {}, null, (ft) => (ft < 20 ? -pull : 0));
      expect(r.td).not.toBeNull();
      expect(r.td.vsFpm).toBeGreaterThan(-600); // landing.js: past 600 fpm is a CRASH
    });
  }
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

// Ticket 0100: the straight-in finals in a crosswind. Without the de-crab the Cessna touched down
// 9-10° off its track in 10 kt (~20° in 20 kt) and the 737 3.5-7.5° (10-20 kt). The de-crab is a slip
// with the wings near level; the line-up's bank (into the wind) holds the centreline through it.
describe('Kid de-crabs before touchdown in a crosswind (flightModel, ticket 0100)', () => {
  for (const [ac, key, name, wind] of [
    ['c172', 'kads_16_final', '10 kt from the right (250°)', { fromDeg: 250, kts: 10 }],
    ['c172', 'kads_16_final', '20 kt straight across from the right (250°)', { fromDeg: 250, kts: 20 }],
    ['b738', 'kdfw_35c_final', '10 kt from the left (270°)', { fromDeg: 270, kts: 10 }],
    ['b738', 'kdfw_35c_final', '15 kt quartering tailwind (250°)', { fromDeg: 250, kts: 15 }],
    ['b738', 'kdfw_35c_final', '20 kt from the right (090°)', { fromDeg: 90, kts: 20 }],
  ]) {
    it(`${ac} ${key}, ${name}: wheels within ${ac === 'c172' && wind.kts > 15 ? 3.5 : 2}° of the track, gently, on the centreline`, () => {
      const r = flyKidFinal(ac, key, wind);
      log(ac, key, name, r);
      expectLanded(r);
      // 20 kt straight across is past the C172's 15 kt demonstrated crosswind (POH Sec. 4): ~3°, bounded at
      // 3.5°. The rudder is full over for the whole ~3 s under 3 m, so what is left is time, not gain.
      expect(Math.abs(r.td.driftDeg)).toBeLessThan(ac === 'c172' && wind.kts > 15 ? 3.5 : 2);
      expect(Math.abs(r.td.bankDeg)).toBeLessThan(5);
      expect(r.td.vsFpm).toBeGreaterThan(-240);
    });
  }
});

// 0100 panel: the 737 lands on its mains and holds the nose wheel up for over a second; the runway hold's
// pedal, sized for the nose wheel's steering, let the wind yaw it back into the crab (~5° at +1.5 s, as
// without the de-crab). Until the nose tyre carries weight Kid's de-crab keeps the rudder.
describe('Kid keeps the de-crab until the nose wheel is down (flightModel, ticket 0100)', () => {
  const logRoll = (ac, key, wind, r) => console.log(`[${ac} kid final] ${key} ${wind.kts} kt from ${wind.fromDeg}: drift ${r.td.driftDeg.toFixed(1)}°, nose off the runway at most ${r.roll.maxNoseOff3sDeg.toFixed(1)}° in 3 s, ${r.roll.maxCrossM.toFixed(1)} m off on the rollout`);
  // Before this: 15 kt 4.9-5.5° off in 3 s and 8.7-9.0 m off; the Cessna 14.7° and 11.9 m.
  for (const [ac, key, wind] of [['b738', 'kdfw_35c_final', { fromDeg: 270, kts: 15 }], ['c172', 'kads_16_final', { fromDeg: 250, kts: 15 }]]) {
    it(`${ac} ${key}, ${wind.kts} kt from ${wind.fromDeg}°: the nose stays within 2.5° of the runway for 3 s after touchdown, on the centreline for 20 s`, () => {
      const r = flyKidFinal(ac, key, wind, null, null, 20);
      logRoll(ac, key, wind, r);
      expect(r.roll.maxNoseOff3sDeg).toBeLessThan(2.5);
      expect(r.roll.maxCrossM).toBeLessThan(8);
    });
  }
  // The runway hold itself aims up to 3° off the runway to steer back to the centreline (groundSteerRudder),
  // so a wider bound here is the hold, not a crab: the 737 in 25 kt at the wheels and the F-16 in 20 kt within
  // 4° (3.2°, 3.8°) (the physics panel's sweep, 10-25 kt: touchdown drift 3.7-9.4° in the 737 and 4.2-10.5° in the F-16
  // without the de-crab).
  for (const [ac, wind, bound] of [['b738', { fromDeg: 90, kts: 25 }, 4], ['f16', { fromDeg: 270, kts: 20 }, 4]]) {
    it(`${ac} kdfw_35c_final, ${wind.kts} kt from ${wind.fromDeg}°: the nose stays within ${bound}° of the runway for 3 s after touchdown`, () => {
      const r = flyKidFinal(ac, 'kdfw_35c_final', wind, null, null, 3);
      logRoll(ac, 'kdfw_35c_final', wind, r);
      expect(Math.abs(r.td.driftDeg)).toBeLessThan(2.5);
      expect(r.roll.maxNoseOff3sDeg).toBeLessThan(bound);
    });
  }
  // Physics panel: a kid who pulls under 20 ft and floats (~7 s under 3 m) slipped 12.5 m downwind, wings level,
  // because past the runway's first third nothing banked into the wind (5.4 m without the de-crab).
  it('b738 kdfw_35c_final, a 0.75 pull under 20 ft in 15 kt from 270°: the long float stays on the centreline', () => {
    const r = flyKidFinal('b738', 'kdfw_35c_final', { fromDeg: 270, kts: 15 }, null, (ft) => (ft < 20 ? -0.75 : 0), 20);
    logRoll('b738', 'kdfw_35c_final float', { fromDeg: 270, kts: 15 }, r);
    expect(Math.abs(r.td.crossM)).toBeLessThan(6);
    expect(r.roll.maxCrossM).toBeLessThan(8); // 4.0 m; without the mains' rudder the held-up nose ran it off the side
    expect(Math.abs(r.td.driftDeg)).toBeLessThan(3);
    expect(r.roll.maxNoseOff3sDeg).toBeLessThan(5); // 4.9°: the hold steering back from 4 m, not a crab
  });
  // 20 kt at the wheels (a ~25 kt METAR in the game, weather.js surfaceWindFactor): the touchdown is
  // straight (1.6° drift, 1.9° in 3 s; was 7.4°), but the rollout's hold can't keep the 737 on 35C.
  const XW20 = { fromDeg: 90, kts: 20 };
  it('b738 kdfw_35c_final, 20 kt from 90°: the nose stays within 2.5° of the runway for 3 s after touchdown', () => {
    const r = flyKidFinal('b738', 'kdfw_35c_final', XW20, null, null, 3);
    logRoll('b738', 'kdfw_35c_final', XW20, r);
    expect(r.roll.maxNoseOff3sDeg).toBeLessThan(2.5);
  });
  // Ticket 0150: 83 m off in 20 s (159 m before 0100), 520 m in 40 s. At ~135 kt the fin's weathervaning (~0.25 rad/s²
  // at 8° of sideslip) out-turned the nose tyre's side grip (~0.19 rad/s², gear.js noseWheelYawHold), and the 0110
  // hold, sized for nose-wheel steering, asked only -0.09 pedal: the nose sat 2.5° into the wind and rolled off the side.
  // The hold now asks more pedal per degree at landing speeds (assists.js shapeControls), so the rudder surface helps: 1.4 m.
  // The F-16 in 20 kt (385 m) and the 737 in 25 kt (1,060 m) ran off the same way.
  for (const [ac, wind] of [['b738', XW20], ['b738', { fromDeg: 270, kts: 20 }], ['b738', { fromDeg: 90, kts: 25 }], ['f16', { fromDeg: 270, kts: 20 }]]) {
    it(`${ac} kdfw_35c_final, ${wind.kts} kt from ${wind.fromDeg}°: on the centreline for 40 s of rollout (0150)`, () => {
      const r = flyKidFinal(ac, 'kdfw_35c_final', wind, null, null, 40);
      logRoll(ac, 'kdfw_35c_final', wind, r);
      expect(r.roll.maxCrossM).toBeLessThan(8);
    });
  }
  // 0150 physics panel: the first cut damped the pedal with the yaw rate, which through the nose wheel's steering (a loop
  // far above 1 per frame) chattered it at the slew limit every few frames, 600-1,100 reversals in 20 s (the base: 1-3).
  // Run as the game runs it, once a frame at 30 fps: on the centreline (1.3 m), the pedal settled (40 reversals in 35 s,
  // ~0.6 Hz: the hold's own corrections), the yaw rate calmer than the base's (RMS 0.83°/s; base 1.31 as it yawed off).
  for (const [ac, wind] of [['b738', XW20], ['c172', { fromDeg: 250, kts: 15 }]]) {
    it(`${ac}, ${wind.kts} kt from ${wind.fromDeg}°, the assist at 30 fps: on the centreline, the pedal and the yaw settled (0150)`, () => {
      const r = flyKidFinal(ac, ac === 'c172' ? 'kads_16_final' : 'kdfw_35c_final', wind, null, null, 40, 0, 4);
      const rms = Math.sqrt(r.roll.yawSq / r.roll.n);
      console.log(`[${ac} kid final 30 fps] ${wind.kts} kt: ${r.roll.maxCrossM.toFixed(1)} m off, yaw RMS ${rms.toFixed(2)}°/s, ${r.roll.rudFlips} pedal reversals in 35 s`);
      expect(r.roll.maxCrossM).toBeLessThan(8);
      expect(rms).toBeLessThan(1);
      expect(r.roll.rudFlips).toBeLessThan(100);
    });
  }
  // 0150 panel: Learner has no de-crab, so it lands crabbed (7.5-8.3°); on the mains it now gets Kid's rudder to the hold's
  // heading too (it had only the nose-wheel hold there: 8.0 m in 20 kt, 12.9 m in 25 kt; 494-1,090 m before 0150).
  for (const [ac, wind] of [['b738', XW20], ['b738', { fromDeg: 90, kts: 25 }]]) {
    it(`${ac} kdfw_35c_final, ${wind.kts} kt from ${wind.fromDeg}°, Learner from 3 m (a crabbed touchdown): on the centreline for 40 s of rollout (0150)`, () => {
      const r = flyKidFinal(ac, 'kdfw_35c_final', wind, null, null, 40, 3);
      logRoll(ac, 'kdfw_35c_final learner', wind, r);
      expect(Math.abs(r.td.driftDeg)).toBeGreaterThan(5); // it did land crabbed: the card is the rollout's, not the de-crab's
      expect(r.roll.maxCrossM).toBeLessThan(8);
    });
  }
  // KNOWN GAP (ticket 0158): the F-16's nose wheel steers ~190°/s at full pedal at landing speed (the 737's ~35°/s), so the
  // rollout's pedal, shared by the nose wheel and the rudder surface, is a few hundredths: 1,041 m off in 25 kt (1,107 m
  // before 0150), and Learner's crabbed touchdown in 20 kt 21.6 m.
  it.fails('f16 kdfw_35c_final, 25 kt from 90°: on the centreline for 40 s of rollout (KNOWN GAP, 0158)', () => {
    expect(flyKidFinal('f16', 'kdfw_35c_final', { fromDeg: 90, kts: 25 }, null, null, 40).roll.maxCrossM).toBeLessThan(8);
  });
  it.fails('f16 kdfw_35c_final, 20 kt from 270°, Learner from 3 m: on the centreline for 40 s of rollout (KNOWN GAP, 0158)', () => {
    expect(flyKidFinal('f16', 'kdfw_35c_final', { fromDeg: 270, kts: 20 }, null, null, 40, 3).roll.maxCrossM).toBeLessThan(8);
  });
});

// First-timer panel: the hands-off Cessna lands calm at ~186 fpm, an S (95) on landing.js's line, and the
// de-crab's slip first cost every crosswind landing that S (204-226 fpm, A 92-94). Started at 2.5 m it keeps it
// through 15 kt; at 20 kt it is an A 94, as it was before the de-crab (its crab cost the same points).
describe('Kid hands off in a crosswind grades as well as in calm air (flightModel, ticket 0100)', () => {
  const grade = (spec, r) => gradeLanding({ vsFpm: r.td.vsFpm, crossM: r.td.crossM, bankDeg: r.td.bankDeg, pastThresholdM: r.td.pastThrM,
    pitchDeg: r.td.pitchDeg, runwayWidthM: r.td.widthM, iasKts: r.td.iasKts, vrefKts: spec.vrefKts });
  const calm = grade(AIRCRAFT_DATABASE.c172, flyKidFinal('c172', 'kads_16_final'));
  for (const wind of [{ fromDeg: 250, kts: 10 }, { fromDeg: 70, kts: 15 }]) {
    it(`c172 kads_16_final, ${wind.kts} kt from ${wind.fromDeg}°: the same grade as calm (${calm.grade} ${calm.score})`, () => {
      const g = grade(AIRCRAFT_DATABASE.c172, flyKidFinal('c172', 'kads_16_final', wind));
      console.log(`[c172 kid final] grade calm ${calm.grade} ${calm.score}, ${wind.kts} kt ${g.grade} ${g.score}`);
      expect(g.grade).toBe(calm.grade);
      expect(g.score).toBeGreaterThanOrEqual(calm.score - 0.5);
    });
  }
});

// The F-16's stick commands up to 308°/s now (0156), ten times the rate Kid's bank hold was tuned
// on; assists.js scales the hold by flightModel.js rollHoldScale. Kid hands off on DFW's final in a
// 15 kt crosswind, the assist run once a frame at 60 and 30 fps: the bank stays small and the
// roll rate doesn't chatter (one reversal above 50 ft, measured: the guide's turn onto the localizer and out).
describe('Kid hands off, the F-16 holds its bank on the final without oscillation (0156)', () => {
  for (const every of [2, 4]) {
    it(`kdfw_35c_final, 15 kt from 270°, the assist at ${120 / every} fps: bank under 15° (the guide's localizer turn, ~11°), under 6 roll-rate reversals, lands`, () => {
      const r = flyKidFinal('f16', 'kdfw_35c_final', { fromDeg: 270, kts: 15 }, null, null, 0, 0, every);
      console.log(`[f16 kid final] bank above 50 ft: max ${r.bank.maxDeg.toFixed(1)}°, ${r.bank.flips} roll-rate reversals`);
      expect(r.bank.maxDeg).toBeLessThan(15);
      expect(r.bank.flips).toBeLessThan(6);
      expectLanded(r);
    });
  }
});
