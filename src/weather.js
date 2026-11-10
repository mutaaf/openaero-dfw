// Weather: wind in the sim frame, gusts, runway components, fog, the scenario fallback.
// Pure module (no THREE, no DOM); tested in tests/unit/weather.test.js. Reading a METAR
// (parseMetar, cloud layers, today's crosswind pick) is metar.js, a lazy chunk (0092).
import { DEG_TO_RAD } from './constants.js';

// Mild fallback used offline or when the API is unavailable. Never labelled "live".
export function scenarioWeather() {
  return {
    icao: 'KDFW', raw: 'SCENARIO KDFW 35010KT 10SM FEW050 18/08 A3000', obsTime: null,
    windDirDeg: 350, windKts: 10, gustKts: 10, visibilitySm: 10, ceilingFt: null, ceilingCover: null,
    cloudLayers: [{ cover: 'FEW', baseFt: 5000, coverage: 0.2 }], // metar.js cloudLayers' shape
    altimInHg: 30.0, tempC: 18, fltCat: 'VFR', wetRunway: false, live: false,
  };
}

// Velocity of the air mass (m/s, sim frame). METAR wind is the direction it blows FROM,
// so the air moves towards dir + 180°. North (−Z) / east (+X).
export function windVector(fromDeg, speedMps) {
  if (fromDeg === null || fromDeg === undefined || !speedMps) return { x: 0, z: 0 };
  const r = fromDeg * DEG_TO_RAD;
  return { x: -Math.sin(r) * speedMps, z: Math.cos(r) * speedMps };
}

// The wind near the ground (ticket 0106). A METAR's wind is measured 10 m (33 ft) above the
// runway (the ASOS/AWOS anemometer); below that the surface boundary layer thins it by the log
// law, ln(z/z0) / ln(10/z0), with z0 = 0.03 m: Davenport's "open" class (flat, grass, few
// obstacles: an airfield), WMO-No. 8 Annex 5.B. Read at the wing (the CG's height), never
// below z = 1 m (60%): a parked or rolling aircraft feels most of the wind. Above 10 m the
// sim flies the reported wind (no profile aloft). Parked aircraft stay put on tyre friction.
const SURFACE_Z0_M = 0.03;
export function surfaceWindFactor(heightM) {
  if (!(heightM < 10)) return 1;
  return Math.log(Math.max(1, heightM) / SURFACE_Z0_M) / Math.log(10 / SURFACE_Z0_M);
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
