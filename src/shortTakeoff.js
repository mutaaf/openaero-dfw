// Short-field takeoff lesson (ticket 0225): the Cessna on Addison 16, flown the POH's way and graded against its own
// table for the day's air. Sources, read 2026-11-26 (the 172S POH, July 8/98, Revision 4, the befa.org copy the c172 cards
// cite, https://www.befa.org/wp-content/uploads/2019/12/POH-Cessna-172S.pdf, `pdftotext -layout`):
//  - Section 4, SHORT FIELD TAKEOFF checklist (p. 4-16): "1. Wing Flaps -- 10°. 2. Brakes -- APPLY. 3. Throttle -- FULL
//    OPEN. ... 5. Brakes -- RELEASE. 6. Elevator Control -- SLIGHTLY TAIL LOW. 7. Climb Speed -- 56 KIAS (until all
//    obstacles are cleared). 8. Wing Flaps -- RETRACT slowly after reaching 60 KIAS."
//  - Section 4, AIRSPEEDS FOR NORMAL OPERATION (p. 4-3): "Short Field Takeoff, Flaps 10°, Speed at 50 Feet 56 KIAS";
//    "Best Rate-of-Climb, Sea Level 74 KIAS". WING FLAP SETTINGS (p. 4-25): "On a short field, 10° wing flaps and an
//    obstacle clearance speed of 56 KIAS should be used."
//  - Section 5, Fig. 5-5 sheet 1 (p. 5-14), SHORT FIELD TAKEOFF DISTANCE AT 2550 POUNDS: flaps 10°, full throttle prior
//    to brake release, paved level dry runway, zero wind, "Lift Off: 51 KIAS, Speed at 50 Ft: 56 KIAS"; the ground roll
//    and the total to clear a 50 ft obstacle by pressure altitude and °C (TABLE below); note 3, the wind correction.
//  - FAA-S-ACS-6C (Private Pilot ACS) Area IV Task E, Short-Field Takeoff and Maximum Performance Climb: lift off at the
//    recommended airspeed, climb at the obstacle clearance airspeed to the obstacle (or 50 ft), then Vy; the speed
//    +10/-5 knots. The lesson's bands are tighter (the speed at 50 ft within -3/+4 kt for full marks).
//  - FAA Airplane Flying Handbook (FAA-H-8083-3C) ch. 6, Short-Field Takeoff and Maximum Performance Climb (pp. 6-10 to
//    6-12): "The airplane is allowed to roll with its full weight on the main wheels and accelerate to the lift-off speed
//    ... In nose-wheel type airplanes, this involves little use of the elevator control"; among the common errors,
//    "Premature lift-off resulting in high drag". The game's Cessna does not pay much distance for a nose raised early
//    (tests/flight/shortTakeoff.test.js prints it), so that is graded as the technique (ROTATE_KTS), not as a distance.
// The obstacle is virtual (no mesh): the distance from the brake release to the wheels 50 ft up, against the table's
// total for today's pressure altitude, temperature and headwind. Over x 1.15 (the flight cards' band) caps B. Pure (no
// THREE, no DOM): tests/unit/shortTakeoff.test.js, flown headless in tests/flight/shortTakeoff.test.js. A lazy chunk
// (main.js startDrills).
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, TOUCH_WORDS, RANK } from './coach.js';
// Only symbols main.js already imports: a lazy chunk importing one it doesn't grows the boot chunk's exports.
import { M_TO_FT } from './constants.js';

