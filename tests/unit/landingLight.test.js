// Ticket 0076: the landing light's pool. k is the lamp's light on a horizontal surface:
// gain · cos(incidence)/r² (the inverse-square law), inside the beam's cone.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { poolK, footprint, lampAxis, lampGain, createLandingLight, FRAG, VERT, LAMPS, GAIN, K_MAX, AUTO_FT } from '../../src/landingLight.js';
import { cityLightsFor } from '../../src/nightGround.js';

const D = Math.PI / 180;
// A beam aimed `downDeg` below the horizon, towards -Z.
const axis = (downDeg) => [0, -Math.sin(downDeg * D), -Math.cos(downDeg * D)];
const fp = () => ({ near: 0, far: 0 });
// The attitude of an airplane heading north (-Z) with its nose `pitchDeg` up.
const pitchQ = (pitchDeg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchDeg * D);

describe('landing light pool (0076)', () => {
  it('follows the inverse-square law on a horizontal surface, worked by hand', () => {
    // Lamp 30.5 m (100 ft) up, the point 150 m ahead on the beam's axis: r² = 150² + 30.5²,
    // cos(incidence) = 30.5 / r, so k = GAIN · 30.5 / r³.
    const h = 30.5, s = 150, r = Math.hypot(s, h);
    const a = axis(Math.atan2(h, s) / D);
    const k = poolK(0, -h, -s, ...a, 9);
    expect(k).toBeCloseTo(GAIN * h / r ** 3, 6); // 350,000 · 30.5 / 153.07³ ≈ 2.97
    expect(k).toBeGreaterThan(2.5);
    expect(k).toBeLessThan(3.5);
  });

  it('is dark outside the cone, part-lit between its core and its edge, and saturates under the nose', () => {
    const a = axis(5);
    expect(poolK(0, -30, -150, ...[0, 0, 1], 9)).toBe(0); // the beam points the other way
    expect(poolK(80, -30, -150, ...a, 9)).toBe(0); // 28° off the axis, the beam is 9°
    expect(poolK(0, -3, -20, ...axis(8.5), 9)).toBe(K_MAX);
    // On the axis 200 m out vs 7° off it (between the 5.4° core and the 9° edge) at the same range.
    const h = 30, s = 200, r = Math.hypot(h, s), dn = Math.atan2(h, s) / D;
    const full = poolK(0, -h, -s, ...axis(dn), 9);
    const side = r * Math.sin(7 * D);
    const part = poolK(side, -h, -Math.sqrt(s * s - side * side), ...axis(dn), 9);
    expect(part).toBeGreaterThan(0.05 * full);
    expect(part).toBeLessThan(0.95 * full);
  });

  it('falls with distance along the axis and fades off the axis', () => {
    let last = Infinity;
    for (const s of [100, 200, 400, 800]) {
      const k = poolK(0, -30, -s, ...axis(Math.atan2(30, s) / D), 9);
      expect(k).toBeLessThan(last);
      last = k;
    }
    const a = axis(Math.atan2(30, 200) / D);
    const k0 = poolK(0, -30, -200, ...a, 9), k1 = poolK(15, -30, -200, ...a, 9), k2 = poolK(30, -30, -200, ...a, 9);
    expect(k1).toBeLessThan(k0);
    expect(k2).toBeLessThan(k1);
  });

  it('a lamp below a surface lights nothing above it (the ground faces up)', () => {
    expect(poolK(0, 10, -100, ...axis(-5), 9)).toBe(0);
  });

  it('the shader computes what poolK does (same cone order, incidence term and cap), in km', () => {
    expect(FRAG).toContain('smoothstep(uCosOuter, uCosInner, dot(dir, uAxis))');
    expect(FRAG).toContain(`min(uGain * cone * max(-dir.y, 0.0) / r2, ${K_MAX.toFixed(1)})`);
    expect(VERT).toContain('vD = (position - uLamp) * 0.001');
    // The scene's FogExp2 both ways: exp(-(ρr)²)² = exp(-2ρ²r²).
    expect(FRAG).toContain('k *= exp(-2.0 * uFogKm * uFogKm * r2)');
  });

  it('puts the footprint where the cone meets the ground, inside the range the lamp reaches', () => {
    // 100 ft up, the axis 3.5° down, 9° each side: the near edge at h / tan(12.5°) ≈ 138 m.
    const f = fp();
    expect(footprint(f, 30.5, 3.5 * D, 9)).toBe(true);
    expect(f.near).toBeLessThan(30.5 / Math.tan(12.5 * D));
    expect(f.near).toBeGreaterThan(0.85 * 30.5 / Math.tan(12.5 * D));
    // The upper edge is over the horizon: it ends where k = GAIN·h/r³ drops under 3%:
    // r = cbrt(3.5e5 · 30.5 / 0.03) ≈ 708.6 m, ≈ 707.9 m along the ground, plus the 5% margin ≈ 743 m.
    expect(f.far).toBeGreaterThan(735);
    expect(f.far).toBeLessThan(750);
    // A tenth of the gain reaches cbrt(10) ≈ 2.15x less far.
    const g = fp();
    footprint(g, 30.5, 3.5 * D, 9, GAIN / 10);
    expect(f.far / g.far).toBeCloseTo(Math.cbrt(10), 1);
    // Twice as high reaches cbrt(2) further (rMax ∝ cbrt(h)).
    const hi = fp();
    footprint(hi, 61, 3.5 * D, 9);
    expect(hi.far / f.far).toBeGreaterThan(1.2);
    // Aimed up past its own spread, on the ground, or no gain: no footprint.
    expect(footprint(fp(), 30.5, -10 * D, 9)).toBe(false);
    expect(footprint(fp(), 0, 3 * D, 9)).toBe(false);
    expect(footprint(fp(), 30.5, 3 * D, 9, 0)).toBe(false);
    // A steep beam: the whole cone lands short.
    const steep = fp();
    footprint(steep, 30.5, 30 * D, 9);
    expect(steep.far).toBeCloseTo(30.5 / Math.tan(21 * D) * 1.05, 3);
  });

  it('aims each lamp down onto the runway at its approach attitude (the F-16 at its 13° AoA too)', () => {
    const a = new THREE.Vector3();
    // [aircraft, nose-up pitch on a 3° final]: the axis is below the horizon and the footprint at 100 ft exists.
    for (const [k, pitch] of [['b738', 2.5], ['c172', 3], ['f16', 10], ['f16', 3]]) {
      lampAxis(a, pitchQ(pitch), LAMPS[k].downDeg);
      expect(a.z, k).toBeLessThan(-0.9); // forward (north)
      expect(a.y, `${k} at ${pitch}°`).toBeCloseTo(-Math.sin((LAMPS[k].downDeg - pitch) * D), 6);
      expect(a.y, k).toBeLessThan(0);
      const f = fp();
      expect(footprint(f, 30.5, Math.asin(-a.y), LAMPS[k].halfDeg), `${k} at ${pitch}°`).toBe(true);
      expect(f.near, k).toBeLessThan(250);
    }
  });

  it('has a lamp for every aircraft, aimed down', () => {
    for (const k of ['b738', 'c172', 'f16']) {
      expect(LAMPS[k].pos).toHaveLength(3);
      expect(LAMPS[k].downDeg).toBeGreaterThan(0);
    }
  });

  it('gives nothing while the sunset sky is bright and the full gain at night', () => {
    expect(lampGain(0)).toBe(0);
    expect(lampGain(1)).toBe(GAIN);
    // Sun at +1° and 0°: under 0.2 of k 30 m ahead of a lamp 2.5 m up (rolling out), so no blob on a sunlit runway.
    for (const elev of [1, 0]) {
      const k = poolK(0, -2.5, -30, ...axis(Math.atan2(2.5, 30) / D), 9, lampGain(cityLightsFor(elev)));
      expect(k, `sun ${elev}°`).toBeLessThan(0.2);
    }
    expect(lampGain(cityLightsFor(-6))).toBe(GAIN);
  });
});

