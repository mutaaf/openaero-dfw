// Stall recovery drill (ticket 0087): the Cessna at 4,500 ft over Lake Grapevine, power idle,
// the nose held up until the wing stalls; then nose down, power in, wings level, climb away.
// The FAA's Airplane Flying Handbook (FAA-H-8083-3C, ch. 5, stall recovery) is the procedure:
// reduce the angle of attack first, then roll the wings level, then power. The grade must not reward diving: altitude lost is one
// input, not the only one (Transport Canada's stall advisory circular, hosted by the FAA:
// height loss is secondary until the recovery is positive). Pure: no THREE, no DOM. Tested in
// tests/unit/stallDrill.test.js and flown headless in tests/flight/c172.test.js.
import { curve, letterGrade } from './landing.js';

export const STALL_KEY = 'c172_stall_recovery';
// The stall warning sounds 5 kt above the stall (aero.js stallWarningKts): on the C172's lift
// curve that is ~3° of angle of attack below the stall angle (CL ∝ 1/V², (53/58)² of CLmax).
// Below it the wing is flying again: "unstalled".
export const STALL_WARN_MARGIN_DEG = 3;
// Recovered = unstalled, climbing at least this fast, wings within 15° of level...
export const STALL_MIN_CLIMB_FPM = 100;
export const STALL_LEVEL_DEG = 15;
// ...and no new stall for this long after the wing first flew again; a stall inside the
// window is a secondary stall (the pull-out was too hard).
export const STALL_SECONDARY_S = 10;
// More than this long past the stall angle (in total) is holding the stick back through it.
// Kid's and Learner's protection lowers the nose within ~0.3 s whatever the stick does, so
// back stick (pull ≥ STALL_PULL) in the first STALL_PULL_WINDOW_S after the stall counts too:
// the assist recovering is not the player recovering.
export const STALL_HELD_S = 3;
export const STALL_PULL = 0.5;
export const STALL_PULL_WINDOW_S = 5;
// A power-off stall is entered slowly at idle: a stall above the warning speed + this (a yank
// at cruise, ~1.3 g at the C172's numbers) or with power on is not the drill's, and it stays armed.
export const STALL_ENTRY_KTS = 4;
export const STALL_ENTRY_THROTTLE = 0.2;
// Climbing away needs power: a zoom at idle on the speed the dive built is not a recovery.
export const STALL_MIN_THROTTLE = 0.8;
// Not recovered: this much height lost, or this long since the stall, or this low.
export const STALL_FAIL_LOST_FT = 1000;
export const STALL_FAIL_S = 30;
export const STALL_FAIL_AGL_FT = 1000;
// Cessna 172S POH Fig. 5-3 (stall speeds), note 1: "Altitude loss during a stall recovery may
// be as much as 230 feet." A recovery inside the book's figure scores full marks for height.
export const POH_STALL_LOSS_FT = 230;

// phase: 'armed' (slowing, not stalled yet), 'stalled' (past the stall angle, or not yet
// back below the warning), 'unstalled' (the wing flies: power, wings, climb), 'complete'
// (recovered: graded), 'failed' (not recovered: graded D). Times are sim seconds.
export const createStallDrill = () => ({
  phase: 'armed', stallT: null, stallFt: 0, lowFt: Infinity, peakBankDeg: 0,
  stalledS: 0, recoverS: null, unstallT: null, secondary: false, climbFpm: 0,
});

// One frame. st is mutated (no allocation); s: { t (sim time, s), dt, altFt (any datum, the
// same each frame), aglFt, aoaDeg, stallAoaDeg (for the flaps set), vsFpm, bankDeg,
// pullIn (the player's back stick, 0..1, before any assist), throttle (0..1), iasKts,
// warnKts (aero.js stallWarningKts for the flaps set) }.
// Returns the transition this frame: 'stalled' | 'unstalled' | 'secondary' | 'complete' |
// 'failed' | ''.
export function stallDrillState(st, s) {
  const stalled = s.aoaDeg > s.stallAoaDeg;
  if (st.phase === 'armed') {
    if (!stalled || s.iasKts > s.warnKts + STALL_ENTRY_KTS || s.throttle > STALL_ENTRY_THROTTLE) return '';
    st.phase = 'stalled'; st.stallT = s.t; st.stallFt = s.altFt; st.lowFt = s.altFt;
    st.peakBankDeg = Math.abs(s.bankDeg);
    return 'stalled';
  }
  if (st.phase !== 'stalled' && st.phase !== 'unstalled') return '';
  if (s.altFt < st.lowFt) st.lowFt = s.altFt;
  const bank = Math.abs(s.bankDeg);
  if (bank > st.peakBankDeg) st.peakBankDeg = bank;
  // Back stick counts while the wing is still near its stall angle (the assist holding it there),
  // not a firm pull-out once it flies.
  if (stalled || (s.pullIn >= STALL_PULL && s.t - st.stallT <= STALL_PULL_WINDOW_S
    && s.aoaDeg >= s.stallAoaDeg - STALL_WARN_MARGIN_DEG)) st.stalledS += s.dt;
  if (st.stallFt - st.lowFt > STALL_FAIL_LOST_FT || s.t - st.stallT > STALL_FAIL_S || s.aglFt < STALL_FAIL_AGL_FT) {
    st.phase = 'failed';
    return 'failed';
  }
  if (st.phase === 'stalled') {
    if (s.aoaDeg >= s.stallAoaDeg - STALL_WARN_MARGIN_DEG) return '';
    st.phase = 'unstalled'; st.unstallT = s.t;
    if (st.recoverS === null) st.recoverS = s.t - st.stallT;
    return 'unstalled';
  }
  if (stalled) {
    if (s.t - st.unstallT <= STALL_SECONDARY_S) st.secondary = true;
    st.phase = 'stalled';
    return 'secondary';
  }
  if (s.aoaDeg < s.stallAoaDeg - STALL_WARN_MARGIN_DEG && s.vsFpm >= STALL_MIN_CLIMB_FPM && bank <= STALL_LEVEL_DEG
    && s.throttle >= STALL_MIN_THROTTLE && s.t - st.unstallT >= STALL_SECONDARY_S) {
    st.phase = 'complete'; st.climbFpm = s.vsFpm;
    return 'complete';
  }
  return '';
}

