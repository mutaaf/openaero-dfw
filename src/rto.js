// Rejected takeoff drill (ticket 0107): the 737 rolls down DFW 35C at full power and an engine
// fire warning comes below V1. Reject: thrust levers to idle, full brakes, reverse, stop on the
// runway. The FAA/industry Takeoff Safety Training Aid (1993; SKYbrary "Rejected Take-off"):
// below V1, a serious failure (a fire warning among them) is a reject; above it, go. The fire
// is a warning, not a lost engine: the engine keeps its thrust until the crew closes the levers
// (the model has one thrust lever for both engines, so there is no asymmetric thrust to fly).
// Pure: no THREE, no DOM. Tested in tests/unit/rto.test.js and flown headless in
// tests/flight/rto.test.js.
import { runwayEnd } from './airports.js';
import { curve, letterGrade } from './landing.js';
import { M_TO_FT } from './constants.js';
import { DRILL_TEXT, RANK } from './coach.js';

export const RTO_KEY = 'kdfw_35c_rto';
export const RTO_END = runwayEnd('KDFW', '35C');
// The fire comes at a speed drawn from this window (the 737's V1 is Vr - 3 = 132 kt, aero.js),
// so the drill can't be anticipated by the number.
export const RTO_MIN_KTS = 75;
export const RTO_MAX_KTS = 110;
// The reference stop: a 1 s reaction at the failure's speed, ~1.5 s more while the engines spool
// down and the brakes and ground spoilers build, then the 737's autobrake MAX deceleration
// (aircraft.js b738 systems.autobrake, 14 ft/s²): what a 1 s autobrake MAX stop measures in
// tests/flight/rto.test.js (within 10%). At it, full marks; manual maximum braking with
// reverse does better.
export const RTO_REACT_S = 1;
export const RTO_SPOOL_S = 1.5;
export const RTO_REF_DECEL_MPS2 = 14 * 0.3048;
// Ran off the runway: both mains past the edge (they are 2.9 m either side of the centreline).
const OFF_MARGIN_M = 3;
// Lifted off: the wheels this high (a rotation, not a bump).
const ROTATED_FT = 15;
const STOPPED_KTS = 1;
const FAIL_CAP = 54; // the top of a D

export const RTO_TEXT = {
  rtoRoll: 'Full power (throttle to the top), stop if a warning comes',
  rtoKidRoll: 'Push the throttle to the top, then let go',
  rtoIdle: 'ENGINE FIRE! Reject: thrust to idle now',
  rtoBrake: 'Full brakes: B, or tap BRAKES',
  rtoReverse: 'Reverse: R, or tap REV, then add power',
  rtoStow: 'Reverse to idle by 60 knots, hold the brakes',
  rtoStraight: 'Hold the brakes, keep it on the centreline',
  rtoKid: 'Fire! Let go: the plane stops itself',
};
Object.assign(DRILL_TEXT, RTO_TEXT);
// Each step of the reject replaces the last at once (a higher rank interrupts; coach.js).
Object.assign(RANK, { rtoRoll: 1, rtoKidRoll: 1, rtoIdle: 4, rtoKid: 4, rtoBrake: 5, rtoReverse: 6, rtoStraight: 7, rtoStow: 8 });

// rnd: a 0..1 draw for the fire's speed (Math.random in the game; a test passes its own).
export const createRto = (rnd = Math.random) => ({
  phase: 'armed', failKts: Math.round(RTO_MIN_KTS + rnd() * (RTO_MAX_KTS - RTO_MIN_KTS)),
  t0: 0, fireThrottle: 1, failGsKts: 0, failLeftM: 0, idleS: null, brakeS: null, maxCrossM: 0, stopM: 0, leftM: 0,
});

export const rtoDone = (st) => st.phase !== 'armed' && st.phase !== 'fire' && st.phase !== 'late';
export const rtoLive = (st) => st.phase === 'armed' || st.phase === 'fire';

// The reference stop distance (m) from a groundspeed (kt).
export function rtoRefStopM(gsKts) {
  const v = gsKts * 0.514444;
  return v * (RTO_REACT_S + RTO_SPOOL_S) + v * v / (2 * RTO_REF_DECEL_MPS2);
}

// One step. s: { t, onGround, wheelFt, iasKts, gsKts, throttle, reverserPos, braking, leftM
// (runway ahead of the aircraft), crossM, halfWidthM }. Returns 'fire' on the step the warning
// comes, the end phase ('stopped', 'overrun', 'off', 'rotated') on the step the drill ends, else ''.
export function stepRto(st, s) {
  if (st.phase === 'armed') {
    if (!s.onGround || s.iasKts < st.failKts) return '';
    // A chunk that loads well past the speed (or past V1) never fires late: no drill this roll.
    if (s.iasKts > st.failKts + 5) { st.phase = 'late'; return ''; }
    st.phase = 'fire'; st.t0 = s.t; st.fireThrottle = s.throttle; st.failGsKts = s.gsKts; st.failLeftM = s.leftM;
    return 'fire';
  }
  if (st.phase !== 'fire') return '';
  // The reaction: the levers coming back (a key winds them down at 40%/s: its first tenth
  // counts), or at idle (the reverse levers come from idle, main.js).
  if (st.idleS === null && (s.throttle < 0.05 || s.throttle < st.fireThrottle - 0.1)) st.idleS = s.t - st.t0;
  if (st.brakeS === null && s.braking) st.brakeS = s.t - st.t0;
  const cross = Math.abs(s.crossM);
  if (cross > st.maxCrossM) st.maxCrossM = cross;
  st.stopM = Math.max(0, st.failLeftM - s.leftM); st.leftM = s.leftM;
  if (!s.onGround && (s.wheelFt > ROTATED_FT || s.leftM < 0)) st.phase = 'rotated'; // in the air past the end: a takeoff
  else if (s.leftM < 0) st.phase = 'overrun';
  else if (cross > s.halfWidthM + OFF_MARGIN_M) st.phase = 'off';
  else if (s.onGround && s.gsKts < STOPPED_KTS) st.phase = 'stopped';
  return st.phase === 'fire' ? '' : st.phase;
}

