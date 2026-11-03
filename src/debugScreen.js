// ?debug only (a lazy chunk main.js loads with the overlay): screen geometry for e2e specs.
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
