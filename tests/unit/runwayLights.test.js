import { describe, it, expect } from 'vitest';
import { layoutRunwayLights, LIGHT } from '../../src/runwayLights.js';
import { RUNWAYS_GEOM, runwayEndById, runwayEnd, courseVector } from '../../src/airports.js';

const FT = 0.3048;
const lights = layoutRunwayLights(RUNWAYS_GEOM, runwayEndById);
// Distance before the threshold along the approach (positive = out on final), and offset.
function onApproach(end, L) {
  const c = courseVector(end.hdgT);
  const dx = L.x - end.thrX, dz = L.z - end.thrZ;
  return { before: -(dx * c.x + dz * c.z), cross: dx * c.z - dz * c.x };
}

describe('runway lights (ticket 0011)', () => {
  const e35c = runwayEnd('KDFW', '35C');
  const final35c = lights.map((L) => ({ L, ...onApproach(e35c, L) })).filter((p) => Math.abs(p.cross) < 25);

  it('lights KDFW 35C with a 2,400 ft approach system on the extended centreline', () => {
    const appr = final35c.filter((p) => p.L.kind === LIGHT.approach && p.before > 0);
    expect(Math.max(...appr.map((p) => p.before))).toBeCloseTo(2400 * FT, 0);
    expect(appr.every((p) => p.L.dirX * courseVector(e35c.hdgT).x + p.L.dirZ * courseVector(e35c.hdgT).z < -0.99)).toBe(true);
  });

  it('runs the flashers outside-in towards the threshold', () => {
    const fl = final35c.filter((p) => p.L.kind === LIGHT.flasher && p.before > 0).sort((a, b) => b.before - a.before);
    expect(fl.length).toBeGreaterThan(8);
    for (let i = 1; i < fl.length; i++) expect(fl[i].L.phase).toBeGreaterThan(fl[i - 1].L.phase);
  });

  it('puts a green threshold bar across the full width, facing the approach', () => {
    const green = final35c.filter((p) => p.L.kind === LIGHT.threshold && Math.abs(p.before) < 1);
    expect(green.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...green.map((p) => Math.abs(p.cross)))).toBeCloseTo(e35c.widthM / 2, 0);
  });

  it('edges every runway at about 200 ft spacing', () => {
    const edges = lights.filter((L) => L.kind === LIGHT.edge).length;
    const expected = RUNWAYS_GEOM.reduce((n, r) => n + 2 * (Math.round(r.lengthM / (200 * FT)) + 1), 0);
    expect(edges).toBe(expected);
  });

  it('gives the short GA fields a MALSR, not an ALSF', () => {
    const e = runwayEnd('KFTW', '35');
    const far = lights.filter((L) => L.kind === LIGHT.approach).map((L) => onApproach(e, L))
      .filter((p) => Math.abs(p.cross) < 10 && p.before > 0 && p.before < 1000);
    expect(Math.max(...far.map((p) => p.before))).toBeCloseTo(1400 * FT, 0);
  });
});
