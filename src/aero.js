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

// The speed limit (KIAS) for where the flaps are (0127): VMO / VNE with the flaps up, else the placard
// of the first breakpoint in spec.vfeKtsByFlapDeg at or beyond the flaps' actual angle (flaps between
// two placards are past the lower one: the C172's "10°-30°: 85", the 737's 25-30 at 30's 175). null
// for an airframe without the data (the F-16). Compared with the model's IAS, which is EAS: VMO is
// KCAS, so up high the call comes a few knots late (~5 kt at 10,000 ft); under 250 kt it is < 2 kt.
export function speedLimitKts(spec, flapDeg) {
  const vmo = spec.vneKts ?? null, vfe = spec.vfeKtsByFlapDeg;
  if (vmo === null || !vfe || flapDeg <= 0.5) return vmo;
  for (const [deg, kts] of vfe) if (flapDeg <= deg + 0.5) return Math.min(vmo, kts);
  return Math.min(vmo, vfe[vfe.length - 1][1]);
}

// The overspeed warning's latch: on above the limit, off only OVERSPEED_REARM_KTS below it, so a
// speed riding the line is called once (one caption, one spoken call), not every gust.
export const OVERSPEED_REARM_KTS = 3;
export const overspeedStep = (warned, iasKts, limitKts) =>
  limitKts !== null && iasKts > (warned ? limitKts - OVERSPEED_REARM_KTS : limitKts);

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
// `mach` adds the airframe's compressibility drag rise (waveDragCd; 0 by default and below Mcrit).
export function dragCoefficient(spec, cl, gearDown, flapsIndex, groundEffect, mach = 0) {
  const flapCd = spec.flapCd ? notchValue(spec.flapCd, flapsIndex, 0) : flapsIndex * 0.012;
  const g = spec.fixedGear ? 1 : Number(gearDown);
  const gearCd = GEAR_CD * g + (g > 0 && g < 1 ? GEAR_DOORS_CD : 0);
  return spec.cd0 + gearCd + flapCd + inducedDragK(spec) * cl * cl * groundEffect + waveDragCd(spec, cl, mach);
}

// Compressibility drag rise (0120), for an airframe with spec.transonic { kappaA, tOverC,
// sweepDeg }: W.H. Mason, Configuration Aerodynamics, Sect. 7.5.2 (Virginia Tech), the Korn
// equation extended to sweep by simple sweep theory, MDD = κA/cosΛ − (t/c)/cos²Λ − CL/(10 cos³Λ),
// and Lock's fourth-power drag rise from Mcrit = MDD − (0.1/80)^(1/3) (so dCD/dM = 0.1 at MDD):
// ΔCD = 20 (M − Mcrit)^4. Lift either way loads the wing (|CL|). Lock's shape is fitted up to
// MDD; past it the fourth power runs away (~700 counts at Mach 1), so beyond MDD the rise goes on
// at MDD's slope, 0.1 per Mach (an assumption: ~220 counts at Mach 1, a transport's order).
const LOCK_DM = Math.cbrt(0.1 / 80);
const LOCK_RISE_AT_MDD = 20 * LOCK_DM ** 4; // 26.9 counts
export function dragDivergenceMach(spec, cl) {
  const t = spec.transonic, c = Math.cos(t.sweepDeg * DEG_TO_RAD);
  return t.kappaA / c - t.tOverC / (c * c) - Math.abs(cl) / (10 * c * c * c);
}
export function waveDragCd(spec, cl, mach) {
  if (!spec.transonic || !(mach > 0.5)) return 0;
  const dm = mach - (dragDivergenceMach(spec, cl) - LOCK_DM);
  if (dm <= 0) return 0;
  return dm < LOCK_DM ? 20 * dm * dm * dm * dm : LOCK_RISE_AT_MDD + 0.1 * (dm - LOCK_DM);
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

// Index into GPWS_ALT_THRESHOLDS that should fire now, or -1. Each threshold has a 35 ft
// window below it; only the lowest threshold at or above the aircraft counts (under 50 ft the
// windows overlap, and the highest match called "fifty" again after "forty", 0117), and only
// one below the last called: a bounce or a dip in the terrain never calls a height twice.
// gpwsRearm re-arms them after a climb.
export function gpwsCalloutIndex(aglFt, lastIdx) {
  for (let i = GPWS_ALT_THRESHOLDS.length - 1; i >= 0; i--) {
    const thresh = GPWS_ALT_THRESHOLDS[i];
    if (aglFt <= thresh) return aglFt > thresh - 35 && i > lastIdx ? i : -1;
  }
  return -1;
}
// The callouts re-arm (-1) once the aircraft is 100 ft above the last height called (a go-around,
// a touch-and-go's climb-out); otherwise lastIdx stands.
export const gpwsRearm = (aglFt, lastIdx) => (lastIdx >= 0 && aglFt > GPWS_ALT_THRESHOLDS[lastIdx] + 100 ? -1 : lastIdx);

// Takeoff callouts (0035): the pilot monitoring's "eighty knots" (airspeed cross-check),
// "V1", "rotate", then "positive rate" once the aircraft climbs. Wording varies by operator;
// this is the common Boeing-style sequence. V1 is taken as Vr - 3 kt (V1 <= Vr; the real
// one comes from the day's performance data). Only a two-crew airliner (spec.twoCrew) has
// the 80 kt check and V1; a single pilot (Cessna, F-16) hears rotate, positive rate.
export const TAKEOFF_CALLOUTS = ['eighty knots', 'V1', 'rotate', 'positive rate'];
export const TAKEOFF_CALLOUT_HUD = ['80 KNOTS', 'V1', 'ROTATE', 'POSITIVE RATE'];
// Kid and Learner also read what the word asks of them.
export const TAKEOFF_CALLOUT_HUD_PLAIN = ['80 KNOTS · SPEED OK', 'V1 · KEEP GOING', 'ROTATE · NOSE UP', 'POSITIVE RATE · CLIMBING'];

// Index into TAKEOFF_CALLOUTS that should fire now, or -1. Strictly in order, each once
// (lastIdx is the last one called, -1 at brake release), at most one per call; positive
// rate needs rotate first, the wheels more than 5 ft up and more than 300 fpm up. aglFt is
// the wheels' height (0 on the ground), not the CG's.
export function takeoffCalloutIndex(iasKts, vsiFpm, aglFt, vrKts, lastIdx, twoCrew) {
  let i = lastIdx + 1;
  if (!twoCrew && i < 2) i = 2;
  if (i === 0) return iasKts >= 80 ? 0 : -1;
  if (i === 1) return iasKts >= vrKts - 3 ? 1 : -1;
  if (i === 2) return iasKts >= vrKts ? 2 : -1;
  if (i === 3) return aglFt > 5 && vsiFpm > 300 ? 3 : -1;
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
