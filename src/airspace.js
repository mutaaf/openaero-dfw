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

// Where the airplane is against the Class B, in words a kid can act on. Heights are the altimeter's
// (above sea level), the number in the ALT box beside the map.
export function airspaceStatus(shelf, mslFt) {
  if (!shelf) return 'OUTSIDE CLASS B';
  if (mslFt > shelf.ceilFt) return `ABOVE CLASS B (TOP ${ftText(shelf.ceilFt)} FT)`;
  if (shelf.floorSfc) return `IN CLASS B (GROUND-${ftText(shelf.ceilFt)} FT)`;
  if (mslFt < shelf.floorFt) return `UNDER CLASS B: FLOOR ${ftText(shelf.floorFt)} FT`;
  return `IN CLASS B (${ftText(shelf.floorFt)}-${ftText(shelf.ceilFt)} FT)`;
}

const LABEL_CLEAR_PX = 14; // no shelf label on the ownship chevron
const STATUS_BOX = 'rgba(9, 14, 26, 0.85)'; // the map's own #090e1a, under the status lines

export function createAirspace(data) {
  const air = prepareAirspace(data);
  // e2e and ?debug read this (openaeroDebug().airspace); the status line is rebuilt only when it changes.
  const state = { shelves: air.shelves.length, drawn: 0, labels: 0, area: null, status: '', note: NOT_FOR_NAV, frames: 0 };
  let lastShelf, lastBand = NaN, statusW = 0;
  const inBounds = (lx, ly, w, h, cx, cy) => lx > 16 && lx < w - 16 && ly > 22 && ly < h - 26
    && Math.abs(lx - cx) + Math.abs(ly - cy) > LABEL_CLEAR_PX;
  // Under the runways and the ownship: each shelf's outline and its chart label, haloed. A shelf whose baked
  // label is off the map gets it at its outline's nearest point to the airplane, if that is on the map
  // (clear of the NAV1 line at the top, the status lines at the bottom and the chevron).
  function draw(ctx, cx, cy, scale, pos) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const vx0 = pos.x - cx / scale, vx1 = pos.x + (w - cx) / scale;
    const vz0 = pos.z - cy / scale, vz1 = pos.z + (h - cy) / scale;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
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
    }
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#090e1a';
    ctx.fillStyle = TEXT;
    for (const s of air.shelves) {
      if (s.x1 < vx0 || s.x0 > vx1 || s.z1 < vz0 || s.z0 > vz1) continue;
      let lx = cx + (s.lx - pos.x) * scale, ly = cy + (s.lz - pos.z) * scale;
      if (!inBounds(lx, ly, w, h, cx, cy)) {
        let bd = Infinity;
        for (const r of s.rings) {
          for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
            const ax = r[j] - pos.x, az = r[j + 1] - pos.z, dx = r[i] - r[j], dz = r[i + 1] - r[j + 1];
            const l2 = dx * dx + dz * dz;
            const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + az * dz) / l2)) : 0;
            const px = ax + t * dx, pz = az + t * dz, d = px * px + pz * pz;
            if (d < bd) { bd = d; lx = cx + px * scale; ly = cy + pz * scale; }
          }
        }
        if (!inBounds(lx, ly, w, h, cx, cy)) continue;
      }
      ctx.strokeText(s.text, lx, ly);
      ctx.fillText(s.text, lx, ly);
      labels++;
    }
    ctx.lineWidth = 1;
    state.drawn = drawn; state.labels = labels;
  }
  // Over everything (main.js calls it last in renderRadar): the status line and NOT FOR NAVIGATION on a dark box.
  function status(ctx, pos, mslFt) {
    const h = ctx.canvas.height;
    const shelf = shelfAt(air, pos.x, pos.z);
    const band = !shelf ? 0 : mslFt > shelf.ceilFt ? 1 : !shelf.floorSfc && mslFt < shelf.floorFt ? 2 : 3;
    ctx.font = '9px monospace';
    if (shelf !== lastShelf || band !== lastBand) {
      lastShelf = shelf; lastBand = band;
      state.area = shelf ? shelf.area : null;
      state.status = airspaceStatus(shelf, mslFt);
      statusW = Math.max(ctx.measureText(state.status).width, ctx.measureText(NOT_FOR_NAV).width);
    }
    ctx.fillStyle = STATUS_BOX;
    ctx.fillRect(0, h - 25, Math.ceil(statusW) + 8, 25);
    ctx.textAlign = 'left';
    ctx.fillStyle = shelf ? TEXT : NOTE;
    ctx.fillText(state.status, 4, h - 14);
    ctx.fillStyle = NOTE;
    ctx.fillText(NOT_FOR_NAV, 4, h - 4);
    state.frames++;
  }
  return { air, state, draw, status };
}

// Fetch the baked file (same origin) and build the layer. A failure rejects; main.js warns and draws no airspace.
export async function loadAirspace(base = import.meta.env.BASE_URL) {
  const res = await fetch(base + AIRSPACE_PATH);
  if (!res.ok) throw new Error(`airspace: ${res.status}`);
  return createAirspace(await res.json());
}
