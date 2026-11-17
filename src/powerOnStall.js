// Power-on (departure) stall drill (ticket 0191): the Cessna at 4,500 ft over Grapevine Lake,
// flaps 10 (a takeoff setting), slowed to lift-off speed. Full power, the nose raised to ~20° and
// held until the wing stalls; then nose down, wings level, power confirmed, flaps up, climb away.
// The procedure is the Airplane Flying Handbook's (FAA-H-8083-3C, ch. 5 "Full Stalls, Power-On",
// pp. 5-17/5-18): slow to lift-off speed, set takeoff power, raise the nose and hold the attitude
// to the full stall ("adding right rudder"), then reduce the AOA at once, level the wings, confirm
// the power, return to the climb. The standards are the Private Pilot ACS (FAA-S-ACS-6C, Area VII
// Task C, pp. 44-45): no lower than 1,500 ft AGL (S2), no less than 65% power (S4), the heading
// within ±10° while inducing the stall (S6), recover promptly (S7), accelerate to Vx or Vy (S9).
// The ACS (Appendix 2, p. 78) says the recovery "should not mandate a predetermined value for
// altitude loss": the grade has no height factor (the idle drill's POH 230 ft is for that stall);
// falling through 1,500 ft AGL is a fail, and a dive far past the horizon caps the grade (the AFH's
// nose-down is "as much ... as required to eliminate the stall warning", not more).
//
// The same calls as stallDrill.js (main.js loads one or the other: createStallDrill,
// stallDrillState, drillAssist, gradeStallRecovery, stallResultInput, STALL_PLACE), plus the
// coach's prompt (powerOnPrompt, through coach.js s.ds). Pure: no THREE, no DOM. Tested in
// tests/unit/powerOnStall.test.js and flown headless in tests/flight/powerOnStall.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK, TOUCH_WORDS } from './coach.js';
import {
  STALL_WARN_MARGIN_DEG, STALL_MIN_CLIMB_FPM, STALL_LEVEL_DEG, STALL_SECONDARY_S, STALL_HELD_S, STALL_PULL,
  STALL_PULL_WINDOW_S, STALL_HELD_MARGIN_DEG, STALL_ENTRY_KTS, STALL_MIN_THROTTLE, STALL_FAIL_LOST_FT, STALL_FAIL_S,
  STALL_HELD_CAP, STALL_SECONDARY_CAP, STALL_HELD_REASON, STALL_SECONDARY_REASON, STALL_FAILED_REASON,
} from './stallDrill.js';
// main.js loads both stall drills through this chunk: the idle one (0087) is `idle`.
export * as idle from './stallDrill.js';

export const POWER_ON_KEY = 'c172_power_on_stall';
export const STALL_KEY = POWER_ON_KEY;
export const PO_TEXT = {
  poPower: 'Full power: throttle all the way in',
  poNose: 'Raise the nose to 20°, hold it, wings level',
  poStall: 'Stall! Nose down, keep the power in',
  poWings: 'Wings level',
  poFlaps: 'Flaps up: press F once',
  poClimb: 'Climb away at 62 kt',
  poKidUp: 'Let go: the nose comes up until it stalls',
  poKid: 'Stall! The plane noses down and climbs away',
};
Object.assign(DRILL_TEXT, PO_TEXT);
Object.assign(TOUCH_WORDS, { poFlaps: 'Flaps up: tap FLAPS once' });
// Each entry step outranks the one before, so it shows at once (no 1.5 s hold with the old words up); the stall
// outranks everything. No "right rudder": the default flight model's left-turning tendency is the prop's torque
// (0194), which the ailerons hold (poWings), not a yaw the pedals must; and a touch screen has no pedals in this drill.
Object.assign(RANK, { poPower: 4, poNose: 5, poKidUp: 4, poWings: 4, poFlaps: 4, poClimb: 4, poStall: 6, poKid: 6 });

