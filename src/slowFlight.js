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
import { stallAoaDeg, stallWarningKts, stallSpeedKts, liftCoefficient } from './aero.js';
import { M_TO_FT, KTS_TO_MPS } from './constants.js';
import { turbulenceSigmaW } from './turbulence.js';

export const SLOW_KEY = 'c172_slow_flight';
// The ACS tolerances (Area VII Task A, skill S5).
export const SLOW_ALT_TOL_FT = 100;
export const SLOW_HDG_TOL_DEG = 10;
export const SLOW_KTS_OVER = 10; // airspeed +10/-0 kt
// The "specified airspeed": this far over the airplane's own stall warning (aero.js stallWarningKts,
// the horn's speed for where the flaps are), so the −0 edge is still clear of the horn, with room for a
// METAR gust. The C172 clean: warning 58 KIAS, target 63, band 63-73. The band follows the flaps (the
// horn's speed does); S5's bank ±10° is not graded (the drill is straight and level).
export const SLOW_TARGET_OVER_WARN_KTS = 5;
// A gusty METAR raises the band by half its gust spread (the handbook's turbulent-air approach rule, FAA-H-8083-3C
// ch. 9, borrowed): a sharp 10 kt gust from behind drops the IAS ~10 kt at once, and mid-band in 15G25 the
// model's wing went from the warning's angle to the stall in 0.4 s (tests/flight/slowFlight.test.js).
export const SLOW_GUST_SHARE = 0.5;
// The METAR's turbulence (0195, turbulence.js) on top (0199): a vertical gust w lifts the wing's angle of attack by
// w / V (V the true airspeed). The band's low edge is at least the speed where the 1 g angle plus a SLOW_TURB_SIGMAS σ_w
// gust stays under the stall angle (turbulenceFloorKts); the gust share's band is kept when it is already higher. The
// C172 at ~5,000 ft: a steady 25 kt (σ_w 1.18 m/s, no gust spread) raises the low edge 63 → 64 KIAS; 20G40 (σ_w 1.8)
// needs 70.6, under the gust share's 73; 15G25 and 25G38 need 61-64, under theirs (68, 69.5).
export const SLOW_TURB_SIGMAS = 3;
// The hold: SLOW_HOLD_S seconds inside every tolerance ends it; it is graded anyway after
// SLOW_HOLD_MAX_S in the band's reach.
export const SLOW_HOLD_S = 45;
export const SLOW_HOLD_MAX_S = 90;
// Not finished: never slowed to the band this long after the start, this far off the height, or stalled.
export const SLOW_FAIL_SLOWING_S = 120;
export const SLOW_FAIL_FT = 500;
// The warning counts once it has sounded this long at a stretch, or this long in all (a gust's blip is
// not the pilot's speed; a run of short ones is).
export const SLOW_WARN_S = 1;
export const SLOW_WARN_TOTAL_S = 2;
export const SLOW_IAS_TAU_S = 2;
// On a gusty or turbulent day (the band raised for it) the band's share is graded on the airspeed averaged the way a pilot
// reads the needle through the bumps (0208): FAA-S-ACS-6C Appendix 3 (p. 77, Area VII Task A) says turbulence may cause
// momentary deviations and that "unsatisfactory performance would arise from an applicant's continual deviation from
// the standard"; Appendix 1 (p. 68) names "consistently exceeding tolerances". The coach's words and the slow-down's end
// still read the 2 s filter; the average starts at the hold's entry. Sized in tests/flight/slowFlight.test.js's 0208 cards
// (15G25, 25G38, 25 kt, 6 seeds each, the handbook pilot at the band's middle): 2 s graded 6 of 18 B on the speed, 4 s 4,
// 6 s none (the two B left are 100-103 ft of height). weather.js's gust cycle swings over ~3-17 s.
export const SLOW_IAS_GUSTY_TAU_S = 6;
// The band visibly raised for the gusts or the turbulence (a steady 22 kt's 0.3 kt is not): the hold's bumpy-air words
// and the needle-averaged grade (SLOW_IAS_GUSTY_TAU_S).
export const SLOW_GUSTY_KTS = 0.5;
export const SLOW_PLACE = { name: 'Over Grapevine Lake · 4,500 ft' };

