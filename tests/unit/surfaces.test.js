import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { surfaceAngles, rigParts, poseParts, gearSwing, throwsOf } from '../../src/surfaces.js';
import { parseModel, rigGear } from '../../src/aircraftModel.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';

const C172 = AIRCRAFT_DATABASE.c172, B738 = AIRCRAFT_DATABASE.b738, F16 = AIRCRAFT_DATABASE.f16;
const R2D = 180 / Math.PI;
const state = (o = {}) => ({ aileronInput: 0, elevInput: 0, rudderInput: 0, flapDeg: 0, gearPos: 1, ...o });
const deg = (spec, o) => {
  const a = surfaceAngles(spec, state(o), {});
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, k === 'gear' ? v : v * R2D]));
};

// A pivot with a box hanging aft of it, as main.js builds the primitives' surfaces.
function surface(name, { yaw = 0, pitch = 0 } = {}) {
  const p = new THREE.Group();
  p.name = name;
  p.rotation.set(pitch, yaw, 0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1));
  m.position.z = 0.5;
  p.add(m);
  return p;
}
// Where the trailing edge (local 0, 0, 1) of a posed surface ends up, in its parent's frame.
const te = (pivot) => new THREE.Vector3(0, 0, 1).applyQuaternion(pivot.quaternion);

describe('control surfaces (0063)', () => {
  it('C172 throws are the type certificate\'s (TCDS 3A12, 172S)', () => {
    expect(throwsOf(C172)).toEqual({ aileronUp: 20, aileronDown: 15, elevatorUp: 28, elevatorDown: 23, rudder: 16.2 });
  });

  it('full right stick: right aileron up by the up throw, left down by the down throw', () => {
    const a = deg(C172, { aileronInput: 1 });
    expect(a.aileronR).toBeCloseTo(-20, 6);
    expect(a.aileronL).toBeCloseTo(15, 6);
    const b = deg(C172, { aileronInput: -1 });
    expect(b.aileronL).toBeCloseTo(-20, 6);
    expect(b.aileronR).toBeCloseTo(15, 6);
  });

  it('elevator: stick back (nose up, elevInput −) raises it 28°, forward lowers it 23°', () => {
    expect(deg(C172, { elevInput: -1 }).elevator).toBeCloseTo(-28, 6);
    expect(deg(C172, { elevInput: 1 }).elevator).toBeCloseTo(23, 6);
    expect(deg(C172, { elevInput: -0.5 }).elevator).toBeCloseTo(-14, 6);
  });

  it('rudder + (yaw right) swings the trailing edge right, never past the throw', () => {
    expect(deg(C172, { rudderInput: 1 }).rudder).toBeCloseTo(16.2, 6);
    expect(deg(C172, { rudderInput: -3 }).rudder).toBeCloseTo(-16.2, 6); // input clamped
    expect(deg(F16, { rudderInput: 1 }).rudder).toBeCloseTo(30, 6);
  });

  it('flaps follow the actual flap angle, so they notch to the POH detents as they travel', () => {
    for (const d of C172.flapDetentsDeg) expect(deg(C172, { flapDeg: d }).flapL).toBeCloseTo(d, 6);
    expect(deg(B738, { flapDeg: 40 }).flapR).toBeCloseTo(40, 6);
    expect(deg(C172, { flapDeg: 12.5 }).flapR).toBeCloseTo(12.5, 6); // in transit, not snapped
  });

  it('F-16 flaperons droop as flaps (≤ 20°) and give way to the roll, within their ±21.5°', () => {
    expect(deg(F16, { flapDeg: 40 }).aileronL).toBeCloseTo(20, 6); // droop capped at 20°
    expect(deg(F16, { flapDeg: 40 }).flapL).toBe(0);
    const full = deg(F16, { flapDeg: 40, aileronInput: 1 }); // full roll keeps its whole split
    expect(full.aileronL).toBeCloseTo(21.5, 6);
    expect(full.aileronR).toBeCloseTo(-21.5, 6);
    const half = deg(F16, { flapDeg: 10, aileronInput: 0.5 }); // 10 droop ± 10.75 roll
    expect(half.aileronL - half.aileronR).toBeCloseTo(21.5, 6);
    expect(half.aileronL).toBeCloseTo(20.75, 6);
  });

  it('posed surfaces move the trailing edge the right way, swept and raked hinges included', () => {
    const root = new THREE.Group();
    const parts = {
      ailL: surface('ctl_aileron_L', { yaw: 0.16 }), ailR: surface('ctl_aileron_R', { yaw: -0.16 }),
      elev: surface('ctl_elevator'), rud: surface('ctl_rudder', { pitch: -0.3 }), flap: surface('ctl_flap_L'),
    };
    Object.values(parts).forEach((p) => root.add(p));
    const rig = rigParts(root);
    expect(rig.parts.map((p) => p.name).sort()).toEqual(['ctl_aileron_L', 'ctl_aileron_R', 'ctl_elevator', 'ctl_flap_L', 'ctl_rudder']);
    const restRud = te(parts.rud);
    poseParts(rig, C172, state({ aileronInput: 1, elevInput: -1, rudderInput: 1, flapDeg: 30 }), 0);
    expect(te(parts.ailR).y).toBeGreaterThan(0.3);  // right aileron up (roll right)
    expect(te(parts.ailL).y).toBeLessThan(-0.2);    // left aileron down
    expect(te(parts.elev).y).toBeCloseTo(Math.sin(28 / R2D), 6); // stick back: TE up 28°
    expect(te(parts.flap).y).toBeCloseTo(-Math.sin(30 / R2D), 6); // flaps 30: TE down
    expect(te(parts.rud).x).toBeGreaterThan(0.25);  // yaw right: TE right
    expect(te(parts.rud).y).toBeCloseTo(restRud.y, 1); // about its raked hinge, not tilted off it
    // Neutral puts every surface back exactly where it was built.
    poseParts(rig, C172, state(), 0);
    expect(te(parts.ailL).y).toBeCloseTo(new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, 0.16, 0)).y, 9);
    expect(parts.elev.quaternion.w).toBeCloseTo(1, 9);
  });

  it('gear: down at 1, a quarter turn and hidden when stowed; nose forward, mains inboard', () => {
    expect(gearSwing('gear_nose', 1)).toBe(0);
    expect(gearSwing('gear_nose', 0)).toBeCloseTo(Math.PI / 2);
    expect(gearSwing('gear_main_L', 0.5)).toBeCloseTo(Math.PI / 4);
    expect(gearSwing('gear_main_R', 0.5)).toBeCloseTo(-Math.PI / 4);
    const root = new THREE.Group();
    const nose = new THREE.Group(); nose.name = 'gear_nose';
    const left = new THREE.Group(); left.name = 'gear_main_L'; left.position.x = -3;
    root.add(nose, left);
    const rig = rigParts(root);
    poseParts(rig, B738, state({ gearPos: 0.5 }), 0);
    const wheel = new THREE.Vector3(0, -2, 0);
    expect(wheel.clone().applyQuaternion(nose.quaternion).z).toBeLessThan(-1); // folds forward
    expect(wheel.clone().applyQuaternion(left.quaternion).x).toBeGreaterThan(1); // left folds right, inboard
    expect(nose.visible).toBe(true);
    poseParts(rig, B738, state({ gearPos: 0 }), 0);
    expect(nose.visible).toBe(false);
  });

  it('spins the prop and fans by the given angle', () => {
    const root = new THREE.Group();
    const prop = new THREE.Mesh(); prop.name = 'prop';
    root.add(prop);
    poseParts(rigParts(root), C172, state(), 0.7);
    expect(prop.rotation.z).toBeCloseTo(0.7);
  });

  it('allocates nothing per frame: no new three.js objects in poseParts', () => {
    const root = new THREE.Group();
    for (const n of ['ctl_aileron_L', 'ctl_aileron_R', 'ctl_elevator', 'ctl_rudder', 'ctl_flap_L', 'ctl_flap_R']) root.add(surface(n));
    const g = new THREE.Group(); g.name = 'gear_nose'; root.add(g);
    const rig = rigParts(root);
    const spies = [vi.spyOn(THREE.Quaternion.prototype, 'clone'), vi.spyOn(THREE.Vector3.prototype, 'clone'),
      vi.spyOn(THREE.Euler.prototype, 'clone')];
    const out = poseParts(rig, C172, state({ aileronInput: 0.3 }), 0.1);
    const again = poseParts(rig, C172, state({ aileronInput: -0.3 }), 0.1);
    expect(again).toBe(out); // the same angles object every frame
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });
});

