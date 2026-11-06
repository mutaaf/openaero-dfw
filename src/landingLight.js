// Landing light (ticket 0076, in runwayLights.js's lazy chunk): a lit patch of ground ahead of the
// aircraft on a night final, and a faint beam. FAA AIM 4-3-23 encourages landing lights when
// operating below 10,000 feet, day or night, especially within 10 miles of an airport. Here the
// light is on at the start of every flight, switches itself off climbing through 10,000 ft on the
// altimeter (MSL) and back on descending through it (a crossing, so the player's own choice holds
// in between). L or the menu's 💡 button toggles it; not stored.
//
// The pool is one mesh over the beam's footprint, laid on terrain.js heights (the imagery and the
// runway decals; buildings of the photoreal city are not lit, they hide it), drawn twice: once
// with a multiplying blend, dst · (1 + k), which keeps the ground's own colour and markings, and
// once adding k · PAVEMENT, which lights what the night has turned near black (a runway decal
// by moonlight is ~1% of white, and a multiple of black is black). k = gain · cone · cos(incidence)
// / r²: the inverse-square law on a horizontal surface, so the patch is brightest near the
// airplane, fades with distance and is dimmer the more the light grazes the ground. k is a
// display gain on the tone-mapped, sRGB frame, tuned by eye, not a photometric ratio (×(1 + k)
// in sRGB is about ×(1 + k)^2.2 in linear light). The gain fades in with the night much more
// steeply than the city lights (lampGain): at sunset the sky outshines any landing light.
// Nothing here changes the boot shaders or the physics (sim is only read).
import * as THREE from 'three';

// Per aircraft, in the body frame (m from the CG, +X right, +Y up, nose -Z): one lamp standing in
// for the pair, aimed `downDeg` below the body axis, `halfDeg` the beam's half-angle. Approximate
// placements (737: the wing-root lights; Cessna 172S: the left wing's leading edge; F-16: the
// nose-gear strut, so lit only with the gear down). Fixed landing lights are aimed for the landing
// attitude, so the axis is a little below the horizon on a 3° final: the 737 (~2.5° nose up)
// at 5°, the Cessna (~3°) at 4°, the F-16 at 12° for its ~13° approach AoA (pitch ~10°;
// NASA/TM-2014-218514's HUD bracket). Our F-16 flies ~6° today (KNOWN GAP 0163): the pool then
// sits nearer, still on the runway. The aim and spread are typical, not a published figure.
// (Kept here, not in aircraft.js, which is boot JS.)
export const LAMPS = {
  b738: { pos: [0, -0.6, -4.5], downDeg: 5, halfDeg: 9 },
  c172: { pos: [-2.4, 1.0, -0.4], downDeg: 4, halfDeg: 10 },
  f16: { pos: [0, -1.4, -3.4], downDeg: 12, halfDeg: 9, gear: true },
};
// As flown: a 737 at 100 ft on the 3° path peaks at k ≈ 1.2 about 190 m ahead (the screen ×2.2
// there), k ≈ 3-5 at 50 ft, and k reaches K_MAX (×7, plus the pavement pass) under the nose in the flare.
export const GAIN = 3.5e5; // m², display gain (see above)
export const K_MAX = 6;
// The light the second pass adds per unit of k, as a fraction of white: a dark pavement's
// albedo (asphalt ~0.05-0.1, worn concrete ~0.2), on the low side, as the sRGB frame makes it look brighter.
export const PAVEMENT = 0.06;
export const AUTO_FT = 10000;
const MIN_K = 0.03; // the footprint ends where the lamp adds under 3%
const INNER = 0.6; // the cone's full-brightness core, as a fraction of its half-angle
const NS = 24, NL = 8; // grid: along the beam, across it
const D2R = Math.PI / 180;

// The lamp's gain at nightGround.js's uNight (0 by day; it starts rising at +2° of sun, while the
// sun still lights the runway): to the 4th power, ~0.0007 at sunset (0°), 0.06 at −2°, full at −6°.
export const lampGain = (night) => GAIN * night ** 4;

