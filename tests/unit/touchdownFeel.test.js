import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { touchdownFeel, createTouchdownFeel, playTouchdown, POOL, PUFF_LIFE_S } from '../../src/touchdownFeel.js';
import { AIRCRAFT_DATABASE as AIRCRAFT } from '../../src/aircraft.js';

describe('touchdownFeel (0147)', () => {
  it('a 100 fpm touchdown is a light chirp: no thump, at most a faint wisp', () => {
    const f = touchdownFeel(-100);
    expect(f.chirp).toBeGreaterThan(0);
    expect(f.chirp).toBeLessThan(0.06);
    expect(f.thump).toBe(0);
    expect(f.puffAlpha).toBeLessThanOrEqual(0.35);
  });
  it('a 600 fpm touchdown is a heavy thump and a visible puff', () => {
    const f = touchdownFeel(-600);
    expect(f.thump).toBeGreaterThanOrEqual(0.35);
    expect(f.puffAlpha).toBeGreaterThanOrEqual(0.7);
    expect(f.chirp).toBeGreaterThan(touchdownFeel(-100).chirp);
  });
  it('the thump starts at the grader\'s firm band (240 fpm), and every term grows with the sink', () => {
    expect(touchdownFeel(-239).thump).toBe(0);
    expect(touchdownFeel(-240).thump).toBeGreaterThan(0);
    let prev = touchdownFeel(0);
    for (let s = 50; s <= 900; s += 50) {
      const f = touchdownFeel(-s);
      expect(f.chirp).toBeGreaterThanOrEqual(prev.chirp);
      expect(f.thump).toBeGreaterThanOrEqual(prev.thump);
      expect(f.puffAlpha).toBeGreaterThanOrEqual(prev.puffAlpha);
      prev = f;
    }
    expect(touchdownFeel(-2000)).toEqual({ ...touchdownFeel(-600), sink: 2000 }); // capped at the crash line
  });
  it('a climbing or NaN touchdown is no sink', () => {
    expect(touchdownFeel(500).sink).toBe(0);
    expect(touchdownFeel(NaN).sink).toBe(0);
  });
  it('Kid (gentle) gets a light chirp only, however hard', () => {
    const f = touchdownFeel(-900, true);
    expect(f.chirp).toBeLessThan(0.06);
    expect(f.thump).toBe(0);
    expect(f.puffAlpha).toBe(0);
  });
});

// A fake Web Audio context that counts the nodes it makes.
function fakeCtx() {
  const made = { buffers: 0, sources: 0, osc: 0, gains: 0, filters: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect: (n) => n, start() {}, stop() {}, frequency: param(), gain: param(), Q: param() });
  return {
    made, currentTime: 1, sampleRate: 8000, destination: {},
    createBuffer: (c, n) => { made.buffers++; const d = new Float32Array(n); return { getChannelData: () => d }; },
    createBufferSource: () => { made.sources++; return node(); },
    createBiquadFilter: () => { made.filters++; return node(); },
    createGain: () => { made.gains++; return node(); },
    createOscillator: () => { made.osc++; return node(); },
  };
}

describe('playTouchdown', () => {
  it('a soft touchdown chirps without a thump; a hard one adds the thump; the noise buffer is made once', () => {
    const ctx = fakeCtx();
    playTouchdown(ctx, touchdownFeel(-100));
    expect(ctx.made).toMatchObject({ buffers: 1, sources: 1, osc: 0 });
    playTouchdown(ctx, touchdownFeel(-650));
    expect(ctx.made).toMatchObject({ buffers: 1, sources: 2, osc: 1 });
  });
});