// ACS S4: no less than 65% power. Rated power, not lever travel: the piston's power lapses with
// altitude (engine.js pistonPowerLapse: 0.83 at the drill's ~5,000 ft MSL), so 0.8 of throttle is ~66%
// (tests/unit/powerOnStall.test.js). Below it, a stall is not this drill's (it stays armed).
export const PO_ENTRY_THROTTLE = 0.8;
// The attitude the coach asks for and Kid's guide flies (AFH: "a climb attitude", then the nose
// raised and held; ~20° is the usual Cessna figure, and the headless cards measure what it does:
// at full power and flaps 10, 15° climbs without stalling, 20° stalls in ~8-10 s).
export const PO_PITCH_DEG = 20;
// Kid's and Learner's pitch cap is lifted to this until the stall (their own caps, 15° and 20°
// at 85% of full stick, would never reach it); back to theirs after (drillAssist).
export const PO_PITCH_CAP_DEG = 25;
// ACS S6: the heading within ±10° while inducing the stall.
export const PO_HDG_TOL_DEG = 10;
// ACS S2: completed no lower than 1,500 ft AGL.
export const PO_FAIL_AGL_FT = 1500;
// ACS S9: accelerate to Vx or Vy. The C172S POH's Vx is 62 KIAS; recovered from 5 kt under it (ours).
export const PO_VX_KTS = 62;
export const PO_MIN_KTS = PO_VX_KTS - 5;
// The nose never came down to this pitch after the stall: the wing flew again on the power, not
// because the angle of attack was reduced (AFH: "immediately reducing the AOA"). Capped at B.
export const PO_NOSE_LOW_DEG = 10;
export const PO_NOSE_HIGH_CAP = 84; // the top of a B
export const PO_NOSE_HIGH_REASON = 'The nose stayed above 10°: lower it nearer the horizon first. Capped at B.';
// ...and pushed far below the horizon: height thrown away for nothing (ours; the correct pilots of
// tests/flight/powerOnStall.test.js reach 1.5-3°, Kid's protection 4°). Capped at B.
export const PO_DIVE_DEG = -10;
export const PO_DIVE_REASON = 'Pushed far past the horizon: just enough to stop the stall warning. Capped at B.';
export const STALL_PLACE = { name: 'Over Grapevine Lake · 4,500 ft · power on' };
export const PO_KID_NOTE = 'Kid level: the plane raised and lowered its nose for you';

const hdgDiff = (a, b) => ((a - b + 540) % 360) - 180;

// phase as stallDrill.js: 'armed' → 'stalled' → 'unstalled' → 'complete' | 'failed'.
export const createStallDrill = () => ({
  phase: 'armed', stallT: null, stallFt: 0, lowFt: Infinity, peakBankDeg: 0,
  stalledS: 0, recoverS: null, unstallT: null, secondary: false, climbFpm: 0,
  hdg0: null, entryHdgDeg: 0, minPitchDeg: Infinity, stallKts: null, stallPitchDeg: null,
  pitchDeg: 0, bankDeg: 0, iasKts: 0, vsFpm: 0, flaps: 0,
  flapsUp: false, // the flap lever steps up a notch (main.js moveFlapLever, as in a go-around) while it flies again
});

