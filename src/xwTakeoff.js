// Crosswind takeoff lesson (ticket 0220): the Cessna on Addison 16 with the wind across the runway, coached and graded the
// Airplane Flying Handbook's way. Source, read 2026-11-24 (the PDF, pdftotext): FAA-H-8083-3C ch. 6 "Takeoffs and Departure
// Climbs", "Crosswind Takeoff", pp. 6-6 to 6-9 (faasafety.gov's copy of the chapter):
//  - Takeoff roll (p. 6-6): "the pilot should apply full aileron pressure into the wind while beginning the takeoff roll ...
//    maintain this control position, as the airplane accelerates, and until the ailerons become effective". "While holding
//    aileron pressure into the wind, the pilot should use the rudder to maintain a straight takeoff path ... the pilot will
//    typically apply downwind rudder pressure." (p. 6-7) "the pilot needs to maintain some aileron pressure throughout the
//    takeoff roll. If the upwind wing rises ... [it may] 'skip'": "a series of very small bounces caused by the airplane
//    attempting to fly and then settling back onto the runway ... side-skipping imposes severe side stresses on the landing gear".
//  - Lift-off (p. 6-7): "hold the main wheels on the ground slightly longer than in a normal takeoff so that a smooth but very
//    definite lift-off can be made".
//  - Initial climb (p. 6-8): "The yoke, having been initially turned into the wind, can be relaxed ... as the aircraft
//    establishes its climb, the nose should be turned into the wind to offset the crosswind, wings brought to level, and rudder
//    input adjusted to maintain runway alignment (crabbing) ... the runway alignment (staying over the runway and its extended
//    centerline) is paramount ... check the ground track frequently and adjust the wind correction angle".
//  - Common errors (p. 6-9): "less than full aileron pressure into the wind initially", "Side-skipping", "Excessive aileron
//    input in the latter stage of the takeoff roll resulting in a steep bank into the wind at lift-off", "Inadequate drift
//    correction after lift-off".
//  - Cessna 172S POH Section 4, normal takeoff: "LIFT NOSE WHEEL at 55 KIAS" (VR_KTS); crosswind "Operation in direct
//    crosswinds of 15 knots has been demonstrated" (the lesson's wind stays inside it: wingLow.js liveSuits).
// The handbook gives the technique, not numbers. The game's choices: the aileron is graded as its time-weighted share of
// full throw into the wind from the start of the roll to AIL_TO_KTS (where "the ailerons become effective" is taken to be);
// the centreline by the roll's widest excursion; the climb by the ground track against the runway from TRACK_FROM_FT to
// DONE_FT (a crab equal to the wind correction angle tracks the centreline: a track within TRACK_OK_DEG is the ticket's
// "crab within the wind correction angle ±3°"; the crab angle itself is shown, not graded: a sideslip that holds the track
// scores as a crab does), and the distance off the extended centreline at DONE_FT (p. 6-8: staying over it "is paramount").
// The lift-off: p. 6-7 holds the aileron into the wind through it, so the upwind wing low or level is right and the downwind
// wing low (the upwind wing risen) is not; a steep bank into the wind (p. 6-9) is not either. Kid's pedals hold the centreline on the roll (assists.js), and its
// hands-off climb holds the wings level without a crab: its card scores the result only (the centreline and the lift-off).
// A lazy chunk, loaded with the mission (main.js startDrills). Pure (no THREE, no DOM): tests/unit/xwTakeoff.test.js,
// tests/flight/xwTakeoff.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK, TOUCH_WORDS } from './coach.js';
import { M_TO_FT } from './constants.js';
// The wing-low lesson's wind (0188): Addison's live METAR when it blows 5-15 kt across 16 without a tailwind, else 12 kt
// from the right, labelled a scenario.
import { liveSuits, scenarioWx, windAcross } from './wingLow.js';

