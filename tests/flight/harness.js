// Headless flight-test harness: flies src/flightModel.js with simple, deterministic
// "test pilot" control loops (no DOM, no scene) so test cards can compare the model with
// published performance data. Ground is flat at y = 0; altitude is sim height in metres.
import { Vector3, Quaternion, Euler } from 'three';
import { stepFlightModel } from '../../src/flightModel.js';
import { trimAoaDeg, elevatorForPitch, aileronForBank, flareSinkMps } from '../../src/autopilot.js';
import { KTS_TO_MPS, RAD_TO_DEG, DEG_TO_RAD, M_TO_FT } from '../../src/constants.js';
import { airAt, tasFromIas } from '../../src/atmosphere.js';
import { stallAoaDeg } from '../../src/aero.js';
import { surfaceWindFactor } from '../../src/weather.js';

export const DT = 1 / 120;
const _e = new Euler(0, 0, 0, 'YXZ');
const RUDDER_PER_BETA = 0.3;

// The flight model under test: null flies flightModel.js; useFdm(jsbsim) flies JSBSim
// (src/fdm/jsbsim.js, loaded in Node by jsbsimNode.js) through the same cards.
let fdm = null;
export const useFdm = (f) => { fdm = f; };
// Whether the nose wheel carries weight: gear.js's strut load, or JSBSim's weight-on-wheels.
export const noseWheelOn = (body) => (fdm ? fdm.get('gear/unit[0]/WOW') > 0 : body.wheelLoads?.[0] > 0);

// A body heading north, in trim at `kts` indicated when airborne, or parked on the runway.
export function makeBody(spec, { kts = 0, altM = 0, flaps = 0, gearDown = true, throttle = 0 } = {}) {
  const onGround = altM <= 0;
  const body = {
    pos: new Vector3(0, onGround ? spec.gearHeight : altM, 0),
    vel: new Vector3(0, 0, -tasFromIas(kts * KTS_TO_MPS, airAt(Math.max(0, altM)).sigma)),
    quat: new Quaternion(),
    angVel: new Vector3(),
    elevInput: 0, aileronInput: 0, rudderInput: 0, throttle, engineN: throttle,
    flapsIndex: flaps, gearDown, brakesOn: false, apMaster: true,
    windVec: new Vector3(), groundY: 0, onGround,
    pitchCmd: 0, t: 0, distM: 0,
    // The test pilots trim as they fly (flightModel.js autoTrim: the trim follows the angle of
    // attack, so the static stability term is zero and the elevator is all theirs); a
    // stick-fixed card sets autoTrim false and flies with the trim where it was (ticket 0090).
    autoTrim: true,
    // In trim at `kts` from the first call: a pilot that read 0 kt here yanked the stick.
    iasKts: onGround ? 0 : kts,
  };
  if (!onGround && kts > 0) {
    const aoa = trimAoaDeg(spec, kts * KTS_TO_MPS, flaps);
    body.quat.setFromEuler(_e.set(aoa * DEG_TO_RAD, 0, 0));
    body.pitchCmd = aoa;
  }
  return body;
}

export function attitude(body) {
  _e.setFromQuaternion(body.quat, 'YXZ');
  return { pitchDeg: _e.x * RAD_TO_DEG, bankRightDeg: -_e.z * RAD_TO_DEG };
}

export const vsFpm = (body) => body.vel.y * M_TO_FT * 60;

// Advance `seconds`, calling pilot(body, dt) before each sub-step. Stops early when
// until(body) is true. Returns the body.
export function fly(body, spec, seconds, pilot, until) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    pilot?.(body, DT);
    const x0 = body.pos.x, z0 = body.pos.z;
    if (fdm) fdm.step(body, spec, DT);
    else stepFlightModel(body, spec, DT);
    body.distM += Math.hypot(body.pos.x - x0, body.pos.z - z0);
    body.t += DT;
    if (until?.(body)) break;
  }
  return body;
}