export const SHORT_TAKEOFF_KEY = 'kads_16_short_field_takeoff';
// POH: 10° (the C172's first notch, aircraft.js flapDetentsDeg [0, 10, 20, 30]).
export const FLAPS = 1;
// Fig. 5-5's speeds and Vy (Section 4).
export const LIFTOFF_KTS = 51;
export const OBSTACLE_KTS = 56;
export const VY_KTS = 74;
// The coach's rotation: the POH says only "slightly tail low". Back from ROTATE_KTS to about PITCH_DEG (the tail at 13.7°,
// takeoffCoach.js STATIC_TAIL_DEG; the ease call above PITCH_HIGH_DEG): the c172 cards' short-field rotation (harness.js
// shortFieldTakeoff, 45 KIAS to 11°). Flown in tests/flight/shortTakeoff.test.js: the game's Cessna lifts off 2-3 kt over
// Fig. 5-5's 51 KIAS (its stall is a little above the POH's; the lift-off row's full marks are within 4 kt).
export const ROTATE_KTS = 45;
export const PITCH_DEG = 11;
export const PITCH_HIGH_DEG = 12.5;
// The nose counts as raised from this attitude on the runway (the Cessna sits at about 0°); raised more than EARLY_KTS
// before ROTATE_KTS is the AFH's premature lift-off: capped B.
export const NOSE_UP_DEG = 3;
export const EARLY_KTS = 8;
// The obstacle, and the coach's "slow" and "fast" round its speed (the ACS's -5 and a +4 short of its +10: the lesson's).
export const OBSTACLE_FT = 50;
export const SLOW_KTS = OBSTACLE_KTS - 3;
export const FAST_KTS = OBSTACLE_KTS + 4;
// The speed below 50 ft is watched from here (just off, the Cessna is still accelerating from 51 to 56).
export const WATCH_FT = 20;
// Lifted off: the wheels this high (a hop over a bump is not a lift-off). Done: the wheels this high, climbing.
export const LIFT_FT = 1;
export const DONE_FT = 200;
// The brakes count as released at full power from this throttle.
export const FULL_POWER = 0.95;
// Over this multiple of the table's total (or roll) is no longer a short-field performance: capped B.
export const POH_BAND = 1.15;
export const GIVE_UP_S = 150;
export const CAP_B = 84;
export const CAP_C = 69;
export const FAIL_CAP = 54;
const WEIGHTS = { roll: 0.15, obstacle: 0.3, liftoff: 0.15, rotate: 0.1, speed: 0.2, line: 0.1 };
const KID_WEIGHTS = { roll: 0.5, obstacle: 0.5 };

// POH Fig. 5-5 sheet 1 (p. 5-14), 2550 lb: [ground roll, total over 50 ft] in ft, rows by pressure altitude 0-8,000 ft
// (every 1,000), columns 0/10/20/30/40 °C.
export const TABLE = [
  [[860, 1465], [925, 1575], [995, 1690], [1070, 1810], [1150, 1945]],
  [[940, 1600], [1010, 1720], [1090, 1850], [1170, 1990], [1260, 2135]],
  [[1025, 1755], [1110, 1890], [1195, 2035], [1285, 2190], [1380, 2355]],
  [[1125, 1925], [1215, 2080], [1310, 2240], [1410, 2420], [1515, 2605]],
  [[1235, 2120], [1335, 2295], [1440, 2480], [1550, 2685], [1660, 2880]],
  [[1355, 2345], [1465, 2545], [1585, 2755], [1705, 2975], [1825, 3205]],
  [[1495, 2605], [1615, 2830], [1745, 3075], [1875, 3320], [2010, 3585]],
  [[1645, 2910], [1785, 3170], [1920, 3440], [2065, 3730], [2215, 4045]],
  [[1820, 3265], [1970, 3575], [2120, 3880], [2280, 4225], [2450, 4615]],
];

// The table's { rollFt, totalFt, headKts, offChart } for a field (elevFt), the altimeter setting, the outside air (°C) and the steady wind
// along the runway (headKts, + = headwind): interpolated (clamped to the table), then note 3: "Decrease distances 10% for
// each 9 knots headwind. For operation with tail winds up to 10 knots, increase distances by 10% for each 2 knots" (a
// tailwind past 10 kt is off the chart: held at 10). Pure.
export function pohTakeoff(elevFt, altimInHg = 29.92, tempC = 15, headKts = 0) {
  const pa = Math.max(0, Math.min(8000, elevFt + (29.92 - altimInHg) * 1000)) / 1000;
  const tc = Math.max(0, Math.min(40, tempC)) / 10;
  const i = Math.min(7, Math.floor(pa)), j = Math.min(3, Math.floor(tc));
  const a = pa - i, b = tc - j;
  const wind = headKts >= 0 ? 1 - 0.1 * headKts / 9 : 1 + 0.1 * Math.min(10, -headKts) / 2;
  const at = (k) => {
    const row = (r) => TABLE[r][j][k] + (TABLE[r][j + 1][k] - TABLE[r][j][k]) * b;
    return (row(i) + (row(i + 1) - row(i)) * a) * wind;
  };
  // offChart: a tailwind past the chart's 10 kt (the correction is held at 10; the lesson does not cap against it).
  return { rollFt: at(0), totalFt: at(1), headKts, offChart: headKts < -10 };
}
// The METAR's steady wind along the runway (kt, + = headwind); a variable wind (windDirDeg null) is none along it.
export const headwindKts = (wx, hdgT) => (wx?.windKts && wx.windDirDeg != null ? wx.windKts * Math.cos((wx.windDirDeg - hdgT) * Math.PI / 180) : 0);

