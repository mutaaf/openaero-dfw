// Wing-low crosswind landing lesson (ticket 0188): the Cessna on a 2 NM final to Addison 16 with the wind across the
// runway, coached and graded the Airplane Flying Handbook's way. Source, read 2026-11-15 (the PDF, pdftotext):
//  - FAA-H-8083-3C ch. 9, "Crosswind Approach and Landing", pp. 9-15 to 9-17: "There are two usual methods ... the crab
//    method and the wing-low (sideslip) method ... The wing-low method is recommended in most cases ... While current
//    testing standards allow for either method, pilots should learn to do both." "To use the wing-low method, the pilot
//    first uses rudder to align and maintain the airplane's heading with the runway direction ... oppose it using
//    ailerons resulting in just enough bank to cancel the drift." Round out: "Keep the upwind wing down throughout the
//    round out. If the wings are leveled, the airplane begins drifting and the touchdown occurs while drifting.
//    Remember, the primary objective is to land the airplane without subjecting it to any side loads that result from
//    touching down while drifting." Touchdown: "the crosswind correction is maintained throughout the round out, and the
//    initial touchdown occurs on the upwind main wheel". The crab (p. 9-15): the rudder aligns the nose "just prior to
//    touchdown ... to avoid sideward contact of the wheels with the runway".
//  - Cessna 172S POH (July 1998) p. 4-34, CROSSWIND LANDING: "use the minimum flap setting required for the field
//    length ... Although the crab or combination method of drift correction may be used, the wing low method gives the
//    best control ... Operation in direct crosswinds of 15 knots has been demonstrated." Flaps 10 (FLAPS) is the game's
//    choice in that spirit: Addison's 7,203 ft needs none, and 10° keeps the slip under the POH's 20° caution. The scenario
//    wind and the live METAR's are kept within the 15 kt, which tests/flight/c172.test.js flies.
// The handbook gives the aim, not numbers: "just enough bank to cancel the drift", so the card grades the bank's sign (a
// wing down into the wind) and the drift it leaves, not a fixed band (the bank that cancels it grows with the wind:
// ~0.2° a knot here, 1° at 5 kt, 3° at 15, tests/flight/wingLow.test.js). The game's tolerances: drift across the wheels
// within DRIFT_OK_KTS, the nose within 3° of the runway. A crabbed touchdown caps B (the side load both methods avoid);
// drifting, both mains together, the downwind wheel first and a level or wrong wing are named but cap nothing (the
// testing standards allow either method, and a crab taken out at the last moment lands on both). Kid keeps its de-crab assist (assists.js): its card is the
// landing's own. A lazy chunk, loaded with the mission (main.js startDrills). Pure (no THREE, no DOM):
// tests/unit/wingLow.test.js, tests/flight/wingLow.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK, TOUCH_WORDS } from './coach.js';
// Only symbols main.js already imports: a lazy chunk importing one it doesn't grows the boot chunk's exports.
import { DEG_TO_RAD } from './constants.js';
import { scenarioWeather } from './weather.js';

export const WING_LOW_KEY = 'kads_crosswind_wing_low';
// The lesson's flaps (POH p. 4-34, the minimum for the field): 10°, the C172's first notch; the landing coach asks for these.
export const FLAPS = 1;
// The scenario wind: 12 kt straight across (from the runway's right), inside the POH's demonstrated 15 kt.
export const SCENARIO_KTS = 12;
// A live METAR is the lesson's wind when its crosswind is at least MIN_XW_KTS (less teaches little), its gusts' crosswind
// at most the POH's 15, and its tailwind at most TAIL_OK_KTS; else the scenario's (labelled scenario, never live).
export const MIN_XW_KTS = 5;
export const MAX_XW_KTS = 15;
export const TAIL_OK_KTS = 2;
// A wing down into the wind is at least WING_MIN_DEG of bank (a correct 5 kt landing holds ~1°); the drift across the
// wheels at touchdown is full marks within DRIFT_OK_KTS and named past DRIFT_SAY_KTS; the nose within ALIGN_DEG of the runway.
export const WING_MIN_DEG = 0.5;
export const DRIFT_OK_KTS = 1;
export const DRIFT_SAY_KTS = 2;
export const ALIGN_DEG = 3;
// gradeLanding's flare factor takes 8 points a degree of bank past 2°; the lesson's bank is not a fault up to this.
export const BANK_FREE_DEG = 6;
// The coach: the briefing held this long; the crab call below ALIGN_CALL_FT when the nose is this far off the runway.
export const SAY_S = 8;
export const ALIGN_CALL_FT = 300;
export const ALIGN_CALL_DEG = 5;
// "Hold it, upwind wheel first" from HOLD_FT down to the landing coach's idle and flare (30 ft).
export const HOLD_FT = 50;
export const CAP_B = 84;
// The lesson's four rows share this much of the score (Pilot and Learner): the landing's own factors keep the rest.
export const LESSON_W = 0.3;
const FLARE_W = 0.15; // landing.js WEIGHTS.flare, inlined: the lesson rescores that factor without its bank penalty

