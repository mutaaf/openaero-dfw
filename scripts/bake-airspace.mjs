// Bakes the DFW Class B airspace drawn on the moving map (src/airspace.js, 0197).
//
//   node scripts/bake-airspace.mjs [path/to/classb.json]
//
// Source: FAA Aeronautical Information Services, "Class Airspace" (public domain, US Government
// work; refreshed every 56-day AIRAC cycle), the ArcGIS feature layer the FAA publishes at
// https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0
// (its sibling Boundary_Airspace layer holds only ARTCC boundaries). The query takes the 15
// "DALLAS CLASS B" shelves (IDENT DFW, SECTOR "AREA A".."AREA N") with their LOWER_VAL/LOWER_CODE
// (floor, ft MSL or SFC) and UPPER_VAL (ceiling, ft MSL), geometry in WGS84 lon/lat.
// With no argument it queries the layer itself (build time only: the game never fetches it).
//
// Output: public/airspace/dfw-classb-v1.json = { v, name, source, url, dataDate, baked, note,
//   shelves: [{ area, floorFt, floorSfc, ceilFt, label: [lon, lat], rings: [[lon, lat, ...]] }] }
// Rings are simplified (Douglas-Peucker, 25 m: the map draws 143 m to a pixel) and rounded to
// 1e-5 deg (~1 m). The output is committed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const LAYER = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0';
const QUERY = `${LAYER}/query?where=${encodeURIComponent("CLASS='B' AND IDENT='DFW'")}`
  + '&outFields=SECTOR,NAME,LOWER_VAL,LOWER_UOM,LOWER_CODE,UPPER_VAL,UPPER_UOM,UPPER_CODE&returnGeometry=true&outSR=4326&f=json';
const TOL_M = 25;
const LAT0 = 32.9;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos(LAT0 * Math.PI / 180);

async function load() {
  if (process.argv[2]) return { data: JSON.parse(readFileSync(process.argv[2], 'utf8')), dataDate: process.argv[3] || null };
  const data = await (await fetch(QUERY)).json();
  const meta = await (await fetch(`${LAYER}?f=json`)).json();
  const ms = meta.editingInfo?.dataLastEditDate;
  return { data, dataDate: ms ? new Date(ms).toISOString().slice(0, 10) : null };
}

// Douglas-Peucker on [lon, lat] points, distances in local metres.
function simplify(pts) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0] * M_PER_DEG_LON, ay = pts[a][1] * M_PER_DEG_LAT;
    const bx = pts[b][0] * M_PER_DEG_LON, by = pts[b][1] * M_PER_DEG_LAT;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = -1, worstD = 0;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * M_PER_DEG_LON - ax, py = pts[i][1] * M_PER_DEG_LAT - ay;
      const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const d = Math.hypot(px - t * dx, py - t * dy);
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worstD > TOL_M) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// A label point inside the part of the shelf the map shows as that shelf: inside its rings, outside
// every shelf with a lower floor (the FAA's Area J polygon encloses the inner shelves; the lowest
// floor applies where they overlap), as far from all of their edges as a 60 x 60 grid finds.
function inside(rings, x, y) {
  let c = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [x1, y1] = r[j], [x2, y2] = r[i];
      if ((y1 > y) !== (y2 > y) && x < x1 + (y - y1) / (y2 - y1) * (x2 - x1)) c = !c;
    }
  }
  return c;
}
function edgeDistM(rings, x, y) {
  let best = Infinity;
  const px = x * M_PER_DEG_LON, py = y * M_PER_DEG_LAT;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const ax = r[j][0] * M_PER_DEG_LON, ay = r[j][1] * M_PER_DEG_LAT;
      const dx = r[i][0] * M_PER_DEG_LON - ax, dy = r[i][1] * M_PER_DEG_LAT - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
  }
  return best;
}
function labelPoint(shelf, all) {
  const lower = all.filter((o) => o !== shelf && o.floorFt < shelf.floorFt).map((o) => o.pts);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of shelf.pts) for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let best = null;
  for (let i = 0; i < 60; i++) {
    for (let j = 0; j < 60; j++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / 60, y = y0 + (y1 - y0) * (j + 0.5) / 60;
      if (!inside(shelf.pts, x, y) || lower.some((o) => inside(o, x, y))) continue;
      const d = Math.min(edgeDistM(shelf.pts, x, y), ...lower.map((o) => edgeDistM(o, x, y)));
      if (!best || d > best.d) best = { d, p: [x, y] };
    }
  }
  if (!best) throw new Error(`no label point for area ${shelf.area}`);
  return best.p;
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;
const ft = (val, uom) => {
  if (uom !== 'FT') throw new Error(`unexpected unit ${uom}`);
  return val;
};

const { data, dataDate } = await load();
if (!data.features?.length) throw new Error(`no features: ${JSON.stringify(data).slice(0, 300)}`);
const raw = data.features.map(({ attributes: a, geometry: g }) => {
  if (a.UPPER_CODE !== 'MSL') throw new Error(`${a.SECTOR}: ceiling ${a.UPPER_CODE}`);
  const floorSfc = a.LOWER_CODE === 'SFC';
  if (!floorSfc && a.LOWER_CODE !== 'MSL') throw new Error(`${a.SECTOR}: floor ${a.LOWER_CODE}`);
  return {
    area: a.SECTOR.replace(/^AREA\s+/, ''),
    floorFt: floorSfc ? 0 : ft(a.LOWER_VAL, a.LOWER_UOM),
    floorSfc,
    ceilFt: ft(a.UPPER_VAL, a.UPPER_UOM),
    pts: g.rings.map((r) => simplify(r)),
  };
});
const shelves = raw.map((s) => ({
  area: s.area,
  floorFt: s.floorFt,
  floorSfc: s.floorSfc,
  ceilFt: s.ceilFt,
  label: labelPoint(s, raw).map(r5),
  rings: s.pts.map((r) => r.flatMap(([x, y]) => [r5(x), r5(y)])),
})).sort((p, q) => (p.area < q.area ? -1 : p.area > q.area ? 1 : p.floorFt - q.floorFt));

const out = {
  v: 1,
  name: 'DALLAS CLASS B',
  source: 'FAA Aeronautical Information Services, Class Airspace (public domain)',
  url: LAYER,
  dataDate,
  baked: new Date().toISOString().slice(0, 10),
  note: 'For reference, not for navigation',
  shelves,
};
mkdirSync('public/airspace', { recursive: true });
const json = JSON.stringify(out);
writeFileSync('public/airspace/dfw-classb-v1.json', json);
const pts = shelves.reduce((n, s) => n + s.rings.reduce((m, r) => m + r.length / 2, 0), 0);
console.log(`${shelves.length} shelves, ${pts} points, ${json.length} bytes`);
