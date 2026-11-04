import { describe, it, expect, vi } from 'vitest';
import { engineRpm, engineVoice, fanN1 } from '../../src/engineSound.js';
import { createAudio } from '../../src/audio.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';

const KT = 0.514444;

describe('engineRpm: the Cessna fixed-pitch prop (0148)', () => {
  it('turns ~2300 rpm at static full power, sea level (POH Section 4 static run-up 2300-2420 rpm)', () => {
    expect(engineRpm(1, 0, 1, true)).toBeGreaterThan(2250);
    expect(engineRpm(1, 0, 1, true)).toBeLessThan(2350);
  });

  it('unloads and gains RPM as it speeds up: ~2700 rpm at the 126 KTAS full-throttle maximum (POH Section 1)', () => {
    let last = 0;
    for (let kt = 0; kt <= 126; kt += 6) {
      const r = engineRpm(1, kt * KT, 1, true);
      expect(r).toBeGreaterThan(last);
      last = r;
    }
    expect(last).toBeGreaterThan(2600);
    expect(last).toBeLessThan(2800);
  });

  it('a running engine at idle on the ground holds its idle rpm; in a glide the prop windmills faster', () => {
    expect(engineRpm(0, 0, 1, true)).toBe(650);
    const glide = engineRpm(0, 68 * KT, 1, true);
    expect(glide).toBeGreaterThan(650);
    expect(glide).toBeLessThan(1400);
  });

  it('a dead engine windmills with airspeed and stops when the air stops', () => {
    const w68 = engineRpm(0, 68 * KT, 1, false);
    const w90 = engineRpm(0, 90 * KT, 1, false);
    expect(w68).toBeGreaterThan(700);
    expect(w90).toBeGreaterThan(w68);
    expect(engineRpm(0, 0, 1, false)).toBe(0);
  });

  it('thin air: full power at 8,000 ft (σ 0.786) still turns within ~5% of sea level', () => {
    const sl = engineRpm(1, 100 * KT, 1, true);
    const hi = engineRpm(1, 100 * KT, 0.786, true);
    expect(Math.abs(hi / sl - 1)).toBeLessThan(0.05);
  });
});

describe('engineVoice follows the engine, not the lever (0148)', () => {
  const out = { hz: 0, gain: 0, filterHz: 0 };
  const b738 = AIRCRAFT_DATABASE.b738, c172 = AIRCRAFT_DATABASE.c172, f16 = AIRCRAFT_DATABASE.f16;

  it('the 737: lever at full, spool at idle → the idle voice; voice rises with engineN', () => {
    engineVoice({ spec: b738, throttle: 1, engineN: 0, tasKts: 140, sigma: 1 }, out);
    const idleHz = out.hz;
    engineVoice({ spec: b738, throttle: 0, engineN: 0, tasKts: 140, sigma: 1 }, out);
    expect(out.hz).toBe(idleHz);
    engineVoice({ spec: b738, throttle: 1, engineN: 1, tasKts: 140, sigma: 1 }, out);
    expect(out.hz).toBeGreaterThan(idleHz * 2);
  });

  it('turbofan N1 is ~20% at idle (4% idle thrust) and 100% at full', () => {
    expect(fanN1(b738.engine, 0)).toBeCloseTo(0.2, 2);
    expect(fanN1(b738.engine, 1)).toBe(1);
  });

  it('the F-16 is higher and brighter than the 737 at the same spool', () => {
    engineVoice({ spec: b738, engineN: 1, tasKts: 200, sigma: 1 }, out);
    const b = { ...out };
    engineVoice({ spec: f16, engineN: 1, tasKts: 200, sigma: 1 }, out);
    expect(out.hz).toBeGreaterThan(b.hz);
    expect(out.filterHz).toBeGreaterThan(b.filterHz);
  });

  it('the Cessna: blade-pass at 2 blades × rpm / 60', () => {
    engineVoice({ spec: c172, engineN: 1, tasKts: 0, sigma: 1 }, out);
    expect(out.hz).toBeCloseTo((engineRpm(1, 0, 1, true) * 2) / 60, 6);
  });

  it('allocates nothing: writes into the object it is given', () => {
    const o = { hz: 0, gain: 0, filterHz: 0 };
    expect(engineVoice({ spec: c172, engineN: 0.5, tasKts: 80, sigma: 1 }, o)).toBe(o);
  });
});