const SIDES = { R: 'right', L: 'left' };
const OTHER = { R: 'L', L: 'R' };
// The pedals' keys (keyMap.js Q/E) and the touch deck's buttons (index.html #touchRudder), named with the rudder. The
// touch words are short: a phone held sideways moves a three-line card over the wind box (device panel).
const KEY = { R: 'E', L: 'Q' };
const BTN = { R: 'RUD ▶', L: '◀ RUD' };
export const WL_TEXT = {};
export const WL_TOUCH = {};
for (const s of ['R', 'L']) {
  const w = SIDES[s], o = SIDES[OTHER[s]];
  WL_TEXT[`wlBrief${s}`] = `Wind from the ${w}: lower the ${w} wing, ${o} rudder (${KEY[OTHER[s]]}) to hold the line`;
  WL_TOUCH[`wlBrief${s}`] = `Wind from the ${w}: ${w} wing down, tap ${BTN[OTHER[s]]}`;
  WL_TEXT[`wlHold${s}`] = `Hold it: keep the ${w} wing down, ${w} wheel first`;
  // AFH: "Keep the upwind wing down throughout the round out" (the landing coach's flare call would level it).
  WL_TEXT[`wlFlare${s}`] = `Flare: ease back, keep the ${w} wing down`;
  WL_TEXT[`wlKid${s}`] = `Wind from the ${w}: let go, your plane lines itself up`;
  // Off the centreline: the wing does the steering in a slip (the landing coach's "bank gently left" would raise it).
  WL_TEXT[`wlOffR${s}`] = `Right of the centreline: a little ${s === 'R' ? 'less' : 'more'} ${w} wing`;
  WL_TEXT[`wlOffL${s}`] = `Left of the centreline: a little ${s === 'L' ? 'less' : 'more'} ${w} wing`;
  // The nose off the runway (n: which way it points): the pedal that lines it up, and the wing that holds the line.
  for (const n of ['R', 'L']) {
    const p = OTHER[n];
    WL_TEXT[`wlNose${n}${s}`] = `Nose ${SIDES[n]} of the runway: ${SIDES[p]} rudder (${KEY[p]}) to line it up, ${w} wing down`;
    WL_TOUCH[`wlNose${n}${s}`] = `Nose ${SIDES[n]}: tap ${BTN[p]}, ${w} wing down`;
  }
}
Object.assign(DRILL_TEXT, WL_TEXT);
Object.assign(TOUCH_WORDS, WL_TOUCH);
for (const k of Object.keys(WL_TEXT)) RANK[k] = k.startsWith('wlHold') || k.startsWith('wlFlare') ? 3 : k.startsWith('wlNose') ? 2 : 1;