export const XW_TAKEOFF_KEY = 'kads_crosswind_takeoff';
// POH: "LIFT NOSE WHEEL at 55 KIAS". A lift-off before VR_KTS - EARLY_KTS is named (it forced the airplane off).
export const VR_KTS = 55;
export const EARLY_KTS = 5;
// Full aileron into the wind from the start of the roll to here (the game's "ailerons become effective").
export const AIL_TO_KTS = 40;
// The roll counts as started (the aileron clock runs) at ROLL_THROTTLE and this groundspeed.
export const ROLL_THROTTLE = 0.5;
export const ROLL_GS_KTS = 5;
// The coach asks for more aileron under this share of full throw on the roll's first part, and to ease it past AIL_TO_KTS
// above EASE_AIL.
export const AIL_ASK = 0.5;
export const EASE_AIL = 0.6;
// The coach's centreline call: off it by this much on the roll.
export const LINE_CALL_M = 4;
// Lifted off: the wheels this high (a hop over a bump is not a lift-off). Back on the runway after it: a skip.
export const LIFT_FT = 1;
// A steep bank into the wind at the lift-off (p. 6-9's "excessive aileron input in the latter stage") is named past this.
export const STEEP_BANK_DEG = 5;
// The climb's track is measured from here (below it the handbook's sideslip, then the crab) to DONE_FT.
export const TRACK_FROM_FT = 50;
export const DONE_FT = 200;
export const TRACK_OK_DEG = 3;
// The track's coach call: drifting this far either way.
export const DRIFT_CALL_DEG = 3;
// Drifted this far off the extended centreline at DONE_FT is named.
export const DRIFT_SAY_FT = 100;
// A run that never gets airborne or to DONE_FT in this long (from the roll) is graded anyway.
export const GIVE_UP_S = 150;
export const CAP_B = 84;
export const CAP_C = 69;
// The upwind wing risen at the lift-off (the downwind wing low) is named past this.
export const RISEN_DEG = 2;
export const FAIL_CAP = 54;
const WEIGHTS = { line: 0.3, ail: 0.25, liftoff: 0.15, track: 0.3 };
const KID_WEIGHTS = { line: 0.6, liftoff: 0.4 };

const SIDES = { R: 'right', L: 'left' };
const OTHER = { R: 'L', L: 'R' };
// The stick's keys (keyMap.js A/D), the pedals' (Q/E) and the touch deck's pedal buttons (index.html #touchRudder).
const AIL_KEY = { R: 'D', L: 'A' };
const RUD_KEY = { R: 'E', L: 'Q' };
const BTN = { R: 'RUD ▶', L: '◀ RUD' };
export const XT_TEXT = {};
export const XT_TOUCH = {};
for (const s of ['R', 'L']) {
  const w = SIDES[s], o = SIDES[OTHER[s]];
  XT_TEXT[`xtBrief${s}`] = `Wind from the ${w}: stick full ${w} (${AIL_KEY[s]}), then full power (Shift)`;
  XT_TOUCH[`xtBrief${s}`] = `Wind from the ${w}: stick full ${w}, then throttle to the top`;
  XT_TEXT[`xtAil${s}`] = `Aileron into the wind: hold the stick full ${w} (${AIL_KEY[s]})`;
  XT_TOUCH[`xtAil${s}`] = `Aileron into the wind: hold the stick full ${w}`;
  XT_TEXT[`xtHold${s}`] = `Hold the stick ${w}: the ${w} wing stays down, rudder keeps the line`;
  XT_TEXT[`xtEase${s}`] = `Speed building: ease the stick back toward the middle, a little ${w} stays in`;
  // Off the centreline on the roll (n: the side it is on): the pedal that steers back.
  XT_TEXT[`xtLine${s}`] = `${w[0].toUpperCase()}${w.slice(1)} of the centreline: ${o} rudder (${RUD_KEY[OTHER[s]]})`;
  XT_TOUCH[`xtLine${s}`] = `${w[0].toUpperCase()}${w.slice(1)} of the centreline: tap ${BTN[OTHER[s]]}`;
  XT_TEXT[`xtSlip${s}`] = `Flying! Keep the ${w} wing a little low, rudder holds the line`;
  XT_TEXT[`xtCrab${s}`] = `Turn a little ${w}, into the wind: crab, wings level, stay over the centreline`;
  XT_TEXT[`xtDrift${s}`] = `Drifting ${o}: turn a little more ${w}, into the wind`;
  XT_TEXT[`xtOver${s}`] = `Drifting ${w}: a little less ${w}`;
  XT_TEXT[`xtKid${s}`] = `Wind from the ${w}: full power (Shift), your plane keeps the line`;
  XT_TOUCH[`xtKid${s}`] = `Wind from the ${w}: throttle to the top, your plane keeps the line`;
}
Object.assign(XT_TEXT, {
  xtPower: 'Full power (Shift), keep the stick into the wind',
  xtRotate: `${VR_KTS} knots: ease back (S or ↑) for a firm, definite lift-off`,
  xtKidRotate: `${VR_KTS} knots: hold ↑ to lift off`,
  xtKidClimb: 'Flying! Let it climb',
});
Object.assign(XT_TOUCH, {
  xtPower: 'Throttle to the top, keep the stick into the wind',
  xtRotate: `${VR_KTS} knots: stick up a little (nose up) for a firm, definite lift-off`,
  xtKidRotate: `${VR_KTS} knots: hold the stick up to lift off`,
});
Object.assign(DRILL_TEXT, XT_TEXT);
Object.assign(TOUCH_WORDS, XT_TOUCH);
for (const k of Object.keys(XT_TEXT)) RANK[k] = k.startsWith('xtLine') || k === 'xtRotate' || k === 'xtKidRotate' ? 2 : 1;

