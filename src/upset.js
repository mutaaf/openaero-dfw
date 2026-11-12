// Unusual-attitude recovery (ticket 0174, a lazy chunk loaded with its two Cessna missions). The
// instructor flies the airplane into a nose-high or a nose-low attitude and hands it over ("your
// airplane"); the pilot recovers to straight and level in the FAA's order, graded on the results card.
// Source: FAA-H-8083-15B, Instrument Flying Handbook, ch. 7 "Recovery from Unusual Attitudes",
// pp. 7-27/7-28:
//  - Nose-high, airspeed decreasing: increase power, apply forward elevator pressure to lower the
//    nose and prevent a stall, then level the wings ("almost simultaneously, but in the sequence given").
//  - Nose-low, airspeed increasing: reduce power to prevent excessive airspeed and loss of altitude,
//    level the wings, then raise the nose with smooth back pressure; "the instinctive reaction to a
//    nose-down attitude is to pull back on the elevator control" (pulling while banked tightens the
//    spiral: FAA-H-8083-3C ch. 5, the graveyard spiral).
// The Cessna's limits are the POH's: VNE 163 KIAS, +3.8 g flaps up (aircraft.js, 0167's card).
// Pure but for applyUpset, which sets the given body's attitude, velocity and power (the game's sim
// or a headless card's body: no THREE, no DOM). Tested in tests/unit/upset.test.js and flown
// headless in tests/flight/upset.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK } from './coach.js';
import { stallAoaDeg } from './aero.js';
import { DEG_TO_RAD, KTS_TO_MPS, M_TO_FT } from './constants.js';

// The two set-ups (bank + = right). The nose-high one is a steep climb losing speed, the nose-low
// one a diving left turn gaining it (the IFH's Figures 7-39/7-40); aoaDeg is where the wing is at the
// hand-over (the zoom has unloaded it, the dive is near its trim).
export const UPSETS = {
  high: { pitchDeg: 35, bankDeg: 0, kts: 60, aoaDeg: 4, throttle: 0.55 },
  low: { pitchDeg: -25, bankDeg: -60, kts: 130, aoaDeg: 1, throttle: 0.75 },
};
// The instructor holds it level this long after the player starts flying, then hands over.
export const UPSET_HANDS_S = 1.5;
// Recovered: wings within 10° of level, the nose within 5° of the horizon, 70 KIAS or more, held 1 s.
export const UPSET_LEVEL_BANK_DEG = 10;
export const UPSET_LEVEL_PITCH_DEG = 5;
export const UPSET_MIN_KTS = 70;
export const UPSET_HOLD_S = 1;
// Not recovered within 20 s fails; so does a stall, VNE or the +3.8 g limit. The stall warning (the
// wing within 3° of its stall angle, as stallDrill.js's) after the first 3 s fails too: the push
// comes before the stall, not after it.
export const UPSET_FAIL_S = 20;
export const UPSET_GRACE_S = 3;
export const UPSET_WARN_MARGIN_DEG = 3;
export const UPSET_G_LIMIT = 3.8;
// Flown, not watched: the stick 0.1 or more off centre either way, or the lever 0.05 off the hand-over's,
// at some point. Hands off, the stick-fixed Cessna's own stability brings it round (tests/flight/upset.test.js:
// nose-low, out of the bank at 157 KIAS; nose-high, a dive to ~145 kt): that is not the pilot's recovery.
export const UPSET_MOVED = 0.1;
// The power steps: "increase power" is the lever 0.2 above the hand-over's (or full); "reduce" is 0.25 or less.
export const UPSET_POWER_UP = 0.2;
export const UPSET_POWER_IDLE = 0.25;
// Back pressure (the elevator 0.2 nose-up or more) with more than 30° of bank, nose low: pulling in the bank.
export const UPSET_PULL = 0.2;
export const UPSET_PULL_BANK_DEG = 30;
export const UPSET_PLACE = { name: 'Over Grapevine Lake · 5,000 ft' };

