// The results card's track plot (ticket 0211, turns around a point; 0223, the rectangular course: track.rect; 0224, S-turns: track.sTurns): the ground track seen from above, north up,
// round the pole: the circle asked for (dashed), the entry (grey), the two circles flown (sky), the pole (amber) and
// the wind's arrow (the way the air moves). Imported by results.js only, so it rides in that lazy chunk. Pure: a
// string for #trackPlot's innerHTML (no DOM), tested in tests/unit/trackPlot.test.js.
// track: aroundPoint.js gradeAroundPoint's { pts (x, z pairs from the pole, metres, sim frame: +x east, +z south),
// n, start (the first circling sample, −1 for none), R (metres), wind: [fromDeg, kts] | null }.
import { approachGeometry, AIM_POINT_M, GLIDE_DEG } from './airports.js';
const r1 = (v) => Math.round(v * 10) / 10;

// track.rect (the rectangular course, 0223): [hx, hz], the field's half sides (metres), centred on the origin; R is then
// the distance asked off its edges, so the path asked is the field grown by R (rounded corners of radius R).
// track.sTurns (S-turns across a road, 0224): the number of half-circles, R their radius; the origin is the first pole on
// the road (east-west, z = 0) and they go west, left first (north), so the view is centred on their middle, −halves·R east.
// Its view is S_ASPECT times wider than tall (the card's plot box is ~2.3-3.4 times wider than tall), the long run-in
// from the south left out (clipped), and room west of the S for the wind's arrow (device panel: its label sat on the S).
export const S_ASPECT = 2.3;
export const plotCentreX = (track) => (track.sTurns ? -track.sTurns * track.R : 0);
export function trackExtent(track) {
  const c = plotCentreX(track), k = track.sTurns ? S_ASPECT : 1;
  let ext = track.rect ? Math.max(track.rect[0], track.rect[1]) + track.R * 1.15 : track.sTurns ? (track.sTurns + 1.5) * track.R : track.R * 1.3;
  for (let i = track.sTurns ? 2 * Math.max(0, track.start) : 0; i < 2 * track.n; i += 2) ext = Math.max(ext, Math.abs(track.pts[i] - c), k * Math.abs(track.pts[i + 1]));
  return ext * 1.08;
}
// The S asked: half-circles of radius R from pole to pole, north of the road first (SVG y is +z, south: down).
function sPath(halves, R) {
  let d = 'M0 0';
  for (let k = 0; k < halves; k++) d += `A${r1(R)} ${r1(R)} 0 0 ${k % 2} ${r1(-2 * (k + 1) * R)} 0`;
  return d;
}

function path(pts, a, b) {
  let d = '';
  for (let i = a; i < b; i++) d += `${i === a ? 'M' : 'L'}${r1(pts[2 * i])} ${r1(pts[2 * i + 1])}`;
  return d;
}

