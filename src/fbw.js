// The F-16's fly-by-wire g and AoA limiter (tickets 0121, 0138 for the push), a lazy chunk main.js loads right after
// boot (tests/flight/harness.js imports it): loading it gives every spec.pitchFbw airframe its
// spec.fbw, which flightModel.js calls in the air; until then the stick is the raw pitch command.
import { Vector3 } from 'three';
import { GRAVITY, RAD_TO_DEG } from './constants.js';
import { AIRCRAFT_DATABASE } from './aircraft.js';

const _x = new Vector3();
const _v = new Vector3();

// The F-16's g and AoA limiter (ticket 0121), NASA TP-1538 App. A and Fig. 63: the flight control
// system's commandable normal acceleration is 1 g + 8 g, cut by 0.322 g per degree of α from 15° to
// 20.4° and by 1.322 g/deg above, so it reaches 1 g at ~25° ("an angle-of-attack limit in 1g
// flight of approximately 25°"). Full back stick = this limit. Returns the load factor (g).
export function fbwLoadLimit(aoaDeg) {
  return 9 - 0.322 * Math.min(Math.max(aoaDeg - 15, 0), 5.4) - 1.322 * Math.max(0, aoaDeg - 20.4);
}

// The highest pitch rate (rad/s, + nose up) the limiter lets the stick command (TP-1538 App. A: the
// stick commands normal acceleration, full back the Fig. 63 limit): the flight path's own rate
// (g·(n − up_y)/V, which holds α) plus a step towards the α where the load factor n meets the
// command (n grows with α by the lift slope; Fig. 63's limit falls by its own slope), at
// FBW_ALPHA_GAIN of the pitch loop's bandwidth. `pull` (0-1, back stick) commands 1 g + 8 g × the
// pull: a straight line, the game's own choice (TP-1538 gives no stick gradient or breakout; full
// back = Fig. 63's 9 g). A released stick (pull ≤ 0) is held only to Fig. 63, so it keeps holding
// the nose where it is (0090). α and n are led by the pitch loop's lag (`lagS`) at today's α rate
// (body pitch rate `qBody` less the flight path's), so a fast pull stops at the limit, not through
// it; that lead and FBW_ALPHA_GAIN are the game's too (TP-1538's gains are not modelled).
// `nNow` is the seat's load factor from the aero forces, `upY` the lift direction's world-vertical
// part (cos γ·cos φ: gravity across the flight path; the body up axis' cos θ·cos φ overstated the
// path's rate nose-high and let a held slow pull climb to α ~38°), `qDyn` the dynamic pressure (Pa).
const FBW_ALPHA_GAIN = 1;
export function fbwPitchRateCap(spec, pull, aoaRad, nNow, upY, tasMps, qDyn, qBody, lagS) {
  const nPerRad = (spec.clAlpha * qDyn * spec.wingAreaM2) / (spec.massKg * GRAVITY);
  const pathRate = (GRAVITY * (nNow - upY)) / tasMps;
  const lead = (qBody - pathRate) * lagS;
  const aoaDeg = (aoaRad + lead) * RAD_TO_DEG;
  const nLimit = fbwLoadLimit(aoaDeg);
  const nStick = pull > 0 ? 1 + 8 * pull : Infinity;
  const limitSlope = nStick < nLimit ? 0 : (aoaDeg > 20.4 ? 1.322 : aoaDeg > 15 ? 0.322 : 0) * RAD_TO_DEG;
  const alphaGap = (Math.min(nLimit, nStick) - nNow - nPerRad * lead) / (nPerRad + limitSlope);
  return pathRate + (FBW_ALPHA_GAIN / lagS) * alphaGap;
}

// The push side (ticket 0138), NASA TP-1538 Fig. 62(b), "Schedule of negative 'g' limit with q̄": the
// lower bound of the commanded incremental normal acceleration is −1 g up to q̄ ~1.55 kN/m², falling
// linearly to −4 g at ~8.75 kN/m² and flat above (read off the figure; the feedback is aₙ − 1, the
// same increment as Fig. 63's 8 g). So full forward stick is 0 g slow and −3 g at combat speeds.
// TP-1538 gives no negative-AoA limit (the α signal into the limiter is clipped at −5°, Fig. 62(a),
// but nothing limits α below it), so this g floor is the only push limit. Returns the load factor (g).
export function fbwPushLimit(qDynPa) {
  return 1 + (-1 - 3 * Math.min(Math.max((qDynPa - 1550) / 7200, 0), 1)); // 1 g + the increment
}