const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
// The wind across and along a runway (kt): xw + = from the right, hw + = a headwind. wx: weather.js's windDirDeg (true), windKts.
export function windAcross(wx, hdgT) {
  if (!wx?.windKts || wx.windDirDeg == null) return { xw: 0, hw: 0 };
  const a = (wx.windDirDeg - hdgT) * DEG_TO_RAD;
  return { xw: wx.windKts * Math.sin(a), hw: wx.windKts * Math.cos(a) };
}
// Whether a live METAR makes the lesson (see MIN_XW_KTS): the field's own (main.js falls back to KDFW's when Addison has
// none; the card would call that Addison's wind). Pure.
export function liveSuits(wx, hdgT, airport) {
  if (!wx?.live || (airport && wx.icao !== airport)) return false;
  const { xw, hw } = windAcross(wx, hdgT);
  const gustXw = Math.max(wx.windKts, wx.gustKts ?? 0) * Math.abs(xw) / wx.windKts;
  return Math.abs(xw) >= MIN_XW_KTS && gustXw <= MAX_XW_KTS && hw >= -TAIL_OK_KTS;
}
// The scenario's weather: scenarioWeather's mild day with SCENARIO_KTS from 90° right of the runway (a METAR's tens).
export function scenarioWx(end) {
  const dir = (Math.round((end.hdgT + 90) / 10) * 10) % 360 || 360;
  const wx = scenarioWeather();
  return { ...wx, icao: end.airport, windDirDeg: dir, windKts: SCENARIO_KTS, gustKts: SCENARIO_KTS, scripted: true, // atis.js: "this mission's", not "offline"
    raw: `SCENARIO ${end.airport} ${String(dir).padStart(3, '0')}${SCENARIO_KTS}KT 10SM FEW050 18/08 A3000` };
}

// end: the lesson's runway end (airports.js runwayEnd). Allocates (a mission load, not a frame).
export const createWingLow = (end) => ({
  end, t: 0, readyT: null, wx: null, src: null, side: 'R', xwKts: 0, td: null, keys: KEYS.R,
});
// The coach's keys per wind side, built once (the prompt runs every frame: no strings made there).
const KEYS = {};
for (const s of ['R', 'L']) KEYS[s] = { brief: `wlBrief${s}`, hold: `wlHold${s}`, flare: `wlFlare${s}`, kid: `wlKid${s}`, noseR: `wlNoseR${s}`, noseL: `wlNoseL${s}`, offR: `wlOffR${s}`, offL: `wlOffL${s}` };

// The lesson's weather (main.js currentWeather while the lesson flies): the live report when it suits, else the scenario.
// Chosen again only when the report object changes, and never once the player is flying (a METAR refresh mid-final must
// not swap the wind under them). Sets wl.side (which wing goes down) and wl.xwKts. Allocates only on a change.
export function lessonWx(wl, live) {
  if (wl.wx && (wl.readyT !== null || live === wl.src)) return wl.wx;
  wl.src = live;
  wl.wx = liveSuits(live, wl.end.hdgT, wl.end.airport) ? live : scenarioWx(wl.end);
  const { xw } = windAcross(wl.wx, wl.end.hdgT);
  wl.side = xw >= 0 ? 'R' : 'L';
  wl.keys = KEYS[wl.side];
  wl.xwKts = Math.abs(xw);
  return wl.wx;
}

// Which main touched first. loads: [nose, left, right] (N, gear.js body.wheelLoads) or null (JSBSim reports none: the
// bank decides, the lower wing's wheel being the lower one). Returns 'upwind' | 'downwind' | 'both' | 'nose'.
export function firstMain(loads, side, bankIntoDeg) {
  if (!loads) return bankIntoDeg > WING_MIN_DEG ? 'upwind' : bankIntoDeg < -WING_MIN_DEG ? 'downwind' : 'both';
  const l = loads[1] > 0, r = loads[2] > 0;
  if (l && r) return 'both';
  if (!l && !r) return 'nose';
  return (r ? 'R' : 'L') === side ? 'upwind' : 'downwind';
}

// One frame, once the player is flying (main.js: cockpitEntered, no modal). s: { aglFt (the wheels' height), onGround,
// bankRightDeg, noseHdgT (true), pitchDeg, loads (gear.js wheelLoads or null), driftKts (the groundspeed across the nose,
// + = moving right) }. Records the first touchdown's bank into the
// wind, the nose against the runway and the first main; a climb back past HOLD_FT after it (a go-around, a big bounce
// flown away) clears it: the next touchdown is the one graded. Mutates wl, allocates only at the touchdown.
export function wingLowStep(wl, s, dt) {
  if (wl.readyT === null) wl.readyT = wl.t;
  wl.t += dt;
  if (wl.td && !s.onGround && s.aglFt > HOLD_FT) wl.td = null;
  if (wl.td) return wl;
  const touched = s.onGround || (s.loads && (s.loads[1] > 0 || s.loads[2] > 0));
  if (!touched) return wl;
  const bankInto = wl.side === 'R' ? s.bankRightDeg : -s.bankRightDeg;
  // Drift towards the wind (+) or away from it (-): too much wing, or too little.
  const driftUpKts = wl.side === 'R' ? s.driftKts ?? 0 : -(s.driftKts ?? 0);
  wl.td = { bankIntoDeg: bankInto, noseOffDeg: wrap180(s.noseHdgT - wl.end.hdgT), pitchDeg: s.pitchDeg, first: firstMain(s.loads, wl.side, bankInto), driftUpKts };
  return wl;
}