// px: the plot's height on screen (the labels stay ≥ 11 px tall however small the box is: panel).
export function trackPlotSvg(track, px = 144) {
  const { pts, n, R, wind, rect, sTurns } = track;
  const s0 = track.start < 0 ? n : Math.min(track.start, n);
  // ext: the view's half width; ez its half height (the same but for the S's wide view).
  const ext = trackExtent(track), c = plotCentreX(track), ez = sTurns ? ext / S_ASPECT : ext;
  const fs = r1(Math.max(ez * 0.11, 12 * 2 * ez / Math.max(60, px)));
  const line = 'fill="none" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"';
  let svg = `<svg viewBox="${r1(c - ext)} ${r1(-ez)} ${r1(2 * ext)} ${r1(2 * ez)}" width="100%" style="height:calc(100% - ${LEGEND_PX}px)" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`
    + (sTurns ? `<path d="M${r1(c - ext)} 0L${r1(c + ext)} 0" ${line} stroke="#64748b" stroke-width="3"/><path d="${sPath(sTurns, R)}" ${line} stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 4"/>`
      : rect ? `<rect x="${r1(-rect[0])}" y="${r1(-rect[1])}" width="${r1(2 * rect[0])}" height="${r1(2 * rect[1])}" fill="#4d7c0f" fill-opacity="0.35" stroke="#a3e635" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      + `<rect x="${r1(-rect[0] - R)}" y="${r1(-rect[1] - R)}" width="${r1(2 * (rect[0] + R))}" height="${r1(2 * (rect[1] + R))}" rx="${r1(R)}" ${line} stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 4"/>`
      : `<circle r="${r1(R)}" ${line} stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 4"/>`);
  if (s0 > 0) svg += `<path d="${path(pts, 0, Math.min(n, s0 + 1))}" ${line} stroke="#94a3b8" stroke-width="1.5"/>`;
  if (n - s0 > 1) svg += `<path d="${path(pts, s0, n)}" ${line} stroke="#38bdf8" stroke-width="2.5"/>`;
  // The pole (or the field's four corner poles).
  const dot = (x, z) => `<circle cx="${r1(x)}" cy="${r1(z)}" r="${r1(ez * 0.035)}" fill="#facc15" stroke="#0f172a" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  if (sTurns) for (let k = 0; k <= sTurns; k++) svg += dot(-2 * k * R, 0); // the road's poles, one at each crossing
  else svg += rect ? dot(-rect[0], -rect[1]) + dot(rect[0], -rect[1]) + dot(-rect[0], rect[1]) + dot(rect[0], rect[1]) : dot(0, 0);
  svg += `<text x="${r1(c + ext * (sTurns ? 0.92 : 0.82))}" y="${r1(-ez * 0.8)}" font-size="${fs}" fill="#cbd5e1" text-anchor="middle" font-family="monospace">N</text>`;
  if (wind && wind[1] > 0) {
    // The air moves toward fromDeg + 180 (weather.js windVector): in this frame (−sin, cos) of the "from" bearing.
    const a = wind[0] * Math.PI / 180, ux = -Math.sin(a), uz = Math.cos(a);
    // Top left of a circle's plot; on the field itself for the rectangular course (device panel: the label sat on its path).
    const L = rect ? Math.min(ext * 0.2, rect[1] * 0.45) : ez * 0.2;
    const cx = rect ? 0 : c - ext * (sTurns ? 0.84 : 0.7), cz = rect ? -fs * 0.7 : -ez * 0.72;
    const x0 = cx - ux * L, z0 = cz - uz * L, x1 = cx + ux * L, z1 = cz + uz * L, h = ez * 0.07;
    svg += `<path d="M${r1(x0)} ${r1(z0)}L${r1(x1)} ${r1(z1)}" ${line} stroke="#f8fafc" stroke-width="2"/>`
      + `<path d="M${r1(x1)} ${r1(z1)}L${r1(x1 - ux * h - uz * h * 0.6)} ${r1(z1 - uz * h + ux * h * 0.6)}L${r1(x1 - ux * h + uz * h * 0.6)} ${r1(z1 - uz * h - ux * h * 0.6)}Z" fill="#f8fafc"/>`
      + `<text x="${r1(cx)}" y="${r1(cz + L + fs * 1.3)}" font-size="${fs}" fill="#cbd5e1" text-anchor="middle" font-family="monospace">${Math.round(wind[1])} kt</text>`;
  }
  return `${svg}</svg>`;
}

// The plot's legend for a first-timer (panel: only the aria-label said what the lines were): an HTML line under the
// SVG (in the SVG it would be clipped in a short box), which gives up LEGEND_PX of the box's height.
export const LEGEND_PX = 14;
const legend = (what) => `<div style="font-size:11px;line-height:${LEGEND_PX}px;text-align:center;color:#cbd5e1">dashed: the ${what} asked · blue: your track</div>`;
export const TRACK_LEGEND = legend('circle');
export const RECT_LEGEND = legend('path');
export const S_LEGEND = legend('S');
export const trackLegend = (track) => (track.sTurns ? S_LEGEND : track.rect ? RECT_LEGEND : TRACK_LEGEND);

export function trackLabel(track) {
  const ft = Math.round(track.R * 3.28084).toLocaleString('en-US');
  if (track.sTurns) {
    return `Your ground track across the road, seen from above with north up: the dashed S is ${track.sTurns} half-circles of ${ft} ft from pole to pole along the road`
      + (track.wind ? `, the arrow the ${Math.round(track.wind[1])} knot wind's way.` : '.');
  }
  if (track.rect) {
    return `Your ground track round the field, seen from above with north up: the dashed path is ${ft} ft off the field's edges`
      + (track.wind ? `, the arrow the ${Math.round(track.wind[1])} knot wind's way.` : '.');
  }
  return `Your ground track round the pole, seen from above with north up: the dashed circle is the ${ft} ft asked for`
    + (track.wind ? `, the arrow the ${Math.round(track.wind[1])} knot wind's way.` : '.');
}

