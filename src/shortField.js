// Short-field landing lesson (ticket 0181): the Cessna on a 3 NM final to Addison 16, flown the POH's way and
// graded against its numbers. Sources, read 2026-11-14:
//  - Cessna 172S POH (July 1998) Section 4, SHORT FIELD LANDING checklist: "Airspeed 65-75 KIAS (flaps UP). Wing
//    Flaps FULL DOWN (30°). Airspeed 61 KIAS (until flare). Power REDUCE to idle after clearing obstacle.
//    Touchdown MAIN WHEELS FIRST. Brakes APPLY HEAVILY." Section 5, Fig. 5-11 (p. 5-23): the ground roll at
//    2550 lb, flaps 30°, power off, maximum braking, paved level dry runway, zero wind, 61 KIAS at 50 ft, by
//    pressure altitude and temperature (ROLL_FT below); note 2, the wind correction (pohRollFt).
//  - FAA Airplane Flying Handbook (FAA-H-8083-3C) ch. 9, "Short-Field Approach and Landing": an accuracy approach
//    to an aiming point, full flaps once the field is made, "little or no floating during the round out", maximum
//    braking once the nose wheel is down.
//  - FAA-S-ACS-6C (Private Pilot Airplane ACS, Nov 2023) Area IV Task F: S7 the published approach speed +10/-5
//    knots with the gust factor applied; S10 "touch down ... within 200 feet beyond or on the specified point".
//
// The lesson flies the PAPI's 3° path (airports.js AIM_POINT_M): it crosses the threshold with the wheels ~47 ft up,
// the POH's 50 ft obstacle, so idling there and touching down is Fig. 5-11's own case (its total minus its roll, ~760
// ft, from the obstacle to the touchdown). Not a path to the numbers (the ticket's first idea): the game paints none, and
// a 3° path to 200 ft in crossed with the wheels 2 ft up (flown, tests/flight/shortField.test.js). The ticket's game
// tolerances, looser than the ACS's 200 ft: full marks from 400 ft short of the POH's ~760 ft touchdown to the 1,000 ft
// line, a float past the first 1,000 ft capped at C, a roll within the POH's x 1.15 (the flight cards' band). A lazy
// chunk, loaded with the mission (main.js startDrills). Pure (no THREE, no DOM): tests/unit/shortField.test.js,
// tests/flight/shortField.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK } from './coach.js';
// Only symbols main.js already imports: a lazy chunk importing one it doesn't grows the boot chunk's exports.
import { M_TO_FT, FT_TO_M } from './constants.js';

export const SHORT_FIELD_KEY = 'kads_16_short_field';
// POH Section 4: 61 KIAS with flaps 30 until the flare.
export const APPROACH_KTS = 61;
// POH Section 4: "Wing Flaps FULL DOWN (30°)", the C172's fourth notch (aircraft.js flapDetentsDeg [0, 10, 20, 30]); the
// game's landing flaps for it are 20° (aero.js landingFlaps), so the lesson asks for, checks and gives Kid this one.
export const FULL_FLAPS = 3;
// ACS S7: +10/-5 knots (the upper bound plus half the METAR's gust spread, AFH ch. 9: "no more than one-half the gust factor").
export const BAND_LOW_KTS = 5;
export const BAND_HIGH_KTS = 10;
// The stabilized gate's "Vref" on the lesson (aero.js stabilizedGate calls SLOW under it): the band's lower edge, so
// the POH's 61 KIAS (under the game's 62 KIAS Vref) is not "unstabilized".
export const GATE_VREF = APPROACH_KTS - BAND_LOW_KTS;
// The band is checked from 500 ft (full flaps by then, the ticket) down to 50 ft (the obstacle, where the POH idles).
export const BAND_TOP_FT = 500;
export const BAND_FLOOR_FT = 50;
// Outside the band this long in one go counts (a gust's spike is not the pilot's).
export const BAND_S = 2;
// POH Fig. 5-11 at sea level ISA: 1,335 ft from a 50 ft obstacle to a stop, 575 of them on the ground: ~760 in the air.
export const POH_AIR_FT = 1335 - 575;
// Full marks from 400 ft short of that touchdown to the 1,000 ft line (the ticket); past it is a float: best grade C.
export const LONG_M = 1000 * FT_TO_M;
// Over the fence: the POH's "REDUCE to idle after clearing obstacle", said from this far before the threshold.
export const FENCE_M = 60;
// Stopped: under the landing coach's "stopped" speed. Graded anyway this long after the touchdown.
export const STOP_KTS = 3;
export const GRADE_AFTER_S = 60;
// Caps: one bounce's C (landing.js capBounced) and a B.
export const CAP_C = 69;
export const CAP_B = 84;
// The opening words are held this long.
export const SAY_S = 8;
// landing.js's weights (WEIGHTS.zone, WEIGHTS.speed), inlined: the lesson rescores those two factors.
const ZONE_W = 0.2, SPEED_W = 0.1;

