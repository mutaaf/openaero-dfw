// Microburst windshear drill (ticket 0112): the 737 on a 3 NM final to DFW 35C flies into a
// microburst at 600 ft. First the outflow's headwind (the airspeed jumps: the trap is to take
// the power off), then the headwind dies into a tailwind with the downdraft in the core, and the
// airplane sinks. Delta 191, an L-1011 on the final to DFW 17L, was lost this way on 2 August
// 1985 (NTSB AAR-86/05); the escape taught since is the FAA-Boeing Windshear Training Aid's
// (1987; FAA AC 00-54, Pilot Windshear Guide, 1988): maximum thrust, wings level, rotate to
// ~15° nose up and hold it (less at the stick shaker), don't pitch down to chase the lost
// airspeed, and leave the gear and flaps where they are until out of it. Pure: no THREE, no DOM.
// Tested in tests/unit/windshear.test.js and flown headless in tests/flight/windshear.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK } from './coach.js';
import { stallAoaDeg } from './aero.js';
import { runwayEnd } from './airports.js';
import { M_TO_FT } from './constants.js';

export const SHEAR_KEY = 'kdfw_35c_windshear';
export const SHEAR_END = runwayEnd('KDFW', '35C');
// The encounter starts when the wheels come down through this height on the final.
export const SHEAR_START_FT = 600;
// The shear, s seconds into it: the outflow's headwind builds 15 kt, then falls 35 kt in ~15 s to
// a 20 kt tailwind (AC 00-54: an outflow can shear 45 kt and more across a microburst's ~2.5
// miles), held through the core, then the airplane flies out of it. The downdraft builds as the
// headwind goes, to 1,500 fpm (AC 00-54, AIM 7-1-24: microburst downdrafts reach 6,000 fpm; this
// one is flyable at full thrust and fatal without it), and is gone by the far side.
// Piecewise linear: [s, headwind kt (+ on the nose), downdraft fpm (+ down)].
export const SHEAR_PROFILE = [
  [0, 0, 0], [5, 15, 0], [10, 0, 900], [14, -15, 1500], [20, -20, 1500], [30, -20, 1500], [38, -10, 0], [46, 0, 0],
];
export const SHEAR_END_S = 46;
// The warning (a reactive windshear alert like the 737's GPWS mode 7) comes as the headwind's
// fall and the downdraft first add up to a hazard.
export const SHEAR_WARN_S = 7;
// Max thrust: the levers this far forward. The training aid's 15° target (12° counts as there),
// and the nose's floor: below 5° (an approach is flown at ~2° on the 737) it is chasing speed.
export const SHEAR_MAX_THROTTLE = 0.95;
export const SHEAR_TARGET_PITCH_DEG = 15;
export const SHEAR_PITCHED_DEG = 12;
export const SHEAR_CHASE_PITCH_DEG = 5;
// Diving for speed: the nose this far below where it was at the warning (an escape only raises it).
export const SHEAR_DIVE_DEG = 2;
// The nose's lowest (held up through the sink?) counts from this long after the warning, or
// after full power if that came later (no power yet: from both): a 737 rotates ~2.5°/s, so a
// pull-up with the power is at 15° by then (a late reaction is the reaction factor's).
export const SHEAR_PITCH_FROM_S = 6;
export const SHEAR_ROTATE_S = 5;
// The stick shaker: this close to the stall angle (stallDrill.js's 3°: 5 kt above the stall).
export const SHAKER_MARGIN_DEG = 3;
// Out of it: past the shear, climbing at least this fast and this high.
export const SHEAR_CLEAR_FPM = 300;
export const SHEAR_CLEAR_FT = 500;
// Not out of it this long after the shear's end: failed.
export const SHEAR_FAIL_S = 40;
const FAIL_CAP = 54; // the top of a D
const CHASE_CAP = 69; // the top of a C

