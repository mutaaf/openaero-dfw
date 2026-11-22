// No-flap landing lesson (ticket 0210): the Cessna on a 4 NM final to Addison 16 with the flap lever stuck at 0°.
// Sources, read 2026-11-22:
//  - Cessna 172S POH (July 1998) Section 4, NORMAL LANDING checklist: "Airspeed 65-75 KIAS (flaps UP)" (and 60-70 KIAS
//    flaps down): the lesson holds the flaps-up band's middle, 70 KIAS.
//  - FAA Airplane Flying Handbook (FAA-H-8083-3C) ch. 9, p. 9-1, "Use of Flaps": flaps permit "lower approach and landing
//    speeds", "a steeper descent angle", "a lower pitch" and reduce "the length of the landing roll"; p. 9-3: "use the
//    manufacturer's recommended airspeed"; p. 9-8: "The pitch attitude of the airplane in a full-flap approach is
//    considerably lower than in a no-flap approach"; p. 9-3: reach the touchdown point "at an airspeed that results in
//    minimum floating", and p. 9-23 "higher approach speeds may result in excessive float in ground effect".
//  - FAA-S-ACS-6C (Private Pilot Airplane ACS, Nov 2023) Area IV Task B, S7: the recommended approach speed "+10/-5
//    knots, with gust factor applied".
//  - The ticket's flying notes (cfinotebook.net, flyingmag.com) put the extra distance near 50%; the manual gives none.
//
// Flown headless (tests/flight/noFlap.test.js, the game's own flight model on the PAPI's 3° path, the same flare): at
// 70 KIAS flaps 0 the nose sits ~2° higher than at 61 with flaps 30, the wheels touch ~165 ft further in at ~64 KIAS
// against ~55, the roll with the same braking is ~25% longer and the threshold-to-stop ~20% (no brakes: ~40%).
// Flown at the flaps-30 speed with the flaps up (61), it is nose high (~6° on the approach, ~11° at the touchdown): too
// slow for no flaps. A lazy chunk, loaded with the mission (main.js startDrills). Pure (no THREE, no DOM):
// tests/unit/noFlap.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK } from './coach.js';
// Only symbols main.js already imports: a lazy chunk importing one it doesn't grows the boot chunk's exports.
import { M_TO_FT } from './constants.js';

export const NO_FLAP_KEY = 'kads_16_no_flap';
// The lever's only notch for the lesson (aircraft.js flapDetentsDeg [0, 10, 20, 30]: 0°).
export const STUCK_FLAPS = 0;
// POH Section 4: 65-75 KIAS flaps up; the middle.
export const APPROACH_KTS = 70;
// ACS S7: +10/-5 knots (the upper bound plus half the METAR's gust spread, AFH ch. 9: "one-half the gust factor").
export const BAND_LOW_KTS = 5;
export const BAND_HIGH_KTS = 10;
// The band is checked from 500 ft down to 50 ft (the threshold's height on the PAPI's path, ~47 ft).
export const BAND_TOP_FT = 500;
export const BAND_FLOOR_FT = 50;
// Outside the band this long in one go counts (a gust's spike is not the pilot's).
export const BAND_S = 2;
// The touchdown zone, metres past the threshold: landing.js's full marks (150-600 m) with the float allowed for, its
// far edge FLOAT_M further (~500 ft: the game's no-flap touchdown is ~165 ft past the flaps-30 one with the same flare,
// a held-off float more). A game tolerance, not a handbook figure.
export const FLOAT_M = 150;
export const ZONE_PTS = [[0, 70], [150, 100], [600 + FLOAT_M, 100], [900 + FLOAT_M, 40], [1500 + FLOAT_M, 20]];
// The flaps-up and flaps-30 stalls (aero.js stallSpeedKts(c172, 0) and (c172, 3), the POH's Fig. 5-3 calibrated:
// tests/unit/noFlap.test.js pins them). The touchdown speed is scored against the flaps-up stall: full marks to ~1.25 of it.
export const STALL_UP_KTS = 53;
export const STALL_30_KTS = 48;
const TD_PTS = [[46, 40], [51, 90], [STALL_UP_KTS, 100], [66, 100], [74, 70], [82, 40]];
// Stopped: under this (kt). Graded anyway this long after the touchdown.
export const STOP_KTS = 3;
export const GRADE_AFTER_S = 60;
// Leaving the runway slower than this (kt) is an exit, not a run-off.
export const EXIT_KTS = 15;
// Caps: under the band is the lesson failed (C, "too slow for no flaps"); over it a B (a longer float).
export const CAP_C = 69;
export const CAP_B = 84;
export const SAY_S = 8;
// landing.js's weights (WEIGHTS.zone, WEIGHTS.speed), inlined: the lesson rescores those two factors.
const ZONE_W = 0.2, SPEED_W = 0.1;

