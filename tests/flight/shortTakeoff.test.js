// Short-field takeoff lesson (ticket 0225): the Cessna 172S at 2,550 lb, sea level ISA, still air, flown headless on both
// flight models and graded by shortTakeoff.js against POH Fig. 5-5 sheet 1 (p. 5-14: 960 ft roll, 1,633 ft to 50 ft at
// 15 °C, interpolated; lift off 51 KIAS, 56 KIAS at 50 ft). Pilots:
//  - 'poh': the Section 4 checklist (p. 4-16): flaps 10, the brakes held, full throttle, then the brakes off; the coach's
//    rotation (back at ROTATE_KTS to about PITCH_DEG, "slightly tail low"), 56 KIAS to 50 ft, then Vy 74.
//  - 'early': hauled off: back at 35 KIAS to 13° (just under the 13.7° tail), then 56 as before (AFH FAA-H-8083-3C p. 6-11: the
//    weight on the wheels to the lift-off speed; p. 6-12, "premature lift-off").
//  - 'flapsUp': flaps 0, a normal rotation (55 KIAS to 7°), climbing at Vy: "a flaps-up, low-pitch roll" (the ticket).
//  - 'idleRelease': the POH's technique, but the brakes let go at idle and the power run up on the roll (3 s).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, RAD_TO_DEG } from '../../src/constants.js';
import { elevatorForPitch } from '../../src/autopilot.js';
import {
  createShortTakeoff, shortTakeoffStep, shortTakeoffTarget, gradeShortTakeoff, pohTakeoff,
  FLAPS, ROTATE_KTS, PITCH_DEG, OBSTACLE_KTS, VY_KTS, OBSTACLE_FT, POH_BAND, CAP_B,
} from '../../src/shortTakeoff.js';
import { missionByKey } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { makeBody, fly, attitude, speedHoldPilot, useFdm } from './harness.js';
import { nodeJsbsim } from './jsbsimNode.js';

const c172 = AIRCRAFT_DATABASE.c172;
const _e = new Euler();
const POH = pohTakeoff(0); // sea level, 29.92, 15 °C, calm: 960 / 1,633 ft

export function flyShortTakeoff(tech) {
  const flaps = tech === 'flapsUp' ? 0 : FLAPS;
  const b = makeBody(c172, { throttle: tech === 'idleRelease' ? 0 : 1, flaps });
  b.brakesOn = true;
  const st = createShortTakeoff({ hdgT: 0, elevFt: 0 });
  const obst = speedHoldPilot(() => OBSTACLE_KTS), vy = speedHoldPilot(() => VY_KTS);
  const rotKts = tech === 'early' ? 35 : tech === 'flapsUp' ? 55 : ROTATE_KTS;
  const pitch = tech === 'early' ? 13 : tech === 'flapsUp' ? 7 : PITCH_DEG;
  const prompts = [];
  let ended = false, mode = null, maxPitch = 0;
  fly(b, c172, 150, (x, dt) => {
    _e.setFromQuaternion(x.quat, 'YXZ');
    x.rudderInput = Math.max(-1, Math.min(1, _e.y * RAD_TO_DEG * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15));
    const { pitchDeg } = attitude(x);
    maxPitch = Math.max(maxPitch, pitchDeg);
    // The brakes: off after 3 s of full power (the engine spooled), or at once for the idle release, the power then run up.
    if (x.brakesOn && x.t > 3) x.brakesOn = false;
    if (tech === 'idleRelease') { if (x.t < 0.5) x.brakesOn = false; x.throttle = Math.min(1, x.t / 3); }
    const wheelFt = x.onGround ? 0 : (x.pos.y - c172.gearHeight) * M_TO_FT;
    const s = {
      brakes: x.brakesOn, throttle: x.throttle, flapsIndex: x.flapsIndex, onGround: x.onGround, wheelFt, iasKts: x.iasKts ?? 0,
      gsKts: Math.hypot(x.vel.x, x.vel.z) * 1.943844, alongM: -x.pos.z, leftM: 2000, crossM: x.pos.x, halfWidthM: 15, pitchDeg,
      tailOn: (x.wheelLoads?.[3] ?? 0) > 0, poh: POH, kid: false,
    };
    const p = shortTakeoffTarget(st, s);
    if (p && p !== prompts.at(-1)) prompts.push(p);
    if (shortTakeoffStep(st, s, dt) === 'done') ended = true;
    if (st.phase === 'hold' || st.phase === 'roll' || x.onGround) {
      x.elevInput = s.iasKts < rotKts ? 0 : elevatorForPitch(pitch, pitchDeg, x.angVel.x);
      return;
    }
    const want = tech === 'flapsUp' || st.obstM !== null ? 'vy' : 'obst';
    if (want !== mode) { mode = want; x.pitchCmd = pitchDeg; x.pitchTrim = undefined; }
    (want === 'vy' ? vy : obst)(x, dt);
  }, () => ended);
  return {
    st, prompts, maxPitch, result: ended ? gradeShortTakeoff(st) : null,
    rollFt: st.rollM === null ? null : st.rollM * M_TO_FT, obstFt: st.obstM === null ? null : st.obstM * M_TO_FT,
  };
}

const log = (model, name, r) => console.log(`[shortTakeoff ${model}] ${name}: roll ${r.rollFt?.toFixed(0)} ft (POH ${POH.rollFt.toFixed(0)}), `
  + `lift-off ${r.st.liftKts?.toFixed(1)} KIAS, 50 ft at ${r.obstFt?.toFixed(0)} ft (POH ${POH.totalFt.toFixed(0)}) at ${r.st.obstKts?.toFixed(1)} KIAS, `
  + `min ${r.st.minKts?.toFixed(1)} from 20 ft, peak pitch ${r.maxPitch.toFixed(1)}°: ${r.result?.grade} ${r.result?.score} (${r.result?.reason}); coach ${r.prompts.join(' > ')}`);

