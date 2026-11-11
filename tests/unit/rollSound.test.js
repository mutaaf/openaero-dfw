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
    expect(last.gain).toBeLessThanOrEqual(0.1); // under audio.js's callout chirp (0.12)
    // A phone speaker plays little under ~250 Hz (0148's lesson): the rumble's band reaches above it.
    expect(rumbleLevel(true, 5).filterHz).toBeGreaterThanOrEqual(250);
  });

  it('a non-number ground speed is silent, never NaN', () => {
    expect(rumbleLevel(true, undefined).gain).toBe(0);
    expect(rumbleLevel(true, NaN).gain).toBe(0);
  });
});

describe('brakeSqueal: once per firm brake application above 40 kt (0149)', () => {
  const roll = (extra = {}) => ({ onGround: true, gsKts: 110, brakePress: 0, assist: 'pilot', ...extra });

  it('fires once when the brakes come on at speed, not every frame they stay on', () => {
    const st = {};
    const sim = roll();
    expect(brakeSqueal(st, sim)).toBe(0);
    sim.brakePress = 0.3; expect(brakeSqueal(st, sim)).toBe(0); // still building
    sim.brakePress = 0.8; const g = brakeSqueal(st, sim);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThanOrEqual(0.1);
    for (let i = 0; i < 50; i++) { sim.brakePress = 1; sim.gsKts -= 1; expect(brakeSqueal(st, sim)).toBe(0); }
  });

  it('a second application (released, then on again) squeals again', () => {
    const st = {};
    const sim = roll({ brakePress: 1 });
    expect(brakeSqueal(st, sim)).toBeGreaterThan(0);
    sim.brakePress = 0.05; expect(brakeSqueal(st, sim)).toBe(0);
    sim.brakePress = 1; expect(brakeSqueal(st, sim)).toBeGreaterThan(0);
  });

  it('never at or below 40 kt, stopped, or in the air', () => {
    for (const gs of [0, 10, 40]) expect(brakeSqueal({}, roll({ gsKts: gs, brakePress: 1 }))).toBe(0);
    expect(brakeSqueal({}, roll({ onGround: false, brakePress: 1 }))).toBe(0);
  });

  it('brakes held in the air squeal on the touchdown above 40 kt', () => {
    const st = {};
    const sim = roll({ onGround: false, brakePress: 1, gsKts: 65 });
    expect(brakeSqueal(st, sim)).toBe(0);
    sim.onGround = true;
    expect(brakeSqueal(st, sim)).toBeGreaterThan(0);
  });

  it('not on Kid (its landings are soft by design, as touchdownFeel.js)', () => {
    expect(brakeSqueal({}, roll({ assist: 'kid', brakePress: 1 }))).toBe(0);
  });
});

// A fake Web Audio context: records every target each AudioParam is set to.
function fakeAudio() {
  const param = () => { const p = { value: 0, targets: [] }; p.setValueAtTime = (v) => { p.value = v; }; p.setTargetAtTime = (v) => { p.targets.push(v); p.value = v; }; p.exponentialRampToValueAtTime = () => {}; return p; };
  const made = { sources: [], filters: [], gains: [] };
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
  const sim = (extra = {}) => ({ onGround: true, gsKts: 0, brakePress: 0, assist: 'pilot', ...extra });

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

  it('a firm brake at speed starts one burst; holding them starts no more; none while stopped', () => {
    const { Ctx, made } = fakeAudio();
    const play = rollSound(new Ctx());
    const before = made.sources.length; // the rumble's looped source
    play(sim({ gsKts: 100, brakePress: 1 }));
    expect(made.sources.length).toBe(before + 1);
    expect(made.sources.at(-1).started).toBe(true);
    for (let i = 0; i < 20; i++) play(sim({ gsKts: 95, brakePress: 1 }));
    expect(made.sources.length).toBe(before + 1);
    const n = made.sources.length;
    play(sim({ gsKts: 0, brakePress: 0 }));
    play(sim({ gsKts: 0, brakePress: 1 }));
    expect(made.sources.length).toBe(n);
  });
});

describe('audio.js plays the roll through its chunk; sound off silences it (0149)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const base = (extra = {}) => ({ aircraftKey: 'b738', spec: AIRCRAFT_DATABASE.b738, raFt: 0, aglFt: 12, vsiFpm: 0, onGround: true,
    vel: { y: 0 }, lastCalloutIdx: -1, throttle: 0, engineN: 0, tasKts: 130, iasKts: 130, gsKts: 130, sigma: 1, flapsIndex: 3,
    brakePress: 0, assist: 'pilot', engineFailed: false, paused: false, audioEnabled: false, ...extra });

  it('on the roll the rumble is up; mute() zeroes it; sound off stops driving it', async () => {
    const { Ctx, made } = fakeAudio();
    vi.stubGlobal('window', { AudioContext: Ctx });
    const s = base();
    const audio = createAudio(s, () => {});
    audio.init();
    await vi.dynamicImportSettled();
    audio.update();
    const rumble = made.gains[3]; // engine, wind, stall horn, then the chunk's rumble
    expect(rumble.gain.targets.at(-1)).toBeCloseTo(rumbleLevel(true, 130).gain, 6);
    audio.mute();
    expect(rumble.gain.value).toBe(0);
    s.audioEnabled = false;
    const k = rumble.gain.targets.length;
    audio.update();
    expect(rumble.gain.targets.length).toBe(k);
  });
});
