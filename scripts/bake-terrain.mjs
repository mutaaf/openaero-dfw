// Bakes the DFW elevation grid used for physics and the terrain mesh.
//
//   node scripts/bake-terrain.mjs
//
// Source: AWS Terrain Tiles (Mapzen "terrarium" encoding, public dataset on the AWS Registry
// of Open Data: https://registry.opendata.aws/terrain-tiles/; mostly USGS 3DEP/NED in the US).
// Output: public/terrain/dfw-dem-v1.bin = gzip(Int8 residuals) on the sim grid DEM_GRID in
// src/terrain.js: heights are whole metres MSL minus DEM_BASE_M, predicted from the left, up
// and up-left neighbours (planar predictor, like PNG's), so smooth terrain is mostly 0s. Run it by hand when
// the grid changes; the output is committed so builds and CI never touch the network.
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, inflateSync } from 'node:zlib';
import { DEM_GRID, DEM_BASE_M, demPredict } from '../src/terrain.js';
import { DFW_ORIGIN_LAT, DFW_ORIGIN_LON, DEG_TO_RAD } from '../src/constants.js';

const ZOOM = 12; // ~33 m/px at 33°N, finer than the grid, so resampling is bilinear-accurate
const URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

// Minimal PNG decoder: 8-bit RGB/RGBA, non-interlaced (what terrarium tiles are).
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ch = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      const depth = data[8], ctype = data[9], interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (ctype !== 2 && ctype !== 6)) throw new Error(`unsupported PNG ${depth}/${ctype}/${interlace}`);
      ch = ctype === 2 ? 3 : 4;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = new Uint8Array(w * h * ch);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[y * stride + i - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= ch ? out[(y - 1) * stride + i - ch] : 0;
      let v = row[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + i] = v & 255;
    }
  }
  return { w, h, ch, px: out };
}

// Inverse of geo.js latLonToSimMeters.
const R = 6378137;
function simToLatLon(x, z) {
  return {
    lat: DFW_ORIGIN_LAT + (-z / R) / DEG_TO_RAD,
    lon: DFW_ORIGIN_LON + (x / (R * Math.cos(DFW_ORIGIN_LAT * DEG_TO_RAD))) / DEG_TO_RAD,
  };
}
// Fractional global pixel coordinates at ZOOM (256-px tiles).
function latLonToPixel(lat, lon) {
  const n = 2 ** ZOOM * 256;
  const s = Math.sin(lat * DEG_TO_RAD);
  return { px: (lon + 180) / 360 * n, py: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

const tiles = new Map();
async function tile(tx, ty) {
  const k = `${tx}/${ty}`;
  if (!tiles.has(k)) {
    const res = await fetch(URL(ZOOM, tx, ty));
    if (!res.ok) throw new Error(`${k}: HTTP ${res.status}`);
    const { w, ch, px } = decodePng(Buffer.from(await res.arrayBuffer()));
    const elev = new Float32Array(256 * 256);
    for (let i = 0; i < 256 * 256; i++) elev[i] = px[i * ch] * 256 + px[i * ch + 1] + px[i * ch + 2] / 256 - 32768;
    if (w !== 256) throw new Error('tile size');
    tiles.set(k, elev);
  }
  return tiles.get(k);
}
async function sample(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  const at = async (x, y) => (await tile(Math.floor(x / 256), Math.floor(y / 256)))[(y % 256) * 256 + (x % 256)];
  const fx = px - ix, fy = py - iy;
  const a = await at(ix, iy), b = await at(ix + 1, iy), c = await at(ix, iy + 1), d = await at(ix + 1, iy + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

// Prefetch every tile the grid touches, a few at a time.
const { x0, z0, step, cols, rows } = DEM_GRID;
const corners = [simToLatLon(x0, z0), simToLatLon(x0 + step * (cols - 1), z0 + step * (rows - 1))];
const pa = latLonToPixel(corners[0].lat, corners[0].lon), pb = latLonToPixel(corners[1].lat, corners[1].lon);
const need = [];
for (let tx = Math.floor(pa.px / 256); tx <= Math.floor((pb.px + 1) / 256); tx++)
  for (let ty = Math.floor(pa.py / 256); ty <= Math.floor((pb.py + 1) / 256); ty++) need.push([tx, ty]);
console.log(`fetching ${need.length} z${ZOOM} terrarium tiles`);
for (let i = 0; i < need.length; i += 8) await Promise.all(need.slice(i, i + 8).map(([x, y]) => tile(x, y)));

const q = new Int16Array(cols * rows);
let lo = Infinity, hi = -Infinity;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const { lat, lon } = simToLatLon(x0 + c * step, z0 + r * step);
    const { px, py } = latLonToPixel(lat, lon);
    const m = await sample(px, py);
    lo = Math.min(lo, m); hi = Math.max(hi, m);
    q[r * cols + c] = Math.round(m) - DEM_BASE_M;
  }
}
const res = new Int8Array(q.length);
for (let i = 0; i < q.length; i++) {
  const v = q[i] - demPredict(q, i, cols);
  if (v < -128 || v > 127) throw new Error(`residual ${v} at ${i} does not fit Int8`);
  res[i] = v;
}
const gz = gzipSync(Buffer.from(res.buffer), { level: 9 });
mkdirSync('public/terrain', { recursive: true });
writeFileSync('public/terrain/dfw-dem-v1.bin', gz);
console.log(`grid ${cols}x${rows} @ ${step} m, elevation ${lo.toFixed(1)}–${hi.toFixed(1)} m MSL, ${(gz.length / 1024).toFixed(0)} kB`);