// The coach's keys per wind side, built once (the prompt runs every frame: no strings made there).
const KEYS = {};
for (const s of ['R', 'L']) {
  KEYS[s] = { brief: `xtBrief${s}`, ail: `xtAil${s}`, hold: `xtHold${s}`, ease: `xtEase${s}`, slip: `xtSlip${s}`, crab: `xtCrab${s}`,
    drift: `xtDrift${s}`, over: `xtOver${s}`, kid: `xtKid${s}`, lineR: 'xtLineR', lineL: 'xtLineL' };
}

// end: the lesson's runway end (airports.js runwayEnd). Allocates (a mission load, not a frame).
export const createXwTakeoff = (end) => ({
  end, phase: 'roll', t: 0, readyT: null, wx: null, src: null, side: 'R', xwKts: 0, keys: KEYS.R,
  rolled: false, ailSum: 0, ailN: 0, maxOffM: 0, maxOffSide: 0, liftKts: null, liftBankIntoDeg: null, skipped: false,
  trackSum: 0, trackN: 0, crabSum: 0, wcaSum: 0, endCrossM: null, why: null,
});
export const xwTakeoffDone = (st) => st.phase === 'done';
// The ?debug snapshot's xwTakeoff (main.js openaeroDebug): the lesson's state, its wind and where it came from.
export const debugSnap = (st) => ({ ...st, end: st.end.id, keys: undefined, wx: undefined, src: undefined, windDirDeg: st.wx?.windDirDeg, windKts: st.wx?.windKts, live: !!st.wx?.live });

// The lesson's weather (main.js currentWeather while the lesson flies): the live report when it suits, else the scenario.
// Chosen again only when the report object changes, and never once the roll has started (a METAR refresh mid-roll must not
// swap the wind). Sets st.side (the wind's side: the stick goes that way) and st.xwKts. Allocates only on a change.
export function lessonWx(st, live) {
  // Offline (no live report, before or now) the scenario stays: currentWeather's fallback is a new object every call (device panel).
  if (st.wx && (st.rolled || live === st.src || (!live?.live && !st.wx.live))) return st.wx;
  st.src = live;
  st.wx = liveSuits(live, st.end.hdgT, st.end.airport) ? live : scenarioWx(st.end);
  const { xw } = windAcross(st.wx, st.end.hdgT);
  st.side = xw >= 0 ? 'R' : 'L';
  st.keys = KEYS[st.side];
  st.xwKts = Math.abs(xw);
  return st.wx;
}

const finish = (st, why) => { st.why = why; st.phase = 'done'; return 'done'; };
// The aileron into the wind (+), -1..1. ail: + = stick right.
const into = (st, ail) => (st.side === 'R' ? ail : -ail);

