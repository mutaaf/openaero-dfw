// The results card's track plot (ticket 0211, turns around a point; 0223, the rectangular course: track.rect; 0224, S-turns: track.sTurns): the ground track seen from above, north up,
// round the pole: the circle asked for (dashed), the entry (grey), the two circles flown (sky), the pole (amber) and
// the wind's arrow (the way the air moves). Imported by results.js only, so it rides in that lazy chunk. Pure: a
// string for #trackPlot's innerHTML (no DOM), tested in tests/unit/trackPlot.test.js.
// track: aroundPoint.js gradeAroundPoint's { pts (x, z pairs from the pole, metres, sim frame: +x east, +z south),
// n, start (the first circling sample, −1 for none), R (metres), wind: [fromDeg, kts] | null }.
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
