// Slow flight (ticket 0164, a lazy chunk loaded with the mission): the Cessna over Grapevine Lake,
// clean, slows from cruise to just above its stall warning and holds it there, level, on its heading,
// graded to the FAA's private pilot test standard: FAA-S-ACS-6C (Private Pilot Airplane ACS, Nov 2023),
// Area of Operation VII, Task A, Maneuvering During Slow Flight (p. 42): S3 "establish and maintain an
// airspeed at which any further increase in angle of attack, increase in load factor, or reduction in
// power, would result in a stall warning"; S4 "... without a stall warning"; S5 "maintain the specified
// altitude, ±100 feet; specified heading, ±10°; airspeed, +10/-0 knots"; S2 no lower than 1,500 ft AGL
// (the mission starts at 4,500). Pure: no THREE, no DOM. Tested in tests/unit/slowFlight.test.js and
// flown headless in tests/flight/slowFlight.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK } from './coach.js';
import { stallAoaDeg, stallWarningKts } from './aero.js';
import { M_TO_FT } from './constants.js';

export const SLOW_KEY = 'c172_slow_flight';
// The ACS tolerances (Area VII Task A, skill S5).
export const SLOW_ALT_TOL_FT = 100;
export const SLOW_HDG_TOL_DEG = 10;
export const SLOW_KTS_OVER = 10; // airspeed +10/-0 kt
// The "specified airspeed": this far over the airplane's own stall warning (aero.js stallWarningKts,
// the horn's speed for where the flaps are), so the −0 edge is still clear of the horn. The C172
// clean: warning 58 KIAS, target 63, band 63-73.
export const SLOW_TARGET_OVER_WARN_KTS = 5;
// The hold: SLOW_HOLD_S seconds inside every tolerance ends it; it is graded anyway after
// SLOW_HOLD_MAX_S in the band's reach.
export const SLOW_HOLD_S = 45;
export const SLOW_HOLD_MAX_S = 90;
// Not finished: never slowed to the band this long after the start, this far off the height, or stalled.
export const SLOW_FAIL_SLOWING_S = 120;
export const SLOW_FAIL_FT = 500;
// The horn counts once it has sounded this long at a stretch (a gust's blip is not the pilot's speed).
export const SLOW_WARN_S = 1;
export const SLOW_IAS_TAU_S = 2;
export const SLOW_PLACE = { name: 'Over Grapevine Lake · 4,500 ft' };

export const SLOW_TEXT = {
  sfwSlow: 'Throttle back, raise the nose bit by bit: hold your height',
  sfwSlowing: 'Slowing: keep the nose coming up to hold your height',
  sfwHorn: 'Stall warning: lower the nose a little and add power',
  sfwTooSlow: 'Too slow: lower the nose a little, add a little power',
  sfwFast: 'A little fast: raise the nose slightly',
  sfwSink: 'Sinking: add power',
  sfwClimb: 'Climbing: take off a little power',
  sfwHdg: 'Hold your heading: small bank back, use the rudder',
  sfwHold: 'Hold it: slow, level, on your heading',
  sfwKidIn: 'Let go: the plane slows down and holds its height',
  sfwKid: 'The plane flies slowly: nose high, more power. Feel how soft the controls are',
};
Object.assign(DRILL_TEXT, SLOW_TEXT);
Object.assign(RANK, { sfwSlow: 1, sfwSlowing: 1, sfwFast: 1, sfwSink: 1, sfwClimb: 1, sfwHdg: 1, sfwHold: 1,
  sfwTooSlow: 2, sfwHorn: 2, sfwKidIn: 1, sfwKid: 1 });

// phase: 'wait' (the start screen: the drill starts when the player does), 'slowing' (cruise down to the
// band), 'holding' (in the band's reach: the timer runs), 'complete' (graded), 'failed' (graded D).
export const createSlowFlight = () => ({
  phase: 'wait', alt0: 0, hdg0: 0, t: 0, kidKts: 0, holdS: 0, okS: 0, inBandS: 0, targetKts: 0, iasF: 0,
  maxAltDevFt: 0, altSignFt: 0, maxHdgDev: 0, underKts: 0, overKts: 0, warnRunS: 0, warnS: 0, warned: false, why: null,
});

const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;

