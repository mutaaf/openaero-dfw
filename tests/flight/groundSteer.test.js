// Ticket 0110: the airplane stays on the runway in a crosswind. With the METAR's wind reaching the
// wheels (0106: the 10 m wind thinned by the log law to the CG's height, weather.js
// surfaceWindFactor), the fin weathervanes the nose into the wind on the roll. The loaded nose
// tyre holds the yaw rate the pedals steer (gear.js noseWheelYawHold) and lets go as the nose
// lifts; Kid and Learner hold the centreline with the pedals when the player doesn't
// (assists.js groundSteerRudder). Runway: 150 ft wide (KDFW, KDAL), 75 ft (22.9 m) either side;
// the assisted cards hold half of that, for Addison's 100 ft.
import { describe, it, expect } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { assistConfig, createAssistState, shapeControls, slewRudder, groundSteerRudder } from '../../src/assists.js';
import { touchGroundRudder, tillerShare } from '../../src/input.js';
import { aileronForBank } from '../../src/autopilot.js';
import { stallAoaDeg } from '../../src/aero.js';
import { surfaceWindFactor } from '../../src/weather.js';
import { KTS_TO_MPS, RAD_TO_DEG, DEG_TO_RAD, M_TO_FT } from '../../src/constants.js';
import { makeBody, fly, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172, b738 = AIRCRAFT_DATABASE.b738;
const _e = new Euler(0, 0, 0, 'YXZ');
const noseRightDeg = (b) => -_e.setFromQuaternion(b.quat, 'YXZ').y * RAD_TO_DEG;
// The game's wind: a METAR wind from the right (east, the runway heading north), at the CG's height.
const gameCrosswind = (x, metarKts) => x.windVec.set(-metarKts * KTS_TO_MPS * surfaceWindFactor(x.pos.y - x.groundY), 0, 0);
const flaps = (spec) => (spec === c172 ? 0 : 1);

// One sub-step through the assist the way main.js applyAssists feeds it on runway 36 (true north,
// centreline x = 0): stick and pedals as given, smoothed like the game's (the rudder slewed).
function assisted(level, spec, st, s, x, dt, { pitchIn = 0 } = {}) {
  const { pitchDeg, bankRightDeg } = attitude(x);
  Object.assign(s, {
    pitchIn, rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
    aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, stallAoaDeg: stallAoaDeg(spec, x.flapsIndex), tailstrikeDeg: spec.maxGroundPitchDeg ?? 15,
    onGround: !!x.onGround, wheelHeightM: x.pos.y - x.groundY - spec.gearHeight, airspeedMps: (x.tasKts ?? 0) * KTS_TO_MPS,
    guideBankDeg: 0, guideGammaDeg: 0,
    rwyHdgDeg: 0, noseHdgDeg: noseRightDeg(x), crossM: x.pos.x, crossVelMps: x.vel.x,
    steerRateDegS: Math.hypot(x.vel.x, x.vel.z) * Math.tan(spec.gear.steerDeg * DEG_TO_RAD) / (spec.gear.noseZ + spec.gear.mainZ) * RAD_TO_DEG,
  });
  const out = shapeControls(assistConfig(level), st, s, dt, {});
  const k = x.onGround ? Math.min(1, dt * 10) : 1;
  x.elevInput += (out.elev - x.elevInput) * k;
  x.aileronInput += (out.ail - x.aileronInput) * k;
  x.rudderInput = slewRudder(x.rudderInput, out.rud, dt);
}

// Full power, hands off the pedals, the stick back at Vr and let go once it flies, to 50 ft.
function assistedTakeoff(spec, level, metarKts) {
  const b = makeBody(spec, { throttle: 1, flaps: flaps(spec) });
  b.apMaster = false; b.autoTrim = true;
  const st = createAssistState(), s = {};
  let maxOffM = 0, liftoff = false;
  fly(b, spec, 120, (x, dt) => {
    gameCrosswind(x, metarKts);
    if (!x.onGround) liftoff = true;
    assisted(level, spec, st, s, x, dt, { pitchIn: !liftoff && x.iasKts >= spec.vrKts ? -1 : 0 });
    if (!liftoff) maxOffM = Math.max(maxOffM, Math.abs(x.pos.x));
  }, (x) => (x.pos.y - x.groundY - spec.gearHeight) * M_TO_FT > 50 || Math.abs(x.pos.x) > 60);
  return { maxOffM, liftoff, t: b.t };
}

// The wheels-on/off moments (panel, 0110): the runway hold and the air's coordination want different
// pedals. Learner, a 15 kt METAR crosswind: the yaw rate over the 3 s after lift-off, and over a
// crabbed (15°) touchdown that skips back off the runway for a moment.
function liftoffYaw(spec, metarKts) {
  const b = makeBody(spec, { throttle: 1, flaps: flaps(spec) });
  b.apMaster = false;
  const st = createAssistState(), s = {};
  let t0 = null, maxYawDegS = 0;
  fly(b, spec, 120, (x, dt) => {
    gameCrosswind(x, metarKts);
    if (t0 === null && !x.onGround && x.t > 2) t0 = x.t;
    assisted('learner', spec, st, s, x, dt, { pitchIn: t0 === null && x.iasKts >= spec.vrKts ? -1 : 0 });
    if (t0 !== null) maxYawDegS = Math.max(maxYawDegS, Math.abs(x.angVel.y) * RAD_TO_DEG);
  }, (x) => t0 !== null && x.t - t0 > 3);
  return { maxYawDegS, lifted: t0 !== null };
}
function skipYaw(spec, metarKts) {
  const b = makeBody(spec, { flaps: 2 });
  b.quat.setFromEuler(_e.set(0, -15 * DEG_TO_RAD, 0));
  b.vel.set(0, 0, -spec.vrefKts * KTS_TO_MPS);
  b.apMaster = false;
  const st = createAssistState(), s = {};
  let maxYawDegS = 0;
  fly(b, spec, 6, (x, dt) => {
    gameCrosswind(x, metarKts);
    x.throttle = 0;
    if (x.t > 1.4 && x.t < 1.42) x.vel.y = 1.5; // the skip
    assisted('learner', spec, st, s, x, dt);
    maxYawDegS = Math.max(maxYawDegS, Math.abs(x.angVel.y) * RAD_TO_DEG);
  });
  return { maxYawDegS, hdgDeg: noseRightDeg(b) };
}

// From a touchdown at Vref on the centreline, crabbed 5° into the wind (Kid and Learner keep the
// crab to the runway, 0100), idle, brakes from 2 s, hands off, to a stop.
function assistedRollout(spec, level, metarKts) {
  const b = makeBody(spec, { flaps: 2 });
  const v = spec.vrefKts * KTS_TO_MPS;
  b.quat.setFromEuler(_e.set(0, -5 * DEG_TO_RAD, 0));
  b.vel.set(0, 0, -v);
  b.apMaster = false;
  const st = createAssistState(), s = {};
  let maxOffM = 0;
  fly(b, spec, 120, (x, dt) => {
    gameCrosswind(x, metarKts);
    x.throttle = 0;
    x.brakesOn = x.t > 2;
    assisted(level, spec, st, s, x, dt);
    maxOffM = Math.max(maxOffM, Math.abs(x.pos.x));
  }, (x) => (x.t > 3 && Math.hypot(x.vel.x, x.vel.z) < 0.5) || Math.abs(x.pos.x) > 60);
  return { maxOffM, stopped: Math.hypot(b.vel.x, b.vel.z) < 0.5, hdgDeg: noseRightDeg(b) };
}

// Pilot: the raw airplane, pedals neutral, wings level with the ailerons, full power to Vr.
function pedalsNeutralRoll(spec, metarKts) {
  const b = makeBody(spec, { throttle: 1, flaps: flaps(spec) });
  let maxHdgDeg = 0;
  fly(b, spec, 120, (x) => {
    gameCrosswind(x, metarKts);
    x.rudderInput = 0;
    x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z) / 0.6;
    maxHdgDeg = Math.max(maxHdgDeg, Math.abs(noseRightDeg(x)));
  }, (x) => x.iasKts >= spec.vrKts);
  return { maxHdgDeg, offM: b.pos.x, iasKts: b.iasKts };
}

