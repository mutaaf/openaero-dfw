import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { metarPrecip, parseMetar } from '../../src/metar.js';
import { precipCount, flashLevel, nextFlashGapS, FLASH_S, MAX_COUNT, createPrecip } from '../../src/precip.js';
import { precipFogSm } from '../../src/weather.js';

// Ticket 0196: rain, snow and thunderstorms falling at the field (the raw METAR's present-weather
// groups, before RMK/TEMPO) show on screen. The intensity prefix sets how much: - light, none
// moderate, + heavy (FAA Order JO 7900.5, AIM 7-1-28: the prefix is the precipitation's intensity).
const raw = (wx) => `METAR KDFW 162053Z 18012KT 4SM ${wx} OVC015 18/16 A2992`;

describe('metarPrecip: what is falling at the field', () => {
  it('rain and drizzle, by intensity', () => {
    expect(metarPrecip(raw('-RA'))).toEqual({ kind: 'rain', intensity: 0, ts: false });
    expect(metarPrecip(raw('RA'))).toEqual({ kind: 'rain', intensity: 1, ts: false });
    expect(metarPrecip(raw('+RA'))).toEqual({ kind: 'rain', intensity: 2, ts: false });
    expect(metarPrecip(raw('-DZ BR'))).toEqual({ kind: 'rain', intensity: 0, ts: false });
    expect(metarPrecip(raw('SHRA'))).toEqual({ kind: 'rain', intensity: 1, ts: false });
  });
  it('thunderstorms: TS with rain, and TS alone (no particles, but a storm sky)', () => {
    expect(metarPrecip(raw('+TSRA'))).toEqual({ kind: 'rain', intensity: 2, ts: true });
    expect(metarPrecip(raw('-TSRA BR'))).toEqual({ kind: 'rain', intensity: 0, ts: true });
    expect(metarPrecip(raw('TS'))).toEqual({ kind: null, intensity: 1, ts: true });
  });
  it('snow wins over rain in a mixed report, and the heaviest group sets the intensity', () => {
    expect(metarPrecip(raw('-SN'))).toEqual({ kind: 'snow', intensity: 0, ts: false });
    expect(metarPrecip(raw('-RASN'))).toEqual({ kind: 'snow', intensity: 0, ts: false });
    expect(metarPrecip(raw('-RA +SN'))).toEqual({ kind: 'snow', intensity: 2, ts: false });
    expect(metarPrecip(raw('+TSRA -RA'))).toMatchObject({ intensity: 2, ts: true });
  });
  it('nothing falling: obscurations only, vicinity groups, remarks and trends are not "at the field"', () => {
    expect(metarPrecip(raw('BR'))).toBeNull();
    expect(metarPrecip(raw('FG'))).toBeNull();
    expect(metarPrecip(raw('VCTS'))).toBeNull();
    expect(metarPrecip(raw('VCSH'))).toBeNull();
    expect(metarPrecip('METAR KDFW 162053Z 18012KT 10SM FEW250 24/10 A3002 RMK AO2 RAB15E30')).toBeNull();
    expect(metarPrecip('METAR EGLL 162050Z 18012KT 9999 FEW030 12/08 Q1012 TEMPO RA')).toBeNull();
    expect(metarPrecip('')).toBeNull();
    expect(metarPrecip(undefined)).toBeNull();
  });
  it('parseMetar carries it on the weather object (null on a dry day)', () => {
    const m = { icaoId: 'KDFW', wdir: 180, wspd: 12, visib: 4, altim: 1013, clouds: [] };
    expect(parseMetar({ ...m, rawOb: raw('+TSRA') }).precip).toEqual({ kind: 'rain', intensity: 2, ts: true });
    expect(parseMetar({ ...m, rawOb: raw('BR') }).precip).toBeNull();
  });
});

describe('precipCount: streaks by intensity (pure)', () => {
  it('light < moderate < heavy, never over the buffer, none for TS alone or reduced motion', () => {
    const l = precipCount({ kind: 'rain', intensity: 0 });
    const m = precipCount({ kind: 'rain', intensity: 1 });
    const h = precipCount({ kind: 'rain', intensity: 2 });
    expect(l).toBeGreaterThan(0);
    expect(m).toBeGreaterThan(l);
    expect(h).toBeGreaterThan(m);
    expect(h).toBeLessThanOrEqual(MAX_COUNT);
    expect(precipCount({ kind: 'snow', intensity: 2 })).toBeLessThanOrEqual(MAX_COUNT);
    expect(precipCount({ kind: null, intensity: 1, ts: true })).toBe(0);
    expect(precipCount(null)).toBe(0);
    expect(precipCount({ kind: 'rain', intensity: 2 }, true)).toBe(0);
  });
});

