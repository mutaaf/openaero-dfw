// Traffic pattern at Addison (ticket 0048): the Cessna on a left downwind for 16 at 1,000 ft,
// abeam the field. Downwind, base, final, coached, and the landing graded as usual. The
// rectangular pattern is the FAA's: 1,000 ft above the field (AC 90-66C, 1,000 ft AGL
// recommended for piston airplanes), a downwind 1/2 to 1 mile out, power back and descending
// abeam the touchdown point, base when it is about 45° behind the wing (Airplane Flying
// Handbook, FAA-H-8083-3C, airport traffic patterns), crosswind past the departure end within
// 300 ft of pattern altitude (AC 90-66C), left turns unless charted otherwise. Pure: no THREE, no
// DOM. Tested in tests/unit/pattern.test.js and flown headless in tests/flight/pattern.test.js.
import { runwayEnd } from './airports.js';
import { bankCommandForHeading } from './autopilot.js';
import { kidLocalizerBankDeg } from './assists.js';
import { M_TO_FT } from './constants.js';
import { DRILL_TEXT } from './coach.js';

export const PATTERN_KEY = 'pattern_kads_16';
export const PT_TPA_FT = 1000;
export const PT_DOWNWIND_NM = 0.75;
const C_M = PT_DOWNWIND_NM * 1852;
// The descent from abeam the numbers: the path down the rest of the downwind, base and final
// (3 downwind spacings, base turned at 45°) loses the 1,000 ft, ~4.2°. At idle the Cessna
// glides ~7.6:1 (7.5°) with flaps 20 (measured, deadStick.js DS_RATIO_BY_FLAPS), so it is a
// power-on descent. On final the target is the 3° path to the aim point, as the PAPI, the
// landing coach and Kid's final guide fly it (~40 ft lower at the final turn).
export const PT_DESCENT_DEG = Math.atan(PT_TPA_FT / M_TO_FT / (3 * C_M)) * 180 / Math.PI;
const SLOPE = Math.tan(PT_DESCENT_DEG * Math.PI / 180);
// The coach's tolerances: off the pattern altitude, and off the descent's height.
export const PT_ALT_TOL_FT = 150;
export const PT_HIGH_FT = 200;
// Turns are cued one turn radius early: a 20° bank turn at the groundspeed.
const TURN_BANK_TAN = Math.tan(20 * Math.PI / 180);
const leadM = (gsMps) => (gsMps * gsMps) / (9.80665 * TURN_BANK_TAN);
// The downwind and base belong to the pattern's side: closer in than this on the downwind (or
// over the runway, or across on the other side), or past the centreline on base, is off it.
const SIDE_MIN_M = 463; // 0.25 NM
const BASE_PAST_M = 300;
const AIM_M = 305; // airports.js AIM_POINT_M: the 3° path touches down this far past the threshold
const TAN3 = Math.tan(3 * Math.PI / 180);

// Words with a side: {side} is the turn's direction (left traffic: left).
const TURNS = {
  ptTurnBase: 'Turn base: bank {side} now, the runway is behind your {side} shoulder',
  ptTurnFinal: 'Turn final: bank {side}, line up with the runway',
  ptTurnXw: 'Past the runway end: turn {side} onto crosswind',
  ptTurnDw: 'Turn {side} onto downwind, parallel to the runway',
  ptFar: 'Too far out: turn {side} now, back toward the runway',
  ptBack: 'Wrong way: turn {side} back onto the downwind',
  ptSide: 'Off the pattern: fly the downwind 3/4 mile out, the runway on your {side}',
};
export const PT_TEXT = {
  ptDownwind: 'Downwind: hold 1,000 ft above the field, parallel to the runway',
  ptClimb: 'Low: climb back to 1,000 ft above the field',
  ptDescend: 'High: ease down to 1,000 ft above the field',
  // Flaps 10, then 20: one press of F (one tap of FLAPS) each.
  ptAbeam: 'Abeam the numbers: throttle back a little, flaps to 10°, start down',
  ptBase: 'Base: flaps to 20°, slow to 70 knots, keep descending',
  ptEarly: 'Too early: turn back to the downwind and fly past the runway first',
  ptHigh: 'High: less power, steeper descent',
  ptLow: 'Low: add power, level off for a moment',
  ptSlow: 'Slow: lower the nose, add power',
  ptUpwind: 'Upwind: climb straight ahead to 1,000 ft',
  ptXw: 'Crosswind: climb to 1,000 ft, the downwind turn is next',
  ptKid: 'Let go: the plane flies the pattern for you',
};
// The keys by side, built once (patternTarget runs every frame: no string building there).
const KEYS_L = {}, KEYS_R = {};
for (const [k, w] of Object.entries(TURNS)) {
  PT_TEXT[KEYS_L[k] = `${k}L`] = w.replace('{side}', 'left');
  PT_TEXT[KEYS_R[k] = `${k}R`] = w.replace('{side}', 'right');
}
Object.assign(DRILL_TEXT, PT_TEXT);

