import { describe, it, expect } from 'vitest';
import { RUNWAY_DATA, runwayFactsText, RUNWAY_ENDS, RUNWAYS_GEOM, runwayEnd, approachGeometry, selectActiveRunway, approachSpawn, GLIDE_DEG, AIM_POINT_M } from '../../src/airports.js';
import { latLonToSimMeters } from '../../src/geo.js';
import { MAG_VAR_DEG } from '../../src/magvar.js';

describe('runway data (OurAirports)', () => {
  it('has every runway at the six DFW-area fields', () => {
    const count = (a) => RUNWAY_DATA.filter((r) => r.airport === a).length;
    expect(count('KDFW')).toBe(7);
    expect(count('KDAL')).toBe(2);
    expect(count('KAFW')).toBe(2);
    expect(count('KADS')).toBe(1);
    expect(count('KGKY')).toBe(1);
    expect(count('KFTW')).toBe(2);
    expect(RUNWAY_ENDS.length).toBe(30);
  });
  it('KDFW 35C threshold lands within 5 m of its surveyed position', () => {
    const e = runwayEnd('KDFW', '35C');
    const p = latLonToSimMeters(32.87889862, -97.02619934);
    expect(Math.hypot(e.thrX - p.x, e.thrZ - p.z)).toBeLessThan(5);
    // ~1.3 km east of the old hand-placed x=0 runway.
    expect(e.thrX).toBeGreaterThan(1200);
    expect(e.thrX).toBeLessThan(1400);
  });
  it('KDAL is ~17 km east and slightly south of the KDFW reference point', () => {
    const e = runwayEnd('KDAL', '31R');
    expect(e.thrX).toBeGreaterThan(16000);
    expect(e.thrX).toBeLessThan(19000);
    expect(e.thrZ).toBeGreaterThan(0); // 32.84°N is south of 32.8998°N; north is -Z
  });
  it('displaced thresholds move the landing threshold down the runway', () => {
    const end = runwayEnd('KDFW', '13L'); // 625 ft displaced
    const physical = latLonToSimMeters(32.912601, -97.0215);
    const moved = Math.hypot(end.thrX - physical.x, end.thrZ - physical.z);
    expect(moved).toBeGreaterThan(185);
    expect(moved).toBeLessThan(196);
  });
  it('runway geometry length matches the published length', () => {
    const g = RUNWAYS_GEOM.find((r) => r.name === 'KDFW 17C/35C');
    expect(g.lengthM).toBeGreaterThan(4060);
    expect(g.lengthM).toBeLessThan(4110);
  });
});

describe('approachGeometry', () => {
  const e = runwayEnd('KDFW', '35C');
  it('a point on the extended centreline at 3° is on path with zero cross-track', () => {
    const dist = 4 * 1852;
    const h = (dist + AIM_POINT_M) * Math.tan(GLIDE_DEG * Math.PI / 180);
    const rad = e.hdgT * Math.PI / 180;
    const p = { x: e.thrX - Math.sin(rad) * dist, y: e.thrY + h, z: e.thrZ + Math.cos(rad) * dist };
    const g = approachGeometry(e, p);
    expect(g.distM).toBeCloseTo(dist, 0);
    expect(Math.abs(g.crossM)).toBeLessThan(0.5);
    expect(Math.abs(g.heightAbovePathM)).toBeLessThan(0.5);
  });
  it('right of centreline is positive cross-track', () => {
    // 35C lands north; east of the centreline is right.
    const p = { x: e.thrX + 100, y: 300, z: e.thrZ + 5000 };
    expect(approachGeometry(e, p).crossM).toBeGreaterThan(90);
  });
});

describe('selectActiveRunway', () => {
  it('picks the runway end you are lined up on', () => {
    const e = runwayEnd('KDAL', '31R');
    const s = approachSpawn(e, 4);
    const picked = selectActiveRunway(RUNWAY_ENDS, s.pos, e.hdgT, null);
    expect(picked.id).toBe(e.id);
  });
  it('prefers the parallel runway you are lined up on over a nearer threshold', () => {
    for (const [a, b] of [['KDAL', '31L'], ['KDFW', '35L'], ['KDFW', '36R']]) {
      const e = runwayEnd(a, b);
      expect(selectActiveRunway(RUNWAY_ENDS, approachSpawn(e, 6).pos, e.hdgT, null).id).toBe(e.id);
    }
  });
  it('keeps the current choice when nothing is ahead', () => {
    const cur = runwayEnd('KDFW', '35C');
    const picked = selectActiveRunway(RUNWAY_ENDS, { x: 90000, y: 3000, z: 90000 }, 45, cur);
    expect(picked).toBe(cur);
  });
});

describe('approachSpawn', () => {
  it('spawns on path, aligned, descending at the 3° rate', () => {
    const e = runwayEnd('KDFW', '17C');
    const s = approachSpawn(e, 4, 72);
    const g = approachGeometry(e, s.pos);
    expect(g.distM).toBeCloseTo(4 * 1852, 0);
    expect(Math.abs(g.heightAbovePathM)).toBeLessThan(0.5);
    expect(s.vel.y).toBeLessThan(0);
    expect(Math.abs(Math.atan2(-s.vel.y, Math.hypot(s.vel.x, s.vel.z)) * 180 / Math.PI - 3)).toBeLessThan(0.05);
    expect(s.yawRad).toBeCloseTo(-e.hdgT * Math.PI / 180, 6);
  });
});

