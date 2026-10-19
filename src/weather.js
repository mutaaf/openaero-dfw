// Weather: METAR parsing, wind in the sim frame, gusts, runway components, fog.
// Pure module (no THREE, no DOM); tested in tests/unit/weather.test.js. The data comes
// from this repo's edge Worker (/openaero/api/metar → aviationweather.gov).
import { DEG_TO_RAD } from './constants.js';

const HPA_TO_INHG = 0.0295299830714;

function parseVisibility(v) {
  if (v === null || v === undefined) return 10;
  if (typeof v === 'number') return v;
  const s = String(v).replace('+', '').trim();
  // "1 1/2", "1/4", "10"
  return s.split(/\s+/).reduce((sum, part) => {
    if (part.includes('/')) { const [a, b] = part.split('/').map(Number); return sum + (b ? a / b : 0); }
    return sum + (Number(part) || 0);
  }, 0);
}

export function parseMetar(m) {
  const variable = m.wdir === 'VRB' || typeof m.wdir !== 'number';
  const windKts = Number(m.wspd) || 0;
  const gustKts = typeof m.wgst === 'number' && m.wgst > windKts ? m.wgst : windKts;
  const ceilingLayer = (m.clouds || [])
    .filter((c) => ['BKN', 'OVC', 'OVX'].includes(c.cover) && typeof c.base === 'number')
    .sort((a, b) => a.base - b.base)[0];
  return {
    icao: m.icaoId,
    raw: m.rawOb,
    obsTime: m.obsTime,
    windDirDeg: variable || windKts === 0 ? (windKts === 0 ? 0 : null) : m.wdir,
    windKts,
    gustKts,
    visibilitySm: parseVisibility(m.visib),
    ceilingFt: ceilingLayer ? ceilingLayer.base : null,
    ceilingCover: ceilingLayer ? ceilingLayer.cover : null,
    cloudLayers: cloudLayers(m.clouds),
    altimInHg: typeof m.altim === 'number' ? m.altim * HPA_TO_INHG : 29.92,
    tempC: m.temp,
    fltCat: m.fltCat || null,
    live: true,
  };
}

// How much of the sky each METAR cover code hides (oktas / 8, mid-range: FEW 1–2, SCT 3–4,
// BKN 5–7, OVC 8).
const COVERAGE = { FEW: 0.2, SCT: 0.45, BKN: 0.75, OVC: 1, OVX: 1 };

// Every reported layer up to FL200, lowest first, at most three: what the sky dome draws.
export function cloudLayers(clouds) {
  return (clouds || [])
    .filter((c) => COVERAGE[c.cover] && typeof c.base === 'number' && c.base <= 20000)
    .sort((a, b) => a.base - b.base)
    .slice(0, 3)
    .map((c) => ({ cover: c.cover, baseFt: c.base, coverage: COVERAGE[c.cover] }));
}

// Mild fallback used offline or when the API is unavailable. Never labelled "live".
export function scenarioWeather() {
  return {
    icao: 'KDFW', raw: 'SCENARIO KDFW 35010KT 10SM FEW050 18/08 A3000', obsTime: null,
    windDirDeg: 350, windKts: 10, gustKts: 10, visibilitySm: 10, ceilingFt: null, ceilingCover: null,
    cloudLayers: cloudLayers([{ cover: 'FEW', base: 5000 }]),
    altimInHg: 30.0, tempC: 18, fltCat: 'VFR', live: false,
  };
}

// Velocity of the air mass (m/s, sim frame). METAR wind is the direction it blows FROM,
// so the air moves towards dir + 180°. North (−Z) / east (+X).
export function windVector(fromDeg, speedMps) {
  if (fromDeg === null || fromDeg === undefined || !speedMps) return { x: 0, z: 0 };
  const r = fromDeg * DEG_TO_RAD;
  return { x: -Math.sin(r) * speedMps, z: Math.cos(r) * speedMps };
}

// Smooth, deterministic gusting between the steady wind and the gust value.
export function gustFactor(t, steadyKts, gustKts) {
  if (!gustKts || gustKts <= steadyKts) return steadyKts;
  const n = (Math.sin(t * 0.37) + Math.sin(t * 0.83 + 1.3) * 0.6 + Math.sin(t * 1.91 + 0.4) * 0.3) / 1.9;
  const k = Math.max(0, Math.min(1, (n + 1) / 2));
  return steadyKts + (gustKts - steadyKts) * k * k;
}

// Headwind (positive = on the nose) and crosswind (positive = from the right) for a runway.
export function runwayWindComponents(fromDeg, windKts, runwayHdgDeg) {
  if (fromDeg === null || fromDeg === undefined) return { headwindKts: 0, crosswindKts: 0 };
  const a = (fromDeg - runwayHdgDeg) * DEG_TO_RAD;
  return { headwindKts: windKts * Math.cos(a), crosswindKts: windKts * Math.sin(a) };
}

// Today's crosswind challenge (ticket 0018): of every runway end whose field has a live
// METAR, the one with the strongest crosswind and no tailwind (headwind ≥ 0). Crosswinds are
// compared to the whole knot, ties go to the longer runway. Null when nothing qualifies
// (no live weather, calm or variable wind, or under 1 kt of crosswind anywhere). With nowS,
// observations older than 90 minutes are not "today's" wind and are skipped.
export function pickCrosswindRunway(metarsByIcao, ends, nowS = null) {
  let best = null;
  for (const end of ends) {
    const wx = metarsByIcao[end.airport];
    if (!wx || !wx.live || wx.windDirDeg === null || wx.windDirDeg === undefined || !wx.windKts) continue;
    if (nowS !== null && wx.obsTime && nowS - wx.obsTime > 90 * 60) continue;
    const c = runwayWindComponents(wx.windDirDeg, wx.windKts, end.hdgT);
    if (c.headwindKts < 0) continue;
    const xw = Math.round(Math.abs(c.crosswindKts));
    if (xw < 1) continue;
    if (!best || xw > best.xw || (xw === best.xw && (end.lengthM || 0) > (best.end.lengthM || 0))) {
      best = { end, xw, crosswindKts: c.crosswindKts, headwindKts: c.headwindKts };
    }
  }
  return best && { end: best.end, crosswindKts: best.crosswindKts, headwindKts: best.headwindKts };
}

// FogExp2 density so the fog reaches ~90% at the reported visibility. "10+" SM is treated
// as 25 km so the imagery stays readable on a clear day.
export function fogDensityForVisibility(sm) {
  const m = sm >= 10 ? 25000 : Math.max(400, sm * 1609.34);
  return 1.517 / m;
}

export function metarAgeMinutes(obsTimeS, nowS) {
  return Math.max(0, Math.round((nowS - obsTimeS) / 60));
}

// DFW runs north flow (35/36) when the wind has a northerly component of 5 kt or more.
export function flowForWind(fromDeg, windKts) {
  if (fromDeg === null || fromDeg === undefined) return 'SOUTH';
  return windKts * Math.cos(fromDeg * DEG_TO_RAD) >= 5 ? 'NORTH' : 'SOUTH';
}
