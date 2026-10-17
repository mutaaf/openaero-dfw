// Quadtree level-of-detail for the streamed satellite imagery (Web Mercator z/x/y tiles).
// Pure module: no THREE, no DOM. src/terrainLod.js turns its answer into meshes.
//
// selectTiles() walks from a fixed set of coarse root tiles and splits any tile the camera
// is close to (relative to the tile's size), so the ground is sharp under the aircraft and
// coarse at the horizon. resolveVisible() then picks what to *draw*: a selected tile once
// its imagery has arrived, else its nearest loaded ancestor (never both, so tiles never
// overlap), else nothing for that patch.
import { latLonToTile, tilePlacement } from './geo.js';
import { DFW_ORIGIN_LAT, DFW_ORIGIN_LON, DEG_TO_RAD } from './constants.js';

export const ROOT_ZOOM = 10;
export const MAX_ZOOM = 16;
// Split while the camera is closer than SPLIT_FACTOR × the tile's width.
export const SPLIT_FACTOR = 2.0;
// Root coverage: ±60 km around the KDFW origin (every airport, the whole imagery horizon).
export const COVER_M = 60000;

export const tileKey = (z, x, y) => `${z}/${x}/${y}`;

export function rootTiles(coverM = COVER_M) {
  const R = 6378137;
  const dLat = (coverM / R) / DEG_TO_RAD;
  const dLon = (coverM / (R * Math.cos(DFW_ORIGIN_LAT * DEG_TO_RAD))) / DEG_TO_RAD;
  const nw = latLonToTile(DFW_ORIGIN_LAT + dLat, DFW_ORIGIN_LON - dLon, ROOT_ZOOM);
  const se = latLonToTile(DFW_ORIGIN_LAT - dLat, DFW_ORIGIN_LON + dLon, ROOT_ZOOM);
  const roots = [];
  for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) roots.push({ z: ROOT_ZOOM, x, y });
  return roots;
}

// Tile bounds in the sim frame (cached; tiles are immutable).
const boundsCache = new Map();
export function tileBounds(z, x, y) {
  const k = tileKey(z, x, y);
  let b = boundsCache.get(k);
  if (!b) {
    const p = tilePlacement(x, y, z);
    b = { cx: p.posX, cz: p.posZ, w: p.widthM, l: p.lengthM, minX: p.posX - p.widthM / 2, maxX: p.posX + p.widthM / 2, minZ: p.posZ - p.lengthM / 2, maxZ: p.posZ + p.lengthM / 2 };
    boundsCache.set(k, b);
  }
  return b;
}

// Distance from the camera to the tile's footprint (height counts: from 10 km up, nothing
// is "close").
export function distanceToTile(b, cam, groundY = 0) {
  const dx = Math.max(b.minX - cam.x, 0, cam.x - b.maxX);
  const dz = Math.max(b.minZ - cam.z, 0, cam.z - b.maxZ);
  const dy = Math.max(0, cam.y - groundY);
  return Math.hypot(dx, dy, dz);
}

// The selection as a tree: { z, x, y, key, children: [4 nodes] | null }.
// `visible(bounds)` (optional) lets the caller veto splitting tiles outside the view.
export function selectTiles(cam, { groundY = 0, maxZoom = MAX_ZOOM, splitFactor = SPLIT_FACTOR, visible = null, roots = rootTiles() } = {}) {
  const build = (z, x, y) => {
    const b = tileBounds(z, x, y);
    const node = { z, x, y, key: tileKey(z, x, y), children: null };
    const close = distanceToTile(b, cam, groundY) < b.w * splitFactor;
    if (z < maxZoom && close && (!visible || visible(b))) {
      node.children = [
        build(z + 1, 2 * x, 2 * y), build(z + 1, 2 * x + 1, 2 * y),
        build(z + 1, 2 * x, 2 * y + 1), build(z + 1, 2 * x + 1, 2 * y + 1),
      ];
    }
    return node;
  };
  return roots.map((r) => build(r.z, r.x, r.y));
}

// Every node of the selection (leaves and their ancestors): what should be loaded/kept.
export function flatten(trees, out = []) {
  for (const n of trees) {
    out.push(n);
    if (n.children) flatten(n.children, out);
  }
  return out;
}

// What to draw: each patch covered exactly once by the finest *ready* tile available.
export function resolveVisible(trees, isReady) {
  const out = [];
  const visit = (n) => {
    if (!n.children) return isReady(n.key) ? [n] : null;
    const parts = n.children.map(visit);
    if (parts.every(Boolean)) return parts.flat();
    if (isReady(n.key)) return [n];
    // Not ready here: draw whatever children are, leave the rest as a hole (base plane).
    return parts.filter(Boolean).flat();
  };
  for (const t of trees) {
    const v = visit(t);
    if (v) out.push(...v);
  }
  return out;
}

// Mesh resolution per zoom. Imagery sharpness comes from the zoom; the mesh only has to
// follow the terrain, and the metroplex is gentle (and every runway sits on a flat graded
// pad, terrain.js), so a vertex every 128–256 m near the camera is plenty and big far
// tiles need very few.
export function segmentsForZoom(z) {
  if (z <= 13) return 2;
  return 4; // z14 ≈ 2 km tiles → 512 m; z15 → 256 m; z16 ≈ 500 m → 128 m
}