export const NF_TEXT = {
  nfBrief: 'No flaps: the lever is stuck at 0. Hold 70 knots on the PAPI; expect a long float, don\'t force it down',
  nfKid: 'No flaps today: your plane lands faster. It floats a long way, then tap BRAKES',
  nfSlow: 'Too slow for no flaps: nose down a touch, power up to 70',
  nfFloat: 'Long float: hold it just off the runway, let it settle. Don\'t push it down',
};
Object.assign(DRILL_TEXT, NF_TEXT);
// The slow call interrupts (the landing coach's slow is rank 2); the float is the flare's (rank 3).
Object.assign(RANK, { nfSlow: 2, nfFloat: 3 });

// end: the lesson's runway end (airports.js runwayEnd). Allocates (a mission load, not a frame).
export const createNoFlap = (end) => ({
  end, t: 0, readyT: null, again: false, below500: false, outS: 0, slowOut: false, fastOut: false, minKts: Infinity, maxKts: 0,
  floatS: 0, tdM: null, tdT: null, tdKts: null, tdGsKts: null, stopped: false, off: false, stopM: null,
});

// One frame, once the player is flying (main.js: cockpitEntered, no modal). s: { alongM (metres past the threshold
// along the centreline, - before it), crossM, aglFt (wheels), vsFpm, iasKts, onGround, gsKts, wx (weather.js: the gust
// for the band) }. Mutates nf, allocates nothing.
export function noFlapStep(nf, s, dt) {
  if (nf.readyT === null) nf.readyT = nf.t;
  nf.t += dt;
  // Airborne again past 50 ft after a touchdown (a go-around, or after the graded stop): the next landing is its own.
  if (nf.tdM !== null && !s.onGround && s.aglFt > 50) {
    nf.tdM = nf.tdT = nf.tdKts = nf.tdGsKts = nf.stopM = null;
    nf.stopped = nf.off = false;
    nf.again = true;
  }
  if (nf.below500 && s.aglFt > BAND_TOP_FT + 100) nf.again = true;
  if (nf.again && s.aglFt > BAND_TOP_FT) {
    nf.again = false; nf.below500 = false; nf.outS = 0; nf.slowOut = nf.fastOut = false; nf.minKts = Infinity; nf.maxKts = 0; nf.floatS = 0;
  }
  if (nf.stopped) return nf;
  if (nf.tdM === null) {
    if (s.onGround) { nf.tdM = s.alongM; nf.tdT = nf.t; nf.tdKts = s.iasKts; nf.tdGsKts = s.gsKts; return nf; }
    // The float: over the runway, the wheels under 10 ft (the coach's "long float" line).
    nf.floatS = s.alongM > 0 && s.aglFt < 10 ? nf.floatS + dt : 0;
    if (s.aglFt > BAND_TOP_FT) return nf;
    nf.below500 = true;
    if (s.aglFt < BAND_FLOOR_FT || s.vsFpm > 0) return nf; // the descent only: a climb away is not the approach
    const gust = s.wx?.gustKts > s.wx?.windKts ? (s.wx.gustKts - s.wx.windKts) / 2 : 0;
    if (s.iasKts < nf.minKts) nf.minKts = s.iasKts;
    if (s.iasKts > nf.maxKts) nf.maxKts = s.iasKts;
    const slow = s.iasKts < APPROACH_KTS - BAND_LOW_KTS, fast = s.iasKts > APPROACH_KTS + BAND_HIGH_KTS + gust;
    nf.outS = slow || fast ? nf.outS + dt : 0;
    if (nf.outS >= BAND_S) { if (slow) nf.slowOut = true; else nf.fastOut = true; }
    return nf;
  }
  const lda = nf.end.lengthM - nf.end.displacedM;
  const exited = s.onGround && (s.alongM > lda || Math.abs(s.crossM) > nf.end.widthM / 2);
  if (exited || s.gsKts < STOP_KTS || nf.t - nf.tdT > GRADE_AFTER_S) {
    nf.stopped = true; nf.off = exited && s.gsKts > EXIT_KTS; nf.stopM = s.alongM;
  }
  return nf;
}

// The coach's key (through coach.js s.ds, before the landing coach's own), or null for the landing coach's (main.js gives
// it the lesson's 70 KIAS as the target and no flaps to ask for). s: main.js coachInput (aglFt, kid, iasKts).
export function noFlapPrompt(nf, s) {
  if (nf.readyT === null || nf.tdM !== null) return null;
  if (s.kid) return nf.t - nf.readyT < SAY_S ? 'nfKid' : null;
  if (nf.floatS > 2) return 'nfFloat';
  if (s.aglFt < 30) return null; // the landing coach's idle and flare
  if (s.aglFt < BAND_TOP_FT && s.aglFt > BAND_FLOOR_FT && s.iasKts < APPROACH_KTS - BAND_LOW_KTS) return 'nfSlow';
  return nf.t - nf.readyT < SAY_S ? 'nfBrief' : null;
}

