// Turbulence (ticket 0195): the METAR's gusty low-level air as continuous random gusts, added to the
// wind the flight model already takes (main.js updateWind). Pure, seeded, no allocation per step;
// tested in tests/unit/turbulence.test.js and flown in tests/flight/turbulence.test.js.
//
// The model is Dryden's, in MIL-F-8785C's low-altitude form (§3.7.2.3; JSBSim's FGWinds and
// MATLAB's Dryden block use the same equations), heights in feet:
//   L_w = h,  L_u = L_v = h / (0.177 + 0.000823 h)^1.2
//   σ_w = 0.1 W20,  σ_u = σ_v = σ_w / (0.177 + 0.000823 h)^0.4
// where W20 is the wind at 20 ft. The spec names W20 = 15 / 30 / 45 kt light / moderate / severe.
// It is defined from 10 ft to 1,000 ft; above 1,000 ft this holds the 1,000 ft values (there
// L_u = L_w = 1,000 ft and σ_u = σ_w: isotropic), a simplification of the spec's blend into its
// medium/high-altitude table by 2,000 ft. Below 10 ft the lengths stay at 10 ft's and the gusts fade
// to nothing at the wheels (h / (h + 10 ft)): a game choice, so a parked or rolling airplane is not
// shaken off its tyres. u is along the nose (horizontal), v across it, w up (+ = updraft).
//
// The intensity comes from the METAR two ways and takes the larger: the mean wind (W20 from the
// report's 10 m wind by weather.js's log law) and the gust spread. A reported gust is a peak; with
// the usual peak factor of ~3 (gust = mean + 3 σ_u over the report's 10 minutes) the spread gives
// σ_u at 10 m, and σ_w = σ_u · (0.177 + 0.000823 · 33)^0.4. A 25G38 day gives σ_w ~1.2 m/s either
// way (between light and moderate); a calm report gives 0. No surface temperature term: a METAR
// carries no heat flux, so a hot still day stays smooth here (thermals are out of scope).
//
// The same air for every airplane: nothing here is scaled by type. The Cessna feels more because
// the flight model makes it so: a vertical gust w changes the angle of attack by w / V, and the load
// it adds is Δn = ρ V CLα w / (2 W/S) (the gust load formula of 14 CFR 25.341 without its
// alleviation factor), so the light, slow wing (W/S ~70 kg/m²) moves several times more than the
// 737's (~550 kg/m²) in the same gust. Kid and Learner fly it at half strength (main.js).
import { KTS_TO_MPS, FT_TO_M, M_TO_FT } from './constants.js';
import { surfaceWindFactor } from './weather.js';

export const W20_KTS = { light: 15, moderate: 30, severe: 45 }; // MIL-F-8785C
const PEAK_FACTOR = 3;
const SQRT3 = Math.sqrt(3);

// σ_w (m/s) at low level for a weather object (weather.js / metar.js shape).
export function turbulenceSigmaW(wx) {
  if (!wx || !(wx.windKts > 0)) return 0;
  const meanKts = 0.1 * wx.windKts * surfaceWindFactor(20 * FT_TO_M);
  const spread = wx.gustKts > wx.windKts ? wx.gustKts - wx.windKts : 0;
  const gustKts = spread / PEAK_FACTOR * (0.177 + 0.000823 * 10 * M_TO_FT) ** 0.4;
  return Math.max(meanKts, gustKts) * KTS_TO_MPS;
}

// 'moderate' or more is MIL-F-8785C's W20 30 kt: σ_w ≥ 3 kt. The weather ribbon says BUMPY there.
export function isBumpy(sigmaW) {
  return sigmaW >= 0.1 * W20_KTS.moderate * KTS_TO_MPS - 1e-9;
}

export function createTurbulence(seed = 1) {
  return { seed: seed >>> 0 || 1, u: 0, v1: 0, v2: 0, w1: 0, w2: 0, wf: 0, spare: 0, hasSpare: false };
}

