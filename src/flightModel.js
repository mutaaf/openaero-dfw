// The 6-DOF rigid-body flight model: one sub-step of forces, moments and integration.
// Pure (three.js math only, no DOM, no scene): main.js runs it on `sim` every frame, and
// tests/flight/ runs it headless to fly test cards against published performance data.
//
// `body` carries the state and the control positions under the same names as main.js's
// `sim`: pos, vel, quat, angVel (world frame, see autopilot.js for the sign conventions),
// elevInput, aileronInput, rudderInput, throttle, flapsIndex, gearDown, brakesOn, apMaster,
// windVec (air-mass velocity) and groundY (terrain height under the aircraft), trimAlphaDeg
// (the angle of attack the elevator trim flies; autoTrim = it follows α), engineFailed (the
// dead-stick drill, 0036: the engine makes no power whatever the throttle; the prop windmills); optional
// air: mslOffsetM (MSL height of y = 0), isaDevC and altimInHg (atmosphere.js). The step
// writes back onGround, lastAirVsi, iasKts, tasKts, gsKts, mach, aoaDeg, betaDeg, accelY,
// sigma (density ratio), engineN (spooled power setting; seed it with the throttle on spawn),
// spoilers (ground spoiler extension 0–1, airframes with spec.groundSpoilers). Systems
// (systems.js) run first: the gear, flaps, brakes and reversers follow their levers at
// their own rates, so the aerodynamics see where the surfaces are, not where the levers are.
import { Vector3, Quaternion, Euler, MathUtils } from 'three';
import { MPS_TO_KTS, M_TO_FT, DEG_TO_RAD, RAD_TO_DEG, GRAVITY } from './constants.js';
import { airAt } from './atmosphere.js';
import { engineThrust, spoolEngine, throttleForThrust } from './engine.js';
import { dynamicPressure, liftCoefficient, groundEffectFactor, dragCoefficient } from './aero.js';
import { sideslipYawAccel, trimAoaDeg } from './autopilot.js';
import { stepSystems, brakeMu, reversedThrust, gearLocked } from './systems.js';
import { gearConstants, gearForces, gearFriction, noseSteerYawRate, noseWheelYawHold, tailVsMainsAccel } from './gear.js';

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _v4 = new Vector3();
const _q1 = new Quaternion();
const _euler = new Euler(0, 0, 0, 'YXZ');
const _air = {};
const _gearM = new Vector3();
const BETA_LIN = 20 * DEG_TO_RAD;
// Wider than any airframe's elevatorAlphaDeg, so no held stick out-pulls the restoring moment.
const ALPHA_LIN = 90 * DEG_TO_RAD;