// The coach's key (through coach.js s.ds, before the landing coach's own), or null for the landing coach's (flaps,
// speed, PAPI, idle, rollout). s: main.js coachInput (aglFt, kid, throttle, locDots: + = right of the centreline) plus
// noseOffDeg (the nose against the runway, + = right). The briefing names the wing; under ALIGN_CALL_FT a nose off the
// runway is called; off the centreline, more or less wing (not "bank gently", which would level the upwind wing); at
// HOLD_FT the upwind wheel; under 30 ft the landing coach's idle, then the lesson's flare (the wing stays down).
export function wingLowPrompt(wl, s) {
  if (wl.readyT === null || wl.td) return null;
  const k = wl.keys;
  if (s.kid) return wl.t - wl.readyT < SAY_S ? k.kid : null;
  if (s.aglFt < 30) return s.throttle > 0.05 ? null : k.flare; // the landing coach's idle, then the lesson's flare
  if (s.aglFt < HOLD_FT) return k.hold;
  if (wl.t - wl.readyT < SAY_S) return k.brief;
  if (s.aglFt < ALIGN_CALL_FT && Math.abs(s.noseOffDeg) > ALIGN_CALL_DEG) return s.noseOffDeg > 0 ? k.noseR : k.noseL;
  if (Math.abs(s.locDots ?? 0) > 0.6) return s.locDots > 0 ? k.offR : k.offL; // the landing coach's centreline threshold
  return null;
}

const WING_PTS = [[-2, 20], [0, 50], [WING_MIN_DEG, 100]];
const DRIFT_PTS = [[0, 100], [DRIFT_OK_KTS, 100], [3, 60], [6, 20]];
const ALIGN_PTS = [[0, 100], [ALIGN_DEG, 100], [6, 60], [10, 20]];
const WHEEL_PTS = { upwind: 100, both: 70, downwind: 30, nose: 0 };
// landing.js gradeLanding's flare curve on the pitch alone; the bank's penalty only past BANK_FREE_DEG.
const flareScore = (pitch, bank) => Math.max(0, (pitch < 0 ? 40 : curve(pitch, [[0, 70], [1, 100], [7, 100], [10, 60]])) - Math.max(0, bank - BANK_FREE_DEG) * 8);
export const DONE_NOTE = 'Wing-low: upwind wheel first, the nose straight down the runway.';

