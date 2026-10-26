import { describe, it, expect } from 'vitest';
import { MAG_VAR_DEG, trueToMag, magToTrue, magHeadingText } from '../../src/magvar.js';
import { runwayEnd } from '../../src/airports.js';

// NOAA NCEI declination calculator, WMM-2025, 2026-10-26, sea level (east positive):
// https://www.ngdc.noaa.gov/geomag/calculators/magcalc.shtml
const NCEI_2026_10 = { KDFW: 2.68, KDAL: 2.56, KADS: 2.55, KAFW: 2.84, KFTW: 2.87, KGKY: 2.71 };

const end = runwayEnd;

describe('magvar (0078)', () => {
  it('is the WMM declination over DFW, one value within 0.2° of every field', () => {
    expect(Math.abs(MAG_VAR_DEG - NCEI_2026_10.KDFW)).toBeLessThan(0.05);
    for (const [icao, dec] of Object.entries(NCEI_2026_10)) {
      expect(Math.abs(MAG_VAR_DEG - dec), icao).toBeLessThan(0.2);
    }
  });

  it('subtracts an east variation and round-trips, wrapping at 0/360', () => {
    expect(trueToMag(90)).toBeCloseTo(90 - MAG_VAR_DEG, 9);
    expect(trueToMag(0.3)).toBeCloseTo(360.3 - MAG_VAR_DEG, 9);
    expect(magToTrue(359)).toBeCloseTo(359 + MAG_VAR_DEG - 360, 9);
    for (const d of [0, 0.3, 1, 2.7, 45, 180, 270, 357.5, 359.99]) {
      expect(magToTrue(trueToMag(d))).toBeCloseTo(d, 9);
      expect(trueToMag(d)).toBeGreaterThanOrEqual(0);
      expect(trueToMag(d)).toBeLessThan(360);
    }
  });

  it('reads like a compass: three digits, north is 360, never 000', () => {
    expect(magHeadingText(MAG_VAR_DEG)).toBe('360');
    expect(magHeadingText(MAG_VAR_DEG + 0.4)).toBe('360');
    expect(magHeadingText(MAG_VAR_DEG + 5)).toBe('005');
    expect(magHeadingText(90 + MAG_VAR_DEG)).toBe('090');
  });

  // FAA airport diagram AL-768 (Addison, variation epoch January 2025, VAR 3° E): 157° / 337°.
  it('lines up with Addison\'s current FAA diagram within 1°', () => {
    expect(Math.abs(trueToMag(end('KADS', '16').hdgT) - 157)).toBeLessThan(1);
    expect(Math.abs(trueToMag(end('KADS', '34').hdgT) - 337)).toBeLessThan(1);
  });

  // 35C is 0.3° true. FAA diagram AL-6039 (KDFW) prints 356°, but on a January 2015 variation
  // (about 4° E); today's compass reads 357.6°. The runway number (35) is older still.
  it('puts DFW 35C at today\'s magnetic heading, not its true 000', () => {
    const c = end('KDFW', '35C');
    expect(magHeadingText(c.hdgT)).toBe('358');
    expect(magHeadingText(end('KDFW', '17C').hdgT)).toBe('178');
  });
});
