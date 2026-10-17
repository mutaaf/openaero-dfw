import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  REF_ELEV_M, DEM_GRID, DEM_BASE_M, demPredict, decodeDem, sampleDem, createGround,
  mslToY, ftMslToY, yToFtMsl, PAD_HALF_WIDTH_M, PAD_OVERRUN_M, PAD_FEATHER_M,
} from '../../src/terrain.js';
import { RUNWAY_DATA, RUNWAYS_GEOM, runwayEnd } from '../../src/airports.js';
import { latLonToSimMeters } from '../../src/geo.js';

const FT = 0.3048;

describe('height reference', () => {
  it('y 0 is KDFW field elevation (606 ft MSL)', () => {
    expect(REF_ELEV_M).toBeCloseTo(606 * FT, 3);
    expect(ftMslToY(606)).toBeCloseTo(0, 6);
    expect(mslToY(REF_ELEV_M + 10)).toBeCloseTo(10, 6);
    expect(yToFtMsl(ftMslToY(1234))).toBeCloseTo(1234, 6);
  });
});

describe('DEM codec', () => {
  const grid = { x0: 0, z0: 0, step: 10, cols: 4, rows: 3 };
  const metres = [190, 191, 193, 196, 189, 190, 192, 195, 188, 190, 193, 197];
  const encode = (m) => {
    const q = Int16Array.from(m, (v) => v - DEM_BASE_M);
    return new Uint8Array(Int8Array.from(q, (v, i) => v - demPredict(q, i, grid.cols)).buffer);
  };
  it('round-trips through the planar predictor', () => {
    const y = decodeDem(encode(metres), grid);
    expect(Array.from(y, (v) => Math.round(v + REF_ELEV_M))).toEqual(metres);
  });
  it('rejects a file of the wrong size', () => {
    expect(() => decodeDem(new Uint8Array(5), grid)).toThrow(/expected 12 bytes/);
  });
  it('samples bilinearly and clamps outside the grid', () => {
    const y = decodeDem(encode(metres), grid);
    const at = (x, z) => sampleDem(y, x, z, grid) + REF_ELEV_M;
    expect(at(0, 0)).toBeCloseTo(190, 4);
    expect(at(5, 0)).toBeCloseTo(190.5, 4);
    expect(at(5, 5)).toBeCloseTo((190 + 191 + 189 + 190) / 4, 4);
    expect(at(-500, -500)).toBeCloseTo(190, 4);
    expect(at(1e6, 1e6)).toBeCloseTo(197, 1);
  });
});

describe('baked DFW DEM', () => {
  const bytes = gunzipSync(readFileSync('public/terrain/dfw-dem-v1.bin'));
  const dem = decodeDem(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const mslFt = (lat, lon) => {
    const p = latLonToSimMeters(lat, lon);
    return (sampleDem(dem, p.x, p.z) + REF_ELEV_M) / FT;
  };
  it('covers the whole grid', () => {
    expect(dem.length).toBe(DEM_GRID.cols * DEM_GRID.rows);
  });
  it('agrees with the surveyed elevation of all 30 runway ends (mean < 15 ft, max < 40 ft)', () => {
    // Bare-earth DEM vs OurAirports end elevations; ends are graded, so a few feet off is real.
    const diffs = RUNWAY_DATA.flatMap((r) => [r.le, r.he]).map((e) => Math.abs(mslFt(e.lat, e.lon) - e.elevFt));
    expect(diffs).toHaveLength(30);
    expect(diffs.reduce((a, b) => a + b, 0) / diffs.length).toBeLessThan(15);
    expect(Math.max(...diffs)).toBeLessThan(40);
  });
  it('has the Trinity river bottom below downtown Dallas', () => {
    expect(mslFt(32.7767, -96.8180)).toBeLessThan(mslFt(32.7800, -96.8000)); // floodway < downtown
  });
});

describe('ground model', () => {
  const ground = createGround(RUNWAYS_GEOM);
  const flat = new Float32Array(DEM_GRID.cols * DEM_GRID.rows).fill(25); // natural terrain at y 25
  ground.setDem(flat);
  const r = RUNWAYS_GEOM.find((g) => g.name === 'KGKY 16/34'); // a lone runway: no neighbour pads
  const along = (t, lateral = 0) => {
    const ux = (r.bx - r.ax), uz = (r.bz - r.az);
    const len = Math.hypot(ux, uz);
    return { x: r.ax + ux * t + (-uz / len) * lateral, z: r.az + uz * t + (ux / len) * lateral };
  };
  it('is the runway plane on the runway (slope between the surveyed ends)', () => {
    const p = along(0.5);
    expect(ground.heightAt(p.x, p.z)).toBeCloseTo((r.ay + r.by) / 2, 3);
    const t = runwayEnd('KGKY', '16');
    expect(ground.heightAt(t.thrX, t.thrZ)).toBeCloseTo(t.thrY, 1);
  });
  it('stays flat across the graded pad, then blends smoothly into the terrain', () => {
    const p = along(0.5, PAD_HALF_WIDTH_M - 1);
    expect(ground.heightAt(p.x, p.z)).toBeCloseTo((r.ay + r.by) / 2, 3);
    const far = along(0.5, PAD_HALF_WIDTH_M + PAD_FEATHER_M + 5);
    expect(ground.heightAt(far.x, far.z)).toBeCloseTo(25, 3);
    let prev = ground.heightAt(p.x, p.z);
    for (let d = PAD_HALF_WIDTH_M; d <= PAD_HALF_WIDTH_M + PAD_FEATHER_M; d += 20) {
      const q = along(0.5, d);
      const h = ground.heightAt(q.x, q.z);
      expect(Math.abs(h - prev)).toBeLessThan(1.5); // no cliff at the pad edge
      prev = h;
    }
  });
  it('extends the pad past the runway ends for the overrun', () => {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
    const p = along(1 + (PAD_OVERRUN_M - 10) / len);
    expect(ground.heightAt(p.x, p.z)).toBeCloseTo(r.by, 3);
  });
  it('works before the DEM arrives: runways real, elsewhere y 0', () => {
    const g = createGround(RUNWAYS_GEOM);
    expect(g.hasDem()).toBe(false);
    const p = along(0.5);
    expect(g.heightAt(p.x, p.z)).toBeCloseTo((r.ay + r.by) / 2, 3);
    expect(g.heightAt(40000, 40000)).toBe(0);
  });
});