function rand(st) { // mulberry32
  let t = (st.seed = (st.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function gauss(st) { // Box-Muller, the second value kept for the next call
  if (st.hasSpare) { st.hasSpare = false; return st.spare; }
  const r = Math.sqrt(-2 * Math.log(1 - rand(st))), a = 2 * Math.PI * rand(st);
  st.spare = r * Math.sin(a);
  st.hasSpare = true;
  return r * Math.cos(a);
}

// Advance the gusts by dt seconds (the sim clock) and write them (m/s) into out.u / out.v / out.w.
// sigmaW: turbulenceSigmaW's intensity (0 = calm air: zero gusts and the filters reset); heightM: the
// wheels' height above the ground; airspeedMps: the true airspeed (Taylor's frozen field: the airplane
// flies through the eddies at its airspeed; never below 5 m/s, so a slow airplane still feels them).
// u is a first-order (Gauss-Markov) process, exact at any dt; v and w are Dryden's second-order form,
// (1 + √3 τs) / (1 + τs)², built from two lags: y = √3 x1 + (1 − √3) x2 has variance 2 for a unit x1.
// spanM (optional): the wing averages a vertical gust over its span, so an eddy smaller than the wing
// (low down, where L_w = h) lifts it far less than a point model says. w then passes a lag of 4b / (πV),
// the span time constant of MIL-F-8785C's rotary-gust filters (p_g, q_g); without it a point-mass wing
// felt 10 ft eddies in full on the flare. The air is the same; a bigger wing averages more of it.
export function stepTurbulence(st, dt, sigmaW, heightM, airspeedMps, out, spanM = 0) {
  if (!(sigmaW > 0) || !(dt > 0)) {
    st.u = st.v1 = st.v2 = st.w1 = st.w2 = st.wf = 0;
    out.u = out.v = out.w = 0;
    return out;
  }
  const hm = Math.max(0, heightM || 0);
  const hFt = Math.min(1000, Math.max(10, hm * M_TO_FT));
  const r = 0.177 + 0.000823 * hFt;
  const lu = hFt / r ** 1.2 * FT_TO_M, lw = hFt * FT_TO_M;
  const v = Math.max(5, airspeedMps || 0);
  const au = Math.exp(-v * dt / lu), aw = Math.exp(-v * dt / lw);
  const ku = Math.sqrt(1 - au * au), kw = Math.sqrt(1 - aw * aw);
  st.u = au * st.u + ku * gauss(st);
  st.v1 = au * st.v1 + ku * gauss(st);
  st.v2 += (st.v1 - st.v2) * (1 - au);
  st.w1 = aw * st.w1 + kw * gauss(st);
  st.w2 += (st.w1 - st.w2) * (1 - aw);
  const fade = hm / (hm + 10 * FT_TO_M);
  const su = sigmaW / r ** 0.4 * fade, sw = sigmaW * fade;
  out.u = su * st.u;
  out.v = su * (SQRT3 * st.v1 + (1 - SQRT3) * st.v2) / Math.SQRT2;
  const w = sw * (SQRT3 * st.w1 + (1 - SQRT3) * st.w2) / Math.SQRT2;
  st.wf = spanM > 0 ? st.wf + (w - st.wf) * (1 - Math.exp(-dt * Math.PI * v / (4 * spanM))) : w;
  out.w = st.wf;
  return out;
}

// Step the gusts and add them to `wind` (the sim frame's air velocity, m/s: +X east, +Y up, −Z north),
// u along the nose's horizontal heading from the body quaternion q (nose −Z in the body frame), v to its
// right. main.js updateWind and tests/flight/harness.js turbulentAir both call this. No allocation.
const _g = { u: 0, v: 0, w: 0 };
export function addTurbulence(st, dt, sigmaW, heightM, airspeedMps, q, wind, spanM = 0) {
  stepTurbulence(st, dt, sigmaW, heightM, airspeedMps, _g, spanM);
  let fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  const n = Math.hypot(fx, fz);
  if (n < 1e-6) { fx = 0; fz = -1; } else { fx /= n; fz /= n; }
  // Right of a heading (fx, fz) in this frame is (−fz, fx): north (0, −1) → east (1, 0).
  wind.x += _g.u * fx - _g.v * fz;
  wind.y += _g.w;
  wind.z += _g.u * fz + _g.v * fx;
  return wind;
}
