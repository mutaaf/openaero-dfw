// Real ground height: a baked elevation grid (scripts/bake-terrain.mjs, AWS Terrain Tiles)
// with every runway flattened onto the plane through its surveyed end elevations.
// This is the one ground truth: physics, AGL, the terrain mesh, runways, PAPIs and the
// photoreal tiles' vertical calibration all read it. Pure module: no THREE, no DOM.
//
// Heights are sim Y: metres above REF_ELEV_M (KDFW's field elevation), so y = 0 is still
// "on the ground at DFW" and the rest of the metroplex sits a few tens of metres above or
// below it (Love Field −40 m, Alliance +35 m).
import { FIELD_ELEV_FT, FT_TO_M } from './constants.js';

export const REF_ELEV_M = FIELD_ELEV_FT * FT_TO_M;

// Sim-frame grid of the baked DEM (x east, z south, metres from the KDFW origin).
// ±48 km east-west, ±42 km north-south: every airport plus the imagery footprint.
export const DEM_GRID = { x0: -48000, z0: -42000, step: 100, cols: 961, rows: 841 };
export const DEM_URL_PATH = 'terrain/dfw-dem-v1.bin';

export const mslToY = (mslM) => mslM - REF_ELEV_M;
export const ftMslToY = (ft) => ft * FT_TO_M - REF_ELEV_M;
export const yToFtMsl = (y) => (y + REF_ELEV_M) / FT_TO_M;

// Encoding of the baked file: whole metres MSL minus DEM_BASE_M (fits Int8 after
// prediction), predicted from left, up and up-left like PNG's planar filter.
export const DEM_BASE_M = 200;
export function demPredict(q, i, cols) {
  const c = i % cols;
  if (i < cols) return c === 0 ? 0 : q[i - 1];
  if (c === 0) return q[i - cols];
  return q[i - 1] + q[i - cols] - q[i - cols - 1];
}

// Raw (un-gzipped) bytes → Float32Array of sim Y, row-major cols × rows.
export function decodeDem(bytes, grid = DEM_GRID) {
  const n = grid.cols * grid.rows;
  if (bytes.byteLength !== n) throw new Error(`DEM: expected ${n} bytes, got ${bytes.byteLength}`);
  const res = new Int8Array(bytes.buffer, bytes.byteOffset, n);
  const q = new Int16Array(n);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    q[i] = res[i] + demPredict(q, i, grid.cols);
    out[i] = mslToY(q[i] + DEM_BASE_M);
  }
  return out;
}

// Bilinear sample of a decoded DEM; clamps to the edge outside the grid.
export function sampleDem(dem, x, z, grid = DEM_GRID) {
  const fx = Math.min(Math.max((x - grid.x0) / grid.step, 0), grid.cols - 1.001);
  const fz = Math.min(Math.max((z - grid.z0) / grid.step, 0), grid.rows - 1.001);
  const c = Math.floor(fx), r = Math.floor(fz);
  const tx = fx - c, tz = fz - r;
  const i = r * grid.cols + c;
  const a = dem[i], b = dem[i + 1], d = dem[i + grid.cols], e = dem[i + grid.cols + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (d * (1 - tx) + e * tx) * tz;
}

// How far around each runway the field is graded flat, and how wide the blend back into
// the natural terrain is (metres).
export const PAD_HALF_WIDTH_M = 150;
export const PAD_OVERRUN_M = 300;
export const PAD_FEATHER_M = 600;

// Runway planes from RUNWAYS_GEOM entries (airports.js): { ax, az, ay, bx, bz, by } ends.
function prepPlanes(runways) {
  return runways.map((r) => {
    const dx = r.bx - r.ax, dz = r.bz - r.az;
    const len = Math.hypot(dx, dz);
    return { ...r, ux: dx / len, uz: dz / len, len };
  });
}

// One runway's plane height at (x, z) and how strongly it owns that point (0..1).
function runwayInfluence(p, x, z, out) {
  const rx = x - p.ax, rz = z - p.az;
  const along = rx * p.ux + rz * p.uz;
  const lateral = Math.abs(rx * -p.uz + rz * p.ux);
  const t = Math.min(Math.max(along / p.len, 0), 1);
  out.h = p.ay + (p.by - p.ay) * t;
  const overrun = along < 0 ? -along : along > p.len ? along - p.len : 0;
  const outside = Math.hypot(Math.max(0, lateral - PAD_HALF_WIDTH_M), Math.max(0, overrun - PAD_OVERRUN_M));
  if (outside <= 0) { out.w = 1; return; }
  if (outside >= PAD_FEATHER_M) { out.w = 0; return; }
  const s = 1 - outside / PAD_FEATHER_M;
  out.w = s * s * (3 - 2 * s); // smoothstep: no crease where the pad meets the terrain
}

// Ground model: ground.heightAt(x, z) → sim Y. Works before the DEM arrives (natural terrain
// = y 0, runways already at their real elevations); setDem() switches to the real grid.
export function createGround(runways) {
  const planes = prepPlanes(runways);
  const inf = { h: 0, w: 0 };
  let dem = null;
  return {
    setDem(d) { dem = d; },
    hasDem() { return dem !== null; },
    naturalAt(x, z) { return dem ? sampleDem(dem, x, z) : 0; },
    heightAt(x, z) {
      let sw = 0, swh = 0;
      for (let i = 0; i < planes.length; i++) {
        runwayInfluence(planes[i], x, z, inf);
        if (inf.w > 0) { sw += inf.w; swh += inf.w * inf.h; }
      }
      const natural = dem ? sampleDem(dem, x, z) : 0;
      if (sw === 0) return natural;
      if (sw >= 1) return swh / sw;
      return swh + (1 - sw) * natural;
    },
  };
}
