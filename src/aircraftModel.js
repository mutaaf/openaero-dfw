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
// Gear and doors are nodes named `gear_*`; moving surfaces come with 0063.

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
    ]).then(([{ GLTFLoader }, { MeshoptDecoder }, buf]) => parseModel(buf, { GLTFLoader, MeshoptDecoder }));
    p.catch(() => cache.delete(aircraftKey)); // a failed load can be retried later
    cache.set(aircraftKey, p);
  }
  return cache.get(aircraftKey).then((scene) => scene.clone());
}

// Swaps the primitive stand-in under `root` for the detailed model once it has loaded, unless
// `current()` says the aircraft was rebuilt meanwhile. Sets refs.model = { name, update(sim) };
// update shows the gear only when it is down and allocates nothing.
export async function attachModel(root, aircraftKey, base, refs, current) {
  const model = await loadAircraftModel(aircraftKey, base);
  if (!model || !current()) return;
  for (const child of root.children) child.visible = false;
  root.add(model);
  refs.fanL = refs.fanR = null; // the primitive's fans are hidden with it
  const gear = gearNodes(model);
  const { name, mainGearZ } = AIRCRAFT_MODELS[aircraftKey];
  let shown = null;
  refs.model = {
    name,
    update(sim) {
      const q = sim.quat; // sin(pitch): the nose (body -Z) direction's height
      const lift = rotationLift(2 * (q.w * q.x - q.y * q.z), sim.spec.gearHeight, mainGearZ, sim.pos.y - sim.groundY - sim.spec.gearHeight);
      model.position.y = sim.gearDown ? lift : 0;
      if (shown === sim.gearDown) return;
      shown = sim.gearDown;
      showGear(gear, shown);
    },
  };
}
