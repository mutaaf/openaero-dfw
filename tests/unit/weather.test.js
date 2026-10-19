import { describe, it, expect } from 'vitest';
import {
  parseMetar, windVector, gustFactor, runwayWindComponents, fogDensityForVisibility,
  scenarioWeather, metarAgeMinutes, flowForWind, pickCrosswindRunway, cloudLayers,
} from '../../src/weather.js';
import { RUNWAY_ENDS } from '../../src/airports.js';
import { crosswindMission, missionByKey } from '../../src/missions.js';

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

describe('pickCrosswindRunway (today\'s crosswind challenge)', () => {
  const live = (icao, wdir, wspd) => parseMetar({ ...DFW, icaoId: icao, wdir, wspd, wgst: null });
  it('KDFW 27015KT picks a 17/18 or 35/36 end with ~15 kt crosswind and no tailwind', () => {
    const p = pickCrosswindRunway({ KDFW: live('KDFW', 270, 15) }, RUNWAY_ENDS);
    expect(p.end.airport).toBe('KDFW');
    expect(p.end.ident).toMatch(/^(17|18|35|36)/);
    expect(Math.abs(p.crosswindKts)).toBeCloseTo(15, 0);
    expect(p.headwindKts).toBeGreaterThanOrEqual(0);
    // Ties on the whole knot go to the longest runway: 18L (13,401 ft).
    expect(p.end.ident).toBe('18L');
    expect(p.crosswindKts).toBeGreaterThan(0); // heading south, a west wind is from the right
  });
  it('never picks a tailwind end and compares fields', () => {
    // KDFW 36010 is all headwind on 35/36; KDAL 22012 is ~11.9 kt across 13/31 from the right on 13L/13R.
    const p = pickCrosswindRunway({ KDFW: live('KDFW', 360, 10), KDAL: live('KDAL', 220, 12) }, RUNWAY_ENDS);
    expect(p.end.airport).toBe('KDAL');
    expect(['13L', '13R']).toContain(p.end.ident);
    expect(p.end.ident).toBe('13R'); // 8,800 ft beats 7,752 ft at the same 12 kt
    expect(p.headwindKts).toBeGreaterThanOrEqual(0);
  });
  it('with no live METARs (or calm/variable wind) nothing is offered', () => {
    expect(pickCrosswindRunway({}, RUNWAY_ENDS)).toBeNull();
    expect(pickCrosswindRunway({ KDFW: scenarioWeather() }, RUNWAY_ENDS)).toBeNull();
    expect(pickCrosswindRunway({ KDFW: live('KDFW', 'VRB', 5) }, RUNWAY_ENDS)).toBeNull();
    expect(pickCrosswindRunway({ KDFW: live('KDFW', 0, 0) }, RUNWAY_ENDS)).toBeNull();
    expect(crosswindMission(null)).toBeNull();
  });
  it('skips a tailwind end even when its crosswind is bigger, and stale observations', () => {
    const ends = [
      { airport: 'KXXX', ident: 'A', hdgT: 0, lengthM: 2000 },   // wind 120/20: 17.3 kt XW, 10 kt tailwind
      { airport: 'KXXX', ident: 'B', hdgT: 150, lengthM: 2000 }, // 10 kt XW from the left, 17.3 kt headwind
      { airport: 'KXXX', ident: 'C', hdgT: 330, lengthM: 3000 }, // same 10 kt XW, tailwind
    ];
    const wx = live('KXXX', 120, 20);
    const p = pickCrosswindRunway({ KXXX: wx }, ends);
    expect(p.end.ident).toBe('B');
    expect(p.crosswindKts).toBeCloseTo(-10, 6);
    const tie = [{ ...ends[1], ident: 'B1', lengthM: 1500 }, { ...ends[1], ident: 'B2', lengthM: 2500 }];
    expect(pickCrosswindRunway({ KXXX: wx }, tie).end.ident).toBe('B2');
    expect(pickCrosswindRunway({ KXXX: wx }, ends, wx.obsTime + 60 * 60).end.ident).toBe('B');
    expect(pickCrosswindRunway({ KXXX: wx }, ends, wx.obsTime + 120 * 60)).toBeNull();
  });
  it('the mission is a 4 NM final labelled with the runway and crosswind', () => {
    const m = crosswindMission(pickCrosswindRunway({ KDFW: live('KDFW', 270, 15) }, RUNWAY_ENDS));
    expect(m).toMatchObject({ key: 'crosswind_today', kind: 'final', airport: 'KDFW', rwy: '18L', distNm: 4 });
    expect(m.label).toBe("Today's crosswind: KDFW 18L, 15 kt from the right");
    expect(missionByKey('crosswind_today', [m])).toBe(m);
    expect(missionByKey('crosswind_today').key).toBe('kdfw_35c_final');
  });
});

describe('cloudLayers (sky dome clouds)', () => {
  it('keeps every reported layer up to FL200, lowest first, with its coverage', () => {
    const l = cloudLayers([{ cover: 'BKN', base: 9000 }, { cover: 'FEW', base: 3500 }, { cover: 'OVC', base: 25000 }, { cover: 'CLR' }]);
    expect(l.map((c) => c.baseFt)).toEqual([3500, 9000]);
    expect(l[0].coverage).toBeLessThan(l[1].coverage);
  });
  it('is empty for a clear sky and drawn for the offline scenario (FEW050)', () => {
    expect(cloudLayers(undefined)).toEqual([]);
    expect(scenarioWeather().cloudLayers).toEqual([{ cover: 'FEW', baseFt: 5000, coverage: 0.2 }]);
  });
});
