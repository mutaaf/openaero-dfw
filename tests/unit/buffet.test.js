// Ticket 0079: the stall buffet's curve (src/buffet.js), per aircraft, and its shake.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallAoaDeg } from '../../src/aero.js';
import { buffetIntensity, wingBuffet, shakeAt, BUFFET_ONSET, SHAKE_DEG } from '../../src/buffet.js';
import { stallSpeedKts } from '../../src/aero.js';

describe('buffetIntensity (0079)', () => {
  for (const [key, spec] of Object.entries(AIRCRAFT_DATABASE)) {
    const notches = spec.alphaStallDegByFlap?.length ?? 1;
    for (let f = 0; f < notches; f++) {
      const st = stallAoaDeg(spec, f);
      it(`${key} flaps ${f} (stall ${st}°): 0 at 80% of the stall angle, strictly rising from ${BUFFET_ONSET * 100}%, 1 at the stall`, () => {
        expect(buffetIntensity(0.8 * st, st)).toBe(0);
        expect(buffetIntensity(BUFFET_ONSET * st, st)).toBe(0);
        expect(buffetIntensity(st, st)).toBe(1);
        let prev = 0;
        for (let i = 1; i <= 30; i++) {
          const k = buffetIntensity(st * (BUFFET_ONSET + (1 - BUFFET_ONSET) * i / 30), st);
          expect(k).toBeGreaterThan(prev);
          prev = k;
        }
        expect(prev).toBe(1);
        expect(buffetIntensity(st + 10, st)).toBe(1); // a stalled wing keeps buffeting
      });
    }
  }
  it('symmetric in AoA (the lift curve stalls on |α|); nothing at 0 or without a stall angle', () => {
    expect(buffetIntensity(-20, 15)).toBe(1);
    expect(buffetIntensity(-0.925 * 15, 15)).toBeCloseTo(buffetIntensity(0.925 * 15, 15), 12);
    expect(buffetIntensity(0, 15)).toBe(0);
    expect(buffetIntensity(20, 0)).toBe(0);
    expect(buffetIntensity(NaN, 15)).toBe(0);
  });
  it('onset at 85% of the stall angle, half way up at 92.5% (a smoothstep, not a ramp or a square)', () => {
    expect(BUFFET_ONSET).toBe(0.85);
    expect(buffetIntensity(0.925 * 15, 15)).toBeCloseTo(0.5, 6);
    expect(buffetIntensity(0.8875 * 15, 15)).toBeCloseTo(0.15625, 6); // t = 1/4: 3t² − 2t³
  });
});

describe('wingBuffet (0079)', () => {
  const c172 = AIRCRAFT_DATABASE.c172;
  it('takes the stall angle where the flaps are (flapPos, in transit), not where the lever is', () => {
    // A go-around: the lever up (0), the flaps still at 30° (notch 3): the wing breaks at 13.3°.
    const body = { flapsIndex: 0, flapPos: 3, iasKts: 60 };
    expect(wingBuffet(c172, body, 13.3)).toBe(1);
    expect(buffetIntensity(13.3, stallAoaDeg(c172, 0))).toBeLessThan(0.8); // the lever's angle would say ~0.7
  });
  it('full at the 1 g stall speed and above; fading with (IAS / Vs)² below it', () => {
    const vs = stallSpeedKts(c172, 0);
    expect(wingBuffet(c172, { flapPos: 0, iasKts: vs }, 20)).toBeCloseTo(1, 9);
    expect(wingBuffet(c172, { flapPos: 0, iasKts: 2 * vs }, 20)).toBe(1);
    expect(wingBuffet(c172, { flapPos: 0, iasKts: vs / 2 }, 20)).toBeCloseTo(0.25, 9);
    expect(wingBuffet(c172, { flapPos: 0, iasKts: 5 }, 20)).toBeLessThan(0.02); // a tail slide
    expect(wingBuffet(c172, { flapPos: 0, iasKts: 60 }, 5)).toBe(0);
  });
});

describe('shakeAt (0079)', () => {
  it('still at intensity 0; bounded by SHAKE_DEG; and it moves', () => {
    let peak = 0, distinct = new Set();
    for (let i = 0; i < 600; i++) {
      const t = i / 60;
      const z = shakeAt(t, 0);
      expect(z.pitch === 0 && z.yaw === 0).toBe(true);
      const s = shakeAt(t, 1);
      peak = Math.max(peak, Math.abs(s.pitch), Math.abs(s.yaw));
      distinct.add(s.pitch.toFixed(5));
    }
    expect(peak * 180 / Math.PI).toBeLessThanOrEqual(SHAKE_DEG + 1e-9);
    expect(peak * 180 / Math.PI).toBeGreaterThan(0.5 * SHAKE_DEG);
    expect(distinct.size).toBeGreaterThan(100);
  });
});