// One step, once the player is flying. s: { onGround, wheelFt, iasKts, tasKts, gsKts, throttle, ail (the aileron, + = right),
// bankRightDeg, crossM (+ = right of the centreline), halfWidthM, leftM (runway ahead), noseOffDeg (the nose against the
// runway, + = right), trackOffDeg (the ground track against it, + = right) }. Returns 'done' on the step the lesson ends
// (graded), else ''. Mutates st, no allocation.
export function xwTakeoffStep(st, s, dt) {
  if (st.phase === 'done') return '';
  if (st.readyT === null) st.readyT = st.t;
  if (st.rolled) st.t += dt; // the give-up clock runs from the roll: reading the coach is free
  if (!st.rolled && s.throttle >= ROLL_THROTTLE && s.gsKts > ROLL_GS_KTS) st.rolled = true;
  if (s.onGround) {
    if (st.rolled && s.iasKts < AIL_TO_KTS && st.phase === 'roll') { st.ailSum += Math.max(-1, Math.min(1, into(st, s.ail))) * dt; st.ailN += dt; }
    if (Math.abs(s.crossM) > st.maxOffM) { st.maxOffM = Math.abs(s.crossM); st.maxOffSide = Math.sign(s.crossM); }
    if (st.phase === 'air') st.skipped = true; // back on the runway after the lift-off: the handbook's skip
    if (s.leftM < 0) return finish(st, 'overrun');
    if (Math.abs(s.crossM) > s.halfWidthM + 3) return finish(st, 'off');
    if (st.rolled && s.throttle < 0.5 && s.gsKts < 3) return finish(st, 'stopped');
    if (st.t > GIVE_UP_S) return finish(st, 'stopped');
    return '';
  }
  if (st.phase === 'roll') {
    if (s.wheelFt <= LIFT_FT) return '';
    st.phase = 'air'; st.liftKts = s.iasKts;
    st.liftBankIntoDeg = st.side === 'R' ? s.bankRightDeg : -s.bankRightDeg;
  }
  if (s.wheelFt >= TRACK_FROM_FT) {
    const sign = st.side === 'R' ? 1 : -1;
    st.trackSum += Math.abs(s.trackOffDeg) * dt; st.trackN += dt;
    st.crabSum += s.noseOffDeg * sign * dt;
    st.wcaSum += Math.asin(Math.min(1, st.xwKts / Math.max(40, s.tasKts ?? s.iasKts))) * 57.29578 * dt;
  }
  if (s.wheelFt >= DONE_FT) { st.endCrossM = s.crossM; return finish(st, null); }
  if (st.t > GIVE_UP_S) return finish(st, 'noclimb');
  return '';
}

