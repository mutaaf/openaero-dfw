// Stall buffet (ticket 0079): as the wing nears its stall angle the airflow over it starts to
// separate and shakes the airframe. Pilots are taught to recognise that buffet as the stall coming,
// with or before the warning horn (FAA AC 120-109A; SKYbrary "Stall Warning Systems": on some
// aircraft buffet alone is the warning). Here: a small high-frequency camera shake and a low rumble,
// both scaled by buffetIntensity, from 85% of the stall angle (for the flaps set) to 1 at the stall.
// A cue for the player only: it never feeds back into the physics.
//
// Rides in runwayLights.js's lazy chunk (as landingLight.js and touchdownFeel.js do). main.js calls
// createBuffet once when the chunk loads; after that nothing in boot calls it per frame: the shake
// is applied in scene.onBeforeRender (after the camera's pose is set, before the view matrix is
// used) and taken back off in scene.onAfterRender, so the HUD's projections and the next frame's
// camera never see it. No allocation per frame.
//
// Off (no shake, gain to 0): on the ground, paused (menus, the results card), behind the start
// screen, in the replay. prefers-reduced-motion: no shake; the rumble stays and the screen's edge
// glows amber with the intensity instead (the HUD cue). Sound off: silent.
import { stallAoaDeg } from './aero.js';

export const BUFFET_ONSET = 0.85; // fraction of the stall angle where the shake starts
export const SHAKE_DEG = 0.35; // peak camera pitch at intensity 1 (~5 px on a 390x844 phone)
const RUMBLE_GAIN = 1; // a 300 Hz low-pass keeps ~2% of white noise's power: ~0.08 RMS at 1

// Pure: 0 up to BUFFET_ONSET of the stall angle, rising smoothly (smoothstep: strictly increasing
// in between) to 1 at the stall angle, and 1 past it (a stalled wing keeps buffeting).
export function buffetIntensity(aoaDeg, stallAoa) {
  if (!(stallAoa > 0) || !(aoaDeg > 0)) return 0;
  const t = Math.min(1, Math.max(0, (aoaDeg / stallAoa - BUFFET_ONSET) / (1 - BUFFET_ONSET)));
  return t * t * (3 - 2 * t);
}

// Pure: the camera's shake at wall time t (s) for intensity k: pitch and yaw in radians.
// Two incommensurate frequencies per axis (11 and 17.3 Hz pitch, 7.7 and 13.1 Hz yaw), so it reads
// as a buffet, not a vibration; yaw at 40% of the pitch.
const DEG = Math.PI / 180;
export function shakeAt(t, k) {
  const a = SHAKE_DEG * DEG * k;
  return {
    pitch: a * (0.6 * Math.sin(2 * Math.PI * 11 * t) + 0.4 * Math.sin(2 * Math.PI * 17.3 * t + 1)),
    yaw: 0.4 * a * (0.6 * Math.sin(2 * Math.PI * 7.7 * t + 2) + 0.4 * Math.sin(2 * Math.PI * 13.1 * t)),
  };
}

// scene: the THREE.Scene main.js renders; sim: the shared state (read only: aoaDeg, spec,
// flapsIndex, onGround, paused, audioEnabled); audio: audio.js (its ctx once sound has started).
export function createBuffet(scene, sim, audio, reducedMotion = false, now = () => performance.now() / 1000) {
  const state = { intensity: 0, shakeDeg: 0, peakShakeDeg: 0, gain: 0, cue: 0 };
  const startScreen = document.getElementById('onboardingModal');
  const body = document.body;
  let saved = null, savedW = 0, savedX = 0, savedY = 0, savedZ = 0, shaken = false;
  let rumble = null, cueEl = null, cueStep = -1;

  function active() {
    return !sim.paused && !sim.onGround && !body.classList.contains('replaying')
      && !!startScreen && startScreen.classList.contains('hidden');
  }

  function setRumble(k) {
    const ctx = audio?.ctx;
    const target = ctx && ctx.state === 'running' && sim.audioEnabled ? RUMBLE_GAIN * k : 0;
    if (!rumble) {
      if (!(target > 0)) { state.gain = 0; return; }
      try {
        // Two seconds of looped noise, low-passed at 300 Hz (phone speakers keep its top octave),
        // its level wobbling at 9 Hz like a buffet. Built once, the first time the wing buffets.
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 300;
        const mod = ctx.createGain();
        mod.gain.value = 0.65;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 9;
        const depth = ctx.createGain();
        depth.gain.value = 0.35;
        lfo.connect(depth).connect(mod.gain);
        const out = ctx.createGain();
        out.gain.value = 0;
        src.connect(lp).connect(mod).connect(out).connect(ctx.destination);
        src.start();
        lfo.start();
        rumble = { ctx, out, last: 0 };
      } catch { return; } // audio is best-effort
    }
    // Only when it moves: one automation event per change, not one per frame.
    if (Math.abs(target - rumble.last) > 0.01 || (target === 0 && rumble.last !== 0)) {
      rumble.out.gain.setTargetAtTime(target, rumble.ctx.currentTime, 0.05);
      rumble.last = target;
    }
    state.gain = rumble.last;
  }

  // Reduced motion's cue: the screen's edge glows amber, its opacity the intensity (in 10% steps,
  // so the style is written only when it changes). Pointer-events none, under the menus.
  function setCue(k) {
    const step = Math.round(k * 10);
    if (step === cueStep) return;
    cueStep = step;
    if (!cueEl) {
      cueEl = document.createElement('div');
      cueEl.id = 'buffetCue';
      cueEl.setAttribute('aria-hidden', 'true');
      cueEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20;opacity:0;'
        + 'box-shadow:inset 0 0 0 6px rgba(245,158,11,.9),inset 0 0 36px 6px rgba(245,158,11,.55)';
      body.appendChild(cueEl);
    }
    cueEl.style.opacity = String(step / 10);
    state.cue = step / 10;
  }

  const before = scene.onBeforeRender, after = scene.onAfterRender;
  scene.onBeforeRender = function (renderer, sc, camera, target) {
    before.call(this, renderer, sc, camera, target);
    const on = active();
    const k = on ? buffetIntensity(sim.aoaDeg, stallAoaDeg(sim.spec, sim.flapsIndex)) : 0;
    state.intensity = k;
    setRumble(k);
    if (reducedMotion) setCue(k);
    state.shakeDeg = 0;
    if (!(k > 0) || reducedMotion) return;
    const s = shakeAt(now(), k);
    const q = camera.quaternion;
    savedX = q.x; savedY = q.y; savedZ = q.z; savedW = q.w; saved = camera; shaken = true;
    camera.rotateX(s.pitch);
    camera.rotateY(s.yaw);
    camera.updateMatrixWorld();
    state.shakeDeg = Math.hypot(s.pitch, s.yaw) / DEG;
    state.peakShakeDeg = Math.max(state.peakShakeDeg, state.shakeDeg);
  };
  scene.onAfterRender = function (renderer, sc, camera) {
    after.call(this, renderer, sc, camera);
    if (!shaken) return;
    shaken = false;
    saved.quaternion.set(savedX, savedY, savedZ, savedW);
    saved.updateMatrixWorld();
  };

  const api = { debug: () => ({ ...state }), resetPeak: () => { state.peakShakeDeg = 0; } };
  if (globalThis.location && new URLSearchParams(location.search).has('debug')) window.openaeroBuffet = api; // e2e
  return api;
}