export const UPSET_TEXT = {
  uaHands: 'Hands off: your instructor has the airplane. Yours in a moment',
  uaPower: 'Nose high, slowing: full power',
  uaPush: 'Push: nose down to the horizon',
  uaWings: 'Level the wings',
  uaBuild: 'Nose on the horizon: let the speed build',
  uaIdle: 'Diving: power to idle',
  uaRoll: 'Roll the wings level first: don\'t pull yet',
  uaEase: 'Now ease back to the horizon, smoothly',
  uaHold: 'Level: hold it there',
  uaKid: 'Let go: the plane levels itself. Watch the horizon',
};
Object.assign(DRILL_TEXT, UPSET_TEXT);
Object.assign(RANK, { uaHands: 1, uaPower: 2, uaPush: 2, uaWings: 2, uaBuild: 1, uaIdle: 2, uaRoll: 2, uaEase: 1, uaHold: 1, uaKid: 1 });

// phase: 'brief' (before the hand-over, flying level), 'recover', 'done' or 'failed' (graded).
export const createUpset = (kind) => ({
  kind, phase: 'brief', wait: 0, t: 0, held: 0, alt0: 0, thr0: 0, maxKts: 0, maxG: 1, maxAltDevFt: 0,
  tPower: -1, tNose: -1, tWings: -1, pulled: false, moved: false, why: null,
});

// The airplane in the set-up's attitude and speed, its heading kept: body.quat, vel, angVel, throttle.
// The speed is the set-up's IAS at today's IAS-to-TAS ratio. Allocates nothing.
export function applyUpset(body, u) {
  const { x, y, z, w } = body.quat;
  const yaw = Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
  const ratio = body.iasKts > 1 ? body.vel.length() / (body.iasKts * KTS_TO_MPS) : 1;
  // YXZ Euler (yaw, pitch, roll; roll + = left wing up, three's sense) to a quaternion, as three's setFromEuler.
  const c1 = Math.cos(u.pitchDeg * DEG_TO_RAD / 2), s1 = Math.sin(u.pitchDeg * DEG_TO_RAD / 2);
  const c2 = Math.cos(yaw / 2), s2 = Math.sin(yaw / 2);
  const c3 = Math.cos(-u.bankDeg * DEG_TO_RAD / 2), s3 = Math.sin(-u.bankDeg * DEG_TO_RAD / 2);
  body.quat.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3);
  // The relative wind meets the wing aoaDeg under the nose: the velocity points that far below it, in body axes.
  const a = u.aoaDeg * DEG_TO_RAD;
  body.vel.set(0, -Math.sin(a), -Math.cos(a)).applyQuaternion(body.quat).multiplyScalar(u.kts * KTS_TO_MPS * ratio);
  body.angVel.set(0, 0, 0);
  body.throttle = u.throttle;
  body.engineN = u.throttle;
  body.iasKts = u.kts;
}