export const STO_TEXT = {
  stoFlaps: 'Short field: flaps 10°. Press F until 10°',
  stoPower: 'Short field: the brakes are on. Hold Shift: full power first',
  stoRelease: 'Full power: let the brakes go (B)',
  stoRoll: `Let it roll: ease back (↑) at ${ROTATE_KTS} knots`,
  stoRotate: `${ROTATE_KTS} knots: ease back (↑), nose about ${PITCH_DEG}° up`,
  stoHold: `Hold the nose about ${PITCH_DEG}°: let it fly off by itself`,
  stoPowerRoll: 'Full power: hold Shift',
  stoEase: 'Ease the nose down a little: the tail is close',
  stoObstacle: `Flying! Hold ${OBSTACLE_KTS} knots until 50 ft up`,
  stoSlow: `Slow: nose down a touch for ${OBSTACLE_KTS} knots`,
  stoFast: `Fast: nose up a touch for ${OBSTACLE_KTS} knots`,
  stoClear: `Over the 50 ft obstacle: nose down a little, climb at ${VY_KTS}, then flaps up slowly`,
  stoKidPower: 'Hold Shift: power up to 100%. The brakes hold you',
  stoKidRoll: `Go! Hold ↑ gently at ${ROTATE_KTS} knots`,
  stoKidRotate: 'Hold ↑ gently: the nose comes up',
  stoKidEase: 'Not so high! Let the nose down a bit',
  stoKidClimb: 'Flying! Let go: the plane climbs by itself',
};
const STO_TOUCH = {
  stoFlaps: 'Short field: flaps 10°. Tap FLAPS until 10°',
  stoPower: 'Short field: the brakes are on. Slide the throttle to the top first',
  stoRelease: 'Full power: tap BRAKES to let them go',
  stoPowerRoll: 'Full power: throttle to the top',
  stoRoll: `Let it roll: stick up gently at ${ROTATE_KTS} knots`,
  stoRotate: `${ROTATE_KTS} knots: stick up gently, nose about ${PITCH_DEG}° up`,
  stoKidPower: 'Push the throttle to the top. The brakes hold you',
  stoKidRoll: `Go! Hold the stick up gently at ${ROTATE_KTS} knots`,
  stoKidRotate: 'Hold the stick up gently: the nose comes up',
};
Object.assign(DRILL_TEXT, STO_TEXT);
Object.assign(TOUCH_WORDS, STO_TOUCH);
Object.assign(RANK, {
  stoFlaps: 1, stoPower: 1, stoPowerRoll: 2, stoRoll: 1, stoHold: 1, stoObstacle: 1, stoClear: 1, stoKidPower: 1, stoKidRoll: 1, stoKidClimb: 1,
  stoRelease: 2, stoRotate: 2, stoSlow: 2, stoFast: 2, stoKidRotate: 2, stoEase: 4, stoKidEase: 4,
});

export const createShortTakeoff = (end) => ({
  end, phase: 'hold', t: 0, poh: null, startAlongM: null, releaseThrottle: null, flapsRelease: null,
  rolled: false, rotateKts: null, liftKts: null, rollM: null, flapsLift: null, obstM: null, obstKts: null, minKts: null, maxCrossM: 0,
  tail: false, settled: false, why: null,
});
export const shortTakeoffDone = (st) => st.phase === 'done';

