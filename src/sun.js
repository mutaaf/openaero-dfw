// The real sun over DFW (ticket 0014): NOAA solar position, time-of-day presets, and the
// sky/light colours for a given sun elevation. Pure, no three.js.
import { DEG_TO_RAD, RAD_TO_DEG } from './constants.js';

export const TIME_MODES = ['Now', 'Dawn', 'Noon', 'Dusk', 'Night'];

// NOAA solar position (the algorithm behind NOAA's Solar Calculator spreadsheet, after
// Meeus). Elevation includes atmospheric refraction; azimuth is degrees clockwise from
// true north.
export function sunPosition(date, latDeg, lonDeg) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const mr = m * DEG_TO_RAD;
  const c = Math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * mr) * (0.019993 - 0.000101 * t) + Math.sin(3 * mr) * 0.000289;
  const omega = (125.04 - 1934.136 * t) * DEG_TO_RAD;
  const lambda = (l0 + c - 0.00569 - 0.00478 * Math.sin(omega)) * DEG_TO_RAD;
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * DEG_TO_RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));

  const y = Math.tan(eps / 2) ** 2;
  const l0r = l0 * DEG_TO_RAD;
  const eqTimeMin = 4 * RAD_TO_DEG * (y * Math.sin(2 * l0r) - 2 * e * Math.sin(mr)
    + 4 * e * y * Math.sin(mr) * Math.cos(2 * l0r) - 0.5 * y * y * Math.sin(4 * l0r)
    - 1.25 * e * e * Math.sin(2 * mr));

  const utcMin = (((date.getTime() / 60000) % 1440) + 1440) % 1440;
  const trueSolarMin = (((utcMin + eqTimeMin + 4 * lonDeg) % 1440) + 1440) % 1440;
  let hourAngle = trueSolarMin / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const ha = hourAngle * DEG_TO_RAD;
  const lat = latDeg * DEG_TO_RAD;

  const cosZen = Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)));
  const elev = 90 - Math.acos(cosZen) * RAD_TO_DEG;
  const azimuthDeg = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) * RAD_TO_DEG + 540) % 360;
  return { elevationDeg: elev + refractionDeg(elev), azimuthDeg };
}

// NOAA's approximate atmospheric refraction correction, degrees.
function refractionDeg(elev) {
  if (elev > 85) return 0;
  const te = Math.tan(elev * DEG_TO_RAD);
  let arcsec;
  if (elev > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elev > -0.575) arcsec = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else arcsec = -20.774 / te;
  return arcsec / 3600;
}

// Unit vector towards the sun in the sim frame (+X east, +Y up, −Z north).
export function sunDirection({ elevationDeg, azimuthDeg }, out = { x: 0, y: 0, z: 0 }) {
  const el = elevationDeg * DEG_TO_RAD;
  const az = azimuthDeg * DEG_TO_RAD;
  out.x = Math.cos(el) * Math.sin(az);
  out.y = Math.sin(el);
  out.z = -Math.cos(el) * Math.cos(az);
  return out;
}

// Dawn and Dusk put the sun this high, low enough for long light and a warm sky.
const LOW_SUN_DEG = 2.5;

// The sun for a time-of-day mode on the solar day around `date`: Now is the real sun; the
// others are found on today's track (5-minute samples), so they follow the season. `at` is
// the moment (ms) of that sun, for the stars and Moon that go with it.
export function sunPreset(mode, date, latDeg, lonDeg) {
  if (mode === 'Now' || !TIME_MODES.includes(mode)) return { ...sunPosition(date, latDeg, lonDeg), at: date.getTime() };
  // Solar noon UTC ≈ 12:00 − longitude/15 h; sample the 24 h centred on the nearest one.
  const noonOffsetMs = (12 - lonDeg / 15) * 3600000;
  const dayMs = 86400000;
  const noon = Math.round((date.getTime() - noonOffsetMs) / dayMs) * dayMs + noonOffsetMs;
  const step = 5 * 60000;
  let hi = null;
  let lo = null;
  let dawn = null;
  let dusk = null;
  let prev = null;
  for (let ms = noon - dayMs / 2; ms <= noon + dayMs / 2; ms += step) {
    const s = sunPosition(new Date(ms), latDeg, lonDeg);
    s.at = ms;
    if (!hi || s.elevationDeg > hi.elevationDeg) hi = s;
    if (!lo || s.elevationDeg < lo.elevationDeg) lo = s;
    if (prev) {
      if (!dawn && prev.elevationDeg < LOW_SUN_DEG && s.elevationDeg >= LOW_SUN_DEG) dawn = s;
      if (prev.elevationDeg >= LOW_SUN_DEG && s.elevationDeg < LOW_SUN_DEG) dusk = prev;
    }
    prev = s;
  }
  if (mode === 'Noon') return hi;
  if (mode === 'Night') return lo;
  // Polar fallbacks never happen at 33° N, but keep the result defined.
  if (mode === 'Dawn') return dawn || hi;
  return dusk || hi;
}