// The lamp's share of the light (k) at a ground point d metres from the lamp (d.y < 0 below it),
// for the beam axis `axis` (unit). Pure: the shader (FRAG) computes the same, unit tests pin both.
export function poolK(dx, dy, dz, ax, ay, az, halfDeg, gain = GAIN) {
  const r2 = dx * dx + dy * dy + dz * dz;
  if (r2 < 1e-6) return K_MAX;
  const r = Math.sqrt(r2);
  const cosA = (dx * ax + dy * ay + dz * az) / r;
  const cone = smoothstep(Math.cos(halfDeg * D2R), Math.cos(halfDeg * INNER * D2R), cosA);
  const inc = Math.max(-dy / r, 0);
  return Math.min(gain * cone * inc / r2, K_MAX);
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The beam's axis in the world (unit, into `out`): body -Z turned `downDeg` nose-down about the
// body's +X, then by the aircraft's attitude `quat`.
const _xAxis = new THREE.Vector3(1, 0, 0);
export function lampAxis(out, quat, downDeg) {
  return out.set(0, 0, -1).applyAxisAngle(_xAxis, -downDeg * D2R).applyQuaternion(quat).normalize();
}

// Where on the ground (m ahead along the beam's heading, from the lamp) the pool starts and ends,
// for the lamp h metres up and the axis `downRad` below the horizon, written into `out` (no
// allocation per frame). false: the beam misses the ground. In a bank the cone's ground ellipse
// stays symmetric about the axis' heading, so near/far are its ends.
export function footprint(out, h, downRad, halfDeg, gain = GAIN) {
  const half = halfDeg * D2R;
  if (h <= 0.05 || downRad + half <= 0.001 || gain <= 0) return false;
  // The farthest a lit point can be: k = gain · (h / r) / r² ≥ MIN_K.
  const rMax = Math.min(1500, Math.cbrt(gain * h / MIN_K));
  const lo = downRad + half; // the beam's lower edge, below the horizon
  const near = lo >= Math.PI / 2 ? 0 : h / Math.tan(lo);
  const hi = downRad - half;
  const far = Math.min(hi > 0.001 ? h / Math.tan(hi) : rMax, Math.sqrt(Math.max(0, rMax * rMax - h * h)));
  if (far <= near) return false;
  out.near = Math.max(1, near * 0.9);
  out.far = far * 1.05;
  return true;
}

// Kilometres in the fragment shader: r² in m² (up to ~2e6) and the gain (3.5e5) overflow a
// mediump float (65,504), and world positions reach ~48 km from KDFW.
export const VERT = /* glsl */`
uniform vec3 uLamp;
varying vec3 vD;
void main() {
  vD = (position - uLamp) * 0.001;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
// k as poolK, less the fog: the light goes out to the ground and back through it, the scene's
// FogExp2 transmission exp(-(density r)²) each way.
export const FRAG = /* glsl */`
uniform vec3 uAxis;
uniform float uCosOuter;
uniform float uCosInner;
uniform float uGain;
uniform float uFogKm;
uniform float uScale;
varying vec3 vD;
void main() {
  float r2 = max(dot(vD, vD), 1e-8);
  vec3 dir = vD * inversesqrt(r2);
  float cone = smoothstep(uCosOuter, uCosInner, dot(dir, uAxis));
  float k = min(uGain * cone * max(-dir.y, 0.0) / r2, ${K_MAX.toFixed(1)});
  k *= exp(-2.0 * uFogKm * uFogKm * r2);
  gl_FragColor = vec4(k * uScale * vec3(1.0, 0.95, 0.86), 1.0);
}`;

// sim: main.js's sim (read only: aircraftKey, mslFt, gearDown, wx, cameraMode, loadedMission);
// root(): the aircraft's Object3D (posed by the physics, or by the replay); heightAt(x, z):
// terrain.js ground height.
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
    uGain: { value: 0 }, // km² (GAIN · 1e-6)
    uFogKm: { value: 0 }, // the scene fog's density per km
  };
  // Two passes over the same triangles (see the top): the multiply, then the pavement light.
  // The polygon offset and a lift that grows with distance keep the pool over the drawn terrain,
  // whose tiles are coarser than terrain.js between their vertices (a phone's z15 is ~256 m).
  const pass = (uScale, blend) => new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uScale: { value: uScale } }, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true, ...blend,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
  const poolMats = [
    pass(1, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor }),
    pass(PAVEMENT, { blending: THREE.AdditiveBlending }),
  ];
  geo.addGroup(0, idx.length, 0);
  geo.addGroup(0, idx.length, 1);
  const pool = new THREE.Mesh(geo, poolMats);
  pool.frustumCulled = false; // world-space vertices
  pool.renderOrder = 4; // after the runway lights (3), before skyDome.js's cloud layers (5)
  group.add(pool);

  // The beam: a faint open cone from the lamp, 60 m long, brighter in low visibility (mist
  // scatters it), additive. Its geometry points down -Z from the apex and is posed every frame.
  // (CylinderGeometry with a zero top: a ConeGeometry here splits three's BufferGeometry out of boot.)
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
  let mission;
  let lampKey = null, lamp = LAMPS.b738;
  const _q = new THREE.Quaternion();
  const _lamp = new THREE.Vector3(), _axis = new THREE.Vector3(), _fwd = new THREE.Vector3(), _side = new THREE.Vector3();
  const _laidLamp = new THREE.Vector3(), _laidAxis = new THREE.Vector3();
  const fp = { near: 0, far: 0 };
  let laid = false; // the grid lies under the current footprint
  const state = { on, lit: false, gain: 0, near: 0, far: 0, relaid: 0 };

  const doc = globalThis.document;
  const btn = doc?.getElementById('btnLandLight');
  const txt = doc?.getElementById('txtLandLight');
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
  globalThis.addEventListener?.('keydown', (e) => {
    if (e.code !== 'KeyL' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target?.closest?.('input, select, textarea')) return; // typing in a field, not flying
    set(!on);
  });
  show();

  // night: nightGround.js uNight (0 by day, 1 at full night).
  function update(night) {
    const r = root();
    const high = sim.mslFt > AUTO_FT;
    if (sim.loadedMission !== mission) {
      // A new flight starts with the light on (below 10,000 ft), whatever the last one did.
      mission = sim.loadedMission;
      wasHigh = high;
      set(!high);
    } else if (high !== wasHigh) {
      // Climbing through 10,000 ft switches it off, descending through it on (AIM 4-3-23).
      wasHigh = high;
      set(!high);
    }
    if (lampKey !== sim.aircraftKey) { lampKey = sim.aircraftKey; lamp = LAMPS[lampKey] || LAMPS.b738; laid = false; }
    const gain = lampGain(night);
    const lit = on && gain > 1 && !!r && (!lamp.gear || sim.gearDown);
    state.lit = lit;
    state.gain = lit ? gain : 0;
    pool.visible = beam.visible = false;
    state.near = state.far = 0;
    if (!lit) { laid = false; return; }

    r.updateMatrixWorld();
    _lamp.fromArray(lamp.pos).applyMatrix4(r.matrixWorld);
    r.getWorldQuaternion(_q);
    lampAxis(_axis, _q, lamp.downDeg);

    // Beam: from the lamp along the axis, scaled to its spread; mist (under 3 SM) shows more of
    // it. Not from the cockpit (you see the pool there, not the cone's shell), but in the replay's
    // outside cameras whatever the flying camera was.
    const spread = BEAM_M * Math.tan(lamp.halfDeg * D2R);
    beam.position.copy(_lamp);
    beam.quaternion.setFromUnitVectors(_fwd.set(0, 0, -1), _axis);
    beam.scale.set(spread, spread, BEAM_M);
    const vis = sim.wx?.visibilitySm ?? 10;
    beamMat.opacity = night * (0.025 + 0.1 * Math.max(0, 1 - vis / 3));
    beam.visible = sim.cameraMode !== 0 || !!doc?.body.classList.contains('replaying');

    // Pool: a grid over the footprint along the axis' heading, laid on the terrain. Re-laid only
    // when the lamp has moved or turned enough to leave the grid's margins (near ×0.9, far ×1.05,
    // the width ×1.6 + 4 m): ~15 times a second on a final, never while paused. The shader
    // computes k from the lamp uniforms every frame.
    const h = _lamp.y - heightAt(_lamp.x, _lamp.z);
    const horiz = Math.hypot(_axis.x, _axis.z);
    if (horiz <= 1e-3 || !footprint(fp, h, Math.atan2(-_axis.y, horiz), lamp.halfDeg, gain)) { laid = false; return; }
    state.near = fp.near; state.far = fp.far;
    const moveM = Math.min(3, 0.3 + 0.08 * h);
    if (!laid || _lamp.distanceToSquared(_laidLamp) > moveM * moveM || _axis.dot(_laidAxis) < 0.99996) { // 0.5°
      laid = true;
      state.relaid++;
      _laidLamp.copy(_lamp);
      _laidAxis.copy(_axis);
      _fwd.set(_axis.x / horiz, 0, _axis.z / horiz);
      _side.set(-_fwd.z, 0, _fwd.x);
      const tanHalf = Math.tan(lamp.halfDeg * D2R);
      const ratio = fp.far / fp.near;
      let k = 0;
      for (let i = 0; i <= NS; i++) {
        const s = fp.near * ratio ** (i / NS); // denser near the aircraft
        const w = Math.hypot(s, h) * tanHalf * 1.6 + 4; // the cone's width there, with a margin
        const lift = 0.3 + 0.004 * s; // over the coarser drawn tiles (see the materials)
        for (let j = 0; j <= NL; j++) {
          const u = (j / NL * 2 - 1) * w;
          const x = _lamp.x + _fwd.x * s + _side.x * u;
          const z = _lamp.z + _fwd.z * s + _side.z * u;
          pos[k++] = x; pos[k++] = heightAt(x, z) + lift; pos[k++] = z;
        }
      }
      geo.attributes.position.needsUpdate = true;
    }
    uniforms.uLamp.value.copy(_lamp);
    uniforms.uAxis.value.copy(_axis);
    uniforms.uCosOuter.value = Math.cos(lamp.halfDeg * D2R);
    uniforms.uCosInner.value = Math.cos(lamp.halfDeg * INNER * D2R);
    uniforms.uGain.value = gain * 1e-6;
    uniforms.uFogKm.value = (group.parent?.fog?.density ?? 0) * 1000;
    pool.visible = true;
  }

  const api = { group, update, set, get on() { return on; }, debug: () => ({ ...state }), pool, beam, uniforms };
  if (globalThis.location && new URLSearchParams(location.search).has('debug')) window.openaeroLandingLight = api; // e2e
  return api;
}
