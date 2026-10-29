// Engine failure after takeoff (ticket 0104): the Cessna 172S takes off from Addison 16 the way
// the mission spawns it (flaps 10, full power, rotate at Vr, climb at Vy 74 KIAS), and the
// engine quits at the mission's height. Then it is flown two ways: land ahead (68 KIAS, wings
// level, the flare) or turn back (react for a second, then a 45° teardrop back to 34 at 68
// KIAS). FAA-H-8083-3C ch. 18: below a safe height, land ahead; the FAA Safety Team handout:
// the turn back takes well over 180°. Flat ground at the field's height (sim y 0).
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, DEG_TO_RAD } from '../../src/constants.js';
import { stallAoaDeg } from '../../src/aero.js';
import { elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { runwayEnd, approachGeometry, takeoffSpawn } from '../../src/airports.js';
import { gradeLanding } from '../../src/landing.js';
import { missionByKey } from '../../src/missions.js';
import { createEngineOut, stepEngineOut, engineOutTarget, engineOutResult, turnbackBankDeg, landingEnd, EO_REACT_S } from '../../src/engineOut.js';
import { makeBody, fly, speedHoldPilot, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const E16 = runwayEnd('KADS', '16');
const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;

// mode: 'ahead', 'turnback' or 'stretch' (turning back with the nose held up). Returns the result card, the coach's prompts, the failure point
// and the touchdown.
export function flyEngineOut(key, mode) {
  const m = typeof key === 'string' ? missionByKey(key) : key;
  const b = makeBody(c172, { throttle: 1, flaps: m.flaps });
  const s0 = takeoffSpawn(E16, 30 - E16.displacedM); // main.js: a fullLength takeoff
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), s0.yawRad);
  b.quat.premultiply(yaw);
  b.pos.x = s0.pos.x; b.pos.z = s0.pos.z;
  const st = createEngineOut(m);
  // 'stretch': the instinct the Handbook warns about, the nose held up in the turn to save height.
  const climb = speedHoldPilot(() => 74), glide = speedHoldPilot(() => (mode === 'stretch' ? 50 : c172.vGlideKts));
  const prompts = [];
  let failT = null, flareI = null, fail = null, td = null, minIas = 999;
  const rec = (p) => { if (p && p !== prompts[prompts.length - 1]) prompts.push(p); };
  fly(b, c172, 400, (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    const track = (Math.atan2(x.vel.x, -x.vel.z) / DEG_TO_RAD + 360) % 360;
    const s = {
      t: x.t, aglFt: x.pos.y * M_TO_FT, x: x.pos.x, z: x.pos.z, trackDeg: x.onGround ? E16.hdgT : track,
      iasKts: x.iasKts ?? 0, tasKts: x.tasKts ?? 0, aoaDeg: x.aoaDeg ?? 0, stallAoaDeg: stallAoaDeg(c172, x.flapsIndex),
      flaps: x.flapsIndex, headwindKts: 0, bankMaxDeg: 45, kid: false, onGround: x.onGround,
    };
    if (stepEngineOut(st, s)) { x.engineFailed = true; failT = x.t; fail = { x: x.pos.x, z: x.pos.z, aglFt: s.aglFt, turnbackFt: st.turnbackFt }; }
    rec(engineOutTarget(st, s));
    x.rudderInput = x.onGround
      ? Math.max(-1, Math.min(1, -wrap180(headingDeg(x) - E16.hdgT) * 0.3 - x.angVel.y * 2))
      : Math.max(-1, Math.min(1, (x.betaDeg ?? 0) * 0.1));
    if (x.onGround && !x.engineFailed) {
      x.elevInput = (x.iasKts ?? 0) >= c172.vrKts ? elevatorForPitch(8, pitchDeg, x.angVel.x) : 0;
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
      return;
    }
    if (failT === null) { climb(x, dt); return; }
    if (x.t - failT < EO_REACT_S) return; // the moment it takes to notice: hands as they were
    if (failT !== null) minIas = Math.min(minIas, x.iasKts);
    const wheelM = x.pos.y - c172.gearHeight;
    if (wheelM > 20 / M_TO_FT) {
      glide(x, dt);
      let bank = 0;
      if (mode !== 'ahead') {
        bank = turnbackBankDeg(x.pos.x, x.pos.z, track);
      }
      x.aileronInput = aileronForBank(bank, bankRightDeg, -x.angVel.z);
      return;
    }
    // The flare (harness.js shortFieldLanding's): sink to the height left, up to the AoA limit.
    const sinkErr = -x.vel.y - Math.max(0.05, (wheelM - 0.3) / 2);
    const aoaRoom = stallAoaDeg(c172, x.flapsIndex) - 1 - x.aoaDeg;
    flareI ??= pitchDeg;
    if (sinkErr < 0 || aoaRoom > 0) flareI += sinkErr * 3 * dt;
    x.pitchCmd = Math.max(-5, Math.min(pitchDeg + aoaRoom, flareI + sinkErr * 5));
    x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
  }, (x) => {
    if (failT === null || !x.onGround) return false;
    const { pitchDeg, bankRightDeg } = attitude(x);
    const end = landingEnd(headingDeg(x));
    const g = approachGeometry(end, x.pos);
    const landing = gradeLanding({
      vsFpm: x.lastAirVsi, crossM: g.crossM, pastThresholdM: -g.distM, runwayLengthM: end.lengthM - end.displacedM,
      runwayWidthM: end.widthM, pitchDeg, bankDeg: -bankRightDeg, iasKts: x.iasKts, vrefKts: c172.vrefKts, gearLocked: true,
    });
    td = { end: end.ident, result: engineOutResult(landing, st, end, x.pos), vsFpm: x.lastAirVsi, bankDeg: bankRightDeg, t: x.t - failT };
    return true;
  });
  return { st, fail, td, prompts, minIas };
}
function headingDeg(x) {
  const e = new Vector3(0, 0, -1).applyQuaternion(x.quat);
  return (Math.atan2(e.x, -e.z) / DEG_TO_RAD + 360) % 360;
}

