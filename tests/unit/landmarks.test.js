import { describe, it, expect } from 'vitest';
import { LANDMARKS, landmarkPos, DOWNTOWN_DALLAS, ATT_STADIUM } from '../../src/landmarks.js';
import { latLonToTile, tilePlacement } from '../../src/geo.js';
import { missionByKey } from '../../src/missions.js';

// Where the landmark is in the Esri imagery: its fractional Web Mercator position inside the
// zoom-18 tile (~250 m) that contains it, laid out where geo.js puts that tile in the world.
function inImagery(lat, lon, z = 18) {
  const n = 2 ** z, r = lat * Math.PI / 180;
  const fx = (lon + 180) / 360 * n, fy = (1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n;
  const { x, y } = latLonToTile(lat, lon, z);
  const t = tilePlacement(x, y, z);
  return { x: t.posX - t.widthM / 2 + (fx - x) * t.widthM, z: t.posZ - t.lengthM / 2 + (fy - y) * t.lengthM };
}

describe('landmarks at their true coordinates', () => {
  for (const [key, l] of Object.entries(LANDMARKS)) {
    it(`${l.name}: sim position lands on its lat/lon in the imagery within 10 m`, () => {
      const p = landmarkPos(key);
      const img = inImagery(l.lat, l.lon);
      expect(Math.hypot(p.x - img.x, p.z - img.z)).toBeLessThan(10);
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
