// Earth-centred (ECEF, WGS84) ↔ geodetic ↔ sim frame, for Google's photorealistic tiles.
//
// The sim world is a flat equirectangular map around KDFW (geo.js) with y = metres above
// KDFW's field elevation (terrain.js). Google's mesh is in ECEF on the curved Earth, so a
// rigid rotation can't line them up: 30 km out the Earth has dropped 75 m below the tangent
// plane. Instead every vertex goes through the same lat/lon → sim mapping the runways use
// (photoreal.js does it once per tile on load). Pure module, plain doubles.
import { latLonToSimMeters } from './geo.js';
import { DEG_TO_RAD, DFW_ORIGIN_LAT, DFW_ORIGIN_LON } from './constants.js';
import { REF_ELEV_M } from './terrain.js';

const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const B = A * (1 - F);
const EP2 = (A * A - B * B) / (B * B);

export function geodeticToEcef(latDeg, lonDeg, h, out = {}) {
  const lat = latDeg * DEG_TO_RAD, lon = lonDeg * DEG_TO_RAD;
  const s = Math.sin(lat), c = Math.cos(lat);
  const n = A / Math.sqrt(1 - E2 * s * s);
  out.x = (n + h) * c * Math.cos(lon);
  out.y = (n + h) * c * Math.sin(lon);
  out.z = (n * (1 - E2) + h) * s;
  return out;
}

// Bowring's method with one refinement: sub-millimetre for anything on or near the ground.
export function ecefToGeodetic(x, y, z, out = {}) {
  const p = Math.hypot(x, y);
  const lon = Math.atan2(y, x);
  let th = Math.atan2(z * A, p * B);
  let lat = Math.atan2(z + EP2 * B * Math.sin(th) ** 3, p - E2 * A * Math.cos(th) ** 3);
  th = Math.atan2((1 - F) * Math.sin(lat), Math.cos(lat));
  lat = Math.atan2(z + EP2 * B * Math.sin(th) ** 3, p - E2 * A * Math.cos(th) ** 3);
  const s = Math.sin(lat);
  const n = A / Math.sqrt(1 - E2 * s * s);
  out.lat = lat / DEG_TO_RAD;
  out.lon = lon / DEG_TO_RAD;
  out.h = p / Math.cos(lat) - n;
  return out;
}

// Geoid height (ellipsoid − MSL) over the metroplex: a plane fitted to NOAA GEOID18 at six
// points across the map (residuals ≤ 0.3 m). The photoreal layer's vertical calibration
// against the runway thresholds absorbs the remaining datum offset.
export function geoidN(latDeg, lonDeg) {
  return -26.986 - 0.182 * (latDeg - 32.9) + 2.470 * (lonDeg + 97.04);
}

// ECEF point → sim frame { x, y, z } (y = metres above KDFW's 606 ft MSL).
const _g = {};
export function ecefToSim(x, y, z, out = {}) {
  ecefToGeodetic(x, y, z, _g);
  const m = latLonToSimMeters(_g.lat, _g.lon);
  out.x = m.x;
  out.y = _g.h - geoidN(_g.lat, _g.lon) - REF_ELEV_M;
  out.z = m.z;
  return out;
}

// Approximate rigid ECEF → sim transform (east → +x, up → +y, north → −z, origin at KDFW's
// field elevation). Only for the tile renderer's culling and level-of-detail maths; the
// vertices themselves are mapped exactly with ecefToSim. Column-major 4x4 (THREE order).
export function ecefToSimRigid() {
  const lat = DFW_ORIGIN_LAT * DEG_TO_RAD, lon = DFW_ORIGIN_LON * DEG_TO_RAD;
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  const e = [-so, co, 0];
  const n = [-sl * co, -sl * so, cl];
  const u = [cl * co, cl * so, sl];
  const rows = [e, u, n.map((v) => -v)];
  const o = geodeticToEcef(DFW_ORIGIN_LAT, DFW_ORIGIN_LON, REF_ELEV_M + geoidN(DFW_ORIGIN_LAT, DFW_ORIGIN_LON));
  const t = rows.map((r) => -(r[0] * o.x + r[1] * o.y + r[2] * o.z));
  // column-major
  return [
    rows[0][0], rows[1][0], rows[2][0], 0,
    rows[0][1], rows[1][1], rows[2][1], 0,
    rows[0][2], rows[1][2], rows[2][2], 0,
    t[0], t[1], t[2], 1,
  ];
}