const wrap360 = (d) => ((d % 360) + 360) % 360;
const headingError = (to, from) => ((to - from) % 360 + 540) % 360 - 180;
// coach.js COACH_MIN_HOLD_S (tests/unit/pattern.test.js pins it): a lazy chunk importing it would
// grow the boot chunk's exports.
export const PT_COACH_HOLD_S = 1.5;
const deg = (rad) => rad * 180 / Math.PI;

// Which leg of the pattern around `end` (an airports.js runway end, its landing direction) a
// position and track are on, the turn to start now (if any) and where to be. traffic: 'left'
// (the default) or 'right'. s: { x, z (sim m), trackDeg (true), aglFt, gsMps (optional),
// leadS (optional: cue the turns this much earlier, the coach's debounce) }.
// Into a reused object (main.js runs it every frame): { leg: 'upwind' | 'crosswind' |
// 'downwind' | 'base' | 'final', turn: null | 'crosswind' | 'downwind' | 'base' | 'final',
// along (m past the threshold, landing direction), cross (m right of the centreline),
// abeam (downwind, past abeam the threshold), offSide (downwind or base off the pattern's side
// of the runway: no turn cues there), targetHdgT (the leg's heading, or the next
// one's in a turn), targetAglFt (1,000 ft, or the descent's height from abeam the numbers) }.
const _g = { leg: 'downwind', turn: null, along: 0, cross: 0, abeam: false, offSide: false, targetHdgT: 0, targetAglFt: PT_TPA_FT };
export function patternLeg(end, s, traffic = 'left', out = _g) {
  const r = end.hdgT * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r);
  const along = (s.x - end.thrX) * dx + (s.z - end.thrZ) * dz;
  const cross = (s.x - end.thrX) * -dz + (s.z - end.thrZ) * dx;
  // turn: +1 = right turns (+90° each leg), -1 = left; the downwind is on that side, crossed.
  const turn = traffic === 'right' ? 1 : -1;
  const side = cross * turn; // + on the pattern's side of the runway
  const rel = headingError(s.trackDeg, end.hdgT); // the track off the landing direction
  const gs = s.gsMps ?? 36, early = gs * (s.leadS ?? 0);
  const lead = leadM(gs) + early;
  const farEnd = end.lengthM - end.displacedM;
  out.along = along; out.cross = cross; out.turn = null; out.abeam = false; out.offSide = false;
  if (Math.abs(rel) <= 45 && along < 0 && Math.abs(cross) < Math.max(300, -along / 2)
    || Math.abs(rel) <= 30 && along < farEnd && Math.abs(cross) < 150) {
    // Before the threshold heading for it (rolling out of the turn to final) inside a wide cone,
    // or over the runway. Outside it (a U-turn on the downwind) it is an 'upwind' the wrong way.
    out.leg = 'final';
    if (Math.abs(rel) > 20) out.turn = 'final';
  } else if (Math.abs(rel) <= 45) {
    out.leg = 'upwind';
    if (along + early > farEnd && s.aglFt > PT_TPA_FT - 300) out.turn = 'crosswind';
  } else if (Math.abs(rel) >= 135) {
    out.leg = 'downwind';
    out.abeam = along <= 0;
    out.offSide = side < SIDE_MIN_M;
    // Base when the threshold is 45° behind the wing: as far past abeam as the runway is out.
    if (out.abeam && !out.offSide && -along + early >= Math.abs(cross)) out.turn = 'base';
  } else if (rel * turn < 0) {
    // Flying toward the centreline from the pattern's side (left traffic: a heading of runway + 90°).
    out.leg = 'base';
    out.offSide = side < -BASE_PAST_M;
    if (side <= lead && along <= 0 && !out.offSide) out.turn = 'final';
  } else {
    out.leg = 'crosswind';
    if (side >= C_M - lead) out.turn = 'downwind';
  }
  const next = out.turn ?? out.leg;
  out.targetHdgT = wrap360(end.hdgT + (next === 'downwind' ? 180 : next === 'base' ? -90 * turn
    : next === 'crosswind' ? 90 * turn : 0));
  // Height: 1,000 ft until abeam the numbers, then a straight descent along what is left of
  // the pattern (the rest of the downwind to the 45° point, the base and the final).
  const a = Math.max(0, -along);
  const restM = out.leg === 'base' ? Math.abs(cross) + a
    : out.abeam ? Math.abs(cross) + Math.max(a, 2 * Math.abs(cross) - a) : Infinity;
  out.targetAglFt = out.leg === 'final' ? Math.max(0, AIM_M - along) * TAN3 * M_TO_FT
    : Math.min(PT_TPA_FT, restM * SLOPE * M_TO_FT);
  return out;
}