// The roll a flaps-30 landing would have from the same final with the same braking: the touchdown at the same margin
// over the flaps-30 stall as this one's over the flaps-up stall (the ground speed less the indicated difference), the
// roll scaled by the ground speed squared (a constant deceleration). ft; pure. tests/flight/noFlap.test.js flies both.
export function flaps30RollFt(rollFt, tdKts, tdGsKts) {
  const refGs = Math.max(1, tdGsKts - tdKts * (1 - STALL_30_KTS / STALL_UP_KTS));
  return rollFt * (refGs / Math.max(1, tdGsKts)) ** 2;
}

const fmt = (ftv) => Math.round(ftv).toLocaleString('en-US');
export const DONE_NOTE = 'No flaps: held 70, let it float, landed in the zone.';

// The landing's grade (landing.js gradeLanding, after any bounce cap) with the lesson's rules, once the airplane has
// stopped (nf.stopped). The touchdown zone is rescored on the widened zone and the speed against the flaps-up stall;
// the roll is shown beside the flaps-30 roll (not scored). Caps: off the runway's end or side rolling D; under the band
// (not on Kid, whose autothrottle flies it) C, "too slow for no flaps"; over it B. A crash stays a crash, a D stays a D. Pure.
export function noFlapResult(result, nf, kid = false) {
  if (result.grade === 'CRASH' || nf.tdM === null) return result;
  const rollFt = Math.max(0, (nf.stopM - nf.tdM) * M_TO_FT);
  const refFt = flaps30RollFt(rollFt, nf.tdKts, nf.tdGsKts);
  const zone = {
    key: 'zone', label: 'Touchdown zone',
    value: nf.tdM < 0 ? `${fmt(-nf.tdM * M_TO_FT)} ft short` : `${fmt(nf.tdM * M_TO_FT)} ft past threshold (float allowed)`,
    score: Math.round(nf.tdM < 0 ? 0 : curve(nf.tdM, ZONE_PTS)),
  };
  const speed = { key: 'speed', label: 'Touchdown speed', value: `${Math.round(nf.tdKts)} kt (flaps-up stall ${STALL_UP_KTS})`, score: Math.round(curve(nf.tdKts, TD_PTS)) };
  const pct = refFt > 0 ? Math.round((rollFt / refFt - 1) * 100) : 0;
  const roll = { key: 'roll', label: 'Landing roll', value: `${fmt(rollFt)} ft (flaps 30 ≈ ${fmt(refFt)}${pct > 0 ? `, +${pct}%` : ''})`, score: 100 };
  const old = (k) => result.factors.find((f) => f.key === k)?.score ?? 0;
  let score = Math.round(result.score + (zone.score - old('zone')) * ZONE_W + (speed.score - old('speed')) * SPEED_W);
  const keepD = result.grade === 'D' && result.reason;
  const caps = [];
  const d = nf.off && !keepD ? 'Ran off the runway before stopping.' : null;
  if (result.bounces) caps.push([null, result.bounces > 1 ? 54 : CAP_C]); // landing.js capBounced's cap survives the rescore
  if (!kid && nf.slowOut) caps.push([`Too slow for no flaps: under ${APPROACH_KTS - BAND_LOW_KTS} kt below 500 ft (${Math.round(nf.minKts)}). Without flaps the wing needs 65-75 (the handbook's): best grade C.`, CAP_C]);
  else if (!kid && nf.fastOut) caps.push([`Over ${APPROACH_KTS + BAND_HIGH_KTS} kt below 500 ft (${Math.round(nf.maxKts)}): a longer float. Best grade B.`, CAP_B]);
  for (const [, cap] of caps) score = Math.min(score, cap);
  const reasons = [d, ...caps.map(([t]) => t), result.reason].filter(Boolean);
  const factors = [zone, roll, speed, ...result.factors.filter((f) => f.key !== 'zone' && f.key !== 'speed')];
  return {
    ...result,
    factors,
    score,
    grade: keepD || d ? 'D' : letterGrade(score),
    reason: reasons.join(' ') || null,
    noFlap: true, // results.js: the note shows beside the gate's verdict
    note: reasons.length ? result.note ?? null : DONE_NOTE,
    rollFt, refFt,
    zoneM: [ZONE_PTS[1][0], ZONE_PTS[2][0]], // the card's runway strip shades these full marks (touchdownStrip.js)
    tip: noFlapTip(nf, factors, kid, keepD || d),
  };
}

// The card's "Next time" line (landingTip.js hands this lesson's over).
export function noFlapTip(nf, factors, kid, isD) {
  if (nf.off) return 'Brakes on once the nose wheel is down, and steer with the pedals: no flaps means a longer roll.';
  if (isD) return null; // short of or beside the runway: the reason says it
  if (!kid && nf.slowOut) return 'Hold 70 knots without flaps (65-75): the flaps-30 speeds leave the nose high and the wing near the stall.';
  if (!kid && nf.fastOut) return 'Ease the power back to hold 70 knots: every extra knot is more float.';
  const rate = factors.find((f) => f.key === 'rate');
  if (rate && rate.score < 100) return `Touched down at ${rate.value}: let it float and settle, don't push it down.`;
  return null;
}

// The ?debug snapshot (main.js): the state with the runway's id.
export const debugSnap = (nf) => ({ ...nf, end: nf.end.id });
