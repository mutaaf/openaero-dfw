// The ground roll's sound (0149): a tyre rumble that rises with ground speed while the wheels
// are on the ground, and a short squeal when the player puts the brakes on above 40 kt.
// Rides in engineSound.js's lazy chunk (re-exported there, as audioSession.js), so boot pays
// only audio.js's two calls. Synthesized (Web Audio, no samples, no network); a game-feel cue
// tuned by ear, not a tyre acoustics model. tests/unit/rollSound.test.js.
//
// The rumble is low-passed noise (a 2 s loop, as the wind's) whose cut-off opens with speed
// from 250 Hz (a phone speaker plays little under ~250 Hz: 0148's lesson); it reaches full gain
// at 120 kt GS, or 60 kt on a light piston aircraft (small tyres, the cabin close to the gear).
// The squeal is a 0.4 s triangle tone gliding 2.1 → 1.7 kHz, peak 0.08-0.12 (~0.05-0.07 RMS,
// the touchdown chirp's level, 0147): band-passed noise at that gain was ~18 dB under the
// engine (the first-timer panel). It follows the player's brakes (sim.brakesOn: the pedals,
// B, the BRAKES button), not the autobrake; once per application, at most every 1.5 s (a
// tapped toggle), and not for brakes already set when the wheels touch. None on Kid (its
// landings are soft by design, as touchdownFeel.js's chirp).

const SQUEAL_KTS = 40;
const SQUEAL_GAP_S = 1.5;

// Pure: the rumble for this frame into out ({ gain, filterHz }), returned (no allocation per
// frame, as engineSound.js engineVoice). gsKts: ground speed (kt); in the air or stopped, silent.
// light: a light piston aircraft, full rumble from 60 kt.
export function rumbleLevel(onGround, gsKts, light = false, out = {}) {
  const gs = onGround && gsKts > 0 ? Math.min(gsKts, 150) : 0;
  out.gain = 0.12 * Math.min(1, gs / (light ? 60 : 120));
  out.filterHz = 250 + 5 * gs;
  return out;
}

// Pure but for st ({ held, at }): the squeal's peak gain this frame, 0 for none. t: seconds.
export function brakeSqueal(st, sim, t) {
  if (!sim.brakesOn) { st.held = false; return 0; }
  if (!sim.onGround) { st.held = true; return 0; } // set before the touchdown: no squeal on contact
  if (st.held || !(sim.gsKts > SQUEAL_KTS) || sim.assist === 'kid' || t - (st.at ?? -1e9) < SQUEAL_GAP_S) return 0;
  st.held = true;
  st.at = t;
  return 0.08 + 0.04 * Math.min(1, (sim.gsKts - SQUEAL_KTS) / 80);
}

// The nodes on audio.js's context. Returns play(sim) for each frame; play(null) silences.
export function rollSound(ctx) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  src.connect(lp);
  lp.connect(gain);
  gain.connect(ctx.destination);
  src.start();
  const st = { held: false, at: undefined }, r = { gain: 0, filterHz: 250 };

  function squeal(g) {
    try {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(2100, t);
      o.frequency.exponentialRampToValueAtTime(1700, t + 0.4);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(g, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(sg);
      sg.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    } catch { /* best-effort */ }
  }

  return (sim) => {
    if (!sim) { gain.gain.value = 0; st.held = true; return; } // sound off: brakes already set stay quiet when it is back on
    // A belly slide (gear up or in transit; systems.js gearLocked, inlined as touchdownFeel.js) has no tyres.
    const wheels = sim.onGround && (sim.gearPos ?? (sim.gearDown === false ? 0 : 1)) >= 1;
    rumbleLevel(wheels, sim.gsKts, sim.spec?.engine?.type === 'piston-prop', r);
    const t = ctx.currentTime;
    gain.gain.setTargetAtTime(r.gain, t, 0.1);
    lp.frequency.setTargetAtTime(r.filterHz, t, 0.1);
    const g = wheels || !sim.onGround ? brakeSqueal(st, sim, t) : 0;
    if (g && ctx.state === 'running') squeal(g); // a suspended clock would play it late (as touchdownFeel.js)
  };
}
