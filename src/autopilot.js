// Autopilot control laws and the weathervane term, as pure functions with the sim's sign
// conventions pinned down by tests/unit/autopilot.test.js:
//   aileron +  = roll right          elevator + = nose down        rudder + = yaw right
//   bank / roll-rate "right" +       pitch / pitch-rate "up" +     cross-track + = right
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Localizer: heading offset (deg) to turn back onto the centreline.
export const localizerInterceptDeg = (crossM) => clamp(-crossM * 0.5, -25, 25);

// Heading hold: bank command (deg) from heading error (deg, + = need to turn right).
export const bankCommandForHeading = (hdgErrDeg) => clamp(hdgErrDeg * 2.5, -25, 25);

// Bank hold: aileron from bank error with roll-rate damping (rate in rad/s).
export const aileronForBank = (bankCmdDeg, bankRightDeg, rollRateRight) =>
  clamp((bankCmdDeg - bankRightDeg) * 0.05 - rollRateRight * 0.8, -0.6, 0.6);

// Glideslope: flight-path angle command (deg) from height above the 3° path (m).
export const glidepathGammaDeg = (heightAbovePathM) => clamp(-3 - heightAbovePathM * 0.12, -6, -0.5);

// Flare: target vertical speed (m/s, negative = down) from wheel height (m).
export const flareSinkMps = (wheelHeightM) => -Math.max(0.45, wheelHeightM * 0.16);

// Pitch hold: elevator from pitch error (deg) with pitch-rate damping (rad/s).
export const elevatorForPitch = (pitchCmdDeg, pitchDeg, pitchRateUp) =>
  clamp((pitchDeg - pitchCmdDeg) * 0.22 + pitchRateUp * 4.5, -1, 1);

// Angle of attack (deg) that makes 1 g of lift at a given airspeed and flap setting:
// used to spawn approaches in trim instead of nose-level and sinking.
export function trimAoaDeg(spec, iasMps, flapsIndex, rho = 1.225) {
  const q = 0.5 * rho * iasMps * iasMps;
  const clNeeded = (spec.massKg * 9.80665) / (q * spec.wingAreaM2);
  const clZero = spec.cl0 + flapsIndex * (spec.flapClPerNotch ?? 0.28);
  return ((clNeeded - clZero) / spec.clAlpha) * 180 / Math.PI;
}

// Autothrottle: nudge throttle towards the target speed.
export const throttleForSpeed = (iasKts, targetKts, throttle, dt) =>
  clamp(throttle + (targetKts - iasKts) * 0.015 * dt, 0, 1);

// Directional (weathervane) stability: body yaw acceleration from sideslip (rad).
// Positive body yaw (angVel.y) is nose-left, so drifting right yaws with a negative term.
export const sideslipYawAccel = (betaRad) => -betaRad * 3.0;