// The wiring, headless: a fake sim and aircraft over flat ground at y = 0.
describe('landing light wiring (0076)', () => {
  const make = (over = {}) => {
    const sim = { aircraftKey: 'b738', mslFt: 700, gearDown: true, wx: { visibilitySm: 10 }, cameraMode: 0, loadedMission: { key: 'a' }, ...over };
    const root = new THREE.Object3D();
    root.position.set(0, 30.5, 0);
    root.quaternion.copy(pitchQ(2.5));
    const ll = createLandingLight(sim, () => root, () => 0);
    return { sim, root, ll };
  };

  it('lights the ground ahead and below at night, nothing by day', () => {
    const { ll } = make();
    ll.update(1);
    const d = ll.debug();
    expect(d).toMatchObject({ on: true, lit: true, gain: GAIN });
    expect(d.near).toBeGreaterThan(50);
    expect(d.far).toBeGreaterThan(d.near);
    expect(ll.pool.visible).toBe(true);
    expect(ll.uniforms.uAxis.value.y).toBeLessThan(0);
    expect(ll.uniforms.uAxis.value.z).toBeLessThan(-0.9);
    expect(ll.uniforms.uLamp.value.y).toBeCloseTo(30.5 - 0.6, 0);
    expect(ll.uniforms.uGain.value).toBeCloseTo(GAIN * 1e-6, 9);
    ll.update(0);
    expect(ll.debug()).toMatchObject({ on: true, lit: false, gain: 0 });
    expect(ll.pool.visible).toBe(false);
    expect(ll.beam.visible).toBe(false);
  });

  it('switches off climbing through 10,000 ft MSL, on descending; the player\'s choice holds in between; a new flight starts on', () => {
    const { sim, ll } = make();
    ll.update(1);
    ll.set(false);
    ll.update(1);
    expect(ll.on).toBe(false); // the player's choice
    sim.mslFt = AUTO_FT + 500;
    ll.update(1);
    expect(ll.on).toBe(false);
    sim.mslFt = AUTO_FT - 500;
    ll.update(1);
    expect(ll.on).toBe(true); // descending through it
    sim.mslFt = AUTO_FT + 500;
    ll.update(1);
    expect(ll.on).toBe(false); // climbing through it
    ll.set(true);
    ll.update(1);
    expect(ll.on).toBe(true); // the player's choice up high
    sim.mslFt = 700;
    ll.set(false);
    sim.loadedMission = { key: 'b' };
    ll.update(1);
    expect(ll.on).toBe(true); // a new flight
  });

  it('the F-16\'s gear-mounted lamp lights only with the gear down', () => {
    const { sim, ll } = make({ aircraftKey: 'f16' });
    ll.update(1);
    expect(ll.debug().lit).toBe(true);
    sim.gearDown = false;
    ll.update(1);
    expect(ll.debug().lit).toBe(false);
  });

  it('re-lays the grid only when the lamp moves past its margins, and shows the beam only outside the cockpit', () => {
    const { sim, root, ll } = make();
    ll.update(1);
    const n = ll.debug().relaid;
    ll.update(1);
    ll.update(1);
    expect(ll.debug().relaid).toBe(n); // paused: nothing moved
    root.position.z -= 10;
    ll.update(1);
    expect(ll.debug().relaid).toBe(n + 1);
    expect(ll.beam.visible).toBe(false); // cockpit
    sim.cameraMode = 1;
    ll.update(1);
    expect(ll.beam.visible).toBe(true);
  });
});
