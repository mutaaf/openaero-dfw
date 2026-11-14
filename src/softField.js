// Soft-field takeoff lesson (ticket 0182): the Cessna on Addison 16 with a soft surface's rolling drag, flown the
// Handbook's way and graded on how it was flown. Sources:
//  - FAA Airplane Flying Handbook (FAA-H-8083-3C) ch. 5, "Soft/Rough-Field Takeoff and Climb" (via the ticket and
//    AOPA's summary, https://www.aopa.org/training-and-safety/students/maneuvers/skills/soft-field-techniques): back
//    elevator through the roll to take the weight off the nose wheel (reduce it, not eliminate it), lift off at the
//    lowest speed it will fly, then level just above the surface in ground effect and accelerate before climbing.
//  - Cessna 172P POH Section 4, amplified procedures (the 172S text could not be read this run): soft or rough field
//    takeoffs use 10° of flaps, "lifting the airplane off the ground as soon as practical in a slightly tail-low
//    attitude", then level off to accelerate to a higher climb speed. The 172S's Vy is 74 KIAS (POH Section 4).
//  - The surface: SURFACE_MU, a game setting (see there), on the whole roll (gear.js body.surfaceMu).
//
// The grade: how light the nose wheel was through the roll (its mean load over its static share, from ROLL_FROM_KTS
// to the lift-off), the lift-off speed, and how high the wheels went before ACCEL_KTS (the ground-effect leg). Pure
// (no THREE, no DOM): tests/unit/softField.test.js, flown headless in tests/flight/softField.test.js. A lazy chunk
// (main.js startDrills).
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, TOUCH_WORDS, RANK } from './coach.js';
// Only symbols main.js already imports: a lazy chunk importing one it doesn't grows the boot chunk's exports.
import { M_TO_FT } from './constants.js';

export const SOFT_FIELD_KEY = 'kads_16_soft_field';
// Rolling friction on the lesson's surface. Raymer, Aircraft Design: A Conceptual Approach, the takeoff chapter's
// table of rolling friction coefficients (brakes off): dry concrete/asphalt 0.03-0.05 (systems.js ROLLING_MU is its
// 0.03), hard turf 0.05, soft turf 0.07, wet grass 0.08. From the book, not a page read online this run. It is a game
// surface: Addison's runway is paved, and no 172S soft-field correction is published to check it against.
export const SURFACE_MU = 0.07;
// POH: 10° (the C172's first notch, aircraft.js flapDetentsDeg [0, 10, 20, 30]).
export const FLAPS = 1;
// The attitude the coach asks for once the nose is up: "slightly tail-low", under the tail (takeoffCoach.js
// STATIC_TAIL_DEG 13.7°, less its 1° margin). 10-12° lifts the Cessna off at 51-54 KIAS (tests/flight/softField.test.js).
export const PITCH_DEG = 11;
export const PITCH_HIGH_DEG = 12.7;
// The 172S's Vy (POH): the climb starts here. ACCEL_KTS: reaching it counts as "accelerated" (4 kt for the gusts).
export const VY_KTS = 74;
export const ACCEL_KTS = VY_KTS - 4;
// The nose wheel is measured from here (below it the elevator has little air to lift the nose with).
export const ROLL_FROM_KTS = 20;
// Ground effect: within about one wingspan (the C172's 36 ft); the coach says "stay low" above LOW_FT.
export const LOW_FT = 20;
// Lifted off: the wheels this high (a hop over a bump is not a lift-off).
export const LIFT_FT = 1;
// Done: the wheels this high above the runway, climbing at Vy.
export const DONE_FT = 200;
// A run that never gets airborne or stops before this long is graded anyway.
export const GIVE_UP_S = 150;
// Caps: the tail on the runway (B), settled back onto the runway after the lift-off (C), an abandoned roll or the
// runway left behind (D).
export const CAP_B = 84;
export const CAP_C = 69;
export const FAIL_CAP = 54;
const WEIGHTS = { nose: 0.4, liftoff: 0.3, accel: 0.3 };

