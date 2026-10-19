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
const CALLOUT_WORDS = ['one thousand', 'five hundred', 'four hundred', 'three hundred', 'two hundred',
  'one hundred', 'fifty', 'forty', 'thirty', 'twenty', 'ten'];
// Spoken word for a GPWS_ALT_THRESHOLDS index (the real automatic callout cadence).
export const calloutWord = (i) => CALLOUT_WORDS[i];

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

// Stabilized-approach gate (ticket 0020; Flight Safety Foundation ALAR Briefing Note 7.1).
// The gate is 500 ft above the runway in VMC, 1,000 ft in IMC (ceiling under 1,000 ft or
// visibility under 3 SM). At the gate the aircraft must be on the localizer and glideslope
// (within 1 dot), between Vref and Vref+20 kt, sinking 1,000 fpm or less, gear down and
// landing flaps set. Anything else is "unstabilized, go around".
export const GATE_VMC_FT = 500;
export const GATE_IMC_FT = 1000;
// ILS dot sizes: a 5° localizer course is 2 dots each side, a ±0.7° glideslope 2 dots.
export const LOC_DOT_DEG = 1.25;
export const GS_DOT_DEG = 0.35;

export function isImc(wx) {
  return (typeof wx.ceilingFt === 'number' && wx.ceilingFt < 1000) || wx.visibilitySm < 3;
}

// Deviation in dots, + = right of the centreline / above the path. The localizer antenna
// sits ~300 m past the far end of the runway, the glideslope antenna abeam the aim point.
export function locDeviationDots(crossM, distToLocM) {
  return Math.atan2(crossM, Math.max(1, distToLocM)) * 180 / Math.PI / LOC_DOT_DEG;
}
export function gsDeviationDots(heightAbovePathM, distToGsM) {
  return Math.atan2(heightAbovePathM, Math.max(1, distToGsM)) * 180 / Math.PI / GS_DOT_DEG;
}

// g: { iasKt, vref, vsFpm (negative = descending), gearDown, flapsOk, glideDevDots,
//      locDevDots, vmc }. Returns { gateHeight, stable, failing[] } (failing in callout order).
export function stabilizedGate(g) {
  const failing = [];
  if (g.iasKt < g.vref) failing.push('SLOW');
  else if (g.iasKt > g.vref + 20) failing.push('FAST');
  if (-g.vsFpm > 1000) failing.push('SINK');
  if (!g.gearDown) failing.push('GEAR');
  if (!g.flapsOk) failing.push('FLAPS');
  if (Math.abs(g.glideDevDots) > 1) failing.push('GLIDESLOPE');
  if (Math.abs(g.locDevDots) > 1) failing.push('LOCALIZER');
  return { gateHeight: g.vmc ? GATE_VMC_FT : GATE_IMC_FT, stable: failing.length === 0, failing };
}
