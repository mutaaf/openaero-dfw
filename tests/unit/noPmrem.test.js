import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PMREMGenerator } from '../../src/noPmrem.js';

// vite.config.js points the renderer's WebGLEnvironments at src/noPmrem.js (0022: ~4 kB gz of boot,
// PMREMGenerator and the classes only it used). The renderer builds a PMREM only for an equirect or
// cube texture used as an envMap, scene.environment or a texture scene.background. This holds the
// sim to setting none of them; a feature that wants env maps drops the alias (and this card).
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

describe('noPmrem.js (the renderer\'s PMREMGenerator stand-in)', () => {
  it('only the renderer\'s environments import is aliased; it says how to undo it if ever reached', () => {
    const cfg = readFileSync('vite.config.js', 'utf8');
    expect(cfg).toContain("find: /^\\.\\.\\/\\.\\.\\/extras\\/PMREMGenerator\\.js$/");
    const importers = walk('node_modules/three/src').filter((f) => f.endsWith('.js'))
      .filter((f) => /from '\.\.\/\.\.\/extras\/PMREMGenerator\.js'/.test(readFileSync(f, 'utf8')));
    expect(importers.map((f) => f.replace(/\\/g, '/'))).toEqual(['node_modules/three/src/renderers/webgl/WebGLEnvironments.js']);
    expect(() => new PMREMGenerator()).toThrow(/noPmrem/);
  });

  it('no source sets an env map, scene.environment, a texture background or an equirect/cube mapping', () => {
    for (const f of walk('src').filter((x) => x.endsWith('.js') && !x.endsWith('noPmrem.js'))) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/\.envMap\s*=|envMap:|\.environment\s*=|PMREMGenerator|CubeTexture|(Equirectangular|Cube)(Reflection|Refraction)Mapping/);
      for (const m of s.matchAll(/\.background\s*=\s*([^;\n]+)/g)) expect(m[1], f).toMatch(/Color\(/);
    }
  });
});
