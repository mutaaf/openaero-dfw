// Landing light (ticket 0076, lazy chunk after boot): a lit patch of ground ahead of the aircraft
// on a night final, and a faint beam. FAA AIM 4-3-23 recommends the landing lights on below
// 10,000 ft near an airport; here the light is on by default and switches itself off climbing
// through 10,000 ft AGL and back on descending through it (a crossing, so the player's own
// choice holds in between). L or the menu's Land light button toggles it; not stored.
//
// The pool is one ground-conforming mesh over the beam's footprint (heights from terrain.js, so
// it lies on the imagery, the runway decals and the photoreal city alike) drawn with a
// multiplying blend: the result is dst · (1 + k), the colour already lit by the moon and the
// sky plus the lamp's share. That is albedo · (E_ambient + E_lamp) when k = E_lamp / E_ambient,
// so the pavement keeps its own colour and markings, and nothing changes the boot shaders.
// k = gain · cone · cos(incidence) / r², the inverse-square law on a horizontal surface; the gain
// fades in with the city lights (nightGround.js cityLightsFor) and is 0 by day, where the mesh
// is hidden: E_lamp is nothing against the sun.
import * as THREE from 'three';

// Per aircraft, in the body frame (m from the CG, +X right, +Y up, nose -Z): one lamp standing in
// for the pair, aimed `downDeg` below the body axis, `halfDeg` the beam's half-angle. Approximate
// placements (737: the wing-root lights; Cessna 172S: the left wing's leading edge; F-16: the
// nose-gear strut); the aim and spread are typical of fixed landing lights, not a published figure.
// (Kept here, not in aircraft.js, which is boot JS.)
export const LAMPS = {
  b738: { pos: [0, -0.6, -4.5], downDeg: 5, halfDeg: 9 },
  c172: { pos: [-2.4, 1.0, -0.4], downDeg: 4, halfDeg: 10 },
  f16: { pos: [0, -1.4, -3.4], downDeg: 6, halfDeg: 9 },
};
// k at 150 m on the axis from 100 ft (cos incidence ~0.2) is ~3: the patch is ~4x the moonlit
// ground there, and ~40x where it saturates under the nose in the flare (capped at K_MAX).
export const GAIN = 3.5e5; // m², in units of the night's ambient light
export const K_MAX = 6;
// The light the second pass adds per unit of k, as a fraction of white: a dark pavement's
// albedo (asphalt ~0.05-0.1, worn concrete ~0.2), on the low side, as the sRGB frame makes it look brighter.
export const PAVEMENT = 0.06;
export const AUTO_FT = 10000;
const MIN_K = 0.03; // the footprint ends where the lamp adds under 3%
const NS = 24, NL = 8; // grid: along the beam, across it

