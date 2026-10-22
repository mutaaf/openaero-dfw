// Detailed aircraft models (ticket 0045): open-licensed glTF drawn instead of the primitive
// stand-in that main.js builds, loaded lazily once someone flies. The loader, the meshopt
// decoder (three's, bundled: no CDN) and the model are their own chunk and file, so the
// boot bundle doesn't grow; until a model arrives, or if it fails, the primitive stays.
//
// Models are built by scripts/build-models.mjs (sources and licences in
// assets-src/models/README.md and public/CREDITS.md). Each is in the physics body frame:
// metres, nose towards -Z, +Y up, origin at the centre of gravity, the lowest wheel at
// -gearHeight (src/aircraft.js), so at zero pitch the wheels touch where the flight model's
// gear does. The flight model holds the centre of gravity, not the main gear, at gearHeight
// on the ground, so a pitched-up airframe would sink its mains: see rotationLift.
// Gear and doors are nodes named `gear_*`; at load the legs are put on hinge pivots so they
// swing with their travel (0063, surfaces.js). Moving surfaces come with each model's
// `ctl_*` nodes; the twin-jet has none yet (its wing is one mesh with the body).

import { Group, Mesh, BufferGeometry, Box3, Vector3 } from 'three';
import { rigParts } from './surfaces.js';

export const AIRCRAFT_MODELS = {
  // A generic CC0 twin-jet (OpenGameArt, weirdybeardyman), not a 737 replica: scaled to the
  // 737-800's length (39.5 m), fuselage 3.7 m wide (real 3.76), span 30.8 m (real 35.8).
  // mainGearZ: the main axles' distance aft of the origin (m), for the rotation lift below.
  b738: { name: 'twinjet', file: 'models/twinjet-v1.glb', mainGearZ: 1.47 },
};

export function modelUrl(aircraftKey, base) {
  const m = AIRCRAFT_MODELS[aircraftKey];
  return m ? `${base}${m.file}` : null;
}

// The gear legs, wheels and doors: shown with the gear down, hidden with it up.
export function gearNodes(root) {
  const out = [];
  root.traverse((o) => { if (o.name.startsWith('gear_')) out.push(o); });
  return out;
}

// How far to raise the model (m, body frame) so the main wheels stay on the runway when
// the flight model pitches the airframe about its centre of gravity on the ground (rotation,
// flare): a main axle `mainGearZ` aft of the origin and `gearHeight` below it sits
// gearHeight·(1 − cos θ) − mainGearZ·sin θ above the plane under a level airframe;
// `wheelHeightM` is how far that plane is above the ground. 0 in the air and nose-down.
export function rotationLift(sinPitch, gearHeight, mainGearZ, wheelHeightM) {
  const cosPitch = Math.sqrt(1 - sinPitch * sinPitch);
  return Math.max(0, mainGearZ * sinPitch - gearHeight * (1 - cosPitch) - Math.max(0, wheelHeightM));
}

export function showGear(nodes, down) {
  for (let i = 0; i < nodes.length; i++) nodes[i].visible = down;
}

