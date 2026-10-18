// Real runways of the DFW-area airports and the approach geometry built on them.
// Data: OurAirports runways.csv (public domain), fetched 2026-10-16 from
// https://davidmegginson.github.io/ourairports-data/runways.csv. Lat/lon are the physical
// runway ends; displaced thresholds move the landing threshold down the runway.
// Pure module: no THREE, no DOM. Tested in tests/unit/airports.test.js.
import { latLonToSimMeters } from './geo.js';
import { DEG_TO_RAD, NM_TO_M } from './constants.js';
import { ftMslToY } from './terrain.js';

const FT = 0.3048;
export const GLIDE_DEG = 3.0;
// Aiming point / PAPI distance past the landing threshold (FAA 1,000 ft markers).
export const AIM_POINT_M = 305;

export const AIRPORT_NAMES = {
  KDFW: 'Dallas/Fort Worth Intl', KDAL: 'Dallas Love Field', KADS: 'Addison',
  KAFW: 'Fort Worth Alliance', KFTW: 'Fort Worth Meacham', KGKY: 'Arlington Municipal',
};

export const RUNWAY_DATA = [
  { airport: 'KDFW', lengthFt: 9000, widthFt: 200,
    le: { ident: '13L', lat: 32.912601, lon: -97.021500, elevFt: 550, hdgT: 135.3, displacedFt: 625 },
    he: { ident: '31R', lat: 32.895000, lon: -97.000801, elevFt: 508, hdgT: 315.3, displacedFt: 0 } },
  { airport: 'KDFW', lengthFt: 9300, widthFt: 150,
    le: { ident: '13R', lat: 32.909599, lon: -97.083099, elevFt: 591, hdgT: 139.0, displacedFt: 0 },
    he: { ident: '31L', lat: 32.890301, lon: -97.063301, elevFt: 577, hdgT: 319.0, displacedFt: 0 } },
  { airport: 'KDFW', lengthFt: 13400, widthFt: 150,
    le: { ident: '17C', lat: 32.915699, lon: -97.026001, elevFt: 562, hdgT: 180.3, displacedFt: 0 },
    he: { ident: '35C', lat: 32.878899, lon: -97.026199, elevFt: 562, hdgT: 0.3, displacedFt: 0 } },
  { airport: 'KDFW', lengthFt: 8500, widthFt: 150,
    le: { ident: '17L', lat: 32.898300, lon: -97.009804, elevFt: 524, hdgT: 180.3, displacedFt: 0 },
    he: { ident: '35R', lat: 32.875000, lon: -97.009903, elevFt: 575, hdgT: 0.3, displacedFt: 0 } },
  { airport: 'KDFW', lengthFt: 13400, widthFt: 200,
    le: { ident: '17R', lat: 32.915699, lon: -97.029900, elevFt: 567, hdgT: 180.3, displacedFt: 0 },
    he: { ident: '35L', lat: 32.878899, lon: -97.030098, elevFt: 563, hdgT: 0.3, displacedFt: 0 } },
  { airport: 'KDFW', lengthFt: 13401, widthFt: 200,
    le: { ident: '18L', lat: 32.915798, lon: -97.050697, elevFt: 602, hdgT: 180.2, displacedFt: 0 },
    he: { ident: '36R', lat: 32.879002, lon: -97.050903, elevFt: 575, hdgT: 0.2, displacedFt: 0 } },
  { airport: 'KDFW', lengthFt: 13400, widthFt: 150,
    le: { ident: '18R', lat: 32.915798, lon: -97.054604, elevFt: 607, hdgT: 180.3, displacedFt: 0 },
    he: { ident: '36L', lat: 32.879002, lon: -97.054802, elevFt: 582, hdgT: 0.3, displacedFt: 0 } },
  { airport: 'KDAL', lengthFt: 7752, widthFt: 150,
    le: { ident: '13L', lat: 32.857300, lon: -96.856796, elevFt: 477, hdgT: 135.6, displacedFt: 0 },
    he: { ident: '31R', lat: 32.841999, lon: -96.839104, elevFt: 487, hdgT: 315.6, displacedFt: 0 } },
  { airport: 'KDAL', lengthFt: 8800, widthFt: 150,
    le: { ident: '13R', lat: 32.851299, lon: -96.863503, elevFt: 476, hdgT: 135.6, displacedFt: 490 },
    he: { ident: '31L', lat: 32.834000, lon: -96.843399, elevFt: 476, hdgT: 315.6, displacedFt: 0 } },
  { airport: 'KADS', lengthFt: 7203, widthFt: 100,
    le: { ident: '16', lat: 32.977798, lon: -96.840500, elevFt: 633, hdgT: 160.0, displacedFt: 979 },
    he: { ident: '34', lat: 32.959301, lon: -96.832397, elevFt: 639, hdgT: 340.0, displacedFt: 0 } },
  { airport: 'KAFW', lengthFt: 11000, widthFt: 150,
    le: { ident: '16L', lat: 33.001598, lon: -97.320702, elevFt: 723, hdgT: 170.2, displacedFt: 0 },
    he: { ident: '34R', lat: 32.975601, lon: -97.315399, elevFt: 664, hdgT: 350.2, displacedFt: 0 } },
  { airport: 'KAFW', lengthFt: 11125, widthFt: 150,
    le: { ident: '16R', lat: 32.997799, lon: -97.321899, elevFt: 721, hdgT: 170.3, displacedFt: 0 },
    he: { ident: '34L', lat: 32.975399, lon: -97.317398, elevFt: 665, hdgT: 350.3, displacedFt: 0 } },
  { airport: 'KFTW', lengthFt: 7502, widthFt: 150,
    le: { ident: '16', lat: 32.830200, lon: -97.362503, elevFt: 710, hdgT: 171.9, displacedFt: 0 },
    he: { ident: '34', lat: 32.809799, lon: -97.359001, elevFt: 674, hdgT: 351.9, displacedFt: 0 } },
  { airport: 'KFTW', lengthFt: 4005, widthFt: 75,
    le: { ident: '17', lat: 32.824799, lon: -97.366501, elevFt: 668, hdgT: 171.9, displacedFt: 0 },
    he: { ident: '35', lat: 32.813900, lon: -97.364700, elevFt: 667, hdgT: 351.9, displacedFt: 0 } },
  { airport: 'KGKY', lengthFt: 6080, widthFt: 100,
    le: { ident: '16', lat: 32.672001, lon: -97.096298, elevFt: 628, hdgT: 168.0, displacedFt: 0 },
    he: { ident: '34', lat: 32.655701, lon: -97.092201, elevFt: 597, hdgT: 348.0, displacedFt: 0 } },
];

