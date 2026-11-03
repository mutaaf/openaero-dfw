// ?debug only (a lazy chunk main.js loads with the overlay): screen geometry and test hooks for e2e specs.
import { Vector3 } from 'three';
import { courseVector } from './airports.js';

const _p = new Vector3();

// The active runway on screen (CSS px): its approach lights' outer end to the far end, as wide
// as the runway (null with no active runway). Read by tests/e2e/runwayVisibility.spec.js through
// openaeroDebug().runwayScreen.
export function runwayScreen(e, camera, canvas, ground) {
  if (!e) return null;
  const d = courseVector(e.hdgT), l = { x: d.z, z: -d.x }, w = e.widthM / 2, rect = canvas.getBoundingClientRect();
  return [-2400 * 0.3048, e.lengthM - e.displacedM].flatMap((s) => [-w, w].map((o) => {
    const x = e.thrX + d.x * s + l.x * o, z = e.thrZ + d.z * s + l.z * o;
    const p = _p.set(x, ground.heightAt(x, z), z).project(camera);
    return { x: (p.x + 1) / 2 * rect.width, y: (1 - p.y) / 2 * rect.height, z: p.z };
  }));
}

// The active end's 3D PAPI lamps that are white (0131; null before the lamps or with no active
// runway), for tests/e2e/papi.spec.js through openaeroDebug().papiLampsWhite. Four lamps per end,
// in RUNWAY_ENDS order, a white lamp's green channel lit.
export function papiLampsWhite(lamps, end, ends) {
  if (!lamps || !end) return null;
  const c = lamps.geometry.attributes.color.array, k = ends.indexOf(end) * 4;
  return [0, 1, 2, 3].filter((i) => c[(k + i) * 3 + 1] > 0.5).length;
}

// The ?debug test hooks (main.js passes what they reach; scenario(null, final) loads a final when the
// runway end exists, arm(hop) arms a scripted bounce, dead() is the dead-stick chunk once loaded).
export function hooks(sim, scenario, arm, dead, ground) {
  // 0068: a final to any runway end from any distance, e.g. 17R from 10 NM; fastKts (0127): that
  // much over the final's speed, flaps and all (an overspeed on the final).
  window.openaeroDebugFinal = (airport, rwy, distNm, fastKts = 0) => scenario(null,
    { key: `debug_${airport}_${rwy}_${distNm}`, label: `${airport} ${rwy} (${distNm} NM, debug)`, airport, rwy, distNm, fastKts });
  // 0091: throw the airplane back up off the runway (m/s), a scripted bounce; with onGroundS, armed:
  // it fires in the physics after that long on the wheels (sim time), so a slow frame can't move it
  // along the derotation (the nose comes down ~8°/s after touchdown).
  window.openaeroDebugHop = (mps, onGroundS) => { if (onGroundS == null) sim.vel.y = mps; else arm({ mps, s: onGroundS }); };
  // 0036: the dead-stick Cessna on Addison 16's final, distNm out, aglFt up.
  window.openaeroDebugDeadStick = (distNm, aglFt) => dead()?.debugFinal(sim, distNm, aglFt, ground);
}