// Sky, haze and light for a sun elevation: keyframes from deep night through twilight and
// golden hour to full day, linearly blended. `zenith`/`horizon` paint the sky dome
// (skyDome.js), `glow` is the extra light on the sunward horizon, and the haze (fog) is the
// horizon colour, so distant ground melts into the sky. `sky` is the dome's mean colour.
// Intensities are the r128-era values (main.js scales them by π for three's light units).
// Night keeps a moonlit-city ambient: the imagery must stay readable after dark (the
// ground shader adds the city lights on top).
const SKY_KEYS = [
  { el: -18, sky: 0x060b1a, zenith: 0x02050f, horizon: 0x1b2036, glow: 0x1b2036, ambient: 0x7d8fc4, ambientIntensity: 0.34, sun: 0x000000, sunIntensity: 0 },
  { el: -9, sky: 0x10183a, zenith: 0x060d26, horizon: 0x2b2c4c, glow: 0x4a3550, ambient: 0x8796c8, ambientIntensity: 0.4, sun: 0x000000, sunIntensity: 0 },
  { el: -4, sky: 0x283466, zenith: 0x12224f, horizon: 0x5a4a6a, glow: 0xb0583a, ambient: 0xb4a6c4, ambientIntensity: 0.5, sun: 0x000000, sunIntensity: 0 },
  { el: 0, sky: 0xd9804f, zenith: 0x2c4a86, horizon: 0xe08a5a, glow: 0xff8a3c, ambient: 0xfed7aa, ambientIntensity: 0.55, sun: 0xffa45c, sunIntensity: 0 },
  { el: 3, sky: 0xe4a070, zenith: 0x3c64a8, horizon: 0xf0aa78, glow: 0xffa050, ambient: 0xfed7aa, ambientIntensity: 0.62, sun: 0xffb877, sunIntensity: 0.7 },
  { el: 8, sky: 0x8ab8e0, zenith: 0x3d74c0, horizon: 0xd8c4ae, glow: 0xffd6a0, ambient: 0xfde6c8, ambientIntensity: 0.72, sun: 0xffd9a0, sunIntensity: 1.0 },
  { el: 25, sky: 0x58a8e8, zenith: 0x2a68c4, horizon: 0xb4cde6, glow: 0xfff2dc, ambient: 0xdbeafe, ambientIntensity: 0.85, sun: 0xfffbeb, sunIntensity: 1.4 },
  { el: 60, sky: 0x4aa0ea, zenith: 0x1f5cbc, horizon: 0xaac8ea, glow: 0xfff8ec, ambient: 0xdbeafe, ambientIntensity: 0.85, sun: 0xfffbeb, sunIntensity: 1.4 },
];
const COLOUR_KEYS = ['sky', 'zenith', 'horizon', 'glow', 'ambient', 'sun'];

function mixHex(a, b, k) {
  let out = 0;
  for (let sh = 16; sh >= 0; sh -= 8) {
    const ca = (a >> sh) & 255;
    const cb = (b >> sh) & 255;
    out |= Math.round(ca + (cb - ca) * k) << sh;
  }
  return out;
}

export function skyForSun(elevationDeg) {
  const keys = SKY_KEYS;
  let out;
  if (elevationDeg <= keys[0].el) out = { ...keys[0] };
  else if (elevationDeg >= keys[keys.length - 1].el) out = { ...keys[keys.length - 1] };
  else {
    let i = 1;
    while (keys[i].el < elevationDeg) i++;
    const a = keys[i - 1];
    const b = keys[i];
    const k = (elevationDeg - a.el) / (b.el - a.el);
    out = {
      el: elevationDeg,
      ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * k,
      sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * k,
    };
    for (const c of COLOUR_KEYS) out[c] = mixHex(a[c], b[c], k);
  }
  out.fog = out.horizon;
  return out;
}
