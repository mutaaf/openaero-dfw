// Runway and approach lighting (ticket 0011), laid out from the surveyed runway ends the way
// the FAA lays it out (AC 150/5340-30): white edge lights every 200 ft, centreline lights
// every 50 ft on the long instrument runways, green threshold bars facing the approach and
// red end bars facing the rollout, and an approach light system on every end: ALSF-2-style
// (2,400 ft, a light bar every 100 ft, 1,000 ft crossbar, sequenced flashers racing to the
// threshold twice a second) on the big airline runways, MALSR (1,400 ft) elsewhere.
// One Points draw call per airport (culled off screen and beyond range); lights keep a constant on-screen size like the real thing at range,
// fade in at dusk, and are directional where real fixtures are (thresholds, ends, approach).
import * as THREE from 'three';
import { courseVector } from './airports.js';

const FT = 0.3048;
export const LIGHT = { edge: 0, centre: 1, threshold: 2, end: 3, approach: 4, flasher: 5 };
const COLOURS = [
  [1, 0.93, 0.78],  // edge: warm white incandescent
  [0.92, 0.95, 1],  // centreline: white
  [0.2, 1, 0.35],   // threshold: green
  [1, 0.12, 0.08],  // end: red
  [1, 0.95, 0.85],  // approach bars: white
  [0.85, 0.92, 1],  // flashers: blue-white strobes
];

// Pure: every light as { x, z, kind, dirX, dirZ, phase }. dir is the way the light shines
// (towards an approaching pilot), 0,0 for omnidirectional. phase orders the flashers (0 at
// the outer end, 1 at the threshold).
export function layoutRunwayLights(runways, endById) {
  const out = [];
  let airport = '';
  const add = (x, z, kind, dirX = 0, dirZ = 0, phase = 0) => out.push({ x, z, kind, dirX, dirZ, phase, airport });
  for (const r of runways) {
    airport = r.airport;
    const [a, b] = r.ends.map(endById);
    const d = courseVector(a.hdgT);          // from a's end towards b's end
    const left = { x: d.z, z: -d.x };
    const half = r.widthM / 2 + 3;
    const len = r.lengthM;
    const ax = r.ax, az = r.az;
    // Edge lights: 200 ft spacing down both sides.
    const nEdge = Math.max(2, Math.round(len / (200 * FT)));
    for (let i = 0; i <= nEdge; i++) {
      const s = (i / nEdge) * len;
      for (const side of [-1, 1]) add(ax + d.x * s + left.x * half * side, az + d.z * s + left.z * half * side, LIGHT.edge);
    }
    // Centreline on the long (CAT II/III-style) runways: 50 ft spacing.
    if (len > 2300) {
      for (let s = 25 * FT; s < len; s += 50 * FT) add(ax + d.x * s, az + d.z * s, LIGHT.centre);
    }
    for (const end of [a, b]) {
      const c = courseVector(end.hdgT);      // landing direction for this end
      const l = { x: c.z, z: -c.x };
      // Threshold bar (green, towards the approach) and, at the physical end, the red bar
      // seen by an aircraft rolling out towards it from the other end.
      const n = Math.max(6, Math.round(r.widthM / 3));
      for (let i = 0; i <= n; i++) {
        const o = -r.widthM / 2 + (i / n) * r.widthM;
        add(end.thrX + l.x * o, end.thrZ + l.z * o, LIGHT.threshold, -c.x, -c.z);
        add(end.endX + l.x * o + c.x * 0.6, end.endZ + l.z * o + c.z * 0.6, LIGHT.end, c.x, c.z);
      }
      // Approach lights, out from the threshold against the landing direction: steady bars,
      // the 1,000 ft crossbar, then the flashers out to 2,400 ft.
      const big = len > 2300 && r.widthM >= 45;
      const bars = (big ? 2400 : 1400) * FT;
      const flashFrom = (big ? 1100 : 1600) * FT, flashTo = 2400 * FT;
      const at = (s, o) => [end.thrX - c.x * s + l.x * o, end.thrZ - c.z * s + l.z * o];
      for (let s = 100 * FT; s <= bars + 1; s += 100 * FT) {
        for (let k = -2; k <= 2; k++) add(...at(s, k * 1.05), LIGHT.approach, -c.x, -c.z);
        if (Math.abs(s - 1000 * FT) < 1) {
          for (const side of [-1, 1]) for (let k = 3; k <= 12; k++) add(...at(s, side * k * 1.5), LIGHT.approach, -c.x, -c.z);
        }
      }
      for (let s = flashFrom; s <= flashTo + 1; s += 100 * FT) {
        add(...at(s, 0), LIGHT.flasher, -c.x, -c.z, (flashTo - s) / (flashTo - flashFrom));
      }
    }
  }
  return out;
}

