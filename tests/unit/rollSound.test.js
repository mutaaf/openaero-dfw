import { describe, it, expect, vi, afterEach } from 'vitest';
import { rumbleLevel, brakeSqueal, rollSound } from '../../src/rollSound.js';
import { createAudio } from '../../src/audio.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';

// Tyre rumble and brake squeal on the ground roll (0149).

describe('rumbleLevel: the tyre rumble follows the ground speed (0149)', () => {
  it('is silent in the air at any speed, and stopped on the ground', () => {
    for (const gs of [0, 40, 140, 300]) expect(rumbleLevel(false, gs).gain).toBe(0);
    expect(rumbleLevel(true, 0).gain).toBe(0);
  });

  it('rises with ground speed on the ground, capped, and opens its filter with it', () => {
    let last = rumbleLevel(true, 0);
    for (let gs = 5; gs <= 200; gs += 5) {
      const r = rumbleLevel(true, gs);
      expect(r.gain).toBeGreaterThanOrEqual(last.gain);
      expect(r.filterHz).toBeGreaterThanOrEqual(last.filterHz);
      last = r;
    }
    expect(rumbleLevel(true, 20).gain).toBeGreaterThan(0);
    expect(rumbleLevel(true, 130).gain).toBeGreaterThan(rumbleLevel(true, 30).gain);
    expect(last.gain).toBeLessThanOrEqual(0.12); // audio.js's callout chirp's level
    // A phone speaker plays little under ~250 Hz (0148's lesson): the rumble's band reaches above it.
    expect(rumbleLevel(true, 5).filterHz).toBeGreaterThanOrEqual(250);
  });

  it('a light piston aircraft reaches full rumble at 60 kt, a jet at 120; it writes into out', () => {
    expect(rumbleLevel(true, 60, true).gain).toBeCloseTo(rumbleLevel(true, 120, false).gain, 9);
    expect(rumbleLevel(true, 60, true).gain).toBeGreaterThan(rumbleLevel(true, 60, false).gain);
    const out = {};
    expect(rumbleLevel(true, 80, false, out)).toBe(out);
  });

  it('a non-number ground speed is silent, never NaN', () => {
    expect(rumbleLevel(true, undefined).gain).toBe(0);
    expect(rumbleLevel(true, NaN).gain).toBe(0);
  });
});

describe('brakeSqueal: once per brake application above 40 kt (0149)', () => {
  const roll = (extra = {}) => ({ onGround: true, gsKts: 110, brakesOn: false, assist: 'pilot', ...extra });

  it('fires once when the player sets the brakes at speed, not every frame they stay on', () => {
    const st = {};
    const sim = roll();
    expect(brakeSqueal(st, sim, 0)).toBe(0);
    sim.brakesOn = true;
    const g = brakeSqueal(st, sim, 0.1);
    expect(g).toBeGreaterThanOrEqual(0.08);
    expect(g).toBeLessThanOrEqual(0.12);
    for (let i = 0; i < 50; i++) { sim.gsKts -= 1; expect(brakeSqueal(st, sim, 0.2 + i / 60)).toBe(0); }
  });

  it('is loud enough to hear: a triangle at 0.08-0.12 peak is ~0.05-0.07 RMS, the touchdown chirp\'s level (0147)', () => {
    const g = brakeSqueal({}, roll({ brakesOn: true, gsKts: 60 }), 0);
    expect(g / Math.sqrt(3)).toBeGreaterThan(0.045);
  });

  it('released and set again squeals again, but not within 1.5 s (a tapped toggle)', () => {
    const st = {};
    const sim = roll({ brakesOn: true });
    expect(brakeSqueal(st, sim, 0)).toBeGreaterThan(0);
    sim.brakesOn = false; expect(brakeSqueal(st, sim, 0.4)).toBe(0);
    sim.brakesOn = true; expect(brakeSqueal(st, sim, 0.8)).toBe(0);
    sim.brakesOn = false; brakeSqueal(st, sim, 1.2);
    sim.brakesOn = true; expect(brakeSqueal(st, sim, 1.6)).toBeGreaterThan(0);
  });

  it('never at or below 40 kt, stopped, or in the air', () => {
    for (const gs of [0, 10, 40]) expect(brakeSqueal({}, roll({ gsKts: gs, brakesOn: true }), 0)).toBe(0);
    expect(brakeSqueal({}, roll({ onGround: false, brakesOn: true }), 0)).toBe(0);
  });

  it('brakes already set in the air do not squeal at the touchdown (it is the chirp\'s moment, 0147)', () => {
    const st = {};
    const sim = roll({ onGround: false, brakesOn: true, gsKts: 65 });
    expect(brakeSqueal(st, sim, 0)).toBe(0);
    sim.onGround = true;
    for (let i = 1; i < 30; i++) expect(brakeSqueal(st, sim, i / 60)).toBe(0);
  });

  it('the autobrake alone never squeals (only the player\'s brakes do)', () => {
    expect(brakeSqueal({}, roll({ brakesOn: false, autobrakeActive: true, brakePress: 1 }), 0)).toBe(0);
  });

  it('not on Kid (its landings are soft by design, as touchdownFeel.js)', () => {
    expect(brakeSqueal({}, roll({ assist: 'kid', brakesOn: true }), 0)).toBe(0);
  });
});

