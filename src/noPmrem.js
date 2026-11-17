// A stand-in for three's PMREMGenerator in the renderer's WebGLEnvironments only (vite.config.js aliases
// that one import here). The renderer builds a PMREM only for an equirect or cube texture used as an
// envMap, scene.environment or scene.background; the sim sets none (a Color background, unlit
// imagery, glTF without env maps), so ~4 kB gz of boot (it and the classes only it used) never ran (0022 paid
// its boot bytes with it). Libraries count too: a lazy dependency or glTF extension that sets an env map or
// scene.environment would throw here in the render loop (tests/unit/noPmrem.test.js scans only src/).
// three's own `PMREMGenerator` export (Three.js) is the real class. Want env maps: drop the alias.
export class PMREMGenerator {
  constructor() { throw new Error('[openaero] environment maps are off: drop the noPmrem.js alias in vite.config.js'); }
}
