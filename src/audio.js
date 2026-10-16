// Web Audio synthesis: engine tone, wind rush, stall horn; spoken GPWS callouts
// (speechSynthesis, on-device, no network) with chirps as the fallback.
// createAudio(sim) binds to the shared sim state; nothing starts until init() runs
// from a user gesture (browser autoplay policy).
import { gpwsCalloutIndex, GPWS_ALT_THRESHOLDS, isStallWarning, isGpwsWarning, calloutWord } from './aero.js';

export function createAudio(sim, onStateChange) {
  let audioCtx = null;
  let engineOsc = null, engineFilter = null, engineGain = null;
  let windNoiseNode = null, windFilter = null, windGain = null;
  let stallOsc = null, stallGain = null;

  function init() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();

      // Engine jet turbine / propeller synthesis
      engineOsc = audioCtx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.setValueAtTime(80, audioCtx.currentTime);
      engineFilter = audioCtx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.setValueAtTime(450, audioCtx.currentTime);
      engineGain = audioCtx.createGain();
      engineGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOsc.start();

      // Wind rush noise synthesis
      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      windNoiseNode = audioCtx.createBufferSource();
      windNoiseNode.buffer = noiseBuffer;
      windNoiseNode.loop = true;
      windFilter = audioCtx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.setValueAtTime(320, audioCtx.currentTime);
      windGain = audioCtx.createGain();
      windGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
      windNoiseNode.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(audioCtx.destination);
      windNoiseNode.start();

      // Stall warning alarm
      stallOsc = audioCtx.createOscillator();
      stallOsc.type = 'square';
      stallOsc.frequency.setValueAtTime(750, audioCtx.currentTime);
      stallGain = audioCtx.createGain();
      stallGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
      stallOsc.connect(stallGain);
      stallGain.connect(audioCtx.destination);
      stallOsc.start();

      sim.audioEnabled = true;
      onStateChange();
    } catch (e) {
      console.warn('Web Audio error:', e);
    }
  }

  function chirp(freq, duration) {
    if (!audioCtx || !sim.audioEnabled) return;
    try {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) { /* audio is best-effort */ }
  }

  const synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
  // Speak a callout. Altitude callouts interrupt a stale one (they must be on time);
  // follow-ups like "retard" queue behind.
  function say(text, { interrupt = true } = {}) {
    if (!audioCtx || !sim.audioEnabled) return false;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
    try {
      if (interrupt && synth.cancel) synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.35;
      u.pitch = 0.75;
      u.volume = 0.9;
      synth.speak(u);
      return true;
    } catch (e) { return false; }
  }

  function checkGpwsCallouts() {
    if (sim.onGround || sim.vel.y >= 0) return;
    const i = gpwsCalloutIndex(sim.aglFt, sim.lastCalloutIdx);
    if (i >= 0 && i < GPWS_ALT_THRESHOLDS.length) {
      sim.lastCalloutIdx = i;
      if (!say(calloutWord(i))) chirp(587.33, 0.18);
      if (GPWS_ALT_THRESHOLDS[i] === 20 && sim.throttle > 0.05) say('retard', { interrupt: false });
    }
  }

  let lastPullUp = -10;
  function checkGpwsWarning() {
    if (!isGpwsWarning(sim.aglFt, sim.vsiFpm, sim.onGround)) return;
    const now = audioCtx.currentTime;
    if (now - lastPullUp < 3) return;
    lastPullUp = now;
    if (!say(sim.aglFt < 250 ? 'pull up' : 'sink rate')) chirp(880, 0.4);
  }

  function update() {
    if (!audioCtx || !sim.audioEnabled || sim.paused) return;
    const now = audioCtx.currentTime;
    const basePitch = sim.aircraftKey === 'c172' ? 65 : 120;
    engineOsc.frequency.setTargetAtTime(basePitch + sim.throttle * 240, now, 0.1);
    engineGain.gain.setTargetAtTime(0.04 + sim.throttle * 0.08, now, 0.1);
    const speedRatio = Math.min(sim.iasKts / 260, 1.6);
    windGain.gain.setTargetAtTime(0.015 + speedRatio * 0.065, now, 0.1);
    const stalling = isStallWarning(sim.iasKts, sim.spec.stallCleanKts, sim.onGround);
    stallGain.gain.setTargetAtTime(stalling ? 0.07 : 0.0, now, 0.05);
    checkGpwsCallouts();
    checkGpwsWarning();
  }

  // Hard-mute every voice (used when the player switches sound off).
  function mute() {
    if (engineGain) engineGain.gain.value = 0;
    if (windGain) windGain.gain.value = 0;
    if (stallGain) stallGain.gain.value = 0;
  }

  return { init, update, mute, get started() { return audioCtx !== null; } };
}