// The landing's grade (landing.js gradeLanding) with the lesson's rows, at the touchdown (main.js checkTouchdown; a bounce
// caps it after, landing.js capBounced). Pilot and Learner: the flare factor loses its bank penalty up to BANK_FREE_DEG (the
// lesson asks for the bank), the four rows take LESSON_W of the score, a crabbed touchdown caps B. Kid: the landing's own card
// (its assist flew the wing and the nose). A crash or a D for the runway itself stays. Pure.
export function wingLowResult(result, wl, kid = false) {
  if (result.grade === 'CRASH' || !wl.td) return result;
  const t = wl.td, w = SIDES[wl.side], o = SIDES[OTHER[wl.side]];
  const bank = Math.abs(t.bankIntoDeg), off = Math.abs(t.noseOffDeg);
  const wing = { key: 'wing', label: 'Wing into the wind', value: `${bank.toFixed(1)}° ${t.bankIntoDeg >= 0 ? `${w} wing down` : `${o} wing down (away from the wind)`}`,
    score: Math.round(curve(t.bankIntoDeg, WING_PTS)) };
  const dk = Math.abs(t.driftUpKts);
  const drift = { key: 'drift', label: 'Sideways drift', value: dk < 0.5 ? 'none' : `${dk.toFixed(1)} kt ${t.driftUpKts > 0 ? `${w} (into the wind)` : `${o} (with the wind)`}`,
    score: Math.round(curve(dk, DRIFT_PTS)) };
  const align = { key: 'align', label: 'Nose on the runway', value: off < 0.5 ? 'straight' : `${off.toFixed(1)}° ${t.noseOffDeg > 0 ? 'right' : 'left'}`, score: Math.round(curve(off, ALIGN_PTS)) };
  const wheelWords = { upwind: `${w} (upwind) main`, downwind: `${o} (downwind) main`, both: 'both mains together', nose: 'the nose wheel' };
  const wheel = { key: 'wheel', label: 'First wheel down', value: wheelWords[t.first], score: WHEEL_PTS[t.first] };
  const rows = [wing, drift, align, wheel];
  const rest = result.factors;
  if (kid) return result; // Kid's de-crab flew the wing and the nose: no rows it didn't fly (first-timer panel)
  const oldFlare = rest.find((f) => f.key === 'flare');
  const flare = oldFlare && { ...oldFlare, score: Math.round(flareScore(t.pitchDeg, bank)) };
  const base = result.score + (flare ? (flare.score - oldFlare.score) * FLARE_W : 0);
  let score = Math.round(base * (1 - LESSON_W) + (wing.score + drift.score + align.score + wheel.score) / 4 * LESSON_W);
  const keepD = result.grade === 'D' && result.reason;
  const reasons = [];
  if (off > ALIGN_DEG) { reasons.push(`Touched down crabbed, the nose ${off.toFixed(0)}° off the runway: the wheels landed sideways. Best grade B.`); score = Math.min(score, CAP_B); }
  if (t.first === 'both') reasons.push(`Both mains together: keep the ${w} wing down through the flare.`);
  else if (t.first === 'downwind') reasons.push(`The ${o} (downwind) wheel touched first.`);
  if (t.bankIntoDeg < WING_MIN_DEG) reasons.push(t.bankIntoDeg < -WING_MIN_DEG ? `The ${o} wing was down, away from the wind.` : `Wings level at touchdown: the ${w} wing holds the line.`);
  if (dk > DRIFT_SAY_KTS && off <= ALIGN_DEG) reasons.push(`Drifting ${dk.toFixed(1)} kt ${t.driftUpKts > 0 ? `${w}, into the wind: a little less ${w} wing` : `${o}, with the wind: a little more ${w} wing`}.`);
  if (result.reason) reasons.push(result.reason);
  return {
    ...result,
    factors: [...rows, ...rest.map((f) => (f.key === 'flare' ? flare : f))],
    score,
    grade: keepD ? 'D' : letterGrade(score),
    reason: reasons.join(' ') || null,
    wingLow: true, // results.js: the note shows beside the gate's verdict; landingTip.js: the lesson's own tip
    note: reasons.length ? result.note ?? null : DONE_NOTE,
    tip: keepD ? null : wingLowTip(t, wl.side),
  };
}

// The card's "Next time" line: the lesson's own fix, in its order: the crab, the wing, the wheel. null when all three held.
export function wingLowTip(t, side) {
  const w = SIDES[side], o = SIDES[OTHER[side]];
  if (Math.abs(t.noseOffDeg) > ALIGN_DEG) return `${t.noseOffDeg > 0 ? 'Left' : 'Right'} rudder to point the nose down the runway before the wheels touch, and lower the ${w} wing to stop the drift.`;
  if (t.bankIntoDeg < WING_MIN_DEG) return `Keep the ${w} wing down all the way to touchdown, with ${o} rudder holding the nose straight.`;
  if (t.driftUpKts < -DRIFT_SAY_KTS) return `Drifting ${o} at touchdown: a little more ${w} wing in the flare, just enough to stop the drift.`;
  if (t.driftUpKts > DRIFT_SAY_KTS) return `Drifting ${w} at touchdown: a little less ${w} wing, just enough to stop the drift.`;
  if (t.first !== 'upwind') return `A little more ${w} wing in the flare: the ${w} wheel touches first.`;
  return null;
}
