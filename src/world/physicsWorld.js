// One Rapier world for the things on the ground that move by their own physics (ticket 0043,
// pillar 0: "every object that moves in the world moves by its own physics, not by keyframes").
// Rapier (@dimforge/rapier3d 0.21, Apache-2.0, dimforge.com) is the rigid-body engine; this file
// is the foundation only: one world, a fixed 60 Hz step on the sim's clock, a flat ground collider
// under the service road (its top through terrain.js heights at both ends), and ONE tow tractor on
// Rapier's raycast vehicle controller (four wheels on sprung suspension, engine force and brakes
// on the tyres, front-wheel steering) driving a short straight lane on a KDFW ramp at walking
// pace, a closed loop: out, a U-turn onto a return lane beside it, back, a U-turn, a stop, again. The aircraft is not a Rapier
// body and nothing collides with it (follow-ups: sloped terrain, the aircraft as a kinematic body,
// more vehicles).
//
// Pure of the browser: `R` is the Rapier namespace (import * as R from '@dimforge/rapier3d'),
// initialised with initRapier first; tests/unit/physicsWorld.test.js flies it in Node.
import * as bg from '@dimforge/rapier3d/rapier_wasm3d_bg.js';
import { latLonToSimMeters } from '../geo.js';
import { SERVICE_ROAD } from './serviceRoad.js';

// Instantiates Rapier's .wasm and hands it to the bindings (rapierRaw.js re-exports the same module,
// so the high-level API sees it). `source`: the module's bytes, or a fetch() Response (streamed).
let ready = null;
export function initRapier(source) {
  ready ??= (async () => {
    const imports = { './rapier_wasm3d_bg.js': bg };
    const res = await source;
    let out;
    if (typeof Response !== 'undefined' && res instanceof Response) {
      if (!res.ok) throw new Error(`rapier wasm: HTTP ${res.status}`);
      // A server that names .wasm wrongly refuses streaming: fall back to the bytes.
      out = await WebAssembly.instantiateStreaming(res.clone(), imports)
        .catch(() => res.arrayBuffer().then((b) => WebAssembly.instantiate(b, imports)));
    } else out = await WebAssembly.instantiate(res, imports);
    bg.__wbg_set_wasm(out.instance.exports);
  })();
  return ready;
}

export const STEP_S = 1 / 60;       // the world's fixed step: the flight model's sub-step (main.js, ≤ 1/60 s)
export const MAX_STEPS = 15;        // per frame: main.js's 250 ms catch-up cap
export const WAKE_M = 3000;         // the world steps only while the aircraft is this close to the tug
export const TUG_KMH = 5;           // walking pace
export const TUG_MPS = TUG_KMH / 3.6;
export const STOP_S = 3;            // held at the near end after each lap (waiting at the gate)
export const TURN_MPS = 0.8;        // through the U-turns
export { SERVICE_ROAD } from './serviceRoad.js';
// A baggage tow tractor (a game's round numbers for the class, not one model's data sheet).
export const TUG = {
  massKg: 3000, halfM: { x: 1.5, y: 0.6, z: 0.8 }, // chassis box: 3.0 m long, 1.6 m wide, 1.2 m tall
  wheelX: 1.0, wheelZ: 0.75, wheelY: -0.4, wheelR: 0.3, restM: 0.3,
  stiffness: 30, engineN: 6000, brakeN: 400, maxSteer: 0.5,
};
// The return lane, left of the outbound one: a full-lock left U-turn's diameter, 2 · wheelbase / tan(maxSteer) (~7.3 m).
export const laneOffsetM = (tug) => -2 * (2 * tug.wheelX) / Math.tan(tug.maxSteer);
const wrapPi = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

// The road in sim metres: start, unit direction, length; and the plane its collider lies in.
export function roadGeometry(road, heightAt) {
  const a = latLonToSimMeters(road.from.lat, road.from.lon);
  const b = latLonToSimMeters(road.to.lat, road.to.lon);
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const ya = heightAt(a.x, a.z), yb = heightAt(b.x, b.z);
  return { x0: a.x, z0: a.z, y0: ya, ux: dx / len, uz: dz / len, len, slope: (yb - ya) / len, widthM: road.widthM };
}

// (ux, uz) turned yawDeg towards the road's right, (-uz, ux).
function rotXZ(ux, uz, yawDeg) {
  const a = yawDeg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  return [ux * c - uz * sn, uz * c + ux * sn];
}