// Unit vector of the landing direction in the sim frame (+X east, -Z north).
export function courseVector(hdgT) {
  const r = hdgT * DEG_TO_RAD;
  return { x: Math.sin(r), z: -Math.cos(r) };
}

function buildEnd(rwy, end, other) {
  const p = latLonToSimMeters(end.lat, end.lon);
  const d = courseVector(end.hdgT);
  const disp = end.displacedFt * FT;
  // Threshold height (sim Y): on the runway plane between the two surveyed ends.
  const t = disp / (rwy.lengthFt * FT);
  const thrY = ftMslToY(end.elevFt + (other.elevFt - end.elevFt) * t);
  return {
    id: `${rwy.airport}_${end.ident}`,
    airport: rwy.airport,
    ident: end.ident,
    name: `${rwy.airport} ${end.ident}`,
    hdgT: end.hdgT,
    elevFt: end.elevFt,
    widthM: rwy.widthFt * FT,
    lengthM: rwy.lengthFt * FT,
    endX: p.x, endZ: p.z,
    thrX: p.x + d.x * disp,
    thrZ: p.z + d.z * disp,
    displacedM: disp,
    thrY,
  };
}

export const RUNWAY_ENDS = RUNWAY_DATA.flatMap((r) => [buildEnd(r, r.le, r.he), buildEnd(r, r.he, r.le)]);

