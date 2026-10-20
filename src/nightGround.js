// Night on the satellite imagery: the photo was taken in daylight, so after sunset it is
// graded to moonlight (darker, cooler, desaturated, never black) and the city's lights come
// on where the imagery shows pavement: grey, unsaturated, mid-bright pixels get scattered
// sodium and LED street lamps in world space (they stay put across detail levels) and,
// far away where a lamp is smaller than a pixel, their average glow. One shader patch on
// the ground's MeshBasicMaterials (terrainLod.js imagery, photoreal.js tiles).
import * as THREE from 'three';

export const nightUniforms = {
  uNight: { value: 0 },                          // 0 day → 1 lights fully on
  uGroundTint: { value: new THREE.Color(1, 1, 1) }, // the light on flat ground (tinted materials)
};

const VERT_PARS = 'varying vec3 vNightW;\n';
const VERT_MAIN = 'vNightW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n';

const FRAG_PARS = /* glsl */`
uniform float uNight;
uniform vec3 uGroundTint;
varying vec3 vNightW;
`;

const FRAG_MAIN = /* glsl */`
#ifdef NIGHT_TINT
  diffuseColor.rgb *= uGroundTint;
#endif
#if defined(USE_MAP) && defined(NIGHT_GROUND)
{
  vec3 tex = sampledDiffuseColor.rgb;
  float lum = dot(tex, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(tex.r, max(tex.g, tex.b)), mn = min(tex.r, min(tex.g, tex.b));
  float sat = (mx - mn) / (mx + 0.02);
  // Asphalt (roads, parking lots): dark-to-mid grey and unsaturated. That is where the
  // street lights stand. Bright roofs, fields, trees and water stay dark.
  float grey = 1.0 - smoothstep(0.1, 0.32, sat);
  float asphalt = smoothstep(0.025, 0.06, lum) * (1.0 - smoothstep(0.16, 0.3, lum)) * grey;
  float built = smoothstep(0.05, 0.2, lum) * grey;
#ifdef NIGHT_TINT
  // Google's 3D city: its photos are greyer than the satellite imagery and its walls are
  // grey too, so pools only on near-level surfaces (face normal from the derivatives), a
  // stricter grey, and a dimmer glow; otherwise whole districts turn gold.
  vec3 fn = normalize(cross(dFdx(vNightW), dFdy(vNightW)));
  asphalt *= smoothstep(0.8, 0.95, abs(fn.y)) * (1.0 - smoothstep(0.05, 0.16, sat));
  const float GAIN = 0.45;
#else
  const float GAIN = 1.0;
#endif
  // Moonlit grade: cooler and flatter than the daylight photo.
  float g = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(diffuseColor.rgb, g * vec3(0.78, 0.88, 1.18), 0.55 * uNight);
  // Street lights: one candidate per 20 m cell, jittered; each throws a warm pool on the
  // pavement around a small bright head. Far away, where a cell is under a pixel, their
  // average glow.
  vec2 cell = vNightW.xz / 20.0;
  vec2 id = floor(cell);
  float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
  vec2 off = (vec2(fract(h * 17.31), fract(h * 31.77)) - 0.5) * 0.7;
  float d = length(fract(cell) - 0.5 - off);
  float lit = step(0.45, h);
  float pool = lit * smoothstep(0.75, 0.0, d);
  float head = lit * smoothstep(0.09, 0.0, d);
  float near = 1.0 - smoothstep(0.25, 0.9, length(fwidth(cell)));
  vec3 colour = mix(vec3(1.0, 0.6, 0.24), vec3(0.95, 0.9, 0.8), step(0.75, fract(h * 7.7)));
  vec3 lamps = colour * (tex * pool * pool * 7.0 + head * 2.0);
  vec3 far = colour * (tex * 1.6 + 0.16);
  diffuseColor.rgb += mix(far, lamps, near) * asphalt * GAIN * uNight + colour * built * 0.04 * uNight;
}
#endif
`;

// The lights are compiled in only while they are on: by day the ground runs the plain
// imagery shader (software GL pays for a skipped branch on every pixel). Switching
// recompiles once, at sunset or sunrise or when the player picks another time of day.
let lightsOn = false;
const patched = new Set(); // WeakRefs: photoreal tiles come and go

// Sets how far the city lights are on (0..1); recompiles the ground when they switch.
export function setCityLights(k) {
  nightUniforms.uNight.value = k;
  const on = k > 0.001;
  if (on === lightsOn) return;
  lightsOn = on;
  for (const ref of patched) {
    const m = ref.deref();
    if (m) m.needsUpdate = true; else patched.delete(ref);
  }
}

// `tint`: multiply by the shared ground light (for materials whose colour isn't the tint).
export function patchNightGround(material, { tint = false } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniforms.uNight;
    shader.uniforms.uGroundTint = nightUniforms.uGroundTint;
    shader.vertexShader = VERT_PARS + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_MAIN}`);
    shader.fragmentShader = (tint ? '#define NIGHT_TINT\n' : '') + (lightsOn ? '#define NIGHT_GROUND\n' : '') + FRAG_PARS
      + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_MAIN}`);
  };
  material.customProgramCacheKey = () => `nightGround:${tint ? 'tint' : ''}:${lightsOn ? 'lit' : 'day'}`;
  const ref = new WeakRef(material);
  patched.add(ref);
  material.addEventListener('dispose', () => patched.delete(ref));
  return material;
}

// How far the city lights are on, from the sun's elevation: on at sunset, full by −6°.
export function cityLightsFor(sunElevationDeg) {
  const k = Math.min(1, Math.max(0, (2 - sunElevationDeg) / 8));
  return k * k * (3 - 2 * k);
}