// The coach. s: { onGround, throttle, reverserPos, braking, canReverse, gsKts, kid }.
export function rtoTarget(st, s) {
  if (st.phase === 'armed') return s.onGround ? (s.kid ? 'rtoKidRoll' : 'rtoRoll') : null;
  if (st.phase !== 'fire') return null;
  if (s.kid) return 'rtoKid';
  if (s.throttle > 0.05 && !(s.reverserPos > 0)) return 'rtoIdle';
  if (!s.braking) return 'rtoBrake';
  if (s.canReverse && !(s.reverserPos > 0) && s.gsKts > 60) return 'rtoReverse';
  if (s.reverserPos > 0 && s.throttle > 0.05 && s.gsKts < 60) return 'rtoStow';
  return 'rtoStraight';
}

const ft = (m) => Math.round(m * M_TO_FT).toLocaleString('en-US');
const REASONS = {
  rotated: 'Took off after the fire warning: below V1, reject. Idle, full brakes.',
  overrun: 'Still rolling at the end of the runway: thrust idle and full brakes at once.',
  off: 'Ran off the side of the runway: steer it back to the centreline as it slows.',
  // Off the end or the side with the levers never closed, or never braked: that was the fault.
  noIdle: 'Never closed the thrust after the fire: idle, then full brakes, at once.',
  noBrake: 'Never braked after the fire: full brakes as soon as the thrust is idle.',
  // Stopped, but slowly: the weakest part.
  reaction: 'Close the thrust levers the moment the warning comes.',
  stop: 'Idle, full brakes and reverse together: each second at 100 kt is 170 ft.',
  centreline: 'Keep it on the centreline as it slows.',
};
const WEIGHTS = { reaction: 0.4, stop: 0.4, centreline: 0.2 };

// The grade, once the drill has ended. kid: Kid level closed the thrust and braked itself.
export function gradeRto(st, kid = false) {
  const ref = rtoRefStopM(st.failGsKts);
  const stopped = st.phase === 'stopped';
  const factors = [
    { key: 'reaction', label: 'Fire to thrust back', value: kid ? 'the plane did it' : st.idleS === null ? 'never' : `${st.idleS.toFixed(1)} s`,
      score: kid ? 100 : st.idleS === null ? 0 : curve(st.idleS, [[1, 100], [2, 80], [3, 50], [5, 0]]) },
    { key: 'stop', label: 'Stopped in', value: stopped ? `${ft(st.stopM)} ft, ${ft(st.leftM)} ft of runway left` : 'did not stop',
      score: stopped ? curve(st.stopM / ref, [[1, 100], [1.4, 70], [2, 0]]) : 0 },
    { key: 'centreline', label: 'Off the centreline', value: `${st.maxCrossM.toFixed(1)} m at most`,
      score: curve(st.maxCrossM, [[3, 100], [8, 70], [15, 30], [22, 0]]) },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = REASONS[st.phase] ?? null;
  if (reason) {
    score = Math.min(score, FAIL_CAP);
    if (st.phase !== 'rotated' && !kid) reason = st.idleS === null ? REASONS.noIdle : st.brakeS === null ? REASONS.noBrake : reason;
  } else if (score < 70) reason = REASONS[factors.reduce((a, f) => (f.score < a.score ? f : a)).key];
  return {
    kind: 'rto', title: stopped ? 'Rejected takeoff' : 'Rejected takeoff failed', grade: letterGrade(score), score, factors, reason,
    note: stopped ? (kid ? 'Kid level: the plane closed the thrust and braked for you' : `Fire at ${st.failKts} kt, stopped on the runway`) : null,
  };
}

// main.js's calls, with the input built from the sim here (reused; the chunk, not boot, pays).
// 35C's course and its right, for the runway ahead and the centreline without allocating.
const DX = Math.sin(RTO_END.hdgT * Math.PI / 180), DZ = -Math.cos(RTO_END.hdgT * Math.PI / 180);
const _in = { t: 0, onGround: true, wheelFt: 0, iasKts: 0, gsKts: 0, throttle: 0, reverserPos: 0, braking: false, leftM: 0, crossM: 0, halfWidthM: 0, canReverse: false, kid: false };
function input(sim) {
  _in.t = sim.simTime; _in.onGround = sim.onGround;
  _in.wheelFt = sim.onGround ? 0 : (sim.pos.y - sim.groundY - sim.spec.gearHeight) * M_TO_FT;
  _in.iasKts = sim.iasKts; _in.gsKts = sim.gsKts; _in.throttle = sim.throttle;
  _in.reverserPos = sim.reverserPos ?? 0; _in.braking = !!(sim.brakesOn || sim.autobrakeActive);
  const rx = sim.pos.x - RTO_END.thrX, rz = sim.pos.z - RTO_END.thrZ;
  _in.leftM = RTO_END.lengthM - RTO_END.displacedM - (rx * DX + rz * DZ); // past the threshold, less
  _in.crossM = rx * -DZ + rz * DX; // + right (airports.js approachGeometry)
  _in.halfWidthM = RTO_END.widthM / 2;
  _in.canReverse = !!sim.spec.systems?.reverser; _in.kid = sim.assist === 'kid';
  return _in;
}
export const rtoStep = (st, sim) => stepRto(st, input(sim));
export const rtoPrompt = (st, sim) => (rtoLive(st) ? rtoTarget(st, input(sim)) : null);
