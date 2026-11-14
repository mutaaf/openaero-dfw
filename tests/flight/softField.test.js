// Soft-field takeoff lesson (ticket 0182): the Cessna 172S, flaps 10, full power, on the lesson's soft surface
// (softField.js SURFACE_MU, Raymer's soft turf 0.07, a game surface), flown three ways on flightModel.js and graded by
// softField.js: the Handbook's technique (FAA-H-8083-3C ch. 5: stick back from the start, the nose held ~11° up, lift
// off slow, level just above the runway to Vy 74 KIAS, then climb), the stick held forward until a normal rotation, and
// the Handbook's roll with a climb straight after the lift-off. Flat ground, still air, sea level ISA.
import { describe, it, expect } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, RAD_TO_DEG } from '../../src/constants.js';
import { elevatorForPitch } from '../../src/autopilot.js';
import { gearConstants } from '../../src/gear.js';
import { GRAVITY } from '../../src/constants.js';
import { createSoftField, softFieldStep, softFieldTarget, gradeSoftField, SURFACE_MU, FLAPS, PITCH_DEG, VY_KTS, ACCEL_KTS } from '../../src/softField.js';
import { missionByKey } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { makeBody, fly, attitude, speedHoldPilot } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const _e = new Euler();
const staticNose = gearConstants(c172).noseShare * c172.massKg * GRAVITY;

// tech: 'afh' (the lesson's), 'forward' (stick forward to 55 kt, rotate to 7°, climb at Vy) or 'climbEarly' (the
// lesson's roll, then a 60 kt climb from the lift-off). mu: the surface (null: the runway's own).
export function flySoftField(tech, { mu = SURFACE_MU, flaps = FLAPS } = {}) {
  const b = makeBody(c172, { throttle: 1, flaps });
  b.surfaceMu = mu;
  const st = createSoftField({ hdgT: 0 });
  const vy = speedHoldPilot(() => VY_KTS), slow = speedHoldPilot(() => 60);
  const prompts = [];
  let climbing = false, ended = false, levelCmd = null;
  fly(b, c172, 150, (x, dt) => {
    _e.setFromQuaternion(x.quat, 'YXZ');
    x.rudderInput = Math.max(-1, Math.min(1, _e.y * RAD_TO_DEG * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15));
    const { pitchDeg } = attitude(x);
    const wheelFt = x.onGround ? 0 : (x.pos.y - c172.gearHeight) * M_TO_FT;
    const s = {
      onGround: x.onGround, wheelFt, iasKts: x.iasKts ?? 0, gsKts: Math.hypot(x.vel.x, x.vel.z) * 1.943844, throttle: x.throttle,
      noseFrac: Math.max(0, x.wheelLoads?.[0] ?? 0) / staticNose, tailOn: (x.wheelLoads?.[3] ?? 0) > 0,
      alongM: -x.pos.z, leftM: 2000, crossM: x.pos.x, halfWidthM: 15, pitchDeg, kid: false,
    };
    const p = softFieldTarget(st, s);
    if (p && p !== prompts.at(-1)) prompts.push(p);
    if (softFieldStep(st, s, dt) === 'done') ended = true;
    if (st.phase === 'roll' || x.onGround) {
      if (tech === 'forward') x.elevInput = s.iasKts < 55 ? 0.5 : elevatorForPitch(7, pitchDeg, x.angVel.x);
      else x.elevInput = pitchDeg < PITCH_DEG - 2 ? -1 : elevatorForPitch(PITCH_DEG, pitchDeg, x.angVel.x);
      return;
    }
    if (tech === 'afh' && !climbing && s.iasKts < ACCEL_KTS) {
      // Level off gently from the lift-off attitude to hold the wheels ~8 ft up (a quick push sank it back on).
      levelCmd ??= pitchDeg;
      levelCmd = Math.max(0, Math.min(PITCH_DEG, levelCmd + ((8 - wheelFt) * 0.5 - x.vel.y * M_TO_FT) * 0.8 * dt));
      x.elevInput = elevatorForPitch(levelCmd, pitchDeg, x.angVel.x);
      return;
    }
    if (!climbing) { climbing = true; x.pitchCmd = pitchDeg; }
    (tech === 'climbEarly' ? slow : vy)(x, dt);
  }, () => ended);
  return { st, result: ended ? gradeSoftField(st) : null, prompts, rollFt: st.rollM === null ? null : st.rollM * M_TO_FT };
}