describe('createTouchdownFeel', () => {
  const setup = ({ reduced = false, audioOn = true, kid = false } = {}) => {
    let t = 100;
    const ctx = fakeCtx();
    const root = new THREE.Object3D();
    root.position.set(10, 5, -20);
    const sim = { lastAirVsi: -600, assist: kid ? 'kid' : 'pilot', spec: AIRCRAFT.b738, groundY: 1.2, windVec: new THREE.Vector3(4, 0, 0), audioEnabled: audioOn, paused: false };
    const feel = createTouchdownFeel(sim, () => root, { ctx }, reduced, () => t);
    return { feel, sim, ctx, root, setT: (v) => { t = v; } };
  };

  it('a hard touchdown puffs at each main wheel, on the ground, and sounds', () => {
    const { feel, ctx } = setup();
    feel.touch();
    const vis = feel.sprites.filter((s) => s.visible);
    expect(vis).toHaveLength(2);
    const g = AIRCRAFT.b738.gear;
    const xs = vis.map((s) => s.position.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(10 - g.trackM / 2, 3);
    expect(xs[1]).toBeCloseTo(10 + g.trackM / 2, 3);
    for (const s of vis) {
      expect(s.position.z).toBeCloseTo(-20 + g.mainZ, 3); // aft of the CG
      expect(s.position.y).toBeLessThan(1.2 + 3); // at the runway, not at the CG 5 m up
      expect(s.material.opacity).toBeGreaterThan(0.5);
    }
    expect(ctx.made.osc).toBe(1);
    expect(feel.debug()).toMatchObject({ touches: 1, puffs: 2, sounded: 1, visible: 2 });
  });

  it('a puff grows, drifts downwind and is gone by PUFF_LIFE_S', () => {
    const { feel, setT } = setup();
    feel.touch();
    const s = feel.sprites.find((p) => p.visible);
    const x0 = s.position.x, w0 = s.scale.x, a0 = s.material.opacity;
    setT(100 + PUFF_LIFE_S / 2);
    feel.update();
    expect(s.scale.x).toBeGreaterThan(w0);
    expect(s.position.x).toBeGreaterThan(x0); // the wind is from the west (+X)
    expect(s.material.opacity).toBeLessThan(a0);
    setT(100 + PUFF_LIFE_S + 0.01);
    feel.update();
    expect(feel.sprites.every((p) => !p.visible)).toBe(true);
  });

  it('the pool is reused over repeated bounces: never more than POOL sprites, the same objects', () => {
    const { feel } = setup();
    const before = feel.sprites.slice();
    for (let i = 0; i < 10; i++) feel.touch();
    expect(feel.sprites).toEqual(before);
    expect(feel.group.children).toHaveLength(POOL);
    expect(feel.sprites.filter((s) => s.visible)).toHaveLength(POOL);
  });

  it('update allocates nothing: positions are set in place', () => {
    const { feel, setT } = setup();
    feel.touch();
    const s = feel.sprites.find((p) => p.visible);
    const pos = s.position, scale = s.scale;
    setT(100.3);
    feel.update();
    expect(s.position).toBe(pos);
    expect(s.scale).toBe(scale);
  });

  it('reduced motion: no puff, the sound unchanged', () => {
    const { feel, ctx } = setup({ reduced: true });
    feel.touch();
    expect(feel.sprites.some((s) => s.visible)).toBe(false);
    expect(ctx.made.sources).toBe(1);
    expect(ctx.made.osc).toBe(1);
  });

  it('sound off: silent, the puff stays', () => {
    const { feel, ctx } = setup({ audioOn: false });
    feel.touch();
    expect(ctx.made.sources).toBe(0);
    expect(feel.sprites.filter((s) => s.visible)).toHaveLength(2);
  });

  it('Kid: a light chirp, no thump, no puff', () => {
    const { feel, ctx } = setup({ kid: true });
    feel.touch();
    expect(ctx.made.sources).toBe(1);
    expect(ctx.made.osc).toBe(0);
    expect(feel.sprites.some((s) => s.visible)).toBe(false);
  });

  it('no sound before audio has started (no context yet)', () => {
    const sim = { lastAirVsi: -300, assist: 'pilot', spec: AIRCRAFT.c172, groundY: 0, windVec: new THREE.Vector3(), audioEnabled: false, paused: false };
    const feel = createTouchdownFeel(sim, () => new THREE.Object3D(), { ctx: null }, false, () => 0);
    expect(() => feel.touch()).not.toThrow();
    expect(feel.debug().sounded).toBe(0);
  });
});
