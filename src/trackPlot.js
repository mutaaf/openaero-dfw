// The results card's track plot (ticket 0211, turns around a point): the ground track seen from above, north up,
// round the pole: the circle asked for (dashed), the entry (grey), the two circles flown (sky), the pole (amber) and
// the wind's arrow (the way the air moves). Imported by results.js only, so it rides in that lazy chunk. Pure: a
// string for #trackPlot's innerHTML (no DOM), tested in tests/unit/trackPlot.test.js.
// track: aroundPoint.js gradeAroundPoint's { pts (x, z pairs from the pole, metres, sim frame: +x east, +z south),
// n, start (the first circling sample, −1 for none), R (metres), wind: [fromDeg, kts] | null }.
const r1 = (v) => Math.round(v * 10) / 10;

export function trackExtent(track) {
  let ext = track.R * 1.3;
  for (let i = 0; i < 2 * track.n; i++) ext = Math.max(ext, Math.abs(track.pts[i]));
  return ext * 1.08;
}

function path(pts, a, b) {
  let d = '';
  for (let i = a; i < b; i++) d += `${i === a ? 'M' : 'L'}${r1(pts[2 * i])} ${r1(pts[2 * i + 1])}`;
  return d;
}

// px: the plot's height on screen (the labels stay ≥ 11 px tall however small the box is: panel).
export function trackPlotSvg(track, px = 144) {
  const { pts, n, R, wind } = track;
  const s0 = track.start < 0 ? n : Math.min(track.start, n);
  const ext = trackExtent(track);
  const fs = r1(Math.max(ext * 0.11, 12 * 2 * ext / Math.max(60, px)));
  const line = 'fill="none" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"';
  let svg = `<svg viewBox="${r1(-ext)} ${r1(-ext)} ${r1(2 * ext)} ${r1(2 * ext)}" width="100%" style="height:calc(100% - ${LEGEND_PX}px)" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`
    + `<circle r="${r1(R)}" ${line} stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 4"/>`;
  if (s0 > 0) svg += `<path d="${path(pts, 0, Math.min(n, s0 + 1))}" ${line} stroke="#94a3b8" stroke-width="1.5"/>`;
  if (n - s0 > 1) svg += `<path d="${path(pts, s0, n)}" ${line} stroke="#38bdf8" stroke-width="2.5"/>`;
  svg += `<circle r="${r1(ext * 0.035)}" fill="#facc15" stroke="#0f172a" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  svg += `<text x="${r1(ext * 0.82)}" y="${r1(-ext * 0.8)}" font-size="${fs}" fill="#cbd5e1" text-anchor="middle" font-family="monospace">N</text>`;
  if (wind && wind[1] > 0) {
    // The air moves toward fromDeg + 180 (weather.js windVector): in this frame (−sin, cos) of the "from" bearing.
    const a = wind[0] * Math.PI / 180, ux = -Math.sin(a), uz = Math.cos(a);
    const cx = -ext * 0.7, cz = -ext * 0.72, L = ext * 0.2;
    const x0 = cx - ux * L, z0 = cz - uz * L, x1 = cx + ux * L, z1 = cz + uz * L, h = ext * 0.07;
    svg += `<path d="M${r1(x0)} ${r1(z0)}L${r1(x1)} ${r1(z1)}" ${line} stroke="#f8fafc" stroke-width="2"/>`
      + `<path d="M${r1(x1)} ${r1(z1)}L${r1(x1 - ux * h - uz * h * 0.6)} ${r1(z1 - uz * h + ux * h * 0.6)}L${r1(x1 - ux * h + uz * h * 0.6)} ${r1(z1 - uz * h - ux * h * 0.6)}Z" fill="#f8fafc"/>`
      + `<text x="${r1(cx)}" y="${r1(cz + L + fs * 1.3)}" font-size="${fs}" fill="#cbd5e1" text-anchor="middle" font-family="monospace">${Math.round(wind[1])} kt</text>`;
  }
  return `${svg}</svg>`;
}

// The plot's legend for a first-timer (panel: only the aria-label said what the lines were): an HTML line under the
// SVG (in the SVG it would be clipped in a short box), which gives up LEGEND_PX of the box's height.
export const LEGEND_PX = 14;
export const TRACK_LEGEND = `<div style="font-size:11px;line-height:${LEGEND_PX}px;text-align:center;color:#cbd5e1">dashed: the circle asked · blue: your track</div>`;

export function trackLabel(track) {
  const ft = Math.round(track.R * 3.28084).toLocaleString('en-US');
  return `Your ground track round the pole, seen from above with north up: the dashed circle is the ${ft} ft asked for`
    + (track.wind ? `, the arrow the ${Math.round(track.wind[1])} knot wind's way.` : '.');
}
