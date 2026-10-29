// Pitch trim (ticket 0094). In Pilot the static stability term (flightModel.js, 0090) pulls
// the nose to body.trimAlphaDeg, so a released stick flies the speed that angle of attack
// lifts the weight at. The trim wheel moves that angle: keys, a touch rocker and the gamepad's
// right stick all feed trimStep. Pure, unit-tested; flown headless by tests/flight/c172.test.js.
import { liftCoefficient, stallAoaDeg } from './aero.js';
import { DEG_TO_RAD, GRAVITY, RHO_SEA_LEVEL, MPS_TO_KTS } from './constants.js';

// 1.5°/s of angle of attack: the Cessna retrims 90 → 70 KIAS (2.2° → 6.3°) in under 3 s of
// rolling the wheel, and runs stop to stop in ~10 s.
export const TRIM_RATE_DEG_S = 1.5;
// Nose-down stop: the Cessna's hands-off speed there is ~155 KIAS (Vne 163).
export const TRIM_MIN_DEG = -2;
// Nose-up stop: 4° short of the stall, so a released stick still lowers the nose there (0090).
export const trimMaxDeg = (spec, flapsIndex) => stallAoaDeg(spec, flapsIndex) - 4;

// The trim after `dt` s of `dir` (+1 nose up, -1 nose down, or a fraction from an axis).
// A stop never pulls the trim the other way: flaps lower the stall angle, and a trim past the
// new stop only moves back towards it when trimmed that way.
export function trimStep(alphaDeg, dir, dt, spec, flapsIndex) {
  const next = alphaDeg + dir * TRIM_RATE_DEG_S * dt;
  if (dir > 0) return Math.min(next, Math.max(alphaDeg, trimMaxDeg(spec, flapsIndex)));
  if (dir < 0) return Math.max(next, Math.min(alphaDeg, TRIM_MIN_DEG));
  return alphaDeg;
}

// The indicated airspeed (kt) a released stick flies at this trim: the 1 g speed at which the
// trimmed angle of attack lifts the weight (the inverse of autopilot.js trimAoaDeg). null
// where the wing makes (almost) no lift there.
export function trimSpeedKts(spec, alphaDeg, flapsIndex) {
  const cl = liftCoefficient(spec, alphaDeg * DEG_TO_RAD, flapsIndex);
  if (cl < 0.05) return null;
  return Math.sqrt((2 * spec.massKg * GRAVITY) / (RHO_SEA_LEVEL * spec.wingAreaM2 * cl)) * MPS_TO_KTS;
}
