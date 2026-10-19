// The sky over the sim: an atmosphere dome (zenith → horizon gradient, sunward glow, the
// sun's disc and halo), the real stars and Moon over DFW at the sim's time (sky.js), and
// the METAR's cloud layers. The dome's horizon is the fog colour, so the ground melts into
// the sky. Everything here is drawn around the camera, behind the world.
import * as THREE from 'three';
import {
  equatorialToSim, lstRad, moonDirection, moonIllumination, nightness, starColour, STAR_STRIDE,
} from './sky.js';

const R_SKY = 80000;
const R_STARS = 76000;
const R_MOON = 72000;
// The Moon is 0.52° across; drawn at 0.9° so it reads on a phone the way it does to the eye.
const MOON_DIAMETER_DEG = 0.9;
const SPACE_BLUE = new THREE.Color(0x020a2a);

// The smooth parts (gradient, twilight glow, overcast) are per vertex on a dense dome; the
// fragment shader adds only what needs a pixel: the sun's disc and halo, the Moon's glow.
const SKY_VERT = /* glsl */`
uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uOvercastCol, uSpaceCol;
uniform float uGlowK, uOvercast, uSpace;
varying vec3 vDir;
varying vec3 vBase;
void main() {
  vDir = position;
  vec3 d = normalize(position);
  float h = d.y;
  vec3 zen = mix(uZenith, uSpaceCol, uSpace);
  // The sky stays horizon-coloured below the horizon (the far ground fades into it).
  float up = clamp(h + 0.01, 0.0, 1.0);
  vec3 col = mix(uHorizon, zen, pow(up, 0.38 + 0.25 * uSpace));
  // Twilight / golden hour: the sunward horizon burns, fading upwards and around.
  vec2 dh = normalize(d.xz + 1e-5), sh = normalize(uSunDir.xz + 1e-5);
  float toward = max(dot(dh, sh), 0.0);
  col += uGlow * uGlowK * pow(toward, 2.5) * exp(-max(h, 0.0) * 7.0);
  vBase = mix(col, uOvercastCol, uOvercast * smoothstep(-0.1, 0.12, h));
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // on the far plane
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 uSunDir, uSunCol, uMoonDir;
uniform float uSunVis, uMoonLit, uOvercast;
varying vec3 vDir;
varying vec3 vBase;
void main() {
  vec3 col = vBase;
  if (uSunVis > 0.0 || uMoonLit > 0.0) {
    vec3 d = normalize(vDir);
    float clear = 1.0 - uOvercast;
    // The sun: a wide Mie halo, a tight aureole and a hard disc (0.53°).
    float c = max(dot(d, uSunDir), 0.0);
    float c2 = c * c, c4 = c2 * c2, c8 = c4 * c4;
    float halo = c8 * c2 * 0.22 + pow(c, 300.0) * 0.9;
    col += uSunCol * uSunVis * clear * (halo + smoothstep(0.99990, 0.99997, c) * 18.0 * smoothstep(-0.012, 0.004, d.y));
    // Moonlit haze around the Moon.
    float m = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.55, 0.6, 0.75) * pow(m, 40.0) * 0.06 * uMoonLit * clear;
  }
  // Break up 8-bit banding in the long night gradients (interleaved gradient noise).
  col += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const STAR_VERT = /* glsl */`
