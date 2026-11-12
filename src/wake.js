// Wake-turbulence lesson (ticket 0115): the Cessna on a 5 NM final to KDFW 35C behind the traffic 737
// (traffic.js, 0080) landing on the same runway. AIM 7-4-6 (Vortex Avoidance Procedures), "Landing behind
// a larger aircraft - same runway. Stay at or above the larger aircraft's final approach flight path - note
// its touchdown point - land beyond it." (FAA AIM, chap7_section_4, read 2026-11-12). The 737-800 is a larger
// aircraft to a Cessna, not a Heavy (AIM 7-4-9): the words say "the jet", never "the heavy".
//
// A graded procedure, not a wake model: no vortex pushes the airplane (the mission card says so). traffic.js
// records the jet's own wheel height along its final (w.path, binned as laid out here) and its touchdown
// point (w.tdAlongM); this module checks the player's wheels against that path inside CHECK_NM and the
// touchdown against that point. A lazy chunk, loaded with the mission (main.js startDrills); boot carries the
// mission's entry and the hooks. Pure (no THREE, no DOM): tests/unit/wake.test.js, tests/flight/wake.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK } from './coach.js';
// Only symbols main.js already imports: a lazy chunk importing one it doesn't grows the boot chunk's exports.
import { M_TO_FT, NM_TO_M } from './constants.js';
import { AIM_POINT_M } from './airports.js';

export const WAKE_KEY = 'kdfw_35c_wake';
// The jet's spawn (2 NM ahead of the player when the player starts flying, 1.5 NM out at the least, never in a
// tailwind over the 737's 10 kt limit) is traffic.js wakeSpawnFor's.
// The path is checked inside this distance from the threshold (the ticket's 2 NM), up to the jet's touchdown point.
export const CHECK_NM = 2;
// "Below its path": the player's wheels more than BELOW_FT under the jet's, for BELOW_S. A game tolerance: the jet's
// own wheels hold the 3° path within ~2 ft (tests/flight/wake.test.js), so 20 ft is a gust's margin, not a band to
// hide in. The PAPI's on-path band (3° ±10', AC 150/5340-30J) is wider than that low down: its lower edge is ~30 ft
// under the jet's path at 2 NM, and the coach says so (wkBelow) as it happens. A gust's dip is not a decision.
export const BELOW_FT = 20;
export const BELOW_S = 2;
// The path's layout: one wheel height (sim Y) every BIN_M metres (0.9 ft of a 3° path) from FROM_M before the
// threshold to TO_M past it: ~1,400 numbers, made once per flight.
export const BIN_M = 5;
export const FROM_M = -CHECK_NM * NM_TO_M - 200;
export const TO_M = 3000;
// Coach timing: the opening words, then the jet's touchdown point, each held this long.
export const SAY_S = 8;
// Either mistake caps the landing at C (score 69, as one bounce does: landing.js capBounced).
export const CAP_SCORE = 69;
// landing.js's touchdown-zone weight (WEIGHTS.zone), inlined: the drill rescores that one factor from the jet's point.
export const ZONE_W = 0.2;
// The drill's touchdown zone, metres past the jet's touchdown point: full marks from 30 m to 750 m beyond it, then
// down to 40 at 1,200 m. A game choice: landing.js's own spans 450 m, but a landing past a jet's ~2,200 ft is long
// by design, and 750 m beyond still leaves 35C over 2.6 km to stop in (a tailwind floats the Cessna that far).
const ZONE_PTS = [[0, 80], [30, 100], [750, 100], [1200, 40], [1800, 20]];

export const WAKE_TEXT = {
  wkWatch: 'A jet is landing ahead: stay at or above its path',
  wkWatchKid: 'A jet is landing ahead: your plane stays above its path',
  wkBelow: "Below the jet's path, in its wake: climb back above it",
  wkLanded: 'The jet touched down: land beyond its touchdown point', // wakeStep words it with the feet
  wkLandedKid: 'The jet touched down: your plane will land past it',
  wkHigh: "Above the jet's path: good. Hold it, land beyond its touchdown",
};
Object.assign(DRILL_TEXT, WAKE_TEXT);
// Below the path interrupts the landing coach at once; the others wait their turn.
Object.assign(RANK, { wkBelow: 3 });

// end: the drill's runway end (airports.js). Allocates (a mission load, not a frame).
export function createWake(end) {
  const n = Math.ceil((TO_M - FROM_M) / BIN_M);
  return {
    end, fromM: FROM_M, binM: BIN_M, path: new Float64Array(n).fill(NaN),
    ready: false, readyT: null, spawned: false, noJet: null, jetDone: false,
    tdAlongM: null, tdT: null, t: 0,
    underFt: null, belowS: 0, below: false, worstFt: 0,
  };
}

// The jet's recorded wheel height (sim Y) at alongM past the threshold (- before it), or NaN where it hasn't flown.
export function jetPathY(w, alongM) {
  const i = Math.floor((alongM - w.fromM) / w.binM);
  return i >= 0 && i < w.path.length ? w.path[i] : NaN;
}