// --- The approach profile (ticket 0227) ----------------------------------------------------------------------------
// The last 30 s of the landing replay's ring buffer (replay.js, 0019: no new recording) seen from the side, against the
// 3° path through the aim point (airports.js approachGeometry: the CG's height above the threshold, the height the
// spawns, the gate and the coach fly) and a ±0.5° band, "close to it" (where the PAPI turns all white or all red; its two-and-two is ±10', aero.js
// papiWhiteLights). Built once when the card opens (no per-frame work); pure: strings for #profilePlot, tested in
// tests/unit/profilePlot.test.js.

export const PROFILE_STRIDE = 14; // replay.js's sample layout: t, pos xyz, ... (REPLAY_STRIDE; a unit card pins it)
export const PROFILE_MIN_S = 5; // less final than this in the buffer: no plot
export const BAND_DEG = 0.5;
const RAD = Math.PI / 180;
const TAN_HI = Math.tan((GLIDE_DEG + BAND_DEG) * RAD), TAN_LO = Math.tan((GLIDE_DEG - BAND_DEG) * RAD), TAN_GS = Math.tan(GLIDE_DEG * RAD);
const CONE = Math.tan(15 * RAD); // airports.js selectActiveRunway's final: within 15° of the centreline (300 m at least)
// Judged before the threshold only: past it the band narrows to the aim point under a flaring CG (physics panel: a C172
// flare to 531 m read "above the band over the runway"), and the PAPI's guidance ends there.
const RUN_MIN_S = 1; // outside the band for less than this is a gust, not the approach
const MERGE_S = 1; // one side's runs this close together are one run
const START_MIN_M = 300; // the track must start this far before the threshold: else it is no final (a land-ahead after takeoff)
const FT = 3.28084, NM = 1852;

