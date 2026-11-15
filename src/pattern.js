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

// --- Joining the pattern (ticket 0187): the 45° entry to the downwind. AC 90-66C (6/6/23) §11.3,
// p. 15: "Arriving aircraft should be at traffic pattern altitude ... Entries into traffic patterns
// while descending may create collision hazards and should be avoided. Entry to the downwind leg
// should be at a 45-degree angle abeam the midpoint of the runway"; Appendix A, key item 1: "Enter
// pattern in level flight, abeam the midpoint of the runway, at pattern altitude." The entry leg
// converges on the downwind from outside it, so the turn onto downwind is the other way from the
// pattern's turns (a right turn into a left pattern: FAA Chief Counsel, Gossman interpretation,
// 2011, on AIM 4-3-3). Only the 45° entry is taught (the midfield crossing is out of scope).
export const ENTRY_KEY = 'pattern_entry_kads';
export const PTE_ANGLE_DEG = 45;
export const PTE_ANGLE_TOL_DEG = 20; // the card's band on the entry angle
export const PTE_ALT_TOL_FT = 100; // the card's band on the height at the join
// The game's speed band at the join (no source gives a Cessna pattern-entry speed: this is the
// cruise-descent range a 172 enters at, well clear of its 48 kt clean stall).
export const PTE_MIN_KTS = 70;
export const PTE_MAX_KTS = 100;
export const PTE_CAP_B = 84;
export const PTE_CAP_C = 69;
const ENTRY_NEAR_M = 2778; // 1.5 NM from the join point: on the 45°, not still arriving
const ANGLE_SAMPLE_M = 400; // the entry angle is read this far outside the downwind line, before the turn
const COS45 = Math.cos(Math.PI / 4);
const TURNS_E = {
  pteJoin: 'Join: turn {side} onto downwind, the runway on your {other}',
  pteOff: 'Off the 45°: turn {side}, toward the middle of the runway',
};
Object.assign(PT_TEXT, {
  pteIn: 'Level at 1,000 ft: fly toward the middle of the runway, 45° to the downwind',
  pte45: 'On the 45°: hold 1,000 ft, level. The turn onto downwind is next',
});
const KEYS_EL = {}, KEYS_ER = {};
for (const [k, w] of Object.entries(TURNS_E)) {
  PT_TEXT[KEYS_EL[k] = `${k}L`] = w.replace('{side}', 'left').replace('{other}', 'right');
  PT_TEXT[KEYS_ER[k] = `${k}R`] = w.replace('{side}', 'right').replace('{other}', 'left');
}
Object.assign(DRILL_TEXT, PT_TEXT);

