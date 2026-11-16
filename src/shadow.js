// The aircraft's shadow on the ground (ticket 0190), a height cue for the flare: a dark copy of the
// airplane's own top-down silhouette laid on terrain.js heights where the real sun (sun.js, via
// main.js's DirectionalLight) throws it, so it slides in from h / tan(sun elevation) away and meets
// the wheels at touchdown. Not a shadow map (frame budget, invariant 4): one quad, four vertices.
//
// The silhouette is rasterised once per airframe from the meshes under the aircraft root (the
// built-in model or the detailed glTF, whichever is drawn) into a 128 px alpha canvas, seen from
// above in the body's frame. Each frame it is laid in the body's x-z plane through the main wheels
// (spec.gearHeight below the CG, so the shadow meets the wheels at touchdown; a high wing's own
// shadow then falls a little short of where it really would), and the quad's four corners in that
// plane are projected along
// the sun onto the ground plane at the shadow's centre, so bank, pitch and heading shape it the way
// the sun would (a flat-silhouette approximation of the 3D airframe; the ground under it is taken
// flat, which the runways are). Faded in with the sun (none below 3°: the Dawn/Dusk presets'
// sun, ~3° on their 5-minute samples, and the night), weaker the more the METAR's clouds cover the sky, and gone above 600 ft AGL,
// where it is no cue. In runwayLights.js's lazy chunk, made with its landing light; boot pays nothing.
// It is drawn in every view and the replay (it follows the drawn airframe, not the physics), and is
// no effect for reduced motion. ?debug: window.openaeroShadow.
import * as THREE from 'three';

const FT = 0.3048;
const DEG = Math.PI / 180;
export const SHADOW = {
  minSunDeg: 3,      // the sun below this: no shadow (the ticket: gone below ~3°)
  fullSunDeg: 10,    // faded in between
  fadeFromFt: 400,   // AGL: full below, gone at maxAglFt
  maxAglFt: 600,
  alpha: 0.55,       // a sunlit runway in shadow keeps the skylight: roughly half its brightness
  texPx: 128,
};

// Pure: the shadow's horizontal offset (m, sim frame: +X east, -Z north) from the point straight
// under an object heightM above flat ground, for a sun at elevationDeg / azimuthDeg (true, from
// north, clockwise): h / tan(el), away from the sun. Null when the sun is not up (el ≤ 0).
export function shadowOffset(heightM, elevationDeg, azimuthDeg, out = { x: 0, z: 0, distM: 0 }) {
  if (!(elevationDeg > 0)) return null;
  const d = Math.max(0, heightM) / Math.tan(elevationDeg * DEG);
  const az = azimuthDeg * DEG;
  // Towards the sun is (sin az, -cos az) in x, z; the shadow falls the other way.
  out.x = -d * Math.sin(az);
  out.z = d * Math.cos(az);
  out.distM = d;
  return out;
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Pure: the shadow's opacity (0 = hidden) for the sun's elevation, the height above the ground and
// the sky's cloud cover (0 clear .. 1 overcast: the largest METAR layer coverage, metar.js COVERAGE).
export function shadowOpacity(sunElevationDeg, aglFt, cloudCover = 0) {
  if (!(sunElevationDeg >= SHADOW.minSunDeg) || !(aglFt <= SHADOW.maxAglFt)) return 0;
  const sunK = smooth(SHADOW.minSunDeg, SHADOW.fullSunDeg, sunElevationDeg);
  const hK = 1 - smooth(SHADOW.fadeFromFt, SHADOW.maxAglFt, aglFt);
  // Squared: a FEW layer (0.2) hardly dims the sun (×0.96), BKN (0.75) mostly does, OVC hides it.
  const c = Math.max(0, Math.min(1, cloudCover || 0));
  const cloudK = 1 - c * c;
  return SHADOW.alpha * sunK * hK * cloudK;
}

// The largest coverage among the weather's cloud layers (0 with none).
export function cloudCover(wx) {
  let c = 0;
  const layers = wx?.cloudLayers;
  if (layers) for (let i = 0; i < layers.length; i++) c = Math.max(c, layers[i].coverage || 0);
  return c;
}

// The visible meshes under the root that make the silhouette (not the landing light's beam or any
// see-through glow, such as the F-16's flame).
function silhouetteMeshes(root, out) {
  out.length = 0;
  root.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const m = o.material;
    if (m && !Array.isArray(m) && m.transparent && m.opacity < 0.6) return;
    out.push(o);
  });
  return out;
}

