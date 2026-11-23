// The game's side of the Rapier world (ticket 0043): a lazy chunk fetched once the player has
// started flying within serviceRoad.js LOAD_M of the tug (runwayLights.js's landing-light hook), never at
// boot. It fetches Rapier's .wasm (~1.2 MB gz, same origin, bundled from npm), builds
// physicsWorld.js's world on terrain.js heights, and draws the tow tractor: a box and four wheels
// posed from the raycast vehicle (suspension, steering, spin), a seat back and a tow bar. It chains the scene's
// onBeforeRender and steps on the sim's clock (sim.simTime: nothing moves while the flight is
// paused or behind a menu); the world sleeps while the aircraft is WAKE_M or more from the tug.
// Rapier's getters fill preallocated objects here; an asleep frame calls nothing in Rapier (world.step
// itself makes and frees one small RawVector a step). The first step is taken at load time: Chrome
// compiles the wasm's functions lazily on first call (~400 ms on a 4x-throttled phone, device panel),
// which in a render frame was a hitch on the takeoff roll. A failed fetch is not retried this page.
import * as THREE from 'three';
import * as R from '@dimforge/rapier3d';
import wasmUrl from '@dimforge/rapier3d/rapier_wasm3d_bg.wasm?url';
import { initRapier, createPhysicsWorld, TUG } from './physicsWorld.js';

export async function createWorldScene(scene, sim, heightAt) {
  await initRapier(fetch(wasmUrl));
  const w = createPhysicsWorld(R, { heightAt });
  w.stepOnce(); // compile now, on the spawn, not in the frame the tug wakes
  const h = TUG.halfM;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2 * h.x, 2 * h.y, 2 * h.z), new THREE.MeshLambertMaterial({ color: 0xd9a21b }));
  body.name = 'tug';
  const wheelGeo = new THREE.CylinderGeometry(TUG.wheelR, TUG.wheelR, 0.25, 12);
  wheelGeo.rotateX(Math.PI / 2); // axle along the chassis' local Z
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(wheelGeo, wheelMat);
    m.rotation.order = 'YZX'; // steer (Y), then spin about the axle (Z)
    body.add(m);
    wheels.push(m);
  }
  // A seat back and a tow bar, so the box reads as a tractor (children of the chassis: one pose).
  const dark = new THREE.MeshLambertMaterial({ color: 0x334155 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.9), dark);
  seat.position.set(-0.6, h.y + 0.35, 0);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.12), dark);
  bar.position.set(-h.x - 0.4, -0.25, 0);
  body.add(seat, bar);
  scene.add(body);

  let last = null;
  const p = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0, w: 1 };
  const pose = () => {
    w.chassis.translation(p); w.chassis.rotation(q);
    body.position.set(p.x, p.y, p.z);
    body.quaternion.set(q.x, q.y, q.z, q.w);
    for (let i = 0; i < 4; i++) {
      const c = w.car;
      const m = wheels[i];
      m.position.set(i < 2 ? TUG.wheelX : -TUG.wheelX, TUG.wheelY - (c.wheelSuspensionLength(i) ?? TUG.restM), i % 2 === 0 ? TUG.wheelZ : -TUG.wheelZ);
      m.rotation.y = c.wheelSteering(i) ?? 0;
      m.rotation.z = -(c.wheelRotation(i) ?? 0);
    }
    body.updateMatrixWorld();
  };
  pose();

  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, target) {
    before.call(this, renderer, sc, camera, target);
    const t = sim.simTime ?? 0;
    const dt = last === null ? 0 : Math.min(0.25, Math.max(0, t - last));
    last = t;
    if (w.step(dt, sim.pos.x, sim.pos.z) > 0) pose();
  };

  if (globalThis.location && new URLSearchParams(location.search).has('debug')) {
    window.openaeroWorld = () => ({ ...w.snapshot(), road: { x0: w.road.x0, z0: w.road.z0, len: w.road.len } }); // e2e (allocates)
  }
  return { world: w, mesh: body };
}
