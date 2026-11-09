// Ticket 0079: the stall buffet's curve (src/buffet.js), per aircraft, and its shake.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallAoaDeg } from '../../src/aero.js';
import { buffetIntensity, shakeAt, BUFFET_ONSET, SHAKE_DEG } from '../../src/buffet.js';

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
  it('nothing at negative or zero AoA, or without a stall angle', () => {
    expect(buffetIntensity(-20, 15)).toBe(0);
    expect(buffetIntensity(0, 15)).toBe(0);
    expect(buffetIntensity(20, 0)).toBe(0);
    expect(buffetIntensity(NaN, 15)).toBe(0);
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
