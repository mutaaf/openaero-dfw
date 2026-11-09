// Stall buffet (ticket 0079): as the wing nears its stall angle the airflow over it starts to
// separate and shakes the airframe. Pilots are taught to recognise that buffet as the stall coming,
// with or before the warning horn (FAA AC 120-109A; SKYbrary "Stall Warning Systems": on some
// aircraft buffet alone is the warning). Here: a small high-frequency camera shake and a low rumble,
// both scaled by buffetIntensity, from 85% of the stall angle (for the flaps set) to 1 at the stall.
// A cue for the player only: it never feeds back into the physics.
//
// Rides in runwayLights.js's lazy chunk (as landingLight.js and touchdownFeel.js do), which creates it
// when the touchdown feel's group joins main.js's scene: boot pays nothing, and nothing calls it per frame: the shake
// is applied in scene.onBeforeRender (after the camera's pose is set, before the view matrix is
// used) and taken back off in scene.onAfterRender, so the HUD's projections and the next frame's
// camera never see it. No allocation per frame.
//
// Off (no shake, gain to 0): on the ground, paused (menus, the results card), behind the start
// screen, in the replay. The shake only in the views riding on the airframe (Cockpit 3D, Wing Tip):
// a tower or a spotter's camera doesn't feel the wing. The AoA is smoothed (~0.15 s) so a gust's
// spike doesn't flicker it. prefers-reduced-motion: no shake; the rumble stays and the screen's edge
// glows amber with the intensity instead (the HUD cue). Sound off: silent. The rumble's noise is
// built in idle time once sound has started (not on the first buffeting frame), and its nodes are
// stopped 2 s after the buffet ends (none left running for the session).
import { stallAoaDeg, stallSpeedKts } from './aero.js';

export const BUFFET_ONSET = 0.85; // fraction of the stall angle where the shake starts
export const SHAKE_DEG = 0.35; // peak camera pitch at intensity 1 (~5 px on a 390x844 phone)
const RUMBLE_GAIN = 1; // a 300 Hz low-pass keeps ~2% of white noise's power: ~0.08 RMS at 1

// Pure: 0 up to BUFFET_ONSET of the stall angle, rising smoothly (smoothstep: strictly increasing
// in between) to 1 at the stall angle, and 1 past it (a stalled wing keeps buffeting). On |α|, as
// aero.js liftCoefficient stalls: a pushover past the negative stall buffets too.
export function buffetIntensity(aoaDeg, stallAoa) {
  const r = Math.abs(aoaDeg) / stallAoa;
  if (!(stallAoa > 0) || !(r > BUFFET_ONSET)) return 0;
  const t = Math.min(1, (r - BUFFET_ONSET) / (1 - BUFFET_ONSET));
  return t * t * (3 - 2 * t);
}

// Pure: the buffet the game shows for a body of airframe `spec` (sim, or a flight card's body) at AoA `aoaDeg` (the
// smoothed one in the game). The stall angle for where the flaps are (body.flapPos, in transit too,
// as the lift curve uses), and the shake's strength by the dynamic pressure against the 1 g stall's
// at that flap setting, (IAS / Vs)², capped at 1: an accelerated stall shakes fully, a near-zero
// airspeed (a tail slide, the top of a hammerhead) hardly at all.
export function wingBuffet(spec, body, aoaDeg = body.aoaDeg) {
  const flaps = body.flapPos ?? body.flapsIndex;
  const k = buffetIntensity(aoaDeg, stallAoaDeg(spec, flaps));
  if (!(k > 0)) return 0;
  const q = (body.iasKts ?? 0) / stallSpeedKts(spec, flaps);
  return k * Math.min(1, q * q);
}

// Pure: the camera's shake at wall time t (s) for intensity k: pitch and yaw in radians, written into
// `out` (no allocation per frame). Two incommensurate frequencies per axis (11 and 17.3 Hz pitch,
// 7.7 and 13.1 Hz yaw), so it reads as a buffet, not a vibration; yaw at 40% of the pitch.
const DEG = Math.PI / 180;
export function shakeAt(t, k, out = { pitch: 0, yaw: 0 }) {
  const a = SHAKE_DEG * DEG * k;
  out.pitch = a * (0.6 * Math.sin(2 * Math.PI * 11 * t) + 0.4 * Math.sin(2 * Math.PI * 17.3 * t + 1));
  out.yaw = 0.4 * a * (0.6 * Math.sin(2 * Math.PI * 7.7 * t + 2) + 0.4 * Math.sin(2 * Math.PI * 13.1 * t));
  return out;
}

