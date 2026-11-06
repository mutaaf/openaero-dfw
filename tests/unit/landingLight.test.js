// Ticket 0076: the landing light's pool. k is the lamp's light on a horizontal surface over the
// night's ambient: E = I·cos(incidence)/r² (the inverse-square law), inside the beam's cone.
import { describe, it, expect } from 'vitest';
import { poolK, footprint, LAMPS, GAIN, K_MAX } from '../../src/landingLight.js';

const D = Math.PI / 180;
// A beam aimed `downDeg` below the horizon, towards -Z.
const axis = (downDeg) => [0, -Math.sin(downDeg * D), -Math.cos(downDeg * D)];

describe('landing light pool (0076)', () => {
  it('follows the inverse-square law on a horizontal surface, worked by hand', () => {
    // Lamp 30.5 m (100 ft) up, the point 150 m ahead on the beam's axis: r² = 150² + 30.5²,
    // cos(incidence) = 30.5 / r, so k = GAIN · 30.5 / r³.
    const h = 30.5, s = 150, r = Math.hypot(s, h);
    const a = axis(Math.atan2(h, s) / D);
    const k = poolK(0, -h, -s, ...a, 9);
    expect(k).toBeCloseTo(GAIN * h / r ** 3, 6); // 3,500,000 · 30.5 / 153.07³ ≈ 2.97
    expect(k).toBeGreaterThan(2.5);
    expect(k).toBeLessThan(3.5);
  });

  it('is dark outside the cone and saturates (never above K_MAX) under the nose', () => {
    const a = axis(5);
    expect(poolK(0, -30, -150, ...[0, 0, 1], 9)).toBe(0); // the beam points the other way
    expect(poolK(80, -30, -150, ...a, 9)).toBe(0); // 28° off the axis, the beam is 9°
    expect(poolK(0, -3, -20, ...axis(8.5), 9)).toBe(K_MAX);
  });

  it('falls with distance along the axis and fades out at the cone edge', () => {
    let last = Infinity;
    for (const s of [100, 200, 400, 800]) {
      const k = poolK(0, -30, -s, ...axis(Math.atan2(30, s) / D), 9);
      expect(k).toBeLessThan(last);
      last = k;
    }
    // Same distance, more off the axis: dimmer.
    const a = axis(Math.atan2(30, 200) / D);
    const k0 = poolK(0, -30, -200, ...a, 9), k1 = poolK(15, -30, -200, ...a, 9), k2 = poolK(30, -30, -200, ...a, 9);
    expect(k1).toBeLessThan(k0);
    expect(k2).toBeLessThan(k1);
  });

  it('a lamp above the ground lights nothing above it (the ground faces up)', () => {
    expect(poolK(0, 10, -100, ...axis(-5), 9)).toBe(0);
  });

  it('puts the footprint where the cone meets the ground, inside the range the lamp reaches', () => {
    // 100 ft up, the axis 3.5° down, 9° each side: the near edge at h / tan(12.5°) ≈ 138 m.
    const fp = footprint(30.5, 3.5 * D, 9);
    expect(fp.near).toBeLessThan(30.5 / Math.tan(12.5 * D));
    expect(fp.near).toBeGreaterThan(0.85 * 30.5 / Math.tan(12.5 * D));
    // The upper edge is over the horizon: it ends where k = GAIN·h/r³ drops under 3%:
    // r = cbrt(3.5e5 · 30.5 / 0.03) ≈ 708.6 m, ≈ 707.9 m along the ground, plus the 5% margin ≈ 743 m.
    expect(fp.far).toBeGreaterThan(735);
    expect(fp.far).toBeLessThan(750);
    // Aimed up past its own spread, or on the ground: no footprint.
    expect(footprint(30.5, -10 * D, 9)).toBeNull();
    expect(footprint(0, 3 * D, 9)).toBeNull();
    // A steep beam: the whole cone lands short.
    const steep = footprint(30.5, 30 * D, 9);
    expect(steep.far).toBeCloseTo(30.5 / Math.tan(21 * D) * 1.05, 3);
  });

  it('has a lamp for every aircraft, below the beam spread and aimed down', () => {
    for (const k of ['b738', 'c172', 'f16']) {
      expect(LAMPS[k].pos).toHaveLength(3);
      expect(LAMPS[k].downDeg).toBeGreaterThan(0);
      expect(LAMPS[k].halfDeg).toBeGreaterThan(LAMPS[k].downDeg);
    }
  });
});