export const SFO_TEXT = {
  sfoPower: 'Soft field: stick fully back, then full power. Keep the weight off the nose wheel',
  sfoBack: 'More back stick: keep the nose wheel light',
  sfoHold: `Hold the nose about ${PITCH_DEG}° up: it flies off by itself`,
  sfoEase: 'Ease the stick forward a little: the tail is close',
  sfoLow: 'Off! Nose down a little: stay just above the runway',
  sfoAccel: `Stay low and let it speed up to ${VY_KTS} knots`,
  sfoClimb: `${VY_KTS} knots: now climb at ${VY_KTS}`,
  sfoKidPower: 'Hold ↑ and push the power to the top',
  sfoKidHold: 'Keep holding ↑: the nose wheel stays light',
  sfoKidEase: 'Not so high! Let the nose down a bit',
  sfoKidLow: 'Flying! Stay low and let it speed up',
  sfoKidClimb: 'Fast enough: now let it climb',
};
const SFO_TOUCH = {
  sfoPower: 'Soft field: hold the stick up (nose up), then slide the throttle to the top',
  sfoBack: 'Stick further up: keep the nose wheel light',
  sfoEase: 'Let the stick down a little: the tail is close',
  sfoLow: 'Off! Stick down a little: stay just above the runway',
  sfoKidPower: 'Hold the stick up and push the throttle to the top',
  sfoKidHold: 'Keep the stick up: the nose wheel stays light',
};
Object.assign(DRILL_TEXT, SFO_TEXT);
Object.assign(TOUCH_WORDS, SFO_TOUCH);
Object.assign(RANK, {
  sfoPower: 1, sfoHold: 1, sfoAccel: 1, sfoClimb: 1, sfoKidPower: 1, sfoKidHold: 1, sfoKidLow: 1, sfoKidClimb: 1,
  sfoBack: 2, sfoLow: 2, sfoEase: 4, sfoKidEase: 4,
});

export const createSoftField = (end) => ({
  end, phase: 'roll', t: 0, rolled: false,
  noseSum: 0, noseN: 0, liftKts: null, rollM: null, startAlongM: null,
  maxLowFt: 0, accelFt: null, settled: false, tail: false, why: null,
});
export const softFieldDone = (st) => st.phase === 'done';

// One step. s: { onGround, wheelFt, iasKts, gsKts, throttle, noseFrac (the nose wheel's load over its static share),
// tailOn, alongM (along the runway from its threshold), leftM (runway ahead), crossM, halfWidthM, pitchDeg }.
// Returns 'done' on the step the lesson ends (graded), else ''.
export function softFieldStep(st, s, dt) {
  if (st.phase === 'done') return '';
  st.t += dt;
  st.startAlongM ??= s.alongM;
  if (s.tailOn) st.tail = true;
  const end = (why) => { st.why = why; st.phase = 'done'; return 'done'; };
  if (st.phase === 'roll') {
    if (s.throttle >= 0.9 && s.iasKts > 15) st.rolled = true;
    if (s.onGround && s.iasKts >= ROLL_FROM_KTS) { st.noseSum += Math.max(0, s.noseFrac); st.noseN++; }
    if (!s.onGround && s.wheelFt > LIFT_FT) {
      st.phase = 'air'; st.liftKts = s.iasKts; st.rollM = s.alongM - st.startAlongM;
    } else if (s.leftM < 0) return end('overrun');
    else if (Math.abs(s.crossM) > s.halfWidthM + 3) return end('off');
    else if (st.rolled && s.throttle < 0.5 && s.gsKts < 3) return end('stopped');
    else if (st.t > GIVE_UP_S) return end('stopped');
    return '';
  }
  if (s.onGround) st.settled = true; // back on the runway after the lift-off: the roll goes on
  if (st.accelFt === null) {
    st.maxLowFt = Math.max(st.maxLowFt, s.wheelFt);
    if (s.iasKts >= ACCEL_KTS) st.accelFt = st.maxLowFt;
  }
  if (s.wheelFt >= DONE_FT) return end(null);
  if (st.t > GIVE_UP_S) return end(st.accelFt === null ? 'slow' : null);
  return '';
}

