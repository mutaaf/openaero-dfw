// Pure aerodynamic and avionics helpers used by the 6-DOF integrator in main.js.
// No THREE, no DOM: everything here is unit-tested in tests/unit/aero.test.js.
import { DEG_TO_RAD, RHO_SEA_LEVEL } from './constants.js';

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function dynamicPressure(airspeedMps, rho = RHO_SEA_LEVEL) {
  return 0.5 * rho * airspeedMps * airspeedMps;
}

// A per-notch table at a flap position in notch units: flaps in transit (systems.js) sit
// between notches, so the value is interpolated between them.
function notchValue(table, pos, fallback) {
  const i = Math.floor(pos), f = pos - i;
  const a = table[i] ?? fallback;
  return f > 0 ? a + ((table[i + 1] ?? fallback) - a) * f : a;
}

// Flap lift increment and stall angle for a flap notch: per-notch tables when the airframe
// has them (fitted to the POH stall speeds), else 0.28 per notch (the prototype's value).
export const flapDeltaCl = (spec, flapsIndex) =>
  (spec.flapCl ? notchValue(spec.flapCl, flapsIndex, 0) : flapsIndex * (spec.flapClPerNotch ?? 0.28));
export const stallAoaDeg = (spec, flapsIndex) =>
  (spec.alphaStallDegByFlap ? notchValue(spec.alphaStallDegByFlap, flapsIndex, spec.alphaStallDeg) : spec.alphaStallDeg);

// Lift coefficient: linear lift curve + flap increment, with an exponential post-stall drop.
export function liftCoefficient(spec, aoaRad, flapsIndex) {
  let cl = spec.cl0 + spec.clAlpha * aoaRad + flapDeltaCl(spec, flapsIndex);
  const stallAngleRad = stallAoaDeg(spec, flapsIndex) * DEG_TO_RAD;
  if (Math.abs(aoaRad) > stallAngleRad) {
    const excess = Math.abs(aoaRad) - stallAngleRad;
    cl *= Math.exp(-excess * 4.0);
  }
  return cl;
}

// 1 g stall speed (indicated, kt) for a flap setting, from CLmax.
export function stallSpeedKts(spec, flapsIndex) {
  const clMax = spec.cl0 + spec.clAlpha * stallAoaDeg(spec, flapsIndex) * DEG_TO_RAD + flapDeltaCl(spec, flapsIndex);
  return Math.sqrt((2 * spec.massKg * 9.80665) / (RHO_SEA_LEVEL * spec.wingAreaM2 * clMax)) / 0.514444;
}

// The stall warning sounds 5 kt above the current configuration's stall speed (FAR 23.207
// asks for at least 5 kt of warning).
// Vref (kt) for the flaps that are set: the airframe's per-notch value for its landing flaps
// (737: 30 and 40), else its one vrefKts.
export const vrefFor = (spec, flapsIndex) => spec.vrefKtsByFlap?.[flapsIndex] ?? spec.vrefKts;

export const stallWarningKts = (spec, flapsIndex) => stallSpeedKts(spec, flapsIndex) + 5;

// Ground-effect factor on drag (McCormick-style, 1 = out of ground effect).
export function groundEffectFactor(heightM, wingSpanM) {
  const h = Math.max(1.0, heightM);
  const r = 16 * h / wingSpanM;
  return Math.min(1.0, Math.pow(r / (1 + r), 2));
}

export function inducedDragK(spec) {
  return 1 / (Math.PI * spec.aspectRatio * spec.oswaldEfficiency);
}

// Total drag coefficient: parasite + gear + flaps + induced. Ground effect weakens the
// wingtip vortices, so it scales only the induced term (McCormick), not skin friction.
// Flap drag per notch: a per-airframe table when the airframe has one, else 0.012 a notch.
// Fixed gear (spec.fixedGear) is always down. `gearDown` may be the gear's travel (0 up → 1
// down, systems.js): the legs' drag grows as they come out, and the open doors add theirs
// while the gear is in transit (an estimate: ~a third of the gear's drag).
export const GEAR_CD = 0.018;
export const GEAR_DOORS_CD = 0.006;
export function dragCoefficient(spec, cl, gearDown, flapsIndex, groundEffect) {
  const flapCd = spec.flapCd ? notchValue(spec.flapCd, flapsIndex, 0) : flapsIndex * 0.012;
  const g = spec.fixedGear ? 1 : Number(gearDown);
  const gearCd = GEAR_CD * g + (g > 0 && g < 1 ? GEAR_DOORS_CD : 0);
  return spec.cd0 + gearCd + flapCd + inducedDragK(spec) * cl * cl * groundEffect;
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
// GPWS mode 4A, "TOO LOW, GEAR": descending under 500 ft with the gear not down and locked.
export function isGearWarning(aglFt, vsiFpm, gearLocked, onGround) {
  return !gearLocked && !onGround && aglFt < 500 && vsiFpm < 0;
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
  return (typeof wx.ceilingFt === 'number' && wx.ceilingFt < 1000) || (wx.visibilitySm ?? 10) < 3;
}

// Deviation in dots (+ = right of the centreline / above the path) of devM seen from an
// antenna distM away: the localizer's sits ~300 m past the far end of the runway
// (LOC_DOT_DEG), the glideslope's abeam the aim point (GS_DOT_DEG).
export function ilsDots(devM, distM, dotDeg) {
  return Math.atan2(devM, Math.max(1, distM)) * 180 / Math.PI / dotDeg;
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

// When to evaluate the gate, once per approach. s = { armed, armFt, done } is mutated.
// Above the gate the gate arms (and its height is fixed for this approach, so a METAR that
// turns IMC at 700 ft doesn't evaluate a "1,000 ft" gate at 700 ft). Descending through the
// armed height evaluates it if the aircraft is on the final (onFinal), else just disarms.
// After an evaluation it re-arms only 100 ft above the gate (a go-around), not on a bump.
// Returns 'reset' when a new approach arms after an evaluation, 'evaluate' on the gate frame.
export function gateStep(s, aaeFt, gateFt, descending, onFinal) {
  if (aaeFt > (s.done ? gateFt + 100 : gateFt)) {
    const reset = s.done;
    s.armed = true; s.armFt = gateFt; s.done = false;
    return reset ? 'reset' : '';
  }
  if (!s.armed || aaeFt > s.armFt || !descending) return '';
  s.armed = false;
  if (!onFinal) return '';
  s.done = true;
  return 'evaluate';
}
