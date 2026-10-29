// Landing gear as wheels on oleo struts: a nose gear and two main gears at their real
// positions, each a spring-damper with its own share of the weight. Pure (three.js math
// only): flightModel.js calls it in every sub-step while any wheel can reach the ground.
//
// What it gives over one contact point under the centre of gravity: the mains touch first
// and the nose comes down on its own (the weight sits ahead of the mains) unless the pilot
// holds it off; the aircraft rotates about the main wheels on takeoff; a wing-low touchdown
// lands on one main and rolls level; struts compress and rebound. The pedals steer the
// nose wheel while it carries weight. The tyres' friction acts at each axle, below the CG,
// so braking pitches the nose down onto its wheel; the brakes are on the mains only (toe
// brakes on the C172, the 737's and F-16's main-wheel brakes; no nose-wheel brakes).
//
// spec.gear: { noseZ (m ahead of the CG, positive), mainZ (m aft), trackM (between the
// mains), strokeM (static compression of the struts), zeta (damping ratio),
// steerDeg (pedal nose-wheel steering) }. The wheels hang so that standing still, level,
// the CG sits spec.gearHeight above the ground (spawns and tests rely on it).
// spec.inertia: { pitch, roll, yaw } kg·m² for the gear's moments.
import { Vector3, Quaternion } from 'three';
import { GRAVITY } from './constants.js';
import { brakeMu, ROLLING_MU } from './systems.js';

const _r = new Vector3();
const _w = new Vector3();
const _f = new Vector3();
const _m = new Vector3();
const _omega = new Vector3();
const _qi = new Quaternion();
export const REBOUND = 3; // rebound damping over compression damping
const BUMP_STOP = 10; // a bottomed strut's stiffness over its spring's

// Per-wheel static load share and spring/damper constants, cached per spec.
const cache = new WeakMap();
export function gearConstants(spec) {
  let c = cache.get(spec);
  if (c) return c;
  const g = spec.gear;
  const wheelbase = g.noseZ + g.mainZ;
  const noseShare = g.mainZ / wheelbase;              // moments about the CG
  const loads = [noseShare, (1 - noseShare) / 2, (1 - noseShare) / 2].map((s) => s * spec.massKg * GRAVITY);
  const masses = loads.map((l) => l / GRAVITY);
  const k = loads.map((l) => l / g.strokeM);
  const d = k.map((ki, i) => 2 * (g.zeta ?? 0.6) * Math.sqrt(ki * masses[i]));
  // Body-frame axle positions (x right, y up, z aft): hung so the static strut is strokeM in.
  const y = -(spec.gearHeight + g.strokeM);
  const wheels = [
    new Vector3(0, y, -g.noseZ),
    new Vector3(-g.trackM / 2, y, g.mainZ),
    new Vector3(g.trackM / 2, y, g.mainZ),
  ];
  c = { wheelbase, noseShare, k, d, wheels, maxStroke: g.strokeM * 2.5 };
  cache.set(spec, c);
  return c;
}

// Sums the struts' forces into `force` (world, N) and their moments about the CG into
// `moment` (body axes, N·m), for a body whose ground is at groundY. Writes body.wheelLoads
// [nose, left, right] (N) and returns the total normal force.
export function gearForces(body, spec, force, moment) {
  const c = gearConstants(spec);
  _omega.copy(body.angVel).applyQuaternion(body.quat); // body rates → world
  _qi.copy(body.quat).invert();
  let total = 0;
  body.mainPitchMomentNm = 0; // the mains' nose-down moment (N·m), for the tail to work against
  const loads = body.wheelLoads || (body.wheelLoads = [0, 0, 0]);
  for (let i = 0; i < 3; i++) {
    _r.copy(c.wheels[i]).applyQuaternion(body.quat);  // CG → axle, world
    const wy = body.pos.y + _r.y;
    const comp = body.groundY - wy;                   // how far the strut is pushed in
    if (comp <= 0) { loads[i] = 0; continue; }
    // Axle velocity: the body's plus the rotation's.
    _w.copy(_omega).cross(_r).add(body.vel);
    // Oleos damp the rebound (extending, axle rising) harder than the compression: the
    // struts settle instead of springing the airframe off the runway.
    const damp = c.d[i] * (_w.y > 0 ? REBOUND : 1);
    // Past its full stroke a strut is bottomed: a stiff stop (10× the spring), not slack,
    // so hard braking can't fold the nose down onto the pitch floor (0082).
    const n = Math.max(0, c.k[i] * (Math.min(comp, c.maxStroke) + BUMP_STOP * Math.max(0, comp - c.maxStroke)) - damp * _w.y);
    loads[i] = n;
    total += n;
    force.y += n;
    // Moment of an upward force at the axle, into body axes.
    _f.set(0, n, 0);
    _m.copy(_r).cross(_f).applyQuaternion(_qi);
    moment.add(_m);
    if (i > 0) body.mainPitchMomentNm -= _m.x;
  }
  return total;
}