// One frame. s: stallDrill.js's inputs plus hdgDeg (the nose's heading), pitchDeg, flapsIndex.
// Returns 'stalled' | 'unstalled' | 'secondary' | 'complete' | 'failed' | ''.
export function stallDrillState(st, s) {
  st.pitchDeg = s.pitchDeg; st.bankDeg = s.bankDeg; st.iasKts = s.iasKts; st.vsFpm = s.vsFpm; st.flaps = s.flapsIndex;
  const stalled = s.aoaDeg > s.stallAoaDeg;
  if (st.phase === 'armed') {
    // The entry starts with the power in (AFH): its heading is the one the power came in on; power back
    // off (clearing turns, a restart) starts it again.
    if (s.throttle < PO_ENTRY_THROTTLE) { st.hdg0 = null; st.entryHdgDeg = 0; }
    else {
      if (st.hdg0 === null) st.hdg0 = s.hdgDeg;
      st.entryHdgDeg = Math.max(st.entryHdgDeg, Math.abs(hdgDiff(s.hdgDeg, st.hdg0)));
    }
    if (!stalled || s.iasKts > s.warnKts + STALL_ENTRY_KTS || s.throttle < PO_ENTRY_THROTTLE) return '';
    st.phase = 'stalled'; st.stallT = s.t; st.stallFt = s.altFt; st.lowFt = s.altFt;
    st.peakBankDeg = Math.abs(s.bankDeg); st.stallKts = s.iasKts; st.stallPitchDeg = s.pitchDeg; st.minPitchDeg = s.pitchDeg;
    return 'stalled';
  }
  if (st.phase !== 'stalled' && st.phase !== 'unstalled') return '';
  if (s.altFt < st.lowFt) st.lowFt = s.altFt;
  if (s.pitchDeg < st.minPitchDeg) st.minPitchDeg = s.pitchDeg;
  const bank = Math.abs(s.bankDeg);
  if (bank > st.peakBankDeg) st.peakBankDeg = bank;
  if (stalled || (s.pullIn >= STALL_PULL && s.t - st.stallT <= STALL_PULL_WINDOW_S
    && s.aoaDeg >= s.stallAoaDeg - STALL_HELD_MARGIN_DEG)) st.stalledS += s.dt;
  if (st.stallFt - st.lowFt > STALL_FAIL_LOST_FT || s.t - st.stallT > STALL_FAIL_S || s.aglFt < PO_FAIL_AGL_FT) {
    st.phase = 'failed';
    return 'failed';
  }
  if (st.phase === 'stalled') {
    if (s.aoaDeg >= s.stallAoaDeg - STALL_WARN_MARGIN_DEG) return '';
    st.phase = 'unstalled'; st.unstallT = s.t; st.flapsUp = true;
    if (st.recoverS === null) st.recoverS = s.t - st.stallT;
    return 'unstalled';
  }
  if (stalled) {
    if (s.t - st.unstallT <= STALL_SECONDARY_S) st.secondary = true;
    st.phase = 'stalled';
    return 'secondary';
  }
  if (s.aoaDeg < s.stallAoaDeg - STALL_WARN_MARGIN_DEG && s.vsFpm >= STALL_MIN_CLIMB_FPM && bank <= STALL_LEVEL_DEG
    && s.throttle >= STALL_MIN_THROTTLE && s.iasKts >= PO_MIN_KTS && s.t - st.unstallT >= STALL_SECONDARY_S) {
    st.phase = 'complete'; st.climbFpm = s.vsFpm; st.flapsUp = false;
    return 'complete';
  }
  return '';
}

// The coach's prompt (main.js passes it as coach.js s.ds): from the drill's own last frame.
export function powerOnPrompt(st, kid, throttle) {
  if (st.phase === 'armed') {
    if (kid) return 'poKidUp';
    return throttle < 0.9 ? 'poPower' : 'poNose';
  }
  if (st.phase === 'stalled') return kid ? 'poKid' : 'poStall';
  if (st.phase !== 'unstalled') return null;
  if (kid) return 'poKid';
  if (Math.abs(st.bankDeg) > 5) return 'poWings';
  if (throttle < 0.9) return 'poPower';
  if (st.flaps > 0 && st.vsFpm > 0 && st.iasKts >= 60) return 'poFlaps';
  return 'poClimb';
}

