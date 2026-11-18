// Rain, snow and thunderstorms from the METAR (ticket 0196). A lazy chunk, fetched only when the
// flown field's live report has precipitation or a thunderstorm at the field (metar.js
// metarPrecip); scenario weather draws none, so nothing here is ever made up.
//
// One LineSegments draw call: MAX_COUNT streaks seeded once in a 40 m box that wraps around the
// camera in the vertex shader. Each frame moves two uniforms (the drops' travel through the world
// and the camera's position, both wrapped on the CPU so float precision holds 60 km from the
// origin) and the streak vector: the drop's velocity relative to the aircraft (the sim's wind plus
// its fall speed, less the aircraft's velocity) times a short exposure, so rain streams past a
// moving airplane the way it does past a windscreen. Nothing is allocated per frame. Streaks
// closer than NEAR_M are not drawn (a 1 px line through the near plane would span the screen),
// and they fade out before the box's edge so the wrap never shows.
//
// Thunderstorms (TS) flash the haze: one rise-and-decay every 8-25 s, far under WCAG 2.3.1's
// three flashes a second. Reduced motion: no streaks and no flashes (the greyer haze and the storm
// sky, set in main.js, stay). Above the report's ceiling nothing falls: rain comes out of the deck.
import * as THREE from 'three';

const FT = 0.3048;
export const MAX_COUNT = 5000;
const BOX_M = 40;
const NEAR_M = 5;
// Streaks by intensity (- light, none moderate, + heavy). Snow's flakes are slower and dimmer, so
// more of them read as the same "heavy".
const COUNTS = { drizzle: [1500, 3000, 4500], rain: [1200, 2500, 4500], snow: [1600, 3200, 5000] };
// Fall speeds (terminal velocity, Gunn & Kinzer 1949): drizzle (< 0.5 mm) ~1-2 m/s; rain 1.2-4 mm ~5-9 m/s,
// bigger drops in heavier rain; snowflakes ~1 m/s. Hail falls faster (10-40 m/s): drawn as heavy rain.
const FALL_MPS = { drizzle: [1.2, 1.6, 2], rain: [5, 7, 9], snow: [1, 1.2, 1.5] };
// The "exposure" that turns a drop's relative velocity into a streak, and the longest streak.
const STREAK_S = { drizzle: 0.012, rain: 0.02, snow: 0.006 };
// With no reported cloud base, rain still comes out of a cloud: nothing falls above this.
const NO_BASE_FT = 10000;
const MAX_STREAK_M = 1.2;
export const FLASH_S = 0.7;
export { MAX_STREAK_M };

// Streaks drawn for a report's precipitation (pure): none for a dry thunderstorm or reduced motion.
export function precipCount(p, reducedMotion = false) {
  if (!p || !p.kind || reducedMotion) return 0;
  return Math.min(MAX_COUNT, COUNTS[p.kind][Math.max(0, Math.min(2, p.intensity | 0))]);
}

// Lightning: seconds to the next flash for a uniform draw r in [0, 1).
export function nextFlashGapS(r) {
  return 8 + 17 * Math.min(Math.max(r, 0), 1);
}
// One flash's brightness t seconds after it starts: a 60 ms rise and a smooth decay, once.
export function flashLevel(t) {
  if (t < 0 || t > FLASH_S) return 0;
  if (t < 0.06) return t / 0.06;
  const u = (t - 0.06) / (FLASH_S - 0.06);
  return (1 - u) * (1 - u);
}

const VERT = /* glsl */ `
attribute float aEnd;
uniform vec3 uShift;
uniform vec3 uCamMod;
uniform vec3 uStreak;
uniform float uBox;
uniform float uNear;
varying float vA;
void main() {
  vec3 p = mod(position * uBox + uShift - uCamMod, uBox) - 0.5 * uBox;
  float d = length(p);
  vA = (1.0 - smoothstep(0.3 * uBox, 0.5 * uBox, d)) * step(uNear, d) * (1.0 - 0.6 * aEnd);
  p -= uStreak * aEnd;
  gl_Position = projectionMatrix * viewMatrix * vec4(p + cameraPosition, 1.0);
  if (vA <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vA;
void main() { gl_FragColor = vec4(uColor, uAlpha * vA); }`;