// The most nose-down pitch rate (rad/s) the limiter lets the stick command: fbwPitchRateCap's
// mirror, towards the α where n meets the push's command. `push` (0-1, forward stick) commands
// 1 g down to the Fig. 62(b) floor in a straight line (the game's gradient, as for the pull); a
// released stick (push ≤ 0) is held only to the floor. A push's gradient never raises the nose past
// a released stick's hold (pitch rate 0): inverted at −1 g, a stick eased just forward of centre
// (main.js lerps it back) would otherwise command +1 g and pull the jet towards the ground (device
// panel).
export function fbwPitchRateFloor(spec, push, aoaRad, nNow, upY, tasMps, qDyn, qBody, lagS) {
  const nPerRad = (spec.clAlpha * qDyn * spec.wingAreaM2) / (spec.massKg * GRAVITY);
  const pathRate = (GRAVITY * (nNow - upY)) / tasMps;
  const lead = (qBody - pathRate) * lagS;
  const nLimit = fbwPushLimit(qDyn);
  const rateTo = (n) => pathRate + (FBW_ALPHA_GAIN / lagS) * (n - nNow - nPerRad * lead) / nPerRad;
  const atLimit = rateTo(nLimit);
  return push > 0 ? Math.min(rateTo(1 + (nLimit - 1) * Math.min(push, 1)), Math.max(0, atLimit)) : atLimit;
}

// flightModel.js's hook: the stick's pitch-rate command `qCmd` (rad/s), capped by the limiter in the
// air (above 20 m/s; on the wheels the stick is the stabilator, as before). `liftN` is the aero force
// along the body's up axis (N), so the seat's load factor is liftN / weight. Never more nose-down
// than full forward stick (the stabilator's own limit).
export function fbwPitch(body, spec, qCmd, aoaRad, liftN, tasMps, qDyn) {
  if (body.onGround || tasMps <= 20) return qCmd;
  const n = liftN / (spec.massKg * GRAVITY), upY = liftUpY(body), lagS = 120 / (spec.pitchDamping * tasMps);
  const cap = fbwPitchRateCap(spec, -body.elevInput, aoaRad, n, upY, tasMps, qDyn, body.angVel.x, lagS);
  const floor = fbwPitchRateFloor(spec, body.elevInput, aoaRad, n, upY, tasMps, qDyn, body.angVel.x, lagS);
  // The AoA limiter (the cap) wins over the push floor, as Fig. 62(a)'s α feedback acts after the
  // command limiter.
  return Math.max(-(spec.pitchAuthority ?? 1.8) / spec.pitchDamping, Math.min(Math.max(qCmd, floor), cap));
}

// The world-vertical part of the lift direction (body x axis × the air-relative velocity, as
// flightModel.js builds lift): cos γ·cos φ.
function liftUpY(body) {
  _x.set(1, 0, 0).applyQuaternion(body.quat);
  _v.copy(body.vel).sub(body.windVec).normalize();
  return _x.cross(_v).normalize().y;
}

// Pilot's aileron for one frame on an airframe whose stick commands a roll rate (spec.rollCmdRad, the
// F-16's 308°/s, 0156; main.js calls it as spec.pilotRoll once this chunk is in, else its plain
// smoothing, rateCmd falsy here): the touch stick and the gamepad get an expo curve (half stick 0.275
// of the command, ~85°/s); deflecting it rolls in at 3/s (a thumb lands anywhere on the absolute touch
// stick: at the plain 10/s a 0.2 s full flick snapped 60°, device panel) and the keys, all or nothing,
// at 2/s, so a tap or a flick banks tens of degrees, not a snap. Letting go is as quick as the plain
// smoothing (10/s).
export function pilotRoll(cur, target, dt, rateCmd, source) {
  const key = source === 'keyboard';
  if (rateCmd && !key) target *= 0.4 + 0.6 * target * target;
  const k = rateCmd && Math.abs(target) > Math.abs(cur) ? (key ? 2 : 3) : 10;
  return cur + (target - cur) * Math.min(1, dt * k);
}

// Give every fly-by-wire airframe in `db` (aircraft.js AIRCRAFT_DATABASE) its limiter, and every
// roll-rate-command one its stick shaping.
export function installFbw(db) {
  for (const spec of Object.values(db)) {
    if (spec.pitchFbw) spec.fbw = fbwPitch;
    if (spec.rollCmdRad) spec.pilotRoll = pilotRoll;
  }
}
installFbw(AIRCRAFT_DATABASE);