// Test pilot: wings level, pitch flown to hold `targetKts()` like a pilot trimming for a
// speed: proportional on the speed error, damped by the speed trend (which kills the
// phugoid an integral-only pilot excites), with a slow integral for the trim pitch.
// `targetKts` may change over time (a deceleration).
export function speedHoldPilot(targetKts) {
  let lastIas = null, lastTarget = null, trend = 0;
  return (body, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(body);
    const ias = body.iasKts ?? 0;
    const target = targetKts(body);
    // Trend relative to the target's own trend, so a commanded deceleration isn't fought.
    if (lastIas !== null) trend += ((ias - lastIas - (target - lastTarget)) / dt - trend) * Math.min(1, dt * 4);
    lastIas = ias;
    lastTarget = target;
    const err = ias - target;
    body.pitchTrim = (body.pitchTrim ?? body.pitchCmd) + err * 0.08 * dt;
    body.pitchCmd = Math.max(-15, Math.min(25, body.pitchTrim + err * 0.6 + trend * 2.5));
    body.elevInput = elevatorForPitch(body.pitchCmd, pitchDeg, body.angVel.x);
    body.aileronInput = aileronForBank(0, bankRightDeg, -body.angVel.z);
  };
}

// Average of f(body) over the last `seconds` of a run (after it has settled).
export function settle(body, spec, seconds, pilot, f, settleS = 40) {
  fly(body, spec, settleS, pilot);
  let sum = 0, n = 0;
  fly(body, spec, seconds, (b, dt) => { pilot(b, dt); sum += f(b); n++; });
  return sum / n;
}

// POH short-field takeoff: flaps 10, full power, rotate at 45 KIAS to a nose-high 11°
// (lift-off near 51 KIAS). Ground roll ends when the wheels leave. `isaDevC`: hot day.
// With `clearFt` the run goes on to clear an obstacle that high: the POH's 56 KIAS climb
// (Fig. 5-5 "Speed at 50 Ft") until the wheels are `clearFt` above the runway. It also
// reports what the pilot actually flew: IAS at rotation, peak pitch rate, worst heading.
// `windKts`: a wind straight down the runway (+ = headwind, − = tailwind), set where the
// METAR's goes (body.windVec, the air mass's velocity). `metarKts`: the game's wind instead, a
// METAR's 10 m wind down the runway thinned to the CG's height as main.js does (ticket 0106).
export function shortFieldTakeoff(spec, isaDevC = 0, clearFt = 0, { windKts = 0, metarKts = null } = {}) {
  const b = makeBody(spec, { throttle: 1, flaps: 1 });
  b.isaDevC = isaDevC;
  b.windVec.copy(runwayWind(windKts));
  const gameWind = (x) => {
    if (metarKts !== null) x.windVec.set(0, 0, metarKts * KTS_TO_MPS * surfaceWindFactor(x.pos.y - x.groundY));
  };
  let rollFt = null, liftoffKts = null, rotateKts = null, maxPitchRateDegS = 0, maxHeadingDevDeg = 0;
  const climb = speedHoldPilot(() => 56);
  fly(b, spec, 120, (x, dt) => {
    gameWind(x);
    _e.setFromQuaternion(x.quat, 'YXZ');
    const yawLeftDeg = _e.y * RAD_TO_DEG;
    maxHeadingDevDeg = Math.max(maxHeadingDevDeg, Math.abs(yawLeftDeg));
    // Rudder (and nose-wheel steering) holds the runway heading against the propeller's
    // left-turning tendency, as a pilot's right foot does. Rudder + = yaw right.
    x.rudderInput = Math.max(-1, Math.min(1, yawLeftDeg * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15));
    if (rollFt === null) {
      if (x.iasKts >= 45) {
        rotateKts ??= x.iasKts;
        maxPitchRateDegS = Math.max(maxPitchRateDegS, x.angVel.x * RAD_TO_DEG);
        x.elevInput = elevatorForPitch(11, attitude(x).pitchDeg, x.angVel.x);
      }
    } else {
      // Take over from the attitude the rotation left, not from the spawn's 0°.
      x.pitchCmd ??= attitude(x).pitchDeg;
      climb(x, dt);
    }
  }, (x) => {
    if (rollFt === null && x.t > 2 && !x.onGround) {
      rollFt = x.distM * M_TO_FT;
      liftoffKts = x.iasKts;
      b.pitchCmd = null;
      if (!clearFt) return true;
    }
    return rollFt !== null && (x.pos.y - x.groundY - spec.gearHeight) * M_TO_FT >= clearFt;
  });
  return {
    rollFt, liftoffKts, rotateKts, maxPitchRateDegS, maxHeadingDevDeg,
    totalFt: b.distM * M_TO_FT, clearKts: b.iasKts,
  };
}