// One step. s: { dt, started (the player is flying: the start screen is closed), altFt, iasKts,
// pitchDeg, bankDeg (+ = right), aoaDeg, stallAoaDeg, throttle, elevInput (− = nose up), aileronInput, g, vneKts }.
// Returns 'handover' (the caller applies the set-up), 'done', 'failed' or ''.
export function upsetStep(st, s) {
  if (st.phase === 'done' || st.phase === 'failed') return '';
  if (st.phase === 'brief') {
    if (!s.started || (st.wait += s.dt) < UPSET_HANDS_S) return '';
    st.phase = 'recover';
    return 'handover';
  }
  // The hand-over's values: the first recovering step reads the set-up just applied.
  if (st.t === 0) { st.alt0 = s.altFt; st.thr0 = s.throttle; }
  st.t += s.dt;
  const bank = Math.abs(s.bankDeg);
  st.maxKts = Math.max(st.maxKts, s.iasKts);
  st.maxG = Math.max(st.maxG, s.g);
  st.maxAltDevFt = Math.max(st.maxAltDevFt, Math.abs(s.altFt - st.alt0));
  // The order the controls went in: the first time the power moved the right way, the nose came
  // within 5° of the horizon, the wings came level.
  const powered = st.kind === 'high' ? s.throttle >= Math.min(1, st.thr0 + UPSET_POWER_UP) : s.throttle <= UPSET_POWER_IDLE;
  if (st.tPower < 0 && powered) st.tPower = st.t;
  if (st.tNose < 0 && Math.abs(s.pitchDeg) <= UPSET_LEVEL_PITCH_DEG) st.tNose = st.t;
  if (st.tWings < 0 && bank <= UPSET_LEVEL_BANK_DEG) st.tWings = st.t;
  if (Math.abs(s.elevInput) >= UPSET_MOVED || Math.abs(s.aileronInput) >= UPSET_MOVED || Math.abs(s.throttle - st.thr0) >= UPSET_MOVED / 2) st.moved = true;
  if (st.kind === 'low' && bank > UPSET_PULL_BANK_DEG && s.pitchDeg < 0 && -s.elevInput >= UPSET_PULL) st.pulled = true;
  const why = s.aoaDeg > s.stallAoaDeg ? 'stall'
    : s.iasKts > s.vneKts ? 'vne'
      : s.g > UPSET_G_LIMIT ? 'g'
        : st.t > UPSET_GRACE_S && s.aoaDeg > s.stallAoaDeg - UPSET_WARN_MARGIN_DEG ? 'warn'
          : st.t > UPSET_FAIL_S ? 'time' : null;
  if (why) { st.why = why; st.phase = 'failed'; return 'failed'; }
  const level = bank <= UPSET_LEVEL_BANK_DEG && Math.abs(s.pitchDeg) <= UPSET_LEVEL_PITCH_DEG && s.iasKts >= UPSET_MIN_KTS;
  st.held = level ? st.held + s.dt : 0;
  if (st.held < UPSET_HOLD_S) return '';
  if (!st.moved) { st.why = 'hands'; st.phase = 'failed'; return 'failed'; }
  st.phase = 'done';
  return 'done';
}

// The coach's word for this moment (coach.js s.ds), in the IFH's order. kid: the assists fly it.
export function upsetPrompt(st, s, kid) {
  if (st.phase === 'done' || st.phase === 'failed') return null;
  if (st.phase === 'brief') return 'uaHands';
  if (kid) return 'uaKid';
  const bank = Math.abs(s.bankDeg), wings = bank > UPSET_LEVEL_BANK_DEG;
  if (st.kind === 'high') {
    if (st.tPower < 0 && s.throttle < 0.95) return 'uaPower';
    if (s.pitchDeg > UPSET_LEVEL_PITCH_DEG) return 'uaPush';
    if (wings) return 'uaWings';
    return s.iasKts < UPSET_MIN_KTS ? 'uaBuild' : 'uaHold';
  }
  if (s.throttle > UPSET_POWER_IDLE && s.iasKts >= UPSET_MIN_KTS) return 'uaIdle';
  if (wings) return 'uaRoll';
  return s.pitchDeg < -UPSET_LEVEL_PITCH_DEG ? 'uaEase' : 'uaHold';
}

// Was the IFH's order kept? Nose-high: the power came in before (or with, within 0.5 s of) the nose
// reaching the horizon. Nose-low: the power came off before the wings were level, and no pull in the bank.
export function orderKept(st) {
  if (st.kind === 'high') return st.tPower >= 0 && (st.tNose < 0 || st.tPower <= st.tNose + 0.5);
  return !st.pulled && st.tPower >= 0 && (st.tWings < 0 || st.tPower <= st.tWings + 0.5);
}

const WEIGHTS = { time: 0.3, alt: 0.2, order: 0.3, g: 0.2 };
export const UPSET_ORDER_CAP = 84; // the top of a B: out of the IFH's order is not an A
export const UPSET_LOST_CAP = 54; // the top of a D
export const UPSET_KID_NOTE = 'The plane recovered for you';
const ORDER_TEXT = {
  high: 'Order: power, nose down, wings level',
  low: 'Order: idle, wings level, ease back',
};
const FAIL_TEXT = {
  stall: 'Stalled: push the nose down to the horizon first, then the power. A wing slowing nose-high stalls.',
  warn: 'At the stall warning after the hand-over: push the nose down sooner, the power with it.',
  vne: 'Over the never-exceed speed (163 KIAS): power to idle first, wings level, then ease back.',
  g: 'Over the +3.8 g limit: ease back smoothly, and level the wings before you pull.',
  time: 'Not recovered in 20 s: wings level, nose on the horizon, and the power set.',
  hands: 'Hands off the whole way: the Cessna\'s own stability came round this time, the long way. Fly it: power, wings, nose.',
  pulled: 'You pulled while banked: the spiral tightened. Power idle, roll the wings level, then ease back.',
};