describe('twin-jet gear on hinge pivots (0063)', () => {
  const read = (file) => {
    const b = readFileSync(`public/${file}`);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };

  // Box of the triangles a mesh draws (the split halves share their vertex buffers).
  const triBox = (root, filter = () => true) => {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3(), v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh || !filter(o)) return;
      const idx = o.geometry.index, pos = o.geometry.attributes.position;
      for (let i = 0; i < idx.count; i++) b.expandByPoint(v.fromBufferAttribute(pos, idx.getX(i)).applyMatrix4(o.matrixWorld));
    });
    return b;
  };

  it('splits the main gear by side, hinges each leg at its top, and keeps the wheels where they were', async () => {
    const model = await parseModel(read('models/twinjet-v1.glb'), { GLTFLoader, MeshoptDecoder });
    const tyres = (root) => triBox(root, (o) => o.material.name === 'Tyre');
    const before = tyres(model);
    rigGear(model);
    const after = tyres(model);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-4); // re-parenting moved nothing
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-4);
    const rig = rigParts(model);
    expect(rig.gear.map((p) => p.name).sort()).toEqual(['gear_main_L', 'gear_main_R', 'gear_nose']);
    const L = model.getObjectByName('gear_main_L'), R = model.getObjectByName('gear_main_R');
    expect(L.position.x).toBeLessThan(-1);
    expect(R.position.x).toBeGreaterThan(1);
    // Every left-side triangle is on the left.
    const lbox = triBox(L);
    expect(lbox.max.x).toBeLessThan(0);
    // Stowed: the wheels end up higher, and the mains tuck inboard.
    poseParts(rig, B738, state({ gearPos: 0 }), 0);
    const lStowed = tyres(L);
    expect(lStowed.min.y).toBeGreaterThan(before.min.y + 1);
    expect((lStowed.min.x + lStowed.max.x) / 2).toBeGreaterThan(-2.8);
  });
});