attribute float aMag;
attribute vec3 aCol;
uniform float uPx, uLimit, uTime, uTwinkle;
varying vec3 vCol;
varying float vA;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 dir = normalize(wp.xyz - cameraPosition);
  float ext = smoothstep(-0.01, 0.2, dir.y);              // extinction near the horizon
  float flux = pow(2.512, -aMag);                          // brightness relative to mag 0
  float vis = clamp((uLimit - aMag) * 0.9, 0.0, 1.0);      // fade out below the sky's limit
  float seed = fract(sin(aMag * 91.7 + position.x * 0.013) * 4375.85);
  float tw = 1.0 + uTwinkle * (1.0 - dir.y) * 0.35 * sin(uTime * (6.0 + seed * 11.0) + seed * 40.0);
  gl_PointSize = uPx * clamp(2.2 + sqrt(flux) * 2.6, 2.2, 8.0);
  vA = clamp(0.35 + flux * 0.9, 0.0, 1.4) * vis * ext * tw;
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const STAR_FRAG = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.2, 0.7, r);
  float halo = 1.0 - smoothstep(0.0, 1.0, r);
  gl_FragColor = vec4(vCol * vA * (core * 1.5 + halo * halo * 0.6), 1.0);
}`;

const MOON_FRAG = /* glsl */`
uniform vec3 uSunDir, uMoonDir, uRight, uUp;
uniform float uAlpha;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float z = sqrt(1.0 - r2);
  // The lit hemisphere is the one facing the sun: the phase falls out of the geometry.
  vec3 n = normalize(uRight * p.x + uUp * p.y - uMoonDir * z);
  float lit = smoothstep(-0.03, 0.12, dot(n, uSunDir));
  float maria = 0.72 + 0.28 * noise(p * 2.6 + 3.0) * noise(p * 5.3 - 1.0) * 1.6;
  vec3 col = vec3(1.0, 0.97, 0.9) * maria * (lit * 1.35 + 0.025); // + earthshine
  gl_FragColor = vec4(col, uAlpha * smoothstep(1.0, 0.92, r2));
}`;

const PASS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Clouds: one textured layer per METAR layer, procedural value-noise fbm in world space
// (drifting with the wind), lit by the sun from above, grey underneath, fogged.
const CLOUD_VERT = /* glsl */`
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const CLOUD_FRAG = /* glsl */`
uniform float uCover, uBelow, uSeed;
uniform vec2 uDrift;
uniform vec3 uLit, uShade;
varying vec3 vWorld;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = (vWorld.xz + uDrift) / 2600.0 + uSeed;
  float n = fbm(p);
  // fbm sits around 0.5 ± 0.12: pick the threshold that leaves about uCover of the sky.
  float t = 0.68 - 0.36 * uCover;
  float dens = max(smoothstep(t - 0.04, t + 0.12, n), step(0.99, uCover) * 0.97);
  if (dens < 0.01) discard;
  float thick = smoothstep(t, t + 0.25, n);
  // From below: dark, thick bellies; from above: sunlit tops.
  vec3 col = mix(uLit, uShade, uBelow * thick * 0.85);
  gl_FragColor = vec4(col, dens * 0.95);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createSkyDome({ scene, base, reducedMotion = false }) {
  const group = new THREE.Group();
  group.name = 'skyDome';
  scene.add(group);

  const skyU = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uOvercastCol: { value: new THREE.Color() }, uGlowK: { value: 0 }, uSunVis: { value: 1 }, uOvercast: { value: 0 },
    uMoonLit: { value: 0 }, uSpace: { value: 0 }, uSpaceCol: { value: SPACE_BLUE.clone() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(R_SKY, 64, 64),
    new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
  );
  // Drawn after the opaque world on the far plane: the depth test skips every pixel the
  // ground already covers (a full-screen fill costs ~5 ms a frame on software GL).
  sky.renderOrder = 100;
  sky.frustumCulled = false;
  group.add(sky);

  // Stars: a fixed equatorial sphere, turned to the sky over DFW by one matrix a frame.
  const celestial = new THREE.Group();
  celestial.matrixAutoUpdate = false;
  group.add(celestial);
  const starU = { uPx: { value: 1 }, uLimit: { value: -5 }, uTime: { value: 0 }, uTwinkle: { value: reducedMotion ? 0 : 1 } };
  let stars = null;
  fetch(`${base}sky/stars-v1.bin`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((buf) => {
    if (!buf) return;
    const rec = new Float32Array(buf);
    const n = rec.length / STAR_STRIDE;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), mag = new Float32Array(n);
    const c = [1, 1, 1];
    for (let i = 0; i < n; i++) {
      const ra = rec[i * 4], dec = rec[i * 4 + 1];
      pos[i * 3] = Math.cos(dec) * Math.cos(ra) * R_STARS;
      pos[i * 3 + 1] = Math.cos(dec) * Math.sin(ra) * R_STARS;
      pos[i * 3 + 2] = Math.sin(dec) * R_STARS;
      starColour(rec[i * 4 + 3], c);
      // Linear light, slightly desaturated: real stars read nearly white to the eye.
      for (let k = 0; k < 3; k++) col[i * 3 + k] = (0.55 + 0.45 * c[k]) ** 2.2;
      mag[i] = rec[i * 4 + 2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    stars = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: starU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    stars.renderOrder = -19;
    stars.frustumCulled = false;
    celestial.add(stars);
  }).catch(() => { /* offline: no stars, the sky still works */ });

  const moonU = {
    uSunDir: skyU.uSunDir, uMoonDir: skyU.uMoonDir, uRight: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() }, uAlpha: { value: 1 },
  };
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: moonU, vertexShader: PASS_VERT, fragmentShader: MOON_FRAG, transparent: true, depthWrite: false, toneMapped: false,
  }));
  moon.renderOrder = -18;
  moon.frustumCulled = false;
  moon.scale.setScalar(2 * R_MOON * Math.tan((MOON_DIAMETER_DEG / 2) * Math.PI / 180));
  group.add(moon);

  // Cloud layers live in world space (they're a place you fly through), not on the dome.
  const cloudGeo = new THREE.PlaneGeometry(1, 1);
  cloudGeo.rotateX(-Math.PI / 2);
  const clouds = [];
  function cloudLayer(i) {
    if (clouds[i]) return clouds[i];
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uCover: { value: 0.3 }, uBelow: { value: 1 }, uSeed: { value: i * 37.3 }, uDrift: { value: new THREE.Vector2() },
      uLit: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.5, 0.52, 0.56) },
    }]);
    const mesh = new THREE.Mesh(cloudGeo, new THREE.ShaderMaterial({
      uniforms: u, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, fog: true,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    mesh.scale.set(140000, 1, 140000);
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    clouds[i] = mesh;
    return mesh;
  }

  const _m = new Array(9);
  const _mat4 = new THREE.Matrix4();
  const _moon = { x: 0, y: 0, z: 0 };
  const _lin = new THREE.Color();
  const state = { nightness: 0, moonIllumination: 0, moonElevationDeg: 0, limitingMag: 0, stars: 0 };
  let layers = [];
  let refY = 0;

  // Sky colours and positions for a moment. Cheap: call when the sun moves (≤ 1 Hz).
  // `look` is skyForSun(); `sunDir` a unit vector; `date` the sky's moment.
  function setSky({ look, sunDir, sunElevationDeg, date, latDeg, lonDeg, overcast, overcastColor }) {
    skyU.uZenith.value.setHex(look.zenith);
    skyU.uHorizon.value.setHex(look.horizon);
    skyU.uGlow.value.setHex(look.glow);
    skyU.uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z);
    // The disc/halo take the direct-sun colour, held bright through the horizon.
    skyU.uSunCol.value.setHex(look.sun || 0xff8a3c);
    skyU.uSunVis.value = Math.min(1, Math.max(0, (sunElevationDeg + 1.5) / 3));
    skyU.uGlowK.value = Math.max(0, 1 - Math.abs(sunElevationDeg - 0.5) / 12) * 0.9;
    skyU.uOvercast.value = overcast;
    skyU.uOvercastCol.value.copy(overcastColor);

    equatorialToSim(latDeg, lstRad(date, lonDeg), _m);
    _mat4.set(_m[0], _m[1], _m[2], 0, _m[3], _m[4], _m[5], 0, _m[6], _m[7], _m[8], 0, 0, 0, 0, 1);
    celestial.matrix.copy(_mat4);

    moonDirection(date, latDeg, lonDeg, _moon);
    skyU.uMoonDir.value.set(_moon.x, _moon.y, _moon.z);
    state.moonIllumination = moonIllumination(_moon, sunDir);
    state.moonElevationDeg = _moon.elevationDeg;
    state.nightness = nightness(sunElevationDeg);
    const moonUp = Math.max(0, Math.min(1, (_moon.elevationDeg + 1) / 6));
    skyU.uMoonLit.value = state.moonIllumination * moonUp * state.nightness;
    moonU.uAlpha.value = moonUp * (0.35 + 0.65 * state.nightness) * (1 - overcast);
    // Naked-eye limit: twilight hides everything; a city sky (DFW) tops out near mag 4.5,
    // a bright Moon washes out the faint ones, an overcast hides them all.
    state.limitingMag = -1.5 + 6 * state.nightness - 1.2 * skyU.uMoonLit.value - 8 * overcast;

    for (const [i, l] of layers.entries()) {
      const m = cloudLayer(i);
      const u = m.material.uniforms;
      // Sunlit tops and grey bellies, both following the light of the moment.
      _lin.setHex(look.ambient).multiplyScalar(look.ambientIntensity);
      u.uLit.value.setHex(look.sun || look.ambient).multiplyScalar(look.sunIntensity * 0.55).add(_lin);
      u.uShade.value.copy(_lin).multiplyScalar(0.55);
      if (state.nightness > 0.5) { u.uLit.value.multiplyScalar(0.6); u.uShade.value.multiplyScalar(0.5); }
      u.uCover.value = l.coverage;
    }
  }

  function setClouds(next, groundRefY) {
    layers = next || [];
    refY = groundRefY;
    clouds.forEach((m, i) => { m.visible = i < layers.length; });
    layers.forEach((l, i) => { cloudLayer(i).visible = true; });
  }

  // Per frame: follow the camera, twinkle, drift the clouds with the wind.
  function update(camera, { time, pixelRatio, wind, altitudeM }) {
    group.position.copy(camera.position);
    group.updateMatrix();
    celestial.matrix.setPosition(0, 0, 0);
    starU.uTime.value = time;
    starU.uPx.value = pixelRatio;
    // Thinner air overhead: the zenith deepens towards space as you climb.
    const space = Math.min(1, Math.max(0, (altitudeM - 3000) / 15000));
    skyU.uSpace.value = space;
    starU.uLimit.value = state.limitingMag + space * 2.5;
    state.stars = stars ? 1 : 0;
    // Not even Sirius (V −1.46) shows in a daylight sky: skip drawing 4,000 points.
    if (stars) stars.visible = starU.uLimit.value > -1.4;
    const md = skyU.uMoonDir.value;
    moon.position.copy(md).multiplyScalar(R_MOON);
    moon.quaternion.copy(camera.quaternion);
    moonU.uRight.value.set(1, 0, 0).applyQuaternion(camera.quaternion);
    moonU.uUp.value.set(0, 1, 0).applyQuaternion(camera.quaternion);
    moon.visible = md.y > -0.02 && moonU.uAlpha.value > 0.01;
    for (const [i, l] of layers.entries()) {
      const m = clouds[i];
      m.position.set(camera.position.x, refY + l.baseFt * 0.3048, camera.position.z);
      const u = m.material.uniforms;
      u.uDrift.value.set(-wind.x * time, -wind.z * time);
      u.uBelow.value = camera.position.y < m.position.y ? 1 : 0;
    }
  }

  return { group, setSky, setClouds, update, state };
}
