import { describe, it, expect } from 'vitest';
import {
  parseMetar, windVector, gustFactor, runwayWindComponents, fogDensityForVisibility,
  scenarioWeather, metarAgeMinutes, flowForWind,
} from '../../src/weather.js';

const DFW = {
  icaoId: 'KDFW', obsTime: 1792183980, rawOb: 'METAR KDFW 162053Z 35023G32KT 10SM FEW050 BKN250 18/03 A3041',
  temp: 18.3, dewp: 2.8, wdir: 350, wspd: 23, wgst: 32, visib: '10+', altim: 1029.9,
  clouds: [{ cover: 'FEW', base: 5000 }, { cover: 'BKN', base: 25000 }], fltCat: 'VFR',
};

describe('parseMetar', () => {
  it('reads wind, gust, visibility, ceiling and altimeter', () => {
    const w = parseMetar(DFW);
    expect(w).toMatchObject({ icao: 'KDFW', windDirDeg: 350, windKts: 23, gustKts: 32, visibilitySm: 10, ceilingFt: 25000, live: true });
    expect(w.altimInHg).toBeCloseTo(30.41, 2);
  });
  it('handles calm, variable, fractional visibility and overcast ceilings', () => {
    const w = parseMetar({ ...DFW, wdir: 'VRB', wspd: 4, wgst: null, visib: '1 1/2', clouds: [{ cover: 'SCT', base: 800 }, { cover: 'OVC', base: 1200 }] });
    expect(w.windDirDeg).toBeNull();
    expect(w.gustKts).toBe(4);
    expect(w.visibilitySm).toBeCloseTo(1.5);
    expect(w.ceilingFt).toBe(1200);
    expect(parseMetar({ ...DFW, wdir: 0, wspd: 0, wgst: null }).windKts).toBe(0);
    expect(parseMetar({ ...DFW, visib: '1/4' }).visibilitySm).toBeCloseTo(0.25);
    expect(parseMetar({ ...DFW, clouds: [] }).ceilingFt).toBeNull();
  });
});

describe('windVector', () => {
  it('a north wind blows the air towards the south (+Z)', () => {
    const v = windVector(360, 10);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(10, 6);
  });
  it('a west wind (270) blows towards the east (+X)', () => {
    const v = windVector(270, 5);
    expect(v.x).toBeCloseTo(5, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });
  it('variable/calm is zero', () => {
    expect(windVector(null, 5)).toEqual({ x: 0, z: 0 });
  });
});

describe('gustFactor', () => {
  it('stays between steady and gust', () => {
    for (let t = 0; t < 120; t += 0.37) {
      const k = gustFactor(t, 20, 30);
      expect(k).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(k).toBeLessThanOrEqual(30 + 1e-9);
    }
  });
  it('without a gust it is steady', () => {
    expect(gustFactor(12.3, 15, null)).toBe(15);
  });
});

describe('runwayWindComponents', () => {
  it('straight down the runway is all headwind', () => {
    const c = runwayWindComponents(350, 20, 350);
    expect(c.headwindKts).toBeCloseTo(20);
    expect(c.crosswindKts).toBeCloseTo(0);
  });
  it('wind from the right is a positive crosswind', () => {
    const c = runwayWindComponents(90, 10, 360);
    expect(c.crosswindKts).toBeCloseTo(10);
    expect(c.headwindKts).toBeCloseTo(0);
  });
});

describe('fog and labels', () => {
  it('lower visibility means denser fog', () => {
    expect(fogDensityForVisibility(1)).toBeGreaterThan(fogDensityForVisibility(10));
  });
  it('scenario weather is labelled as not live', () => {
    expect(scenarioWeather().live).toBe(false);
  });
  it('METAR age in minutes', () => {
    expect(metarAgeMinutes(1000, 1000 + 12 * 60)).toBe(12);
  });
  it('DFW flows north in a north wind and south otherwise', () => {
    expect(flowForWind(350, 15)).toBe('NORTH');
    expect(flowForWind(170, 12)).toBe('SOUTH');
    expect(flowForWind(null, 2)).toBe('SOUTH');
  });
});