// The roll starts: the brakes off (at whatever power: Fig. 5-5's distances start there), or the airplane moving anyway.
const released = (s) => !s.brakes || s.gsKts >= 2;
const finish = (st, why) => { st.why = why; st.phase = 'done'; return 'done'; };
// One step. s: { brakes, throttle, flapsIndex, onGround, wheelFt, iasKts, gsKts, alongM (along the runway from its
// threshold), leftM (runway ahead), crossM, halfWidthM, pitchDeg, tailOn, poh (pohTakeoff for today's air) }.
// Returns 'done' on the step the lesson ends (graded), else ''.
export function shortTakeoffStep(st, s, dt) {
  if (st.phase === 'done') return '';
  if (st.phase === 'hold') {
    if (!released(s)) return ''; // reading the coach and running the power up on the brakes is free
    // Rolling: the distances run from here, as Fig. 5-5's do from the brake release.
    st.phase = 'roll'; st.startAlongM = s.alongM; st.releaseThrottle = s.throttle; st.flapsRelease = s.flapsIndex; st.poh = s.poh;
  }
  st.t += dt;
  if (s.tailOn) st.tail = true;
  if (st.phase === 'roll') {
    if (s.iasKts > 15) st.rolled = true;
    if (st.rotateKts === null && s.onGround && s.pitchDeg >= NOSE_UP_DEG) st.rotateKts = s.iasKts;
    st.maxCrossM = Math.max(st.maxCrossM, Math.abs(s.crossM));
    // The lift-off: where the wheels left the runway (Fig. 5-5's roll), counted once they are LIFT_FT up (a hop that
    // settles back before then rolls on).
    if (s.onGround) st.liftKts = null;
    else if (st.liftKts === null) { st.liftKts = s.iasKts; st.rollM = s.alongM - st.startAlongM; st.flapsLift = s.flapsIndex; }
    if (!s.onGround && s.wheelFt > LIFT_FT) {
      st.phase = 'air';
    } else if (s.leftM < 0) return finish(st, 'overrun');
    else if (Math.abs(s.crossM) > s.halfWidthM + 3) return finish(st, 'off');
    else if (st.rolled && s.throttle < 0.5 && s.gsKts < 3) return finish(st, 'stopped');
    else if (st.t > GIVE_UP_S) return finish(st, 'stopped');
    return '';
  }
  if (s.onGround) {
    st.settled = true; // back on the runway after the lift-off: its checks go on
    if (s.leftM < 0) return finish(st, 'overrun');
    if (Math.abs(s.crossM) > s.halfWidthM + 3) return finish(st, 'off');
    if (s.gsKts < 3) return finish(st, 'stopped');
  }
  if (st.obstM === null) {
    if (s.wheelFt >= WATCH_FT) st.minKts = Math.min(st.minKts ?? Infinity, s.iasKts);
    if (s.wheelFt >= OBSTACLE_FT) { st.obstM = s.alongM - st.startAlongM; st.obstKts = s.iasKts; }
  }
  if (s.wheelFt >= DONE_FT) return finish(st, null);
  if (st.t > GIVE_UP_S) return finish(st, 'noclimb');
  return '';
}

