// Pitch trim (ticket 0094). In Pilot the static stability term (flightModel.js, 0090) pulls
// the nose to body.trimAlphaDeg, so a released stick flies the speed that angle of attack
// lifts the weight at. The trim wheel moves that angle: keys, a touch rocker and the gamepad's
// right stick all feed trimStep. Pure, unit-tested; flown headless by tests/flight/c172.test.js.
import { liftCoefficient, stallAoaDeg } from './aero.js';
import { trimAoaDeg } from './autopilot.js';
import { DEG_TO_RAD, RAD_TO_DEG, GRAVITY, RHO_SEA_LEVEL, MPS_TO_KTS, KTS_TO_MPS } from './constants.js';

// A game-feel rate, not a measured wheel: held, the trim moves the hands-off speed 9% a
// second whatever the airframe (dα = 2·r·CL/CLα for dV/V = r), so the Cessna retrims
// 90 → 70 KIAS in ~2.8 s and a 737 at 250 kt moves ~22 kt/s, not the 28+ a fixed α rate gave.
export const TRIM_SPEED_RATE = 0.09;

// The stops: nose down at the hands-off speed of Vne/Vmo (spec.vneKts) for the flaps set,
// nose up 4° short of the stall, so a released stick still lowers the nose there (0090).
export function trimLimits(spec, flapsIndex) {
  return {
    min: spec.vneKts ? trimAoaDeg(spec, spec.vneKts * KTS_TO_MPS, flapsIndex) : -2,
    max: stallAoaDeg(spec, flapsIndex) - 4,
  };
}

// `next` held inside the stops, except that a stop never pulls the trim the other way: flaps
// move both stops, and a trim already past one only moves back towards it.
export function clampTrim(next, alphaDeg, spec, flapsIndex) {
  const { min, max } = trimLimits(spec, flapsIndex);
  if (next > alphaDeg) return Math.min(next, Math.max(alphaDeg, max));
  if (next < alphaDeg) return Math.max(next, Math.min(alphaDeg, min));
  return alphaDeg;
}

// The trim after `dt` s of `dir` (+1 nose up, -1 nose down, or a fraction from an axis).
export function trimStep(alphaDeg, dir, dt, spec, flapsIndex) {
  const cl = Math.max(0.1, liftCoefficient(spec, alphaDeg * DEG_TO_RAD, flapsIndex));
  const rateDeg = (2 * TRIM_SPEED_RATE * cl / spec.clAlpha) * RAD_TO_DEG;
  return clampTrim(alphaDeg + dir * rateDeg * dt, alphaDeg, spec, flapsIndex);
}

// The indicated airspeed (kt) a released stick flies at this trim: the 1 g speed at which the
// trimmed angle of attack lifts the weight (the inverse of autopilot.js trimAoaDeg). null
// where the wing makes (almost) no lift there.
export function trimSpeedKts(spec, alphaDeg, flapsIndex) {
  const cl = liftCoefficient(spec, alphaDeg * DEG_TO_RAD, flapsIndex);
  if (cl < 0.05) return null;
  return Math.sqrt((2 * spec.massKg * GRAVITY) / (RHO_SEA_LEVEL * spec.wingAreaM2 * cl)) * MPS_TO_KTS;
}
