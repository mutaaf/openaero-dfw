import { describe, it, expect } from 'vitest';
import { geodeticToEcef, ecefToGeodetic, geoidN, ecefToSim, ecefToSimRigid } from '../../src/ecef.js';
import { latLonToSimMeters } from '../../src/geo.js';
import { REF_ELEV_M } from '../../src/terrain.js';
import { RUNWAY_DATA } from '../../src/airports.js';

const FT = 0.3048;
const apply = (m, p) => ({
  x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
  y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
  z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
});

describe('WGS84 conversions', () => {
  it('round-trip geodetic → ECEF → geodetic to well under a millimetre', () => {
    for (const [lat, lon, h] of [[32.8998, -97.0403, 157], [33.25, -96.55, 300], [0, 0, 0], [-45, 170, 8000]]) {
      const e = geodeticToEcef(lat, lon, h);
      const g = ecefToGeodetic(e.x, e.y, e.z);
      expect(g.lat).toBeCloseTo(lat, 9);
      expect(g.lon).toBeCloseTo(lon, 9);
      expect(g.h).toBeCloseTo(h, 3);
    }
  });
  it('matches a known ECEF point (equator, prime meridian)', () => {
    const e = geodeticToEcef(0, 0, 0);
    expect(e.x).toBeCloseTo(6378137, 3);
    expect(e.y).toBeCloseTo(0, 6);
    expect(e.z).toBeCloseTo(0, 6);
  });
});

describe('geoid', () => {
  it('is about −27 m over DFW, matching NOAA GEOID18 within 0.3 m', () => {
    expect(Math.abs(geoidN(32.8998, -97.0403) - -27.236)).toBeLessThan(0.3);
    expect(Math.abs(geoidN(32.97, -96.83) - -26.525)).toBeLessThan(0.3);
    expect(Math.abs(geoidN(33.0, -97.32) - -27.791)).toBeLessThan(0.3);
  });
});

describe('ECEF → sim', () => {
  it('puts every runway threshold exactly where the runways are drawn, at its surveyed height', () => {
    for (const r of RUNWAY_DATA) {
      for (const end of [r.le, r.he]) {
        const h = end.elevFt * FT + geoidN(end.lat, end.lon); // ellipsoidal height of the surveyed end
        const e = geodeticToEcef(end.lat, end.lon, h);
        const s = ecefToSim(e.x, e.y, e.z);
        const m = latLonToSimMeters(end.lat, end.lon);
        expect(s.x).toBeCloseTo(m.x, 3);
        expect(s.z).toBeCloseTo(m.z, 3);
        expect(s.y).toBeCloseTo(end.elevFt * FT - REF_ELEV_M, 3);
      }
    }
  });
  it('the rigid transform agrees at the origin and drifts with Earth curvature further out', () => {
    const m = ecefToSimRigid();
    const o = geodeticToEcef(32.8998, -97.0403, REF_ELEV_M + geoidN(32.8998, -97.0403));
    const p = apply(m, o);
    expect(Math.hypot(p.x, p.y, p.z)).toBeLessThan(0.01);
    // Alliance, ~30 km out: the tangent plane is ~70 m above the curved Earth there.
    const a = RUNWAY_DATA.find((r) => r.airport === 'KAFW').le;
    const ae = geodeticToEcef(a.lat, a.lon, a.elevFt * FT + geoidN(a.lat, a.lon));
    const rigid = apply(m, ae), exact = ecefToSim(ae.x, ae.y, ae.z);
    expect(exact.y - rigid.y).toBeGreaterThan(50);
    expect(Math.hypot(rigid.x - exact.x, rigid.z - exact.z)).toBeLessThan(200); // good enough for culling
  });
});