// The lamp's share of the light (k) at a ground point d metres from the lamp (d.y < 0 below it),
// for the beam axis `axis` (unit). Pure: the shader computes the same, a unit test pins it.
export function poolK(dx, dy, dz, ax, ay, az, halfDeg, gain = GAIN) {
  const r2 = dx * dx + dy * dy + dz * dz;
  if (r2 < 1e-6) return K_MAX;
  const r = Math.sqrt(r2);
  const cosA = (dx * ax + dy * ay + dz * az) / r;
  const half = halfDeg * Math.PI / 180;
  const cone = smoothstep(Math.cos(half), Math.cos(half * 0.6), cosA);
  const inc = Math.max(-dy / r, 0);
  return Math.min(gain * cone * inc / r2, K_MAX);
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Where on the ground (m ahead along the beam's heading, from the lamp) the pool starts and ends,
// for the lamp h metres up and the axis `downRad` below the horizon. null: the beam misses the ground.
export function footprint(h, downRad, halfDeg, gain = GAIN) {
  const half = halfDeg * Math.PI / 180;
  if (h <= 0.05 || downRad + half <= 0.001) return null;
  // The farthest a lit point can be: k = gain · (h / r) / r² ≥ MIN_K.
  const rMax = Math.min(1500, Math.cbrt(gain * h / MIN_K));
  const lo = downRad + half; // the beam's lower edge, below the horizon
  const near = lo >= Math.PI / 2 ? 0 : h / Math.tan(lo);
  const hi = downRad - half;
  const far = Math.min(hi > 0.001 ? h / Math.tan(hi) : rMax, Math.sqrt(Math.max(0, rMax * rMax - h * h)));
  if (far <= near) return null;
  return { near: Math.max(1, near * 0.9), far: far * 1.05 };
}

const VERT = /* glsl */`
varying vec3 vW;
void main() {
  vW = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */`
uniform vec3 uLamp;
uniform vec3 uAxis;
uniform float uCosOuter;
uniform float uCosInner;
uniform float uGain;
uniform float uScale;
varying vec3 vW;
void main() {
  vec3 d = vW - uLamp;
  float r2 = max(dot(d, d), 1e-4);
  vec3 dir = d * inversesqrt(r2);
  float cone = smoothstep(uCosOuter, uCosInner, dot(dir, uAxis));
  float k = min(uGain * cone * max(-dir.y, 0.0) / r2, ${K_MAX.toFixed(1)});
  gl_FragColor = vec4(k * uScale * vec3(1.0, 0.95, 0.86), 1.0);
}`;

// sim: main.js's sim (aircraftKey, aglFt, wx, cameraMode); root(): the aircraft's Object3D (posed by the
// physics, or by the replay); heightAt(x, z): terrain.js ground height.
export function createLandingLight(sim, root, heightAt) {
  const group = new THREE.Group();
  group.name = 'landingLight';

  const verts = (NS + 1) * (NL + 1);
  const pos = new Float32Array(verts * 3);
  const idx = [];
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NL; j++) {
      const a = i * (NL + 1) + j, b = a + NL + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b); // counter-clockwise seen from above: the face up
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  const uniforms = {
    uLamp: { value: new THREE.Vector3() },
    uAxis: { value: new THREE.Vector3(0, 0, -1) },
    uCosOuter: { value: 1 },
    uCosInner: { value: 1 },
    uGain: { value: 0 },
  };
  // Two passes over the same triangles: dst · (1 + k) keeps the ground's own colour (the
  // multiply), and k · PAVEMENT added lights what the night has turned near black (a runway
  // decal is ~1% of white by moonlight, and a multiple of black is black).
  const pass = (uScale, blend) => new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uScale: { value: uScale } }, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true, ...blend,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
  });
  const poolMats = [
    pass(1, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor }),
    pass(PAVEMENT, { blending: THREE.AdditiveBlending }),
  ];
  geo.addGroup(0, idx.length, 0);
  geo.addGroup(0, idx.length, 1);
  const pool = new THREE.Mesh(geo, poolMats);
  pool.frustumCulled = false; // world-space vertices, rewritten every frame
  pool.renderOrder = 5;
  group.add(pool);

  // The beam: a faint open cone from the lamp, 60 m long, brighter in low visibility (mist
  // scatters it), additive. Its geometry points down -Z from the apex and is posed every frame.
  const BEAM_M = 60;
  const beamGeo = new THREE.CylinderGeometry(0, 1, 1, 24, 1, true);
  beamGeo.translate(0, -0.5, 0).rotateX(Math.PI / 2); // apex at the origin, opening towards -Z
  const beamCol = new Float32Array(beamGeo.attributes.position.count * 3);
  for (let i = 0; i < beamGeo.attributes.position.count; i++) {
    const t = Math.min(1, Math.max(0, -beamGeo.attributes.position.getZ(i))); // 0 apex → 1 mouth
    const c = (1 - t) ** 2;
    beamCol[i * 3] = c; beamCol[i * 3 + 1] = c * 0.95; beamCol[i * 3 + 2] = c * 0.86;
  }
  beamGeo.setAttribute('color', new THREE.BufferAttribute(beamCol, 3));
  const beamMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.renderOrder = 6;
  group.add(beam);

  let on = true;
  let wasHigh = false;
  let lampKey = null, lamp = LAMPS.b738;
  const _q = new THREE.Quaternion();
  const _lamp = new THREE.Vector3(), _axis = new THREE.Vector3(), _fwd = new THREE.Vector3(), _side = new THREE.Vector3();
  const _x = new THREE.Vector3(1, 0, 0);
  const state = { on, lit: false, gain: 0, near: 0, far: 0 };

  const btn = document.getElementById('btnLandLight');
  const txt = document.getElementById('txtLandLight');
  function show() {
    if (txt) { txt.textContent = on ? 'ON' : 'OFF'; txt.className = on ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'; }
    if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('active', on); }
    state.on = on;
  }
  function set(v) { on = !!v; show(); }
  if (btn) {
    btn.classList.remove('hidden');
    btn.addEventListener('click', () => set(!on));
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyL' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) set(!on);
  });
  show();

  // night: nightGround.js uNight (0 by day, 1 at full night).
  function update(night) {
    const r = root();
    // Climbing through 10,000 ft AGL switches it off, descending through it on (AIM 4-3-23).
    const high = sim.aglFt > AUTO_FT;
    if (high !== wasHigh) { wasHigh = high; set(!high); }
    const lit = on && night > 0.001 && !!r;
    state.lit = lit;
    state.gain = lit ? GAIN * night : 0;
    pool.visible = beam.visible = false;
    state.near = state.far = 0;
    if (!lit) return;
    if (lampKey !== sim.aircraftKey) { lampKey = sim.aircraftKey; lamp = LAMPS[lampKey] || LAMPS.b738; }

    r.updateMatrixWorld();
    _lamp.fromArray(lamp.pos).applyMatrix4(r.matrixWorld);
    r.getWorldQuaternion(_q);
    _axis.set(0, 0, -1).applyAxisAngle(_x, -lamp.downDeg * Math.PI / 180).applyQuaternion(_q).normalize();

    // Beam: from the lamp along the axis, scaled to its spread; mist (under 3 SM) shows more of it.
    const spread = BEAM_M * Math.tan(lamp.halfDeg * Math.PI / 180);
    beam.position.copy(_lamp);
    beam.quaternion.setFromUnitVectors(_fwd.set(0, 0, -1), _axis);
    beam.scale.set(spread, spread, BEAM_M);
    const vis = sim.wx?.visibilitySm ?? 10;
    beamMat.opacity = night * (0.025 + 0.1 * Math.max(0, 1 - vis / 3));
    beam.visible = sim.cameraMode !== 0; // from the cockpit you see the pool, not the cone's shell

    // Pool: a grid over the footprint along the axis' heading, laid on the terrain.
    const h = _lamp.y - heightAt(_lamp.x, _lamp.z);
    const horiz = Math.hypot(_axis.x, _axis.z);
    const fp = horiz > 1e-3 ? footprint(h, Math.atan2(-_axis.y, horiz), lamp.halfDeg, state.gain) : null;
    if (!fp) return;
    state.near = fp.near; state.far = fp.far;
    _fwd.set(_axis.x / horiz, 0, _axis.z / horiz);
    _side.set(-_fwd.z, 0, _fwd.x);
    const tanHalf = Math.tan(lamp.halfDeg * Math.PI / 180);
    const ratio = fp.far / fp.near;
    let k = 0;
    for (let i = 0; i <= NS; i++) {
      const s = fp.near * ratio ** (i / NS); // denser near the aircraft
      const w = Math.hypot(s, h) * tanHalf * 1.6 + 4; // a bank skews the footprint: room for it
      for (let j = 0; j <= NL; j++) {
        const u = (j / NL * 2 - 1) * w;
        const x = _lamp.x + _fwd.x * s + _side.x * u;
        const z = _lamp.z + _fwd.z * s + _side.z * u;
        pos[k++] = x; pos[k++] = heightAt(x, z) + 0.3; pos[k++] = z;
      }
    }
    geo.attributes.position.needsUpdate = true;
    uniforms.uLamp.value.copy(_lamp);
    uniforms.uAxis.value.copy(_axis);
    uniforms.uCosOuter.value = Math.cos(lamp.halfDeg * Math.PI / 180);
    uniforms.uCosInner.value = Math.cos(lamp.halfDeg * 0.6 * Math.PI / 180);
    uniforms.uGain.value = state.gain;
    pool.visible = true;
  }

  const api = { group, update, set, get on() { return on; }, debug: () => ({ ...state }) };
  if (globalThis.location && new URLSearchParams(location.search).has('debug')) window.openaeroLandingLight = api; // e2e
  return api;
}
