// Crosswind takeoff lesson (ticket 0220): the Cessna 172S, flaps up, full power, a 12 kt wind straight across from the right
// (the lesson's scenario wind; the POH demonstrates 15), flown three ways on flightModel.js and graded by xwTakeoff.js:
//  - 'afh': the Airplane Flying Handbook's technique (FAA-H-8083-3C ch. 6, "Crosswind Takeoff", pp. 6-6 to 6-8): full aileron
//    into the wind as the roll starts, held to 40 KIAS and then eased to what keeps the upwind wing a little low through the lift-off, the rudder holding the
//    centreline, the nose eased up at the POH's 55 KIAS, and once climbing a crab into the wind that holds the track over the
//    extended centreline;
//  - 'noAileron': the same, but the stick left in the middle on the roll (p. 6-9's "less than full aileron pressure into the
//    wind initially");
//  - 'noCrab': the handbook's roll, then wings level with the nose on the runway heading after the lift-off (p. 6-9's
//    "inadequate drift correction after lift-off").
// Flat ground, sea level ISA, a runway along x = 0 heading north (harness.js makeBody).
import { describe, it, expect } from 'vitest';
import { Euler, Vector3 } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { KTS_TO_MPS, M_TO_FT, RAD_TO_DEG } from '../../src/constants.js';
import { elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { createXwTakeoff, lessonWx, xwTakeoffSimStep, xwTakeoffSimPrompt, gradeXwTakeoff, AIL_TO_KTS, VR_KTS } from '../../src/xwTakeoff.js';
import { makeBody, fly, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const _e = new Euler();
// Addison 16's length and width, the runway turned to north (airports.js: 7,203 x 100 ft).
const END = { id: 'T_16', airport: 'KADS', hdgT: 0, thrX: 0, thrZ: 0, lengthM: 2195, displacedM: 0, widthM: 30.5 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function flyXwTakeoff(tech, { xwKts = 12, fromLeft = false } = {}) {
  const b = makeBody(c172, { throttle: 1, flaps: 0 });
  b.spec = c172; b.groundY = 0;
  const st = createXwTakeoff(END);
  // The scenario wind is from 090 (12 kt from the right); fromLeft flies the mirror (270).
  lessonWx(st, { live: true, icao: 'KADS', windDirDeg: fromLeft ? 270 : 90, windKts: xwKts, gustKts: null });
  const sign = fromLeft ? -1 : 1; // + = the wind's side is right
  b.windVec.copy(new Vector3(-sign * xwKts * KTS_TO_MPS, 0, 0));
  const prompts = new Set();
  let maxBankRollDeg = 0;
  fly(b, c172, 150, (x) => {
    _e.setFromQuaternion(x.quat, 'YXZ');
    const noseHdg = (-_e.y * RAD_TO_DEG + 360) % 360;
    const yawLeft = _e.y * RAD_TO_DEG;
    const { pitchDeg, bankRightDeg } = attitude(x);
    const offFt = x.pos.x * M_TO_FT;
    const wheelFt = x.onGround ? 0 : (x.pos.y - c172.gearHeight) * M_TO_FT;
    if (x.onGround || wheelFt < 20) {
      // The pedals: the runway heading, steering back to the centreline (harness.js crosswindTakeoff's pilot).
      const want = clamp(offFt * 0.15 + x.vel.x * M_TO_FT * 0.3, -3, 3);
      x.rudderInput = clamp((yawLeft - want) * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15, -1, 1);
            // The handbook's aileron: full into the wind to AIL_TO_KTS, then eased over 10 kt to what holds the upwind wing a
      // little low (p. 6-7: aileron into the wind held through the lift-off, the airplane sideslipping into the wind).
      const ease = clamp((x.iasKts - AIL_TO_KTS) / 10, 0, 1);
      const hold = aileronForBank(sign * 4, bankRightDeg, -x.angVel.z) / 0.6;
      x.aileronInput = tech === 'noAileron' && x.onGround ? 0 : clamp(sign * (1 - ease) + hold * ease, -1, 1);
      if (x.onGround) maxBankRollDeg = Math.max(maxBankRollDeg, Math.abs(bankRightDeg));
    } else {
      // The climb: bank to a heading; the handbook's crab points the nose into the wind by the drift it sees (the track off the
      // runway) plus a pull back to the extended centreline. noCrab keeps the nose on the runway heading.
      const trackDeg = Math.atan2(x.vel.x, -x.vel.z) * RAD_TO_DEG;
      const crab = tech === 'noCrab' ? 0 : clamp(noseHdg > 180 ? noseHdg - 360 : noseHdg, -20, 20) - trackDeg - clamp(offFt * 0.05, -10, 10);
      const hdgCmd = tech === 'noCrab' ? 0 : crab;
      const hdgErr = hdgCmd - (noseHdg > 180 ? noseHdg - 360 : noseHdg);
      x.aileronInput = aileronForBank(clamp(hdgErr * 2, -15, 15), bankRightDeg, -x.angVel.z) / 0.6;
      x.rudderInput = clamp((x.betaDeg ?? 0) * 0.3, -1, 1); // the ball centred (harness.js RUDDER_PER_BETA)
    }
    if (x.iasKts >= VR_KTS || !x.onGround) x.elevInput = elevatorForPitch(8, pitchDeg, x.angVel.x);
    const s = xwTakeoffSimPrompt(st, x, noseHdg, bankRightDeg);
    if (s) prompts.add(s);
    xwTakeoffSimStep(st, x, noseHdg, bankRightDeg, 1 / 120);
  }, () => st.phase === 'done');
  return { st, grade: gradeXwTakeoff(st), prompts, maxBankRollDeg };
}

const row = (g, k) => g.factors.find((f) => f.key === k);

describe('Cessna 172S crosswind takeoff lesson, 12 kt from the right (FAA-H-8083-3C ch. 6, pp. 6-6 to 6-9)', () => {
  it('the handbook takeoff stays on the centreline, lifts off at Vr and crabs over the extended centreline; no aileron or no crab grades lower', () => {
    const afh = flyXwTakeoff('afh');
    const noAil = flyXwTakeoff('noAileron');
    const noCrab = flyXwTakeoff('noCrab');
    for (const [n, r] of Object.entries({ afh, noAil, noCrab })) {
      console.log(`[0220 ${n}] ${r.grade.grade} ${r.grade.score}: ${r.grade.factors.map((f) => `${f.key} ${f.value} (${f.score})`).join('; ')}; `
        + `bank on the wheels ±${r.maxBankRollDeg.toFixed(1)}°, why ${r.st.why}, skipped ${r.st.skipped}, 200 ft ${(r.st.endCrossM * M_TO_FT).toFixed(0)} ft across; ${r.grade.reason}`);
    }
    // The handbook's takeoff: done at 200 ft, on the runway, no skip, lifted off near Vr, the crab within the wind's angle.
    expect(afh.st.why).toBeNull();
    expect(afh.st.skipped).toBe(false);
    expect(afh.st.maxOffM * M_TO_FT).toBeLessThan(25);
    expect(afh.st.liftKts).toBeGreaterThan(VR_KTS - 5);
    expect(afh.st.liftBankIntoDeg).toBeGreaterThanOrEqual(-1); // the upwind wing held down through the lift-off (p. 6-7)
    expect(row(afh.grade, 'ail').score).toBe(100);
    expect(row(afh.grade, 'track').score).toBeGreaterThanOrEqual(90);
    expect(afh.grade.score).toBeGreaterThanOrEqual(85);
    // The crab angle it flew is the wind correction angle's sign and size (12 kt across at ~65-75 kt: ~9-11°).
    const crab = afh.st.crabSum / afh.st.trackN;
    expect(crab).toBeGreaterThan(5);
    expect(crab).toBeLessThan(15);
    // No aileron into the wind: the aileron row is gone, the grade falls. On flightModel.js the roll's bank barely differs
    // (gear.js's struts hold the wings: ±0.4° with the aileron, ±0.6° without; c172.test.js prints ±0.7° for its 15 kt roll),
    // so the grade falls through the technique the handbook asks for, not a wing the model lifts.
    expect(noAil.maxBankRollDeg).toBeGreaterThanOrEqual(afh.maxBankRollDeg);
    expect(row(noAil.grade, 'ail').score).toBe(0);
    expect(noAil.grade.score).toBeLessThan(afh.grade.score - 15);
    expect(noAil.grade.reason).toMatch(/Too little aileron into the wind/);
    // No crab: it drifts off the extended centreline with the wind (left), and the track row falls.
    expect(noCrab.st.endCrossM).toBeLessThan(-30 / M_TO_FT);
    expect(row(noCrab.grade, 'track').score).toBeLessThan(60);
    expect(noCrab.grade.score).toBeLessThan(afh.grade.score - 10);
    // The coach named the stick and the crab on the handbook's flight.
    // The coach: power with the stick already in, hold it, rotate, the sideslip, then the crab; with the stick in the middle
    // it asks for the aileron before the power and on the roll.
    expect([...afh.prompts]).toEqual(expect.arrayContaining(['xtPower', 'xtHoldR', 'xtEaseR', 'xtRotate', 'xtSlipR', 'xtCrabR']));
    expect([...noAil.prompts]).toEqual(expect.arrayContaining(['xtBriefR', 'xtAilR']));
    expect([...afh.prompts].some((k) => k.endsWith('L'))).toBe(false);
  }, 30000);

  it('flies the mirror: a wind from the left takes the stick left and the crab left, and grades the same', () => {
    const r = flyXwTakeoff('afh');
    const l = flyXwTakeoff('afh', { fromLeft: true });
    console.log(`[0220 mirror] right ${r.grade.score}, left ${l.grade.score}; ${l.grade.factors.map((f) => `${f.key} ${f.value}`).join('; ')}`);
    expect(l.st.side).toBe('L');
    expect(l.st.why).toBeNull();
    expect(row(l.grade, 'ail').score).toBe(100);
    expect(l.st.crabSum / l.st.trackN).toBeGreaterThan(5); // into the wind (the crab is measured toward the wind's side)
    expect(Math.abs(l.grade.score - r.grade.score)).toBeLessThanOrEqual(8); // the prop's left-turning tendency differs by side
    expect([...l.prompts]).toEqual(expect.arrayContaining(['xtHoldL', 'xtSlipL', 'xtCrabL']));
  }, 30000);
});
