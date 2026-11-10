// iOS's silent switch (0169). Web Audio on iOS plays in an 'ambient' audio session by default, which
// the ringer switch mutes: the engine, the wind, the stall horn and the chirps go silent with nothing
// to say why. navigator.audioSession.type = 'playback' (W3C Audio Session,
// https://w3c.github.io/audio-session/) plays through the switch, as a media player does: Safari has
// the API from 16.4, and WebKit bug 237322 (comment 6) confirms the switch is bypassed from iOS 17.
// The spoken coach and callouts are speechSynthesis, not Web Audio: whether this reaches them is
// unverified until someone checks on an iPhone. 'auto' while the player has sound off (the game
// doesn't hold the phone's audio), 'ambient' while paused (the context is suspended, 0032; audio.js
// pause() calls it too, as a hidden tab draws no frame). Feature-detected: Chromium and Firefox have
// no navigator.audioSession, and nothing changes there.
// In engineSound.js's lazy chunk (re-exported there): audio.js calls it each frame once sound has
// started; it writes the type only when it changes.
export function audioSession(sim, nav = globalThis.navigator) {
  const s = nav?.audioSession;
  if (!s) return;
  const t = sim.paused ? 'ambient' : sim.audioEnabled ? 'playback' : 'auto';
  if (s.type !== t) try { s.type = t; } catch { /* best-effort, like the rest of the audio */ }
}
