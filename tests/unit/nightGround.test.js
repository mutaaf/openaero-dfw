import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { patchNightGround, setCityLights, cityLightsFor, nightUniforms } from '../../src/nightGround.js';

// Compile the patched shader the way three would and return its fragment source.
function fragmentFor(material) {
  const shader = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <color_fragment>' };
  material.onBeforeCompile(shader);
  return shader.fragmentShader;
}

describe('night ground (ticket 0055)', () => {
  it('compiles the street lights in only while they are on, recompiling once per switch', () => {
    setCityLights(0);
    const m = patchNightGround(new THREE.MeshBasicMaterial());
    expect(fragmentFor(m)).not.toContain('#define NIGHT_GROUND');
    const dayKey = m.customProgramCacheKey();
    const v0 = m.version;

    setCityLights(1);
    expect(m.version).toBe(v0 + 1);
    expect(m.customProgramCacheKey()).not.toBe(dayKey);
    expect(fragmentFor(m)).toContain('#define NIGHT_GROUND');

    setCityLights(0.5); // still on: dimming is a uniform, not a recompile
    expect(m.version).toBe(v0 + 1);
    expect(nightUniforms.uNight.value).toBe(0.5);

    setCityLights(0);
    expect(m.version).toBe(v0 + 2);
    expect(m.customProgramCacheKey()).toBe(dayKey);
  });

  it('stops tracking a material once it is disposed', () => {
    setCityLights(0);
    const m = patchNightGround(new THREE.MeshBasicMaterial());
    const v0 = m.version;
    m.dispose();
    setCityLights(1);
    expect(m.version).toBe(v0);
    setCityLights(0);
  });

  it('turns the city on at sunset and full by −6°', () => {
    expect(cityLightsFor(10)).toBe(0);
    expect(cityLightsFor(-6)).toBe(1);
  });
});
