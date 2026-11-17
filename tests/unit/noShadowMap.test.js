import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PCFShadowMap } from '../../node_modules/three/src/constants.js';
import { WebGLShadowMap } from '../../src/noShadowMap.js';

// vite.config.js points WebGLRenderer's WebGLShadowMap at src/noShadowMap.js (0191: ~2.6 kB gz of boot).
// The renderer calls its render() every frame and reads enabled/autoUpdate/needsUpdate/type; the sim
// turns no shadow map on. This holds src/ to that; a feature that wants shadows drops the alias (and this card).
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const REAL = 'node_modules/three/src/renderers/webgl/WebGLShadowMap.js';

describe('noShadowMap.js (the renderer\'s WebGLShadowMap stand-in, 0191)', () => {
  it('only WebGLRenderer\'s import is aliased', () => {
    expect(readFileSync('vite.config.js', 'utf8')).toContain("find: /^\\.\\/webgl\\/WebGLShadowMap\\.js$/");
    const importers = walk('node_modules/three/src').filter((f) => f.endsWith('.js'))
      .filter((f) => /from '\.\/webgl\/WebGLShadowMap\.js'/.test(readFileSync(f, 'utf8')));
    expect(importers.map((f) => f.replace(/\\/g, '/'))).toEqual(['node_modules/three/src/renderers/WebGLRenderer.js']);
  });

  it('has three\'s public fields, off, and a render() that does nothing until someone turns it on', () => {
    const real = [...readFileSync(REAL, 'utf8').matchAll(/^\tthis\.(\w+)\s*=/gm)].map((m) => m[1]);
    const sm = new WebGLShadowMap();
    expect(Object.keys(sm).sort()).toEqual([...new Set(real)].sort());
    expect(sm).toMatchObject({ enabled: false, autoUpdate: true, needsUpdate: false, type: PCFShadowMap });
    expect(() => sm.render([{}], {}, {})).not.toThrow();
    sm.enabled = true;
    expect(() => sm.render([{}], {}, {})).toThrow(/noShadowMap/);
  });

  it('no source sets shadowMap.enabled at all (the stand-in throws whenever it is on) or makes anything cast or receive one', () => {
    for (const f of walk('src').filter((x) => x.endsWith('.js') && !x.endsWith('noShadowMap.js'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/shadowMap\.enabled\s*=(?!=)|castShadow|receiveShadow/);
    }
  });
});
