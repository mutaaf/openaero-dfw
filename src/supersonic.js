// The F-16's transonic and supersonic wave drag (ticket 0133), a lazy chunk main.js loads right
// after boot (tests/flight/harness.js imports it): loading it gives the F-16 its spec.transonic
// (where the drag rise starts, aero.js waveDragCd) and spec.supersonicCd (past MDD); until then it
// has no wave drag, as before 0133.
import { AIRCRAFT_DATABASE } from './aircraft.js';

// D.P. Raymer, Aircraft Design: A Conceptual Approach, Sect. 12.5.9-12.5.10: from Mach 1.2 up the
// wave drag is the Sears-Haack body's of the same length and largest cross-section,
// D/q = (9π/2)(Amax/l)², times an empirical E_WD for how far the real shape is from that ideal,
// falling slowly with Mach as the leading edge's sweep allows:
// (D/q)wave = E_WD [1 − 0.386 (M − 1.2)^0.57 (1 − π Λle^0.77 / 100)] (D/q)SH (Λle in degrees).
// Below Mach 1.2 Raymer fairs a curve: Lock's rise to MDD (aero.js, as the 737's), up to the Mach
// 1.2 value by Mach 1.05, a hump between. The fairing's shape is AeroSandbox's approximate_CD_wave
// (P. Sharpe, MIT licence; read 2026-11-03): cubic Hermite patches MDD → 1.05 (slope 0.1 →
// 8·CD1.2) and 1.05 → 1.2 (8·CD1.2 → −4·CD1.2), a ~23% hump near Mach 1.1. Raymer's factor
// would fall on to zero near Mach 21; it is floored at 0.8 of the Mach 1.2 value, the high-Mach
// limit AeroSandbox takes from Raymer (reached near Mach 2.4 at 40° sweep). Zero-lift only:
// supersonic lift and stability changes are not modelled.
export function searsHaackCd(spec) {
  const s = spec.supersonic;
  return s.ewd * 4.5 * Math.PI * (s.areaMaxM2 / s.lengthM) ** 2 / spec.wingAreaM2;
}

const LOCK_RISE_AT_MDD = 20 * Math.cbrt(0.1 / 80) ** 4; // Lock's rise at MDD (aero.js), 26.9 counts
const hermite = (x, a, b, fa, fb, da, db) => {
  const L = b - a, t = (x - a) / L, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * fa + (t3 - 2 * t2 + t) * L * da + (3 * t2 - 2 * t3) * fb + (t3 - t2) * L * db;
};

// Wave drag past MDD (Mach ≥ MDD; aero.js waveDragCd calls it).
export function supersonicWaveCd(spec, mdd, mach) {
  const cd12 = searsHaackCd(spec);
  if (mach < 1.05) return hermite(mach, mdd, 1.05, LOCK_RISE_AT_MDD, cd12, 0.1, 8 * cd12);
  if (mach < 1.2) return hermite(mach, 1.05, 1.2, cd12, cd12, 8 * cd12, -4 * cd12);
  const sweep = 1 - Math.PI * Math.pow(spec.supersonic.sweepLeDeg, 0.77) / 100;
  return cd12 * Math.max(0.8, 1 - 0.386 * Math.pow(mach - 1.2, 0.57) * sweep);
}

// The F-16. Where the rise starts, Korn + Lock as the 737's: its NACA 64A204 wing (a 6-series
// section, Mason's κA 0.87; t/c 0.04), 40° leading-edge sweep, 32.7° at the quarter chord (taper
// 0.227, aircraft.js aspectRatio 3.2). Past Mach 1, Raymer's correlation: length 49 ft 5 in
// (15.06 m, USAF fact sheet); E_WD 2.0 (a typical fighter by Raymer; 1 is the ideal body); Amax
// 2.2 m² is our estimate (no open area distribution: fuselage, inlet and wing at the widest
// station, less the inlet's capture area). CD 0.022 at Mach 1.2, ~0.018 at Mach 2; the unit card
// checks it against JSBSim's open F-16 table within ±30%.
const f16 = AIRCRAFT_DATABASE.f16;
f16.transonic = { kappaA: 0.87, tOverC: 0.04, sweepDeg: 32.7 };
f16.supersonic = { ewd: 2.0, areaMaxM2: 2.2, lengthM: 15.06, sweepLeDeg: 40 };
f16.supersonicCd = (mdd, mach) => supersonicWaveCd(f16, mdd, mach);