// Rasterises the root's meshes, seen from above in its own frame (x right, z aft), into ctx.
// Returns the square's side (m) centred on the root's origin. Allocates (once per airframe).
export function drawSilhouette(root, ctx, px) {
  const meshes = silhouetteMeshes(root, []);
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const tris = [];
  let ext = 1;
  for (const mesh of meshes) {
    rel.multiplyMatrices(inv, mesh.matrixWorld);
    const pos = mesh.geometry.attributes.position;
    const xz = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      xz[i * 2] = v.x; xz[i * 2 + 1] = v.z;
      ext = Math.max(ext, Math.abs(v.x), Math.abs(v.z));
    }
    tris.push({ xz, index: mesh.geometry.index, count: pos.count });
  }
  const size = 2 * ext * 1.04;
  ctx.clearRect(0, 0, px, px);
  ctx.fillStyle = '#000';
  for (const t of tris) {
    const n = t.index ? t.index.count : t.count;
    ctx.beginPath();
    for (let i = 0; i + 2 < n; i += 3) {
      const a = t.index ? t.index.getX(i) : i, b = t.index ? t.index.getX(i + 1) : i + 1, c = t.index ? t.index.getX(i + 2) : i + 2;
      const ax = t.xz[a * 2], az = t.xz[a * 2 + 1], bx = t.xz[b * 2], bz = t.xz[b * 2 + 1], cx = t.xz[c * 2], cz = t.xz[c * 2 + 1];
      const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (Math.abs(area) < 1e-6) continue; // edge-on (a fin, the fuselage's sides)
      // One winding for every triangle, so the nonzero fill is their union.
      ctx.moveTo((ax / size + 0.5) * px, (az / size + 0.5) * px);
      if (area > 0) {
        ctx.lineTo((bx / size + 0.5) * px, (bz / size + 0.5) * px);
        ctx.lineTo((cx / size + 0.5) * px, (cz / size + 0.5) * px);
      } else {
        ctx.lineTo((cx / size + 0.5) * px, (cz / size + 0.5) * px);
        ctx.lineTo((bx / size + 0.5) * px, (bz / size + 0.5) * px);
      }
      ctx.closePath();
    }
    ctx.fill('nonzero');
  }
  return size;
}

