// A flat-sided prism from a convex 2D outline (the primitive 737's wing and fin): the outline
// in the XY plane, extruded from z0 to z1. It stands in for three's ExtrudeGeometry, which
// pulls earcut and every curve class into the boot chunk (ticket 0105, ~3 kB gz).
import { BufferGeometry, Float32BufferAttribute } from 'three';

// pts: [[x, y], ...] in order around a convex outline (either winding). Non-indexed, so each
// face keeps its own flat normal.
export function prismGeometry(pts, z0, z1) {
  const n = pts.length, pos = [];
  const area = pts.reduce((s, [x, y], i) => s + x * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * y, 0);
  const p = area > 0 ? pts : [...pts].reverse(); // counter-clockwise seen from +Z
  const v = (i, z) => pos.push(p[i % n][0], p[i % n][1], z);
  for (let i = 1; i < n - 1; i++) {
    v(0, z1); v(i, z1); v(i + 1, z1); // the +Z cap
    v(0, z0); v(i + 1, z0); v(i, z0); // the -Z cap
  }
  for (let i = 0; i < n; i++) { // the sides, outward
    v(i, z0); v(i + 1, z0); v(i + 1, z1);
    v(i, z0); v(i + 1, z1); v(i, z1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