export function stepFlightModel(body, spec, dt) {
  stepSystems(body, spec, dt);
  // Transform the AIR-RELATIVE velocity to the body frame: u (fwd), v (right), w (down).
  // Aerodynamics see the air mass, not the ground (weather.js wind, gusts included).
  const invQuat = _q1.copy(body.quat).invert();
  const bodyVel = _v1.copy(body.vel).sub(body.windVec).applyQuaternion(invQuat);
  const u = -bodyVel.z;
  const v = bodyVel.x;
  const w = -bodyVel.y;

  // The air here: ISA + today's temperature and altimeter (atmosphere.js).
  const air = airAt(body.pos.y + (body.mslOffsetM ?? 0), body.isaDevC ?? 0, body.altimInHg ?? 29.92, _air);
  body.sigma = air.sigma;

  const airspeed = Math.max(0.1, bodyVel.length());
  body.tasKts = airspeed * MPS_TO_KTS;
  body.iasKts = body.tasKts * Math.sqrt(air.sigma); // EAS ≈ CAS below Mach 0.3
  body.gsKts = Math.round(Math.hypot(body.vel.x, body.vel.z) * MPS_TO_KTS);
  body.mach = airspeed / air.speedOfSoundMps;

  // Angle of Attack (AoA) and Sideslip (Beta)
  const aoaRad = Math.atan2(w, Math.max(u, 0.1));
  body.aoaDeg = aoaRad * RAD_TO_DEG;
  const betaRad = Math.asin(MathUtils.clamp(v / airspeed, -1, 1));
  body.betaDeg = betaRad * RAD_TO_DEG;

  const qDyn = dynamicPressure(airspeed, air.rho);

  // Aerodynamic Lift & Drag Curves with Post-Stall Drop (aero.js)
  let cl = liftCoefficient(spec, aoaRad, body.flapPos);

  // Induced Drag Polar + Ground Effect Factor (aero.js)
  const groundEffect = groundEffectFactor(body.pos.y - body.groundY, spec.wingSpanM);
  let cd = dragCoefficient(spec, cl, body.gearPos, body.flapPos, groundEffect);

  // Auto ground spoilers: out over ~1 s on the ground with the thrust levers at idle, in
  // again as soon as they are advanced (reverse thrust keeps them out). Lift dumped onto
  // the gear and brakes, plus drag.
  if (spec.groundSpoilers) {
    const deploy = body.onGround && (body.throttle < 0.05 || body.reverserPos > 0) ? 1 : 0;
    body.spoilers = MathUtils.clamp((body.spoilers ?? 0) + Math.sign(deploy - (body.spoilers ?? 0)) * dt, 0, 1);
    cl *= 1 - spec.groundSpoilers.liftDump * body.spoilers;
    cd += spec.groundSpoilers.dCd * body.spoilers;
  }

  const liftForce = cl * qDyn * spec.wingAreaM2;
  const dragForce = cd * qDyn * spec.wingAreaM2;
  body.engineN = spoolEngine(spec, body.engineN ?? body.throttle, body.engineFailed ? 0 : body.throttle, dt);
  const thrustForce = reversedThrust(spec, engineThrust(spec, body.engineN, airspeed, air, body.mach, qDyn), body.reverserPos);

  // Lift is perpendicular to the relative wind (in the plane of the body's lateral axis),
  // drag is along it; both built in body axes from the air-relative velocity direction.
  // Thrust acts along the nose. (Body-axis lift leaned aft by α and acted as drag.)
  const vHat = _v3.copy(bodyVel).divideScalar(airspeed);
  const liftDir = _v4.set(1, 0, 0).cross(vHat).normalize();
  // Sideslip pushes the fuselage and fin sideways (CYβ, body axes; + β = relative wind from
  // the right, so the force is to the left): the side force a wing-low slip banks against.
  // Linear derivatives, held at their 20° value beyond (a taxiing crosswind is all β, no q).
  const betaLin = MathUtils.clamp(betaRad, -BETA_LIN, BETA_LIN);
  // The rudder pushes the fin the other way (CYδr: right rudder, tail left), so a slip's
  // opposite rudder takes back part of it.
  const rudderRad = body.rudderInput * (spec.controlThrowsDeg?.rudder ?? 0) * DEG_TO_RAD;
  const sideForce = ((spec.cyBeta ?? 0) * betaLin - (spec.cyRudder ?? 0) * rudderRad) * qDyn * spec.wingAreaM2;
  const fBodyX = liftDir.x * liftForce - vHat.x * dragForce + sideForce;
  const fBodyY = liftDir.y * liftForce - vHat.y * dragForce;
  const fBodyZ = liftDir.z * liftForce - vHat.z * dragForce - thrustForce;

  const totalForceWorld = _v2.set(fBodyX, fBodyY, fBodyZ).applyQuaternion(body.quat);
  totalForceWorld.y -= spec.massKg * GRAVITY;

  // Ground Spring-Damper Suspension, on the real ground under the aircraft (terrain.js)
  // 1 cm contact tolerance: on a sloped runway, sub-nanometre drift along the slope changes
  // the ground height by ~1e-13 m, which must not count as lifting off.
  // Gear not down and locked: it folds, and the aircraft sits on its belly and scrapes.
  const locked = gearLocked(body);
  // Airframes with spec.gear stand on three struts (gear.js): nose and mains, each with its
  // load, and their moments turn the airframe (rotation about the mains, the nose coming
  // down, a one-wheel touchdown). The floor below is then the struts fully compressed.
  const struts = locked && spec.gear;
  _gearM.set(0, 0, 0);
  const gh = struts
    ? body.groundY + spec.gearHeight + spec.gear.strokeM - gearConstants(spec).maxStroke
    : body.groundY + spec.gearHeight * (locked ? 1 : 0.35);
  let normalForce = 0, held = false;
  if (struts) {
    // A wheel can reach the ground only when the CG is lower than the longest leg below it.
    if (body.pos.y <= body.groundY + spec.gearHeight + spec.gear.noseZ + 1) normalForce = gearForces(body, spec, totalForceWorld, _gearM);
  } else if (body.pos.y <= gh + 0.01) {
    const penetration = gh - body.pos.y;
    const kSpring = spec.massKg * 85;
    const kDamper = spec.massKg * 9;
    // The gear carries whatever the wing doesn't (the contact is also held by the position
    // clamp below, so the spring alone sees ~no compression and would carry ~nothing, which
    // left rolling friction and the brakes with no load), or more while it absorbs a sink.
    normalForce = Math.max(0, penetration * kSpring - body.vel.y * kDamper, -totalForceWorld.y);
    totalForceWorld.y += normalForce;
    normalForce = Math.max(normalForce, 1e-6);
  }
  if (normalForce > 0) {
    body.onGround = true;

    // Tyres: rolling resistance (μ·N, plus the brakes: systems.js) along the nose, and a stiff side
    // force across it so the aircraft rolls where it points instead of skating sideways.
    // (The prototype used friction ∝ speed, which capped the takeoff roll near 75 kt.)
    const fwd = _v3.set(0, 0, -1).applyQuaternion(body.quat);
    fwd.y = 0;
    fwd.normalize();
    const vAlong = body.vel.x * fwd.x + body.vel.z * fwd.z;
    const vSideX = body.vel.x - fwd.x * vAlong;
    const vSideZ = body.vel.z - fwd.z * vAlong;
    // Raymer: rolling μ 0.03 on concrete/asphalt; the brakes add up to what anti-skid gets
    // from the runway (systems.js). A belly slides at μ ~0.5.
    // On struts the friction acts per wheel at its axle (gear.js): brakes on the mains, and
    // their pull below the CG loads the nose wheel.
    if (struts) gearFriction(body, spec, fwd, vAlong, totalForceWorld, _gearM);
    else {
      const mu = locked ? brakeMu(spec, body.brakePress) : 0.5;
      const roll = Math.abs(vAlong) > 0.3 ? -Math.sign(vAlong) * mu * normalForce : -vAlong * spec.massKg * 2;
      totalForceWorld.x += fwd.x * roll;
      totalForceWorld.z += fwd.z * roll;
    }
    const sideMax = 0.8 * normalForce;
    let sideX = -vSideX * spec.massKg * 4, sideZ = -vSideZ * spec.massKg * 4;
    // Nearly stopped on its wheels, the tyres also hold a steady push across them (a crosswind
    // on a parked airplane, ticket 0106) instead of letting it creep sideways.
    held = struts && Math.abs(vAlong) <= 0.3 && Math.hypot(vSideX, vSideZ) <= 0.3;
    if (held) {
      const push = totalForceWorld.x * fwd.x + totalForceWorld.z * fwd.z;
      sideX -= totalForceWorld.x - fwd.x * push;
      sideZ -= totalForceWorld.z - fwd.z * push;
    }
    totalForceWorld.x += MathUtils.clamp(sideX, -sideMax, sideMax);
    totalForceWorld.z += MathUtils.clamp(sideZ, -sideMax, sideMax);
    body.vAlongMps = vAlong;
  } else {
    body.onGround = false;
  }

  const accel = totalForceWorld.divideScalar(spec.massKg);
  body.accelY = accel.y;
  body.vel.addScaledVector(accel, dt);
  body.pos.addScaledVector(body.vel, dt);

  // Sink rate at the moment of contact, captured before the ground clamp zeroes it.
  if (!body.onGround) body.lastAirVsi = Math.round(body.vel.y * M_TO_FT * 60);

  if (body.pos.y < gh) {
    body.pos.y = gh;
    if (body.vel.y < 0) body.vel.y = 0;
  }

  // Angular Moments & Inertial Damping
  // Static pitch stability (Cmα, ticket 0090): the nose is pulled back to the angle of attack
  // the elevator trim is set for (body.trimAlphaDeg), and the stick moves that angle by the
  // elevator balance: full stick = spec.elevatorAlphaDeg of α (Cmδe·δe / Cmα), so a released
  // stick flies the trimmed speed. Its stiffness is the pitch authority over that angle (the
  // short period is as soft as the elevator is weak; the trim α per stick is the source's). A
  // pilot or autopilot that trims as it holds a pitch (body.autoTrim), or a fly-by-wire pitch
  // law (spec.pitchFbw), carries the trim with the angle of attack, so the term is zero.
  const authority = spec.pitchAuthority ?? 1.8;
  if (body.autoTrim || spec.pitchFbw || body.trimAlphaDeg == null) body.trimAlphaDeg = body.aoaDeg;
  const stiffness = spec.elevatorAlphaDeg ? authority / (spec.elevatorAlphaDeg * DEG_TO_RAD) : 0;
  const alphaErr = MathUtils.clamp(aoaRad - body.trimAlphaDeg * DEG_TO_RAD, -ALPHA_LIN, ALPHA_LIN);
  const qRate = (-body.elevInput * authority - stiffness * alphaErr - body.angVel.x * spec.pitchDamping) * (airspeed / 120);
  // aileron + rolls right (negative body z rate); see autopilot.js for the conventions.
  // Dihedral effect (Clβ): sideslip rolls the windward wing up (dihedralAileron below).
  const dihedral = dihedralAileron(spec, betaRad);
  const pRate = (-(body.aileronInput + dihedral) * (spec.rollAuthority ?? 2.8) - body.angVel.z * spec.rollDamping) * (airspeed / 120);
  // Rudder + directional stability: the nose weathervanes into the relative wind, so a
  // banked aircraft actually turns.
  const rRate = (-body.rudderInput * 1.2 + sideslipYawAccel(betaRad) - body.angVel.y * spec.yawDamping) * (airspeed / 120);

  body.angVel.x += qRate * dt;
  body.angVel.y += rRate * dt;
  body.angVel.z += pRate * dt;

  // The struts' moments (body axes: x pitch, y yaw, z roll) through the airframe's inertia,
  // and the pedals steering the nose wheel while it carries weight.
  if (struts && body.onGround) {
    body.angVel.x += (_gearM.x / spec.inertia.pitch + tailVsMainsAccel(body, spec, body.iasKts)) * dt;
    body.angVel.y += (_gearM.y / spec.inertia.yaw) * dt;
    body.angVel.z += (_gearM.z / spec.inertia.roll) * dt;
    const steer = noseSteerYawRate(body, spec, body.vAlongMps ?? 0);
    // Held still on its braked mains, the airplane keeps its heading: locked tyres can't scrub
    // round, so the wind can't weathervane it (0106). Otherwise the loaded nose tyre holds its
    // steered rate up to its grip (0110).
    if (steer !== null) body.angVel.y += held && (body.brakePress ?? 0) > 0.5 ? steer - body.angVel.y : noseWheelYawHold(body, spec, steer - body.angVel.y, dt);
  }

  if (Math.abs(body.aileronInput) < 0.05 && !body.apMaster) {
    body.angVel.z -= body.angVel.z * 1.5 * dt;
  }

  // Integrate Orientation Quaternion
  const deltaRot = _q1.set(
    body.angVel.x * dt * 0.5,
    body.angVel.y * dt * 0.5,
    body.angVel.z * dt * 0.5,
    1.0
  ).normalize();
  body.quat.multiply(deltaRot).normalize();

  // On the ground the gear and tail limit pitch: no rotating past the tailstrike angle.
  if (body.onGround) {
    _euler.setFromQuaternion(body.quat, 'YXZ');
    const maxP = (spec.maxGroundPitchDeg ?? 15) * DEG_TO_RAD;
    // With struts the nose gear holds the nose up; the floor is only a backstop.
    const minP = struts ? -0.12 : -0.05;
    if (_euler.x > maxP || _euler.x < minP) {
      _euler.x = MathUtils.clamp(_euler.x, minP, maxP);
      body.quat.setFromEuler(_euler);
      if ((_euler.x >= maxP && body.angVel.x > 0) || (_euler.x <= minP && body.angVel.x < 0)) body.angVel.x = 0;
    }
  }
}