// scene: main.js's THREE.Scene (its onBeforeRender chained, as fuel.js's); sim: the shared state (read
// only: wx); root(): the aircraft's root group (main.js aircraftRoot, also posed by the replay);
// heightAt: terrain.js ground.heightAt.
export function createShadow(scene, sim, root, heightAt) {
  const px = SHADOW.texPx;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  // A DataTexture (touchdownFeel.js's class, already in this chunk; a CanvasTexture costs boot a preload entry).
  // Its first row is the canvas's top, the nose, at v 0.
  const texData = new Uint8Array(px * px * 4);
  const tex = new THREE.DataTexture(texData, px, px);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const pos = new Float32Array(12);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  // Corners: nose-left, nose-right, tail-left, tail-right (the texture's first row is the nose).
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000, map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    // Over the runway decals (polygon offset -4) and the coarser drawn tiles, as the landing light's pool.
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'aircraftShadow';
  mesh.frustumCulled = false; // four vertices, rewritten every frame
  mesh.renderOrder = -1; // after the ground's decals (main.js GROUND_ORDER)
  mesh.visible = false;
  scene.add(mesh);

  const sunLight = () => scene.children.find((o) => o.isDirectionalLight);
  let light = null;
  const state = { visible: false, opacity: 0, sunElevationDeg: 0, aglFt: 0, offsetM: 0, awayX: 0, awayZ: 0, groundY: 0, x: 0, z: 0, sizeM: 0, built: 0 };
  let sizeM = 0, builtFor = null, builtCount = -1, checkIn = 0, pending = false;
  const _s = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3();
  const _u = new THREE.Vector3(), _w = new THREE.Vector3();
  const _list = [];
  const CORNERS = [-1, -1, 1, -1, -1, 1, 1, 1]; // (x, z) in half-sizes, the uv order above

  function rebuild(r) {
    pending = false;
    if (r !== root()) return; // replaced while we waited
    sizeM = drawSilhouette(r, ctx, px);
    texData.set(ctx.getImageData(0, 0, px, px).data);
    tex.needsUpdate = true;
    state.sizeM = sizeM;
    state.built++;
  }
  // A new airframe, or its meshes changed (the detailed model arrived): draw it again, off the frame.
  function watch(r) {
    if (--checkIn > 0 && r === builtFor) return;
    checkIn = 60;
    const n = silhouetteMeshes(r, _list).length;
    if (r === builtFor && n === builtCount) return;
    builtFor = r; builtCount = n;
    if (pending) return;
    pending = true;
    const go = () => rebuild(r);
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 500 }); else setTimeout(go, 0);
  }

  function hide() {
    mesh.visible = false;
    state.visible = false;
    state.opacity = 0;
    state.offsetM = 0;
  }

  function update() {
    const r = root();
    light ??= sunLight();
    if (!r || !r.parent || !light) return hide();
    watch(r);
    if (!(sizeM > 0)) return hide();
    _s.copy(light.position).normalize(); // towards the sun
    const el = Math.asin(Math.max(-1, Math.min(1, _s.y))) / DEG;
    // The main wheels' plane: the CG (the root's origin) down the body's up axis by the gear's height.
    _u.set(0, 1, 0).applyQuaternion(r.quaternion);
    const p = _w.copy(r.position).addScaledVector(_u, -(sim.spec?.gearHeight ?? 0));
    const g0 = heightAt(p.x, p.z);
    const aglFt = (p.y - g0) / FT;
    state.sunElevationDeg = el;
    state.aglFt = aglFt;
    const op = shadowOpacity(el, aglFt, cloudCover(sim.wx));
    if (!(op > 0.005)) return hide();
    // The ground where the centre's shadow falls (once more: the terrain there, not under the airplane).
    let g = g0;
    for (let i = 0; i < 2; i++) {
      const t = (p.y - g) / _s.y;
      g = heightAt(p.x - _s.x * t, p.z - _s.z * t);
    }
    const tc = (p.y - g) / _s.y;
    const cx = p.x - _s.x * tc, cz = p.z - _s.z * tc;
    _r.set(1, 0, 0).applyQuaternion(r.quaternion);
    _f.set(0, 0, 1).applyQuaternion(r.quaternion);
    const camD = Math.hypot(cx - camPos.x, g - camPos.y, cz - camPos.z);
    // Over the drawn tiles, coarser than terrain.js between vertices; capped, or from a grazing view far
    // off the lifted quad would slide tens of metres.
    const lift = Math.min(1.5, 0.15 + 0.004 * camD);
    const half = sizeM / 2;
    for (let i = 0; i < 4; i++) {
      _c.copy(p).addScaledVector(_r, CORNERS[i * 2] * half).addScaledVector(_f, CORNERS[i * 2 + 1] * half);
      const t = (_c.y - g) / _s.y;
      pos[i * 3] = _c.x - _s.x * t;
      pos[i * 3 + 1] = g + lift;
      pos[i * 3 + 2] = _c.z - _s.z * t;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = op;
    mesh.visible = true;
    state.visible = true;
    state.opacity = op;
    state.groundY = g;
    state.x = cx; state.z = cz;
    state.awayX = cx - p.x; state.awayZ = cz - p.z; // from under the wheels to the shadow's centre
    state.offsetM = Math.hypot(state.awayX, state.awayZ);
  }

  const camPos = new THREE.Vector3();
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, target) {
    before.call(this, renderer, sc, camera, target);
    camPos.setFromMatrixPosition(camera.matrixWorld);
    update();
  };

  const api = { mesh, state, update };
  if (globalThis.location && new URLSearchParams(location.search).has('debug')) window.openaeroShadow = api;
  return api;
}