// buf: replay.js's buffer; end: the runway end landed on; tdPastM: the touchdown's metres past the threshold
// (landing.js result.touchdown.pastThresholdM). Returns null for nothing worth a plot, else { pts (x, h pairs: x the
// metres to the aim point, positive before it; h the CG's metres above the threshold), n, tdX, tdH, seconds,
// runs: [{ side: 'above' | 'below', fromM, toM }] (metres to the threshold), thrDevFt (ft above the path at the
// threshold, null if the track does not reach it) }.
export function profilePoints(buf, end, tdPastM) {
  if (!buf || !end || !(buf.count > 1) || !Number.isFinite(tdPastM)) return null;
  const d = buf.data, S = PROFILE_STRIDE, at = (i) => ((buf.head - buf.count + i + buf.n) % buf.n) * S;
  const tdX = AIM_POINT_M - tdPastM, pos = { x: 0, y: 0, z: 0 };
  const geo = (i) => { const o = at(i); pos.x = d[o + 1]; pos.y = d[o + 2]; pos.z = d[o + 3]; return approachGeometry(end, pos); };
  // The touchdown: the first sample at or past its point along the runway.
  let k = -1;
  for (let i = 0; i < buf.count; i++) if (geo(i).distM + AIM_POINT_M <= tdX) { k = i; break; }
  if (k < 1) return null;
  // Back from it while on the final (inside the cone) and flying towards the runway (x rising as we go back).
  let a = k, prevX = geo(k).distM + AIM_POINT_M;
  while (a > 0) {
    const g = geo(a - 1), x = g.distM + AIM_POINT_M;
    if (Math.abs(g.crossM) > Math.max(300, Math.max(g.distM, 0) * CONE) || x < prevX - 1) break;
    prevX = x; a--;
  }
  const seconds = d[at(k)] - d[at(a)];
  if (seconds < PROFILE_MIN_S) return null;
  if (geo(a).distM < START_MIN_M) return null;
  const n = k - a + 1, pts = new Float32Array(2 * n), side = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const g = geo(a + i), x = g.distM + AIM_POINT_M, h = g.heightAbovePathM + g.pathHeightM;
    pts[2 * i] = x; pts[2 * i + 1] = h;
    side[i] = x < AIM_POINT_M ? 0 : h > x * TAN_HI ? 1 : h < x * TAN_LO ? -1 : 0;
  }
  // Runs outside the band by sample time (any replay rate or airspeed): one side's runs under MERGE_S apart are joined
  // first (two short excursions round a single in-band sample are one), then those under RUN_MIN_S dropped.
  const t = (i) => d[at(a + i)], raw = [];
  for (let i = 0; i < n;) {
    let j = i;
    while (j < n && side[j] === side[i]) j++;
    if (side[i]) {
      const last = raw[raw.length - 1];
      if (last && last.s === side[i] && t(i) - t(last.j) < MERGE_S) last.j = j - 1; else raw.push({ s: side[i], i, j: j - 1 });
    }
    i = j;
  }
  const dt = buf.dt || 0;
  const runs = raw.filter((r) => t(r.j) - t(r.i) + dt >= RUN_MIN_S)
    .map((r) => ({ side: r.s > 0 ? 'above' : 'below', fromM: pts[2 * r.i] - AIM_POINT_M, toM: pts[2 * r.j] - AIM_POINT_M }));
  // At the threshold (x = the aim point's distance): the height off the path there, if the track crosses it.
  let thrDevFt = null;
  for (let i = 1; i < n; i++) {
    const x0 = pts[2 * i - 2], x1 = pts[2 * i];
    if (x0 >= AIM_POINT_M && x1 <= AIM_POINT_M) {
      const f = x0 === x1 ? 0 : (x0 - AIM_POINT_M) / (x0 - x1), h = pts[2 * i - 1] + (pts[2 * i + 1] - pts[2 * i - 1]) * f;
      thrDevFt = (h - AIM_POINT_M * TAN_GS) * FT;
      break;
    }
  }
  return { pts, n, tdX, tdH: pts[2 * n - 1], seconds, runs, thrDevFt };
}

// A distance to the threshold in words: NM out, feet out close in (never bare "ft": that reads as a height), the runway past it.
export const where = (m) => (m <= 0 ? 'the runway' : m < 0.15 * NM ? `${Math.max(100, Math.round(m * FT / 100) * 100).toLocaleString('en-US')} ft out` : `${(m / NM).toFixed(1)} NM`);
const span = (r) => (r.fromM <= 0 && r.toM <= 0 ? 'over the runway' : where(r.fromM) === where(r.toM) ? `at ${where(r.fromM)}` : `from ${where(r.fromM)} to ${where(r.toM)}`);
const RUNS_NAMED = 3; // past these, the rest are counted (an oscillating final read 14 clauses: first-timer panel)
// The plot's alt text, and the line a screen reader gets: where the approach left the band, and the threshold.
// The band is ±0.5° ("close to the path"), wider than the PAPI's two-white-two-red (±10'): never called "on slope".
export function profileSummary(p) {
  const named = p.runs.slice(0, RUNS_NAMED);
  const parts = named.map((r, i) => `${r.side} ${i && named[i - 1].side !== r.side ? 'it' : 'the band'} ${span(r)}`);
  const more = p.runs.length - named.length;
  if (more) parts.push(`out of it ${more} more time${more > 1 ? 's' : ''} to ${where(p.runs[p.runs.length - 1].toM)}`);
  let s = `Your approach from the side: ${parts.length ? parts.join(', then ') : 'close to the 3° path all the way down'}`;
  if (p.thrDevFt != null) {
    const ft = Math.round(Math.abs(p.thrDevFt) / 5) * 5;
    s += ft < 10 ? ', on the path at the threshold' : `, ${ft} ft ${p.thrDevFt > 0 ? 'high' : 'low'} at the threshold`;
  }
  return `${s}.`;
}

