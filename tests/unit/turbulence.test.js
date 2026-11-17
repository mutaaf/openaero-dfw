// Ticket 0195: METAR-driven Dryden turbulence (src/turbulence.js, MIL-F-8785C low-altitude form).
import { describe, it, expect } from 'vitest';
import { turbulenceSigmaW, isBumpy, createTurbulence, stepTurbulence, W20_KTS } from '../../src/turbulence.js';
import { scenarioWeather } from '../../src/weather.js';
import { KTS_TO_MPS, FT_TO_M } from '../../src/constants.js';

const wx = (windKts, gustKts = windKts) => ({ windDirDeg: 180, windKts, gustKts });

// RMS of each axis over `seconds` of 1/60 s steps at a height and airspeed.
function rms(sigmaW, hM, vMps, seconds = 4000, dt = 1 / 60, seed = 7) {
  const st = createTurbulence(seed), out = {};
  let u = 0, v = 0, w = 0, n = 0;
  for (let t = 0; t < seconds; t += dt) {
    stepTurbulence(st, dt, sigmaW, hM, vMps, out);
    u += out.u ** 2; v += out.v ** 2; w += out.w ** 2; n++;
  }
  return { u: Math.sqrt(u / n), v: Math.sqrt(v / n), w: Math.sqrt(w / n) };
}

describe('turbulence intensity from the METAR (0195)', () => {
  it('calm is zero; the mean wind gives σ_w = 0.1 W20 (W20 the 10 m wind by the log law at 20 ft)', () => {
    expect(turbulenceSigmaW(wx(0))).toBe(0);
    expect(turbulenceSigmaW(null)).toBe(0);
    // MIL-F-8785C: W20 15 / 30 / 45 kt is light / moderate / severe, σ_w = 1.5 / 3 / 4.5 kt (0.77 / 1.54 / 2.31 m/s).
    // The report's 10 m wind is ~9% over its 20 ft wind (weather.js surfaceWindFactor(6.1 m) = 0.914).
    expect(turbulenceSigmaW(wx(30)) / KTS_TO_MPS).toBeCloseTo(3 * 0.914, 2);
    expect(turbulenceSigmaW(wx(10))).toBeCloseTo(turbulenceSigmaW(wx(20)) / 2, 6);
  });
  it('a gusty report: the spread is ~3 σ_u at 10 m; 25G38 lands between light and moderate either way', () => {
    const s = turbulenceSigmaW(wx(25, 38));
    expect(s).toBeGreaterThan(0.1 * W20_KTS.light * KTS_TO_MPS);
    expect(s).toBeLessThan(0.1 * W20_KTS.moderate * KTS_TO_MPS);
    expect(s).toBeCloseTo(1.18, 1);
    // A big spread on a modest wind wins over the mean: 15G35 (20 kt / 3 = 6.7 kt σ_u at 33 ft → σ_w 3.5 kt).
    expect(turbulenceSigmaW(wx(15, 35))).toBeGreaterThan(turbulenceSigmaW(wx(15)) * 2);
    expect(turbulenceSigmaW(wx(15, 35)) / KTS_TO_MPS).toBeCloseTo(20 / 3 * 0.529, 1);
  });
  it('BUMPY from moderate (W20 30 kt): not on the scenario day or 25G38, yes on 35 kt or 20G40', () => {
    expect(isBumpy(turbulenceSigmaW(scenarioWeather()))).toBe(false);
    expect(isBumpy(turbulenceSigmaW(wx(25, 38)))).toBe(false);
    expect(isBumpy(turbulenceSigmaW(wx(35)))).toBe(true);
    expect(isBumpy(turbulenceSigmaW(wx(20, 40)))).toBe(true);
    expect(isBumpy(0)).toBe(false);
  });
});

describe('Dryden gusts (0195)', () => {
  it('seeded and deterministic: the same seed and steps give the same series, another seed another', () => {
    const run = (seed) => {
      const st = createTurbulence(seed), out = {}, xs = [];
      for (let i = 0; i < 300; i++) xs.push({ ...stepTurbulence(st, 1 / 60, 1.5, 100, 35, out) });
      return xs;
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)[299].w).not.toBe(run(4)[299].w);
  });
  it('zero intensity is zero gusts, and resets the filters', () => {
    const st = createTurbulence(1), out = {};
    for (let i = 0; i < 100; i++) stepTurbulence(st, 1 / 60, 2, 300, 40, out);
    expect(out.w).not.toBe(0);
    stepTurbulence(st, 1 / 60, 0, 300, 40, out);
    expect(out).toEqual({ u: 0, v: 0, w: 0 });
    expect(st.w1).toBe(0);
  });
  it('the RMS follows the intensity: σ_w at 1,000 ft (isotropic there) within 10%, light / moderate / severe', () => {
    for (const kts of [W20_KTS.light, W20_KTS.moderate, W20_KTS.severe]) {
      const sw = 0.1 * kts * KTS_TO_MPS;
      const r = rms(sw, 1000 * FT_TO_M, 35);
      expect(r.w / sw).toBeGreaterThan(0.9);
      expect(r.w / sw).toBeLessThan(1.1);
      expect(r.u / sw).toBeGreaterThan(0.9); // σ_u = σ_w at 1,000 ft
      expect(r.u / sw).toBeLessThan(1.1);
      expect(r.v / sw).toBeGreaterThan(0.9);
      expect(r.v / sw).toBeLessThan(1.1);
    }
  });
  it('lower down σ_u and σ_v grow as MIL-F-8785C says (1 / (0.177 + 0.000823 h)^0.4), σ_w stays, the 737\'s airspeed too', () => {
    const r = rms(1, 100 * FT_TO_M, 70);
    const ratio = 1 / (0.177 + 0.0823) ** 0.4; // 1.71 at 100 ft
    expect(r.u).toBeGreaterThan(ratio * 0.88);
    expect(r.u).toBeLessThan(ratio * 1.12);
    expect(r.w).toBeGreaterThan(0.9 * 100 / 103); // the 10 ft fade: h / (h + 10 ft)
    expect(r.w).toBeLessThan(1.1);
  });
  it('falls off smoothly toward the ground and is zero on the wheels', () => {
    const at = (ft) => rms(1, ft * FT_TO_M, 30, 1500).w;
    const w = [200, 50, 20, 10, 5, 2].map(at);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeLessThan(w[i - 1] * 1.02);
    expect(w[w.length - 1]).toBeLessThan(w[0] * 0.3);
    expect(at(0)).toBe(0);
  });
  it('a 1/4 s frame (main.js caps a frame there) keeps the RMS bounded', () => {
    const r = rms(1, 30, 35, 4000, 0.25);
    expect(r.w).toBeLessThan(1.2);
    expect(r.u).toBeLessThan(2.5);
  });
});