// A fake Web Audio context: records every target each AudioParam is set to.
function fakeAudio() {
  const param = () => { const p = { value: 0, targets: [] }; p.setValueAtTime = (v) => { p.value = v; }; p.setTargetAtTime = (v) => { p.targets.push(v); p.value = v; }; return p; };
  const node = () => ({ connect() {}, start() {}, stop() {}, frequency: param(), gain: param() });
  const made = { osc: [], filters: [], gains: [] };
  class Ctx {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
    createOscillator() { const n = node(); made.osc.push(n); return n; }
    createBiquadFilter() { const n = node(); made.filters.push(n); return n; }
    createGain() { const n = node(); made.gains.push(n); return n; }
    createBuffer(_c, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return node(); }
    suspend() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
  }
  return { Ctx, made };
}

describe('audio.js drives the engine voice from the spool (0148)', () => {
  const simFor = (key, extra = {}) => ({ aircraftKey: key, spec: AIRCRAFT_DATABASE[key], raFt: 3000, aglFt: 3000, vsiFpm: 0, onGround: false,
    vel: { y: 0 }, lastCalloutIdx: -1, throttle: 0, engineN: 0, tasKts: 150, iasKts: 150, sigma: 1, flapsIndex: 0, engineFailed: false, paused: false, audioEnabled: false, ...extra });

  async function started(sim) {
    const { Ctx, made } = fakeAudio();
    vi.stubGlobal('window', { AudioContext: Ctx });
    const audio = createAudio(sim, () => {});
    audio.init();
    await vi.dynamicImportSettled();
    vi.unstubAllGlobals();
    return { audio, osc: made.osc[0], gain: made.gains[0] };
  }

  it('a brisk throttle step on the 737: the voice target follows sim.engineN, not the lever', async () => {
    const sim = simFor('b738');
    const { audio, osc } = await started(sim);
    audio.update(false);
    const idleHz = osc.frequency.targets.at(-1);
    sim.throttle = 1; // lever slammed forward, engine still at idle
    audio.update(false);
    expect(osc.frequency.targets.at(-1)).toBeCloseTo(idleHz, 6);
    sim.engineN = 0.5; // spooling up
    audio.update(false);
    const mid = osc.frequency.targets.at(-1);
    expect(mid).toBeGreaterThan(idleHz);
    sim.engineN = 1;
    audio.update(false);
    expect(osc.frequency.targets.at(-1)).toBeGreaterThan(mid);
  });

  it('engine-failed Cessna: the pitch decays to the windmill, not to silence', async () => {
    const sim = simFor('c172', { tasKts: 68, throttle: 1, engineN: 1 });
    const { audio, osc, gain } = await started(sim);
    audio.update(false);
    const running = osc.frequency.targets.at(-1);
    sim.engineFailed = true;
    sim.engineN = 0; // spooled down (flightModel.js spools a dead engine to 0)
    audio.update(false);
    const windmill = osc.frequency.targets.at(-1);
    expect(windmill).toBeLessThan(running);
    expect(windmill).toBeCloseTo((engineRpm(0, 68 * KT, 1, false) * 2) / 60, 6);
    expect(windmill).toBeGreaterThan(20);
    expect(gain.gain.targets.at(-1)).toBeGreaterThan(0);
  });

  it('sound off and mute() still silence it', async () => {
    const sim = simFor('c172', { engineN: 1, throttle: 1 });
    const { audio, osc, gain } = await started(sim);
    audio.mute();
    expect(gain.gain.value).toBe(0);
    sim.audioEnabled = false;
    const n = osc.frequency.targets.length;
    audio.update(false);
    expect(osc.frequency.targets.length).toBe(n);
  });
});