// What the assist levels do in the drill (main.js applyAssists). Kid and Learner normally
// keep the wing below its stall angle; in the drill that protection is off until the stall,
// so the lesson happens, and back on after it (the nose drops by itself). Kid's autothrottle
// holds idle until the stall, then full power and the climb-away guide.
// Returns { protect, kidThrottle (null: Kid's usual autothrottle), kidClimb }.
const ASSIST_ARMED = Object.freeze({ protect: false, kidThrottle: 0, kidClimb: false });
const ASSIST_RECOVER = Object.freeze({ protect: true, kidThrottle: 1, kidClimb: true });
const ASSIST_NORMAL = Object.freeze({ protect: true, kidThrottle: null, kidClimb: false });
export function drillAssist(phase) {
  if (phase === 'armed') return ASSIST_ARMED;
  if (phase === 'stalled' || phase === 'unstalled') return ASSIST_RECOVER;
  return ASSIST_NORMAL;
}

const WEIGHTS = { reaction: 0.35, height: 0.3, bank: 0.2, secondary: 0.15 };
export const STALL_SECONDARY_CAP = 69; // the top of a C
export const STALL_HELD_CAP = 54; // the top of a D
export const STALL_SECONDARY_REASON = 'Secondary stall: ease out of the dive, don\'t yank. Capped at C.';
// Diving the height away: at 1.5x the POH's figure the height scores 40, and with every
// other input perfect the grade is no better than a B.
export const STALL_DIVE_FT = 1.5 * POH_STALL_LOSS_FT;
export const STALL_HELD_REASON = 'Held the stick back through the stall: lower the nose first. Capped at D.';
export const STALL_PLACE = { name: 'Over Grapevine Lake · 4,500 ft' };
export const STALL_KID_NOTE = 'Kid level: the plane lowered its nose and added power for you';
export const STALL_FAILED_REASON = 'Not recovered: nose down, wings level, full power.';

// The recovery's grade. t: { recoverS (stall to the wing flying again; null if it never did),
// lostFt, peakBankDeg, secondary, stalledS, failed, kid (Kid level: the assists flew it) }.
export function gradeStallRecovery(t) {
  const factors = [
    // Prompt: the angle of attack comes down first (the Handbook's first step).
    { key: 'reaction', label: 'Nose down (stall to flying)', value: t.recoverS === null ? 'never' : `${t.recoverS.toFixed(1)} s`,
      score: t.recoverS === null ? 0 : curve(t.recoverS, [[0.5, 100], [1.5, 85], [3, 40], [5, 0]]) },
    { key: 'height', label: 'Altitude lost', value: `${Math.max(0, Math.round(t.lostFt))} ft (POH: up to ${POH_STALL_LOSS_FT})`,
      score: curve(t.lostFt, [[POH_STALL_LOSS_FT, 100], [STALL_DIVE_FT, 40], [460, 15], [700, 0]]) },
    { key: 'bank', label: 'Most bank', value: `${Math.round(t.peakBankDeg)}°`,
      score: curve(t.peakBankDeg, [[10, 100], [20, 70], [45, 0]]) },
    { key: 'secondary', label: 'Secondary stall', value: t.secondary ? 'yes' : 'none', score: t.secondary ? 0 : 100 },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = null;
  if (t.failed) { score = Math.min(score, STALL_HELD_CAP); reason = STALL_FAILED_REASON; }
  else if (t.stalledS > STALL_HELD_S) { score = Math.min(score, STALL_HELD_CAP); reason = STALL_HELD_REASON; }
  else if (t.secondary) { score = Math.min(score, STALL_SECONDARY_CAP); reason = STALL_SECONDARY_REASON; }
  return { kind: 'stall', title: t.failed ? 'Stall not recovered' : 'Stall recovered', grade: letterGrade(score), score, factors, reason,
    note: t.kid && !t.failed ? STALL_KID_NOTE : null };
}

// The grade input from the drill's state at 'complete' or 'failed'.
export const stallResultInput = (st, kid = false) => ({ kid,
  recoverS: st.recoverS, lostFt: st.stallFt - st.lowFt, peakBankDeg: st.peakBankDeg,
  secondary: st.secondary, stalledS: st.stalledS, failed: st.phase === 'failed',
});