// Where the entry is: the join point (the downwind line abeam the runway's midpoint) and the
// 45° line to it. s: patternLeg's input. Into a reused object: { phase: 'inbound' | 'entry45' |
// 'downwind' | 'base' | 'final' | 'inside', turn (cue the turn onto downwind now), entryHdgT,
// downwindHdgT, distM (to the join point), outsideM (beyond the downwind line, away from the
// runway; < 0 inside it), offLineM (right of the 45° line), angleDeg (track off the downwind) }.
// 'downwind': established on it (tracking within 20°, 1/4 to 1 1/8 NM out). 'base' / 'final':
// joined straight in instead. 'inside': across the downwind line toward the runway, not joined.
const _eg = { phase: 'inbound', turn: false, entryHdgT: 0, downwindHdgT: 0, distM: 0, outsideM: 0, offLineM: 0, angleDeg: 0 };
export function entryLeg(end, s, traffic = 'left', out = _eg) {
  const r = end.hdgT * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r);
  const along = (s.x - end.thrX) * dx + (s.z - end.thrZ) * dz;
  const cross = (s.x - end.thrX) * -dz + (s.z - end.thrZ) * dx;
  const turn = traffic === 'right' ? 1 : -1;
  const side = cross * turn;
  const dw = wrap360(end.hdgT + 180), eh = wrap360(dw + PTE_ANGLE_DEG * turn);
  const jAlong = end.lengthM / 2 - end.displacedM; // the runway's midpoint (along is from the landing threshold)
  const dA = along - jAlong, dS = side - C_M;
  out.entryHdgT = eh; out.downwindHdgT = dw; out.turn = false;
  out.distM = Math.hypot(dA, dS); out.outsideM = dS;
  // Right of the 45° line through the join point (course eh): that line in runway axes.
  // In runway axes (along, right) the course is (cos θ, sin θ), its right (−sin θ, cos θ); right = side·turn.
  const er = (eh - end.hdgT) * Math.PI / 180;
  out.offLineM = dS * turn * Math.cos(er) - dA * Math.sin(er);
  const rel = headingError(s.trackDeg, dw);
  out.angleDeg = Math.abs(rel);
  const gs = s.gsMps ?? 46;
  if (Math.abs(rel) <= 20 && side >= SIDE_MIN_M && side <= 1.5 * C_M) out.phase = 'downwind';
  else {
    const g = patternLeg(end, s, traffic);
    if (g.leg === 'base' && along <= 0 && side <= 2 * C_M && !g.offSide) out.phase = 'base';
    else if (g.leg === 'final' && along > -3 * 1852) out.phase = 'final';
    else if (side < C_M / 2 && along > -1852 && along < end.lengthM) out.phase = 'inside';
    else {
      const onLine = Math.abs(out.offLineM) <= Math.max(150, out.distM * Math.tan(30 * Math.PI / 180))
        && Math.abs(headingError(s.trackDeg, eh)) <= 30 && dS > -150;
      out.phase = onLine && out.distM <= ENTRY_NEAR_M ? 'entry45' : 'inbound';
      // The turn onto downwind: a 20° bank's 45° of turn needs r(1 - cos 45°) to come round.
      const lead = leadM(gs) * (1 - COS45) + gs * (s.leadS ?? 0) * Math.sin(Math.PI / 4);
      out.turn = dS > -150 && dS <= lead && Math.abs(dA) < 1852 && Math.abs(rel) < 90;
    }
  }
  return out;
}

// The coach's key while joining (null once joined: patternTarget has it). s: patternTarget's input.
export function entryTarget(end, s) {
  const g = entryLeg(end, s, s.traffic);
  if (g.phase === 'downwind' || g.phase === 'base' || g.phase === 'final' || g.phase === 'inside') return null;
  if (s.kid) return 'ptKid';
  if (s.iasKts < s.slowKts) return 'ptSlow';
  const k = s.traffic === 'right' ? KEYS_EL : KEYS_ER; // the join turns against the pattern's turns
  if (g.turn) return k.pteJoin;
  // The card's ±100 ft (tighter than the circuit's 150): told before it costs the grade.
  if (s.aglFt < PT_TPA_FT - PTE_ALT_TOL_FT) return 'ptClimb';
  if (s.aglFt > PT_TPA_FT + PTE_ALT_TOL_FT) return 'ptDescend';
  // Close in and off the 45° line (300 m, inside the ±30° the phase allows), say which way it is.
  if (g.distM <= ENTRY_NEAR_M && Math.abs(g.offLineM) > 300) return (g.offLineM > 0 ? KEYS_EL : KEYS_ER).pteOff; // right of it: turn left
  return g.phase === 'entry45' ? 'pte45' : 'pteIn';
}

// main.js runs this every frame on the entry mission (sim.pattern.ent): how the join was flown.
export function entryStep(st, sim) {
  const e = st.ent;
  if (!e || e.done || !ours(st, sim)) return;
  const s = input(st, sim);
  s.leadS = 0;
  const g = entryLeg(st.end, s, st.traffic);
  if (g.phase === 'downwind' || g.phase === 'base' || g.phase === 'final' || g.phase === 'inside') {
    e.done = g.phase; e.joinFt = s.aglFt; e.joinKts = s.iasKts;
    return;
  }
  if (g.distM <= ENTRY_NEAR_M) { e.minFt = Math.min(e.minFt, s.aglFt); e.maxFt = Math.max(e.maxFt, s.aglFt); }
  if (e.angleDeg === null && g.outsideM <= ANGLE_SAMPLE_M && g.outsideM > -150 && g.distM <= ENTRY_NEAR_M) e.angleDeg = g.angleDeg;
}
export const createEntry = () => ({ done: null, joinFt: null, joinKts: null, angleDeg: null, minFt: Infinity, maxFt: -Infinity });

