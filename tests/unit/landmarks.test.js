import { describe, it, expect } from 'vitest';
import { LANDMARKS, landmarkPos, DOWNTOWN_DALLAS, ATT_STADIUM } from '../../src/landmarks.js';
import { latLonToSimMeters } from '../../src/geo.js';
import { DFW_ORIGIN_LAT, DFW_ORIGIN_LON } from '../../src/constants.js';
import { missionByKey } from '../../src/missions.js';

// Independent check: great-circle distance and bearing from the KDFW origin (haversine).
function haversine(lat, lon) {
  const R = 6371008.8, d = Math.PI / 180;
  const p1 = DFW_ORIGIN_LAT * d, p2 = lat * d, dp = p2 - p1, dl = (lon - DFW_ORIGIN_LON) * d;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const dist = 2 * R * Math.asin(Math.sqrt(a));
  const brg = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
  return { dist, brg };
}

describe('landmarks at their true coordinates', () => {
  for (const [key, l] of Object.entries(LANDMARKS)) {
    it(`${l.name}: sim position matches its lat/lon within 10 m`, () => {
      const p = landmarkPos(key);
      const g = latLonToSimMeters(l.lat, l.lon);
      expect(Math.hypot(p.x - g.x, p.z - g.z)).toBeLessThan(10);
      // And against a geo.js-independent haversine fix (+X east, -Z north).
      const h = haversine(l.lat, l.lon);
      const truth = { x: h.dist * Math.sin(h.brg), z: -h.dist * Math.cos(h.brg) };
      expect(Math.hypot(p.x - truth.x, p.z - truth.z)).toBeLessThan(10 + h.dist * 0.002);
    });
    it(`${l.name}: cites a public source and a real height`, () => {
      expect(l.source).toMatch(/^https:\/\//);
      expect(l.heightM).toBeGreaterThan(50);
      expect(l.heightM).toBeLessThan(300);
    });
  }

  it('downtown Dallas is ~22 km east and ~13 km south of KDFW, not the old hand-placed spot', () => {
    expect(DOWNTOWN_DALLAS.x).toBeGreaterThan(21000);
    expect(DOWNTOWN_DALLAS.x).toBeLessThan(23000);
    expect(DOWNTOWN_DALLAS.z).toBeGreaterThan(12500);
    expect(DOWNTOWN_DALLAS.z).toBeLessThan(14000);
    expect(Math.hypot(DOWNTOWN_DALLAS.x - 17600, DOWNTOWN_DALLAS.z - 9800)).toBeGreaterThan(4000);
  });

  // Bearing from a tour spawn to its landmark, relative to the spawn heading.
  const offNose = (m, t) => {
    const brg = Math.atan2(t.x - m.pos[0], -(t.z - m.pos[2])) * 180 / Math.PI;
    return ((brg - m.hdg + 540) % 360) - 180;
  };
  it('the skyline tour spawns a few km out with downtown dead ahead', () => {
    const m = missionByKey('downtown_skyline');
    expect(Math.abs(offNose(m, DOWNTOWN_DALLAS))).toBeLessThan(15);
    const d = Math.hypot(m.pos[0] - DOWNTOWN_DALLAS.x, m.pos[2] - DOWNTOWN_DALLAS.z);
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(6000);
  });
  it('the AT&T tour spawns a few km out with the stadium dead ahead', () => {
    const m = missionByKey('att_stadium');
    expect(Math.abs(offNose(m, ATT_STADIUM))).toBeLessThan(15);
    const d = Math.hypot(m.pos[0] - ATT_STADIUM.x, m.pos[2] - ATT_STADIUM.z);
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(6000);
  });
});
