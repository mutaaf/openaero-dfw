// Streamed, draped satellite terrain: the tileTree.js quadtree turned into meshes.
// Each tile is a height grid over the ground model (terrain.js) with Esri World Imagery
// on top, plus a skirt hanging down its edges so neighbours at different detail levels
// never show a crack. Tiles load a few at a time (coarse and near first), stay in an LRU
// cache, and are re-draped if the elevation grid arrives after them.
import * as THREE from 'three';
import { esriTileUrl } from './geo.js';
import {
  selectTiles, flatten, resolveVisible, tileBounds, segmentsForZoom, rootTiles,
} from './tileTree.js';

const MAX_CONCURRENT = 6;
const CACHE_TILES = 260;         // meshes + textures kept around (~17 MB of 256² RGBA textures)
const RESELECT_EVERY_S = 0.2;
const MIN_Y = -100, MAX_Y = 150; // sim-Y range of the metroplex terrain, for culling boxes

// Day lights from main.js (ambient 0.85, sun 1.4): relief shading relative to flat ground,
// so a flat tile is exactly 1.0 and the material tint (applyGroundLight) does the rest.
const AMB = 0.85, SUN = 1.4;

// Height grid + skirt for one tile, in tile-local coordinates (origin = tile centre), with
// hillshade baked into vertex colours (cheaper than lighting every pixel).
function buildGeometry(b, seg, heightAt, sunDir) {
  const n = seg + 1;
  const count = n * n + 4 * n;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let k = 0;
  const put = (x, z, u, v, y) => {
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    uv[k * 2] = u; uv[k * 2 + 1] = v;
    k++;
  };
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const u = c / seg, v = 1 - r / seg; // v = 1 at the north edge, like the imagery
      const x = -b.w / 2 + u * b.w, z = -b.l / 2 + (r / seg) * b.l;
      put(x, z, u, v, heightAt(b.cx + x, b.cz + z));
    }
  }
  const gridCount = k;
  const idx = [];
  for (let r = 0; r < seg; r++) {
    for (let c = 0; c < seg; c++) {
      const a = r * n + c, bb = a + 1, d = a + n, e = d + 1;
      idx.push(a, d, bb, bb, d, e);
    }
  }
  // Skirts: walk each edge, duplicate it lower, stitch a vertical strip.
  const drop = Math.max(25, b.w * 0.01);
  const skirtSrc = [];
  const edges = [
    Array.from({ length: n }, (_, i) => i),                       // north, west → east
    Array.from({ length: n }, (_, i) => i * n + seg),             // east, north → south
    Array.from({ length: n }, (_, i) => seg * n + (seg - i)),     // south, east → west
    Array.from({ length: n }, (_, i) => (seg - i) * n),           // west, south → north
  ];
  for (const edge of edges) {
    const start = k;
    for (const i of edge) {
      skirtSrc.push(i);
      put(pos[i * 3], pos[i * 3 + 2], uv[i * 2], uv[i * 2 + 1], pos[i * 3 + 1] - drop);
    }
    for (let i = 0; i < seg; i++) {
      const top0 = edge[i], top1 = edge[i + 1], bot0 = start + i, bot1 = start + i + 1;
      idx.push(top0, top1, bot0, top1, bot1, bot0); // faces outward (edges run clockwise)
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal.array;
  const col = new Float32Array(count * 3);
  const flat = AMB + SUN * Math.max(0, sunDir.y);
  for (let i = 0; i < count; i++) {
    const src = i < gridCount ? i : skirtSrc[i - gridCount]; // skirts take their edge's shade
    const nl = nrm[src * 3] * sunDir.x + nrm[src * 3 + 1] * sunDir.y + nrm[src * 3 + 2] * sunDir.z;
    const shade = (AMB + SUN * Math.max(0, nl)) / flat;
    col[i * 3] = shade; col[i * 3 + 1] = shade; col[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('normal');
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-b.w / 2, MIN_Y, -b.l / 2), new THREE.Vector3(b.w / 2, MAX_Y, b.l / 2));
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  return g;
}

export function createTerrainLod({ scene, ground, renderOrder = -5, maxZoom, anisotropy = 4, sunDir }) {
  const tint = new THREE.Color(1, 1, 1);
  const group = new THREE.Group();
  group.name = 'terrain-lod';
  scene.add(group);
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';
  const tiles = new Map(); // key → { mesh, ready, loading, lastUsed, z }
  const queue = [];
  let inflight = 0;
  let timer = 0;
  let frame = 0;
  let trees = [];
  const roots = rootTiles();
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const box = new THREE.Box3();
  const stats = { loaded: 0, failed: 0, drawn: 0, cached: 0, triangles: 0, finestZoom: 0 };

  const makeTile = (node) => {
    const b = tileBounds(node.z, node.x, node.y);
    const mat = new THREE.MeshBasicMaterial({ color: tint, vertexColors: true });
    const mesh = new THREE.Mesh(buildGeometry(b, segmentsForZoom(node.z), ground.heightAt, sunDir), mat);
    mesh.position.set(b.cx, 0, b.cz);
    mesh.renderOrder = renderOrder;
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    const t = { mesh, ready: false, loading: false, lastUsed: frame, z: node.z, x: node.x, y: node.y, b };
    tiles.set(node.key, t);
    return t;
  };

  const pump = () => {
    while (inflight < MAX_CONCURRENT && queue.length) {
      const key = queue.shift();
      const t = tiles.get(key);
      if (!t || t.ready || t.loading) continue;
      t.loading = true;
      inflight++;
      loader.load(esriTileUrl(t.z, t.x, t.y), (tex) => {
        inflight--;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = anisotropy;
        if (tiles.get(key) !== t) { tex.dispose(); pump(); return; } // evicted meanwhile
        t.mesh.material.map = tex;
        t.mesh.material.needsUpdate = true;
        t.ready = true;
        t.loading = false;
        stats.loaded++;
        pump();
      }, undefined, () => {
        inflight--;
        if (tiles.get(key) === t) {
          // Offline or no imagery at this zoom: draw it plain rather than leave a hole.
          t.mesh.material.color.setHex(0x233827).multiply(tint);
          t.mesh.userData.plain = true;
          t.ready = true;
          t.loading = false;
          stats.failed++;
        }
        pump();
      });
    }
  };

  const evict = () => {
    if (tiles.size <= CACHE_TILES) return;
    const old = [...tiles.entries()].filter(([, t]) => t.lastUsed < frame && !t.loading).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (let i = 0; i < old.length && tiles.size > CACHE_TILES; i++) {
      const [key, t] = old[i];
      group.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.mesh.material.map?.dispose();
      t.mesh.material.dispose();
      tiles.delete(key);
    }
  };

  function update(dt, camera) {
    timer -= dt;
    if (timer > 0) return;
    timer = RESELECT_EVERY_S;
    frame++;
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    const cam = camera.position;
    const visible = (b) => {
      box.min.set(b.minX, MIN_Y, b.minZ);
      box.max.set(b.maxX, MAX_Y, b.maxZ);
      return frustum.intersectsBox(box);
    };
    trees = selectTiles(cam, { groundY: ground.heightAt(cam.x, cam.z), maxZoom, visible, roots });

    // Keep (and load) every selected node and its ancestors: ancestors are the fallback
    // while finer imagery streams in. Coarse first, then nearest first.
    const wanted = flatten(trees);
    const want = [];
    for (const n of wanted) {
      const t = tiles.get(n.key) || makeTile(n);
      t.lastUsed = frame;
      if (!t.ready && !t.loading) want.push(n);
    }
    want.sort((a, b) => (a.z - b.z) || (dist2(tileBounds(a.z, a.x, a.y), cam) - dist2(tileBounds(b.z, b.x, b.y), cam)));
    queue.length = 0;
    for (const n of want) queue.push(n.key);
    pump();

    for (const t of tiles.values()) t.mesh.visible = false;
    const draw = resolveVisible(trees, (key) => tiles.get(key)?.ready);
    let tris = 0, finest = 0;
    for (const n of draw) {
      const m = tiles.get(n.key).mesh;
      m.visible = true;
      tris += m.geometry.index.count / 3;
      if (n.z > finest) finest = n.z;
    }
    stats.finestZoom = finest;
    stats.drawn = draw.length;
    stats.cached = tiles.size;
    stats.triangles = tris;
    evict();
  }

  // Elevation arrived (or changed): re-drape every cached tile.
  function redrape() {
    for (const [, t] of tiles) {
      const old = t.mesh.geometry;
      t.mesh.geometry = buildGeometry(t.b, segmentsForZoom(t.z), ground.heightAt, sunDir);
      old.dispose();
    }
  }

  // Time of day: what Lambert would give flat ground (main.js applyGroundLight).
  function setTint(c) {
    tint.copy(c);
    for (const [, t] of tiles) {
      t.mesh.material.color.copy(tint);
      if (t.mesh.userData.plain) t.mesh.material.color.multiply(_plain);
    }
  }

  return { group, update, redrape, setTint, stats, setVisible: (v) => { group.visible = v; } };
}

const _plain = new THREE.Color(0x233827);

function dist2(b, cam) {
  const dx = b.cx - cam.x, dz = b.cz - cam.z;
  return dx * dx + dz * dz;
}