export const SLOW_TEXT = {
  sfwSlow: 'Throttle back, raise the nose bit by bit: slow down, hold your height',
  sfwSlowing: 'Sinking: raise the nose a little more as you slow',
  sfwSlowHigh: 'Climbing: stop raising the nose, ease it down a little',
  sfwNear: 'Nearly there: add some power back to hold your height',
  sfwHorn: 'Stall warning: lower the nose a little and add power',
  sfwTooSlow: 'Too slow: lower the nose a little, add power',
  sfwFastSink: 'Fast and sinking: raise the nose a little',
  sfwFast: 'A little fast: a little less power, nose up a little to stay level',
  sfwSink: 'Sinking: add power',
  sfwClimb: 'Climbing: take off a little power',
  sfwClimbNose: 'Climbing: ease the nose down a little',
  sfwHdgL: 'Nose drifting left: bank a little right',
  sfwHdgR: 'Nose drifting right: bank a little left',
  sfwHold: 'Hold it: slow, level, on your heading',
  sfwKidIn: 'Let go: the plane slows down and holds its height',
  sfwKid: 'The plane flies slowly: nose high, lots of power to stay up',
};
Object.assign(DRILL_TEXT, SLOW_TEXT);
Object.assign(RANK, { sfwSlow: 1, sfwSlowing: 1, sfwSlowHigh: 1, sfwNear: 1, sfwFast: 1, sfwFastSink: 2, sfwSink: 1, sfwClimb: 1, sfwClimbNose: 1,
  sfwHdgL: 1, sfwHdgR: 1, sfwHold: 1, sfwTooSlow: 2, sfwHorn: 2, sfwKidIn: 1, sfwKid: 1 });
// The band's numbers in the words (the HUD's tape marks the horn, not the band): rewritten when the target moves
// (the flaps), in the drill's own DRILL_TEXT entries, so boot carries none of it.
// gusty: the band is raised for the METAR's gusts or turbulence, and the hold's words say why and how (AFH ch. 4: in
// rough air hold the attitude and let the speed wander a little).
export function slowBandWords(targetKts, gusty = false) {
  const t = Math.round(targetKts), top = t + SLOW_KTS_OVER;
  DRILL_TEXT.sfwSlow = `Throttle back, raise the nose bit by bit: slow to ${top} kt, hold your height`;
  DRILL_TEXT.sfwTooSlow = `Too slow: under ${t} kt. Lower the nose a little, add power`;
  DRILL_TEXT.sfwFast = `Fast: over ${top} kt. A little less power, nose up a little to stay level`;
  DRILL_TEXT.sfwHold = gusty ? `Bumpy air: nose steady, keep ${t}-${top} kt (raised for the bumps). Quick dips are OK, staying out is not`
    : `Hold it: ${t}-${top} kt, level, on your heading`;
}

// phase: 'wait' (the start screen: the drill starts when the player does), 'slowing' (cruise down to the
// band), 'holding' (in the band's reach: the timer runs), 'complete' (graded), 'failed' (graded D).
export const createSlowFlight = () => ({
  phase: 'wait', alt0: 0, hdg0: 0, t: 0, kidKts: 0, holdS: 0, okS: 0, inBandS: 0, targetKts: 0, iasF: 0,
  iasG: 0, gusty: false, maxAltDevFt: 0, altSignFt: 0, maxHdgDev: 0, underKts: 0, overKts: 0, warnRunS: 0, warnS: 0, warned: false, why: null,
});

const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
const warning = (s) => s.iasKts < s.warnKts || s.aoaDeg >= s.warnAoaDeg;

