// Headless flight-test harness: flies src/flightModel.js with simple, deterministic
// "test pilot" control loops (no DOM, no scene) so test cards can compare the model with
// published performance data. Ground is flat at y = 0; altitude is sim height in metres.
import { Vector3, Quaternion, Euler } from 'three';
import { stepFlightModel } from '../../src/flightModel.js';
import { trimAoaDeg, elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { KTS_TO_MPS, RAD_TO_DEG, DEG_TO_RAD, M_TO_FT } from '../../src/constants.js';
import { airAt, tasFromIas } from '../../src/atmosphere.js';

export const DT = 1 / 120;
const _e = new Euler(0, 0, 0, 'YXZ');

// The flight model under test: null flies flightModel.js; useFdm(jsbsim) flies JSBSim
// (src/fdm/jsbsim.js, loaded in Node by jsbsimNode.js) through the same cards.
let fdm = null;
export const useFdm = (f) => { fdm = f; };

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
export function shortFieldTakeoff(spec, isaDevC = 0, clearFt = 0) {
  const b = makeBody(spec, { throttle: 1, flaps: 1 });
  b.isaDevC = isaDevC;
  let rollFt = null, liftoffKts = null, rotateKts = null, maxPitchRateDegS = 0, maxHeadingDevDeg = 0;
  const climb = speedHoldPilot(() => 56);
  fly(b, spec, 120, (x, dt) => {
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

// Accelerated stall: a coordinated level turn at `bankDeg`, the throttle flown so the
// speed bleeds at 1 kt/s from `fromKts` (after a hold that settles the turn), until the
// wing passes `stallAoa` (the same break as the wings-level stall cards). In a steep turn
// a pitch-attitude hold is the wrong variable (the nose pitches up steadily at
// g·sin(bank)·tan(bank)/V), so this pilot flies angle of attack: the AoA that makes
// n = 1/cos(bank) g at this speed (trimAoaDeg at V/√n), corrected by the altitude error.
// Returns the IAS at the break and, over the last 3 s before it, the load factor, bank,
// altitude error and bleed rate actually flown.
export function stallInTurn(spec, bankDeg, stallAoa, { fromKts = 90, flaps = 0, altM = 1500 } = {}) {
  const b = makeBody(spec, { kts: fromKts, altM, flaps, throttle: 0.6 });
  const alt0 = b.pos.y;
  const rollInS = bankDeg / 10, holdS = 15;
  let kts = null, prevVy = 0, bankInt = 0, elevTrim = 0, thrInt = 0.6;
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
    thrInt = Math.max(0, Math.min(1, thrInt + (target - ias) * 0.05 * dt));
    x.throttle = Math.max(0, Math.min(1, thrInt + (target - ias) * 0.15));
    // Load factor = lift / weight ≈ (vertical accel + g) / cos(bank) in a coordinated turn.
    const ay = (x.vel.y - prevVy) / dt;
    prevVy = x.vel.y;
    recent.push({ t: x.t, ias, n: (ay + 9.80665) / (9.80665 * Math.cos(phi)), bank: bankRightDeg, altErr: -altErr });
    while (recent.length && recent[0].t < x.t - 3) recent.shift();
  }, (x) => {
    if (x.aoaDeg > stallAoa) { kts = x.iasKts; return true; }
    return false;
  });
  const avg = (k) => recent.reduce((s, r) => s + r[k], 0) / recent.length;
  const first = recent[0], last = recent[recent.length - 1];
  return { kts, n: avg('n'), bankDeg: avg('bank'), altErrM: avg('altErr'), bleedKtsS: (first.ias - last.ias) / (last.t - first.t), t: b.t };
}
