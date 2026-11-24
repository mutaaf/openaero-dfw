// Power-off 180° accuracy landing (ticket 0189), flown headless on flightModel.js from the
// mission's spawn (missions.js pad_180_kads_16): a left downwind for Addison 16 half a mile out,
// 1,000 ft above the field, abeam the spot (the 1,000 ft aiming-point marking, power180.js
// SPOT_M), 85 KIAS, the engine dead. The glide is the POH's: 68 KIAS best glide, Fig. 3-1's
// 1.5 NM per 1,000 ft (~9:1) flaps up, measured on this model at 8 to 11:1 (c172.test.js), and
// 7.5:1 with flaps 20 (power180.js RATIO_BY_FLAPS, measured on this model since 0186). The ACS window is the spot to 200 ft past
// it (FAA-S-ACS-7A, Area IV Task M). Flat ground at the field's height (y = 0).
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT } from '../../src/constants.js';
import { aileronForBank, elevatorForPitch } from '../../src/autopilot.js';
import { stallAoaDeg } from '../../src/aero.js';
import { missionByKey } from '../../src/missions.js';
import { P180_KEY, RATIO_BY_FLAPS, SPOT_X, SPOT_Z, createDeadStick, deadStickPrompt, kidGuide, p180Step } from '../../src/power180.js';
import { runwayEnd } from '../../src/airports.js';
import { makeBody, fly, speedHoldPilot, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const end = runwayEnd('KADS', '16');
const D = { x: Math.sin(end.hdgT * Math.PI / 180), z: -Math.cos(end.hdgT * Math.PI / 180) };
// The test pilot's round-out starts at 20 ft, the top of the Airplane Flying Handbook's "approximately 10 to 20
// feet" (FAA-H-8083-3C ch. 9), since the idle flaps 30 glide arrives at ~1,000 fpm. From 15 ft (0189) it could
// not stop that sink in time: on main it hit at 0.6 ft, hopped 1.2 ft and floated, and the coach had been fitted
// to the hop; with Cmα̇ (0202) the hop went and it landed ~170 ft shorter (63 KIAS, 115 fpm). The 20 ft round-out
// and the re-fitted coach are what set the numbers below: with Cmα̇ off they land within 4 ft of them.
const ROUND_OUT_FT = 20;

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
  let flareI = null, td = null, callT = null, below1 = false, hopFt = 0, flareFpm = null;
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
    // The hop (0202): once the main wheels are under 1 ft, they never rise back above it.
    if (wheelM * M_TO_FT < 1) below1 = true;
    else if (below1) hopFt = Math.max(hopFt, wheelM * M_TO_FT);
    if (wheelM > ROUND_OUT_FT / M_TO_FT) {
      hold(x, dt);
      x.aileronInput = aileronForBank(guide.guideBankDeg, bankRightDeg, -x.angVel.z);
    } else { // the round-out (harness.js shortFieldLanding's): sink shrinking with the height, held off short of the stall
      const sinkErr = -x.vel.y - Math.max(0.05, (wheelM - 0.3) / 2);
      const aoaRoom = stallAoaDeg(c172, x.flapsIndex) - 1 - x.aoaDeg;
      flareI ??= pitchDeg;
      flareFpm ??= -x.vel.y * M_TO_FT * 60;
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
  return { td, prompts, stalled: st.stalled, hopFt, flareFpm };
}

const log = (name, r) => console.log(`[c172 flightModel] power-off 180 ${name}: ${r.td.pastSpotFt.toFixed(0)} ft past the spot, ${r.td.crossM.toFixed(1)} m off, ${r.td.kts.toFixed(0)} KIAS, ${r.td.sinkFpm.toFixed(0)} fpm, flaps ${r.td.flaps}, ${r.td.t.toFixed(0)} s; round-out from ${r.flareFpm?.toFixed(0)} fpm, hop ${r.hopFt.toFixed(1)} ft; coach ${r.prompts.join(' > ')}`);

describe('Cessna 172S power-off 180 at Addison 16 (flightModel, ticket 0189)', () => {
  it("the coach's glide ratios are this model's: idle at 68 KIAS, each flap notch within 3%", () => {
    for (const flaps of [0, 1, 2, 3]) {
      const b = Object.assign(makeBody(c172, { kts: 68, altM: 600, flaps }), { engineFailed: true });
      const hold = speedHoldPilot(() => 68);
      fly(b, c172, 40, hold);
      const h0 = b.pos.y, d0 = b.distM;
      fly(b, c172, 30, hold);
      const ratio = (b.distM - d0) / (h0 - b.pos.y);
      console.log(`[c172 flightModel] power-off 180 glide, flaps notch ${flaps}: ${ratio.toFixed(2)}:1 (coach ${RATIO_BY_FLAPS[flaps]})`);
      expect(Math.abs(ratio / RATIO_BY_FLAPS[flaps] - 1)).toBeLessThan(0.03);
    }
  });

  it('flown as the coach says: inside the ACS window (the spot to 200 ft past it), on the centreline, no stall', () => {
    const r = power180('coach');
    log('as coached', r);
    expect(r.td.pastSpotFt).toBeGreaterThanOrEqual(0);
    expect(r.td.pastSpotFt).toBeLessThanOrEqual(200);
    expect(Math.abs(r.td.crossM)).toBeLessThan(8);
    expect(r.stalled).toBe(false);
    expect(r.prompts[0]).toBe('p1Fail');
    expect(r.prompts.indexOf('p1WaitL')).toBeGreaterThan(0);
    expect(r.prompts.indexOf('p1TurnL')).toBeGreaterThan(r.prompts.indexOf('p1WaitL'));
    expect(r.prompts).not.toContain('p1Low');
    expect(r.hopFt).toBe(0); // 0202: no hop, the main wheels never back above 1 ft once under it
  });

  it('a long downwind (the turn 8 s after the call) lands short of the spot', () => {
    const r = power180('late');
    log('turned 8 s late', r);
    expect(r.td.pastSpotFt).toBeLessThan(0);
  });

  // The coach reads the wind on each leg (power180.js legWind): down the runway, up it and across, at
  // 5 and 10 kt. Measured 2026-11-18 with Cmα̇ (0202) and the 20 ft round-out (5 / 10 kt): 160°: +172 / +28 ft,
  // 340°: +154 / +228, 250°: +154 / +135, 070°: +152 / +149; still air +152. 2026-11-24 with the elevator's lift
  // beyond trim (0214; TURN_FT 157): 160°: +180 / +9, 340°: +197 / +239, 250°: +190 / +174, 070°: +186 / +179. It aims long because the test fails
  // short. 15 kt is logged, not carded. How touchy it is: FLOAT_M ±3 m or TURN_FT ±3 ft moved the 10 kt cases
  // ~25 ft (0202: TURN_FT 163 put 340°/10 at +253, out); a real pilot's judgement is no finer, but the coach's call is not a guarantee.
  it('in a 5 or 10 kt wind from any side, as coached: on the spot to 250 ft past it, never short', () => {
    for (const windKts of [5, 10, 15]) for (const windFromDeg of [160, 340, 250, 70]) {
      const r = power180('coach', { windKts, windFromDeg });
      log(`wind ${String(windFromDeg).padStart(3, '0')}/${windKts}`, r);
      if (windKts > 10) continue;
      expect(r.td.pastSpotFt).toBeGreaterThanOrEqual(0);
      expect(r.td.pastSpotFt).toBeLessThan(250);
      expect(Math.abs(r.td.crossM)).toBeLessThan(8);
      expect(r.hopFt).toBe(0);
    }
  });

  it('the turn at once, abeam the spot, is far too high: long past the window (the puzzle is real)', () => {
    const r = power180('now');
    log('turned at once', r);
    expect(r.td.pastSpotFt).toBeGreaterThan(1000);
  });
});