// POH Fig. 5-11 ground roll, ft: rows by pressure altitude 0-8,000 ft (every 1,000), columns 0/10/20/30/40 °C.
export const ROLL_FT = [
  [545, 565, 585, 605, 625], [565, 585, 605, 625, 650], [585, 610, 630, 650, 670],
  [610, 630, 655, 675, 695], [630, 655, 675, 700, 725], [655, 680, 705, 725, 750],
  [680, 705, 730, 755, 780], [705, 730, 760, 785, 810], [735, 760, 790, 815, 840],
];

// The POH's ground roll for a field (elevFt), the altimeter setting, the outside air (°C) and the steady wind along
// the runway (headKts, + = headwind): Fig. 5-11 interpolated (clamped to the table), then note 2: "Decrease
// distances 10% for each 9 knots headwind. For operation with tail winds up to 10 knots, increase distances by 10%
// for each 2 knots" (a tailwind past 10 kt is off the chart: held at 10). Pure.
export function pohRollFt(elevFt, altimInHg = 29.92, tempC = 15, headKts = 0) {
  const pa = Math.max(0, Math.min(8000, elevFt + (29.92 - altimInHg) * 1000)) / 1000;
  const tc = Math.max(0, Math.min(40, tempC)) / 10;
  const i = Math.min(7, Math.floor(pa)), j = Math.min(3, Math.floor(tc));
  const a = pa - i, b = tc - j;
  const row = (r) => ROLL_FT[r][j] + (ROLL_FT[r][j + 1] - ROLL_FT[r][j]) * b;
  const roll = row(i) + (row(i + 1) - row(i)) * a;
  return roll * (headKts >= 0 ? 1 - 0.1 * headKts / 9 : 1 + 0.1 * Math.min(10, -headKts) / 2);
}

// The METAR's steady wind along the runway (kt, + = headwind). wx: weather.js's windDirDeg (true), windKts.
export const headwindKts = (wx, hdgT) => (wx?.windKts ? wx.windKts * Math.cos((wx.windDirDeg - hdgT) * Math.PI / 180) : 0);

export const SF_TEXT = {
  sfBrief: 'Short field: full flaps, then 61 knots on the PAPI. Idle at the runway\'s edge',
  sfKid: 'Short field: your plane flies it. Brakes on the moment you land!',
  sfIdle: 'Over the fence: power to idle, nose down a touch to hold 61',
};
Object.assign(DRILL_TEXT, SF_TEXT);
// The idle call interrupts at once (the landing coach's idle is rank 4). The flaps prompt is the landing coach's: main.js
// gives it FULL_FLAPS (its words say 30°).
Object.assign(RANK, { sfIdle: 4 });

// end: the lesson's runway end (airports.js runwayEnd). Allocates (a mission load, not a frame).
export const createShortField = (end) => ({
  end, t: 0, readyT: null,
  below500: false, flapsAt500: null, outS: 0, speedOut: false, minKts: Infinity, maxKts: 0,
  tdM: null, tdT: null, tdKts: null, brakeS: null, stopped: false, off: false, stopM: null,
});

