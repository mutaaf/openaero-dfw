// Rapier's wasm-bindgen glue without its `import * as wasm from "./rapier_wasm3d_bg.wasm"` (0043).
// That line is the WebAssembly/ES-module integration, which neither Vite nor Node loads, so
// vite.config.js points Rapier's own `./rapier_wasm3d` import here: the same bindings, and the
// .wasm is instantiated by physicsWorld.js initRapier (fetched in the browser, read from disk in tests).
export * from '@dimforge/rapier3d/rapier_wasm3d_bg.js';
