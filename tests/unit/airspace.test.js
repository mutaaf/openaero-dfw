import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { latLonToSimMeters } from '../../src/geo.js';
import { prepareAirspace, shelfAt, airspaceStatus, shelfLabel, createAirspace, NOT_FOR_NAV } from '../../src/airspace.js';

// Ticket 0197: DFW's Class B on the moving map, baked from the FAA's Class Airspace layer.
const RAW = readFileSync(new URL('../../public/airspace/dfw-classb-v1.json', import.meta.url));
const DATA = JSON.parse(RAW);

// The FAA's attributes for "DALLAS CLASS B" (Class_Airspace layer, data of 2026-10-29), read off the
// layer's own query (LOWER_VAL/LOWER_CODE, UPPER_VAL; ft MSL): area -> [floor, ceiling]; 0 = SFC.
const FAA = [
  ['A', 0, 11000], ['A', 1500, 11000], ['B', 2000, 11000], ['C', 2000, 11000], ['D', 2000, 11000],
  ['E', 2500, 11000], ['F', 2500, 11000], ['G', 3000, 11000], ['H', 3000, 11000], ['I', 3000, 11000],
  ['J', 4000, 11000], ['K', 4000, 10000], ['L', 4000, 10000], ['M', 5000, 11000], ['N', 6000, 11000],
];

// Airport reference points (FAA 5010), lat/lon.
const AT = {
  KDFW: [32.8968, -97.0380], KDAL: [32.8471, -96.8518], KADS: [32.9686, -96.8364],
  KGKY: [32.6639, -97.0944], KAFW: [32.9876, -97.3189], KFTW: [32.8198, -97.3625],
};
const sim = (lat, lon) => latLonToSimMeters(lat, lon);

describe('baked Class B file (0197)', () => {
  it('is small, versioned and cites its source and date', () => {
    expect(gzipSync(RAW).length).toBeLessThan(30 * 1024);
    expect(DATA.v).toBe(1);
    expect(DATA.name).toBe('DALLAS CLASS B');
    expect(DATA.source).toMatch(/FAA/);
    expect(DATA.url).toMatch(/^https:\/\/services6\.arcgis\.com\/.*Class_Airspace\/FeatureServer\/0$/);
    expect(DATA.dataDate).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(DATA.note).toMatch(/not for navigation/i);
  });

  it('has every shelf with the floor and ceiling the FAA publishes', () => {
    expect(DATA.shelves.map((s) => [s.area, s.floorSfc ? 0 : s.floorFt, s.ceilFt])).toEqual(FAA);
    for (const s of DATA.shelves) {
      expect(s.floorSfc).toBe(s.floorFt === 0);
      expect(s.floorFt).toBeLessThan(s.ceilFt);
    }
  });

  it('keeps every polygon in the DFW area, closed, with its label inside the shelf', () => {
    const air = prepareAirspace(DATA);
    for (const s of DATA.shelves) {
      for (const r of s.rings) {
        expect(r.length).toBeGreaterThanOrEqual(8);
        for (let i = 0; i < r.length; i += 2) {
          expect(r[i]).toBeGreaterThan(-97.9); expect(r[i]).toBeLessThan(-96.2);
          expect(r[i + 1]).toBeGreaterThan(32.2); expect(r[i + 1]).toBeLessThan(33.6);
        }
      }
    }
    // Each label sits where the map shows that shelf (the lowest floor there).
    for (const s of air.shelves) expect(shelfAt(air, s.lx, s.lz)).toBe(s);
  });
});

describe('shelfAt / airspaceStatus', () => {
  const air = prepareAirspace(DATA);
  const at = (id) => { const p = sim(...AT[id]); return shelfAt(air, p.x, p.z); };

  it('puts DFW and Love Field in the surface area, Addison under the 2,500 ft shelf (Area F)', () => {
    expect(at('KDFW')).toMatchObject({ area: 'A', floorSfc: true, ceilFt: 11000 });
    expect(at('KDAL')).toMatchObject({ area: 'A', floorSfc: true });
    expect(at('KADS')).toMatchObject({ area: 'F', floorFt: 2500 });
    expect(at('KGKY')).toMatchObject({ area: 'G', floorFt: 3000 });
    expect(at('KAFW')).toMatchObject({ area: 'J', floorFt: 4000 });
    expect(at('KFTW')).toMatchObject({ area: 'J', floorFt: 4000 });
  });

  it('is null outside the Class B (45 NM north; Denton, 25 NM out, is under J)', () => {
    const p = sim(33.65, -97.04);
    expect(shelfAt(air, ...Object.values(sim(33.2007, -97.198)))).toMatchObject({ area: 'J' });
    expect(shelfAt(air, p.x, p.z)).toBeNull();
  });

  it('says where the airplane is in plain words', () => {
    const f = at('KADS');
    expect(airspaceStatus(f, 1800)).toBe('UNDER CLASS B: FLOOR 2,500');
    expect(airspaceStatus(f, 3000)).toBe('IN CLASS B (2,500-11,000)');
    expect(airspaceStatus(f, 11500)).toBe('ABOVE CLASS B (TOP 11,000)');
    expect(airspaceStatus(at('KDFW'), 700)).toBe('IN CLASS B (SFC-11,000)');
    expect(airspaceStatus(null, 2000)).toBe('OUTSIDE CLASS B');
  });

  it('labels a shelf the way the chart does: ceiling/floor in hundreds of feet', () => {
    expect(shelfLabel({ ceilFt: 11000, floorFt: 0, floorSfc: true })).toBe('110/SFC');
    expect(shelfLabel({ ceilFt: 10000, floorFt: 4000, floorSfc: false })).toBe('100/40');
  });
});

describe('createAirspace draw', () => {
  function fakeCtx(w, h) {
    const texts = [];
    let strokes = 0;
    const noop = () => {};
    return {
      canvas: { width: w, height: h }, texts, get strokes() { return strokes; },
      beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop,
      stroke: () => { strokes++; }, fillText: (t) => texts.push(t),
    };
  }

  it('draws the shelves around DFW, the status and the not-for-navigation note', () => {
    const layer = createAirspace(DATA);
    const ctx = fakeCtx(240, 144);
    const p = sim(...AT.KDFW);
    layer.draw(ctx, 120, 72, 0.007, { x: p.x, z: p.z }, 1200);
    expect(ctx.strokes).toBeGreaterThan(0);
    expect(layer.state.drawn).toBe(ctx.strokes);
    expect(ctx.texts).toContain(NOT_FOR_NAV);
    expect(ctx.texts).toContain('IN CLASS B (SFC-11,000)');
    expect(layer.state).toMatchObject({ area: 'A', status: 'IN CLASS B (SFC-11,000)', note: NOT_FOR_NAV, frames: 1 });
  });

  it('draws nothing but the note far outside it', () => {
    const layer = createAirspace(DATA);
    const ctx = fakeCtx(240, 144);
    layer.draw(ctx, 120, 72, 0.007, { x: 300000, z: 0 }, 3000);
    expect(ctx.strokes).toBe(0);
    expect(ctx.texts).toEqual(['OUTSIDE CLASS B', NOT_FOR_NAV]);
  });

  it('refuses a file of another version', () => {
    expect(() => prepareAirspace({ v: 2, shelves: [] })).toThrow(/version/);
  });
});