// Pilot on a phone (0106): no pedals, the stick's sideways push is the tiller to 40 kt and the
// centreline hold steers from there to Vr (main.js through input.js touchGroundRudder), the
// ailerons get the rest of the stick. Thumb off the stick sideways, full power, rotate at Vr.
function touchPilotTakeoff(spec, metarKts) {
  const b = makeBody(spec, { throttle: 1, flaps: flaps(spec) });
  let maxOffM = 0, liftoff = false;
  fly(b, spec, 120, (x, dt) => {
    gameCrosswind(x, metarKts);
    if (!x.onGround) liftoff = true;
    const gs = Math.hypot(x.vel.x, x.vel.z), g = spec.gear;
    const steer = gs * Math.tan(g.steerDeg * DEG_TO_RAD) / (g.noseZ + g.mainZ) * RAD_TO_DEG;
    const hold = groundSteerRudder(0, noseRightDeg(x), x.pos.x, x.vel.x, steer);
    const yaw = x.onGround ? touchGroundRudder(0, gs, g.noseZ + g.mainZ, g.steerDeg, hold) : 0;
    const k = Math.min(1, dt * 10);
    x.rudderInput += (yaw - x.rudderInput) * k;
    x.aileronInput += ((x.onGround ? 1 - tillerShare(gs) : 1) * aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z) / 0.6 - x.aileronInput) * k;
    x.elevInput = !liftoff && x.iasKts >= spec.vrKts ? -1 : 0;
    if (!liftoff) maxOffM = Math.max(maxOffM, Math.abs(x.pos.x));
  }, (x) => (x.pos.y - x.groundY - spec.gearHeight) * M_TO_FT > 50 || Math.abs(x.pos.x) > 60);
  return { maxOffM, liftoff };
}

