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
// Leaving the runway slower than this (kt) is an exit, not a run-off.
export const EXIT_KTS = 15;
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
// A variable wind (metar.js windDirDeg null) is none along the runway, as weather.js runwayWindComponents and the sim's air have it.
export const headwindKts = (wx, hdgT) => (wx?.windKts && wx.windDirDeg != null ? wx.windKts * Math.cos((wx.windDirDeg - hdgT) * Math.PI / 180) : 0);
// Fig. 5-11 note 2's tailwind factor (1 in a headwind: the line never tightens): +10% per 2 kt, held at 10 kt (the chart's end).
export const tailFactor = (headKts) => 1 + 0.1 * Math.min(10, Math.max(0, -headKts)) / 2;
// The float line: the first 1,000 ft, stretched in a tailwind by note 2 (it applies to the distance from 50 ft too), metres.
export const longM = (headKts) => LONG_M * tailFactor(headKts);

export const SF_TEXT = {
  sfBrief: 'Short field: full flaps, 61 knots on the PAPI, idle at the edge. Land before the big white blocks',
  sfTail: 'Tailwind today: you will float and roll further. Hold 61, idle at the edge, brake at once',
  sfKid: 'Short field: your plane lands it. Tap BRAKES the moment you touch down!',
  sfDone: 'Touchdown! Brakes on now (B)',
  sfDoneTouch: 'Touchdown! Tap BRAKES now',
  sfIdle: 'Over the fence: power to idle, nose down a touch to hold 61',
};
Object.assign(DRILL_TEXT, SF_TEXT);
// The idle call interrupts at once (the landing coach's idle is rank 4). The flaps prompt is the landing coach's: main.js
// gives it FULL_FLAPS (its words say 30°) and FLARE_FT (its "Flare now" at 50 ft came ~1.5 s after "Over the fence: nose
// down a touch", the fence being ~47 ft up here; the POH holds 61 with the nose until the flare). sfDone/sfDoneTouch
// replace the landing coach's "Touchdown! Hold the brakes" (the BRAKES button is a toggle, and here it is the lesson).
Object.assign(RANK, { sfIdle: 4 });

export const FLARE_FT = 20;
// A tailwind over this (kt, steady, along the runway) is said after the briefing: Fig. 5-11 note 2 adds 10% per 2 kt.
export const TAIL_SAY_KTS = 2;

// end: the lesson's runway end (airports.js runwayEnd). Allocates (a mission load, not a frame).
export const createShortField = (end) => ({
  end, t: 0, readyT: null, headKts: 0, again: false, brakesEarly: false,
  below500: false, flapsAt500: null, outS: 0, speedOut: false, minKts: Infinity, maxKts: 0,
  tdM: null, tdT: null, tdKts: null, brakeS: null, stopped: false, off: false, stopM: null,
});

