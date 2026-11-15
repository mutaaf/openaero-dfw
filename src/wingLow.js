// Wing-low crosswind landing lesson (ticket 0188): the Cessna on a 2 NM final to Addison 16 with the wind across the
// runway, coached and graded the Airplane Flying Handbook's way. Source, read 2026-11-15 (the PDF, pdftotext):
//  - FAA-H-8083-3C ch. 9, "Crosswind Approach and Landing", pp. 9-15 to 9-17: "There are two usual methods ... the crab
//    method and the wing-low (sideslip) method ... The wing-low method is recommended in most cases ... While current
//    testing standards allow for either method, pilots should learn to do both." "To use the wing-low method, the pilot
//    first uses rudder to align and maintain the airplane's heading with the runway direction ... oppose it using
//    ailerons resulting in just enough bank to cancel the drift." Round out: "Keep the upwind wing down throughout the
//    round out." Touchdown: "the crosswind correction is maintained throughout the round out, and the initial touchdown
//    occurs on the upwind main wheel"; the crab "needs to be removed the instant before touchdown ... to avoid sideward
//    contact of the wheels with the runway".
//  - Cessna 172S POH (July 1998) p. 4-34, CROSSWIND LANDING: "use the minimum flap setting required for the field
//    length ... Although the crab or combination method of drift correction may be used, the wing low method gives the
//    best control ... Operation in direct crosswinds of 15 knots has been demonstrated." (Addison's 7,203 ft: flaps 10,
//    FLAPS below; the scenario wind and the live METAR's are kept within the 15 kt, which tests/flight/c172.test.js flies.)
// The game's tolerances (the ticket's, not the handbook's: it gives no numbers): bank at touchdown 2-8° into the wind,
// the nose within 3° of the runway. A crabbed touchdown caps B (the side load both methods avoid); both mains together,
// the downwind wheel first and a bank outside the band are named but cap nothing (the testing standards allow either
// method, and a crab taken out at the last moment lands on both). Kid keeps its de-crab assist (assists.js): its card
// shows the rows, unscored. A lazy chunk, loaded with the mission (main.js startDrills). Pure (no THREE, no DOM):
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
// The ticket's band: the bank at touchdown into the wind, and the nose within ALIGN_DEG of the runway.
export const BANK_LOW_DEG = 2;
export const BANK_HIGH_DEG = 8;
export const ALIGN_DEG = 3;
// The coach: the briefing held this long; the crab call below ALIGN_CALL_FT when the nose is this far off the runway.
export const SAY_S = 8;
export const ALIGN_CALL_FT = 300;
export const ALIGN_CALL_DEG = 5;
// "Hold it, upwind wheel first" from HOLD_FT down to the landing coach's idle and flare (30 ft).
export const HOLD_FT = 50;
export const CAP_B = 84;
// The lesson's three rows share this much of the score (Pilot and Learner): the landing's own factors keep the rest.
export const LESSON_W = 0.3;
const FLARE_W = 0.15; // landing.js WEIGHTS.flare, inlined: the lesson rescores that factor without its bank penalty

const SIDES = { R: 'right', L: 'left' };
const OTHER = { R: 'L', L: 'R' };
// The pedals' keys (keyMap.js Q/E) and the touch deck's buttons (index.html #touchRudder), named with the rudder.
const KEY = { R: 'E', L: 'Q' };
const BTN = { R: 'RUD ▶', L: '◀ RUD' };
export const WL_TEXT = {};
export const WL_TOUCH = {};
for (const s of ['R', 'L']) {
  const w = SIDES[s], o = SIDES[OTHER[s]];
  WL_TEXT[`wlBrief${s}`] = `Wind from the ${w}: lower the ${w} wing, ${o} rudder (${KEY[OTHER[s]]}) to hold the line`;
  WL_TOUCH[`wlBrief${s}`] = `Wind from the ${w}: lower the ${w} wing, ${o} rudder (${BTN[OTHER[s]]}) to hold the line`;
  WL_TEXT[`wlHold${s}`] = `Hold it: ${w} wing still down, ${w} wheel first`;
  WL_TEXT[`wlKid${s}`] = `Wind from the ${w}: let go, your plane lines itself up`;
  // The nose off the runway (n: which way it points): the pedal that lines it up, and the wing that holds the line.
  for (const n of ['R', 'L']) {
    const p = OTHER[n];
    WL_TEXT[`wlNose${n}${s}`] = `Nose ${SIDES[n]} of the runway: ${SIDES[p]} rudder (${KEY[p]}) to line it up, ${w} wing down`;
    WL_TOUCH[`wlNose${n}${s}`] = `Nose ${SIDES[n]} of the runway: ${SIDES[p]} rudder (${BTN[p]}) to line it up, ${w} wing down`;
  }
}
Object.assign(DRILL_TEXT, WL_TEXT);
Object.assign(TOUCH_WORDS, WL_TOUCH);
for (const k of Object.keys(WL_TEXT)) RANK[k] = k.startsWith('wlHold') ? 3 : k.startsWith('wlNose') ? 2 : 1;