// The wing's angle of attack at the warning speed in 1 g (deg): where its lift is CLmax·(Vs/Vwarn)², by
// bisection on aero.js's own lift curve (its importing autopilot.js trimAoaDeg could split boot, LESSONS 0080).
export function warnAoaDeg(spec, flaps) {
  const aS = stallAoaDeg(spec, flaps), r = stallSpeedKts(spec, flaps) / stallWarningKts(spec, flaps);
  const cl = liftCoefficient(spec, aS * Math.PI / 180, flaps) * r * r;
  let lo = 0, hi = aS;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (liftCoefficient(spec, m * Math.PI / 180, flaps) < cl) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// The lowest IAS (kt) at which the 1 g angle of attack plus a SLOW_TURB_SIGMAS σ_w vertical gust stays under the stall
// angle, by bisection on aero.js's lift curve (monotone: the faster, the lower the 1 g angle and the smaller w / V).
// sigmaW (m/s, turbulence.js turbulenceSigmaW); tasPerIas: the true airspeed over the indicated where it is flown.
// 0 in calm air. Called when the weather, the flaps or the airplane change, never per frame.
function aoa1gDeg(spec, flaps, aS, clMax, vs, kts) {
  const cl = clMax * (vs / kts) ** 2;
  let lo = -10, hi = aS;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (liftCoefficient(spec, m * Math.PI / 180, flaps) < cl) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
export function turbulenceFloorKts(spec, flaps, sigmaW, tasPerIas = 1) {
  if (!(sigmaW > 0)) return 0;
  const aS = stallAoaDeg(spec, flaps), clMax = liftCoefficient(spec, aS * Math.PI / 180, flaps), vs = stallSpeedKts(spec, flaps);
  const over = (kts) => aoa1gDeg(spec, flaps, aS, clMax, vs, kts) + SLOW_TURB_SIGMAS * sigmaW / (kts * KTS_TO_MPS * tasPerIas) * 180 / Math.PI > aS;
  let lo = vs, hi = 3 * vs;
  if (over(hi)) return hi;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (over(m)) lo = m; else hi = m; }
  return hi;
}

// One sub-step. st is mutated (no allocation). s: { dt, started (the player is flying), altFt (any datum,
// the same each step), iasKts, warnKts (the horn's speed now), gustAddKts (the gust's share), aoaDeg, warnAoaDeg (warnAoaDeg()), hdgDeg
// (the nose, true), stalled }.
// Returns the transition: 'slowing' | 'holding' | 'complete' | 'failed' | ''.
export function slowFlightStep(st, s) {
  if (st.phase === 'complete' || st.phase === 'failed') return '';
  st.targetKts = s.warnKts + SLOW_TARGET_OVER_WARN_KTS + s.gustAddKts;
  if (st.phase === 'wait') {
    // The specified altitude and heading are the ones the player starts from.
    st.alt0 = s.altFt; st.hdg0 = s.hdgDeg; st.iasF = st.iasG = st.kidKts = s.iasKts;
    if (!s.started) return '';
    st.phase = 'slowing';
    return 'slowing';
  }
  st.t += s.dt;
  st.kidKts = Math.max(st.targetKts + SLOW_KTS_OVER / 2, st.kidKts - SLOW_KID_DECEL_KTS_S * s.dt);
  // The airspeed through a ~2 s filter (a METAR gust's spike is not the pilot's speed), as steepTurns.js.
  st.iasF += (s.iasKts - st.iasF) * Math.min(1, s.dt / SLOW_IAS_TAU_S);
  st.iasG += (s.iasKts - st.iasG) * Math.min(1, s.dt / (s.gustAddKts >= SLOW_GUSTY_KTS ? SLOW_IAS_GUSTY_TAU_S : SLOW_IAS_TAU_S));
  const altDev = s.altFt - st.alt0, hdgDev = Math.abs(wrap180(s.hdgDeg - st.hdg0));
  // The height and heading are held from the start, through the slow-down too (S5).
  if (Math.abs(altDev) > st.maxAltDevFt) { st.maxAltDevFt = Math.abs(altDev); st.altSignFt = altDev; }
  st.maxHdgDev = Math.max(st.maxHdgDev, hdgDev);
  // The warning: the horn (main.js isStallWarning: IAS under the warning speed) or the wing at the angle
  // of attack the horn sounds at in 1 g (s.warnAoaDeg): a gust or a pull warns at any speed (ACS S3 names
  // load factor and buffet; the real C172's warner reads the wing). Held SLOW_WARN_S, or SLOW_WARN_TOTAL_S in all.
  st.warnRunS = warning(s) ? st.warnRunS + s.dt : 0;
  if (st.warnRunS > 0) st.warnS += s.dt;
  if (st.warnRunS >= SLOW_WARN_S || st.warnS >= SLOW_WARN_TOTAL_S) st.warned = true;
  if (s.stalled || st.maxAltDevFt > SLOW_FAIL_FT || (st.phase === 'slowing' && st.t > SLOW_FAIL_SLOWING_S)) {
    st.why = s.stalled ? 'stall' : st.maxAltDevFt > SLOW_FAIL_FT ? 'height' : 'time';
    st.phase = 'failed';
    return 'failed';
  }
  const top = st.targetKts + SLOW_KTS_OVER;
  if (st.phase === 'slowing') {
    if (st.iasF > top) return '';
    st.iasG = st.iasF; // the needle's average starts at the hold, not on the way down from cruise
    st.phase = 'holding';
    return 'holding';
  }
  st.holdS += s.dt;
  if (s.gustAddKts >= SLOW_GUSTY_KTS) st.gusty = true; // the grade's words say the bumps only on a day that had them
  const inBand = st.iasG >= st.targetKts && st.iasG <= top;
  if (inBand) st.inBandS += s.dt;
  st.underKts = Math.max(st.underKts, st.targetKts - st.iasG);
  st.overKts = Math.max(st.overKts, st.iasG - top);
  if (inBand && Math.abs(altDev) <= SLOW_ALT_TOL_FT && hdgDev <= SLOW_HDG_TOL_DEG) st.okS += s.dt;
  if (st.okS >= SLOW_HOLD_S || st.holdS >= SLOW_HOLD_MAX_S) {
    st.phase = 'complete';
    return 'complete';
  }
  return '';
}

// The coach's word for this moment (coach.js s.ds, rank 1-2). kid: the guide and the autothrottle fly it.
// s.throttle (0-1): a climb at idle power is the nose's, not the power's.
export function slowPrompt(st, s, kid) {
  if (st.phase === 'complete' || st.phase === 'failed') return null;
  if (kid) return st.phase === 'holding' ? 'sfwKid' : 'sfwKidIn';
  if (warning(s)) return 'sfwHorn';
  if (st.phase === 'wait') return 'sfwSlow';
  const altDev = s.altFt - st.alt0, top = st.targetKts + SLOW_KTS_OVER, half = SLOW_ALT_TOL_FT / 2;
  if (st.phase === 'slowing') {
    if (altDev > half) return 'sfwSlowHigh';
    if (altDev < -half) return 'sfwSlowing';
    // The power goes back in as the speed reaches the band: the slower the Cessna flies level, the more it needs.
    if (st.iasF < top + 5) return 'sfwNear';
    return 'sfwSlow';
  }
  // Near the bottom of the power curve (the model's C172 needs the least power level at ~70 KIAS) the nose is the
  // quicker lever on the speed and the power on the height.
  if (st.iasF < st.targetKts) return 'sfwTooSlow';
  if (st.iasF > top && altDev < -half) return 'sfwFastSink'; // more power would only speed the dive
  if (st.iasF > top) return 'sfwFast';
  if (altDev < -half) return 'sfwSink';
  if (altDev > half) return s.throttle < 0.25 ? 'sfwClimbNose' : 'sfwClimb';
  const hdgErr = wrap180(s.hdgDeg - st.hdg0);
  if (Math.abs(hdgErr) > SLOW_HDG_TOL_DEG / 2) return hdgErr < 0 ? 'sfwHdgL' : 'sfwHdgR';
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
const _s = { dt: 0, started: false, altFt: 0, iasKts: 0, warnKts: 0, gustAddKts: 0, aoaDeg: 0, warnAoaDeg: 90, hdgDeg: 0, stalled: false, throttle: 0 };
let wordsKts = 0, wordsGusty = false, wordsRev = 0, floorSigma = 0, aoaFor = null, aoaFlaps = -1, floorWind = -1, floorGust = -1, floorFlaps = -1, floorKts = 0;
export function slowSimStep(st, sim, dt, started) {
  const { x, y, z, w } = sim.quat;
  const flaps = sim.flapPos ?? sim.flapsIndex; // the horn's flaps (main.js): where the wing is
  _s.dt = dt;
  _s.started = started;
  _s.altFt = sim.pos.y * M_TO_FT;
  _s.iasKts = sim.iasKts;
  _s.warnKts = stallWarningKts(sim.spec, flaps);
  const wx = sim.wx;
  const share = wx?.gustKts > wx?.windKts ? SLOW_GUST_SHARE * (wx.gustKts - wx.windKts) : 0;
  // The turbulence floor (0199), worked out again only when the weather, the flap lever or the airplane change (keyed on
  // the lever, not the flaps' travel: flapPos moves every substep for seconds and the bisection is ~16 µs).
  if (floorWind !== wx?.windKts || floorGust !== wx?.gustKts || floorFlaps !== sim.flapsIndex || aoaFor !== sim.spec) {
    floorWind = wx?.windKts; floorGust = wx?.gustKts; floorFlaps = sim.flapsIndex;
    floorSigma = turbulenceSigmaW(wx);
    floorKts = turbulenceFloorKts(sim.spec, sim.flapsIndex ?? flaps, floorSigma, sim.iasKts > 20 && sim.tasKts > 0 ? sim.tasKts / sim.iasKts : 1);
  }
  _s.gustAddKts = Math.max(share, floorKts - _s.warnKts - SLOW_TARGET_OVER_WARN_KTS);
  _s.hdgDeg = (-Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) * 180 / Math.PI + 360) % 360;
  _s.aoaDeg = sim.aoaDeg ?? 0;
  if (aoaFor !== sim.spec || aoaFlaps !== flaps) { aoaFor = sim.spec; aoaFlaps = flaps; _s.warnAoaDeg = warnAoaDeg(sim.spec, flaps); }
  _s.stalled = _s.aoaDeg > stallAoaDeg(sim.spec, flaps);
  _s.throttle = sim.throttle ?? 0;
  const ev = slowFlightStep(st, _s);
  const gusty = _s.gustAddKts >= SLOW_GUSTY_KTS;
  if (Math.round(st.targetKts) !== wordsKts || gusty !== wordsGusty) { wordsKts = Math.round(st.targetKts); wordsGusty = gusty; slowBandWords(st.targetKts, gusty); wordsRev++; }
  return ev;
}
export const slowCoach = (st, kid) => slowPrompt(st, _s, kid);
// Bumped when the band's words are rewritten (main.js re-renders a coach line whose key has not changed).
export const slowWordsRev = () => wordsRev;
// Learner's angle-of-attack protection in the drill (main.js applyAssists, assists.js: stall − 4°) less the gust a
// SLOW_LEARNER_SIGMAS σ_w eddy adds (w / V) at the share of the turbulence the level flies (0199 panel: full back stick
// at idle in Learner's half of 20G40 stalled 30 seeds in 30 on the protection alone). sim: tasKts; 0 in calm air.
export const SLOW_LEARNER_SIGMAS = 2;
export const slowGustAoaDeg = (sim, share) => (floorSigma > 0
  ? SLOW_LEARNER_SIGMAS * floorSigma * share / Math.max(20, (sim.tasKts ?? 0) * KTS_TO_MPS) * 180 / Math.PI : 0);
export const kidGuide = (st, out) => slowKidGuide(st, _s, out);

const WEIGHTS = { alt: 0.35, hdg: 0.25, speed: 0.4 };
export const SLOW_ACS_CAP = 84; // the top of a B: outside a test tolerance is not an A
export const SLOW_WARN_CAP = 69; // the top of a C: the test asks for no stall warning (S4)
export const SLOW_LOST_CAP = 54; // the top of a D
// The speed is held to the band: under 90% of the hold in it is outside the standard (≤ B).
export const SLOW_BAND_SHARE_B = 0.9;
export const SLOW_KID_NOTE = 'The plane flew the slow flight for you';

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
    { key: 'speed', label: `Time at ${Math.round(st.targetKts)}-${Math.round(st.targetKts + SLOW_KTS_OVER)} kt${st.gusty ? ', averaged through the bumps' : ''} (test: up to 10 kt over, never under)`, value: `${Math.round(share * 100)}%`,
      score: curve(1 - share, [[0.05, 100], [0.1, 85], [0.4, 40], [0.7, 0]]) },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = null;
  const t = Math.round(st.targetKts), top = t + SLOW_KTS_OVER;
  // Kid's guide and autothrottle fly the hold: its reasons say what the plane did, not what to do with the stick or the
  // power, and blame the bumps only on a day that had them (0208).
  const avg = st.gusty ? ' on average' : '';
  const kidWhy = (dir) => (st.gusty ? `the bumps ${dir === 'slow' ? 'slowed the plane' : 'sped the plane up'}, not you`
    : `the plane got too ${dir} (did the stick or the flaps move?)`);
  if (failed) {
    score = Math.min(score, SLOW_LOST_CAP);
    reason = kid ? (st.why === 'stall' ? 'Stalled: the plane got too slow for its wing.' : st.why === 'height' ? `The plane went over ${SLOW_FAIL_FT} ft off its height.`
      : 'The plane never slowed down to the band.')
      : st.why === 'stall' ? 'Stalled: slow flight lives just above the stall warning. At the first sign (the horn, the buffet, a gust), lower the nose a little and add power.'
      : st.why === 'height' ? (st.altSignFt > 0 ? `Gained over ${SLOW_FAIL_FT} ft: ease the nose down a little and take off some power.`
        : st.overKts > 0 ? `Lost over ${SLOW_FAIL_FT} ft with the nose low and the speed up: raise the nose to slow down and stop the sink.`
          : `Lost over ${SLOW_FAIL_FT} ft: as you slow, raise the nose and add power to hold your height.`)
        : `Never slowed down: throttle back and raise the nose until the speed is ${top} kt or less.`;
  } else if (alt > 2 * SLOW_ALT_TOL_FT) {
    score = Math.min(score, SLOW_LOST_CAP);
    reason = `${st.altSignFt < 0 ? 'Lost' : 'Gained'} ${Math.round(alt)} ft: the test allows 100.${kid ? '' : ` ${st.altSignFt < 0 ? 'Add power when you sink' : 'Take off power when you climb'}.`} Capped at D.`;
  } else if (st.warned) {
    score = Math.min(score, SLOW_WARN_CAP);
    reason = kid ? 'The stall warning sounded: the test asks for none. Capped at C.'
      : 'The stall warning sounded (the horn, or the wing that close to it in a gust): the test asks for none. Fly higher in the band on a gusty day; at the first sign, lower the nose a little and add power. Capped at C.';
  } else if (alt > SLOW_ALT_TOL_FT || hdg > SLOW_HDG_TOL_DEG || share < SLOW_BAND_SHARE_B) {
    score = Math.min(score, SLOW_ACS_CAP);
    reason = share < SLOW_BAND_SHARE_B
      ? (st.underKts >= st.overKts ? `Too slow (down to ${Math.round(t - st.underKts)} kt${avg}) for part of the hold: ${kid ? kidWhy('slow') : 'lower the nose a little'}. No better than a B.`
        : `Too fast (up to ${Math.round(top + st.overKts)} kt${avg}) for part of the hold: ${kid ? kidWhy('fast') : 'raise the nose a little'}. No better than a B.`)
      : alt > SLOW_ALT_TOL_FT ? `Height went ${Math.round(alt)} ft off: the test allows 100.${kid ? '' : ' More power if you sink, less if you climb.'} No better than a B.`
        : `Heading went ${Math.round(hdg)}° off: the test allows 10. No better than a B.`;
  }
  return { kind: 'slowFlight', title: failed ? 'Slow flight not finished' : 'Slow flight', grade: letterGrade(score), score, factors, reason,
    note: kid && !failed ? SLOW_KID_NOTE : null };
}
