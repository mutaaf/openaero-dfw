// The 6-DOF rigid-body flight model: one sub-step of forces, moments and integration.
// Pure (three.js math only, no DOM, no scene): main.js runs it on `sim` every frame, and
// tests/flight/ runs it headless to fly test cards against published performance data.
//
// `body` carries the state and the control positions under the same names as main.js's
// `sim`: pos, vel, quat, angVel (world frame, see autopilot.js for the sign conventions),
// elevInput, aileronInput, rudderInput, throttle, flapsIndex, gearDown, brakesOn, apMaster,
// windVec (air-mass velocity) and groundY (terrain height under the aircraft). The step
// writes back onGround, lastAirVsi, iasKts, tasKts, gsKts, mach, aoaDeg, betaDeg, accelY.
import { Vector3, Quaternion, Euler, MathUtils } from 'three';
import { MPS_TO_KTS, M_TO_FT, DEG_TO_RAD, RAD_TO_DEG, GRAVITY, SPEED_OF_SOUND_KTS } from './constants.js';
import { dynamicPressure, liftCoefficient, groundEffectFactor, dragCoefficient } from './aero.js';
import { sideslipYawAccel } from './autopilot.js';

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _q1 = new Quaternion();
const _euler = new Euler(0, 0, 0, 'YXZ');

export function stepFlightModel(body, spec, dt) {
  // Transform the AIR-RELATIVE velocity to the body frame: u (fwd), v (right), w (down).
  // Aerodynamics see the air mass, not the ground (weather.js wind, gusts included).
  const invQuat = _q1.copy(body.quat).invert();
  const bodyVel = _v1.copy(body.vel).sub(body.windVec).applyQuaternion(invQuat);
  const u = -bodyVel.z;
  const v = bodyVel.x;
  const w = -bodyVel.y;

  const airspeed = Math.max(0.1, bodyVel.length());
  body.tasKts = airspeed * MPS_TO_KTS;
  body.iasKts = body.tasKts;
  body.gsKts = Math.round(Math.hypot(body.vel.x, body.vel.z) * MPS_TO_KTS);
  body.mach = body.tasKts / SPEED_OF_SOUND_KTS;

  // Angle of Attack (AoA) and Sideslip (Beta)
  const aoaRad = Math.atan2(w, Math.max(u, 0.1));
  body.aoaDeg = aoaRad * RAD_TO_DEG;
  body.betaDeg = Math.asin(MathUtils.clamp(v / airspeed, -1, 1)) * RAD_TO_DEG;

  const qDyn = dynamicPressure(airspeed);

  // Aerodynamic Lift & Drag Curves with Post-Stall Drop (aero.js)
  const cl = liftCoefficient(spec, aoaRad, body.flapsIndex);

  // Induced Drag Polar + Ground Effect Factor (aero.js)
  const groundEffect = groundEffectFactor(body.pos.y - body.groundY, spec.wingSpanM);
  const cd = dragCoefficient(spec, cl, body.gearDown, body.flapsIndex, groundEffect);

  const liftForce = cl * qDyn * spec.wingAreaM2;
  const dragForce = cd * qDyn * spec.wingAreaM2;
  const thrustForce = body.throttle * spec.maxThrustN;

  // Body Forces
  const fBodyX = -dragForce * (v / airspeed);
  const fBodyY = liftForce;
  const fBodyZ = -thrustForce + dragForce;

  const totalForceWorld = _v2.set(fBodyX, fBodyY, fBodyZ).applyQuaternion(body.quat);
  totalForceWorld.y -= spec.massKg * GRAVITY;

  // Ground Spring-Damper Suspension, on the real ground under the aircraft (terrain.js)
  // 1 cm contact tolerance: on a sloped runway, sub-nanometre drift along the slope changes
  // the ground height by ~1e-13 m, which must not count as lifting off.
  const gh = body.groundY + spec.gearHeight;
  if (body.pos.y <= gh + 0.01) {
    const penetration = gh - body.pos.y;
    const kSpring = spec.massKg * 85;
    const kDamper = spec.massKg * 9;
    const normalForce = Math.max(0, penetration * kSpring - body.vel.y * kDamper);

    totalForceWorld.y += normalForce;
    body.onGround = true;

    // Tyres: rolling resistance (μ·N, brakes μ 0.45) along the nose, and a stiff side
    // force across it so the aircraft rolls where it points instead of skating sideways.
    // (The prototype used friction ∝ speed, which capped the takeoff roll near 75 kt.)
    const fwd = _v3.set(0, 0, -1).applyQuaternion(body.quat);
    fwd.y = 0;
    fwd.normalize();
    const vAlong = body.vel.x * fwd.x + body.vel.z * fwd.z;
    const vSideX = body.vel.x - fwd.x * vAlong;
    const vSideZ = body.vel.z - fwd.z * vAlong;
    const mu = body.brakesOn ? 0.45 : 0.02;
    const roll = Math.abs(vAlong) > 0.3 ? -Math.sign(vAlong) * mu * normalForce : -vAlong * spec.massKg * 2;
    totalForceWorld.x += fwd.x * roll;
    totalForceWorld.z += fwd.z * roll;
    const sideMax = 0.8 * normalForce;
    totalForceWorld.x += MathUtils.clamp(-vSideX * spec.massKg * 4, -sideMax, sideMax);
    totalForceWorld.z += MathUtils.clamp(-vSideZ * spec.massKg * 4, -sideMax, sideMax);
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
  const qRate = (-body.elevInput * (spec.pitchAuthority ?? 1.8) - body.angVel.x * spec.pitchDamping) * (airspeed / 120);
  // aileron + rolls right (negative body z rate); see autopilot.js for the conventions
  const pRate = (-body.aileronInput * (spec.rollAuthority ?? 2.8) - body.angVel.z * spec.rollDamping) * (airspeed / 120);
  // Rudder + directional stability: the nose weathervanes into the relative wind, so a
  // banked aircraft actually turns.
  const betaRad = Math.asin(MathUtils.clamp(v / airspeed, -1, 1));
  const rRate = (-body.rudderInput * 1.2 + sideslipYawAccel(betaRad) - body.angVel.y * spec.yawDamping) * (airspeed / 120);

  body.angVel.x += qRate * dt;
  body.angVel.y += rRate * dt;
  body.angVel.z += pRate * dt;

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
    if (_euler.x > maxP || _euler.x < -0.05) {
      _euler.x = MathUtils.clamp(_euler.x, -0.05, maxP);
      body.quat.setFromEuler(_euler);
      if ((_euler.x >= maxP && body.angVel.x > 0) || (_euler.x <= -0.05 && body.angVel.x < 0)) body.angVel.x = 0;
    }
  }
}
