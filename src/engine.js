// Engines: thrust from airspeed, air density and spool state. Pure; tests/unit/engine.test.js.
//
// `spec.engine` (aircraft.js) is one of:
//   { type: 'piston-prop', thrustTableN: [[tasMps, N], …], windmillCd, spoolTau }
//     Full-throttle sea-level thrust vs true airspeed (a fixed-pitch prop unloads and
//     gains RPM as it speeds up, so the curve is flat, then falls), scaled by the
//     normally-aspirated power lapse: indicated power ∝ δ/√θ (SAE J1349 / Lycoming: pressure
//     ratio over √temperature ratio) less a friction power that the thin air does not shrink
//     (J1349's structure), so a hot day costs a few %, altitude a lot: 68% at 10,000 ft, 58%
//     at 14,000 (0099). At idle the windmilling prop is drag.
//   { type: 'turbofan', staticThrustN, idleFraction, machLapse: [k1, k2], densityExp, spoolTau }
//     T = T0·σ^densityExp·(1 − k1·M + k2·M²), idle a small fraction of it.
// `n` is the engine's spooled power setting in [0, 1]; it follows the throttle with a
// first-order lag that is slower near idle (jets) or almost instant (pistons).

import { ISA_P0, isaPressure } from './atmosphere.js';
import { FT_TO_M } from './constants.js';

// Pressure altitude (ft) of a static pressure (ISA troposphere / lower stratosphere).
const isaAltFt = (p) => (p >= 22632 ? (1 - Math.pow(p / ISA_P0, 0.190263)) * 145442.16 : 36089.24 + Math.log(22632 / p) * 20805.8);

const lerpTable = (table, x) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
};

// Friction is a tenth of sea-level indicated power, so brake power = (10·δ/√θ - 1) / 9, with
// δ = p / 101325 Pa, θ = T / 288.15 K. J1349 assumes 15% and Gagg and Farrar's σ - (1 - σ)/7.55
// implies ~12%; a fixed-pitch prop's RPM (and so its friction) falls with altitude, and a
// tenth climbs within 1% of JSBSim's own IO-360 (public/jsbsim/) at 10,000 and 14,000 ft.
export const pistonPowerLapse = (pressurePa, tempK) => (10 * pressurePa / 101325 / Math.sqrt(tempK / 288.15) - 1) / 9;

// Thrust (N) at spool `n`, true airspeed (m/s), the air (atmosphere.js airAt: sigma,
// pressurePa, tempK), Mach and dynamic pressure (Pa).
export function engineThrust(spec, n, tasMps, air, mach, qPa) {
  const e = spec.engine;
  if (!e) return n * spec.maxThrustN;
  if (e.type === 'piston-prop') {
    const full = lerpTable(e.thrustTableN, tasMps) * pistonPowerLapse(air.pressurePa, air.tempK);
    const windmill = (e.windmillCd ?? 0) * qPa * spec.wingAreaM2;
    return n * full - (1 - n) * windmill;
  }
  const [k1, k2] = e.machLapse;
  const full = e.staticThrustN * Math.pow(air.sigma, e.densityExp) * Math.max(0, 1 - k1 * mach + k2 * mach * mach);
  const idle = e.idleFraction ?? 0;
  return full * (idle + (1 - idle) * n);
}

// Max climb thrust (N, all engines), the CLB rating a crew climbs on, for a turbofan with
// `spec.engine.climb` (0135). Full throttle is the take-off/go-around rating (staticThrustN's
// lapse); the climb rating is less below the top of climb. M. Bartel & T. M. Young, "Simplified
// Thrust and Fuel Consumption Models for Modern Two-Shaft Turbofan Engines", J. Aircraft 45(4),
// 2008, eqs. 15-19: the climb thrust as a ratio of the top-of-climb thrust Fcr (here CFM's max
// climb at climb.refFt, climb.refMach), by the pressure ratio P/Pcr and CAS/CAScr, in three bands
// (above 30,000 ft, 10,000-30,000, below 10,000). The fits of their Tables 2-4 (d, n, m) are
// OpenAP's (J. Sun et al., Aerospace 7(8) 104, 2020; openap/thrust.py, read 2026-11-03); `n` is
// taken at their moderate climb, 2,500 ft/min (±1,500 moves the thrust ±2%). Needs Mach > 0: CAS
// is floored at a tenth of the top of climb's so a caller on the ground never gets Infinity.
const casRatio = (pressurePa, mach) => Math.sqrt(5 * (Math.pow((pressurePa / ISA_P0) * (Math.pow(1 + 0.2 * mach * mach, 3.5) - 1) + 1, 2 / 7) - 1));
export function maxClimbThrustN(spec, air, mach) {
  const c = spec.engine.climb;
  const roc = 2500;
  const pcr = isaPressure(c.refFt * FT_TO_M);
  const vr = Math.max(0.1, casRatio(air.pressurePa, mach) / casRatio(pcr, c.refMach)); // CAS / CAS at the top of climb
  const pr = air.pressurePa / pcr;
  const ft = isaAltFt(air.pressurePa);
  let ratio;
  if (ft > 30000) {
    const mr = mach / c.refMach;
    ratio = (-0.4204 * mr + 1.0824) * Math.log(pr) + Math.pow(mr, -0.11); // eqs. 15, 16
  } else {
    const n = 2.667e-5 * roc + 0.8633;
    const band2 = (p) => Math.pow(vr, -0.1) * Math.pow(p, -0.355 * vr + n); // eqs. 17, 18
    if (ft > 10000) ratio = band2(pr);
    else {
      const p10 = isaPressure(10000 * FT_TO_M) / pcr;
      const m = -0.12043 * vr - 8.8889e-9 * roc * roc + 2.4444e-5 * roc + 0.47379;
      ratio = m * pr + band2(p10) - m * p10; // eq. 19
    }
  }
  return ratio * c.refThrustN;
}

// Advance the spool state towards the throttle command over dt (s).
export function spoolEngine(spec, n, throttle, dt) {
  const e = spec.engine;
  if (!e) return throttle;
  // Jets accelerate slowly from idle (τ grows as n falls), decelerate at the base rate.
  const tau = throttle > n && e.type === 'turbofan' ? e.spoolTau * (1 + 2 * (1 - n) * (1 - n)) : e.spoolTau;
  return n + (throttle - n) * Math.min(1, dt / tau);
}

// Throttle that produces `thrustN` at a steady spool (thrust is linear in n).
export function throttleForThrust(spec, thrustN, tasMps, air, mach, qPa) {
  const t0 = engineThrust(spec, 0, tasMps, air, mach, qPa);
  const t1 = engineThrust(spec, 1, tasMps, air, mach, qPa);
  return Math.max(0, Math.min(1, (thrustN - t0) / (t1 - t0)));
}
