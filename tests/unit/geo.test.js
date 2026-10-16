import { describe, it, expect } from 'vitest';
import { latLonToTile, tileToLatLon, latLonToSimMeters, esriTileUrl, tilePlacement, TILE_HOST } from '../../src/geo.js';
import { DFW_ORIGIN_LAT, DFW_ORIGIN_LON } from '../../src/constants.js';

describe('slippy-map tiles', () => {
  it('puts KDFW in the expected zoom-13 tile', () => {
    // Independently: x = (lon+180)/360·2^13 = 1887.79, y = (1 - asinh(tan φ)/π)/2·2^13 = 3302.45.
    expect(latLonToTile(DFW_ORIGIN_LAT, DFW_ORIGIN_LON, 13)).toEqual({ x: 1887, y: 3302 });
  });
  it('tile corner round-trips back into the same tile', () => {
    const { x, y } = latLonToTile(32.78, -96.8, 13);
    const nw = tileToLatLon(x, y, 13);
    expect(latLonToTile(nw.lat - 1e-6, nw.lon + 1e-6, 13)).toEqual({ x, y });
  });
  it('builds Esri URLs in z/y/x order on the allowed host', () => {
    const url = esriTileUrl(13, 1887, 3302);
    expect(url.startsWith(TILE_HOST)).toBe(true);
    expect(url.endsWith('/tile/13/3302/1887')).toBe(true);
  });
});

describe('sim frame', () => {
  it('origin maps to (0, 0)', () => {
    const o = latLonToSimMeters(DFW_ORIGIN_LAT, DFW_ORIGIN_LON);
    expect(Math.abs(o.x)).toBe(0);
    expect(Math.abs(o.z)).toBe(0);
  });
  it('north is -Z and east is +X', () => {
    expect(latLonToSimMeters(DFW_ORIGIN_LAT + 0.01, DFW_ORIGIN_LON).z).toBeLessThan(0);
    expect(latLonToSimMeters(DFW_ORIGIN_LAT, DFW_ORIGIN_LON + 0.01).x).toBeGreaterThan(0);
  });
  it('0.01° of latitude is about 1.11 km', () => {
    expect(Math.abs(latLonToSimMeters(DFW_ORIGIN_LAT + 0.01, DFW_ORIGIN_LON).z)).toBeCloseTo(1113, -1);
  });
  it('zoom-13 tiles near DFW are roughly 4 km square', () => {
    const t = tilePlacement(1887, 3302, 13);
    expect(t.widthM).toBeGreaterThan(3500);
    expect(t.widthM).toBeLessThan(4500);
    expect(t.lengthM / t.widthM).toBeCloseTo(1, 1);
  });
});
