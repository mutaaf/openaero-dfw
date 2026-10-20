import { describe, it, expect } from 'vitest';
import {
  gmstDeg, lstRad, equatorialToSim, radecToUnit, applyMat3, moonDirection, moonIllumination,
  nightness, starColour,
} from '../../src/sky.js';
import { sunPosition, sunDirection } from '../../src/sun.js';
import { DEG_TO_RAD, RAD_TO_DEG } from '../../src/constants.js';

const LAT = 32.8998;
const LON = -97.0403;
const angleDeg = (a, b) => Math.acos(Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)) * RAD_TO_DEG;

describe('sidereal time', () => {
  it('matches the J2000 epoch value', () => {
    expect(gmstDeg(new Date(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(280.46062, 4);
  });
  it('matches Meeus example 12.a (1987-04-10 0h UT = 13h10m46.37s)', () => {
    expect(gmstDeg(new Date(Date.UTC(1987, 3, 10)))).toBeCloseTo(197.693195, 3);
  });
});

describe('equatorialToSim', () => {
  const date = new Date(Date.UTC(2026, 9, 19, 4));
  const m = equatorialToSim(LAT, lstRad(date, LON));
  it('puts a star at RA = LST, Dec = latitude at the zenith', () => {
    const v = applyMat3(m, radecToUnit(lstRad(date, LON), LAT * DEG_TO_RAD));
    expect(v.y).toBeCloseTo(1, 6);
  });
  it('puts the celestial pole due north at the latitude', () => {
    const v = applyMat3(m, { x: 0, y: 0, z: 1 });
    expect(Math.asin(v.y) * RAD_TO_DEG).toBeCloseTo(LAT, 6);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.z).toBeLessThan(0); // −Z is north
  });
  it('rises stars in the east: RA = LST − 6h on the equator is due west, + 6h due east', () => {
    const east = applyMat3(m, radecToUnit(lstRad(date, LON) + Math.PI / 2, 0));
    expect(east.x).toBeCloseTo(1, 6);
    const west = applyMat3(m, radecToUnit(lstRad(date, LON) - Math.PI / 2, 0));
    expect(west.x).toBeCloseTo(-1, 6);
  });
});

describe('the Moon', () => {
  it('covers the Sun over Dallas at totality, 2024-04-08 18:42 UTC', () => {
    // NASA: totality in Dallas 18:40:43–18:44:35 UTC. Low-precision series: ~0.3°.
    const date = new Date(Date.UTC(2024, 3, 8, 18, 42, 40));
    const sun = sunDirection(sunPosition(date, 32.78, -96.80));
    const moon = moonDirection(date, 32.78, -96.80);
    expect(angleDeg(sun, moon)).toBeLessThan(0.5);
    expect(moonIllumination(moon, sun)).toBeLessThan(0.01);
  });
  it('is full on 2024-04-23 23:49 UTC (USNO)', () => {
    const date = new Date(Date.UTC(2024, 3, 23, 23, 49));
    const sun = sunDirection(sunPosition(date, LAT, LON));
    expect(moonIllumination(moonDirection(date, LAT, LON), sun)).toBeGreaterThan(0.99);
  });
  it('is half lit at first quarter, 2024-04-15 19:13 UTC (USNO)', () => {
    const date = new Date(Date.UTC(2024, 3, 15, 19, 13));
    const sun = sunDirection(sunPosition(date, LAT, LON));
    expect(moonIllumination(moonDirection(date, LAT, LON), sun)).toBeCloseTo(0.5, 1);
  });
});

describe('nightness', () => {
  it('is 0 in daylight, 1 by −12°, monotonic in between', () => {
    expect(nightness(10)).toBe(0);
    expect(nightness(-12)).toBe(1);
    expect(nightness(-5)).toBeGreaterThan(nightness(-2));
  });
});

describe('starColour', () => {
  it('is blue-white for hot stars and orange for cool ones', () => {
    const hot = starColour(25000);
    const cool = starColour(3500);
    expect(hot[2]).toBeGreaterThan(hot[0]);
    expect(cool[0]).toBeGreaterThan(cool[2]);
  });
});
