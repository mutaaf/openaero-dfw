// A stand-in for three's WebGLShadowMap in WebGLRenderer only (vite.config.js aliases that one import
// here; 0191 paid its boot bytes with it, as 0174's noXr.js and 0022's noPmrem.js did). The renderer
// builds one and calls its render() every frame, which returns at once while `enabled` is false; the
// sim never turns shadow maps on (no light casts, no mesh casts or receives: the aircraft's ground
// shadow is a decal, 0190), so the real class and the depth/distance materials and cube render target
// only it used were boot bytes that never ran. The same public fields as three's (enabled, autoUpdate,
// needsUpdate, type, render); PCFShadowMap is three's constant 1 (tests/unit/noShadowMap.test.js).
// Turning shadows on (here or in a library) throws in the render loop: drop the alias to want them.
export function WebGLShadowMap() {
  this.enabled = false;
  this.autoUpdate = true;
  this.needsUpdate = false;
  this.type = 1; // PCFShadowMap
  this.render = function () {
    if (this.enabled) throw new Error('[openaero] shadow maps are off: drop the noShadowMap.js alias in vite.config.js');
  };
}
