// Engines: thrust from airspeed, air density and spool state. Pure; tests/unit/engine.test.js.
//
// `spec.engine` (aircraft.js) is one of:
//   { type: 'piston-prop', thrustTableN: [[tasMps, N], …], windmillCd, spoolTau }
//     Full-throttle sea-level thrust vs true airspeed (a fixed-pitch prop unloads and
//     gains RPM as it speeds up, so the curve is flat, then falls), scaled by the
//     normally-aspirated power lapse: indicated power ∝ δ/√θ (SAE J1349 / Lycoming: pressure
//     ratio over √temperature ratio) less the engine's friction power, which altitude does
//     not shrink (Gagg & Ferrar: 1/7.55 of sea-level brake power), so a hot day costs a few %,
//     altitude a lot: 67% at 10,000 ft, 57% at 14,000 (0099). At idle the windmilling prop
//     is drag.
//   { type: 'turbofan', staticThrustN, idleFraction, machLapse: [k1, k2], densityExp, spoolTau }
//     T = T0·σ^densityExp·(1 − k1·M + k2·M²), idle a small fraction of it.
// `n` is the engine's spooled power setting in [0, 1]; it follows the throttle with a
// first-order lag that is slower near idle (jets) or almost instant (pistons).

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

// Friction is 1/8.55 of sea-level indicated power (Gagg-Ferrar's P/P0 = σ - (1 - σ)/7.55),
// so brake power = (8.55·δ/√θ - 1) / 7.55, δ = p / 101325 Pa, θ = T / 288.15 K.
export const pistonPowerLapse = (pressurePa, tempK) => (8.55 * pressurePa / 101325 / Math.sqrt(tempK / 288.15) - 1) / 7.55;

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