const VERT = /* glsl */`
attribute vec3 aCol;
attribute vec2 aDir;
attribute float aKind;
attribute float aPhase;
uniform float uPx, uNight, uTime, uFlash;
varying vec3 vCol;
varying float vA;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 toEye = normalize(cameraPosition - wp.xyz);
  float facing = 1.0;
  if (dot(aDir, aDir) > 0.0) facing = smoothstep(-0.05, 0.35, dot(normalize(aDir), normalize(toEye.xz)));
  float dist = length(cameraPosition - wp.xyz);
  float on = 0.18 + 0.82 * uNight;
  float size = mix(2.2, 5.0, uNight);
  if (aKind > 4.5) {
    // Sequenced flashers: one runs from the outer end to the threshold every 0.5 s.
    float t = fract(uTime * 2.0);
    float pulse = 1.0 - smoothstep(0.0, 0.05, abs(t - aPhase * 0.95));
    float a = mix(0.7, pulse, uFlash);
    on *= a * 1.6;
    size *= 1.0 + a * 0.8;
  }
  // Far edge and centreline lights shrink a little, never below a pixel and a half by day and
  // three at night. Threshold, end and approach lights and flashers (kind > 1.5), the most
  // intense lamps and the approach's transition cue (FAA AIM 2-1-1), keep their size out to
  // 10 NM: on screen, size stands for intensity, not the lamp (0068).
  size *= clamp(9000.0 / (dist + 3000.0), aKind > 1.5 ? 1.0 : 0.55, 1.4);
  gl_PointSize = max((1.5 + 1.5 * uNight) * max(1.0, uPx), size * uPx);
  vA = on * facing;
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * wp;
  // A light facing away is dark: clip it before the rasterizer sets up its quad.
  if (vA < 0.004) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.55, r);
  float halo = 1.0 - smoothstep(0.0, 1.0, r);
  vec3 c = vCol * (core * 1.6 + halo * halo * 0.6) + core * core * 0.6;
  gl_FragColor = vec4(c, vA * halo);
}`;

// Beyond this a field's lights are not drawn (about 19 NM, well past a night visual approach).
export const LIGHTS_RANGE_M = 35000;

export function createRunwayLights({ runways, endById, heightAt, reducedMotion = false }) {
  const all = layoutRunwayLights(runways, endById);
  const uniforms = { uPx: { value: 1 }, uNight: { value: 0 }, uTime: { value: 0 }, uFlash: { value: reducedMotion ? 0 : 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const group = new THREE.Group();
  group.name = 'runwayLights';
  const fields = [];
  for (const id of new Set(all.map((L) => L.airport))) {
    const lights = all.filter((L) => L.airport === id);
    const n = lights.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const dir = new Float32Array(n * 2), kind = new Float32Array(n), phase = new Float32Array(n);
    lights.forEach((L, i) => {
      pos[i * 3] = L.x; pos[i * 3 + 2] = L.z;
      // Approach lights stand on masts over the terrain; runway lights sit just proud of it.
      pos[i * 3 + 1] = heightAt(L.x, L.z) + (L.kind >= LIGHT.approach ? 1.5 : 0.4);
      col.set(COLOURS[L.kind], i * 3);
      dir[i * 2] = L.dirX; dir[i * 2 + 1] = L.dirZ;
      kind[i] = L.kind; phase[i] = L.phase;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 2));
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.computeBoundingSphere(); // frustum culling: a field behind the camera costs nothing
    const points = new THREE.Points(g, material);
    points.name = `runwayLights:${id}`;
    points.renderOrder = 3;
    group.add(points);
    fields.push({ points, g, pos, kind, n });
  }
  return {
    points: group,
    count: all.length,
    // Re-seat on the terrain once the elevation grid arrives.
    reseat() {
      for (const { g, pos, kind, n } of fields) {
        for (let i = 0; i < n; i++) pos[i * 3 + 1] = heightAt(pos[i * 3], pos[i * 3 + 2]) + (kind[i] >= LIGHT.approach ? 1.5 : 0.4);
        g.attributes.position.needsUpdate = true;
        g.computeBoundingSphere();
      }
    },
    update(time, pixelRatio, night, eye) {
      uniforms.uTime.value = time;
      uniforms.uPx.value = pixelRatio;
      uniforms.uNight.value = night;
      if (eye) {
        for (const { points, g } of fields) {
          const b = g.boundingSphere;
          points.visible = Math.hypot(b.center.x - eye.x, b.center.z - eye.z) - b.radius < LIGHTS_RANGE_M;
        }
      }
    },
  };
}
