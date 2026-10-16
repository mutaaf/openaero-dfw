// Pure aerodynamic and avionics helpers used by the 6-DOF integrator in main.js.
// No THREE, no DOM: everything here is unit-tested in tests/unit/aero.test.js.
import { DEG_TO_RAD, RHO_SEA_LEVEL } from './constants.js';

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function dynamicPressure(airspeedMps, rho = RHO_SEA_LEVEL) {
  return 0.5 * rho * airspeedMps * airspeedMps;
}

// Lift coefficient: linear lift curve + flap increment, with an exponential post-stall drop.
export function liftCoefficient(spec, aoaRad, flapsIndex) {
  // Flap lift increment per notch is per airframe (default 0.28, the prototype's value).
  let cl = spec.cl0 + spec.clAlpha * aoaRad + flapsIndex * (spec.flapClPerNotch ?? 0.28);
  const stallAngleRad = spec.alphaStallDeg * DEG_TO_RAD;
  if (Math.abs(aoaRad) > stallAngleRad) {
    const excess = Math.abs(aoaRad) - stallAngleRad;
    cl *= Math.exp(-excess * 4.0);
  }
  return cl;
}

// Ground-effect factor on drag (McCormick-style, 1 = out of ground effect).
export function groundEffectFactor(heightM, wingSpanM) {
  const h = Math.max(1.0, heightM);
  const r = 16 * h / wingSpanM;
  return Math.min(1.0, Math.pow(r / (1 + r), 2));
}

export function inducedDragK(spec) {
  return 1 / (Math.PI * spec.aspectRatio * spec.oswaldEfficiency);
}

// Total drag coefficient: parasite + gear + flaps + induced, scaled by ground effect.
export function dragCoefficient(spec, cl, gearDown, flapsIndex, groundEffect) {
  return (spec.cd0 + (gearDown ? 0.018 : 0) + (flapsIndex * 0.012) + inducedDragK(spec) * cl * cl) * groundEffect;
}

// Heading error in degrees, wrapped to [-180, 180].
export function headingError(targetDeg, currentDeg) {
  let diff = targetDeg - currentDeg;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

// Heading in [0, 360) from a YXZ euler yaw (radians). Three.js yaw is CCW-positive.
export function headingFromYaw(yawRad) {
  return ((-yawRad * 180 / Math.PI) % 360 + 360) % 360;
}

// 4-light PAPI: number of WHITE lights for an approach slope angle (deg).
// 2 white / 2 red = on a ~3° glidepath.
export function papiWhiteLights(slopeDeg) {
  if (slopeDeg > 3.4) return 4;
  if (slopeDeg > 3.1) return 3;
  if (slopeDeg > 2.8) return 2;
  if (slopeDeg > 2.5) return 1;
  return 0;
}

export const GPWS_ALT_THRESHOLDS = [1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10];

// Index into GPWS_ALT_THRESHOLDS that should fire now, or -1. Each threshold has a
// 35 ft window below it and does not repeat while it is the last one called.
export function gpwsCalloutIndex(aglFt, lastIdx) {
  for (let i = 0; i < GPWS_ALT_THRESHOLDS.length; i++) {
    const thresh = GPWS_ALT_THRESHOLDS[i];
    if (aglFt <= thresh && aglFt > thresh - 35 && lastIdx !== i) return i;
  }
  return -1;
}

// Warning logic shared by the banners.
export function isStallWarning(iasKts, stallCleanKts, onGround) {
  return iasKts < stallCleanKts && !onGround;
}
export function isGpwsWarning(aglFt, vsiFpm, onGround) {
  return aglFt < 450 && vsiFpm < -1400 && !onGround;
}