import { MISSIONS } from '../../src/missions.js';
describe('missions', () => {
  it('every approach/takeoff mission names a real runway end', () => {
    for (const m of MISSIONS.filter((x) => x.kind === 'final' || x.kind === 'takeoff')) {
      expect(runwayEnd(m.airport, m.rwy), m.key).not.toBeNull();
    }
  });
  it('keeps the original mission keys', () => {
    const keys = MISSIONS.map((m) => m.key);
    for (const k of ['kdfw_35c_final', 'kdfw_takeoff', 'kdfw_17c_final', 'kdal_31r_final', 'downtown_skyline', 'att_stadium']) {
      expect(keys).toContain(k);
    }
  });
});

describe('real field elevations', () => {
  const FT = 0.3048;
  it('thresholds sit at their surveyed height relative to KDFW (606 ft = y 0)', () => {
    expect(runwayEnd('KDFW', '35C').thrY).toBeCloseTo((562 - 606) * FT, 1);
    expect(runwayEnd('KDAL', '31L').thrY).toBeCloseTo((476 - 606) * FT, 1);
    expect(runwayEnd('KAFW', '16L').thrY).toBeCloseTo((723 - 606) * FT, 1);
  });
  it('a displaced threshold is on the runway plane between the two ends', () => {
    // KDAL 13R: 476 ft at both ends, so the 490 ft displacement keeps it at 476 ft.
    expect(runwayEnd('KDAL', '13R').thrY).toBeCloseTo((476 - 606) * FT, 1);
    // KDFW 13L: 550 ft → 508 ft over 9000 ft, displaced 625 ft → 550 − 42·625/9000.
    expect(runwayEnd('KDFW', '13L').thrY).toBeCloseTo((550 - 42 * 625 / 9000 - 606) * FT, 1);
  });
  it('an approach spawn is on the 3° path above its own threshold', () => {
    const e = runwayEnd('KAFW', '34L');
    const s = approachSpawn(e, 3);
    expect(approachGeometry(e, s.pos).heightAbovePathM).toBeCloseTo(0, 3);
    expect(s.pos.y - e.thrY).toBeCloseTo((3 * 1852 + AIM_POINT_M) * Math.tan(3 * Math.PI / 180), 3);
  });
  it('runway geometry carries both surveyed end heights', () => {
    const r = RUNWAYS_GEOM.find((g) => g.name === 'KDFW 13L/31R');
    expect(r.ay).toBeCloseTo((550 - 606) * FT, 3);
    expect(r.by).toBeCloseTo((508 - 606) * FT, 3);
  });
});

// Ticket 0114: the line a pilot checks against the chart (OurAirports survey data).
describe('runwayFactsText', () => {
  it('KDFW 35C: ident, magnetic heading, 13,400 x 150 ft, threshold elevation', () => {
    const e = runwayEnd('KDFW', '35C');
    // OurAirports (and the FAA chart) list 17C/35C as 13,400 x 150 ft; 17R/35L is the 200 ft one.
    expect(runwayFactsText(e)).toBe('RWY 35C: 13,400 × 150 ft · 358°M · THR 562 ft');
    // The course flown down the final to the threshold (sim frame: +X east, -Z north), less magvar.
    const p = approachSpawn(e, 5).pos;
    expect(Math.abs(approachGeometry(e, p).crossM)).toBeLessThan(0.01);
    const course = (Math.atan2(e.thrX - p.x, -(e.thrZ - p.z)) * 180 / Math.PI + 360) % 360;
    const magCourse = (course - MAG_VAR_DEG + 360) % 360;
    expect(Math.abs(358 - magCourse)).toBeLessThan(1);
  });
  it('reads back every runway end: length, width and threshold elevation from the survey', () => {
    for (const rwy of RUNWAY_DATA) {
      for (const [end, other] of [[rwy.le, rwy.he], [rwy.he, rwy.le]]) {
        const text = runwayFactsText(runwayEnd(rwy.airport, end.ident));
        const m = text.match(/^RWY (\w+): ([\d,]+) × ([\d,]+) ft · (\d{3})°M · THR ([\d,]+) ft$/);
        expect(m, text).not.toBeNull();
        expect(m[1]).toBe(end.ident);
        expect(Number(m[2].replace(/,/g, ''))).toBe(rwy.lengthFt);
        expect(Number(m[3].replace(/,/g, ''))).toBe(rwy.widthFt);
        // The landing threshold: down the runway's slope by any displacement.
        const thr = end.elevFt + (other.elevFt - end.elevFt) * end.displacedFt / rwy.lengthFt;
        expect(Number(m[5].replace(/,/g, ''))).toBe(Math.round(thr));
        // The runway number is the magnetic heading in tens of degrees (±1 for the old charts).
        const num = Number(end.ident.replace(/\D/g, '')) * 10;
        const dh = ((Number(m[4]) - num + 540) % 360) - 180;
        expect(Math.abs(dh)).toBeLessThanOrEqual(10);
      }
    }
  });
  it('no runway, no line', () => {
    expect(runwayFactsText(null)).toBe('');
  });
});