// The coach. s: shortTakeoffStep's input plus kid.
export function shortTakeoffTarget(st, s) {
  if (st.phase === 'done') return null;
  if (st.phase === 'hold') {
    if (s.kid) return 'stoKidPower';
    if (s.flapsIndex !== FLAPS) return 'stoFlaps';
    return s.throttle < FULL_POWER ? 'stoPower' : 'stoRelease';
  }
  if (st.phase === 'roll' || s.onGround) {
    if (s.pitchDeg > PITCH_HIGH_DEG) return s.kid ? 'stoKidEase' : 'stoEase';
    if (s.throttle < FULL_POWER && s.iasKts < ROTATE_KTS) return 'stoPowerRoll';
    if (s.iasKts < ROTATE_KTS) return s.kid ? 'stoKidRoll' : 'stoRoll';
    if (s.kid) return 'stoKidRotate';
    return s.pitchDeg < PITCH_DEG - 2 ? 'stoRotate' : 'stoHold';
  }
  if (s.kid) return 'stoKidClimb';
  if (st.obstM !== null) return 'stoClear';
  if (s.wheelFt >= WATCH_FT / 2 && s.iasKts < SLOW_KTS) return 'stoSlow';
  return s.iasKts > FAST_KTS ? 'stoFast' : 'stoObstacle';
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const ratioScore = (r) => curve(r, [[1.05, 100], [POH_BAND, 80], [1.3, 45], [1.5, 0]]);
const REASONS = {
  overrun: `Ran out of runway: full power on the brakes, let them go, and ease back at ${ROTATE_KTS} knots.`,
  off: 'Ran off the side of the runway: keep it on the centreline with the rudder.',
  stopped: `Never got airborne: full power, the brakes off, then ease back at ${ROTATE_KTS} knots.`,
  noclimb: `Never climbed to ${DONE_FT} ft: hold ${OBSTACLE_KTS} knots to 50 ft, then climb at ${VY_KTS}.`,
  settled: `Settled back onto the runway: hold the nose about ${PITCH_DEG}° up and let it fly off by itself.`,
  tail: `The tail touched the runway: slightly tail low is about ${PITCH_DEG}°, not more.`,
  flaps: 'Flaps 10° is the handbook\'s short-field setting: it lifts off slower and sooner.',
  power: 'Full power on the brakes first, then let them go: the handbook\'s checklist and its table\'s condition.',
  roll: `A long roll: full power on the brakes, then ease back at ${ROTATE_KTS} knots to lift off near ${LIFTOFF_KTS}.`,
  obstacle: `Slow to 50 ft: lift off near ${LIFTOFF_KTS}, then hold ${OBSTACLE_KTS} knots, the handbook's obstacle clearance speed with flaps 10°.`,
  liftoff: `Lift off near ${LIFTOFF_KTS} knots: ease back at ${ROTATE_KTS}, slightly tail low (about ${PITCH_DEG}°).`,
  early: `Nose up too early: let it roll with its weight on the wheels (the least drag) to ${ROTATE_KTS} knots, then ease back.`,
  rotate: `Ease back at ${ROTATE_KTS} knots: before then the nose stays down, the least drag.`,
  slowLift: `Lifted off too slow: hauled off early, it climbs poorly. Ease back at ${ROTATE_KTS}, about ${PITCH_DEG}° up.`,
  speed: `Hold ${OBSTACLE_KTS} knots to 50 ft: faster climbs flatter, slower is close to the stall.`,
  line: 'Keep it on the centreline with the rudder through the roll.',
};

// The grade. kid: Kid's card is the roll and the obstacle (its climb and its line-up are the plane's).
export function gradeShortTakeoff(st, kid = false) {
  const poh = st.poh ?? pohTakeoff(st.end?.elevFt ?? 0);
  const wind = Math.round(Math.abs(poh.headKts));
  const windWords = !wind ? '' : poh.offChart ? `, a ${wind} kt tailwind (past the chart's 10 kt: counted as 10, so the handbook figure is short)`
    : `, a ${wind} kt ${poh.headKts > 0 ? 'headwind' : 'tailwind'} counted as its note 3 says`;
  const flew = st.liftKts !== null;
  const rollFt = flew ? st.rollM * M_TO_FT : null, obstFt = st.obstM === null ? null : st.obstM * M_TO_FT;
  const obstRatio = obstFt === null ? null : obstFt / poh.totalFt;
  // The speed at 50 ft: slow is near the stall (the ACS's -5 is its floor), fast climbs flatter (its +10); and no dip under
  // the lift-off speed on the way up from 20 ft.
  const dev = st.obstKts === null ? null : st.obstKts - OBSTACLE_KTS;
  const speedScore = dev === null ? 0
    : Math.min(dev >= 0 ? curve(dev, [[4, 100], [8, 60], [12, 0]]) : curve(-dev, [[3, 100], [5, 60], [8, 0]]),
      curve(LIFTOFF_KTS - (st.minKts ?? LIFTOFF_KTS), [[0, 100], [3, 60], [6, 0]]));
  const early = st.rotateKts === null ? 0 : ROTATE_KTS - st.rotateKts;
  const all = {
    roll: { key: 'roll', label: 'Ground roll', value: flew ? `${fmt(rollFt)} ft (handbook ${fmt(poh.rollFt)})` : 'never lifted off',
      score: flew ? ratioScore(rollFt / poh.rollFt) : 0 },
    obstacle: { key: 'obstacle', label: 'To 50 ft', value: obstFt === null ? 'never reached 50 ft' : `${fmt(obstFt)} ft (handbook ${fmt(poh.totalFt)})`,
      score: obstRatio === null ? 0 : ratioScore(obstRatio) },
    liftoff: { key: 'liftoff', label: 'Lift-off speed', value: flew ? `${Math.round(st.liftKts)} kt (handbook ${LIFTOFF_KTS})` : 'never lifted off',
      score: flew ? curve(Math.abs(st.liftKts - LIFTOFF_KTS), [[4, 100], [7, 60], [11, 0]]) : 0 }, // the game's Cessna lifts off at ~53.5-54.3
    rotate: { key: 'rotate', label: 'Nose up at', value: st.rotateKts === null ? 'never raised' : `${Math.round(st.rotateKts)} kt (coach ${ROTATE_KTS})`,
      score: st.rotateKts === null ? (flew ? 100 : 0) : curve(early, [[3, 100], [EARLY_KTS, 50], [15, 0]]) },
    speed: { key: 'speed', label: 'Speed at 50 ft', value: st.obstKts === null ? 'never reached 50 ft' : `${Math.round(st.obstKts)} kt (handbook ${OBSTACLE_KTS})`, score: speedScore },
    line: { key: 'line', label: 'Centreline on the roll', value: `${fmt(st.maxCrossM * M_TO_FT)} ft off at most`,
      score: curve(st.maxCrossM, [[3, 100], [6, 70], [10, 30], [15, 0]]) },
  };
  const weights = kid ? KID_WEIGHTS : WEIGHTS;
  const factors = Object.keys(weights).map((k) => all[k]);
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * weights[f.key], 0));
  const reasons = [];
  if (st.why) { reasons.push(REASONS[st.why]); score = Math.min(score, FAIL_CAP); }
  if (st.settled && !st.why) { reasons.push(REASONS.settled); score = Math.min(score, CAP_C); }
  if (!kid) {
    if (st.tail) { reasons.push(REASONS.tail); score = Math.min(score, CAP_B); }
    if (flew && st.flapsLift !== FLAPS) { reasons.push(`Flaps ${st.flapsLift * 10}° at the lift-off. ${REASONS.flaps}`); score = Math.min(score, CAP_B); }
    if (st.releaseThrottle !== null && st.releaseThrottle < FULL_POWER) reasons.push(REASONS.power);
    if (early > EARLY_KTS) { reasons.push(REASONS.early); score = Math.min(score, CAP_B); }
    if (flew && st.liftKts < LIFTOFF_KTS - 3) reasons.push(REASONS.slowLift);
  }
  if (obstRatio !== null && obstRatio > POH_BAND && !poh.offChart) {
    reasons.push(`50 ft came ${fmt(obstFt - poh.totalFt)} ft past the handbook's ${fmt(poh.totalFt)} ft.`);
    score = Math.min(score, CAP_B);
  }
  if (!reasons.length && score < 85) reasons.push(REASONS[factors.reduce((a, f) => (f.score < a.score ? f : a)).key]);
  return {
    kind: 'shortTakeoff', title: flew ? 'Short-field takeoff' : 'Short-field takeoff failed', grade: letterGrade(score), score, factors,
    reason: reasons.length ? reasons.slice(0, 2).join(' ') : null,
    note: `${kid ? 'Kid level: the plane climbed for you. ' : ''}The handbook's distances (Cessna 172S POH Fig. 5-5) for today's air at Addison${windWords}, from where the brakes came off; the 50 ft obstacle is virtual.`,
  };
}