// Accelerated stall: a level, coordinated turn at `bankDeg`, the throttle flown so the
// speed bleeds at 1 kt/s from `fromKts` (after a hold that settles the turn), until the
// wing passes `stallAoa` (the same break as the wings-level stall cards). In a steep turn
// a pitch-attitude hold is the wrong variable (the nose pitches up steadily at
// g·sin(bank)·tan(bank)/V), so this pilot flies angle of attack: the AoA that makes
// n = 1/cos(bank) g at this speed (trimAoaDeg at V/√n), corrected by the altitude error.
// Rudder holds the sideslip near zero (uncoordinated, the lift vector tilts less than the
// wings and the turn pulls ~1.8 g at 60°, not 2). Returns the IAS at the break and, over
// the last 3 s before it, the true load factor (non-gravity acceleration perpendicular to
// the flight path, / g), bank, sideslip, altitude error and bleed rate actually flown.
export function stallInTurn(spec, bankDeg, stallAoa, { fromKts = 90, flaps = 0, altM = 1500 } = {}) {
  const b = makeBody(spec, { kts: fromKts, altM, flaps, throttle: 0.6 });
  const alt0 = b.pos.y;
  const rollInS = bankDeg / 10, holdS = 15;
  let kts = null, bankInt = 0, elevTrim = 0, thrInt = 0.6, rudInt = 0;
  const prevVel = b.vel.clone(), f = new Vector3(), vHat = new Vector3();
  const recent = [];
  fly(b, spec, 120, (x, dt) => {
    const bank = Math.min(bankDeg, x.t * 10);
    const target = x.t < rollInS + holdS ? fromKts : fromKts - (x.t - rollInS - holdS);
    const { bankRightDeg } = attitude(x);
    const phi = bankRightDeg * DEG_TO_RAD;
    const n = 1 / Math.max(0.2, Math.cos(phi));
    const ias = x.iasKts ?? target;
    const altErr = alt0 - x.pos.y;
    const aoaCmd = trimAoaDeg(spec, (ias * KTS_TO_MPS) / Math.sqrt(n), flaps)
      + altErr * 0.15 - x.vel.y * 1.5;
    // Pitch rate damped about the turn's own steady rate. Elevator + = nose down.
    const qTurn = (9.80665 * Math.sin(phi) * Math.tan(phi)) / Math.max(20, x.vel.length());
    // An integral holds the elevator a tail needs at that AoA (a P-only law sat 3° short).
    const aoaErr = (x.aoaDeg ?? aoaCmd) - aoaCmd;
    elevTrim = Math.max(-1, Math.min(1, elevTrim + aoaErr * 0.15 * dt));
    x.elevInput = Math.max(-1, Math.min(1, elevTrim + aoaErr * 0.22 + (x.angVel.x - qTurn) * 4.5));
    // A slow integral trims out the steady bank error the proportional law leaves at high AoA.
    if (x.t > rollInS) bankInt = Math.max(-10, Math.min(10, bankInt + (bank - bankRightDeg) * 0.5 * dt));
    x.aileronInput = aileronForBank(bank + bankInt, bankRightDeg, -x.angVel.z);
    // Ball in the middle: rudder on sideslip, with an integral for the steady part.
    const beta = x.betaDeg ?? 0;
    rudInt = Math.max(-1, Math.min(1, rudInt + beta * RUDDER_PER_BETA * 0.5 * dt));
    x.rudderInput = Math.max(-1, Math.min(1, rudInt + beta * RUDDER_PER_BETA));
    thrInt = Math.max(0, Math.min(1, thrInt + (target - ias) * 0.05 * dt));
    x.throttle = Math.max(0, Math.min(1, thrInt + (target - ias) * 0.15));
    // Specific force (what the wing, tail and engine push with) = dv/dt + g up; its part
    // across the flight path over g is the load factor the wing is holding.
    f.subVectors(x.vel, prevVel).divideScalar(dt);
    f.y += 9.80665;
    prevVel.copy(x.vel);
    vHat.copy(x.vel).normalize();
    f.addScaledVector(vHat, -f.dot(vHat));
    recent.push({ t: x.t, ias, n: f.length() / 9.80665, bank: bankRightDeg, beta, altErr: -altErr });
    while (recent.length && recent[0].t < x.t - 3) recent.shift();
  }, (x) => {
    if (x.aoaDeg > stallAoa) { kts = x.iasKts; return true; }
    return false;
  });
  const avg = (k) => recent.reduce((s, r) => s + r[k], 0) / recent.length;
  const first = recent[0], last = recent[recent.length - 1];
  return {
    kts, n: avg('n'), bankDeg: avg('bank'), betaDeg: avg('beta'), altErrM: avg('altErr'),
    bleedKtsS: (first.ias - last.ias) / (last.t - first.t), t: b.t,
  };
}