// Quaternion for yaw (about +Y) then pitch about the yawed lateral axis: local +X along the road, up the slope.
function roadQuat(ux, uz, slope) {
  const yaw = Math.atan2(-uz, ux), pitch = Math.atan(slope);
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  // q = qYaw(Y) * qPitch(Z): rotating local +X up about local +Z by the slope.
  return { x: sy * sp, y: sy * cp, z: cy * sp, w: cy * cp };
}

// start: { crossM, yawDeg } puts the tug off the lane at the start (tests: the steering must bring it back).
export function createPhysicsWorld(R, { heightAt, road = SERVICE_ROAD, tug = TUG, start = null } = {}) {
  const g = roadGeometry(road, heightAt);
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP_S;
  const q = roadQuat(g.ux, g.uz, g.slope);
  // The ground: one fixed cuboid 1 m thick whose top is the road's plane, 20 m past both ends. Flat:
  // the drawn terrain between the ends departs from it (up to ~0.4 m at the road's edge on SERVICE_ROAD;
  // sloped terrain colliders are a follow-up).
  // It is centred between the outbound lane and the return lane (lane, left of it), g.widthM wider.
  const lane = laneOffsetM(tug);
  const half = g.len / 2 + 20;
  const cs = Math.cos(Math.atan(g.slope));
  const mid = g.len / 2, off = lane / 2; // + right of the road's direction: (-uz, ux)
  const groundBody = world.createRigidBody(R.RigidBodyDesc.fixed()
    .setTranslation(g.x0 + g.ux * mid - g.uz * off, g.y0 + g.slope * mid - 0.5 / cs, g.z0 + g.uz * mid + g.ux * off)
    .setRotation(q));
  world.createCollider(R.ColliderDesc.cuboid(half / cs, 0.5, (g.widthM - lane) / 2).setFriction(1), groundBody);

  // The tug: a dynamic box, wheels clear of the road, nose (local +X) along the road.
  const h = tug.halfM;
  const startY = g.y0 - tug.wheelY + tug.restM + tug.wheelR + 0.05;
  const c0 = start?.crossM ?? 0;
  const q0 = start?.yawDeg ? roadQuat(...rotXZ(g.ux, g.uz, start.yawDeg), g.slope) : q;
  const chassis = world.createRigidBody(R.RigidBodyDesc.dynamic()
    .setTranslation(g.x0 + g.ux * 5 - g.uz * c0, startY + g.slope * 5, g.z0 + g.uz * 5 + g.ux * c0).setRotation(q0)
    .setCanSleep(false));
  const vol = 8 * h.x * h.y * h.z;
  world.createCollider(R.ColliderDesc.cuboid(h.x, h.y, h.z).setDensity(tug.massKg / vol), chassis);
  const car = world.createVehicleController(chassis);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    car.addWheel({ x: sx * tug.wheelX, y: tug.wheelY, z: sz * tug.wheelZ }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, tug.restM, tug.wheelR);
  }
  // Rapier's default 6 kN a wheel can't hold 3 t: the box sat on the road on bottomed springs.
  for (let i = 0; i < 4; i++) {
    car.setWheelSuspensionStiffness(i, tug.stiffness); car.setWheelFrictionSlip(i, 1.5);
    car.setWheelMaxSuspensionForce(i, tug.massKg * 9.81);
  }

  // The driver, a closed loop: out along the road, a full-lock left U-turn onto the return lane, back,
  // a U-turn onto the road again, a STOP_S hold, again. Speed by engine force (rear-wheel drive), each
  // lane held by the front wheels' steering (back on the lane over ~10 m, the nose along it).
  const st = { phase: 'out', hold: 0, laps: 0, along: 5, cross: 0, laneErr: 0, speed: 0, heading: 0, asleep: false, steps: 0, acc: 0 };
  const FAR = g.len - 5, NEAR = 5, DONE_RAD = 0.3; // a U-turn ends within ~17° of the new lane's heading
  // Rapier's getters fill these (no allocation a step; world.step itself makes and frees one RawVector).
  const p = { x: 0, y: 0, z: 0 }, r = { x: 0, y: 0, z: 0, w: 1 }, v = { x: 0, y: 0, z: 0 };
  chassis.translation(p);
  function drive() {
    chassis.translation(p); chassis.rotation(r);
    const rx = p.x - g.x0, rz = p.z - g.z0;
    st.along = rx * g.ux + rz * g.uz;
    st.cross = rx * -g.uz + rz * g.ux; // + to the right of the road's direction
    // The chassis' forward (local +X) in the ground plane, against the road: + nose right of the road.
    const fx = 1 - 2 * (r.y * r.y + r.z * r.z), fz = 2 * (r.x * r.z - r.w * r.y);
    st.heading = Math.atan2(fx * -g.uz + fz * g.ux, fx * g.ux + fz * g.uz);
    // Speed along the nose, from the chassis itself: the controller's currentVehicleSpeed jitters
    // ±0.06 m/s under the brakes while the tug stands still.
    chassis.linvel(v);
    const fn = Math.hypot(fx, fz) || 1;
    st.speed = (v.x * fx + v.z * fz) / fn;
    let target = TUG_MPS, steer = 0;
    switch (st.phase) {
      case 'out': if (st.along >= FAR) st.phase = 'turnFar'; break;
      case 'turnFar': if (Math.abs(wrapPi(st.heading + Math.PI)) < DONE_RAD) st.phase = 'back'; break;
      case 'back': if (st.along <= NEAR) st.phase = 'turnNear'; break;
      case 'turnNear': if (Math.abs(st.heading) < DONE_RAD) { st.phase = 'hold'; st.hold = 0; st.laps++; } break;
      default: if ((st.hold += STEP_S) >= STOP_S) st.phase = 'out';
    }
    if (st.phase === 'out') {
      st.laneErr = st.cross;
      steer = 0.15 * st.laneErr + 1.2 * st.heading;
    } else if (st.phase === 'back') {
      // The return lane in its own frame: its right is the road's left, its heading the road's reversed.
      st.laneErr = -(st.cross - lane);
      steer = 0.15 * st.laneErr + 1.2 * wrapPi(st.heading + Math.PI);
    } else if (st.phase === 'hold') target = 0;
    else { target = TURN_MPS; steer = tug.maxSteer; } // + steers left (it corrects a tug right of its lane)
    steer = Math.max(-tug.maxSteer, Math.min(tug.maxSteer, steer));
    // Speed: proportional on the engine force (it cruises on the target: the wheels roll freely; an
    // integral wound up through the pull-away and overshot 7-11%, physics panel).
    const force = target === 0 ? 0 : Math.max(-tug.engineN, Math.min(tug.engineN, 8000 * (target - st.speed)));
    const brake = target === 0 ? tug.brakeN : 0;
    for (let i = 0; i < 4; i++) {
      car.setWheelEngineForce(i, i >= 2 ? force : 0); // rear-wheel drive
      car.setWheelBrake(i, brake);
      car.setWheelSteering(i, i < 2 ? steer : 0);
    }
  }

  function stepOnce() {
    drive();
    car.updateVehicle(STEP_S);
    world.step();
    chassis.translation(p); // where the tug is now: step() reads it asleep without calling into the wasm
    st.steps++;
  }

  return {
    world, chassis, car, road: g, state: st,
    stepOnce,
    // One frame: `dt` of sim time, the aircraft at (ax, az). Asleep (no step, nothing carried over, no
    // call into the wasm, no allocation) while the aircraft is WAKE_M or more from the tug.
    step(dt, ax, az) {
      st.asleep = Math.hypot(ax - p.x, az - p.z) >= WAKE_M;
      if (st.asleep || !(dt > 0)) { st.acc = 0; return 0; }
      st.acc = Math.min(st.acc + dt, MAX_STEPS * STEP_S);
      let n = 0;
      while (st.acc >= STEP_S) { stepOnce(); st.acc -= STEP_S; n++; }
      return n;
    },
    // Where the tug is: position, rotation, the wheels in contact (allocates: tests and ?debug).
    snapshot() {
      const p = chassis.translation(), r = chassis.rotation(); // fresh objects: this one allocates
      let contact = 0;
      for (let i = 0; i < 4; i++) if (car.wheelIsInContact(i)) contact++;
      return { x: p.x, y: p.y, z: p.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w, phase: st.phase, laps: st.laps, along: st.along, cross: st.cross, laneErr: st.laneErr, heading: st.heading, speed: st.speed, contact, steps: st.steps, asleep: st.asleep };
    },
    // The road's height under (along) metres from its start (the collider's top).
    roadY(along) { return g.y0 + g.slope * along; },
    dispose() { world.free(); },
  };
}
