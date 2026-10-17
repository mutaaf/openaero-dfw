import { describe, it, expect } from 'vitest';
import {
  rootTiles, tileBounds, distanceToTile, selectTiles, flatten, resolveVisible, segmentsForZoom,
  ROOT_ZOOM, MAX_ZOOM, COVER_M,
} from '../../src/tileTree.js';

const leaves = (trees) => flatten(trees).filter((n) => !n.children);

describe('roots', () => {
  it('cover ±60 km around DFW with zoom-10 tiles', () => {
    const roots = rootTiles();
    expect(roots.every((r) => r.z === ROOT_ZOOM)).toBe(true);
    const b = roots.map((r) => tileBounds(r.z, r.x, r.y));
    expect(Math.min(...b.map((t) => t.minX))).toBeLessThan(-COVER_M);
    expect(Math.max(...b.map((t) => t.maxX))).toBeGreaterThan(COVER_M);
    expect(Math.min(...b.map((t) => t.minZ))).toBeLessThan(-COVER_M);
    expect(Math.max(...b.map((t) => t.maxZ))).toBeGreaterThan(COVER_M);
  });
});

describe('distanceToTile', () => {
  const b = { minX: 0, maxX: 100, minZ: 0, maxZ: 100 };
  it('is zero over the tile on the ground, and counts height above it', () => {
    expect(distanceToTile(b, { x: 50, y: 0, z: 50 })).toBe(0);
    expect(distanceToTile(b, { x: 50, y: 300, z: 50 })).toBe(300);
    expect(distanceToTile(b, { x: 50, y: 310, z: 50 }, 10)).toBe(300);
  });
  it('measures to the nearest edge from outside', () => {
    expect(distanceToTile(b, { x: 130, y: 0, z: 140 })).toBeCloseTo(50, 6);
  });
});

describe('selectTiles', () => {
  it('is finest right under a low camera and coarsest far away', () => {
    const trees = selectTiles({ x: 0, y: 50, z: 0 });
    const ls = leaves(trees);
    const under = ls.find((n) => { const b = tileBounds(n.z, n.x, n.y); return b.minX <= 0 && b.maxX >= 0 && b.minZ <= 0 && b.maxZ >= 0; });
    expect(under.z).toBe(MAX_ZOOM);
    const far = ls.filter((n) => distanceToTile(tileBounds(n.z, n.x, n.y), { x: 0, y: 50, z: 0 }) > 40000);
    expect(far.length).toBeGreaterThan(0);
    expect(Math.max(...far.map((n) => n.z))).toBeLessThanOrEqual(12);
  });
  it('stays coarse from high up', () => {
    const ls = leaves(selectTiles({ x: 0, y: 30000, z: 0 }));
    expect(Math.max(...ls.map((n) => n.z))).toBeLessThanOrEqual(12);
  });
  it('leaves tile the area exactly once (no overlaps, no gaps)', () => {
    const ls = leaves(selectTiles({ x: 1200, y: 400, z: 7400 }));
    const area = ls.reduce((a, n) => { const b = tileBounds(n.z, n.x, n.y); return a + b.w * b.l; }, 0);
    const rootArea = rootTiles().reduce((a, r) => { const b = tileBounds(r.z, r.x, r.y); return a + b.w * b.l; }, 0);
    expect(area / rootArea).toBeCloseTo(1, 3);
  });
  it('does not refine what the caller says is out of view', () => {
    const all = leaves(selectTiles({ x: 0, y: 50, z: 0 }));
    const culled = leaves(selectTiles({ x: 0, y: 50, z: 0 }, { visible: (b) => b.cz < 0 })); // only the north half
    expect(culled.length).toBeLessThan(all.length);
  });
  it('keeps the drawn mesh light: a few thousand triangles of terrain at most', () => {
    const ls = leaves(selectTiles({ x: 0, y: 400, z: 7400 }));
    const tris = ls.reduce((a, n) => { const s = segmentsForZoom(n.z); return a + s * s * 2 + s * 8; }, 0);
    expect(tris).toBeLessThan(25000); // everything, before frustum culling
  });
});

describe('resolveVisible', () => {
  const tree = [{ key: 'p', children: [
    { key: 'a', children: null }, { key: 'b', children: null }, { key: 'c', children: null }, { key: 'd', children: null },
  ] }];
  const keys = (r) => r.map((n) => n.key).sort().join(',');
  it('draws the children once they are all ready', () => {
    expect(keys(resolveVisible(tree, () => true))).toBe('a,b,c,d');
  });
  it('falls back to the ready parent while any child is still loading, never both', () => {
    expect(keys(resolveVisible(tree, (k) => k !== 'c'))).toBe('p');
  });
  it('draws what is ready when the parent is not (holes show the base plane)', () => {
    expect(keys(resolveVisible(tree, (k) => k === 'a' || k === 'b'))).toBe('a,b');
  });
});