// One sub-step. st is mutated (no allocation). s: { dt, started (the player is flying), altFt (any datum,
// the same each step), iasKts, warnKts (the horn's speed now), hdgDeg (the nose, true), stalled }.
// Returns the transition: 'slowing' | 'holding' | 'complete' | 'failed' | ''.
export function slowFlightStep(st, s) {
  if (st.phase === 'complete' || st.phase === 'failed') return '';
  st.targetKts = s.warnKts + SLOW_TARGET_OVER_WARN_KTS;
  if (st.phase === 'wait') {
    // The specified altitude and heading are the ones the player starts from.
    st.alt0 = s.altFt; st.hdg0 = s.hdgDeg; st.iasF = st.kidKts = s.iasKts;
    if (!s.started) return '';
    st.phase = 'slowing';
    return 'slowing';
  }
  st.t += s.dt;
  st.kidKts = Math.max(st.targetKts + SLOW_KTS_OVER / 2, st.kidKts - SLOW_KID_DECEL_KTS_S * s.dt);
  // The airspeed through a ~2 s filter (a METAR gust's spike is not the pilot's speed), as steepTurns.js.
  st.iasF += (s.iasKts - st.iasF) * Math.min(1, s.dt / SLOW_IAS_TAU_S);
  const altDev = s.altFt - st.alt0, hdgDev = Math.abs(wrap180(s.hdgDeg - st.hdg0));
  // The height and heading are held from the start, through the slow-down too (S5).
  if (Math.abs(altDev) > st.maxAltDevFt) { st.maxAltDevFt = Math.abs(altDev); st.altSignFt = altDev; }
  st.maxHdgDev = Math.max(st.maxHdgDev, hdgDev);
  // The horn (main.js isStallWarning: IAS under the warning speed), held SLOW_WARN_S at a stretch.
  st.warnRunS = s.iasKts < s.warnKts ? st.warnRunS + s.dt : 0;
  if (st.warnRunS > 0) st.warnS += s.dt;
  if (st.warnRunS >= SLOW_WARN_S) st.warned = true;
  if (s.stalled || st.maxAltDevFt > SLOW_FAIL_FT || (st.phase === 'slowing' && st.t > SLOW_FAIL_SLOWING_S)) {
    st.why = s.stalled ? 'stall' : st.maxAltDevFt > SLOW_FAIL_FT ? 'height' : 'time';
    st.phase = 'failed';
    return 'failed';
  }
  const top = st.targetKts + SLOW_KTS_OVER;
  if (st.phase === 'slowing') {
    if (st.iasF > top) return '';
    st.phase = 'holding';
    return 'holding';
  }
  st.holdS += s.dt;
  const inBand = st.iasF >= st.targetKts && st.iasF <= top;
  if (inBand) st.inBandS += s.dt;
  st.underKts = Math.max(st.underKts, st.targetKts - st.iasF);
  st.overKts = Math.max(st.overKts, st.iasF - top);
  if (inBand && Math.abs(altDev) <= SLOW_ALT_TOL_FT && hdgDev <= SLOW_HDG_TOL_DEG) st.okS += s.dt;
  if (st.okS >= SLOW_HOLD_S || st.holdS >= SLOW_HOLD_MAX_S) {
    st.phase = 'complete';
    return 'complete';
  }
  return '';
}

// The coach's word for this moment (coach.js s.ds, rank 1-2). kid: the guide and the autothrottle fly it.
export function slowPrompt(st, s, kid) {
  if (st.phase === 'complete' || st.phase === 'failed') return null;
  if (kid) return st.phase === 'holding' ? 'sfwKid' : 'sfwKidIn';
  if (s.iasKts < s.warnKts) return 'sfwHorn';
  if (st.phase === 'wait') return 'sfwSlow';
  const altDev = s.altFt - st.alt0;
  if (st.phase === 'slowing') {
    if (altDev < -SLOW_ALT_TOL_FT / 2) return 'sfwSlowing';
    return 'sfwSlow';
  }
  // In slow flight the nose sets the speed and the power the height (FAA-H-8083-3C ch. 5: behind the power curve).
  if (st.iasF < st.targetKts) return 'sfwTooSlow';
  if (altDev < -SLOW_ALT_TOL_FT / 2) return 'sfwSink';
  if (altDev > SLOW_ALT_TOL_FT / 2) return 'sfwClimb';
  if (st.iasF > st.targetKts + SLOW_KTS_OVER) return 'sfwFast';
  if (Math.abs(wrap180(s.hdgDeg - st.hdg0)) > SLOW_HDG_TOL_DEG / 2) return 'sfwHdg';
  return 'sfwHold';
}

// Kid's hands-off guide (main.js applyAssists): wings toward the start heading (at most 10° of bank) and
// the flight path gently back to the start height; main.js's autothrottle flies kidKts.
export function slowKidGuide(st, s, out) {
  if (st.phase === 'wait') return;
  out.guideBankDeg = Math.max(-10, Math.min(10, wrap180(st.hdg0 - s.hdgDeg)));
  out.guideGammaDeg = Math.max(-3, Math.min(3, (st.alt0 - s.altFt) * 0.02));
}
// Kid's autothrottle speed: from the entry speed down at SLOW_KID_DECEL_KTS_S to the middle of the band (0 before
// the first step: main.js falls back). Asked for at once, the autothrottle's trim wound up to its stop (−0.3) through
// the ~30 s slow-down and took a minute to unwind: the Cessna sagged to 60 KIAS, under the band (tests/flight/slowFlight.test.js).
export const SLOW_KID_DECEL_KTS_S = 1;
export const slowKidKts = (st) => st.kidKts;

