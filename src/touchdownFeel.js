// Touchdown you can feel (ticket 0147): at each wheel contact main.js counts (the first touchdown and
// every re-contact after a bounce, the same moments the phone buzzes, haptics.js), a short
// synthesized tyre chirp and, from a firm landing up, a low thump, both louder the harder the sink;
// and a puff of tyre smoke at each main wheel that grows, drifts downwind and fades in under 1.5 s.
// Rides in runwayLights.js's lazy chunk (as landingLight.js does), so boot pays only the calls.
//
// Honesty: real touchdown smoke is the tyres spinning up from rest, so even a greaser smokes a
// little on an airliner. Here it is a game-feel cue scaled by the sink rate (the landing grade's
// bands: firm from 240 fpm as haptics.js's buzz, landing.js's crash past 600), not a tyre spin-up model. The sounds
// are synthesized (Web Audio, no samples, no network).
//
// The puffs animate on their own requestAnimationFrame while one lives (on the wall clock: they
// fade behind the results card, which pauses the sim), so main.js's render loop calls nothing.
// No allocation per frame or per touchdown for the puffs: POOL sprites, one shared texture built
// from a Uint8Array (no canvas), reused round-robin over repeated bounces. Each touchdown makes a
// few Web Audio nodes (a one-shot sound, as audio.js chirp does), never per frame.
// prefers-reduced-motion: no puffs, the sound unchanged. Sound off: silent, the puffs stay.
// Kid (gentle): a light chirp only, nothing else, at any sink (its landings are soft by design).
// A belly landing (gear not down and locked): a thump, no chirp, no tyre smoke.
import * as THREE from 'three';

export const POOL = 6; // three touchdowns' worth of the two mains' puffs
export const PUFF_LIFE_S = 1.4;
const CRASH_FPM = 600; // landing.js: past 600 fpm is a crash
const FIRM_FPM = 240; // firm: haptics.js's band (landing.js's rate score is 75 there, full to 120)

// Pure: what a touchdown at vsFpm (negative = sinking) sounds and looks like.
// chirp/thump: Web Audio gains (audio.js's callout chirp is 0.12); puffAlpha 0 = no puff;
// puffScale × the main gear's track is the puff's starting width in metres.
// belly: the gear not down and locked (landing.js grades it a crash): no tyres, so no chirp or tyre
// smoke, only the thump, at least the firm one.
export function touchdownFeel(vsFpm, gentle = false, belly = false) {
  const sink = Math.max(0, -vsFpm) || 0;
  const s = Math.min(1, sink / CRASH_FPM);
  if (belly) return { sink, chirp: 0, thump: 0.12 + 0.13 * s, puffAlpha: 0, puffScale: 0 };
  if (gentle) return { sink, chirp: 0.05, thump: 0, puffAlpha: 0, puffScale: 0 };
  return {
    sink,
    chirp: 0.04 + 0.08 * s, // a light chirp (100 fpm: 0.053) up to a sharp one at the crash line
    thump: sink < FIRM_FPM ? 0 : 0.12 + 0.13 * Math.min(1, (sink - FIRM_FPM) / (CRASH_FPM - FIRM_FPM)), // ≤ 0.25
    puffAlpha: sink < 100 ? 0 : 0.2 + 0.6 * s, // a faint wisp at 100 fpm, a thick puff at 600
    puffScale: 0.3 + 0.5 * s, // × the track: a 737's (5.7 m) 2.2 m wide at 100 fpm, 4.6 m at 600
  };
}

// The puff's sprite: a soft round blob, alpha falling off smoothly from the centre (32x32 RGBA).
function puffTexture() {
  const N = 32, data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const r = Math.hypot(i + 0.5 - N / 2, j + 0.5 - N / 2) / (N / 2);
      const a = r >= 1 ? 0 : (1 - r * r) ** 1.5;
      const k = (j * N + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = Math.round(255 * a);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Tyre chirp: a 90 ms burst of noise through a broad band-pass (Q 1.5) sweeping down from 2.8 to
// 1.2 kHz. That band keeps ~9% of white noise's power (bandwidth f0/Q · π/2 over the Nyquist), an
// RMS ~0.3 of the noise's 0.58, so the make-up gain is ×8: a 100 fpm chirp ~0.04 RMS, 600 fpm ~0.1,
// against the engine drone's ~0.08 and the callout chirp's 0.12.
// Thump: a sine falling 95 → 40 Hz over 0.3 s (the gear and the structure taking the load), with a
// 190 → 80 Hz overtone at half its gain, as phone speakers drop most of what's under ~150 Hz;
// a 5 ms attack, so it doesn't click. Its gain is capped at 0.25.
const noiseFor = new WeakMap();
export function playTouchdown(ctx, f) {
  const t = ctx.currentTime;
  let noise = noiseFor.get(ctx);
  if (!noise) {
    noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.15), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseFor.set(ctx, noise);
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.5;
  bp.frequency.setValueAtTime(2800, t);
  bp.frequency.exponentialRampToValueAtTime(1200, t + 0.09);
  const g = ctx.createGain();
  g.gain.setValueAtTime(f.chirp * 8, t); // make-up for the band-pass (see above)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  if (f.chirp > 0) {
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.1);
  }
  if (f.thump > 0) {
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(f.thump, t + 0.005);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    tg.connect(ctx.destination);
    for (const [hz, k] of [[95, 1], [190, 0.5]]) {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      og.gain.value = k;
      osc.frequency.setValueAtTime(hz, t);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.42, t + 0.3);
      osc.connect(og).connect(tg);
      osc.start(t);
      osc.stop(t + 0.32);
    }
  }
}

