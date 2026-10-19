import { describe, it, expect } from 'vitest';
import {
  stabilizedGate, isImc, locDeviationDots, gsDeviationDots, GATE_VMC_FT, GATE_IMC_FT,
} from '../../src/aero.js';

// On speed, on path, configured: the 737 at Vref+5 on a 3° path (~700 fpm).
const GOOD = { iasKt: 141, vref: 136, vsFpm: -720, gearDown: true, flapsOk: true, glideDevDots: 0.2, locDevDots: -0.3, vmc: true };

describe('stabilizedGate (0020)', () => {
  it('passes a stabilized approach', () => {
    expect(stabilizedGate(GOOD)).toEqual({ gateHeight: 500, stable: true, failing: [] });
  });

  it.each([
    ['below Vref', { iasKt: 135 }, ['SLOW']],
    ['above Vref+20', { iasKt: 157 }, ['FAST']],
    ['sinking more than 1,000 fpm', { vsFpm: -1050 }, ['SINK']],
    ['gear up', { gearDown: false }, ['GEAR']],
    ['flaps not set for landing', { flapsOk: false }, ['FLAPS']],
    ['more than 1 dot high', { glideDevDots: 1.2 }, ['GLIDESLOPE']],
    ['more than 1 dot low', { glideDevDots: -1.5 }, ['GLIDESLOPE']],
    ['more than 1 dot off the localizer', { locDevDots: 1.1 }, ['LOCALIZER']],
    ['fast, steep and dirty all at once', { iasKt: 175, vsFpm: -1600, gearDown: false }, ['FAST', 'SINK', 'GEAR']],
  ])('flags %s', (_, change, failing) => {
    const r = stabilizedGate({ ...GOOD, ...change });
    expect(r.stable).toBe(false);
    expect(r.failing).toEqual(failing);
  });

  it('accepts the edges of each band', () => {
    for (const change of [{ iasKt: 136 }, { iasKt: 156 }, { vsFpm: -1000 }, { glideDevDots: -1 }, { locDevDots: 1 }]) {
      expect(stabilizedGate({ ...GOOD, ...change }).stable).toBe(true);
    }
  });

  it('gates at 500 ft in VMC and 1,000 ft in IMC', () => {
    expect(GATE_VMC_FT).toBe(500);
    expect(GATE_IMC_FT).toBe(1000);
    expect(stabilizedGate({ ...GOOD, vmc: false }).gateHeight).toBe(1000);
  });
});

describe('isImc', () => {
  it('is IMC under a 1,000 ft ceiling or 3 SM visibility', () => {
    expect(isImc({ ceilingFt: null, visibilitySm: 10 })).toBe(false);
    expect(isImc({ ceilingFt: 1000, visibilitySm: 3 })).toBe(false);
    expect(isImc({ ceilingFt: 900, visibilitySm: 10 })).toBe(true);
    expect(isImc({ ceilingFt: 2500, visibilitySm: 2.5 })).toBe(true);
  });
});

describe('ILS deviation dots', () => {
  it('is one localizer dot at 1.25° and one glideslope dot at 0.35°', () => {
    // Independent: tan(1.25°) × 5000 m = 109.1 m; tan(0.35°) × 3000 m = 18.33 m.
    expect(locDeviationDots(109.11, 5000)).toBeCloseTo(1, 2);
    expect(locDeviationDots(-109.11, 5000)).toBeCloseTo(-1, 2);
    expect(gsDeviationDots(18.33, 3000)).toBeCloseTo(1, 2);
    expect(gsDeviationDots(0, 3000)).toBe(0);
  });
});