// A fake Web Audio context: records every target each AudioParam is set to.
function fakeAudio() {
  const param = () => { const p = { value: 0, targets: [] }; p.setValueAtTime = (v) => { p.value = v; }; p.setTargetAtTime = (v) => { p.targets.push(v); p.value = v; }; p.exponentialRampToValueAtTime = () => {}; return p; };
  const made = { sources: [], osc: [], filters: [], gains: [] };
  const node = (kind) => { const n = { connect() {}, start() { n.started = true; }, stop() {}, frequency: param(), gain: param(), Q: param() }; made[kind]?.push(n); return n; };
  class Ctx {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
    createOscillator() { return node('osc'); }
    createBiquadFilter() { return node('filters'); }
    createGain() { return node('gains'); }
    createBuffer(_c, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return node('sources'); }
    suspend() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
  }
  return { Ctx, made };
}

describe('rollSound: the nodes (0149)', () => {
  const sim = (extra = {}) => ({ onGround: true, gsKts: 0, brakesOn: false, assist: 'pilot', ...extra });

  it('rumble gain is 0 in the air and rises with ground speed; silence (null) zeroes it', () => {
    const { Ctx, made } = fakeAudio();
    const play = rollSound(new Ctx());
    const rumble = made.gains[0];
    play(sim({ onGround: false, gsKts: 140 }));
    expect(rumble.gain.targets.at(-1)).toBe(0);
    play(sim({ gsKts: 30 }));
    const slow = rumble.gain.targets.at(-1);
    play(sim({ gsKts: 120 }));
    expect(slow).toBeGreaterThan(0);
    expect(rumble.gain.targets.at(-1)).toBeGreaterThan(slow);
    play(null);
    expect(rumble.gain.value).toBe(0);
  });

  it('brakes set at speed start one squeal; holding them starts no more; none while stopped or suspended', () => {
    const { Ctx, made } = fakeAudio();
    const ctx = new Ctx();
    const play = rollSound(ctx);
    play(sim({ gsKts: 100 }));
    play(sim({ gsKts: 100, brakesOn: true }));
    expect(made.osc.length).toBe(1);
    expect(made.osc[0].started).toBe(true);
    for (let i = 0; i < 20; i++) { ctx.currentTime += 0.1; play(sim({ gsKts: 95, brakesOn: true })); }
    expect(made.osc.length).toBe(1);
    play(sim({ gsKts: 0 })); play(sim({ gsKts: 0, brakesOn: true }));
    expect(made.osc.length).toBe(1);
    ctx.state = 'suspended'; ctx.currentTime += 5;
    play(sim({ gsKts: 100 })); play(sim({ gsKts: 100, brakesOn: true }));
    expect(made.osc.length).toBe(1);
  });

  it('a belly slide (gear up) has no tyres: no rumble, no squeal', () => {
    const { Ctx, made } = fakeAudio();
    const play = rollSound(new Ctx());
    play(sim({ gsKts: 100, gearPos: 0 }));
    play(sim({ gsKts: 100, gearPos: 0, brakesOn: true }));
    expect(made.gains[0].gain.targets.at(-1)).toBe(0);
    expect(made.osc.length).toBe(0);
    play(sim({ gsKts: 100, gearPos: 1 }));
    expect(made.gains[0].gain.targets.at(-1)).toBeGreaterThan(0);
  });

  it('after sound off (play(null)), brakes already set do not squeal when it comes back', () => {
    const { Ctx, made } = fakeAudio();
    const ctx = new Ctx();
    const play = rollSound(ctx);
    play(null);
    ctx.currentTime = 3;
    play(sim({ gsKts: 100, brakesOn: true }));
    expect(made.osc.length).toBe(0);
  });
});

describe('audio.js plays the roll through its chunk; sound off silences it (0149)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const base = (extra = {}) => ({ aircraftKey: 'b738', spec: AIRCRAFT_DATABASE.b738, raFt: 0, aglFt: 12, vsiFpm: 0, onGround: true,
    vel: { y: 0 }, lastCalloutIdx: -1, throttle: 0, engineN: 0, tasKts: 130, iasKts: 130, gsKts: 130, sigma: 1, flapsIndex: 3,
    brakesOn: false, assist: 'pilot', engineFailed: false, paused: false, audioEnabled: false, ...extra });

  it('on the roll the rumble is up; mute() zeroes it; sound off stops driving it', async () => {
    const { Ctx, made } = fakeAudio();
    vi.stubGlobal('window', { AudioContext: Ctx });
    const s = base();
    const audio = createAudio(s, () => {});
    audio.init();
    await vi.dynamicImportSettled();
    audio.update();
    const rumble = made.gains[3]; // engine, wind, stall horn, then the chunk's rumble
    expect(rumble.gain.targets.at(-1)).toBeCloseTo(rumbleLevel(true, 130, false).gain, 6);
    audio.mute();
    expect(rumble.gain.value).toBe(0);
    s.audioEnabled = false;
    const k = rumble.gain.targets.length;
    audio.update();
    expect(rumble.gain.targets.length).toBe(k);
  });
});