// sim: the shared state (read only: lastAirVsi, assist, spec, groundY, windVec, audioEnabled, paused);
// root(): the aircraft's Object3D (body frame: +X right, +Y up, nose −Z; the CG at its origin);
// audio: audio.js (its ctx once sound has started); now(): seconds of wall time, so a puff fades
// behind the results card, which pauses the sim right after the touchdown.
export function createTouchdownFeel(sim, root, audio, reducedMotion = false, now = () => performance.now() / 1000) {
  const group = new THREE.Group();
  group.name = 'touchdownFeel';
  const tex = puffTexture();
  const sprites = [];
  for (let i = 0; i < POOL; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xe8e8e8, transparent: true, depthWrite: false, opacity: 0, fog: true }));
    sp.visible = false;
    sp.renderOrder = 4.5; // after the landing light's pool (4), before skyDome.js's cloud layers (5)
    group.add(sp);
    sprites.push(sp);
  }
  const born = new Float64Array(POOL).fill(-1e9);
  const base = new Float32Array(POOL * 3);
  const size0 = new Float32Array(POOL);
  const alpha0 = new Float32Array(POOL);
  const drift = new Float32Array(POOL * 2); // m/s, the wind at the smoke's height when it was born
  const _v = new THREE.Vector3();
  let next = 0;
  const state = { touches: 0, last: null, puffs: 0, sounded: 0 };

  function touch() {
    // gear up or in transit = a belly landing (systems.js gearLocked, inlined: importing it from this
    // lazy chunk would grow boot's exports)
    const f = touchdownFeel(sim.lastAirVsi, sim.assist === 'kid', (sim.gearPos ?? (sim.gearDown ? 1 : 0)) < 1);
    state.touches++;
    state.last = f;
    const ctx = audio?.ctx;
    if (ctx && ctx.state === 'running' && sim.audioEnabled && !sim.paused) { // iOS: a suspended clock would play it late
      try { playTouchdown(ctx, f); state.sounded++; } catch { /* audio is best-effort */ }
    }
    const r = root();
    const g = sim.spec?.gear;
    if (reducedMotion || !f.puffAlpha || !r || !g) return;
    r.updateMatrixWorld();
    const t = now();
    for (const side of [-1, 1]) {
      _v.set(side * g.trackM / 2, -(sim.spec.gearHeight + g.strokeM), g.mainZ).applyMatrix4(r.matrixWorld); // the axle (gear.js)
      const i = next;
      next = (next + 1) % POOL;
      const w = g.trackM * f.puffScale;
      base[i * 3] = _v.x; base[i * 3 + 1] = sim.groundY; base[i * 3 + 2] = _v.z;
      size0[i] = w;
      alpha0[i] = f.puffAlpha;
      // sim.windVec is the log-law wind at the CG's height (main.js updateWind); at ~1 m it is ~0.76 of that
      // (weather.js surfaceWindFactor, z0 0.03 m: ~0.60 at 1 m over ~0.79 at a 737's CG), fixed at birth.
      drift[i * 2] = 0.76 * (sim.windVec?.x ?? 0);
      drift[i * 2 + 1] = 0.76 * (sim.windVec?.z ?? 0);
      born[i] = t;
      state.puffs++;
    }
    if (!running) frame(); // animates itself while a puff lives: no per-frame call from main.js
  }

  let running = false;
  function frame() {
    running = update() > 0 && typeof requestAnimationFrame === 'function';
    if (running) requestAnimationFrame(frame);
  }

  function update() {
    const t = now();
    let live = 0;
    for (let i = 0; i < POOL; i++) {
      const sp = sprites[i];
      const age = t - born[i];
      if (!(age >= 0 && age < PUFF_LIFE_S)) { sp.visible = false; continue; }
      const k = age / PUFF_LIFE_S;
      const w = size0[i] * (1 + 2.5 * k); // spreads to 3.5x its size as it thins
      // Drifts with the wind it was born in and rises a little.
      // Its centre half its width up, so the runway's depth never cuts the blob along a line.
      sp.position.set(base[i * 3] + drift[i * 2] * age, base[i * 3 + 1] + w * (0.5 + 0.4 * k), base[i * 3 + 2] + drift[i * 2 + 1] * age);
      sp.scale.set(w, w, 1);
      sp.material.opacity = alpha0[i] * (1 - k) * (1 - k);
      sp.visible = true;
      live++;
    }
    return live;
  }

  const visibleCount = () => sprites.reduce((n, s) => n + (s.visible && s.material.opacity > 0.01 ? 1 : 0), 0);
  const api = { group, touch, update, sprites, debug: () => ({ ...state, visible: visibleCount() }) };
  if (globalThis.location && new URLSearchParams(location.search).has('debug')) window.openaeroTouchdownFeel = api; // e2e
  return api;
}
