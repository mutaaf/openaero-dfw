import { describe, it, expect } from 'vitest';
import { gradeLanding } from '../../src/landing.js';
import { stripLayout, touchdownLabel, AIM_POINT_M, tdzLengthM } from '../../src/touchdownStrip.js';

// Ticket 0088: the results card's runway strip. 35C: 13,400 ft x 150 ft (4,084 m x 45.7 m).
const td = { pastThresholdM: 640, crossM: -3.2, lengthM: 4084, widthM: 45.7 };
const good = { vsFpm: -110, crossM: -3.2, pastThresholdM: 640, runwayLengthM: 4084, runwayWidthM: 45.7, pitchDeg: 3.5, bankDeg: 0.5, iasKts: 140, vrefKts: 136 };

describe('gradeLanding exposes the touchdown point', () => {
  it('along, across and the runway it was measured on', () => {
    expect(gradeLanding(good).touchdown).toEqual(td);
  });
});

describe('stripLayout', () => {
  const W = 320, H = 32;
  const L = stripLayout(td, W, H);
  it('threshold on the left, the far end on the right, the centreline in the middle', () => {
    expect(L.thrX).toBeGreaterThan(0);
    expect(L.endX).toBeCloseTo(W * 0.94, 6); // ground past the end for an overrun
    expect(L.cy).toBe(H / 2);
    expect(L.endX - L.thrX).toBeCloseTo(td.lengthM * L.pxPerM, 6);
  });
  it('puts the dot at the measured touchdown, within 1 px', () => {
    expect(Math.abs(L.dotX - (L.thrX + 640 * L.pxPerM))).toBeLessThan(1);
    // Left of centre is up: the strip is drawn landing left to right.
    expect(L.dotY).toBeLessThan(L.cy);
    expect(Math.abs(L.dotY - (L.cy - 3.2 * L.pyPerM))).toBeLessThan(1);
    expect(L.clamped).toBe(false);
  });
  it('the runway edges are its width, the aiming point 1,000 ft down, the zone 3,000 ft', () => {
    expect(L.edgeTop).toBeCloseTo(L.cy - (td.widthM / 2) * L.pyPerM, 6);
    expect(L.edgeBottom).toBeCloseTo(L.cy + (td.widthM / 2) * L.pyPerM, 6);
    expect(AIM_POINT_M).toBeCloseTo(1000 * 0.3048, 6);
    expect(L.aimX).toBeCloseTo(L.thrX + AIM_POINT_M * L.pxPerM, 6);
    expect(L.tdzX).toBeCloseTo(L.thrX + 3000 * 0.3048 * L.pxPerM, 6);
  });
  it('a short runway keeps its zone to the first third', () => {
    expect(tdzLengthM(1800)).toBeCloseTo(600, 6);
    expect(tdzLengthM(4084)).toBeCloseTo(914.4, 6);
  });
  it('right of centre is down; short of the threshold is left of it', () => {
    const r = stripLayout({ ...td, crossM: 5 }, W, H);
    expect(r.dotY).toBeGreaterThan(r.cy);
    const s = stripLayout({ ...td, pastThresholdM: -60 }, W, H);
    expect(s.dotX).toBeLessThan(s.thrX);
    expect(s.dotX).toBeGreaterThan(0);
  });
  it('keeps a dot off the strip on its edge and says so', () => {
    const far = stripLayout({ ...td, pastThresholdM: -2000, crossM: 300 }, W, H);
    expect(far.clamped).toBe(true);
    expect(far.dotX).toBeGreaterThanOrEqual(far.r);
    expect(far.dotY).toBeLessThanOrEqual(H - far.r);
    const long = stripLayout({ ...td, pastThresholdM: 5000 }, W, H);
    expect(long.dotX).toBeLessThanOrEqual(W - long.r);
    expect(long.clamped).toBe(true);
    // An overrun reads past the runway's end, not on it.
    const over = stripLayout({ ...td, pastThresholdM: td.lengthM + 60 }, W, H);
    expect(over.clamped).toBe(false);
    expect(over.dotX - over.r).toBeGreaterThan(over.endX);
  });
  it('a zero-size canvas does not throw or make NaN', () => {
    const z = stripLayout(td, 0, 0);
    expect(Number.isFinite(z.dotX) && Number.isFinite(z.dotY)).toBe(true);
  });
});

describe('touchdownLabel', () => {
  it('reads the numbers for a screen reader', () => {
    expect(touchdownLabel(td)).toBe('Touched down 640 metres past the threshold, 3 metres left of centre.');
    expect(touchdownLabel({ ...td, crossM: 4.6 })).toBe('Touched down 640 metres past the threshold, 5 metres right of centre.');
  });
  it('on the centreline, short of the runway, past its end', () => {
    expect(touchdownLabel({ ...td, crossM: 0.3 })).toBe('Touched down 640 metres past the threshold, on the centreline.');
    expect(touchdownLabel({ ...td, pastThresholdM: -42.4 })).toBe('Touched down 42 metres short of the threshold, 3 metres left of centre.');
    expect(touchdownLabel({ ...td, pastThresholdM: 4200 })).toMatch(/^Touched down 4200 metres past the threshold, past the runway's end/);
  });
  it('off the side says so', () => {
    expect(touchdownLabel({ ...td, crossM: 30 })).toBe('Touched down 640 metres past the threshold, 30 metres right of centre, off the runway.');
  });
});