// One entry per physical runway (for drawing and the ground model): centre, length, true
// heading of the le end, and both physical ends with their surveyed heights (sim Y).
export const RUNWAYS_GEOM = RUNWAY_DATA.map((r) => {
  const a = latLonToSimMeters(r.le.lat, r.le.lon);
  const b = latLonToSimMeters(r.he.lat, r.he.lon);
  return {
    name: `${r.airport} ${r.le.ident}/${r.he.ident}`,
    airport: r.airport,
    cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2,
    lengthM: Math.hypot(b.x - a.x, b.z - a.z),
    widthM: r.widthFt * FT,
    hdgT: r.le.hdgT,
    ends: [`${r.airport}_${r.le.ident}`, `${r.airport}_${r.he.ident}`],
    ax: a.x, az: a.z, ay: ftMslToY(r.le.elevFt),
    bx: b.x, bz: b.z, by: ftMslToY(r.he.elevFt),
  };
});

export function runwayEnd(airport, ident) {
  return RUNWAY_ENDS.find((e) => e.airport === airport && e.ident === ident) || null;
}
export function runwayEndById(id) {
  return RUNWAY_ENDS.find((e) => e.id === id) || null;
}

// Position relative to a runway end's approach: distM = distance to the landing threshold
// along the extended centreline (positive before it), crossM = metres right of the
// centreline (looking along the landing direction), heightAbovePathM = height above the
// 3° glidepath that touches down at the aiming point, measured from the threshold height
// (end.thrY, sim Y; terrain.js), so every field flies a true 3° path at its real elevation.
export function approachGeometry(end, pos) {
  const d = courseVector(end.hdgT);
  const rx = pos.x - end.thrX;
  const rz = pos.z - end.thrZ;
  const along = rx * d.x + rz * d.z;
  const cross = rx * -d.z + rz * d.x;
  const distM = -along;
  const pathH = (distM + AIM_POINT_M) * Math.tan(GLIDE_DEG * DEG_TO_RAD);
  return { distM, crossM: cross, heightAbovePathM: pos.y - (end.thrY ?? 0) - pathH, pathHeightM: pathH };
}

// The runway end you are flying to: in front of you (before the threshold, up to 30 km),
// within 35° of its heading and inside a 15° cone around its centreline. Score = distance
// plus 10x the cross-track offset, so on parallel runways the one you're lined up on wins.
// Returns `current` when nothing qualifies, so guidance doesn't flicker.
export function selectActiveRunway(ends, pos, headingDeg, current) {
  let best = null;
  let bestDist = Infinity;
  for (const e of ends) {
    const g = approachGeometry(e, pos);
    if (g.distM < -200 || g.distM > 30000) continue;
    let dh = Math.abs(((headingDeg - e.hdgT) % 360 + 540) % 360 - 180);
    if (dh > 35) continue;
    if (Math.abs(g.crossM) > Math.max(300, Math.max(g.distM, 0) * Math.tan(15 * DEG_TO_RAD))) continue;
    const score = Math.max(g.distM, 0) + 10 * Math.abs(g.crossM);
    if (score < bestDist) { bestDist = score; best = e; }
  }
  return best || current;
}

// Spawn state for an N-NM final on a runway end: on the extended centreline, on the 3°
// path, flying the runway's true heading, descending at the matching rate.
export function approachSpawn(end, distNm, speedMps = 72) {
  const d = courseVector(end.hdgT);
  const dist = distNm * NM_TO_M;
  const h = (dist + AIM_POINT_M) * Math.tan(GLIDE_DEG * DEG_TO_RAD);
  const g = GLIDE_DEG * DEG_TO_RAD;
  return {
    pos: { x: end.thrX - d.x * dist, y: end.thrY + h, z: end.thrZ - d.z * dist },
    vel: { x: d.x * speedMps * Math.cos(g), y: -speedMps * Math.sin(g), z: d.z * speedMps * Math.cos(g) },
    yawRad: -end.hdgT * DEG_TO_RAD,
  };
}

// Takeoff position: on the centreline just past the landing threshold, aligned.
export function takeoffSpawn(end, rollInM = 60) {
  const d = courseVector(end.hdgT);
  return {
    pos: { x: end.thrX + d.x * rollInM, z: end.thrZ + d.z * rollInM },
    yawRad: -end.hdgT * DEG_TO_RAD,
  };
}
