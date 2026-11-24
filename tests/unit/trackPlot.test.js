// The results card's track plot (ticket 0211): a north-up SVG of the ground track round the pole.
import { describe, it, expect } from 'vitest';
import { trackPlotSvg, trackExtent, trackLabel, TRACK_LEGEND, trackLegend } from '../../src/trackPlot.js';

const R = 457.2;
// An entry up the east side, then one circle (sim frame: +x east, +z south).
function track() {
  const pts = [];
  for (let z = 900; z > 0; z -= 100) pts.push(R, z);
  const start = pts.length / 2;
  for (let a = 0; a > -2 * Math.PI; a -= 0.2) pts.push(R * Math.cos(a), R * Math.sin(a));
  return { pts: Float32Array.from(pts), n: pts.length / 2, start, R, wind: [180, 12] };
}

describe('track plot (0211)', () => {
  it('draws the asked circle, the entry, the circles flown, the pole, north and the wind', () => {
    const svg = trackPlotSvg(track());
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain(`<circle r="${R}"`);
    expect(svg.match(/<path d="M/g).length).toBe(4); // entry, circles, the arrow's shaft and head
    expect(svg).toContain('>N</text>');
    expect(svg).toContain('>12 kt</text>');
    expect(svg).not.toMatch(/NaN|undefined/);
  });
  it('the view holds every sample and the circle, centred on the pole', () => {
    const t = track();
    const ext = trackExtent(t);
    expect(ext).toBeGreaterThan(900); // the entry starts 900 m south
    expect(trackPlotSvg(t)).toContain(`viewBox="${-Math.round(ext * 10) / 10} `);
    expect(trackExtent({ pts: new Float32Array(0), n: 0, start: -1, R, wind: null })).toBeCloseTo(R * 1.3 * 1.08);
  });
  it('the wind arrow points the way the air moves: a south wind blows north (up the plot, −z)', () => {
    const svg = trackPlotSvg(track());
    const [, x0, z0, x1, z1] = /<path d="M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)" fill="none"[^>]*stroke="#f8fafc"/.exec(svg).map(Number);
    expect(x1).toBeCloseTo(x0, 0);
    expect(z1).toBeLessThan(z0);
  });
  it('a lesson failed on its entry draws the entry only; no wind, no arrow', () => {
    const t = track();
    const svg = trackPlotSvg({ ...t, start: -1, wind: null });
    expect(svg.match(/<path d="M/g).length).toBe(1);
    expect(svg).not.toContain(' kt</text>');
  });
  it('its labels stay at least 11 px tall in a small box (the 96 px plot of a phone held sideways: panel)', () => {
    const t = track();
    for (const px of [96, 144, 300]) {
      const svg = trackPlotSvg(t, px);
      const fs = Number(/<text[^>]*font-size="([\d.]+)"[^>]*>N</.exec(svg)[1]);
      expect(fs * px / (2 * trackExtent(t))).toBeGreaterThanOrEqual(11);
    }
  });
  it('has a legend a first-timer can read (panel)', () => {
    expect(TRACK_LEGEND).toMatch(/dashed: the circle asked · blue: your track/);
    expect(TRACK_LEGEND).toMatch(/font-size:11px/);
  });
  it('says what it shows', () => {
    expect(trackLabel(track())).toMatch(/1,500 ft asked for, the arrow the 12 knot wind's way/);
  });
});

describe('track plot: the rectangular course (0223)', () => {
  const hx = 402.3, hz = 603.5, D = 402.3;
  const rectTrack = () => {
    const pts = [];
    for (let z = hz + 900; z > -hz; z -= 100) pts.push(hx + D, z);
    return { pts: Float32Array.from(pts), n: pts.length / 2, start: 5, R: D, rect: [hx, hz], wind: [180, 12] };
  };
  it('draws the field, the path asked (the field grown by the distance, rounded corners), the four corner poles', () => {
    const svg = trackPlotSvg(rectTrack());
    expect(svg).toContain(`<rect x="${-hx}" y="${-hz}" width="${2 * hx}" height="${2 * hz}"`);
    expect(svg).toContain(`rx="${D}"`);
    expect(svg).not.toContain(`<circle r="${D}"`);
    expect(svg.match(/fill="#facc15"/g).length).toBe(4);
    expect(svg).not.toMatch(/NaN|undefined/);
    expect(trackExtent(rectTrack())).toBeGreaterThan(hz + D);
  });
  it('says what it shows, and its legend names the path', () => {
    expect(trackLabel(rectTrack())).toMatch(/round the field.*1,320 ft off the field's edges, the arrow the 12 knot wind's way/);
    expect(trackLegend(rectTrack())).toMatch(/dashed: the path asked · blue: your track/);
    expect(trackLegend({ R: 1 })).toBe(TRACK_LEGEND);
  });
});