describe('precipFogSm: the haze never reads clearer than "10 SM" in rain, never thicker than the METAR', () => {
  it('ties the 10+ SM clear-day haze down to 10 SM, keeps any lower reported visibility as it is', () => {
    expect(precipFogSm(10, null)).toBe(10);
    expect(precipFogSm(10, { kind: 'rain', intensity: 2 })).toBeLessThan(10);
    expect(precipFogSm(10, { kind: 'rain', intensity: 2 })).toBeGreaterThan(9.9);
    expect(precipFogSm(3, { kind: 'rain', intensity: 2 })).toBe(3);
    expect(precipFogSm(0.5, { kind: 'snow', intensity: 2 })).toBe(0.5);
  });
});

describe('lightning (TS): one flash at a time, 8-25 s apart, under 3 a second (WCAG 2.3.1)', () => {
  it('the gap is 8-25 s for any random draw', () => {
    for (const r of [0, 0.25, 0.5, 0.999]) {
      const g = nextFlashGapS(r);
      expect(g).toBeGreaterThanOrEqual(8);
      expect(g).toBeLessThanOrEqual(25);
    }
  });
  it('a flash rises and decays once (one bright-dark pair), and is over within FLASH_S', () => {
    expect(flashLevel(-0.1)).toBe(0);
    expect(flashLevel(FLASH_S + 0.01)).toBe(0);
    let peak = 0, ups = 0, prev = 0, rising = true;
    for (let t = 0; t <= FLASH_S; t += 0.005) {
      const f = flashLevel(t);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      peak = Math.max(peak, f);
      if (rising && f < prev) { rising = false; ups++; }
      if (!rising && f > prev + 1e-9) { rising = true; }
      prev = f;
    }
    expect(peak).toBeGreaterThan(0.9);
    expect(ups).toBe(1);
    // Under three flashes a second: the shortest gap plus a flash is far over 1/3 s.
    expect(nextFlashGapS(0)).toBeGreaterThan(1 / 3);
  });
});

describe('createPrecip: the layer (no WebGL needed to step it)', () => {
  const setup = (reduced = false) => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x445566, 0.0001);
    scene.background = scene.fog.color.clone();
    const fx = createPrecip(scene, reduced);
    const camera = { position: new THREE.Vector3(1234.5, 300, -40000) };
    return { scene, fx, camera, vel: new THREE.Vector3(0, 0, -60), wind: new THREE.Vector3(3, 0, 1) };
  };
  const run = ({ fx, camera, vel, wind }, s, onStep) => { for (let t = 0; t < s; t += 1 / 60) { fx.update(1 / 60, camera, vel, wind); onStep?.(); } };

  it('+TSRA: one draw object, heavy count, visible under the deck, and lightning flashes then gives the haze back', () => {
    const w = setup();
    w.fx.set({ kind: 'rain', intensity: 2, ts: true }, 180, 2500);
    expect(w.scene.children.filter((o) => o.name === 'precip')).toHaveLength(1);
    let brightest = 0;
    run(w, 60, () => { brightest = Math.max(brightest, w.scene.fog.color.r); });
    expect(w.fx.state).toMatchObject({ kind: 'rain', intensity: 2, ts: true, count: precipCount({ kind: 'rain', intensity: 2 }), visible: true });
    expect(w.fx.state.flashes).toBeGreaterThanOrEqual(2); // 8-25 s apart: at least two in a minute
    expect(w.fx.state.flashes).toBeLessThanOrEqual(8);
    expect(brightest).toBeGreaterThan(0x44 / 255 + 0.1);
    // Between flashes the haze is exactly main.js's colour again.
    run(w, 0.01);
    if (w.fx.state.flash === 0) expect(w.scene.fog.color.getHex()).toBe(0x445566);
  });

  it('above the report ceiling nothing falls; a dry report hides it; streaks stay short at airliner speed', () => {
    const w = setup();
    w.fx.set({ kind: 'rain', intensity: 1, ts: false }, 180, 500); // 500 ft ceiling, camera 120 m (394 ft) over the field
    run(w, 0.1);
    expect(w.fx.state.visible).toBe(true);
    const s = w.fx.object.material.uniforms.uStreak.value;
    expect(s.length()).toBeLessThanOrEqual(1.6 + 1e-6);
    w.camera.position.y = 180 + 600 * 0.3048;
    run(w, 0.1);
    expect(w.fx.state.visible).toBe(false);
    expect(w.fx.object.visible).toBe(false);
    w.fx.set(null);
    w.camera.position.y = 200;
    run(w, 0.1);
    expect(w.fx.state.visible).toBe(false);
  });

  it('reduced motion: no streaks and no flashes; the haze is never touched', () => {
    const w = setup(true);
    w.fx.set({ kind: 'rain', intensity: 2, ts: true }, 0, null);
    run(w, 60, () => expect(w.scene.fog.color.getHex()).toBe(0x445566));
    expect(w.fx.state).toMatchObject({ count: 0, visible: false, flashes: 0 });
  });

  it('a thunderstorm with nothing falling flashes but draws no streaks', () => {
    const w = setup();
    w.fx.set({ kind: null, intensity: 1, ts: true }, 0, null);
    run(w, 30);
    expect(w.fx.state.count).toBe(0);
    expect(w.fx.state.visible).toBe(false);
    expect(w.fx.state.flashes).toBeGreaterThanOrEqual(1);
  });
});