// Headwind (kt) and downdraft (fpm, + down) at s seconds into the encounter.
// out: { headKts, downFpm } is filled (no allocation) and returned.
export function shearAt(s, out = { headKts: 0, downFpm: 0 }) {
  const p = SHEAR_PROFILE;
  out.headKts = 0; out.downFpm = 0;
  if (!(s > 0) || s >= SHEAR_END_S) return out;
  let i = 1;
  while (p[i][0] < s) i++;
  const a = p[i - 1], b = p[i], f = (s - a[0]) / (b[0] - a[0]);
  out.headKts = a[1] + (b[1] - a[1]) * f;
  out.downFpm = a[2] + (b[2] - a[2]) * f;
  return out;
}

export const SHEAR_TEXT = {
  wsGain: 'Speed jumping? Keep the power: it can be windshear',
  wsMax: 'WINDSHEAR! Full power: throttle to the top',
  wsPitch: 'Pull up to 15° nose up and hold it',
  wsHold: 'Hold the nose up: don\'t dive for speed',
  wsShaker: 'Stick shaker: ease off a little, keep the nose up',
  wsLevel: 'Wings level',
  wsClear: 'Climbing out of it: hold full power',
  wsKid: 'Windshear! Let go: the plane climbs out for you',
};
Object.assign(DRILL_TEXT, SHEAR_TEXT);
// Each escape step replaces the last at once (a higher rank interrupts; coach.js).
Object.assign(RANK, { wsGain: 2, wsClear: 4, wsMax: 5, wsKid: 5, wsPitch: 6, wsLevel: 6, wsHold: 7, wsShaker: 8 });

// phase: 'final' (above the start), 'shear' (in it, no warning yet), 'warning' (the escape),
// 'clear' (out of it: graded), 'failed' (the ground, or not out in time: graded).
// dirX, dirZ: the runway's course (the headwind blows against it).
export const createShear = (dirX = 0, dirZ = -1) => ({
  phase: 'final', dirX, dirZ, t0: 0, warnT: 0, startFt: 0, lowFt: Infinity, maxS: null, pitchS: null,
  minPitchDeg: Infinity, warnPitchDeg: 0, diveDeg: 0, peakBankDeg: 0, shakerS: 0, stalled: false, ground: false, config: null, configChanged: false,
});

export const shearLive = (st) => st.phase === 'final' || st.phase === 'shear' || st.phase === 'warning';

// One step. st is mutated (no allocation). s: { t, dt, aglFt (the wheels), vsFpm, pitchDeg,
// bankDeg, throttle, aoaDeg, stallAoaDeg, onGround, config (gear and flaps as one number) }.
// Returns 'start' | 'warning' | 'clear' | 'failed' on the step it happens, else ''.
export function stepShear(st, s) {
  if (st.phase === 'final') {
    if (s.onGround || s.aglFt > SHEAR_START_FT) return '';
    st.phase = 'shear'; st.t0 = s.t; st.startFt = s.aglFt; st.lowFt = s.aglFt;
    return 'start';
  }
  if (!shearLive(st)) return '';
  if (s.aglFt < st.lowFt) st.lowFt = s.aglFt;
  if (s.onGround) { st.ground = true; st.phase = 'failed'; return 'failed'; }
  const ts = s.t - st.t0;
  let ev = '';
  if (st.phase === 'shear') {
    if (ts < SHEAR_WARN_S) return '';
    st.phase = 'warning'; st.warnT = s.t; st.config = s.config; st.warnPitchDeg = s.pitchDeg; ev = 'warning';
  }
  const since = s.t - st.warnT;
  if (st.maxS === null && s.throttle >= SHEAR_MAX_THROTTLE) st.maxS = since;
  if (st.pitchS === null && s.pitchDeg >= SHEAR_PITCHED_DEG) st.pitchS = since;
  const from = st.maxS === null ? SHEAR_PITCH_FROM_S + SHEAR_ROTATE_S : Math.max(SHEAR_PITCH_FROM_S, st.maxS + SHEAR_ROTATE_S);
  if (ts < SHEAR_END_S) {
    if (since >= from && s.pitchDeg < st.minPitchDeg) st.minPitchDeg = s.pitchDeg;
    if (st.warnPitchDeg - s.pitchDeg > st.diveDeg) st.diveDeg = st.warnPitchDeg - s.pitchDeg;
  }
  const bank = Math.abs(s.bankDeg);
  if (bank > st.peakBankDeg) st.peakBankDeg = bank;
  if (s.aoaDeg > s.stallAoaDeg - SHAKER_MARGIN_DEG) st.shakerS += s.dt;
  if (s.aoaDeg > s.stallAoaDeg) st.stalled = true;
  if (s.config !== st.config && ts < SHEAR_END_S) st.configChanged = true;
  if (ts >= SHEAR_END_S && s.vsFpm >= SHEAR_CLEAR_FPM && s.aglFt >= SHEAR_CLEAR_FT) { st.phase = 'clear'; return 'clear'; }
  if (ts >= SHEAR_END_S + SHEAR_FAIL_S) { st.phase = 'failed'; return 'failed'; }
  return ev;
}