// One frame, once the player is flying (main.js: cockpitEntered, no modal). s: { alongM (metres past the threshold
// along the centreline, - before it), crossM, aglFt, iasKts, flapsFull (30° set and there), onGround, gsKts, braking
// (pedals or the BRAKES button), wx (weather.js: the gust for the band) }. Mutates sf, allocates nothing.
export function shortFieldStep(sf, s, dt) {
  if (sf.readyT === null) sf.readyT = sf.t;
  sf.t += dt;
  if (sf.stopped) return sf;
  if (sf.tdM !== null && !s.onGround && s.aglFt > 50) { // a go-around (main.js drops the landing): fly it again
    sf.tdM = sf.tdT = sf.tdKts = sf.brakeS = null;
  }
  if (sf.tdM === null) {
    if (s.onGround) {
      sf.tdM = s.alongM; sf.tdT = sf.t; sf.tdKts = s.iasKts;
      return sf;
    }
    if (s.aglFt > BAND_TOP_FT) return sf;
    if (!sf.below500) { sf.below500 = true; sf.flapsAt500 = !!s.flapsFull; }
    if (s.aglFt < BAND_FLOOR_FT) return sf;
    const gust = s.wx?.gustKts > s.wx?.windKts ? (s.wx.gustKts - s.wx.windKts) / 2 : 0;
    if (s.iasKts < sf.minKts) sf.minKts = s.iasKts;
    if (s.iasKts > sf.maxKts) sf.maxKts = s.iasKts;
    const out = s.iasKts < APPROACH_KTS - BAND_LOW_KTS || s.iasKts > APPROACH_KTS + BAND_HIGH_KTS + gust;
    sf.outS = out ? sf.outS + dt : 0;
    if (sf.outS >= BAND_S) sf.speedOut = true;
    return sf;
  }
  if (s.braking && sf.brakeS === null) sf.brakeS = sf.t - sf.tdT;
  const lda = sf.end.lengthM - sf.end.displacedM;
  const off = s.onGround && (s.alongM > lda || Math.abs(s.crossM) > sf.end.widthM / 2);
  if (off || s.gsKts < STOP_KTS || sf.t - sf.tdT > GRADE_AFTER_S) {
    sf.stopped = true; sf.off = off; sf.stopM = s.alongM;
  }
  return sf;
}

// The coach's key (through coach.js s.ds, which comes before the landing coach's own), or null for the landing
// coach's: its flaps, sink, speed (main.js gives it the POH's 61 KIAS as the target, so its slow and fast are the ACS
// band's -5/+10), centreline and PAPI, then the flare and the rollout's brakes. s: main.js coachInput (aglFt, kid,
// throttle); ap: sim.approach (distM, metres to the threshold). The lesson's own: its briefing, and idle over the fence.
export function shortFieldPrompt(sf, s, ap) {
  if (sf.readyT === null || sf.tdM !== null) return null;
  if (s.kid) return sf.t - sf.readyT < SAY_S ? 'sfKid' : null;
  if (s.aglFt < 30) return null; // the landing coach's idle and flare
  if (ap.distM < FENCE_M && s.aglFt < 120 && s.throttle > 0.05) return 'sfIdle';
  return sf.t - sf.readyT < SAY_S ? 'sfBrief' : null;
}

// Kid's autothrottle on the lesson: the POH's 61 KIAS once the flaps are full (0: Kid's own target until then).
export const kidKts = (flapsFull) => (flapsFull ? APPROACH_KTS : 0);
// Kid's guide (assists.js kidFinalGuide liftM): its flare floats the Cessna ~390 m in on the PAPI's path in calm air (past
// the 1,000 ft line, ~480 m in a 5 kt tailwind), so Kid's path aims KID_LIFT_M lower, less KID_HEAD_M per knot of the
// METAR's headwind (a headwind already lands it short; none lower past 12 kt). Kid crosses the threshold ~27 ft up and
// touches down ~220 m in from a 10 kt headwind to a 5 kt tailwind (tests/flight/kidFinal.test.js). Metres, <= 0.
export const KID_LIFT_M = -6;
export const KID_HEAD_M = 0.5;
export const kidLiftM = (wx, hdgT) => Math.min(0, KID_LIFT_M + KID_HEAD_M * headwindKts(wx, hdgT));

const ft = (m) => Math.round(Math.abs(m) * M_TO_FT);
// Touchdown point, metres past the threshold: full marks from 400 ft short of the POH's touchdown to the 1,000 ft line.
const ZONE_PTS = [[0, 70], [(POH_AIR_FT - 400) * FT_TO_M, 100], [LONG_M, 100], [1500 * FT_TO_M, 40], [3000 * FT_TO_M, 15]];
// Touchdown speed: the short field lands at "the minimum controllable airspeed" (AFH), ~ the flaps-30 stall
// (POH Fig. 5-3: 40 KIAS) to ~1.3 of it; a fast touchdown floated or flew it on.
const TD_PTS = [[35, 70], [40, 100], [52, 100], [61, 70], [70, 40]];
// The roll against the POH's: full marks inside x 1.15 (the flight cards' band).
const ROLL_PTS = [[0, 100], [1.15, 100], [1.5, 60], [2.5, 20]];
export const DONE_NOTE = 'Short field: down in the first 1,000 ft, stopped inside the POH\'s roll.';