// Wind along the runway (ticket 0103). The runway runs north (−Z), so a headwind of `kts`
// is an air mass moving south (+Z) and a tailwind (kts < 0) one moving north.
export const runwayWind = (kts) => new Vector3(0, 0, kts * KTS_TO_MPS);

// Crosswind (ticket 0069). The runway runs north along x = 0 (the body's spawn heading), so
// a wind from the right (090°) is an air mass moving west at `xwKts`. Distances across it
// are feet from the centreline; + = right (east, the upwind side).
const xwind = (xwKts) => new Vector3(-xwKts * KTS_TO_MPS, 0, 0);
const yawLeftDegOf = (body) => { _e.setFromQuaternion(body.quat, 'YXZ'); return _e.y * RAD_TO_DEG; };

// Crosswind takeoff, the C172S POH's crosswind technique (Section 4, amplified procedures:
// minimum flaps, ailerons into the wind, a speed slightly higher than normal, then lift off
// cleanly): flaps up, full power, the nose wheel lifted at 55 KIAS (normal takeoff) to 9°.
// The pedals (rudder and nose-wheel steering) hold the runway heading and steer back to the
// centreline; the ailerons hold the wings level, which in a crosswind means into the wind on
// a model with a dihedral effect. Up to lift-off it reports the widest the wheels strayed
// from the centreline, the most rudder, the average rudder over the whole roll and over its
// second half (the steady pedal, past the low-speed steering), the average aileron, the
// worst heading and the most bank on the wheels. `pedals: false` keeps the feet flat (the
// control that shows the wind is felt).
export function crosswindTakeoff(spec, xwKts, { pedals = true, rotateKts = 55, pitchDeg = 9 } = {}) {
  const b = makeBody(spec, { throttle: 1, flaps: 0 });
  b.windVec.copy(xwind(xwKts));
  let liftoffKts = null, maxOffFt = 0, maxRudder = 0, maxHeadingDevDeg = 0, maxBankDeg = 0;
  const roll = [];
  fly(b, spec, 90, (x) => {
    const yawLeft = yawLeftDegOf(x);
    const offFt = x.pos.x * M_TO_FT;
    // Right of the centreline → nose a little left (up to 3°), back towards it.
    const want = Math.max(-3, Math.min(3, offFt * 0.15 + x.vel.x * M_TO_FT * 0.3));
    x.rudderInput = pedals ? Math.max(-1, Math.min(1, (yawLeft - want) * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15)) : 0;
    const { bankRightDeg, pitchDeg: p } = attitude(x);
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z) / 0.6; // full throw, not the AP's ±0.6
    if (x.iasKts >= rotateKts) x.elevInput = elevatorForPitch(pitchDeg, p, x.angVel.x);
    maxOffFt = Math.max(maxOffFt, Math.abs(offFt));
    maxRudder = Math.max(maxRudder, Math.abs(x.rudderInput));
    maxHeadingDevDeg = Math.max(maxHeadingDevDeg, Math.abs(yawLeft));
    if (x.onGround) maxBankDeg = Math.max(maxBankDeg, Math.abs(bankRightDeg));
    roll.push([x.rudderInput, x.aileronInput]);
  }, (x) => {
    if (x.t > 2 && !x.onGround) { liftoffKts = x.iasKts; return true; }
    return Math.abs(x.pos.x * M_TO_FT) > 300; // well off the runway: stop
  });
  const mean = (a, k) => a.reduce((s, r) => s + r[k], 0) / a.length;
  return {
    liftoffKts, maxOffFt, maxRudder, meanRudder: mean(roll, 0), steadyRudder: mean(roll.slice(roll.length >> 1), 0),
    meanAileron: mean(roll, 1), maxHeadingDevDeg, maxBankDeg, rollFt: b.distM * M_TO_FT, t: b.t,
  };
}