// Parses a model file (ArrayBuffer) into a scene graph. Takes the loader classes so tests
// can parse the shipped file in Node with the same code the browser runs.
// Puts the gear legs on pivots surfaces.js can swing (once per loaded file, before it is
// copied; allocates). The file's
// meshes are baked in the body frame, origins at the CG, so each leg moves under a new node
// at its hinge: the top of the leg. `gear_main` holds both main legs in each mesh, so its
// meshes are split by side (shared vertex buffers, one index buffer each). The doors stay as
// they are and show while the gear is out.
const _v = new Vector3();
export function rigGear(model) {
  model.updateMatrixWorld(true);
  const pivot = (name, members, box) => {
    const p = new Group();
    p.name = name;
    p.position.set((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    model.add(p);
    p.updateMatrixWorld(true);
    for (const m of members) p.attach(m);
    return p;
  };
  const nose = model.getObjectByName('gear_nose');
  if (nose) {
    nose.name = 'gear_nose_leg';
    pivot('gear_nose', [nose], new Box3().setFromObject(nose));
  }
  const main = model.getObjectByName('gear_main');
  if (main) {
    const sides = { L: [], R: [] }, legs = { L: new Box3(), R: new Box3() };
    const meshes = main.children.filter((c) => c.isMesh && c.geometry.index);
    meshes.forEach((mesh, n) => {
      const g = mesh.geometry, idx = g.index, pos = g.attributes.position;
      const half = { L: [], R: [] };
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
        const side = pos.getX(a) + pos.getX(b) + pos.getX(c) < 0 ? 'L' : 'R';
        half[side].push(a, b, c);
        // The first mesh is the leg: its top is the hinge.
        if (n === 0) for (const v of [a, b, c]) legs[side].expandByPoint(_v.fromBufferAttribute(pos, v).applyMatrix4(mesh.matrixWorld));
      }
      for (const side of ['L', 'R']) {
        const geo = new BufferGeometry(); // the same vertex buffers, this side's triangles
        for (const k in g.attributes) geo.setAttribute(k, g.attributes[k]);
        geo.setIndex(half[side]);
        const m = new Mesh(geo, mesh.material);
        m.name = `${mesh.name}_${side}`;
        m.applyMatrix4(mesh.matrixWorld);
        sides[side].push(m);
      }
    });
    model.remove(main);
    // The hinge is the top of each side's strut (the first mesh, the leg), not the wheels.
    for (const side of ['L', 'R']) if (sides[side].length) pivot(`gear_main_${side}`, sides[side], legs[side]);
  }
}

export async function parseModel(buffer, { GLTFLoader, MeshoptDecoder }) {
  await MeshoptDecoder.ready;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
  gltf.scene.name = 'aircraftModel';
  return gltf.scene;
}

const cache = new Map(); // aircraft key -> Promise<scene>, one fetch per page

// A fresh copy of the aircraft's model (geometry and materials shared), or null if it has none.
export function loadAircraftModel(aircraftKey, base) {
  const url = modelUrl(aircraftKey, base);
  if (!url) return Promise.resolve(null);
  if (!cache.has(aircraftKey)) {
    const p = Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.arrayBuffer();
      }),
    ]).then(([{ GLTFLoader }, { MeshoptDecoder }, buf]) => parseModel(buf, { GLTFLoader, MeshoptDecoder }))
      .then((scene) => { rigGear(scene); return scene; }); // once: the copies share its pivots and split meshes
    p.catch(() => cache.delete(aircraftKey)); // a failed load can be retried later
    cache.set(aircraftKey, p);
  }
  return cache.get(aircraftKey).then((scene) => scene.clone());
}

// Swaps the primitive stand-in under `root` for the detailed model once it has loaded, unless
// `current()` says the aircraft was rebuilt meanwhile. Sets refs.model = { name, update(sim) };
// update shows the gear doors while the gear is out and allocates nothing; refs.parts is the
// model's rig for surfaces.js.
export async function attachModel(root, aircraftKey, base, refs, current) {
  const model = await loadAircraftModel(aircraftKey, base);
  if (!model || !current()) return;
  for (const child of root.children) child.visible = false;
  root.add(model);
  refs.parts = rigParts(model); // the primitive's surfaces and fans are hidden with it
  const gear = model.children.filter((o) => o.name.endsWith('_door') || o.name.endsWith('_doors'));
  const { name, mainGearZ } = AIRCRAFT_MODELS[aircraftKey];
  let shown = null;
  refs.model = {
    name,
    update(sim) {
      const q = sim.quat; // sin(pitch): the nose (body -Z) direction's height
      // With struts (gear.js) the physics pivots on the mains itself: no lift needed.
      const lift = sim.spec.gear ? 0 : rotationLift(2 * (q.w * q.x - q.y * q.z), sim.spec.gearHeight, mainGearZ, sim.pos.y - sim.groundY - sim.spec.gearHeight);
      // The doors show while the gear is out at all (systems.js gearPos: 0 up → 1 down and
      // locked); the legs swing with surfaces.js poseParts.
      const out = (sim.gearPos ?? (sim.gearDown ? 1 : 0)) > 0.02;
      model.position.y = out ? lift : 0;
      if (shown === out) return;
      shown = out;
      showGear(gear, shown);
    },
  };
}
