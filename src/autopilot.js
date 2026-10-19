// Autopilot control laws and the weathervane term, as pure functions with the sim's sign
// conventions pinned down by tests/unit/autopilot.test.js:
//   aileron +  = roll right          elevator + = nose down        rudder + = yaw right
//   bank / roll-rate "right" +       pitch / pitch-rate "up" +     cross-track + = right
import { flapDeltaCl } from './aero.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GS_KI = 0.01;                  // glidepath integral, deg per m·s
const AT_KI = 0.015, AT_KP = 0.03;   // autothrottle: throttle/s per kt error, per kt/s trend

// Localizer: heading offset (deg) to turn back onto the centreline.
export const localizerInterceptDeg = (crossM) => clamp(-crossM * 0.5, -25, 25);

// Heading hold: bank command (deg) from heading error (deg, + = need to turn right).
export const bankCommandForHeading = (hdgErrDeg) => clamp(hdgErrDeg * 2.5, -25, 25);

// Bank hold: aileron from bank error with roll-rate damping (rate in rad/s).
export const aileronForBank = (bankCmdDeg, bankRightDeg, rollRateRight) =>
  clamp((bankCmdDeg - bankRightDeg) * 0.05 - rollRateRight * 0.8, -0.6, 0.6);

// Glideslope: flight-path angle command (deg) from height above the 3° path (m), plus a
// small integral (m·s) that trims out a standing offset.
export const glidepathGammaDeg = (heightAbovePathM, integralMs = 0) =>
  clamp(-3 - heightAbovePathM * 0.12 - integralMs * GS_KI, -6, -0.5);

// Flare: target vertical speed (m/s, negative = down) from wheel height (m).
export const flareSinkMps = (wheelHeightM) => -Math.max(0.8, wheelHeightM * 0.2);

// Pitch hold: elevator from pitch error (deg) with pitch-rate damping (rad/s).
export const elevatorForPitch = (pitchCmdDeg, pitchDeg, pitchRateUp) =>
  clamp((pitchDeg - pitchCmdDeg) * 0.22 + pitchRateUp * 4.5, -1, 1);

// Angle of attack (deg) that makes 1 g of lift at a given airspeed and flap setting:
// used to spawn approaches in trim instead of nose-level and sinking.
export function trimAoaDeg(spec, iasMps, flapsIndex, rho = 1.225) {
  const q = 0.5 * rho * iasMps * iasMps;
  const clNeeded = (spec.massKg * 9.80665) / (q * spec.wingAreaM2);
  const clZero = spec.cl0 + flapDeltaCl(spec, flapsIndex);
  return ((clNeeded - clZero) / spec.clAlpha) * 180 / Math.PI;
}

// Autothrottle: PI on airspeed, in rate form. The speed error integrates into the throttle;
// the speed trend (kt/s, + = accelerating) is the proportional term, so the throttle leads
// a speed change instead of chasing it a phugoid half-cycle late.
export const throttleForSpeed = (iasKts, targetKts, throttle, dt, iasRateKtsPerS = 0) =>
  clamp(throttle + ((targetKts - iasKts) * AT_KI - iasRateKtsPerS * AT_KP) * dt, 0, 1);

// Autothrottle with feed-forward: start from the throttle the flight model says holds the
// target speed on the commanded path (flightModel.js trimThrottle), then correct with
// proportional (speed error), rate (speed trend) and a slow integral (`state.trim`, which
// soaks up wind and model error). Feed-forward is what keeps it calm with a spooling jet:
// the loop no longer has to discover the right power through the engine's lag.
// Integral time ~30 s (KP/KI), about a jet's speed time constant m·V/2D on a final, so it
// trims out steady error without winding up into the phugoid.
export const ATF_KP = 0.012, ATF_KD = 0.04, ATF_KI = 0.0004;
export function autothrottleCommand(ffThrottle, state, iasKts, targetKts, iasRateKtsPerS, dt) {
  const err = targetKts - iasKts;
  state.trim = clamp(state.trim + err * ATF_KI * dt, -0.3, 0.3);
  return clamp(ffThrottle + err * ATF_KP - iasRateKtsPerS * ATF_KD + state.trim, 0, 1);
}

// Directional (weathervane) stability: body yaw acceleration from sideslip (rad).
// Positive body yaw (angVel.y) is nose-left, so drifting right yaws with a negative term.
export const sideslipYawAccel = (betaRad) => -betaRad * 3.0;