// The coach's key (main.js through coach.js s.ds / dsGround). s: xwTakeoffStep's input plus kid.
export function xwTakeoffPrompt(st, s) {
  if (st.phase === 'done' || st.readyT === null) return null;
  const k = st.keys, a = into(st, s.ail);
  if (s.kid) {
    if (!s.onGround || st.phase === 'air') return 'xtKidClimb';
    return s.iasKts >= VR_KTS ? 'xtKidRotate' : k.kid;
  }
  if (s.onGround) {
    if (!st.rolled) return a < AIL_ASK ? k.brief : 'xtPower';
    if (Math.abs(s.crossM) > LINE_CALL_M) return s.crossM > 0 ? k.lineR : k.lineL;
    if (s.iasKts >= VR_KTS) return 'xtRotate';
    if (s.iasKts < AIL_TO_KTS) return a < AIL_ASK ? k.ail : k.hold;
    return a > EASE_AIL ? k.ease : k.hold;
  }
  if (s.wheelFt < TRACK_FROM_FT) return k.slip;
  // The track against the runway, + = drifting downwind (with the wind).
  const down = st.side === 'R' ? -s.trackOffDeg : s.trackOffDeg;
  if (down > DRIFT_CALL_DEG) return k.drift;
  if (down < -DRIFT_CALL_DEG) return k.over;
  return k.crab;
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const REASONS = {
  overrun: 'Ran out of runway: full power, and ease back at 55 knots.',
  off: 'Left the side of the runway: the rudder keeps it on the centreline, the stick into the wind keeps the wing down.',
  stopped: 'Never got airborne: full power, stick into the wind, and ease back at 55 knots.',
  noclimb: 'Never climbed to 200 ft: once airborne, climb away at 74 knots.',
};

// The grade. kid: Kid's pedals held the roll and its hands-off climb has no crab: the centreline and the lift-off only.
export function gradeXwTakeoff(st, kid = false) {
  const w = SIDES[st.side], o = SIDES[OTHER[st.side]];
  const flew = st.liftKts !== null;
  const offFt = st.maxOffM * M_TO_FT;
  const line = { key: 'line', label: 'Centreline on the roll', value: offFt < 1 ? 'on it' : `${fmt(offFt)} ft ${st.maxOffSide > 0 ? 'right' : 'left'} at most`,
    score: curve(offFt, [[10, 100], [25, 70], [45, 25], [55, 0]]) };
  const ail = st.ailN ? st.ailSum / st.ailN : 0;
  const ailRow = { key: 'ail', label: `Aileron into the wind, to ${AIL_TO_KTS} kt`, value: `${Math.round(Math.max(0, ail) * 100)}% of full ${ail >= 0 ? w : `(the stick went ${o})`}`,
    score: curve(ail, [[0, 0], [0.3, 40], [0.6, 80], [0.8, 100]]) };
  const bank = st.liftBankIntoDeg ?? 0;
  const liftoff = { key: 'liftoff', label: 'Lift-off', value: flew ? `${Math.round(st.liftKts)} kt, ${Math.abs(bank).toFixed(0)}° ${bank >= 0 ? `${w} wing low` : `${o} wing low`}` : 'never lifted off',
    score: flew ? Math.min(curve(st.liftKts, [[VR_KTS - 10, 20], [VR_KTS - EARLY_KTS, 60], [VR_KTS - 2, 100], [VR_KTS + 20, 100], [VR_KTS + 35, 30]]),
      curve(bank, [[-6, 0], [-RISEN_DEG - 1, 60], [-1, 100], [STEEP_BANK_DEG, 100], [10, 40], [15, 0]])) : 0 };
  const trackErr = st.trackN ? st.trackSum / st.trackN : null;
  const crab = st.trackN ? st.crabSum / st.trackN : 0, wca = st.trackN ? st.wcaSum / st.trackN : 0;
  const endFt = st.endCrossM === null ? null : st.endCrossM * M_TO_FT;
  const track = { key: 'track', label: `Track over the centreline, ${TRACK_FROM_FT}-${DONE_FT} ft`,
    value: trackErr === null ? 'never climbed' : `crab ${Math.abs(crab).toFixed(0)}° ${crab >= 0 ? w : o} (the wind's ~${wca.toFixed(0)}°), track ${trackErr.toFixed(0)}° off${endFt === null ? '' : `, ${fmt(Math.abs(endFt))} ft ${endFt >= 0 ? 'right' : 'left'} at ${DONE_FT} ft`}`,
    score: trackErr === null ? 0 : Math.min(curve(trackErr, [[TRACK_OK_DEG, 100], [6, 60], [10, 25], [15, 0]]), endFt === null ? 100 : curve(Math.abs(endFt), [[50, 100], [DRIFT_SAY_FT, 75], [200, 35], [400, 0]])) };
  const factors = kid ? [line, liftoff] : [line, ailRow, liftoff, track];
  const weights = kid ? KID_WEIGHTS : WEIGHTS;
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * weights[f.key], 0));
  const reasons = [];
  if (st.why) { reasons.push(REASONS[st.why]); score = Math.min(score, st.why === 'noclimb' ? CAP_C : FAIL_CAP); }
  if (st.skipped && !st.why) { reasons.push(`Skipped: it lifted off and settled back onto the runway. Hold it on a little longer for a definite lift-off${kid ? '' : `, the stick ${w}`}.`); score = Math.min(score, CAP_C); }
  if (flew && st.liftKts < VR_KTS - EARLY_KTS) reasons.push(`Lifted off at ${Math.round(st.liftKts)} kt, before ${VR_KTS}: hold it on the runway a little longer in a crosswind.`);
  if (!kid && flew && bank < -RISEN_DEG) reasons.push(`The ${w} wing rose at the lift-off (${o} wing ${Math.abs(bank).toFixed(0)}° low): keep a little ${w} stick in through the lift-off.`);
  if (!kid && flew && bank > STEEP_BANK_DEG) reasons.push(`A steep ${bank.toFixed(0)}° bank at the lift-off: ease the stick toward the middle as the speed builds.`);
  if (!kid && st.ailN && ail < AIL_ASK) reasons.push(`Too little aileron into the wind on the roll: full ${w} stick from the start, eased out as the speed builds.`);
  if (!kid && st.endCrossM !== null) {
    const downFt = (st.side === 'R' ? -st.endCrossM : st.endCrossM) * M_TO_FT;
    if (downFt > DRIFT_SAY_FT) reasons.push(`Drifted ${fmt(downFt)} ft ${o} of the extended centreline by 200 ft: turn into the wind (${w}) to crab.`);
    else if (-downFt > DRIFT_SAY_FT) reasons.push(`Drifted ${fmt(-downFt)} ft ${w} of the extended centreline by 200 ft: a little less crab.`);
    if (Math.abs(downFt) > DRIFT_SAY_FT) score = Math.min(score, CAP_B);
  }
  if (!reasons.length && score < 85) reasons.push({ line: 'Wandered off the centreline: rudder keeps it straight.', ail: `Full ${w} stick into the wind from the start of the roll.`,
    liftoff: `Lift off at ${VR_KTS} knots, wings nearly level.`, track: `Crab into the wind (${w}) to stay over the extended centreline.` }[factors.reduce((a, f) => (f.score < a.score ? f : a)).key]);
  return {
    kind: 'xwTakeoff', title: flew ? 'Crosswind takeoff' : 'Crosswind takeoff failed', grade: letterGrade(score), score, factors,
    reason: reasons.join(' ') || null,
    note: `${kid ? 'Kid level: your plane kept the line on the roll. ' : ''}${st.wx?.live ? `Addison's live wind: ${fmt(st.xwKts)} kt across from the ${w}.` : `A scenario wind: ${fmt(st.xwKts)} kt across from the ${w}.`}`,
  };
}