// The game's adapter: reads the sim (its quaternion's YXZ heading, as steepTurns.js) into one reused
// input, steps the drill and returns its transition. started: the player is flying (main.js
// cockpitEntered && !modalOpen(): the sim flies behind the start screen, docs/LESSONS.md 0174).
const _s = { dt: 0, started: false, altFt: 0, iasKts: 0, warnKts: 0, hdgDeg: 0, stalled: false };
export function slowSimStep(st, sim, dt, started) {
  const { x, y, z, w } = sim.quat;
  const flaps = sim.flapPos ?? sim.flapsIndex; // the horn's flaps (main.js): where the wing is
  _s.dt = dt;
  _s.started = started;
  _s.altFt = sim.pos.y * M_TO_FT;
  _s.iasKts = sim.iasKts;
  _s.warnKts = stallWarningKts(sim.spec, flaps);
  _s.hdgDeg = (-Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) * 180 / Math.PI + 360) % 360;
  _s.stalled = sim.aoaDeg > stallAoaDeg(sim.spec, sim.flapsIndex);
  return slowFlightStep(st, _s);
}
export const slowCoach = (st, kid) => slowPrompt(st, _s, kid);
export const kidGuide = (st, out) => slowKidGuide(st, _s, out);

const WEIGHTS = { alt: 0.35, hdg: 0.25, speed: 0.4 };
export const SLOW_ACS_CAP = 84; // the top of a B: outside a test tolerance is not an A
export const SLOW_WARN_CAP = 69; // the top of a C: the test asks for no stall warning (S4)
export const SLOW_LOST_CAP = 54; // the top of a D
// The speed is held to the band: under 90% of the hold in it is outside the standard (≤ B).
export const SLOW_BAND_SHARE_B = 0.9;
export const SLOW_KID_NOTE = 'The plane flew it slowly for you';

// The grade from the drill's state at 'complete' or 'failed'.
export function gradeSlowFlight(st, kid = false) {
  const failed = st.phase === 'failed';
  const alt = st.maxAltDevFt, hdg = st.maxHdgDev;
  const share = st.holdS > 0 ? st.inBandS / st.holdS : 0;
  const factors = [
    { key: 'alt', label: 'Altitude held (test: ±100 ft)', value: `${Math.round(alt) === 0 ? '' : st.altSignFt < 0 ? '−' : '+'}${Math.round(alt)} ft at worst`,
      score: curve(alt, [[50, 100], [100, 85], [200, 40], [300, 10], [400, 0]]) },
    { key: 'hdg', label: 'Heading held (test: ±10°)', value: `${Math.round(hdg)}° off at worst`,
      score: curve(hdg, [[5, 100], [10, 85], [20, 40], [30, 0]]) },
    { key: 'speed', label: `Time at ${Math.round(st.targetKts)}-${Math.round(st.targetKts + SLOW_KTS_OVER)} kt (test: +10/−0)`, value: `${Math.round(share * 100)}%`,
      score: curve(1 - share, [[0.05, 100], [0.1, 85], [0.4, 40], [0.7, 0]]) },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = null;
  if (failed) {
    score = Math.min(score, SLOW_LOST_CAP);
    reason = st.why === 'stall' ? 'Stalled: slow flight lives just above the stall warning. When the horn sounds, lower the nose a little and add power.'
      : st.why === 'height' ? (st.altSignFt < 0 ? `Lost over ${SLOW_FAIL_FT} ft: as you slow, raise the nose and add power to hold your height.`
        : `Gained over ${SLOW_FAIL_FT} ft: less nose-up, less power.`)
        : 'Never slowed down: throttle back and raise the nose until the speed is in the band.';
  } else if (alt > 2 * SLOW_ALT_TOL_FT) {
    score = Math.min(score, SLOW_LOST_CAP);
    reason = `${st.altSignFt < 0 ? 'Lost' : 'Gained'} ${Math.round(alt)} ft: the test allows 100. Capped at D.`;
  } else if (st.warned) {
    score = Math.min(score, SLOW_WARN_CAP);
    reason = 'The stall warning sounded: the test asks for none. Capped at C.';
  } else if (alt > SLOW_ALT_TOL_FT || hdg > SLOW_HDG_TOL_DEG || share < SLOW_BAND_SHARE_B) {
    score = Math.min(score, SLOW_ACS_CAP);
    reason = share < SLOW_BAND_SHARE_B ? 'Speed outside the band for part of the hold: no better than a B.' : 'Outside a test tolerance: no better than a B.';
  }
  return { kind: 'slowFlight', title: failed ? 'Slow flight not finished' : 'Slow flight', grade: letterGrade(score), score, factors, reason,
    note: kid && !failed ? SLOW_KID_NOTE : null };
}