// The coach's prompt key for one moment (null on final: the landing coach, coach.js, has it).
// s: patternLeg's input plus iasKts, slowKts (Vref - 4: the Cessna's 58 kt, 5 over its clean
// stall warning), kid (Kid level: its guide flies), traffic.
export function patternTarget(end, s) {
  const g = patternLeg(end, s, s.traffic);
  if (g.leg === 'final' && !g.turn) return null;
  if (s.kid) return 'ptKid';
  if (s.iasKts < s.slowKts) return 'ptSlow';
  const k = s.traffic === 'right' ? KEYS_R : KEYS_L;
  const cross = Math.abs(g.cross);
  // Base turned before passing the runway (abeam its middle, say): no final from there.
  if (g.leg === 'base' && g.along > 0) return 'ptEarly';
  if (g.offSide) return k.ptSide;
  // Well below the descent, a turn cue left showing (no one turned) must not hide it.
  const climbing = g.leg === 'upwind' || g.leg === 'crosswind' || g.leg === 'downwind' && !g.abeam;
  if (!climbing && s.aglFt < g.targetAglFt - 2 * PT_ALT_TOL_FT) return 'ptLow';
  if (g.turn === 'base') return -g.along > 2 * cross + 2 * C_M ? k.ptFar : k.ptTurnBase;
  if (g.turn === 'final') return k.ptTurnFinal;
  if (g.turn === 'crosswind') return k.ptTurnXw;
  if (g.turn === 'downwind') return k.ptTurnDw;
  // Heading the landing way but out beside the field (a U-turn on the downwind): not an upwind.
  if (g.leg === 'upwind') return cross > 300 ? k.ptBack : 'ptUpwind';
  if (g.leg === 'crosswind') return 'ptXw';
  if (g.leg === 'downwind' && !g.abeam) {
    if (s.aglFt < PT_TPA_FT - PT_ALT_TOL_FT) return 'ptClimb';
    if (s.aglFt > PT_TPA_FT + PT_ALT_TOL_FT) return 'ptDescend';
    return 'ptDownwind';
  }
  if (s.aglFt > g.targetAglFt + PT_HIGH_FT) return 'ptHigh';
  if (s.aglFt < g.targetAglFt - PT_ALT_TOL_FT) return 'ptLow';
  return g.leg === 'base' ? 'ptBase' : 'ptAbeam';
}