const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
// The wind across and along a runway (kt): xw + = from the right, hw + = a headwind. wx: weather.js's windDirDeg (true), windKts.
export function windAcross(wx, hdgT) {
  if (!wx?.windKts || wx.windDirDeg == null) return { xw: 0, hw: 0 };
  const a = (wx.windDirDeg - hdgT) * DEG_TO_RAD;
  return { xw: wx.windKts * Math.sin(a), hw: wx.windKts * Math.cos(a) };
}
// Whether a live METAR makes the lesson (see MIN_XW_KTS). Pure.
export function liveSuits(wx, hdgT) {
  if (!wx?.live) return false;
  const { xw, hw } = windAcross(wx, hdgT);
  const gustXw = Math.max(wx.windKts, wx.gustKts ?? 0) * Math.abs(xw) / wx.windKts;
  return Math.abs(xw) >= MIN_XW_KTS && gustXw <= MAX_XW_KTS && hw >= -TAIL_OK_KTS;
}
// The scenario's weather: scenarioWeather's mild day with SCENARIO_KTS from 90° right of the runway (a METAR's tens).
export function scenarioWx(end) {
  const dir = (Math.round((end.hdgT + 90) / 10) * 10) % 360 || 360;
  const wx = scenarioWeather();
  return { ...wx, icao: end.airport, windDirDeg: dir, windKts: SCENARIO_KTS, gustKts: SCENARIO_KTS,
    raw: `SCENARIO ${end.airport} ${String(dir).padStart(3, '0')}${SCENARIO_KTS}KT 10SM FEW050 18/08 A3000` };
}

// end: the lesson's runway end (airports.js runwayEnd). Allocates (a mission load, not a frame).
export const createWingLow = (end) => ({
  end, t: 0, readyT: null, wx: null, src: null, side: 'R', xwKts: 0, td: null,
});

// The lesson's weather (main.js currentWeather while the lesson flies): the live report when it suits, else the scenario.
// Chosen again only when the report object changes, and never once the player is flying (a METAR refresh mid-final must
// not swap the wind under them). Sets wl.side (which wing goes down) and wl.xwKts. Allocates only on a change.
export function lessonWx(wl, live) {
  if (wl.wx && (wl.readyT !== null || live === wl.src)) return wl.wx;
  wl.src = live;
  wl.wx = liveSuits(live, wl.end.hdgT) ? live : scenarioWx(wl.end);
  const { xw } = windAcross(wl.wx, wl.end.hdgT);
  wl.side = xw >= 0 ? 'R' : 'L';
  wl.xwKts = Math.abs(xw);
  return wl.wx;
}

// Which main touched first. loads: [nose, left, right] (N, gear.js body.wheelLoads) or null (JSBSim reports none: the
// bank decides, the lower wing's wheel being the lower one). Returns 'upwind' | 'downwind' | 'both' | 'nose'.
export function firstMain(loads, side, bankIntoDeg) {
  if (!loads) return bankIntoDeg > 1 ? 'upwind' : bankIntoDeg < -1 ? 'downwind' : 'both';
  const l = loads[1] > 0, r = loads[2] > 0;
  if (l && r) return 'both';
  if (!l && !r) return 'nose';
  return (r ? 'R' : 'L') === side ? 'upwind' : 'downwind';
}

// One frame, once the player is flying (main.js: cockpitEntered, no modal). s: { aglFt (the wheels' height), onGround,
// bankRightDeg, noseHdgT (true), pitchDeg, loads (gear.js wheelLoads or null) }. Records the first touchdown's bank into the
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
  wl.td = { bankIntoDeg: bankInto, noseOffDeg: wrap180(s.noseHdgT - wl.end.hdgT), pitchDeg: s.pitchDeg, first: firstMain(s.loads, wl.side, bankInto) };
  return wl;
}

// The coach's key (through coach.js s.ds, before the landing coach's own), or null for the landing coach's (flaps,
// speed, centreline, PAPI, idle, flare, rollout). s: main.js coachInput (aglFt, kid) plus noseOffDeg (the nose against
// the runway, + = right). The briefing names the wing; under ALIGN_CALL_FT a nose off the runway is called; at HOLD_FT
// the upwind wheel; under 30 ft the landing coach's idle and flare (its de-crab call is the same advice).
export function wingLowPrompt(wl, s) {
  if (wl.readyT === null || wl.td) return null;
  if (s.kid) return wl.t - wl.readyT < SAY_S ? `wlKid${wl.side}` : null;
  if (s.aglFt < 30) return null;
  if (s.aglFt < HOLD_FT) return `wlHold${wl.side}`;
  if (wl.t - wl.readyT < SAY_S) return `wlBrief${wl.side}`;
  if (s.aglFt < ALIGN_CALL_FT && Math.abs(s.noseOffDeg) > ALIGN_CALL_DEG) return `wlNose${s.noseOffDeg > 0 ? 'R' : 'L'}${wl.side}`;
  return null;
}