export function createPrecip(scene, reducedMotion = false) {
  const seeds = new Float32Array(MAX_COUNT * 6);
  const ends = new Float32Array(MAX_COUNT * 2);
  for (let i = 0; i < MAX_COUNT; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    seeds.set([x, y, z, x, y, z], i * 6);
    ends[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  const u = {
    uShift: { value: new THREE.Vector3() }, uCamMod: { value: new THREE.Vector3() }, uStreak: { value: new THREE.Vector3() },
    uBox: { value: BOX_M }, uNear: { value: NEAR_M }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0.3 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, toneMapped: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false; // always around the camera
  lines.renderOrder = 5; // after the ground layers and clouds
  lines.visible = false;
  lines.name = 'precip';
  scene.add(lines);

  const state = { kind: null, intensity: 0, ts: false, count: 0, visible: false, flashes: 0, flash: 0 };
  let fall = 6, streakS = 0.02, whiten = 0, fieldY = 0, ceilingM = NO_BASE_FT * FT, toFlash = nextFlashGapS(Math.random()), flashT = -1;
  const _rel = new THREE.Vector3(), _camVel = new THREE.Vector3(), _lastCam = new THREE.Vector3();
  let haveCam = false;
  const _base = new THREE.Color(), _wrote = new THREE.Color(), _white = new THREE.Color(1, 1, 1);
  let haveBase = false;
  const wrap = (v) => ((v % BOX_M) + BOX_M) % BOX_M;

  // The flown field's report (null: nothing falls), the field's elevation (scene y, m) and the base
  // rain falls from (ft above the field: the ceiling, else the lowest layer; null: NO_BASE_FT).
  function set(p, fieldYM = 0, ceilingFt = null) {
    state.kind = p?.kind ?? null;
    state.intensity = p?.intensity ?? 0;
    state.ts = !!p?.ts;
    state.count = precipCount(p, reducedMotion);
    geo.setDrawRange(0, state.count * 2);
    fieldY = fieldYM;
    ceilingM = (typeof ceilingFt === 'number' ? ceilingFt : NO_BASE_FT) * FT;
    if (state.kind) {
      const i = Math.max(0, Math.min(2, state.intensity | 0));
      fall = FALL_MPS[state.kind][i];
      streakS = STREAK_S[state.kind];
      whiten = state.kind === 'snow' ? 0.65 : 0; // flakes read white against the ground by day
      u.uAlpha.value = state.kind === 'snow' ? 0.55 : 0.22 + 0.06 * i;
    }
    if (!state.ts) endFlash();
  }

  function endFlash() {
    if (haveBase && scene.fog && scene.fog.color.equals(_wrote)) { scene.fog.color.copy(_base); scene.background?.copy?.(_base); }
    haveBase = false;
    flashT = -1;
    state.flash = 0;
  }

  // Each frame: dt (s; 0 while paused: the drops hang), the camera and the wind (world m/s). Streaks
  // are drawn relative to the camera's own motion (its position change over dt), so the tower view and
  // the replay see rain fall, not streak along the airplane's path. A jump (a new spawn) is not motion.
  function update(dt, camera, wind) {
    const c = camera.position;
    if (dt > 0) {
      if (haveCam) _camVel.subVectors(c, _lastCam).divideScalar(dt);
      if (!haveCam || _camVel.lengthSq() > 400 * 400) _camVel.set(0, 0, 0);
      _lastCam.copy(c);
      haveCam = true;
    }
    const vel = _camVel;
    state.visible = state.count > 0 && c.y - fieldY < ceilingM;
    lines.visible = state.visible;
    if (state.visible) {
      const s = u.uShift.value;
      s.set(wrap(s.x + wind.x * dt), wrap(s.y + (wind.y - fall) * dt), wrap(s.z + wind.z * dt));
      u.uCamMod.value.set(wrap(c.x), wrap(c.y), wrap(c.z));
      _rel.set(wind.x - vel.x, wind.y - fall - vel.y, wind.z - vel.z).multiplyScalar(streakS);
      if (_rel.lengthSq() > MAX_STREAK_M * MAX_STREAK_M) _rel.setLength(MAX_STREAK_M);
      u.uStreak.value.copy(_rel);
      // Lit like the air around it: the haze's colour, lifted, and brighter in a flash.
      if (scene.fog) {
        const c = u.uColor.value.copy(haveBase ? _base : scene.fog.color);
        const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // dark at night: the flakes too
        c.multiplyScalar(1.35).lerp(_white, Math.max(whiten * Math.min(1, 2 * lum), 0.5 * state.flash));
      }
    }
    if (!state.ts || reducedMotion || !scene.fog) return;
    if (flashT < 0) {
      toFlash -= dt;
      if (toFlash > 0) return;
      flashT = 0;
      state.flashes++;
      toFlash = nextFlashGapS(Math.random());
      _base.copy(scene.fog.color);
      haveBase = true;
    } else {
      // main.js re-lit the sky mid-flash (a new report, the time of day): flash from its colour.
      if (!scene.fog.color.equals(_wrote)) _base.copy(scene.fog.color);
      flashT += dt;
    }
    state.flash = flashLevel(flashT);
    if (flashT > FLASH_S) { endFlash(); return; }
    scene.fog.color.copy(_base).lerp(_white, 0.45 * state.flash);
    scene.background?.copy?.(scene.fog.color);
    _wrote.copy(scene.fog.color);
  }

  return { set, update, state, object: lines };
}
