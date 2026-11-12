// three's WebGLRenderer builds a WebXRManager (renderer.xr) for VR/AR headsets: ~4 kB gz of the boot
// chunk (the manager, its controllers, depth sensing). The sim never starts an XR session and nothing
// reads renderer.xr, so vite.config.js points WebGLRenderer's import at this stand-in (ticket 0174
// paid its boot cost with it). It answers what WebGLRenderer asks of it with XR off: `enabled` and
// `isPresenting` false (render(), setSize()), the session events (never fired), the animation loop,
// dispose(), and no blend mode (WebGLBackground; the real one's answer without a session). What
// WebGLRenderer asks only while presenting (getCamera, updateCamera, getDepthSensingMesh) is never
// reached. tests/unit/upset.test.js reads three's WebGL renderer sources for every `xr.` member they
// use, so a three upgrade that asks for more fails there. If a feature ever wants WebXR, drop the
// alias in vite.config.js.
import { EventDispatcher } from 'three/src/core/EventDispatcher.js';

export class WebXRManager extends EventDispatcher {
  constructor() {
    super();
    this.enabled = false;
    this.isPresenting = false;
    this.cameraAutoUpdate = true;
  }
  setAnimationLoop() {}
  dispose() {}
  hasDepthSensing() { return false; }
  getEnvironmentBlendMode() { return undefined; }
}