export const SHAKE_VIEWS = [0, 3]; // main.js sim.cameraNames: Cockpit 3D, Wing Tip
const AOA_TAU_S = 0.15; // the AoA's smoothing
const RUMBLE_IDLE_S = 2; // the rumble's nodes stop this long after the buffet ends

// scene: the THREE.Scene main.js renders; sim: the shared state (read only: aoaDeg, iasKts, spec,
// flapPos, flapsIndex, onGround, paused, audioEnabled, cameraMode); audio: audio.js (its ctx once sound has started).
export function createBuffet(scene, sim, audio, reducedMotion = false, now = () => performance.now() / 1000) {
  const state = { intensity: 0, shakeDeg: 0, peakShakeDeg: 0, gain: 0, cue: 0 };
  const startScreen = document.getElementById('onboardingModal');
  const body = document.body;
  let saved = null, savedW = 0, savedX = 0, savedY = 0, savedZ = 0, shaken = false;
  let rumble = null, noise = null, noiseQueued = false, quietSince = 0, cueEl = null, cueStep = -1;
  let aoaF = null, lastT = 0;
  const shake = { pitch: 0, yaw: 0 };

  // Two seconds of noise for the rumble's loop, made off the render path once sound has started.
  function queueNoise(ctx) {
    noiseQueued = true;
    const make = () => {
      try {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noise = buf;
      } catch { /* audio is best-effort */ }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(make, { timeout: 2000 }); else setTimeout(make, 0);
  }

  function active() {
    return !sim.paused && !sim.onGround && !body.classList.contains('replaying')
      && !!startScreen && startScreen.classList.contains('hidden');
  }

  function setRumble(k, t) {
    const ctx = audio?.ctx;
    const running = !!ctx && ctx.state === 'running';
    if (running && !noise && !noiseQueued) queueNoise(ctx);
    const target = running && sim.audioEnabled ? RUMBLE_GAIN * k : 0;
    if (target > 0) quietSince = t;
    if (!rumble) {
      if (!(target > 0) || !noise) { state.gain = 0; return; }
      try {
        // The noise looped, low-passed at 300 Hz (phone speakers keep its top octave), its level
        // wobbling at 9 Hz like a buffet.
        const src = ctx.createBufferSource();
        src.buffer = noise;
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
        rumble = { ctx, src, lfo, out, last: 0 };
      } catch { return; } // audio is best-effort
    }
    // Only when it moves: one automation event per change, not one per frame.
    if (Math.abs(target - rumble.last) > 0.03 || (target === 0 && rumble.last !== 0)) {
      rumble.out.gain.setTargetAtTime(target, rumble.ctx.currentTime, 0.05);
      rumble.last = target;
    }
    state.gain = rumble.last;
    // Quiet for a while: stop the nodes (built again, cheaply, from the kept noise next time).
    if (target === 0 && t - quietSince > RUMBLE_IDLE_S) {
      try { rumble.src.stop(); rumble.lfo.stop(); rumble.out.disconnect(); } catch { /* already stopped */ }
      rumble = null;
    }
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
      cueEl.style.cssText = 'position:fixed;inset:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);pointer-events:none;z-index:15;opacity:0;'
        + 'box-shadow:inset 0 0 0 6px rgba(245,158,11,.9),inset 0 0 36px 6px rgba(245,158,11,.55)';
      body.appendChild(cueEl);
    }
    cueEl.style.opacity = String(step / 10);
    state.cue = step / 10;
  }

  const before = scene.onBeforeRender, after = scene.onAfterRender;
  scene.onBeforeRender = function (renderer, sc, camera, target) {
    before.call(this, renderer, sc, camera, target);
    const t = now();
    const on = active();
    // The AoA through a ~0.15 s low-pass on the wall clock (a gust's spike isn't the wing); restarts
    // from the raw AoA after a pause or the ground.
    const a = Number.isFinite(sim.aoaDeg) ? sim.aoaDeg : 0;
    aoaF = on && aoaF !== null ? aoaF + (a - aoaF) * Math.min(1, Math.max(0, t - lastT) / AOA_TAU_S) : (on ? a : null);
    lastT = t;
    const k = on ? wingBuffet(sim.spec, sim, aoaF) : 0;
    state.intensity = k;
    setRumble(k, t);
    if (reducedMotion) setCue(k);
    state.shakeDeg = 0;
    if (!(k > 0) || reducedMotion || !SHAKE_VIEWS.includes(sim.cameraMode)) return;
    const s = shakeAt(t, k, shake);
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