// The landing card with the join on it (main.js after gradeLanding): the misses capped and named.
export function entryResult(result, st) {
  const e = st.ent;
  if (!e || result.grade === 'CRASH') return result;
  const caps = [];
  let cap = 100;
  const ft = (v) => Math.round(v).toLocaleString('en-US');
  if (e.done !== 'downwind') {
    cap = PTE_CAP_C;
    caps.push(e.done === 'base' || e.done === 'final'
      ? `Joined straight in on ${e.done}, not on the downwind: fly the 45° entry to the downwind's middle. Best grade C.`
      : 'Never joined the downwind: fly the 45° entry to its middle at 1,000 ft. Best grade C.');
  } else {
    if (e.angleDeg === null) caps.push('Joined the downwind from the runway side, not on the 45° from outside: best grade B.');
    else if (Math.abs(e.angleDeg - PTE_ANGLE_DEG) > PTE_ANGLE_TOL_DEG) caps.push(`Joined the downwind at ${Math.round(e.angleDeg)}°, not 45° (±${PTE_ANGLE_TOL_DEG}°): best grade B.`);
    const off = e.joinFt - PT_TPA_FT;
    if (Math.abs(off) > PTE_ALT_TOL_FT) caps.push(`Joined the downwind ${ft(Math.abs(off))} ft ${off > 0 ? 'high' : 'low'}: be at 1,000 ft before the 45°. Best grade B.`);
    else if (e.maxFt > PT_TPA_FT + PTE_ALT_TOL_FT + 50) caps.push(`Came down through the 45° entry from ${ft(e.maxFt)} ft: be level at 1,000 ft before it (descending entries risk a collision). Best grade B.`);
    if (e.joinKts < PTE_MIN_KTS || e.joinKts > PTE_MAX_KTS) caps.push(`Joined at ${Math.round(e.joinKts)} knots: the pattern's band here is ${PTE_MIN_KTS}-${PTE_MAX_KTS}. Best grade B.`);
    if (caps.length) cap = PTE_CAP_B;
  }
  const keepD = result.grade === 'D' && result.reason;
  const score = Math.min(result.score, cap);
  return {
    ...result,
    score,
    grade: keepD ? 'D' : letterGradeOf(score),
    reason: [...caps, result.reason].filter(Boolean).join(' ') || null,
    entry: true, // results.js: the note shows beside the gate's verdict
    note: caps.length || keepD ? result.note ?? null : 'Joined on the 45° at 1,000 ft',
  };
}
// landing.js letterGrade (its bands), inlined: importing landing.js into this lazy chunk would grow the boot chunk's exports.
const letterGradeOf = (score) => (score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D');

// main.js's state for the mission: the runway end and the traffic direction.
// Its words and guide are the mission airframe's (flaps 10/20, 70 knots, a 0.75 NM circuit):
// another one picked mid-mission (the aircraft selector) gets neither.
// The entry mission (0187) also carries `ent` (createEntry): until it is done, the join's coach and guide fly.
export const createPattern = (mission) => ({ end: runwayEnd(mission.airport, mission.rwy), traffic: mission.traffic ?? 'left', aircraft: mission.aircraft, ent: mission.entry ? createEntry() : null });
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
  return st.ent && !st.ent.done ? entryTarget(st.end, s) : patternTarget(st.end, s);
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
  if (st.ent && !st.ent.done) return kidEntryGuide(st, s, out);
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

// Kid's guide on the join (0187): along the 45° line at 1,000 ft, then onto the downwind line where
// the coach calls the turn.
function kidEntryGuide(st, s, out) {
  const g = entryLeg(st.end, s, st.traffic);
  if (g.turn || g.phase !== 'inbound' && g.phase !== 'entry45') {
    const sideM = (st.traffic === 'right' ? 1 : -1) * C_M;
    const r = st.end.hdgT * Math.PI / 180;
    const cross = (s.x - st.end.thrX) * Math.cos(r) + (s.z - st.end.thrZ) * Math.sin(r);
    out.guideBankDeg = kidLocalizerBankDeg(g.downwindHdgT, s.trackDeg, sideM - cross);
  } else out.guideBankDeg = kidLocalizerBankDeg(g.entryHdgT, s.trackDeg, g.offLineM);
  out.guideGammaDeg = Math.max(-3, Math.min(CLIMB_GAMMA_DEG, (PT_TPA_FT - s.aglFt) * 0.02));
  return out;
}