describe('Pilot on a phone keeps the runway in a METAR crosswind (ticket 0106)', () => {
  for (const [name, spec] of [['C172', c172], ['737', b738]]) {
    for (const kts of [10, 15]) {
      it(`${name}: a ${kts} kt crosswind takeoff roll stays within half a 150 ft runway's half-width, no pedals`, () => {
        const r = touchPilotTakeoff(spec, kts);
        console.log(`[0106 ${name} touch pilot] ${kts} kt crosswind takeoff: ${r.maxOffM.toFixed(1)} m off the centreline`);
        expect(r.liftoff).toBe(true);
        expect(r.maxOffM).toBeLessThan(11.4);
      });
    }
  }
});

describe('on the runway in a crosswind (ticket 0110)', () => {
  for (const [name, spec] of [['C172', c172], ['737', b738]]) {
    for (const level of ['kid', 'learner']) {
      it(`${name} ${level}: takes off hands off the pedals in a 10 kt METAR crosswind within half the runway's half-width`, () => {
        const r = assistedTakeoff(spec, level, 10);
        console.log(`[0110 ${name} ${level}] 10 kt crosswind takeoff: ${r.maxOffM.toFixed(1)} m off the centreline, 50 ft at ${r.t.toFixed(1)} s`);
        expect(r.liftoff).toBe(true);
        expect(r.maxOffM).toBeLessThan(11.4);
      });
      it(`${name} ${level}: rolls out from a crabbed touchdown in a 10 kt METAR crosswind to a stop within half the runway's half-width`, () => {
        const r = assistedRollout(spec, level, 10);
        console.log(`[0110 ${name} ${level}] 10 kt crosswind rollout: ${r.maxOffM.toFixed(1)} m off the centreline, stopped heading ${r.hdgDeg.toFixed(1)}°`);
        expect(r.stopped).toBe(true);
        expect(r.maxOffM).toBeLessThan(11.4);
        expect(Math.abs(r.hdgDeg)).toBeLessThan(3);
      });
    }
    it(`${name} learner: no rudder slam at lift-off or on a skip after a crabbed touchdown (15 kt METAR crosswind)`, () => {
      const up = liftoffYaw(spec, 15), skip = skipYaw(spec, 15);
      console.log(`[0110 ${name} learner] 15 kt: yaw after lift-off ≤ ${up.maxYawDegS.toFixed(1)}°/s; crabbed touchdown + skip ≤ ${skip.maxYawDegS.toFixed(1)}°/s, ends ${skip.hdgDeg.toFixed(1)}°`);
      expect(up.lifted).toBe(true);
      expect(up.maxYawDegS).toBeLessThan(6);
      expect(skip.maxYawDegS).toBeLessThan(10);
      expect(Math.abs(skip.hdgDeg)).toBeLessThan(15);
    });
    it(`${name} Pilot, pedals neutral: a 5 kt METAR crosswind turns the nose less than 3° on the roll to Vr`, () => {
      const r = pedalsNeutralRoll(spec, 5);
      console.log(`[0110 ${name} pilot] 5 kt crosswind, pedals neutral: heading ±${r.maxHdgDeg.toFixed(1)}°, ${r.offM.toFixed(1)} m off at ${r.iasKts.toFixed(0)} KIAS`);
      expect(r.iasKts).toBeGreaterThanOrEqual(spec.vrKts);
      expect(r.maxHdgDeg).toBeLessThan(3);
      // and the wheels stay on a 150 ft runway (the drift is the tyres' side slip: the hold is not rigid)
      expect(Math.abs(r.offM) + spec.gear.trackM / 2).toBeLessThan(22.9);
      // Not glued to the line either: the wind is felt (the nose turns into it, the airplane drifts).
      expect(r.maxHdgDeg).toBeGreaterThan(0.2);
    });
  }
});