// main.js's state for the mission: the runway end and the traffic direction.
// Its words and guide are the mission airframe's (flaps 10/20, 70 knots, a 0.75 NM circuit):
// another one picked mid-mission (the aircraft selector) gets neither.
export const createPattern = (mission) => ({ end: runwayEnd(mission.airport, mission.rwy), traffic: mission.traffic ?? 'left', aircraft: mission.aircraft });
const ours = (st, sim) => !st.aircraft || !sim.aircraftKey || sim.aircraftKey === st.aircraft;

// The input from the sim (reused: no allocation per frame).
const _in = { x: 0, z: 0, trackDeg: 0, aglFt: 0, gsMps: 0, leadS: 0, iasKts: 0, slowKts: 0, kid: false, traffic: 'left' };
function input(st, sim) {
  _in.x = sim.pos.x; _in.z = sim.pos.z;
  _in.trackDeg = wrap360(deg(Math.atan2(sim.vel.x, -sim.vel.z)));
  _in.aglFt = sim.aglFt; _in.gsMps = Math.max(20, Math.hypot(sim.vel.x, sim.vel.z));
  _in.iasKts = sim.iasKts; _in.slowKts = sim.spec.vrefKts - 4;
  _in.kid = sim.assist === 'kid'; _in.traffic = st.traffic;
  return _in;
}
// The coach's turn cues come PT_COACH_HOLD_S early: a new prompt of the same rank shows after
// holding that long (coach.js settle), so they show where the turn starts.
export function patternPrompt(st, sim) {
  if (!ours(st, sim)) return null;
  const s = input(st, sim);
  s.leadS = PT_COACH_HOLD_S;
  return patternTarget(st.end, s);
}

// Kid's hands-off guide (main.js applyAssists, out.guideBankDeg/guideGammaDeg): each leg's line
// or heading, the turns where the coach calls them, 1,000 ft, then the descent's height. On a
// final the game's own localizer and glidepath guide flies it once the runway is picked
// (sim.activeEnd); until then this one lines it up.
const CLIMB_GAMMA_DEG = 3; // a Cessna at ~90 kt climbs ~3-4° at full power
export function kidGuide(st, sim, out) {
  if (!ours(st, sim)) return out;
  const s = input(st, sim);
  s.leadS = 0;
  const g = patternLeg(st.end, s, st.traffic), e = st.end;
  if (g.leg === 'final' && !g.turn) {
    if (sim.activeEnd && g.along < 0) return out;
    // Until the runway is picked, and past the threshold: the 3° path to its aim point, as the
    // game's guide flies it (assists.js kidFinalGuide, which since 0098 also goes on past the
    // threshold), then the auto-flare lands it.
    out.guideBankDeg = kidLocalizerBankDeg(e.hdgT, s.trackDeg, g.cross);
    const aboveM = (s.aglFt - g.targetAglFt) / M_TO_FT;
    out.guideGammaDeg = Math.max(-6, Math.min(-0.5, -3 - aboveM * 0.12));
    return out;
  } else if (g.turn === 'final' || g.leg === 'upwind' && !g.turn) {
    out.guideBankDeg = kidLocalizerBankDeg(e.hdgT, s.trackDeg, g.cross);
  } else if (g.leg === 'downwind' && !g.turn) {
    // Along the downwind line (course runway + 180°, PT_DOWNWIND_NM to the pattern's side).
    const sideM = (st.traffic === 'right' ? 1 : -1) * C_M;
    out.guideBankDeg = kidLocalizerBankDeg(g.targetHdgT, s.trackDeg, sideM - g.cross);
  } else {
    out.guideBankDeg = bankCommandForHeading(headingError(g.targetHdgT, s.trackDeg));
  }
  const errFt = g.targetAglFt - s.aglFt;
  const descending = g.targetAglFt < PT_TPA_FT || g.leg === 'final';
  out.guideGammaDeg = descending ? Math.max(-7, Math.min(1, -PT_DESCENT_DEG + errFt * 0.02))
    : Math.max(-3, Math.min(CLIMB_GAMMA_DEG, errFt * 0.02));
  return out;
}
