// The ground roll's sound (0149): a tyre rumble that rises with ground speed while the wheels
// are on the ground, and a short squeal when the brakes come on firmly above 40 kt.
// Rides in engineSound.js's lazy chunk (re-exported there, as audioSession.js), so boot pays
// only audio.js's two calls. Synthesized (Web Audio noise, no samples, no network); a
// game-feel cue tuned by ear, not a tyre acoustics model. tests/unit/rollSound.test.js.
//
// The rumble is low-passed noise whose cut-off opens with speed from 250 Hz (a phone speaker
// plays little under ~250 Hz: 0148's lesson), gain ≤ 0.08 (audio.js's chirp is 0.12). The
// squeal is a 0.35 s band-passed burst, once per application: re-armed when the brakes are
// released (brakePress under 0.2, systems.js) or the wheels leave the ground. None on Kid
// (its landings are soft by design, as touchdownFeel.js's chirp).

const SQUEAL_KTS = 40;

// Pure: the rumble for this frame. gsKts: ground speed (kt); in the air or stopped, silent.
export function rumbleLevel(onGround, gsKts) {
  const gs = onGround && gsKts > 0 ? Math.min(gsKts, 150) : 0;
  return { gain: 0.08 * Math.min(1, gs / 120), filterHz: 250 + 5 * gs };
}

// Pure but for st ({ held }): the squeal's gain this frame, 0 for none.
export function brakeSqueal(st, sim) {
  if (!sim.onGround || sim.brakePress < 0.2) { st.held = false; return 0; }
  if (st.held || sim.brakePress < 0.5 || !(sim.gsKts > SQUEAL_KTS) || sim.assist === 'kid') return 0;
  st.held = true;
  return 0.04 + 0.04 * Math.min(1, (sim.gsKts - SQUEAL_KTS) / 80);
}

// The nodes on audio.js's context. Returns play(sim) for each frame; play(null) silences.
export function rollSound(ctx) {
  const len = ctx.sampleRate;
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
  const st = { held: false };

  function squeal(g) {
    try {
      const t = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1900, t);
      bp.Q.value = 8;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(g, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      s.connect(bp);
      bp.connect(sg);
      sg.connect(ctx.destination);
      s.start(t, Math.random() * 0.5);
      s.stop(t + 0.35);
    } catch { /* best-effort */ }
  }

  return (sim) => {
    if (!sim) { gain.gain.value = 0; return; }
    const r = rumbleLevel(sim.onGround, sim.gsKts);
    const t = ctx.currentTime;
    gain.gain.setTargetAtTime(r.gain, t, 0.1);
    lp.frequency.setTargetAtTime(r.filterHz, t, 0.1);
    const g = brakeSqueal(st, sim);
    if (g) squeal(g);
  };
}