// The coach. s: softFieldStep's input plus kid.
export function softFieldTarget(st, s) {
  if (st.phase === 'done') return null;
  if (st.phase === 'roll' || s.onGround) {
    if (s.pitchDeg > PITCH_HIGH_DEG) return s.kid ? 'sfoKidEase' : 'sfoEase';
    if (!st.rolled && (s.throttle < 0.9 || s.iasKts < ROLL_FROM_KTS)) return s.kid ? 'sfoKidPower' : 'sfoPower';
    if (s.kid) return 'sfoKidHold';
    return s.noseFrac > 0.5 && s.iasKts >= ROLL_FROM_KTS + 5 ? 'sfoBack' : 'sfoHold';
  }
  if (s.iasKts >= ACCEL_KTS || st.accelFt !== null) return s.kid ? 'sfoKidClimb' : 'sfoClimb';
  if (s.kid) return 'sfoKidLow';
  return s.wheelFt > LOW_FT ? 'sfoLow' : 'sfoAccel';
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const REASONS = {
  overrun: 'Ran out of runway: on a soft field the nose wheel has to come up early, stick fully back from the start.',
  off: 'Ran off the side of the runway: keep it on the centreline with the rudder.',
  stopped: 'Never got airborne: full power and the stick fully back, all the way.',
  slow: `Never got to ${VY_KTS} knots: stay just above the runway and let it speed up first.`,
  tail: `The tail touched the runway: hold the nose a little lower, about ${PITCH_DEG}° up.`,
  settled: 'Settled back onto the runway after lifting off: hold it level just above, don\'t let it sink or pull too high too slow.',
  nose: 'The nose wheel carried too much weight: on a soft field hold the stick back from the start of the roll.',
  liftoff: 'Lifted off late: hold the nose up and let it fly off at the lowest speed it will.',
  accel: `Climbed too soon: stay in ground effect, just above the runway, until ${VY_KTS} knots.`,
};

// The grade. kid: Kid level climbs away for you after the lift-off (assists.js), so its ground-effect leg is the plane's.
export function gradeSoftField(st, kid = false) {
  const flew = st.liftKts !== null;
  const nose = st.noseN ? st.noseSum / st.noseN : 1;
  const factors = [
    { key: 'nose', label: 'Nose wheel load on the roll', value: `${Math.round(nose * 100)}% of its weight`,
      score: curve(nose, [[0.25, 100], [0.5, 75], [0.8, 30], [1, 0]]) },
    { key: 'liftoff', label: 'Lift-off speed', value: flew ? `${Math.round(st.liftKts)} kt, after ${fmt(st.rollM * M_TO_FT)} ft` : 'never lifted off',
      score: flew ? curve(st.liftKts, [[54, 100], [57, 80], [62, 40], [66, 0]]) : 0 },
    { key: 'accel', label: `Height before ${VY_KTS} kt`, value: kid && flew ? 'the plane climbed for you' : st.accelFt === null ? 'never got there' : `${Math.round(st.accelFt)} ft`,
      score: kid && flew ? 100 : st.accelFt === null ? 0 : curve(st.accelFt, [[20, 100], [36, 70], [60, 30], [100, 0]]) },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = st.why ? REASONS[st.why] : null;
  if (st.why && st.why !== 'slow') score = Math.min(score, FAIL_CAP);
  else if (st.settled && !kid) { score = Math.min(score, CAP_C); reason ??= REASONS.settled; }
  else if (st.tail) { score = Math.min(score, CAP_B); reason ??= REASONS.tail; }
  if (!reason && score < 85) reason = REASONS[factors.reduce((a, f) => (f.score < a.score ? f : a)).key];
  return {
    kind: 'softField', title: flew ? 'Soft-field takeoff' : 'Soft-field takeoff failed', grade: letterGrade(score), score, factors, reason,
    note: kid ? 'Kid level: the plane flew the climb for you' : 'Soft field (a game surface: the drag of soft turf on Addison 16).',
  };
}

// main.js's calls, the input built here from the sim (reused: the chunk pays, not boot).
const _in = { onGround: true, wheelFt: 0, iasKts: 0, gsKts: 0, throttle: 0, noseFrac: 1, tailOn: false, alongM: 0, leftM: 0, crossM: 0, halfWidthM: 0, pitchDeg: 0, kid: false };
function input(st, sim, pitchDeg) {
  const e = st.end, r = e.hdgT * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r);
  const rx = sim.pos.x - e.thrX, rz = sim.pos.z - e.thrZ, g = sim.spec.gear;
  _in.onGround = sim.onGround;
  _in.wheelFt = sim.onGround ? 0 : (sim.pos.y - sim.groundY - sim.spec.gearHeight) * M_TO_FT;
  _in.iasKts = sim.iasKts; _in.gsKts = sim.gsKts; _in.throttle = sim.throttle;
  // The nose wheel's static share of the weight (gear.js gearConstants: mainZ over the wheelbase).
  const staticN = g.mainZ / (g.noseZ + g.mainZ) * sim.spec.massKg * 9.80665;
  _in.noseFrac = sim.wheelLoads ? Math.max(0, sim.wheelLoads[0]) / staticN : sim.onGround ? 1 : 0;
  _in.tailOn = (sim.wheelLoads?.[3] ?? 0) > 0;
  _in.alongM = rx * dx + rz * dz;
  _in.leftM = e.lengthM - e.displacedM - _in.alongM;
  _in.crossM = rx * -dz + rz * dx;
  _in.halfWidthM = e.widthM / 2;
  _in.pitchDeg = pitchDeg; _in.kid = sim.assist === 'kid';
  return _in;
}
export const softFieldSimStep = (st, sim, pitchDeg, dt) => softFieldStep(st, input(st, sim, pitchDeg), dt);
export const softFieldPrompt = (st, sim, pitchDeg) => softFieldTarget(st, input(st, sim, pitchDeg));