// main.js's calls, the input built here from the sim (reused: the chunk pays, not boot).
const _in = { brakes: true, throttle: 0, flapsIndex: 0, onGround: true, wheelFt: 0, iasKts: 0, gsKts: 0, alongM: 0, leftM: 0, crossM: 0, halfWidthM: 0, pitchDeg: 0, tailOn: false, poh: null, kid: false };
function input(st, sim, pitchDeg) {
  const e = st.end, r = e.hdgT * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r);
  const rx = sim.pos.x - e.thrX, rz = sim.pos.z - e.thrZ;
  _in.kid = sim.assist === 'kid';
  // Kid's brakes come off by themselves once the power is in (its card is the roll and the obstacle).
  if (_in.kid && st.phase === 'hold' && sim.brakesOn && sim.throttle >= FULL_POWER) sim.brakesOn = false;
  _in.brakes = !!sim.brakesOn; _in.throttle = sim.throttle; _in.flapsIndex = sim.flapsIndex;
  _in.onGround = sim.onGround;
  _in.wheelFt = sim.onGround ? 0 : (sim.pos.y - sim.groundY - sim.spec.gearHeight) * M_TO_FT;
  _in.iasKts = sim.iasKts; _in.gsKts = sim.gsKts;
  _in.alongM = rx * dx + rz * dz;
  _in.leftM = e.lengthM - e.displacedM - _in.alongM;
  _in.crossM = rx * -dz + rz * dx;
  _in.halfWidthM = e.widthM / 2;
  _in.pitchDeg = pitchDeg;
  _in.tailOn = (sim.wheelLoads?.[3] ?? 0) > 0;
  _in.poh = null;
  // The table for today's air, once, on the step the roll starts (not a new object every frame on the brakes).
  if (st.phase === 'hold' && released(_in)) _in.poh = pohTakeoff(e.elevFt, sim.wx?.altimInHg ?? 29.92, sim.wx?.tempC ?? 15, headwindKts(sim.wx, e.hdgT));
  return _in;
}
export const shortTakeoffSimStep = (st, sim, pitchDeg, dt) => shortTakeoffStep(st, input(st, sim, pitchDeg), dt);
export const shortTakeoffPrompt = (st, sim, pitchDeg) => shortTakeoffTarget(st, input(st, sim, pitchDeg));