// The assists (main.js applyAssists): until the stall, Kid's and Learner's stall protection is off
// and their pitch cap lifted (so the nose can reach the attitude that stalls it at full power);
// Kid's autothrottle holds full power all through, and its hands-off guide raises the nose to
// PO_PITCH_DEG (kidPitchDeg). After the stall: protection back on, Kid's climb-away guide.
const ASSIST_ARMED = Object.freeze({ protect: false, kidThrottle: 1, kidClimb: false, kidPitchDeg: PO_PITCH_DEG, pitchUpMaxDeg: PO_PITCH_CAP_DEG });
const ASSIST_RECOVER = Object.freeze({ protect: true, kidThrottle: 1, kidClimb: true, kidPitchDeg: null, pitchUpMaxDeg: null });
const ASSIST_NORMAL = Object.freeze({ protect: true, kidThrottle: null, kidClimb: false, kidPitchDeg: null, pitchUpMaxDeg: null });
export function drillAssist(phase) {
  if (phase === 'armed') return ASSIST_ARMED;
  if (phase === 'stalled' || phase === 'unstalled') return ASSIST_RECOVER;
  return ASSIST_NORMAL;
}

const WEIGHTS = { reaction: 0.35, heading: 0.25, bank: 0.25, secondary: 0.15 };

// t: { recoverS, peakBankDeg, entryHdgDeg, minPitchDeg, secondary, stalledS, failed, lostFt, kid }.
export function gradeStallRecovery(t) {
  const factors = [
    { key: 'reaction', label: 'Nose down (stall to flying)', value: t.recoverS === null ? 'never' : `${t.recoverS.toFixed(1)} s`,
      score: t.recoverS === null ? 0 : curve(t.recoverS, [[0.5, 100], [1.5, 85], [3, 40], [5, 0]]) },
    // ACS S6: ±10° full marks; twice that is a miss.
    { key: 'heading', label: 'Heading held to the stall', value: `±${Math.round(t.entryHdgDeg)}° (ACS ±${PO_HDG_TOL_DEG}°)`,
      score: curve(t.entryHdgDeg, [[PO_HDG_TOL_DEG, 100], [2 * PO_HDG_TOL_DEG, 40], [3 * PO_HDG_TOL_DEG, 0]]) },
    // A dropped wing at the break, or one the recovery let go: the idle drill's curve.
    { key: 'bank', label: 'Most bank', value: `${Math.round(t.peakBankDeg)}°`,
      score: curve(t.peakBankDeg, [[10, 100], [20, 70], [45, 0]]) },
    { key: 'secondary', label: 'Secondary stall', value: t.secondary ? 'yes' : 'none', score: t.secondary ? 0 : 100 },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = null;
  if (t.failed) { score = Math.min(score, STALL_HELD_CAP); reason = t.lowAgl ? 'Below 1,500 ft above the ground: recover sooner, nose down first.' : STALL_FAILED_REASON; }
  else if (t.stalledS > STALL_HELD_S) { score = Math.min(score, STALL_HELD_CAP); reason = STALL_HELD_REASON; }
  else if (t.secondary) { score = Math.min(score, STALL_SECONDARY_CAP); reason = STALL_SECONDARY_REASON; }
  else if (t.minPitchDeg > PO_NOSE_LOW_DEG) { score = Math.min(score, PO_NOSE_HIGH_CAP); reason = PO_NOSE_HIGH_REASON; }
  else if (t.minPitchDeg < PO_DIVE_DEG) { score = Math.min(score, PO_NOSE_HIGH_CAP); reason = PO_DIVE_REASON; }
  const lost = Math.max(0, Math.round(t.lostFt ?? 0));
  return { kind: 'stall', title: t.failed ? 'Power-on stall not recovered' : 'Power-on stall recovered', grade: letterGrade(score), score, factors,
    reason, note: t.failed ? null : t.kid ? PO_KID_NOTE : `Lost ${lost} ft: no limit on this one` };
}

export const stallResultInput = (st, kid = false, aglFt = Infinity) => ({ kid,
  recoverS: st.recoverS, lostFt: st.stallFt - st.lowFt, peakBankDeg: st.peakBankDeg, entryHdgDeg: st.entryHdgDeg,
  minPitchDeg: st.minPitchDeg, secondary: st.secondary, stalledS: st.stalledS, failed: st.phase === 'failed',
  lowAgl: st.phase === 'failed' && aglFt < PO_FAIL_AGL_FT,
});
