// Headless flight-test harness: flies src/flightModel.js with simple, deterministic
// "test pilot" control loops (no DOM, no scene) so test cards can compare the model with
// published performance data. Ground is flat at y = 0; altitude is sim height in metres.
import { Vector3, Quaternion, Euler } from 'three';
import { stepFlightModel } from '../../src/flightModel.js';
import { trimAoaDeg, elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { KTS_TO_MPS, RAD_TO_DEG, DEG_TO_RAD, M_TO_FT } from '../../src/constants.js';

export const DT = 1 / 120;
const _e = new Euler(0, 0, 0, 'YXZ');

// A body heading north, in trim at `kts` (air) when airborne, or parked on the runway.
export function makeBody(spec, { kts = 0, altM = 0, flaps = 0, gearDown = true, throttle = 0 } = {}) {
  const onGround = altM <= 0;
  const body = {
    pos: new Vector3(0, onGround ? spec.gearHeight : altM, 0),
    vel: new Vector3(0, 0, -kts * KTS_TO_MPS),
    quat: new Quaternion(),
    angVel: new Vector3(),
    elevInput: 0, aileronInput: 0, rudderInput: 0, throttle,
    flapsIndex: flaps, gearDown, brakesOn: false, apMaster: true,
    windVec: new Vector3(), groundY: 0, onGround,
    pitchCmd: 0, t: 0, distM: 0,
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
    stepFlightModel(body, spec, DT);
    body.distM += Math.hypot(body.pos.x - x0, body.pos.z - z0);
    body.t += DT;
    if (until?.(body)) break;
  }
  return body;
}

// Test pilot: wings level, pitch flown to hold `targetKts()` (slow integrator, like a
// pilot trimming for a speed). `targetKts` may change over time (a deceleration).
export function speedHoldPilot(targetKts) {
  return (body, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(body);
    const err = (body.iasKts ?? 0) - targetKts(body);
    body.pitchCmd = Math.max(-15, Math.min(25, body.pitchCmd + err * 0.6 * dt));
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