// The coach, step by step. s: { throttle, pitchDeg, bankDeg, aoaDeg, stallAoaDeg, vsFpm, kid }.
// Nothing on the final above the shear (the landing coach has it) or once graded.
export function shearTarget(st, s) {
  if (st.phase === 'shear') return s.kid ? null : 'wsGain';
  if (st.phase !== 'warning') return null;
  if (s.kid) return 'wsKid';
  if (s.throttle < SHEAR_MAX_THROTTLE) return 'wsMax';
  if (s.aoaDeg > s.stallAoaDeg - SHAKER_MARGIN_DEG) return 'wsShaker';
  if (Math.abs(s.bankDeg) > 10) return 'wsLevel';
  if (s.pitchDeg < SHEAR_PITCHED_DEG) return st.pitchS === null ? 'wsPitch' : 'wsHold';
  return s.vsFpm > SHEAR_CLEAR_FPM ? 'wsClear' : 'wsHold';
}

const REASONS = {
  ground: 'Flew into the ground: full power and 15° nose up the moment the warning comes.',
  notOut: 'Never climbed out of it: full power and hold the nose up.',
  stall: 'Stalled: hold the nose just under the stick shaker, not past it. Capped at D.',
  chase: 'Kept the nose low in the shear: hold 15° and don\'t chase the airspeed, it costs height. Capped at C.',
  config: 'Moved the gear or flaps in the shear: leave them until you are out of it. Capped at C.',
  reaction: 'Full power the moment WINDSHEAR sounds: every second costs height.',
  pitch: 'Pull up to 15° nose up promptly and hold it.',
  hold: 'Hold the nose up through the sink; the airspeed comes back with the climb.',
  height: 'Full power and the pull-up sooner, and less height is lost.',
  shaker: 'Ease the nose down only enough to quiet the stick shaker.',
};
const WEIGHTS = { reaction: 0.3, pitch: 0.15, hold: 0.2, height: 0.25, shaker: 0.1 };

