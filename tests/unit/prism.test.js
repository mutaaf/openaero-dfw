import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { prismGeometry } from '../../src/prism.js';

// The primitive 737's wing outline (main.js buildAircraft) and the fin's, both windings.
const WING = [[0, -3.2], [-17.5, 2.5], [-17.5, 4.0], [0, 1.2]];
const FIN = [[0, 0], [0, 6.8], [2.8, 6.5], [5.2, 0]];

// Each triangle's centroid and its (unnormalised) face normal from the vertex order.
function faces(g) {
  const p = g.getAttribute('position'), out = [];
  for (let i = 0; i < p.count; i += 3) {
    const a = new Vector3().fromBufferAttribute(p, i), b = new Vector3().fromBufferAttribute(p, i + 1), c = new Vector3().fromBufferAttribute(p, i + 2);
    out.push({ c: a.clone().add(b).add(c).divideScalar(3), n: b.clone().sub(a).cross(c.clone().sub(a)) });
  }
  return out;
}

describe('prismGeometry (0105: the 737 fallback without ExtrudeGeometry)', () => {
  for (const [name, pts] of [['wing', WING], ['fin', FIN], ['wing reversed', [...WING].reverse()]]) {
    it(`${name}: two caps and the sides, every face pointing out of the solid`, () => {
      const g = prismGeometry(pts, -0.08, 0.43);
      const f = faces(g);
      expect(f.length).toBe(2 * (pts.length - 2) + 2 * pts.length);
      g.computeBoundingBox();
      const centre = g.boundingBox.getCenter(new Vector3());
      for (const { c, n } of f) {
        expect(n.length()).toBeGreaterThan(0); // no degenerate triangles
        expect(n.dot(c.clone().sub(centre))).toBeGreaterThan(0); // convex: outward = away from the centre
      }
    });
  }

  it('spans the outline and the thickness exactly', () => {
    const g = prismGeometry(WING, -0.08, 0.43);
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    expect([min.x, min.y, min.z]).toEqual([-17.5, expect.closeTo(-3.2, 6), expect.closeTo(-0.08, 6)]);
    expect([max.x, max.y, max.z]).toEqual([0, 4, expect.closeTo(0.43, 6)]);
    expect(g.getAttribute('normal').count).toBe(g.getAttribute('position').count);
  });
});