// Crosswind landing, wing-low (FAA-H-8083-3C ch. 9, "Crosswind Approach and Landing"), with
// the POH's minimum flaps for a strong crosswind (flaps 10, 70 KIAS): from `fromFt` on a 3°
// path to the runway threshold (z = 0) at `kts` with flaps `flaps`, pitch
// flies the speed and power the path; the rudder keeps the nose on the runway heading and
// the upwind wing goes down just enough to stop the drift and hold the centreline. Flare
// from 30 ft at idle, touch down on the upwind main. Reports the touchdown (distance from
// the centreline, sideways drift across the nose, heading, bank, sink rate), the rudder and
// bank and sideslip the slip needed on short final, and the widest the wheels strayed on the rollout
// (brakes on, the pedals still on the centreline) to a stop. `wingLow: false` keeps the
// feet flat (the ailerons still steer for the centreline, so it arrives crabbed and skating
// sideways across its nose).
export function crosswindLanding(spec, xwKts, { kts = 70, flaps = 1, fromFt = 500, wingLow = true } = {}) {
  const h0 = fromFt / M_TO_FT;
  const tan3 = Math.tan(3 * DEG_TO_RAD);
  const b = makeBody(spec, { kts, altM: h0 + spec.gearHeight, flaps, throttle: 0.3 });
  b.pos.z = h0 / tan3;
  b.vel.y = b.vel.z * tan3; // already on the path (vel.z < 0: descending as it goes north)
  b.windVec.copy(xwind(xwKts));
  const hold = speedHoldPilot(() => kts);
  let rudInt = 0, bankInt = 0, thrInt = b.throttle, flareFrom = null, td = null;
  let finalRudder = 0, finalAileron = 0, finalBank = 0, finalBeta = 0, finalN = 0, maxRollOffFt = 0;
  fly(b, spec, 240, (x, dt) => {
    const yawLeft = yawLeftDegOf(x);
    const { pitchDeg, bankRightDeg } = attitude(x);
    const wheelM = x.pos.y - x.groundY - spec.gearHeight;
    const offM = x.pos.x;
    if (td) {
      // Rollout: idle, brakes, stick back, ailerons into the wind, feet on the centreline.
      x.throttle = 0; x.brakesOn = x.t - td.t > 2; x.elevInput = -0.5;
      const want = Math.max(-3, Math.min(3, offM * M_TO_FT * 0.15 + x.vel.x * M_TO_FT * 0.3));
      x.rudderInput = Math.max(-1, Math.min(1, (yawLeft - want) * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15));
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z) / 0.6;
      maxRollOffFt = Math.max(maxRollOffFt, Math.abs(offM * M_TO_FT));
      return;
    }
    // Rudder: nose on the runway heading (an integral holds the slip's steady pedal).
    rudInt = Math.max(-1, Math.min(1, rudInt + yawLeft * 0.1 * dt));
    x.rudderInput = wingLow ? Math.max(-1, Math.min(1, rudInt + yawLeft * 0.3 + x.angVel.y * RAD_TO_DEG * 0.3)) : 0;
    // Ailerons: bank towards the centreline, an integral for the steady wing-low bank.
    bankInt = Math.max(-20, Math.min(20, bankInt - (offM * 0.05 + x.vel.x * 0.3) * dt));
    const bankCmd = Math.max(-20, Math.min(20, bankInt - offM * 0.3 - x.vel.x * 2));
    x.aileronInput = aileronForBank(bankCmd, bankRightDeg, -x.angVel.z);
    if (flareFrom === null && wheelM < 30 / M_TO_FT) flareFrom = pitchDeg;
    if (flareFrom === null) {
      hold(x, dt);
      x.aileronInput = aileronForBank(bankCmd, bankRightDeg, -x.angVel.z); // hold() levels the wings
      // Power for the path: height above the 3° line through the threshold, and its rate.
      const aboveM = x.pos.y - spec.gearHeight - x.pos.z * tan3;
      const vsErr = x.vel.y + x.vel.length() * tan3; // + = sinking slower than the path
      thrInt = Math.max(0, Math.min(1, thrInt - (aboveM * 0.01 + vsErr * 0.02) * dt));
      x.throttle = Math.max(0, Math.min(1, thrInt - aboveM * 0.02 - vsErr * 0.05));
      if (wheelM < 100 / M_TO_FT) { finalRudder += x.rudderInput; finalAileron += x.aileronInput; finalBank += bankRightDeg; finalBeta += x.betaDeg; finalN++; }
    } else {
      // Flare: idle, and a sink rate that shrinks with the height (autopilot.js flareSinkMps).
      x.throttle = 0;
      const sinkErr = x.vel.y - flareSinkMps(Math.max(0, wheelM)) * 0.5;
      x.pitchCmd = Math.max(-5, Math.min(14, (x.pitchCmd ?? pitchDeg) - sinkErr * 4 * dt));
      x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
    }
  }, (x) => {
    if (!td && x.onGround) {
      const { bankRightDeg } = attitude(x);
      const yawLeft = yawLeftDegOf(x);
      // Drift across the nose: ground velocity perpendicular to the heading (+ = rightwards).
      const h = -yawLeft * DEG_TO_RAD;
      td = {
        t: x.t, offFt: x.pos.x * M_TO_FT, headingDeg: -yawLeft, bankRightDeg,
        driftKts: (x.vel.x * Math.cos(h) + x.vel.z * Math.sin(h)) / KTS_TO_MPS,
        sinkFpm: -(x.lastAirVsi ?? 0), iasKts: x.iasKts, distFt: -x.pos.z * M_TO_FT,
      };
    }
    return td && Math.hypot(x.vel.x, x.vel.z) < 1;
  });
  return { td, maxRollOffFt, finalRudder: finalRudder / finalN, finalAileron: finalAileron / finalN, finalBankDeg: finalBank / finalN, finalBetaDeg: finalBeta / finalN, stopped: Math.hypot(b.vel.x, b.vel.z) < 1 };
}

