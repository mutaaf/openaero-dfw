// ICAO Standard Atmosphere (Doc 7488) to 20 km, with today's weather on top: a temperature
// deviation from the METAR and the altimeter setting. Pure; tests/unit/atmosphere.test.js.
import { FT_TO_M } from './constants.js';

export const ISA_T0 = 288.15; // K
export const ISA_P0 = 101325; // Pa
export const ISA_RHO0 = 1.225; // kg/m³
const LAPSE = 0.0065; // K/m
const R = 287.05287; // J/(kg·K)
const G0 = 9.80665;
const GAMMA = 1.4;
const H_TROP = 11000;
const T_TROP = ISA_T0 - LAPSE * H_TROP; // 216.65 K
const P_TROP = ISA_P0 * Math.pow(T_TROP / ISA_T0, G0 / (R * LAPSE)); // 22632 Pa
const MPS_PER_KT = 0.514444;

// Standard pressure (Pa) at a pressure altitude (m).
export function isaPressure(hM) {
  if (hM <= H_TROP) return ISA_P0 * Math.pow(1 - (LAPSE * hM) / ISA_T0, G0 / (R * LAPSE));
  return P_TROP * Math.exp((-G0 / (R * T_TROP)) * (hM - H_TROP));
}

export const isaTemperature = (hM) => (hM <= H_TROP ? ISA_T0 - LAPSE * hM : T_TROP);

// Air at a true altitude `altM` (m MSL). `isaDevC`: temperature deviation from standard
// (METAR temperature minus ISA at the station). `altimInHg`: the station's altimeter
// setting; every 1 inHg above 29.92 puts the standard pressure levels ~1000 ft higher.
export function airAt(altM, isaDevC = 0, altimInHg = 29.92, out = {}) {
  const pressureAltM = altM + (29.92 - altimInHg) * 1000 * FT_TO_M;
  const tK = isaTemperature(pressureAltM) + isaDevC;
  const p = isaPressure(pressureAltM);
  out.tempK = tK;
  out.pressurePa = p;
  out.rho = p / (R * tK);
  out.sigma = out.rho / ISA_RHO0;
  out.speedOfSoundMps = Math.sqrt(GAMMA * R * tK);
  return out;
}

// METAR temperature (°C) at a station elevation (m) → deviation from ISA (°C).
export const isaDeviationC = (tempC, stationElevM) =>
  (typeof tempC === 'number' ? tempC - (ISA_T0 - 273.15 - LAPSE * stationElevM) : 0);

// Indicated (equivalent) airspeed from true airspeed at density ratio σ. Below ~Mach 0.3
// the compressibility correction is under 1 kt, so EAS stands in for CAS.
export const iasFromTas = (tas, sigma) => tas * Math.sqrt(sigma);
export const tasFromIas = (ias, sigma) => ias / Math.sqrt(sigma);
export { MPS_PER_KT };
