// Moving parts that follow the flight model (ticket 0063): ailerons, elevator, rudder and
// flaps deflect with the control state, the landing gear swings with its hydraulic travel,
// and the prop and fans turn with the engine's spool. Pure mapping + a per-frame pose that
// allocates nothing; used for the primitive stand-ins (main.js) and the glTF models
// (aircraftModel.js) alike.
//
// A model's moving parts are nodes named `ctl_aileron_L/R`, `ctl_elevator` (or `_L/_R`),
// `ctl_rudder`, `ctl_flap_L/R`, `gear_nose`, `gear_main_L/R`, `prop`, `fan_L/R`, each with
// its origin on the hinge line (body frame: x right, y up, z aft). A hinged surface turns
// about its own local X (local +X along the hinge, pointing right): + is trailing edge down.
// The rudder turns about its local Y: + is trailing edge right. Parts a model lacks are
// skipped.
//
// Sign conventions (autopilot.js, pinned by tests): aileron + = roll right, so the right
// aileron goes up and the left one down; elevator + = nose down, so the elevator's trailing
// edge goes down; rudder + = yaw right, trailing edge right.

import { Quaternion, Vector3 } from 'three';

const D2R = Math.PI / 180;

// Throws (degrees) when a spec has none: generic, deliberately modest.
const DEFAULT_THROWS = { aileronUp: 20, aileronDown: 15, elevatorUp: 20, elevatorDown: 15, rudder: 20 };

export const throwsOf = (spec) => spec.controlThrowsDeg ?? DEFAULT_THROWS;

// Surface angles (radians) for a control state, written into `out` (reused, no allocation).
// body: { aileronInput, elevInput, rudderInput ∈ [-1, 1], flapDeg (actual, systems.js),
// gearPos (0 up → 1 down) }. aileronL/R, elevator and flapL/R are + trailing edge down,
// rudder + trailing edge right. A flaperon (spec.flaperons) adds the flap to the aileron.
export function surfaceAngles(spec, body, out) {
  const t = throwsOf(spec);
  const a = clamp1(body.aileronInput), e = clamp1(body.elevInput), r = clamp1(body.rudderInput);
  // Roll right (a > 0): the right aileron rises by the up throw, the left one drops by the down throw.
  out.aileronR = (a > 0 ? -a * t.aileronUp : -a * t.aileronDown) * D2R;
  out.aileronL = (a > 0 ? a * t.aileronDown : a * t.aileronUp) * D2R;
  out.elevator = (e > 0 ? e * t.elevatorDown : e * t.elevatorUp) * D2R;
  out.rudder = r * t.rudder * D2R;
  out.flapL = out.flapR = Math.max(0, body.flapDeg ?? 0) * D2R;
  if (spec.flaperons) {
    // The F-16's flaperons are its flaps too: the droop is at most 20° and gives way to the
    // roll command (roll first, as the flight control computer mixes them), then the sum is
    // held within the throws.
    const roll = Math.abs(a) * Math.max(t.aileronUp, t.aileronDown) * D2R;
    const f = Math.min(out.flapL, 20 * D2R, Math.max(0, t.aileronDown * D2R - roll));
    out.aileronL = Math.min(t.aileronDown * D2R, Math.max(-t.aileronUp * D2R, out.aileronL + f));
    out.aileronR = Math.min(t.aileronDown * D2R, Math.max(-t.aileronUp * D2R, out.aileronR + f));
    out.flapL = out.flapR = 0;
  }
  out.gear = Math.min(1, Math.max(0, body.gearPos ?? (body.gearDown ? 1 : 0)));
  return out;
}

const clamp1 = (v) => Math.max(-1, Math.min(1, v || 0));

const PART_NAMES = ['ctl_aileron_L', 'ctl_aileron_R', 'ctl_elevator', 'ctl_elevator_L', 'ctl_elevator_R', 'ctl_rudder',
  'ctl_flap_L', 'ctl_flap_R', 'gear_nose', 'gear_main_L', 'gear_main_R', 'prop', 'fan_L', 'fan_R'];

// Finds the moving parts under `root` and remembers each one's rest orientation. Called once
// per model (allocates); `poseParts` then only writes to these nodes.
export function rigParts(root) {
  const rig = { parts: [], spin: [], gear: [] };
  root.traverse((o) => {
    if (!PART_NAMES.includes(o.name)) return;
    const p = { node: o, rest: o.quaternion.clone(), name: o.name };
    if (o.name === 'prop' || o.name.startsWith('fan_')) rig.spin.push(o);
    else if (o.name.startsWith('gear_')) rig.gear.push(p);
    else rig.parts.push(p);
  });
  return rig;
}

// For main.js's ?debug snapshot (e2e): each rigged node's name, its turn from rest (deg) and
// whether it shows.
export const partPoses = (rig) => [...rig.parts, ...rig.gear].map((p) => ({
  name: p.name, deg: 2 * Math.acos(Math.min(1, Math.abs(p.rest.dot(p.node.quaternion)))) * 180 / Math.PI, visible: p.node.visible,
}));

const _angles = { aileronL: 0, aileronR: 0, elevator: 0, rudder: 0, flapL: 0, flapR: 0, gear: 1 };
const _q = new Quaternion(), _ax = new Vector3(1, 0, 0), _ay = new Vector3(0, 1, 0), _az = new Vector3(0, 0, 1);

function angleFor(name, a) {
  switch (name) {
    case 'ctl_aileron_L': return a.aileronL;
    case 'ctl_aileron_R': return a.aileronR;
    case 'ctl_flap_L': return a.flapL;
    case 'ctl_flap_R': return a.flapR;
    case 'ctl_rudder': return a.rudder;
    default: return a.elevator; // ctl_elevator, ctl_elevator_L/R
  }
}

// Gear retraction (rad, about the leg's hinge) at travel `pos` (1 down, 0 up): the nose leg
// folds forward (+X), the mains inboard (left +Z, right −Z), a quarter turn when up.
export function gearSwing(name, pos) {
  const up = (1 - pos) * Math.PI / 2;
  return name === 'gear_main_R' ? -up : up;
}

// Poses every rigged part for this frame: surfaces from the control state, gear from its
// travel (hidden once stowed), spinners advanced by `spinRad` (rad this frame).
export function poseParts(rig, spec, body, spinRad) {
  const a = surfaceAngles(spec, body, _angles);
  for (let i = 0; i < rig.parts.length; i++) {
    const p = rig.parts[i];
    _q.setFromAxisAngle(p.name === 'ctl_rudder' ? _ay : _ax, angleFor(p.name, a));
    p.node.quaternion.copy(p.rest).multiply(_q);
  }
  for (let i = 0; i < rig.gear.length; i++) {
    const p = rig.gear[i];
    p.node.visible = a.gear > 0.02;
    _q.setFromAxisAngle(p.name === 'gear_nose' ? _ax : _az, gearSwing(p.name, a.gear));
    p.node.quaternion.copy(p.rest).multiply(_q);
  }
  for (let i = 0; i < rig.spin.length; i++) rig.spin[i].rotation.z += spinRad;
  return a;
}

// How fast the prop/fans turn (rad/s) at spool `n` (engine.js: follows the throttle with
// the engine's lag). A visual rate, not the shaft speed: a real 2,700 rpm prop strobes
// at 60 fps, so it is drawn as a blur-speed spin that rises with power.
export const spinRate = (n) => 30 + Math.max(0, Math.min(1, n || 0)) * 80;
