// DFW's Class B airspace on the moving map (0197), a lazy chunk fetched by main.js only where the map
// panel is shown (it is hidden on touch screens and below lg, styles.css), never in the boot chunk.
// Data: public/airspace/dfw-classb-v1.json, baked by scripts/bake-airspace.mjs from the FAA's Class
// Airspace layer (public domain): 15 shelves, each a floor (ft MSL, or the surface) and a ceiling.
// Where the FAA's polygons overlap (Area J encloses the inner shelves) the lowest floor applies.
// For reference, not for navigation: the map says so wherever it draws a shelf.
import { latLonToSimMeters } from './geo.js';

export const AIRSPACE_PATH = 'airspace/dfw-classb-v1.json';
export const NOT_FOR_NAV = 'NOT FOR NAVIGATION';
const LINE = 'rgba(129, 140, 248, 0.7)'; // indigo-400: Class B is charted blue; apart from the runways' sky blue
const TEXT = '#a5b4fc'; // indigo-300 on the map's #090e1a: 9.6:1
const NOTE = '#cbd5e1';

const ftText = (ft) => ft.toLocaleString('en-US');

// The chart's "ceiling/floor" in hundreds of feet: 110/SFC, 110/40.
export function shelfLabel(s) {
  return `${s.ceilFt / 100}/${s.floorSfc ? 'SFC' : s.floorFt / 100}`;
}

function inRing(r, x, z) {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const x1 = r[j], z1 = r[j + 1], x2 = r[i], z2 = r[i + 1];
    if ((z1 > z) !== (z2 > z) && x < x1 + (z - z1) / (z2 - z1) * (x2 - x1)) c = !c;
  }
  return c;
}

// Turn the baked lon/lat file into sim metres (x east, z south), once.
export function prepareAirspace(data) {
  if (data?.v !== 1 || !Array.isArray(data.shelves)) throw new Error('airspace: unknown file version');
  const shelves = data.shelves.map((s) => {
    const rings = s.rings.map((r) => {
      const out = new Float32Array(r.length);
      for (let i = 0; i < r.length; i += 2) {
        const p = latLonToSimMeters(r[i + 1], r[i]);
        out[i] = p.x; out[i + 1] = p.z;
      }
      return out;
    });
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const r of rings) {
      for (let i = 0; i < r.length; i += 2) {
        x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); z0 = Math.min(z0, r[i + 1]); z1 = Math.max(z1, r[i + 1]);
      }
    }
    const lp = latLonToSimMeters(s.label[1], s.label[0]);
    return { area: s.area, floorFt: s.floorFt, floorSfc: s.floorSfc, ceilFt: s.ceilFt, rings, x0, x1, z0, z1, lx: lp.x, lz: lp.z, text: shelfLabel(s) };
  });
  return { name: data.name, dataDate: data.dataDate, shelves };
}

// The shelf over (x, z): the lowest floor among the polygons that hold the point, or null outside.
export function shelfAt(air, x, z) {
  let best = null;
  for (const s of air.shelves) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1 || (best && s.floorFt >= best.floorFt)) continue;
    let n = 0;
    for (const r of s.rings) if (inRing(r, x, z)) n++;
    if (n % 2) best = s;
  }
  return best;
}

// Where the airplane is against the Class B, in words a kid can act on.
export function airspaceStatus(shelf, mslFt) {
  if (!shelf) return 'OUTSIDE CLASS B';
  if (mslFt > shelf.ceilFt) return `ABOVE CLASS B (TOP ${ftText(shelf.ceilFt)})`;
  if (shelf.floorSfc) return `IN CLASS B (SFC-${ftText(shelf.ceilFt)})`;
  if (mslFt < shelf.floorFt) return `UNDER CLASS B: FLOOR ${ftText(shelf.floorFt)}`;
  return `IN CLASS B (${ftText(shelf.floorFt)}-${ftText(shelf.ceilFt)})`;
}

export function createAirspace(data) {
  const air = prepareAirspace(data);
  // e2e and ?debug read this (openaeroDebug().airspace); the status line is rebuilt only when it changes.
  const state = { shelves: air.shelves.length, drawn: 0, labels: 0, area: null, status: '', note: NOT_FOR_NAV, frames: 0 };
  let lastShelf, lastBand = NaN;
  // Under the runways and the ownship: outlines, the labels on screen, then the status and the note.
  function draw(ctx, cx, cy, scale, pos, mslFt) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const vx0 = pos.x - cx / scale, vx1 = pos.x + (w - cx) / scale;
    const vz0 = pos.z - cy / scale, vz1 = pos.z + (h - cy) / scale;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT;
    let drawn = 0, labels = 0;
    for (const s of air.shelves) {
      if (s.x1 < vx0 || s.x0 > vx1 || s.z1 < vz0 || s.z0 > vz1) continue;
      drawn++;
      ctx.beginPath();
      for (const r of s.rings) {
        ctx.moveTo(cx + (r[0] - pos.x) * scale, cy + (r[1] - pos.z) * scale);
        for (let i = 2; i < r.length; i += 2) ctx.lineTo(cx + (r[i] - pos.x) * scale, cy + (r[i + 1] - pos.z) * scale);
        ctx.closePath();
      }
      ctx.stroke();
      const lx = cx + (s.lx - pos.x) * scale, ly = cy + (s.lz - pos.z) * scale;
      // A label only where it is clear of the NAV1 line (top) and the status lines (bottom).
      if (lx > 16 && lx < w - 16 && ly > 22 && ly < h - 24) { ctx.fillText(s.text, lx, ly); labels++; }
    }
    const shelf = shelfAt(air, pos.x, pos.z);
    const band = !shelf ? 0 : mslFt > shelf.ceilFt ? 1 : !shelf.floorSfc && mslFt < shelf.floorFt ? 2 : 3;
    if (shelf !== lastShelf || band !== lastBand) {
      lastShelf = shelf; lastBand = band;
      state.area = shelf ? shelf.area : null;
      state.status = airspaceStatus(shelf, mslFt);
    }
    ctx.textAlign = 'left';
    ctx.font = '9px monospace';
    ctx.fillStyle = shelf ? TEXT : NOTE;
    ctx.fillText(state.status, 4, h - 14);
    ctx.fillStyle = NOTE;
    ctx.fillText(NOT_FOR_NAV, 4, h - 4);
    state.drawn = drawn; state.labels = labels; state.frames++;
  }
  return { air, state, draw };
}

// Fetch the baked file (same origin) and build the layer. A failure rejects; main.js warns and draws no airspace.
export async function loadAirspace(base = import.meta.env.BASE_URL) {
  const res = await fetch(base + AIRSPACE_PATH);
  if (!res.ok) throw new Error(`airspace: ${res.status}`);
  return createAirspace(await res.json());
}