// main.js's calls, the input built here from the sim (reused: the chunk pays, not boot). noseHdgT, bankRightDeg: main.js's _euler.
const _in = { onGround: true, wheelFt: 0, iasKts: 0, tasKts: 0, gsKts: 0, throttle: 0, ail: 0, bankRightDeg: 0, crossM: 0, halfWidthM: 0, leftM: 0, noseOffDeg: 0, trackOffDeg: 0, kid: false };
const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
export function xwInput(st, sim, noseHdgT, bankRightDeg) {
  const e = st.end, r = e.hdgT * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r);
  const rx = sim.pos.x - e.thrX, rz = sim.pos.z - e.thrZ;
  _in.onGround = sim.onGround;
  _in.wheelFt = sim.onGround ? 0 : (sim.pos.y - sim.groundY - sim.spec.gearHeight) * M_TO_FT;
  _in.iasKts = sim.iasKts; _in.tasKts = sim.tasKts ?? sim.iasKts; _in.gsKts = sim.gsKts; _in.throttle = sim.throttle;
  _in.ail = sim.aileronInput ?? 0; _in.bankRightDeg = bankRightDeg;
  const along = rx * dx + rz * dz;
  _in.leftM = e.lengthM - e.displacedM - along;
  _in.crossM = rx * -dz + rz * dx;
  _in.halfWidthM = e.widthM / 2;
  _in.noseOffDeg = wrap180(noseHdgT - e.hdgT);
  const gs = Math.hypot(sim.vel.x, sim.vel.z);
  _in.trackOffDeg = gs > 5 ? wrap180(Math.atan2(sim.vel.x, -sim.vel.z) * 57.29578 - e.hdgT) : 0;
  _in.kid = sim.assist === 'kid';
  return _in;
}
export const xwTakeoffSimStep = (st, sim, noseHdgT, bankRightDeg, dt) => xwTakeoffStep(st, xwInput(st, sim, noseHdgT, bankRightDeg), dt);
export const xwTakeoffSimPrompt = (st, sim, noseHdgT, bankRightDeg) => xwTakeoffPrompt(st, xwInput(st, sim, noseHdgT, bankRightDeg));