const log = (name, r) => console.log(`[engineOut] ${name}: fail at ${r.fail?.aglFt.toFixed(0)} ft (turnback needs ${r.fail?.turnbackFt.toFixed(0)}), `
  + `${r.td ? `touched ${r.td.t.toFixed(0)} s later on ${r.td.end}'s side at ${r.td.vsFpm} fpm, bank ${r.td.bankDeg.toFixed(0)}°, `
    + `${r.td.result.grade} ${r.td.result.score} (${r.td.result.reason ?? r.td.result.note})` : 'no touchdown'}, turn cost ${r.st.costFt.toFixed(0)} ft, `
  + `stalled ${r.st.stalled}, min ${r.minIas.toFixed(0)} KIAS; coach ${r.prompts.join(' > ')}`);

describe('Cessna 172S engine failure after takeoff at Addison (flightModel, ticket 0104)', () => {
  it('300 ft, landed ahead: survives, graded C or better, and the coach said land ahead', () => {
    const r = flyEngineOut('efato_kads_16_300', 'ahead');
    log('300 ft ahead', r);
    expect(r.td).not.toBeNull();
    expect(r.td.result.grade).not.toBe('CRASH');
    expect(r.td.result.score).toBeGreaterThanOrEqual(55);
    expect(r.prompts.slice(0, 2)).toEqual(['eoClimb', 'eoFail']);
    expect(r.prompts).toContain('eoAhead');
    expect(r.prompts).not.toContain('eoCanTurn');
    expect(r.prompts).not.toContain('eoFailTurn');
  });

  it('300 ft, turned back: does not make the runway (lands short, beside or crashes), a D at best, and the coach says too low', () => {
    const r = flyEngineOut('efato_kads_16_300', 'turnback');
    log('300 ft turnback', r);
    expect(r.td).not.toBeNull();
    expect(r.td.result.madeRunway && r.td.result.grade !== 'CRASH').toBe(false);
    expect(['D', 'CRASH']).toContain(r.td.result.grade);
    expect(r.st.costFt).toBeGreaterThan(100);
    expect(r.prompts).toContain('eoTooLow');
  });

  it('300 ft, turned back with the nose held up to save height: stalls in the turn, a D at best, and the card says so', () => {
    const r = flyEngineOut('efato_kads_16_300', 'stretch');
    log('300 ft stretched turn', r);
    expect(r.st.stalled).toBe(true);
    expect(['D', 'CRASH']).toContain(r.td.result.grade);
    expect(r.td.result.reason).toMatch(/^Stalled in the turn back.*The turn cost you \d+ ft\.$/);
  });

  it('700 ft, turned back: the turn reaches runway 34 and lands on it, and the coach allowed the turn', () => {
    const r = flyEngineOut('efato_kads_16_700', 'turnback');
    log('700 ft turnback', r);
    expect(r.td).not.toBeNull();
    expect(r.td.end).toBe('34');
    expect(r.td.result.madeRunway).toBe(true);
    expect(r.td.result.grade).not.toBe('CRASH');
    expect(r.st.stalled).toBe(false);
    expect(r.prompts.slice(0, 2)).toEqual(['eoClimb', 'eoFailTurn']);
    expect(r.prompts).toContain('eoTurning');
    expect(r.prompts).not.toContain('eoTooLow');
    expect(r.prompts).not.toContain('eoAhead');
  });

  // The coach's turnback height (engineOut.js turnbackHeightFt: glide ratio, the turn's sink and
  // radius, the glide back, the climb's spare speed) against the airplane: failed every 50 ft
  // from 300 to 1,100 ft and turned back, it makes the runway exactly where the coach says it
  // can, except within 25 ft of the line. In still air the window closes at both ends: too low
  // for the turn, then (the climb gradient, ~9%, is shallower than the glide back, ~11%) too
  // far from the runway.
  it('the turn back makes the runway where the coach says it can (300 to 1,100 ft; a window, both ends)', () => {
    const base = missionByKey('efato_kads_16_300');
    const rows = [];
    for (let ft = 300; ft <= 1100; ft += 50) {
      const r = flyEngineOut({ ...base, engineOutFt: ft }, 'turnback');
      rows.push({ ft, needFt: r.fail.turnbackFt, made: !!r.td?.result.madeRunway && r.td.result.grade !== 'CRASH' });
    }
    console.log(`[engineOut] turnback window: ${rows.map((w) => `${w.ft}:${w.made ? 'made' : 'no'}/${w.needFt.toFixed(0)}`).join(' ')}`);
    for (const w of rows) if (Math.abs(w.needFt - w.ft) > 25) expect({ ft: w.ft, made: w.made }).toEqual({ ft: w.ft, made: w.needFt < w.ft });
    expect(rows.some((w) => w.made)).toBe(true);
    expect(rows[0].made).toBe(false);
    expect(rows[rows.length - 1].made).toBe(false);
  });
});
