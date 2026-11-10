// iOS's silent switch (0169). Web Audio on iOS plays in an 'ambient' audio session by default, which
// the ringer switch mutes: the coach, the GPWS callouts, the engine and the stall horn all go silent
// with nothing to say why. navigator.audioSession.type = 'playback' (W3C Audio Session,
// https://w3c.github.io/audio-session/; Safari 16.4+, WebKit bug 237322) plays through the switch,
// as a media player does. 'auto' while the player has sound off (the game doesn't hold the phone's
// audio), 'ambient' while paused (the context is suspended, 0032). Feature-detected: Chromium and
// Firefox have no navigator.audioSession, and nothing changes there.
// In engineSound.js's lazy chunk (re-exported there): audio.js calls it each frame once sound has
// started; it writes the type only when it changes.
export function audioSession(sim, nav = globalThis.navigator) {
  const s = nav?.audioSession;
  if (!s) return;
  const t = sim.paused ? 'ambient' : sim.audioEnabled ? 'playback' : 'auto';
  if (s.type !== t) try { s.type = t; } catch { /* best-effort, like the rest of the audio */ }
}
