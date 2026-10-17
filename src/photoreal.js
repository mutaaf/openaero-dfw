// Google Photorealistic 3D Tiles over the sim: the real city, buildings, stadiums and trees.
//
// Off unless the edge Worker hands us a key (/openaero/api/config) AND we're on the origin
// the key is restricted to (anything else would be a guaranteed 403). Loaded lazily
// (3d-tiles-renderer and the Draco decoder are separate chunks), started only when the
// player starts flying, one Google session per page (googleSession.js).
//
// Frames: Google's mesh is ECEF on the curved Earth; the sim is a flat map (geo.js). Each
// tile's vertices are remapped once on load through ecefToSim (the same lat/lon mapping the
// runways use), so everything lines up exactly across the whole metroplex. The renderer
// still needs a rigid ECEF→sim transform for culling and level of detail; the remapped
// meshes undo it locally. A sim-space vertical offset (`calib`) is then fitted so Google's
// runway surface matches each threshold's surveyed height (geoid/datum residuals).
import * as THREE from 'three';
import { ecefToSim, ecefToSimRigid } from './ecef.js';
import { createGoogleSession, ROOT_URL, PhotorealUnavailable } from './googleSession.js';
import { courseVector } from './airports.js';

export const PHOTOREAL_ORIGINS = ['https://mutaafaziz.com'];

// The key is referrer-restricted to mutaafaziz.com/openaero/*: elsewhere (previews,
// localhost) Google would refuse, so don't ask. `?photoreal` forces it (tests, debugging).
export function photorealAllowed(loc) {
  return PHOTOREAL_ORIGINS.includes(loc.origin) || new URLSearchParams(loc.search).has('photoreal');
}

const CALIB_EVERY_S = 1.5;
const CALIB_MAX_M = 30;

