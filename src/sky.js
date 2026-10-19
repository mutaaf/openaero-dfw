// The real night sky over DFW: sidereal time, the rotation that turns J2000 star positions
// into the sim frame, and the Moon (position, illumination). Pure, no three.js; the
// renderer lives in skyDome.js.
import { DEG_TO_RAD, RAD_TO_DEG } from './constants.js';

const J2000_MS = Date.UTC(2000, 0, 1, 12);

function daysSinceJ2000(date) { return (date.getTime() - J2000_MS) / 86400000; }

// Greenwich mean sidereal time, degrees (IAU 1982, as in the Astronomical Almanac).
export function gmstDeg(date) {
  const d = daysSinceJ2000(date);
  const t = d / 36525;
  const g = 280.46061837 + 360.98564736629 * d + t * t * (0.000387933 - t / 38710000);
  return ((g % 360) + 360) % 360;
}

// Local sidereal time, radians, at an east-positive longitude.
export function lstRad(date, lonDeg) {
  return ((gmstDeg(date) + lonDeg) % 360) * DEG_TO_RAD;
}

// Row-major 3x3 rotation from equatorial unit vectors (x → RA 0h, z → north celestial
// pole) to the sim frame (+X east, +Y up, −Z north) at a latitude and sidereal time.
// Precession since J2000 (~0.3°) is ignored: invisible at star-field scale.
export function equatorialToSim(latDeg, lst, out = new Array(9)) {
  const cl = Math.cos(lst), sl = Math.sin(lst);
  const cp = Math.cos(latDeg * DEG_TO_RAD), sp = Math.sin(latDeg * DEG_TO_RAD);
  // Rotate by −LST about the pole: x' → the meridian on the equator, y' → east.
  // Then east = y', up = cos φ·x' + sin φ·z', north = −sin φ·x' + cos φ·z'.
  // x' = ( cl, sl, 0)·e   y' = (−sl, cl, 0)·e   z' = (0, 0, 1)·e
  out[0] = -sl; out[1] = cl; out[2] = 0;                    // X = east
  out[3] = cp * cl; out[4] = cp * sl; out[5] = sp;          // Y = up
  out[6] = sp * cl; out[7] = sp * sl; out[8] = -cp;         // Z = −north
  return out;
}

export function radecToUnit(raRad, decRad, out = { x: 0, y: 0, z: 0 }) {
  const cd = Math.cos(decRad);
  out.x = cd * Math.cos(raRad); out.y = cd * Math.sin(raRad); out.z = Math.sin(decRad);
  return out;
}

export function applyMat3(m, v, out = { x: 0, y: 0, z: 0 }) {
  const { x, y, z } = v;
  out.x = m[0] * x + m[1] * y + m[2] * z;
  out.y = m[3] * x + m[4] * y + m[5] * z;
  out.z = m[6] * x + m[7] * y + m[8] * z;
  return out;
}

// The Moon's geocentric ecliptic longitude/latitude (degrees) and horizontal parallax:
// the Astronomical Almanac's low-precision series (~0.3° in position).
function moonEcliptic(date) {
  const t = daysSinceJ2000(date) / 36525;
  const s = (a, b) => Math.sin((a + b * t) * DEG_TO_RAD);
  const c = (a, b) => Math.cos((a + b * t) * DEG_TO_RAD);
  const lambda = 218.32 + 481267.881 * t
    + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22)
    + 0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03);
  const beta = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89)
    - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21);
  const parallax = 0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36)
    + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74);
  return { lambda, beta, parallax };
}

// The Moon as seen from a place on the ground: unit vector in the sim frame (topocentric,
// parallax applied) plus its elevation.
export function moonDirection(date, latDeg, lonDeg, out = { x: 0, y: 0, z: 0 }) {
  const { lambda, beta, parallax } = moonEcliptic(date);
  const eps = 23.439 * DEG_TO_RAD;
  const l = lambda * DEG_TO_RAD, b = beta * DEG_TO_RAD;
  const ecl = { x: Math.cos(b) * Math.cos(l), y: Math.cos(b) * Math.sin(l), z: Math.sin(b) };
  const eq = { x: ecl.x, y: ecl.y * Math.cos(eps) - ecl.z * Math.sin(eps), z: ecl.y * Math.sin(eps) + ecl.z * Math.cos(eps) };
  applyMat3(equatorialToSim(latDeg, lstRad(date, lonDeg)), eq, out);
  // Topocentric: the Moon sits lower by the parallax × cos(altitude).
  const alt = Math.asin(Math.max(-1, Math.min(1, out.y)));
  const alt2 = alt - parallax * DEG_TO_RAD * Math.cos(alt);
  const h = Math.hypot(out.x, out.z) || 1;
  out.x = (out.x / h) * Math.cos(alt2); out.z = (out.z / h) * Math.cos(alt2); out.y = Math.sin(alt2);
  out.elevationDeg = alt2 * RAD_TO_DEG;
  return out;
}

// Fraction of the Moon's disc that is lit, from the angle between the Moon and the Sun.
export function moonIllumination(moonDir, sunDir) {
  const cosElong = moonDir.x * sunDir.x + moonDir.y * sunDir.y + moonDir.z * sunDir.z;
  return (1 - cosElong) / 2;
}

// How dark the sky is, 0 (day) → 1 (astronomical night), from the sun's elevation. Stars
// begin to show in civil twilight and are all out by −12°.
export function nightness(sunElevationDeg) {
  const k = (2 - sunElevationDeg) / 14; // +2° → 0, −12° → 1
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
}

// Star catalogue (public/sky/stars-v1.bin, scripts/bake-stars.mjs): little-endian float32
// records of [ra rad, dec rad, V magnitude, B−V-ish colour temperature K].
export const STAR_STRIDE = 4;

// Star colour from its temperature (approximate blackbody, normalised to max = 1).
export function starColour(tempK, out = [1, 1, 1]) {
  const t = Math.min(40000, Math.max(1000, tempK)) / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; } else {
    r = 329.7 * (t - 60) ** -0.1332; g = 288.12 * (t - 60) ** -0.0755; b = 255;
  }
  const m = Math.max(r, g, b);
  out[0] = Math.max(0, r) / m; out[1] = Math.max(0, g) / m; out[2] = Math.max(0, Math.min(255, b)) / m;
  return out;
}
