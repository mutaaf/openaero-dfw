// Power-off 180° accuracy landing (ticket 0189), flown headless on flightModel.js from the
// mission's spawn (missions.js pad_180_kads_16): a left downwind for Addison 16 half a mile out,
// 1,000 ft above the field, abeam the spot (the 1,000 ft aiming-point marking, power180.js
// SPOT_M), 85 KIAS, the engine dead. The glide is the POH's: 68 KIAS best glide, Fig. 3-1's
// 1.5 NM per 1,000 ft (~9:1) flaps up, measured on this model at 8 to 11:1 (c172.test.js), and
// ~7.6:1 with flaps 20 (deadStick.js DS_RATIO_BY_FLAPS). The ACS window is the spot to 200 ft past
// it (FAA-S-ACS-7A, Area IV Task M). Flat ground at the field's height (y = 0).
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT } from '../../src/constants.js';
import { aileronForBank, elevatorForPitch } from '../../src/autopilot.js';
import { stallAoaDeg } from '../../src/aero.js';
import { missionByKey } from '../../src/missions.js';
import { P180_KEY, SPOT_X, SPOT_Z, createDeadStick, deadStickPrompt, kidGuide, p180Step } from '../../src/power180.js';
import { runwayEnd } from '../../src/airports.js';
import { makeBody, fly, speedHoldPilot, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const end = runwayEnd('KADS', '16');
const D = { x: Math.sin(end.hdgT * Math.PI / 180), z: -Math.cos(end.hdgT * Math.PI / 180) };

// mode: 'coach' (glide on till it says turn, round to the final, flaps when it asks), 'late' (the
// same, but the turn `lateS` seconds after the call: a long downwind), 'now' (the turn at once).
function power180(mode, { lateS = 8, windKts = 0, windFromDeg = 160 } = {}) {
  const m = missionByKey(P180_KEY);
  const b = Object.assign(makeBody(c172, { kts: m.kias, altM: m.aglFt / M_TO_FT }), { engineFailed: true });
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -m.hdg * Math.PI / 180);
  b.quat.premultiply(yaw);
  b.vel.applyQuaternion(yaw);
  b.pos.x = m.pos[0]; b.pos.z = m.pos[1];
  // A steady wind (blowing from windFromDeg): the body starts at its airspeed through that air.
  const wr = windFromDeg * Math.PI / 180;
  b.windVec.set(-Math.sin(wr) * windKts * 0.514444, 0, Math.cos(wr) * windKts * 0.514444);
  b.vel.add(b.windVec);
  const hold = speedHoldPilot(() => c172.vGlideKts);
  const st = createDeadStick(0), guide = {};
  const prompts = [];
  let flareI = null, td = null, callT = null;
  fly(b, c172, 300, (x, dt) => {
    const sim = { windVec: x.windVec, simTime: x.t, iasKts: x.iasKts, aglFt: x.pos.y * M_TO_FT, pos: x.pos, vel: x.vel, flapsIndex: x.flapsIndex, gsKts: x.gsKts, tasKts: x.tasKts, assist: 'pilot', aoaDeg: x.aoaDeg, spec: c172 };
    p180Step(st, sim);
    if (mode === 'now') st.turned = true;
    const p = deadStickPrompt(st, sim);
    if (p && p !== prompts[prompts.length - 1]) prompts.push(p);
    if (st.turned) callT ??= x.t;
    kidGuide(st, sim, guide); // the coach's turn and line-up (Kid's guide steers exactly what it says)
    if (mode === 'late' && callT !== null && x.t < callT + lateS) { st.turned = false; guide.guideBankDeg = 0; }
    x.flapsIndex = sim.flapsIndex;
    if (p === 'p1Flaps') x.flapsIndex = Math.max(x.flapsIndex, 2);
    if (p === 'p1High') x.flapsIndex = 3;
    const wheelM = x.pos.y - c172.gearHeight;
    const { pitchDeg, bankRightDeg } = attitude(x);
    if (wheelM > 15 / M_TO_FT) {
      hold(x, dt);
      x.aileronInput = aileronForBank(guide.guideBankDeg, bankRightDeg, -x.angVel.z);
    } else { // the round-out (harness.js shortFieldLanding's): sink shrinking with the height, held off short of the stall
      const sinkErr = -x.vel.y - Math.max(0.05, (wheelM - 0.3) / 2);
      const aoaRoom = stallAoaDeg(c172, x.flapsIndex) - 1 - x.aoaDeg;
      flareI ??= pitchDeg;
      if (sinkErr < 0 || aoaRoom > 0) flareI += sinkErr * 3 * dt;
      x.pitchCmd = Math.max(-5, Math.min(pitchDeg + aoaRoom, flareI + sinkErr * 5));
      x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
    }
    x.rudderInput = Math.max(-1, Math.min(1, (x.betaDeg ?? 0) * 0.1));
  }, (x) => {
    if (!x.onGround) return false;
    const rx = x.pos.x - SPOT_X, rz = x.pos.z - SPOT_Z;
    td = { pastSpotFt: (rx * D.x + rz * D.z) * M_TO_FT, crossM: rx * -D.z + rz * D.x, kts: x.iasKts, sinkFpm: -(x.lastAirVsi ?? 0), t: x.t, flaps: x.flapsIndex };
    return true;
  });
  return { td, prompts, stalled: st.stalled };
}