// The landing's grade (landing.js gradeLanding, after any bounce cap) with the lesson's rules, once the airplane has
// stopped (sf.stopped). pohFt: pohRollFt for the field and today's air. The touchdown-zone factor is scored against
// the first 1,000 ft and the speed factor at the touchdown (the lesson's speed is near the stall); the roll and the brakes are
// shown, with caps: off the runway D; past the first 1,000 ft C; a roll over 1.5x the POH's C, over 1.15x B; outside
// the ACS speed band or short of full flaps at 500 ft B (not on Kid: its autothrottle and flaps fly those). A crash
// stays a crash, a D for the runway itself stays a D. Pure.
export function shortFieldResult(result, sf, pohFt, kid = false) {
  if (result.grade === 'CRASH' || sf.tdM === null) return result;
  const rollFt = Math.max(0, (sf.stopM - sf.tdM) * M_TO_FT);
  const zone = {
    key: 'zone', label: 'Touchdown point',
    value: sf.tdM < 0 ? `${ft(sf.tdM)} ft short` : `${ft(sf.tdM).toLocaleString('en-US')} ft in, ${sf.tdM > LONG_M ? 'past' : 'inside'} the first 1,000`,
    score: Math.round(sf.tdM < 0 ? 0 : curve(sf.tdM, ZONE_PTS)),
  };
  const speed = { key: 'speed', label: 'Touchdown speed', value: `${Math.round(sf.tdKts)} kt (stall 40)`, score: Math.round(curve(sf.tdKts, TD_PTS)) };
  const roll = { key: 'roll', label: 'Landing roll', value: `${Math.round(rollFt)} ft (POH ${Math.round(pohFt)})`, score: Math.round(curve(rollFt / pohFt, ROLL_PTS)) };
  const brakes = { key: 'brakes', label: 'Brakes', value: sf.brakeS === null ? 'not used' : `on ${sf.brakeS.toFixed(1)} s after touchdown`,
    score: sf.brakeS === null ? 0 : Math.round(curve(sf.brakeS, [[0, 100], [2, 100], [5, 50], [10, 20]])) };
  const old = (k) => result.factors.find((f) => f.key === k)?.score ?? 0;
  let score = Math.round(result.score + (zone.score - old('zone')) * ZONE_W + (speed.score - old('speed')) * SPEED_W);
  const keepD = result.grade === 'D' && result.reason;
  const caps = [];
  let d = null;
  if (sf.off && !keepD) d = 'Ran off the runway before stopping.';
  if (sf.tdM > LONG_M) caps.push(['Floated past the first 1,000 ft: best grade C.', CAP_C]);
  if (rollFt > pohFt * 1.5) caps.push([`Rolled ${(rollFt / pohFt).toFixed(1)}x the POH's ${Math.round(pohFt)} ft: brakes on right after touchdown. Best grade C.`, CAP_C]);
  else if (rollFt > pohFt * 1.15) caps.push([`Rolled ${(rollFt / pohFt).toFixed(1)}x the POH's ${Math.round(pohFt)} ft: brake harder, sooner. Best grade B.`, CAP_B]);
  if (!kid && sf.speedOut) caps.push([`Approach speed left ${APPROACH_KTS - BAND_LOW_KTS}-${APPROACH_KTS + BAND_HIGH_KTS} kt below 500 ft (61, the pilot test's +10/-5): best grade B.`, CAP_B]);
  if (!kid && sf.flapsAt500 === false) caps.push(['Flaps not at 30° by 500 ft: best grade B.', CAP_B]);
  for (const [, cap] of caps) score = Math.min(score, cap);
  const reasons = [d, ...caps.map(([t]) => t), result.reason].filter(Boolean);
  return {
    ...result,
    factors: [...result.factors.map((f) => (f.key === 'zone' ? zone : f.key === 'speed' ? speed : f)), roll, brakes],
    score,
    grade: keepD || d ? 'D' : letterGrade(score),
    reason: reasons.join(' ') || null,
    shortField: true, // results.js: the note shows beside the gate's verdict
    note: reasons.length ? result.note ?? null : DONE_NOTE,
    rollFt, pohFt,
  };
}