// POH short-field landing (Section 4, Fig. 5-11): flaps 30, power off, 61 KIAS (= KCAS here,
// no instrument error) crossing a 50 ft obstacle on a 3° path, the nose lowered to keep 61
// at idle; a round-out from 20 ft (a sink that shrinks with the height, 2 s time constant)
// to a hold-off a foot above the runway, the nose coming up no further than 1° short of the
// stall angle, so it touches down on the mains near the stall. Then, as Section 4 says: lower the nose wheel, brakes on
// hard (after `brakeDelayS`, the pilot's reaction), flaps up, and once the nose wheel is down
// the control wheel full back, brought back over `backS`. The 2 s is a pilot easing the wheel
// back, and also what keeps JSBSim's nose down: snatched back at 50 kt with the flaps still
// out its tail lifts the nose (1.4° at 1 s, 1.9° and off the runway at 0.5 s; 0082).
// Returns the ground roll (first touch to a stop), the total from the obstacle, the air
// segment, and what the pilot flew: touchdown IAS and sink rate, time airborne again after
// the first touch, when the nose wheel came down, and the highest pitch and the time with
// the nose wheel off the runway after it settled (0.5 s after it touched).
export function shortFieldLanding(spec, { isaDevC = 0, brakeDelayS = 0.5, kts = 61, flaps = 3, flareFt = 20, backS = 2, windKts = 0, metarKts = null, onStep = null } = {}) {
  const tan3 = Math.tan(3 * DEG_TO_RAD);
  const b = makeBody(spec, { kts, altM: 50 / M_TO_FT + spec.gearHeight, flaps, throttle: 0 });
  b.isaDevC = isaDevC;
  b.vel.y = b.vel.z * tan3;
  // `windKts` as in shortFieldTakeoff: the body starts at `kts` through the air, so its
  // ground velocity carries the wind (a 3° path through the air; the same sink at a lower
  // groundspeed is steeper over the ground in a headwind). `metarKts`: the game's wind, as in
  // shortFieldTakeoff (the full METAR wind at 50 ft, thinned below 10 m: ticket 0106).
  b.windVec.copy(runwayWind(metarKts ?? windKts));
  b.vel.add(b.windVec);
  const approach = speedHoldPilot(() => kts);
  const aoaMax = stallAoaDeg(spec, flaps) - 1;
  const holdM = 1 / M_TO_FT;
  let td = null, flareI = null;
  fly(b, spec, 120, (x, dt) => {
    if (metarKts !== null) x.windVec.set(0, 0, metarKts * KTS_TO_MPS * surfaceWindFactor(x.pos.y - x.groundY));
    const { pitchDeg, bankRightDeg } = attitude(x);
    x.throttle = 0;
    x.rudderInput = Math.max(-1, Math.min(1, yawLeftDegOf(x) * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15));
    if (td) {
      const s = x.t - td.t;
      if (!x.onGround) td.bounceS += dt;
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z) / 0.6;
      x.brakesOn = s >= brakeDelayS;
      if (x.brakesOn) x.flapsIndex = 0;
      // POH Section 4: "Immediately after touchdown, lower the nose wheel and apply heavy
      // braking ... retract the flaps, hold the control wheel full back". The nose is lowered
      // towards the three-wheel attitude; once its wheel touches, full back, and the brakes'
      // pull below the CG keeps it on the runway (gear.js, ticket 0082).
      if (td.noseDownS === null && noseWheelOn(x)) td.noseDownS = s;
      x.elevInput = td.noseDownS !== null ? -Math.min(1, (s - td.noseDownS) / backS) : elevatorForPitch(0, pitchDeg, x.angVel.x);
      if (td.noseDownS !== null && s > td.noseDownS + 0.5) {
        td.maxPitchDeg = Math.max(td.maxPitchDeg, pitchDeg);
        if (!noseWheelOn(x)) td.noseOffS += dt;
      }
      return;
    }
    const wheelM = x.pos.y - x.groundY - spec.gearHeight;
    if (wheelM > flareFt / M_TO_FT) { approach(x, dt); return; }
    // PI on the sink error (+ = sinking too fast); the integral stops at the AoA limit.
    const sinkErr = -x.vel.y - Math.max(0.05, (wheelM - holdM) / 2);
    const aoaRoom = aoaMax - x.aoaDeg;
    flareI ??= pitchDeg;
    if (sinkErr < 0 || aoaRoom > 0) flareI += sinkErr * 3 * dt;
    x.pitchCmd = Math.max(-5, Math.min(pitchDeg + aoaRoom, flareI + sinkErr * 5));
    x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
  }, (x) => {
    if (!td && x.onGround) td = { t: x.t, distM: x.distM, kts: x.iasKts, sinkFpm: -(x.lastAirVsi ?? 0), bounceS: 0, noseDownS: null, maxPitchDeg: -90, noseOffS: 0 };
    onStep?.(x, !!td);
    return td && Math.hypot(x.vel.x, x.vel.z) < 0.3;
  });
  return {
    rollFt: (b.distM - td.distM) * M_TO_FT, totalFt: b.distM * M_TO_FT,
    tdKts: td.kts, tdSinkFpm: td.sinkFpm, bounceS: td.bounceS, stopped: Math.hypot(b.vel.x, b.vel.z) < 0.3,
    airFt: td.distM * M_TO_FT, noseDownS: td.noseDownS, rollPitchMaxDeg: td.maxPitchDeg, noseOffS: td.noseOffS,
  };
}