export const PROFILE_W = 300, PROFILE_H = 100;
export const profileLegend = `<div style="max-width:22rem;margin-inline:auto;font-size:11px;line-height:${LEGEND_PX}px;text-align:center;color:#cbd5e1">dashed: the 3° path · shaded: close to it · solid blue: you · dot: touchdown</div>`;
// The side view: the runway to the right, the approach coming in from the left; heights stretched (a 3° path is 1:19).
export function profileSvg(p) {
  const L = 6, R = 6, T = 16, B = 16, w = PROFILE_W - L - R, h = PROFILE_H - T - B;
  const xMax = p.pts[0], xMin = Math.min(p.tdX, p.pts[2 * (p.n - 1)]) - 0.06 * (xMax - p.tdX);
  let hMax = xMax * TAN_HI;
  for (let i = 0; i < p.n; i++) hMax = Math.max(hMax, p.pts[2 * i + 1]);
  hMax *= 1.08;
  const X = (x) => r1(L + (xMax - x) / (xMax - xMin) * w), Y = (y) => r1(T + h - Math.max(0, y) / hMax * h);
  const line = 'fill="none" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"';
  const ground = Y(0), xr = Math.max(xMin, -1e9);
  // The band: from the left edge to the aim point and back under it.
  const band = `M${X(xMax)} ${Y(xMax * TAN_HI)}L${X(0)} ${ground}L${X(xMax)} ${Y(xMax * TAN_LO)}Z`;
  let track = '';
  for (let i = 0; i < p.n; i++) track += `${i ? 'L' : 'M'}${X(p.pts[2 * i])} ${Y(p.pts[2 * i + 1])}`;
  // fs 12.6 of a 300-wide view: ≥ 11 px on a 262 px plot (a 320 px phone; device panel: 10 read 8.7-10.6 px under 390).
  const thr = X(AIM_POINT_M), fs = 12.6;
  const label = (x, y, t, anchor = 'middle') => `<text x="${x}" y="${y}" font-size="${fs}" fill="#cbd5e1" text-anchor="${anchor}" font-family="monospace">${t}</text>`;
  // An opaque ground (the card's glass let the HUD's tape numbers show through as false scale marks).
  return `<svg viewBox="0 0 ${PROFILE_W} ${PROFILE_H}" width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style="display:block">`
    + `<rect width="${PROFILE_W}" height="${PROFILE_H}" rx="6" fill="#0a0f1d"/>`
    + `<path d="M${L} ${T}L${PROFILE_W - R} ${T}" ${line} stroke="#334155" stroke-width="1" stroke-dasharray="2 3"/>`
    + `<path d="${band}" fill="#34d399" fill-opacity="0.18" stroke="#34d399" stroke-opacity="0.5" stroke-width="1" stroke-dasharray="1 3" vector-effect="non-scaling-stroke"/>`
    + `<path d="M${L} ${ground}L${PROFILE_W - R} ${ground}" ${line} stroke="#64748b" stroke-width="1"/>`
    + `<path d="M${thr} ${ground}L${X(xr)} ${ground}" ${line} stroke="#cbd5e1" stroke-width="4" stroke-linecap="butt"/>`
    // The track under the dashed path (first-timer panel: on a good approach the track hid the dashes the legend names).
    + `<path d="${track}" ${line} stroke="#38bdf8" stroke-width="2.5"/>`
    + `<path d="M${X(xMax)} ${Y(xMax * TAN_GS)}L${X(0)} ${ground}" ${line} stroke="#f8fafc" stroke-width="1.5" stroke-dasharray="5 4"/>`
    + `<circle cx="${X(p.tdX)}" cy="${ground}" r="3.5" fill="#facc15" stroke="#0f172a" stroke-width="1"/>`
    + label(L + 2, T - 3, `${Math.round(hMax * FT / 10) * 10} ft up`, 'start')
    + label(L + 2, PROFILE_H - 2, xMax - AIM_POINT_M < 0.15 * NM ? where(xMax - AIM_POINT_M) : `${where(xMax - AIM_POINT_M)} out`, 'start')
    + label(thr, PROFILE_H - 2, 'runway', thr > PROFILE_W - R - 48 ? 'end' : 'start')
    + '</svg>';
}