// The grade from the drill's state at 'done' or 'failed'.
export function gradeUpset(st, kid = false) {
  const failed = st.phase === 'failed', kept = orderKept(st);
  const factors = [
    { key: 'time', label: 'Time to straight and level', value: failed ? 'not level' : `${st.t.toFixed(1)} s`,
      score: failed ? 0 : curve(st.t, [[5, 100], [8, 85], [12, 50], [UPSET_FAIL_S, 0]]) },
    { key: 'alt', label: 'Height lost or gained', value: `${Math.round(st.maxAltDevFt)} ft at most`,
      score: curve(st.maxAltDevFt, [[200, 100], [400, 85], [800, 40], [1200, 0]]) },
    { key: 'order', label: ORDER_TEXT[st.kind], value: kept ? 'kept' : 'out of order', score: kept ? 100 : 40 },
    { key: 'g', label: 'Peak load (limit +3.8 g)', value: `${st.maxG.toFixed(1)} g`,
      score: curve(st.maxG, [[2, 100], [2.5, 85], [3.3, 40], [UPSET_G_LIMIT, 0]]) },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = null;
  if (failed) {
    score = Math.min(score, UPSET_LOST_CAP);
    reason = st.pulled && st.why !== 'stall' ? FAIL_TEXT.pulled : FAIL_TEXT[st.why];
  } else if (!kept) {
    score = Math.min(score, UPSET_ORDER_CAP);
    reason = st.pulled ? 'You pulled while banked: roll the wings level first. No better than a B.'
      : `Out of order: ${st.kind === 'high' ? 'power first, then the nose down' : 'power to idle before the wings come level'}. No better than a B.`;
  }
  return { kind: 'upset', title: failed ? 'Not recovered' : st.kind === 'high' ? 'Nose-high recovery' : 'Nose-low recovery',
    grade: letterGrade(score), score, factors, reason, note: kid && !failed ? UPSET_KID_NOTE : null };
}

// The game's adapter: reads the sim (its quaternion's YXZ angles, as steepTurns.js does) into one
// reused input, applies the set-up at the hand-over and returns the step's transition.
const _s = { dt: 0, started: false, altFt: 0, iasKts: 0, pitchDeg: 0, bankDeg: 0, aoaDeg: 0, stallAoaDeg: 0, throttle: 0, elevInput: 0, aileronInput: 0, g: 1, vneKts: 0 };
export function upsetSimStep(st, sim, dt, started) {
  const { x, y, z, w } = sim.quat;
  _s.dt = dt;
  _s.started = started;
  _s.altFt = sim.pos.y * M_TO_FT;
  _s.iasKts = sim.iasKts;
  _s.pitchDeg = Math.asin(Math.max(-1, Math.min(1, 2 * (w * x - y * z)))) / DEG_TO_RAD;
  _s.bankDeg = -Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z)) / DEG_TO_RAD;
  _s.aoaDeg = sim.aoaDeg ?? 0;
  _s.stallAoaDeg = stallAoaDeg(sim.spec, sim.flapsIndex);
  _s.throttle = sim.throttle;
  _s.elevInput = sim.elevInput;
  _s.aileronInput = sim.aileronInput;
  _s.g = sim.loadFactor ?? 1;
  _s.vneKts = sim.spec.vneKts;
  const ev = upsetStep(st, _s);
  if (ev === 'handover') applyUpset(sim, UPSETS[st.kind]);
  return ev;
}
// The coach's word from the last step's input.
export const upsetCoach = (st, kid) => upsetPrompt(st, _s, kid);