export function createPhotoreal({ scene, camera, renderer, base, storage, isMobile, runwayEnds, onActive, onUnavailable }) {
  const state = { status: 'off', reason: '', visibleTiles: 0, loadedTiles: 0, calibM: 0, calibSamples: 0, attributions: '' };
  let tiles = null;
  let session = null;
  let calibTimer = 0;
  const calib = new THREE.Group();   // sim space: vertical calibration only
  calib.name = 'photoreal';
  const ecefRoot = new THREE.Group(); // rigid ECEF → sim, for the renderer's culling/LOD
  ecefRoot.matrixAutoUpdate = false;
  ecefRoot.matrix.fromArray(ecefToSimRigid());
  const rigidInverse = ecefRoot.matrix.clone().invert();
  calib.add(ecefRoot);
  const raycaster = new THREE.Raycaster();
  const _v = new THREE.Vector3();
  const _p = {};
  const _down = new THREE.Vector3(0, -1, 0);

  function fail(err) {
    state.status = 'unavailable';
    state.reason = err instanceof PhotorealUnavailable ? err.reason : (err?.message || 'error');
    if (tiles) { calib.visible = false; }
    onUnavailable?.(state.reason);
  }

  // Exact ECEF → sim for every vertex of a freshly loaded tile; unlit (Google's textures
  // carry the real light), normals dropped.
  function remapTile(tileScene) {
    tileScene.updateMatrixWorld(true);
    tileScene.traverse((o) => {
      if (o.isMesh) {
        const g = o.geometry;
        const src = g.attributes.position;
        const out = new Float32Array(src.count * 3);
        const m = o.matrixWorld;
        for (let i = 0; i < src.count; i++) {
          _v.set(src.getX(i), src.getY(i), src.getZ(i)).applyMatrix4(m);
          ecefToSim(_v.x, _v.y, _v.z, _p);
          out[i * 3] = _p.x; out[i * 3 + 1] = _p.y; out[i * 3 + 2] = _p.z;
        }
        g.setAttribute('position', new THREE.BufferAttribute(out, 3));
        if (g.attributes.normal) g.deleteAttribute('normal');
        g.computeBoundingSphere();
        g.computeBoundingBox();
        const old = o.material;
        o.material = new THREE.MeshBasicMaterial({ map: old.map || null, color: old.color ? old.color.clone() : 0xffffff });
        old.dispose();
      }
      if (o !== tileScene) { o.matrix.identity(); o.matrixAutoUpdate = false; }
    });
    // world = calib · rigid · rigid⁻¹ · (identity) → the remapped sim coordinates.
    tileScene.matrix.copy(rigidInverse);
    tileScene.matrixAutoUpdate = false;
  }

  async function start(configUrl) {
    if (state.status !== 'off') return;
    state.status = 'starting';
    try {
      const res = await fetch(configUrl, { cache: 'no-store' });
      const key = res.ok ? (await res.json()).googleTilesKey : null;
      if (!key) { state.status = 'off'; state.reason = 'no key'; return; }
      session = createGoogleSession({ key, fetch: (u) => fetch(u), storage });
      await session.getRoot(); // the one billable request (throws PhotorealUnavailable)
      const [{ TilesRenderer }, { GoogleCloudAuthPlugin }, { GLTFExtensionsPlugin, UnloadTilesPlugin }, { DRACOLoader }] = await Promise.all([
        import('3d-tiles-renderer'),
        import('3d-tiles-renderer/core/plugins'),
        import('3d-tiles-renderer/plugins'),
        import('three/examples/jsm/loaders/DRACOLoader.js'),
      ]);

      // Google's own plugin collects the per-tile copyright attributions; we replace its
      // networking so the root comes from our session and every request is signed.
      class SessionPlugin extends GoogleCloudAuthPlugin {
        constructor() {
          super({ apiToken: '', useRecommendedSettings: false });
          this.refreshes = 0;
        }
        async fetchData(url, options) {
          if (url.startsWith(ROOT_URL)) return structuredClone(session.current.root);
          let r = await fetch(session.sign(url), options);
          // A session that outlived Google's ~3 h: one fresh root, at most twice a page.
          if ((r.status === 401 || r.status === 403) && this.refreshes < 2 && new URL(url).host === 'tile.googleapis.com') {
            this.refreshes++;
            try { await session.refresh(); } catch (err) { fail(err); return r; }
            r = await fetch(session.sign(url), options);
          }
          return r;
        }
        processTileModel(tileScene) { remapTile(tileScene); }
      }

      tiles = new TilesRenderer(ROOT_URL);
      tiles.registerPlugin(new SessionPlugin());
      const draco = new DRACOLoader().setDecoderPath(`${base}draco/`);
      tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
      tiles.registerPlugin(new UnloadTilesPlugin());
      tiles.errorTarget = isMobile ? 28 : 16;
      tiles.lruCache.maxBytesSize = (isMobile ? 220 : 450) * 1024 * 1024;
      tiles.lruCache.minBytesSize = (isMobile ? 120 : 250) * 1024 * 1024;
      tiles.setCamera(camera);
      tiles.setResolutionFromRenderer(camera, renderer);
      tiles.addEventListener('load-model', () => { state.loadedTiles++; });
      tiles.addEventListener('load-error', () => { /* missing tile: the free terrain stays underneath */ });
      ecefRoot.add(tiles.group);
      scene.add(calib);
      state.status = 'loading';
    } catch (err) {
      fail(err);
    }
  }

  // Fit the vertical offset: ray down onto Google's runway surface at the aiming point of
  // the runway nearest the camera, compare with its surveyed threshold height.
  function calibrate() {
    let best = null, bestD = 12000 * 12000;
    for (const e of runwayEnds) {
      const dx = e.thrX - camera.position.x, dz = e.thrZ - camera.position.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return;
    const d = courseVector(best.hdgT);
    const x = best.thrX + d.x * 300, z = best.thrZ + d.z * 300;
    raycaster.set(_v.set(x, best.thrY + 400, z), _down);
    raycaster.far = 800;
    const hit = raycaster.intersectObject(tiles.group, true)[0];
    if (!hit) return;
    const meshGround = hit.point.y - calib.position.y; // Google's surface before calibration
    const target = THREE.MathUtils.clamp(best.thrY - meshGround, -CALIB_MAX_M, CALIB_MAX_M);
    calib.position.y += (target - calib.position.y) * (state.calibSamples === 0 ? 1 : 0.3);
    state.calibM = calib.position.y;
    state.calibSamples++;
  }

  function update(dt) {
    if (!tiles || state.status === 'unavailable') return;
    camera.updateMatrixWorld();
    calib.updateMatrixWorld(true);
    tiles.update();
    state.visibleTiles = tiles.visibleTiles.size;
    if (state.status === 'loading' && state.visibleTiles > 0) {
      state.status = 'active';
      onActive?.();
    }
    calibTimer -= dt;
    if (calibTimer <= 0 && state.visibleTiles > 0) {
      calibTimer = CALIB_EVERY_S;
      calibrate();
      const list = [];
      tiles.getAttributions(list);
      state.attributions = list.filter((a) => a.type === 'string').map((a) => a.value).join('');
    }
  }

  return {
    state,
    start,
    update,
    get session() { return session; },
    setVisible(v) { calib.visible = v && state.status !== 'unavailable'; },
    resize() { if (tiles) tiles.setResolutionFromRenderer(camera, renderer); },
    noteSessionReuse() { if (session?.current) session.getRoot(); },
    // Debug: the drawn tiles' bounds in sim metres (e2e checks the ECEF → sim mapping).
    bounds() {
      if (!tiles) return null;
      const box = new THREE.Box3();
      calib.updateMatrixWorld(true);
      tiles.group.traverse((o) => { if (o.isMesh) box.expandByObject(o); });
      return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
    },
  };
}