describe('short-field takeoff mission (0225)', () => {
  it('is the lesson: Addison 16, the Cessna, flaps 10, the whole pavement, in Drills; "fly from Addison" is not it', () => {
    expect(missionByKey('kads_16_short_field_takeoff')).toMatchObject({ kind: 'takeoff', airport: 'KADS', rwy: '16', aircraft: 'c172', flaps: FLAPS, fullLength: true, shortTakeoff: true, group: 'drills' });
    expect(missionFromLink('?mission=kads_16_short_field_takeoff')).toBe('kads_16_short_field_takeoff');
    expect(missionFromLink('?airport=KADS')).toBe('kads_16_final');
  });
});

for (const model of ['flightModel', 'jsbsim']) describe(`Cessna 172S short-field takeoff lesson vs POH Fig. 5-5 (${model}, ticket 0225)`, () => {
  beforeAll(async () => useFdm(model === 'jsbsim' ? await nodeJsbsim() : null));
  afterAll(() => useFdm(null));
  const runs = {};
  const run = (tech) => (runs[tech] ??= flyShortTakeoff(tech));

  it('the brakes hold the Cessna at full power (POH: full throttle prior to brake release)', () => {
    const b = makeBody(c172, { throttle: 1, flaps: FLAPS });
    b.brakesOn = true;
    fly(b, c172, 3, null, null);
    expect(b.distM * M_TO_FT).toBeLessThan(3);
  });

  it("the POH's technique: lifts off near 51 KIAS, 56 at 50 ft, within the table's x 1.15, and grades A or better", () => {
    const r = run('poh');
    log(model, 'poh', r);
    expect(r.st.why).toBeNull();
    expect(r.st.tail).toBe(false);
    expect(Math.abs(r.st.liftKts - 51)).toBeLessThanOrEqual(4);
    expect(Math.abs(r.st.obstKts - OBSTACLE_KTS)).toBeLessThanOrEqual(3);
    expect(r.rollFt / POH.rollFt).toBeLessThanOrEqual(POH_BAND);
    expect(r.obstFt / POH.totalFt).toBeLessThanOrEqual(POH_BAND);
    expect(r.result.score).toBeGreaterThanOrEqual(85);
    expect(r.prompts[0]).toBe('stoRelease'); // flaps 10 and full power already: "let the brakes go"
    expect(r.prompts).toContain('stoRoll');
    expect(r.prompts).toContain('stoHold');
    expect(r.prompts).toContain('stoObstacle');
    expect(r.prompts.at(-1)).toBe('stoClear');
  });

  // AFH p. 6-12's "premature lift-off resulting in high drag": the game's Cessna barely pays for it in distance (printed),
  // so the lesson grades the technique (shortTakeoff.js NOSE_UP_DEG, EARLY_KTS).
  it('hauled off early (35 KIAS to 13°): capped B, below the POH technique, the early nose named', () => {
    const poh = run('poh'), r = run('early');
    log(model, 'early', r);
    expect(r.result.score).toBeLessThan(poh.result.score);
    expect(r.result.score).toBeLessThan(85);
    expect(r.st.rotateKts).toBeLessThan(ROTATE_KTS - 8);
    expect(r.result.score).toBeLessThanOrEqual(CAP_B);
    expect(r.result.reason).toMatch(/Nose up too early/);
  });

  // The D is mostly the flaps-up technique (55 KIAS to 7°, a Vy climb). Flaps 0 flown with the POH rotation and 56 KIAS
  // rolls 8-15% longer and reaches 50 ft 1-6% later (physics panel): the flaps cap's B, near POH p. 4-25's "approximately
  // 10 percent".
  it('flaps up and a low-pitch rotation: a longer roll, later to 50 ft, capped B with the flaps named', () => {
    const poh = run('poh'), r = run('flapsUp');
    log(model, 'flaps up', r);
    expect(r.rollFt).toBeGreaterThan(poh.rollFt);
    expect(r.obstFt).toBeGreaterThan(poh.obstFt);
    expect(r.result.score).toBeLessThanOrEqual(CAP_B);
    expect(r.result.score).toBeLessThan(poh.result.score);
    expect(r.result.reason).toMatch(/Flaps 0° at the lift-off/);
  });

  // AFH p. 6-11: "it has not been established that this procedure results in a shorter takeoff run in all light,
  // single-engine airplanes." The game's Cessna barely creeps at idle, so the wait costs time, not runway (printed). The card
  // names the POH's checklist (and its table's "Full Throttle Prior to Brake Release"), it claims no distance for it.
  it('the brakes let go at idle: about the same roll (the AFH: not established), the checklist named, no cap', () => {
    const poh = run('poh'), r = run('idleRelease');
    log(model, 'idle release', r);
    expect(Math.abs(r.rollFt / poh.rollFt - 1)).toBeLessThan(0.05);
    expect(r.st.releaseThrottle).toBeLessThan(0.5);
    expect(r.result.reason).toMatch(/Full power on the brakes first/);
    expect(r.result.score).toBeGreaterThan(CAP_B);
    expect(r.prompts).toContain('stoPowerRoll');
  });

  it(`clearing ${OBSTACLE_FT} ft later than the table's x 1.15 caps B`, () => {
    const st = { ...run('poh').st, obstM: (POH.totalFt * 1.2) / M_TO_FT };
    const g = gradeShortTakeoff(st);
    expect(g.score).toBeLessThanOrEqual(CAP_B);
    expect(g.reason).toMatch(/past the handbook's 1,633 ft/);
  });
});