const BANK_PTS = [[-2, 20], [0, 50], [BANK_LOW_DEG, 100], [BANK_HIGH_DEG, 100], [10, 60]];
const ALIGN_PTS = [[0, 100], [ALIGN_DEG, 100], [6, 60], [10, 20]];
const WHEEL_PTS = { upwind: 100, both: 70, downwind: 30, nose: 0 };
// landing.js gradeLanding's flare curve on the pitch alone; the bank's penalty only past the lesson's band.
const flareScore = (pitch, bank) => Math.max(0, (pitch < 0 ? 40 : curve(pitch, [[0, 70], [1, 100], [7, 100], [10, 60]])) - Math.max(0, bank - BANK_HIGH_DEG) * 8);
export const DONE_NOTE = 'Wing-low: upwind wheel first, the nose straight down the runway.';

// The landing's grade (landing.js gradeLanding) with the lesson's rows, at the touchdown (main.js checkTouchdown; a bounce
// caps it after, landing.js capBounced). Pilot and Learner: the flare factor loses its bank penalty inside the band (the
// lesson asks for the bank), the three rows take LESSON_W of the score, a crabbed touchdown caps B. Kid: the rows are
// shown, unscored. A crash or a D for the runway itself stays. Pure.
export function wingLowResult(result, wl, kid = false) {
  if (result.grade === 'CRASH' || !wl.td) return result;
  const t = wl.td, w = SIDES[wl.side], o = SIDES[OTHER[wl.side]];
  const bank = Math.abs(t.bankIntoDeg), off = Math.abs(t.noseOffDeg);
  const wing = { key: 'wing', label: 'Wing into the wind', value: `${bank.toFixed(1)}° ${t.bankIntoDeg >= 0 ? `${w} wing down` : `${o} wing down (away from the wind)`}`,
    score: Math.round(curve(t.bankIntoDeg, BANK_PTS)) };
  const align = { key: 'align', label: 'Nose on the runway', value: off < 0.5 ? 'straight' : `${off.toFixed(1)}° ${t.noseOffDeg > 0 ? 'right' : 'left'}`, score: Math.round(curve(off, ALIGN_PTS)) };
  const wheelWords = { upwind: `${w} (upwind) main`, downwind: `${o} (downwind) main`, both: 'both mains together', nose: 'the nose wheel' };
  const wheel = { key: 'wheel', label: 'First wheel down', value: wheelWords[t.first], score: WHEEL_PTS[t.first] };
  const rows = [wing, align, wheel];
  const rest = result.factors;
  if (kid) return { ...result, factors: [...rows, ...rest] }; // the landing's own tip (landingTip.js) and grade
  const oldFlare = rest.find((f) => f.key === 'flare');
  const flare = oldFlare && { ...oldFlare, score: Math.round(flareScore(t.pitchDeg, bank)) };
  const base = result.score + (flare ? (flare.score - oldFlare.score) * FLARE_W : 0);
  let score = Math.round(base * (1 - LESSON_W) + (wing.score + align.score + wheel.score) / 3 * LESSON_W);
  const keepD = result.grade === 'D' && result.reason;
  const reasons = [];
  if (off > ALIGN_DEG) { reasons.push(`Touched down crabbed, the nose ${off.toFixed(0)}° off the runway: the wheels landed sideways. Best grade B.`); score = Math.min(score, CAP_B); }
  if (t.first === 'both') reasons.push(`Both mains together: keep the ${w} wing down through the flare.`);
  else if (t.first === 'downwind') reasons.push(`The ${o} (downwind) wheel touched first.`);
  if (t.bankIntoDeg < BANK_LOW_DEG) reasons.push(`${bank.toFixed(1)}° of bank${t.bankIntoDeg < 0 ? ' away from the wind' : ''} at touchdown (${BANK_LOW_DEG}-${BANK_HIGH_DEG}° into it holds the line).`);
  else if (t.bankIntoDeg > BANK_HIGH_DEG) reasons.push(`${bank.toFixed(1)}° of bank at touchdown: more than the wind needed (${BANK_LOW_DEG}-${BANK_HIGH_DEG}°).`);
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
  if (t.bankIntoDeg < BANK_LOW_DEG) return `Keep the ${w} wing down all the way to touchdown, with ${o} rudder holding the nose straight.`;
  if (t.first !== 'upwind') return `A little more ${w} wing in the flare: the ${w} wheel touches first.`;
  if (t.bankIntoDeg > BANK_HIGH_DEG) return `Only as much ${w} wing as stops the drift: about ${BANK_LOW_DEG}-${BANK_HIGH_DEG}° in today's wind.`;
  return null;
}
