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
    altimInHg: typeof m.altim === 'number' ? m.altim * HPA_TO_INHG : 29.92,
    tempC: m.temp,
    fltCat: m.fltCat || null,
    live: true,
  };
}

// Mild fallback used offline or when the API is unavailable. Never labelled "live".
export function scenarioWeather() {
  return {
    icao: 'KDFW', raw: 'SCENARIO KDFW 35010KT 10SM FEW050 18/08 A3000', obsTime: null,
    windDirDeg: 350, windKts: 10, gustKts: 10, visibilitySm: 10, ceilingFt: null, ceilingCover: null,
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