const log = (name, r) => console.log(`[c172 flightModel] power-off 180 ${name}: ${r.td.pastSpotFt.toFixed(0)} ft past the spot, ${r.td.crossM.toFixed(1)} m off, ${r.td.kts.toFixed(0)} KIAS, ${r.td.sinkFpm.toFixed(0)} fpm, flaps ${r.td.flaps}, ${r.td.t.toFixed(0)} s; coach ${r.prompts.join(' > ')}`);

describe('Cessna 172S power-off 180 at Addison 16 (flightModel, ticket 0189)', () => {
  it('flown as the coach says: on the spot to 400 ft past it, on the centreline, no stall', () => {
    const r = power180('coach');
    log('as coached', r);
    expect(r.td.pastSpotFt).toBeGreaterThanOrEqual(0);
    expect(r.td.pastSpotFt).toBeLessThanOrEqual(400);
    expect(Math.abs(r.td.crossM)).toBeLessThan(8);
    expect(r.stalled).toBe(false);
    expect(r.prompts[0]).toBe('p1Fail');
    expect(r.prompts.indexOf('p1WaitL')).toBeGreaterThan(0);
    expect(r.prompts.indexOf('p1TurnL')).toBeGreaterThan(r.prompts.indexOf('p1WaitL'));
    expect(r.prompts).not.toContain('p1Low');
  });

  it('a long downwind (the turn 8 s after the call) lands short of the spot', () => {
    const r = power180('late');
    log('turned 8 s late', r);
    expect(r.td.pastSpotFt).toBeLessThan(0);
  });

  // The coach reads the wind on each leg (power180.js legWind): down the runway, up it and across, at
  // 5 and 10 kt (Addison's METAR blows ~10 kt on a typical day). Measured 2026-11-16: 160°: +156 / −7 ft,
  // 340°: +74 / −68, 250°: +115 / +98, 070°: +122 / +126. At 15 kt it is −250 to +161 (logged, not carded).
  it('in a 5 or 10 kt wind from any side, as coached: 150 ft short to 300 ft past the spot', () => {
    for (const windKts of [5, 10, 15]) for (const windFromDeg of [160, 340, 250, 70]) {
      const r = power180('coach', { windKts, windFromDeg });
      log(`wind ${String(windFromDeg).padStart(3, '0')}/${windKts}`, r);
      if (windKts > 10) continue;
      expect(r.td.pastSpotFt).toBeGreaterThan(-150);
      expect(r.td.pastSpotFt).toBeLessThan(300);
      expect(Math.abs(r.td.crossM)).toBeLessThan(8);
    }
  });

  it('the turn at once, abeam the spot, is far too high: long past the window (the puzzle is real)', () => {
    const r = power180('now');
    log('turned at once', r);
    expect(r.td.pastSpotFt).toBeGreaterThan(1000);
  });
});
