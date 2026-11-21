// Ticket 0191: the power-on (departure) stall drill (src/powerOnStall.js) flown headless on both
// models. Entry as the Airplane Flying Handbook flies it (FAA-H-8083-3C, ch. 5 "Full Stalls,
// Power-On", pp. 5-17/5-18): the Cessna in its takeoff configuration (flaps 10) slowed to about
// lift-off speed (60 KIAS, 4,500 ft), then takeoff power and the nose raised to a climb attitude and
// held until the full stall, "adding right rudder". Recovery: reduce the AOA at once, level the
// wings, confirm the power, return to the climb (Vx 62 KIAS, POH; ACS FAA-S-ACS-6C Area VII Task C
// S9). The tolerances are the ACS's (pp. 44-45): heading ±10° while inducing the stall (S6), done
// no lower than 1,500 ft AGL (S2), and no predetermined altitude loss (p. 45, Appendix p. 78).
//
// What the measurements say (logged as [c172 <model>] lines): at full power and flaps 10 the nose
// held at 15° climbs and never stalls; held at 20° it stalls in ~8-10 s at ~47-49 KIAS, under the
// model's own power-off flaps 10 stall at the same height (~49.8 KIAS; POH Fig. 5-3: 50 KCAS): the
// thrust line sits at about α to the flight path, so T·sin α carries part of the weight, and in a
// climb the wing carries only W·cos γ, so it stalls at a lower airspeed. With no rudder both models yaw
// left and drop the left wing: the prop's torque rolls it left (JSBSim's prop76 torque; flightModel.js
// propTorqueAileron, 0194, the same 475 N·m) and the wings-level hold stands a degree or two off it, so
// it turns (JSBSim 6.6°, flightModel.js 4.5°). Neither models P-factor or the slipstream's swirl (0200).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, RAD_TO_DEG } from '../../src/constants.js';
import { stallAoaDeg, stallWarningKts } from '../../src/aero.js';
import { elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import {
  createStallDrill, stallDrillState, gradeStallRecovery, stallResultInput, PO_PITCH_DEG, PO_HDG_TOL_DEG,
} from '../../src/powerOnStall.js';
import { missionByKey } from '../../src/missions.js';
import { makeBody, fly, attitude, vsFpm, speedHoldPilot, useFdm } from './harness.js';
import { nodeJsbsim } from './jsbsimNode.js';

const c172 = AIRCRAFT_DATABASE.c172;
const FLAPS = 1; // 10°
const ALT_M = 4500 * 0.3048;
const _e = new Euler();
const yawLeftDeg = (x) => { _e.setFromQuaternion(x.quat, 'YXZ'); return _e.y * RAD_TO_DEG; };
const gapCard = (gaps, id) => (gaps.has(id) ? (title, ...rest) => it.fails(`KNOWN GAP (${gaps.get(id)}): ${title}`, ...rest) : it);
const GAPS = { flightModel: new Map(), jsbsim: new Map() };

// The model's power-off stall at flaps 10 here: idle, wings level, 1 kt/s down from 70 KIAS (c172.test.js's
// method) until the wing passes its stall angle.
function powerOffStallKts() {
  const b = Object.assign(makeBody(c172, { kts: 70, altM: ALT_M, flaps: FLAPS, throttle: 0 }), { autoTrim: false });
  const slow = speedHoldPilot((x) => Math.max(20, 70 - x.t));
  const sa = stallAoaDeg(c172, FLAPS);
  let kts = null;
  fly(b, c172, 60, (x, dt) => { x.throttle = 0; slow(x, dt); }, (x) => { if (x.aoaDeg > sa) kts = x.iasKts; return kts !== null; });
  return kts;
}

// The mission's spawn: 60 KIAS, flaps 10, in trim and level (main.js's drill spawn), 15 s settled.
function spawn() {
  const m = missionByKey('c172_power_on_stall');
  const b = Object.assign(makeBody(c172, { kts: m.kias, altM: ALT_M, flaps: m.flaps, throttle: 0.5 }), { autoTrim: false });
  const hold = speedHoldPilot(() => m.kias);
  fly(b, c172, 15, (x, dt) => hold(x, dt));
  return b;
}

// pilot: 'correct' | 'held' (full back stick from the stall) | 'lazy' (eases the nose only to 11.5° and
// lets the power fly it out; at 12° both models climbed out at 56.6-57.0 KIAS against the drill's 57, so
// after 0203's JSBSim lift fix it never completed there: the card is about the nose cap, not that line) | 'yank' (nose down, then full back stick as soon as it flies again) |
// 'yankOnce' (that yank for 1 s, then the correct recovery) | 'dive' (full forward stick to -30°).
// rudder: hold the heading with the pedals through the entry (AFH: "adding right rudder").
function powerOnStall(pilot = 'correct', { rudder = true, pitchDeg = PO_PITCH_DEG } = {}) {
  const b = spawn();
  const st = createStallDrill();
  const sa = stallAoaDeg(c172, FLAPS);
  const climb = speedHoldPilot(() => 62);
  const yaw0 = yawLeftDeg(b);
  let noseDown = true, peakPitch = -90, stallAt = null, breakAt = null, yanked = false;
  const s = { t: 0, dt: 1 / 120, altFt: 0, aglFt: 0, aoaDeg: 0, stallAoaDeg: sa, vsFpm: 0, bankDeg: 0, pullIn: 0, throttle: 1, iasKts: 0,
    warnKts: stallWarningKts(c172, FLAPS), hdgDeg: 0, pitchDeg: 0, flapsIndex: FLAPS };
  fly(b, c172, 90, (x, dt) => {
    const { pitchDeg: p, bankRightDeg } = attitude(x);
    x.throttle = 1;
    if (st.phase === 'armed') {
      x.elevInput = elevatorForPitch(Math.min(pitchDeg, p + 2), p, x.angVel.x);
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
      x.rudderInput = rudder ? Math.max(-1, Math.min(1, (yawLeftDeg(x) - yaw0) * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15)) : 0;
      return;
    }
    x.rudderInput = 0;
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
    if (pilot === 'held') { x.elevInput = -1; return; }
    if (pilot === 'lazy') { x.elevInput = elevatorForPitch(11.5, p, x.angVel.x); return; }
    if (pilot === 'dive') {
      if (noseDown && p > -30) { x.elevInput = 1; return; }
      noseDown = false;
      if (p < 3 && !yanked) { x.elevInput = elevatorForPitch(p + 2, p, x.angVel.x); return; } // eased back up, not yanked
      yanked = true; // (re-used: out of the dive)
    }
    if ((pilot === 'yank' || pilot === 'yankOnce') && st.phase === 'unstalled' && !yanked) { yanked = x.t; }
    if (yanked && (pilot === 'yank' ? st.phase === 'unstalled' : x.t - yanked < 1 && !st.secondary)) { x.elevInput = -1; noseDown = true; return; }
    if (noseDown && (x.aoaDeg > sa - 4 || p > 5)) x.elevInput = elevatorForPitch(0, p, x.angVel.x);
    else {
      noseDown = false; climb(x, dt);
      if (x.iasKts >= 60 && vsFpm(x) > 0) x.flapsIndex = 0; // POH: flaps up once climbing
    }
  }, (x) => {
    const { pitchDeg: p, bankRightDeg } = attitude(x);
    peakPitch = Math.max(peakPitch, p);
    Object.assign(s, { t: x.t, altFt: x.pos.y * M_TO_FT, aglFt: x.pos.y * M_TO_FT, aoaDeg: x.aoaDeg, vsFpm: vsFpm(x), bankDeg: bankRightDeg,
      pullIn: Math.max(0, -x.elevInput), throttle: x.throttle, iasKts: x.iasKts, hdgDeg: -yawLeftDeg(x), pitchDeg: p, flapsIndex: x.flapsIndex });
    stallDrillState(st, s);
    if (st.phase !== 'armed' && !stallAt) stallAt = { kts: x.iasKts, pitchDeg: p, bankDeg: bankRightDeg, yawLeftDeg: yawLeftDeg(x) - yaw0, t: x.t };
    // The break: 1.5 s past the stall, where a wing drop shows.
    if (stallAt && !breakAt && x.t - stallAt.t >= 1.5) breakAt = { bankDeg: bankRightDeg, yawLeftDeg: yawLeftDeg(x) - yaw0 };
    return st.phase === 'complete' || st.phase === 'failed';
  });
  const result = gradeStallRecovery(stallResultInput(st, false, b.pos.y * M_TO_FT));
  // ...and on up at Vx for 10 s more: it ends climbing, not on the edge again.
  if (st.phase === 'complete') fly(b, c172, 10, (x, dt) => { x.throttle = 1; climb(x, dt); x.flapsIndex = 0; });
  return { st, result, stallAt, breakAt, peakPitch, vs: vsFpm(b), flaps: b.flapsIndex };
}

for (const model of ['flightModel', 'jsbsim']) describe(`Cessna 172S power-on stall drill (${model}, ticket 0191)`, () => {
  beforeAll(async () => useFdm(model === 'jsbsim' ? await nodeJsbsim() : null));
  afterAll(() => useFdm(null));
  const card = (id) => gapCard(GAPS[model], id);

  it('full power at flaps 10: the nose held at 15° climbs without stalling; held at 20° the wing stalls under the POH\'s power-off 50 KCAS', () => {
    const low = powerOnStall('correct', { pitchDeg: 15 });
    expect(low.st.phase).toBe('armed');
    const r = powerOnStall('correct');
    const off = powerOffStallKts();
    console.log(`[c172 ${model}] power-off flaps 10 stall ${off.toFixed(1)} KIAS; power-on stall: ${r.stallAt.kts.toFixed(1)} KIAS, pitch ${r.stallAt.pitchDeg.toFixed(1)}° (peak ${r.peakPitch.toFixed(1)}°), `
      + `bank ${r.stallAt.bankDeg.toFixed(1)}°, heading ${r.stallAt.yawLeftDeg.toFixed(1)}° left; 1.5 s later bank ${r.breakAt.bankDeg.toFixed(1)}°, ${r.breakAt.yawLeftDeg.toFixed(1)}° left`);
    expect(r.stallAt.kts).toBeLessThan(off - 1); // the power takes at least a knot off it
    expect(r.stallAt.kts).toBeGreaterThan(42);
    expect(r.peakPitch).toBeLessThan(PO_PITCH_DEG + 2);
  });

  card('leftTurning')('no rudder at full power and 20° nose up: the nose yaws left (the AFH\'s "adding right rudder")', () => {
    const r = powerOnStall('correct', { rudder: false });
    console.log(`[c172 ${model}] power-on, no rudder: ${r.stallAt.yawLeftDeg.toFixed(1)}° left, bank ${r.stallAt.bankDeg.toFixed(1)}° at the stall; entry heading ±${r.st.entryHdgDeg.toFixed(1)}°`);
    expect(r.stallAt.yawLeftDeg).toBeGreaterThan(2);
  });

  it('nose down, wings level, power in, flaps up: recovers climbing at Vx with the heading inside the ACS\'s ±10°, graded A or S', () => {
    const r = powerOnStall('correct');
    console.log(`[c172 ${model}] power-on recovery: ${r.st.phase}, flying again in ${r.st.recoverS?.toFixed(2)} s, lost ${(r.st.stallFt - r.st.lowFt).toFixed(0)} ft, `
      + `nose down to ${r.st.minPitchDeg.toFixed(1)}°, most bank ${r.st.peakBankDeg.toFixed(1)}°, heading ±${r.st.entryHdgDeg.toFixed(1)}°, ${r.result.grade} ${r.result.score}, climbing ${r.vs.toFixed(0)} fpm`);
    expect(r.st.phase).toBe('complete');
    expect(r.st.entryHdgDeg).toBeLessThanOrEqual(PO_HDG_TOL_DEG);
    expect(r.st.secondary).toBe(false);
    expect(r.vs).toBeGreaterThan(300);
    expect(r.flaps).toBe(0);
    expect(['S', 'A']).toContain(r.result.grade);
  });

  it('holding the stick full back through the stall never grades above D', () => {
    const r = powerOnStall('held');
    console.log(`[c172 ${model}] power-on, stick held back: ${r.st.phase}, ${r.st.stalledS.toFixed(1)} s stalled, ${r.result.grade} ${r.result.score}`);
    expect(r.result.grade).toBe('D');
  });

  it('easing the nose only to 11.5° and letting the power fly it out is capped at B', () => {
    const r = powerOnStall('lazy');
    console.log(`[c172 ${model}] power-on, lazy nose: ${r.st.phase}, nose down to ${r.st.minPitchDeg.toFixed(1)}°, ${r.result.grade} ${r.result.score}, ${r.result.reason}`);
    expect(r.st.phase).toBe('complete');
    expect(r.st.minPitchDeg).toBeGreaterThan(10);
    expect(r.result.grade).toBe('B');
  });

  it('a stall-then-yank that recovers after the second stall is capped at C', () => {
    const r = powerOnStall('yankOnce');
    console.log(`[c172 ${model}] power-on, yanked once: ${r.st.phase}, secondary ${r.st.secondary}, ${r.result.grade} ${r.result.score}`);
    expect(r.st.phase).toBe('complete');
    expect(r.st.secondary).toBe(true);
    expect(r.result.grade).toBe('C');
  });

  it('pushing far past the horizon (-30°) is capped at B though nothing else went wrong', () => {
    const r = powerOnStall('dive');
    console.log(`[c172 ${model}] power-on, dived: ${r.st.phase}, nose to ${r.st.minPitchDeg.toFixed(1)}°, lost ${(r.st.stallFt - r.st.lowFt).toFixed(0)} ft, ${r.result.grade} ${r.result.score}`);
    expect(r.st.phase).toBe('complete');
    expect(r.result.grade).toBe('B');
  });

  it('yanking the nose back up as soon as it flies stalls it again: a secondary stall, no better than C', () => {
    const r = powerOnStall('yank');
    console.log(`[c172 ${model}] power-on, yanked: ${r.st.phase}, secondary ${r.st.secondary}, ${r.result.grade} ${r.result.score}`);
    expect(r.st.secondary).toBe(true);
    expect(['C', 'D']).toContain(r.result.grade);
  });
});