const log = (name, r) => console.log(`[softField] ${name}: lift-off ${r.st.liftKts?.toFixed(1)} KIAS after ${r.rollFt?.toFixed(0)} ft, `
  + `nose ${(r.st.noseSum / r.st.noseN).toFixed(2)}, ${ACCEL_KTS} kt at ${r.st.accelFt?.toFixed(0)} ft: ${r.result?.grade} ${r.result?.score}`
  + ` (${r.result?.reason ?? r.result?.note}); coach ${r.prompts.join(' > ')}`);

describe('Cessna 172S soft-field takeoff (flightModel, softField.js, ticket 0182)', () => {
  it('the mission is the lesson: Addison 16, the Cessna, flaps 10, the whole pavement, filed in Drills', () => {
    expect(missionByKey('kads_16_soft_field')).toMatchObject({ kind: 'takeoff', airport: 'KADS', rwy: '16', aircraft: 'c172', flaps: FLAPS, fullLength: true, softField: true, group: 'drills' });
    expect(missionFromLink('?mission=kads_16_soft_field')).toBe('kads_16_soft_field');
    expect(missionFromLink('?airport=KADS')).toBe('kads_16_final'); // "fly from Addison" is not the lesson
  });

  it('the soft surface drags: the same Handbook roll is at least 15% longer than on the paved runway (gear.js body.surfaceMu)', () => {
    const soft = flySoftField('afh'), paved = flySoftField('afh', { mu: null });
    log('afh, soft', soft); log('afh, paved', paved);
    expect(soft.rollFt).toBeGreaterThan(paved.rollFt * 1.15);
  });

  it("the Handbook's technique lifts off under 56 KIAS, holds ground effect to Vy and grades A or better", () => {
    const r = flySoftField('afh');
    expect(r.st.liftKts).toBeLessThan(56);
    expect(r.st.liftKts).toBeGreaterThan(45);
    expect(r.st.accelFt).toBeLessThan(20);
    expect(r.st.tail).toBe(false);
    expect(r.st.settled).toBe(false);
    expect(r.result.score).toBeGreaterThanOrEqual(85);
    expect(r.prompts[0]).toBe('sfoPower');
    expect(r.prompts).toContain('sfoAccel');
    expect(r.prompts.at(-1)).toBe('sfoClimb');
  });

  it('the stick held forward rolls visibly longer (at least 25%), lifts off faster and grades below B', () => {
    const afh = flySoftField('afh'), fwd = flySoftField('forward');
    log('forward', fwd);
    expect(fwd.rollFt).toBeGreaterThan(afh.rollFt * 1.25);
    expect(fwd.st.liftKts).toBeGreaterThan(afh.st.liftKts + 4);
    expect(fwd.result.score).toBeLessThan(70);
    expect(fwd.result.reason).toMatch(/nose wheel/);
    expect(fwd.prompts).toContain('sfoBack');
  });

  it('climbing out straight after the lift-off loses the ground-effect marks and is told so', () => {
    const r = flySoftField('climbEarly');
    log('climb early', r);
    expect(r.st.accelFt === null || r.st.accelFt > 60).toBe(true);
    expect(r.result.score).toBeLessThan(85);
    expect(r.result.reason).toMatch(/74 knots|ground effect/);
    expect(r.prompts).toContain('sfoLow');
  });
});