// One frame, once the player is flying (main.js: cockpitEntered, no modal). s: { alongM (metres past the threshold
// along the centreline, - before it), crossM, aglFt, vsFpm, iasKts, flapsFull (30° set and there), onGround, gsKts, braking
// (pedals or the BRAKES button), wx (weather.js: the gust for the band) }. Mutates sf, allocates nothing.
export function shortFieldStep(sf, s, dt) {
  if (sf.readyT === null) { sf.readyT = sf.t; sf.headKts = headwindKts(s.wx, sf.end.hdgT); }
  sf.t += dt;
  // Airborne again past 50 ft after a touchdown (a go-around: main.js drops the landing) or after the graded stop
  // (KEEP ROLLING, take off, come round): the next landing is its own, and past 500 ft so is its approach.
  if (sf.tdM !== null && !s.onGround && s.aglFt > 50) {
    sf.tdM = sf.tdT = sf.tdKts = sf.brakeS = sf.stopM = null;
    sf.stopped = sf.off = false;
    sf.again = true;
  }
  // Climbing back past 500 ft (a go-around before any touchdown too: ACS S12 asks for it): the next approach is its own.
  if (sf.below500 && s.aglFt > BAND_TOP_FT + 100) sf.again = true;
  if (sf.again && s.aglFt > BAND_TOP_FT) {
    sf.again = false; sf.below500 = false; sf.flapsAt500 = null; sf.outS = 0; sf.speedOut = false; sf.minKts = Infinity; sf.maxKts = 0;
  }
  if (sf.stopped) return sf;
  if (sf.tdM === null) {
    if (s.onGround) {
      sf.tdM = s.alongM; sf.tdT = sf.t; sf.tdKts = s.iasKts; sf.brakesEarly = !!s.braking;
      return sf;
    }
    if (s.aglFt > BAND_TOP_FT) return sf;
    if (!sf.below500) { sf.below500 = true; sf.flapsAt500 = !!s.flapsFull; }
    if (s.aglFt < BAND_FLOOR_FT || s.vsFpm > 0) return sf; // the descent only: a climb away is not the approach
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
  // Off the runway's end or side still rolling fast is a run-off; a slow exit onto a taxiway is a stop.
  const off = s.onGround && (s.alongM > lda || Math.abs(s.crossM) > sf.end.widthM / 2) && s.gsKts > EXIT_KTS;
  const exited = s.onGround && (s.alongM > lda || Math.abs(s.crossM) > sf.end.widthM / 2);
  if (exited || s.gsKts < STOP_KTS || sf.t - sf.tdT > GRADE_AFTER_S) {
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
  if (sf.t - sf.readyT < SAY_S) return 'sfBrief';
  return sf.headKts < -TAIL_SAY_KTS && sf.t - sf.readyT < 2 * SAY_S ? 'sfTail' : null;
}

// Kid's autothrottle on the lesson: the POH's 61 KIAS once the flaps are full (0: Kid's own target until then), plus
// gustAddKts on a gusty day (assists.js kidGustAddKts: half the gust spread, ACS S7's "gust factor applied", 0195).
export const kidKts = (flapsFull, gustAddKts = 0) => (flapsFull ? APPROACH_KTS + gustAddKts : 0);
// Kid's guide (assists.js kidFinalGuide liftM): its flare floats the Cessna ~390 m in on the PAPI's path in calm air (past
// the 1,000 ft line), so Kid's path aims KID_LIFT_M lower, whatever the wind. Until 0199 it aimed 0.5 m higher per knot of
// headwind: that made up for the guide flying its 3° through the air, which in a headwind rode under the PAPI's path (to
// ~7 ft over the threshold in 25G38). The guide now flies the path over the ground (assists.js airGammaDeg), and Kid
// crosses the threshold 26-28 ft up and touches down ~115-230 m in from a 25 kt headwind to a 5 kt tailwind
// (tests/flight/kidFinal.test.js). Metres, < 0.
export const KID_LIFT_M = -6;
export const kidLiftM = () => KID_LIFT_M;

const ft = (m) => Math.round(Math.abs(m) * M_TO_FT);
// Touchdown point, metres past the threshold: full marks from 400 ft short of the POH's touchdown to the 1,000 ft line.
// In a tailwind every point stretches by note 2's factor (tailFactor), the float line with it (longM).
const zonePts = (k) => [[0, 70], [(POH_AIR_FT - 400) * FT_TO_M * k, 100], [LONG_M * k, 100], [1500 * FT_TO_M * k, 40], [3000 * FT_TO_M * k, 15]];
// Touchdown speed: the short field lands at "the minimum controllable airspeed" (AFH), near the flaps-30 stall. The
// game's airspeed has no position error (flightModel.js IAS = TAS·√σ, i.e. calibrated): POH Fig. 5-3's 40 KIAS is 48
// KCAS, aero.js stallSpeedKts(c172, 3) = 48 and the HUD's red band (tests/unit/shortField.test.js pins it). Full marks
// from the stall to ~1.15 of it; a fast touchdown floated or flew it on.
export const STALL_KTS = 48;
const TD_PTS = [[42, 40], [46, 90], [STALL_KTS, 100], [56, 100], [63, 70], [72, 40]];
// The roll against the POH's: full marks inside x 1.15 (the flight cards' band).
const ROLL_PTS = [[0, 100], [1.15, 100], [1.5, 60], [2.5, 20]];
export const DONE_NOTE = 'Short field: down in the first 1,000 ft, stopped inside the handbook\'s roll.';

// The landing's grade (landing.js gradeLanding, after any bounce cap) with the lesson's rules, once the airplane has
// stopped (sf.stopped). pohFt: pohRollFt for the field and today's air. The touchdown-zone factor is scored against
// the first 1,000 ft and the speed factor at the touchdown (the lesson's speed is near the stall); the roll and the brakes are
// shown, with caps: off the runway D; past the first 1,000 ft C; a roll over 1.5x the POH's C, over 1.15x B; outside
// the ACS speed band or short of full flaps at 500 ft B (not on Kid: its autothrottle and flaps fly those). A crash
// stays a crash, a D for the runway itself stays a D. Pure.
export function shortFieldResult(result, sf, pohFt, kid = false) {
  if (result.grade === 'CRASH' || sf.tdM === null) return result;
  const rollFt = Math.max(0, (sf.stopM - sf.tdM) * M_TO_FT);
  const k = tailFactor(sf.headKts), line = longM(sf.headKts), lineFt = Math.round(line * M_TO_FT).toLocaleString('en-US');
  const ZONE_PTS = zonePts(k);
  const zone = {
    key: 'zone', label: 'Touchdown point',
    value: sf.tdM < 0 ? `${ft(sf.tdM)} ft short` : `${ft(sf.tdM).toLocaleString('en-US')} ft: ${sf.tdM > line ? 'past' : 'inside'} ${lineFt}`,
    score: Math.round(sf.tdM < 0 ? 0 : curve(sf.tdM, ZONE_PTS)),
  };
  const speed = { key: 'speed', label: 'Touchdown speed', value: `${Math.round(sf.tdKts)} kt (stall ${STALL_KTS})`, score: Math.round(curve(sf.tdKts, TD_PTS)) };
  const roll = { key: 'roll', label: 'Landing roll', value: `${Math.round(rollFt).toLocaleString('en-US')} ft (handbook ${Math.round(pohFt).toLocaleString('en-US')})`, score: Math.round(curve(rollFt / pohFt, ROLL_PTS)) };
  // Brakes set before the wheels touched: the POH lands on rolling main wheels (half marks; Kid's coach asks for them at once).
  const brakes = { key: 'brakes', label: 'Brakes', value: sf.brakeS === null ? 'not used' : sf.brakesEarly ? 'on before touchdown' : `on ${sf.brakeS.toFixed(1)} s after touchdown`,
    score: sf.brakeS === null ? 0 : sf.brakesEarly && !kid ? 50 : Math.round(curve(sf.brakeS, [[0, 100], [2, 100], [5, 50], [10, 20]])) };
  const old = (k) => result.factors.find((f) => f.key === k)?.score ?? 0;
  let score = Math.round(result.score + (zone.score - old('zone')) * ZONE_W + (speed.score - old('speed')) * SPEED_W);
  const keepD = result.grade === 'D' && result.reason;
  const caps = [];
  let d = null;
  if (sf.off && !keepD) d = 'Ran off the runway before stopping.';
  if (sf.tdM > line) caps.push([`Floated past the first ${lineFt} ft${k > 1 ? ' (1,000 stretched for the tailwind, handbook note 2)' : ''}: best grade C.`, CAP_C]);
  // A bounce keeps landing.js capBounced's cap through the lesson's rescore (one C, two or more D).
  if (result.bounces) caps.push([null, result.bounces > 1 ? 54 : CAP_C]);
  // The roll's cause: brakes late or never, else a fast touchdown (the brakes are on/off: none "harder").
  const lateBrakes = sf.brakeS === null || sf.brakeS > 2;
  const rollWhy = lateBrakes ? 'brakes on right after touchdown' : `touch down slower (${Math.round(sf.tdKts)} kt; just above the stall is short)`;
  const x = (rollFt / pohFt).toFixed(1), hb = Math.round(pohFt).toLocaleString('en-US');
  if (rollFt > pohFt * 1.5) caps.push([`Rolled ${x}x the handbook's ${hb} ft: ${rollWhy}. Best grade C.`, CAP_C]);
  else if (rollFt > pohFt * 1.15) caps.push([`Rolled ${x}x the handbook's ${hb} ft: ${rollWhy}. Best grade B.`, CAP_B]);
  if (!kid && sf.speedOut) caps.push([`Approach speed left ${APPROACH_KTS - BAND_LOW_KTS}-${APPROACH_KTS + BAND_HIGH_KTS} kt below 500 ft (61, the pilot test's +10/-5; more in gusts): best grade B.`, CAP_B]);
  if (!kid && sf.flapsAt500 === false) caps.push(['Flaps not at 30° by 500 ft: best grade B.', CAP_B]);
  for (const [, cap] of caps) score = Math.min(score, cap);
  const reasons = [d, ...caps.map(([t]) => t), result.reason].filter(Boolean); // the bounce's words are result.reason's
  // The lesson's rows first (a phone held sideways scrolls the card's middle: these are what it teaches).
  const factors = [zone, roll, brakes, speed, ...result.factors.filter((f) => f.key !== 'zone' && f.key !== 'speed')];
  return {
    ...result,
    factors,
    score,
    grade: keepD || d ? 'D' : letterGrade(score),
    reason: reasons.join(' ') || null,
    shortField: true, // results.js: the note shows beside the gate's verdict
    note: reasons.length ? result.note ?? null : DONE_NOTE,
    rollFt, pohFt,
    zoneM: [ZONE_PTS[1][0], line], // the card's runway strip shades these full marks (touchdownStrip.js)
    tip: shortFieldTip(sf, factors, rollFt, pohFt, kid, keepD || d),
  };
}

// The card's "Next time" line (landingTip.js hands this lesson's over): the lesson's own fix, in its order: off the
// runway, a float, the brakes, a long roll from a fast touchdown, the approach (speed band, flaps), the touchdown rate.
const RATE_OK = 240;
export function shortFieldTip(sf, factors, rollFt, pohFt, kid, isD) {
  const fpm = factors.find((f) => f.key === 'rate');
  if (sf.off) return 'Brakes on the moment you touch down, and steer with the pedals: stop on the runway.';
  if (isD) return null; // short of or beside the runway: the reason says it
  if (sf.tdM > longM(sf.headKts)) return `Touched down ${ft(sf.tdM).toLocaleString('en-US')} ft in: idle at the runway's edge, hold 61 and don't hold it off; land before the big white blocks.`;
  if (sf.brakeS === null || sf.brakeS > 2) return kid ? 'Tap BRAKES the moment the wheels touch.' : `Brakes ${sf.brakeS === null ? 'never came on' : `came on ${sf.brakeS.toFixed(1)} s after touchdown`}: B (or BRAKES) the moment the wheels touch.`;
  if (rollFt > pohFt * 1.15) return `Touched down at ${Math.round(sf.tdKts)} kt: hold 61 to the flare and let it settle near 45 for a short roll.`;
  if (kid) return null;
  if (sf.speedOut) return 'Hold 61 knots from 500 ft to the fence: power for the path, nose for the speed.';
  if (sf.flapsAt500 === false) return 'Full flaps (30°) before 500 ft: three presses of F, or tap FLAPS.';
  if (fpm && fpm.score < 100) return `Touched down at ${fpm.value}: flare a touch earlier (under ${RATE_OK} fpm is smooth).`;
  return null;
}