// The grade, once the drill has ended. kid: Kid level flew the escape.
export function gradeShear(st, kid = false) {
  const lostFt = Math.max(0, st.startFt - st.lowFt);
  const minPitch = st.minPitchDeg === Infinity ? null : st.minPitchDeg;
  const factors = [
    { key: 'reaction', label: 'Warning to full power', value: kid ? 'the plane did it' : st.maxS === null ? 'never' : `${st.maxS.toFixed(1)} s`,
      score: kid ? 100 : st.maxS === null ? 0 : curve(st.maxS, [[1, 100], [2, 85], [4, 40], [7, 0]]) },
    { key: 'pitch', label: 'Warning to 12° nose up', value: st.pitchS === null ? 'never' : `${st.pitchS.toFixed(1)} s`,
      score: st.pitchS === null ? 0 : curve(st.pitchS, [[4, 100], [6, 75], [10, 30], [14, 0]]) },
    { key: 'hold', label: 'Lowest nose in the shear', value: minPitch === null ? '–' : `${Math.round(minPitch)}°`,
      score: minPitch === null ? 0 : curve(minPitch, [[-3, 0], [0, 10], [SHEAR_CHASE_PITCH_DEG, 40], [8, 75], [12, 100]]) },
    { key: 'height', label: 'Height lost', value: `${Math.round(lostFt)} ft of ${Math.round(st.startFt)}`,
      score: curve(lostFt, [[200, 100], [300, 75], [450, 30], [550, 0]]) },
    { key: 'shaker', label: 'Stick shaker', value: `${st.shakerS.toFixed(1)} s`,
      score: curve(st.shakerS, [[1, 100], [3, 60], [6, 0]]) },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = null;
  const failed = st.phase === 'failed';
  if (st.ground) { score = 0; reason = REASONS.ground; }
  else if (failed) { score = Math.min(score, FAIL_CAP); reason = REASONS.notOut; }
  else if (st.stalled) { score = Math.min(score, FAIL_CAP); reason = REASONS.stall; }
  else if (st.diveDeg > SHEAR_DIVE_DEG || (minPitch !== null && minPitch < SHEAR_CHASE_PITCH_DEG)) { score = Math.min(score, CHASE_CAP); reason = REASONS.chase; }
  else if (st.configChanged && !kid) { score = Math.min(score, CHASE_CAP); reason = REASONS.config; }
  else if (score < 85) reason = REASONS[factors.reduce((a, f) => (f.score < a.score ? f : a)).key];
  return {
    kind: 'windshear', title: failed ? 'Windshear: not out of it' : 'Windshear escape', grade: st.ground ? 'CRASH' : letterGrade(score), score, factors, reason,
    note: !failed && kid ? 'Kid level: the plane flew the escape for you' : null,
  };
}

// main.js's calls, with the input built from the sim here (reused; the chunk, not boot, pays).
const _in = { t: 0, dt: 0, aglFt: 0, vsFpm: 0, pitchDeg: 0, bankDeg: 0, throttle: 0, aoaDeg: 0, stallAoaDeg: 0, onGround: false, config: 0, kid: false };
const _sh = { headKts: 0, downFpm: 0 };
const D = Math.PI / 180;
function input(sim, dt) {
  const q = sim.quat;
  _in.t = sim.simTime; _in.dt = dt;
  _in.aglFt = (sim.pos.y - sim.groundY - sim.spec.gearHeight) * M_TO_FT;
  _in.vsFpm = sim.vsiFpm; _in.throttle = sim.throttle; _in.onGround = sim.onGround;
  // Pitch and bank (right +) from the quaternion, as three's 'YXZ' Euler reads them.
  _in.pitchDeg = Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.x - q.y * q.z)))) / D;
  _in.bankDeg = -Math.atan2(2 * (q.x * q.y + q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z)) / D;
  _in.aoaDeg = sim.aoaDeg; _in.stallAoaDeg = stallAoaDeg(sim.spec, sim.flapsIndex);
  _in.config = sim.flapsIndex * 2 + (sim.gearDown ? 1 : 0);
  _in.kid = sim.assist === 'kid';
  return _in;
}
export const shearStep = (st, sim, dt) => stepShear(st, input(sim, dt));
export const shearPrompt = (st, sim) => shearTarget(st, input(sim, 0));
// The microburst's air on top of the METAR's (main.js updateWind, every sub-step): the headwind
// against the runway's course, the downdraft down.
export function addShearWind(st, sim) {
  if (st.phase !== 'shear' && st.phase !== 'warning') return;
  shearAt(sim.simTime - st.t0, _sh);
  const w = _sh.headKts * 0.514444;
  sim.windVec.x -= st.dirX * w;
  sim.windVec.z -= st.dirZ * w;
  sim.windVec.y = -_sh.downFpm * 0.3048 / 60;
}
// Kid: full power and the climb guide from the warning until out of it (main.js applyAssists).
export const kidEscape = (st) => st.phase === 'warning';