// The dihedral effect (Clβ) as the aileron that makes the same rolling moment (Clβ·β / Cl of
// full aileron), so the two keep their real ratio; + = rolls right. β linear to 20°. The
// assists (assists.js) feed its opposite forward so the stick still commands a bank.
export const dihedralAileron = (spec, betaRad) => (spec.clBeta && spec.clAileron
  ? (spec.clBeta * MathUtils.clamp(betaRad, -BETA_LIN, BETA_LIN)) / spec.clAileron
  : 0);

// Throttle that holds `iasMps` on a steady flight path of `gammaDeg` (negative = descent)
// at the trim angle of attack, out of ground effect: thrust·cos α = D + W·sin γ. Spawns use
// it so a final starts in trim whatever the drag polar and engine are. `air` is the
// atmosphere there (airAt; indicated airspeed in, so lift and drag don't depend on it).
export function trimThrottle(spec, iasMps, flapsIndex, gammaDeg, gearDown = true, air = airAt(0)) {
  const aoaRad = trimAoaDeg(spec, iasMps, flapsIndex) * DEG_TO_RAD;
  const cl = liftCoefficient(spec, aoaRad, flapsIndex);
  const q = dynamicPressure(iasMps);
  const drag = dragCoefficient(spec, cl, gearDown, flapsIndex, 1) * q * spec.wingAreaM2;
  const thrust = (drag + spec.massKg * GRAVITY * Math.sin(gammaDeg * DEG_TO_RAD)) / Math.cos(aoaRad);
  const tas = iasMps / Math.sqrt(air.sigma);
  return throttleForThrust(spec, thrust, tas, air, tas / air.speedOfSoundMps, q);
}