// The tyres' friction along the ground track, per wheel at its axle: rolling μ on every
// wheel, the brakes (systems.js brakeMu) on the mains only. Adds the force (world, N) to
// `force` and its moment about the CG (body axes) to `moment`: below the CG, braking pitches
// the nose down. `fwd` is the horizontal unit vector along the nose, `vAlong` the
// groundspeed along it (m/s). Needs body.wheelLoads from gearForces this sub-step.
export function gearFriction(body, spec, fwd, vAlong, force, moment) {
  const loads = body.wheelLoads;
  const braked = brakeMu(spec, body.brakePress ?? 0);
  if (Math.abs(vAlong) <= 0.3) {
    // Nearly stopped: static friction (no moment). The tyres hold whatever pushes along the
    // nose (the METAR wind on a parked airplane, idle thrust: 0106) up to their grip, the
    // brakes' on the mains and rolling resistance on the nose, and damp the speed left. A
    // damper alone let any steady push creep it (a 737 at idle on its brakes, ~7 cm/s).
    const grip = ROLLING_MU * Math.max(0, loads[0]) + braked * (Math.max(0, loads[1]) + Math.max(0, loads[2]));
    const push = force.x * fwd.x + force.z * fwd.z;
    const f = Math.max(-grip, Math.min(grip, -push - vAlong * spec.massKg * 2));
    force.x += fwd.x * f;
    force.z += fwd.z * f;
    return;
  }
  const c = gearConstants(spec);
  _qi.copy(body.quat).invert();
  const s = -Math.sign(vAlong);
  for (let i = 0; i < 3; i++) {
    if (!(loads[i] > 0)) continue;
    const f = s * (i === 0 ? ROLLING_MU : braked) * loads[i];
    _f.set(fwd.x * f, 0, fwd.z * f);
    force.x += _f.x;
    force.z += _f.z;
    _r.copy(c.wheels[i]).applyQuaternion(body.quat);
    _m.copy(_r).cross(_f).applyQuaternion(_qi);
    moment.add(_m);
  }
}

// Pedal steering of the nose wheel: the yaw rate a wheel turned by the pedals makes at this
// groundspeed (rad/s, body y: + = nose left), while it carries weight; null when it doesn't.
export function noseSteerYawRate(body, spec, alongMps) {
  const c = gearConstants(spec);
  if (!(body.wheelLoads?.[0] > 0)) return null;
  const delta = -(body.rudderInput ?? 0) * (spec.gear.steerDeg ?? 7) * Math.PI / 180; // rudder + = yaw right
  return alongMps * Math.tan(delta) / c.wheelbase;
}

// The loaded nose tyre holding the yaw rate the pedals steer (ticket 0110): the change in yaw
// rate (rad/s) it makes this sub-step towards `errRate` (steered rate − current). Its pull
// follows the nose wheel's load (NOSE_HOLD_PER_S at the static share, letting go as the elevator
// or the lift unloads it at rotation), never more than its side grip can turn the airframe
// (NOSE_SIDE_MU · load about the mains, through spec.inertia.yaw).
export const NOSE_HOLD_PER_S = 30;
export const NOSE_SIDE_MU = 0.5;
export function noseWheelYawHold(body, spec, errRate, dt) {
  const c = gearConstants(spec);
  const load = Math.max(0, body.wheelLoads[0]);
  const share = load / (c.noseShare * spec.massKg * GRAVITY);
  const cap = (NOSE_SIDE_MU * load * c.wheelbase / spec.inertia.yaw) * dt;
  const d = errRate * Math.min(1, dt * NOSE_HOLD_PER_S * Math.min(1, share));
  return Math.max(-cap, Math.min(cap, d));
}

// The tail against the mains (rad/s², body x: + = nose up). The flight model's elevator is a
// pitch-rate command tuned in the air, where most of a real tail's power goes into balancing
// the static stability (flightModel.js models it softly about the trim α, 0090). On the ground that power works against
// the weight on the main wheels: full elevator cancels the mains' moment at and above
// 0.8 Vr, less as q falls with the square of the speed (so the nose can't be lifted at taxi
// speeds, and it comes down by itself after touchdown with the stick neutral).
export function tailVsMainsAccel(body, spec, iasKts) {
  const m = body.mainPitchMomentNm ?? 0;
  if (!(m > 0)) return 0;
  const cap = Math.min(1, (iasKts / (0.8 * (spec.vrKts ?? spec.vrefKts))) ** 2);
  return (-(body.elevInput ?? 0) * cap * m) / spec.inertia.pitch;
}