// One frame, once the player is flying (main.js: cockpitEntered, no modal). alongM: the player's metres past
// the drill's threshold along its centreline (- before it); wheelY: the player's wheels (sim Y). Mutates w,
// allocates nothing except the touchdown words, once.
export function wakeStep(w, alongM, wheelY, onGround, dt) {
  if (w.readyT === null) w.readyT = w.t;
  w.t += dt;
  if (w.tdAlongM !== null && w.tdT === null) {
    w.tdT = w.t;
    DRILL_TEXT.wkLanded = `The jet touched down ${Math.round(w.tdAlongM * M_TO_FT / 100) * 100} ft in: land beyond that`;
  }
  const jy = jetPathY(w, alongM);
  const inside = !onGround && alongM > -CHECK_NM * NM_TO_M && (w.tdAlongM === null || alongM < w.tdAlongM);
  if (!inside || Number.isNaN(jy)) { w.underFt = null; w.belowS = 0; return w; }
  const under = (jy - wheelY) * M_TO_FT;
  w.underFt = under;
  if (under > w.worstFt) w.worstFt = under;
  if (under > BELOW_FT) {
    w.belowS += dt;
    if (w.belowS >= BELOW_S) w.below = true;
  } else w.belowS = 0;
  return w;
}

// The coach's key (through coach.js s.ds), or null for the landing coach's own. aglFt: the player's height;
// below 100 ft the flare's words win (the grade still counts the path). papiWhite and heightAbovePathM (the
// 3° path's, airports.js approachGeometry): on the PAPI's high side but inside the lesson's band (gateHeightAbovePathM)
// the landing coach would say "You're high": here that is the lesson, so it says so instead.
export function wakePrompt(w, aglFt, kid, papiWhite = null, heightAbovePathM = 0, aimPointM = AIM_POINT_M) {
  if (!w.spawned || w.noJet || w.readyT === null) return null;
  if (!kid && w.underFt !== null && w.underFt > BELOW_FT && aglFt > 100) return 'wkBelow';
  if (w.tdT !== null && w.t - w.tdT < SAY_S) return kid ? 'wkLandedKid' : 'wkLanded';
  if (w.tdT === null && w.t - w.readyT < SAY_S) return kid ? 'wkWatchKid' : 'wkWatch';
  if (!kid && papiWhite >= 3 && aglFt > 100 && heightAbovePathM > 0 && gateHeightAbovePathM(w, heightAbovePathM, aimPointM) === 0) return 'wkHigh';
  return null;
}

// Kid's guide flies a 3° path aimed KID_AIM_PAST_M past the jet's touchdown point once it is known (the path's
// lift above the standard one, metres, for assists.js kidFinalGuide). Kid's flare lands short of its aim point into
// a headwind and long in calm air (the guide's 2° floor past the threshold): 100 m lands it ~55 m past the jet in
// 15 kt on the nose, ~440 m past it in calm air and ~600 m in a 5 kt tailwind (tests/flight/kidFinal.test.js), inside
// the drill's full marks.
const TAN3 = Math.tan(3 * Math.PI / 180);
export const KID_AIM_PAST_M = 100;
export const kidLiftM = (w, aimPointM = AIM_POINT_M) => (w.tdAlongM === null ? 0 : Math.max(0, w.tdAlongM + KID_AIM_PAST_M - aimPointM) * TAN3);

// The stabilized gate's glide-path error on the lesson (metres above the path, for main.js's glideslope dots,
// aero.js stabilizedGate): anywhere from the 3° path up to Kid's (aimed past the jet's point) is on the lesson's
// path, as AIM 7-4-6 asks; under the 3° path, or above Kid's, the distance to it. Off the lesson: the 3° path's.
export function gateHeightAbovePathM(w, heightAbovePathM, aimPointM = AIM_POINT_M) {
  const lift = kidLiftM(w, aimPointM);
  return heightAbovePathM > lift ? heightAbovePathM - lift : Math.min(0, heightAbovePathM);
}

export const DONE_NOTE = 'At or above the jet\'s path, landed beyond it: clear of its wake.';
const ft = (m) => Math.round(Math.abs(m) * M_TO_FT);

// The landing's grade (landing.js gradeLanding, after any cap) with the drill's rules. pastThresholdM: the
// touchdown, metres past the drill's threshold. The touchdown-zone factor is scored from the jet's touchdown
// point; touching down short of it, or having flown under its path inside 2 NM, caps the grade at C, each with
// its reason. A crash stays a crash; a D for the runway itself (short, off it) stays a D. Pure.
export function wakeResult(result, w, pastThresholdM) {
  if (result.grade === 'CRASH') return result;
  if (w.tdAlongM === null) {
    return { ...result, reason: [result.reason, `No jet today (${w.noJet ?? 'it had not landed'}): graded as a normal landing.`].filter(Boolean).join(' ') };
  }
  const past = pastThresholdM - w.tdAlongM;
  const old = result.factors.find((f) => f.key === 'zone');
  const zone = {
    key: 'zone', label: "Past the jet's touchdown",
    value: past >= 0 ? `${ft(past)} ft beyond it` : `${ft(past)} ft short of it`,
    score: Math.round(past < 0 ? 0 : curve(past, ZONE_PTS)),
  };
  let score = Math.round(result.score + (zone.score - (old?.score ?? 0)) * ZONE_W);
  const caps = [];
  if (past < 0) caps.push("Landed short of the jet's touchdown point, where its wake settles: best grade C.");
  if (w.below) caps.push(`Flew under the jet's path inside ${CHECK_NM} NM (${Math.round(w.worstFt)} ft under): best grade C.`);
  if (caps.length) score = Math.min(score, CAP_SCORE);
  const keepD = result.grade === 'D' && result.reason;
  return {
    ...result,
    factors: result.factors.map((f) => (f.key === 'zone' ? zone : f)),
    score,
    grade: keepD ? 'D' : letterGrade(score),
    reason: [...caps, result.reason].filter(Boolean).join(' ') || null,
    note: caps.length || keepD ? result.note ?? null : DONE_NOTE,
  };
}
