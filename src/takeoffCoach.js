// Takeoff coach (ticket 0093): the roll and the climb-out of the takeoff mission, the other half
// of every flight the landing coach (0073) never covered. Full power, the brakes off, the
// centreline, "rotate" to the airframe's lift-off attitude at Vr, "ease the nose" before the
// tail meets the runway, then positive rate: gear up, and the climb speed the takeoff trim flies
// (trim.js takeoffTrimAoaDeg, 0141). A lazy chunk (no boot bytes): main.js loads it with the
// mission and feeds its key to coach.js as s.ds / s.dsGround, so coach.js's debounce, ranks and
// card do the rest. Pure: no THREE, no DOM. Tested in tests/unit/takeoffCoach.test.js; the
// attitudes are flown headless in tests/flight/takeoffCoach.test.js.
import { DRILL_TEXT, RANK, TOUCH_WORDS } from './coach.js';

// The lift-off attitude the coach asks for at Vr, degrees nose up:
// - 737-800: "around 8.5°" for a flaps 1 takeoff and 8.2° at flaps 5 (Boeing FCTM, quoted by
//   Singapore TSIB's 9V-MGL report, 2022, and ATSB AO-2018-011); a 2-3°/s rotation reaches 7-9°.
// - F-16: "establish takeoff attitude (8-12 degrees)" (T.O. 1F-16C-1, p. 2-21, as quoted by
//   flight-sim forums; we have not seen the page): the middle, 10°.
// - Cessna 172: the POH and the Airplane Flying Handbook give no number ("the liftoff attitude");
//   7° is the ticket's, and tests/flight/takeoffCoach.test.js holds that it lifts off and climbs.
export const ROTATE_PITCH_DEG = { c172: 7, b738: 8, f16: 10 };
// "Ease the nose" this close to the tail-strike attitude (spec.maxGroundPitchDeg: the 737's 11°,
// FCTM; the Cessna's tail at 15°, 0144), while the wheels are within TAIL_FT of the runway.
export const TAIL_MARGIN_DEG = 1;
export const TAIL_FT = 10;
// Off the centreline by more than this on the roll (a 737's mains are 2.9 m either side of it).
export const OFF_M = 4;
// A prompt that just left does not come back for this long (it holds the one showing instead);
// the safety call (rank 4: the nose near the tail-strike attitude) is exempt.
export const REPEAT_S = 4;
// Over at 1,000 ft above the runway: the climb-out is done, and the card goes away.
export const DONE_FT = 1000;

// Ranks (coach.js: a higher one interrupts at once, the same or lower holds 1.5 s first).
Object.assign(RANK, {
  toRoll: 1, toLeft: 1, toRight: 1, toClimb: 1, toKidRoll: 1, toKidClimb: 1,
  toPower: 2, toBrakes: 2, toHold: 2, toGear: 2, toKidPower: 2,
  toRotate: 3, toSlow: 3, toKidRotate: 3, toEase: 4,
});

// Words with this airframe's numbers, written when the mission loads (the card reads coach.js
// coachText: TOUCH_WORDS on a touch screen, else DRILL_TEXT).
export function takeoffWords(key, spec) {
  const pitch = ROTATE_PITCH_DEG[key] ?? 8;
  const vr = Math.round(spec.vrKts);
  const climb = Math.round(spec.vyKts ?? 1.2 * spec.vrKts); // the speed the takeoff trim flies (0141)
  return {
    keys: {
      toPower: 'Full power: hold Shift to the top',
      toBrakes: 'Brakes off (B): let it roll',
      toRoll: `On the centreline: rotate at ${vr} kt`,
      toLeft: 'Left of the centreline: rudder right (E)',
      toRight: 'Right of the centreline: rudder left (Q)',
      toRotate: `Rotate: ease back to ${pitch}° nose up`,
      toHold: `Hold ${pitch}°: it lifts off by itself`,
      toEase: 'Ease the nose down: the tail is close',
      toSlow: 'Slow: lower the nose a little',
      toGear: 'Positive rate: gear up (G)',
      toClimb: `Climbing: hold ${climb} kt, wings level`,
      toKidPower: 'Push the throttle to the top',
      toKidRoll: `Let it roll: pull back at ${vr} kt`,
      toKidRotate: 'Pull back gently: the nose comes up',
      toKidClimb: 'Let go: the plane climbs by itself',
    },
    touch: {
      toPower: 'Full power: slide the throttle to the top',
      toBrakes: 'Tap BRAKES to let it roll',
      toLeft: 'Left of the centreline: steer right',
      toRight: 'Right of the centreline: steer left',
      toGear: 'Positive rate: tap GEAR to raise it',
    },
  };
}

export function createTakeoffCoach(key, spec) {
  const w = takeoffWords(key, spec);
  Object.assign(DRILL_TEXT, w.keys);
  Object.assign(TOUCH_WORDS, w.touch);
  return {
    key,
    pitchDeg: ROTATE_PITCH_DEG[key] ?? 8,
    tailDeg: (spec.maxGroundPitchDeg ?? 15) - TAIL_MARGIN_DEG,
    vrKts: spec.vrKts,
    retractable: !spec.fixedGear,
    over: false, last: null, left: {},
    prompt(sim, pitchDeg) { return takeoffPromptFor(this, sim, pitchDeg); }, // main.js calls it (no lib handle on the boot side)
  };
}

// The prompt the roll or the climb asks for now (null: nothing to say). s: { onGround, raFt (the
// wheels' height), aglFt, iasKts, gsKts, vsiFpm, throttle, brakesOn, gearDown, kid, crossM (+ =
// right of the centreline), pitchDeg }.
export function takeoffTarget(st, s) {
  if (st.over || s.aglFt > DONE_FT) { st.over = true; return null; }
  const low = s.onGround || s.raFt < TAIL_FT;
  if (low && s.pitchDeg > st.tailDeg) return 'toEase';
  if (s.onGround) {
    if (s.iasKts >= st.vrKts) return s.kid ? 'toKidRotate' : s.pitchDeg < st.pitchDeg - 1 ? 'toRotate' : 'toHold';
    if (s.throttle < 0.9 && s.iasKts < 30) return s.kid ? 'toKidPower' : 'toPower';
    if (s.brakesOn) return 'toBrakes';
    if (s.gsKts > 5 && Math.abs(s.crossM) > OFF_M) return s.crossM > 0 ? 'toRight' : 'toLeft';
    return s.kid ? 'toKidRoll' : 'toRoll';
  }
  if (s.kid) return 'toKidClimb';
  if (s.raFt > 5 && s.iasKts < st.vrKts - 3) return 'toSlow';
  if (st.retractable && s.gearDown && s.raFt > 5 && s.vsiFpm > 300) return 'toGear';
  return 'toClimb';
}

// takeoffTarget with the no-repeat rule: a prompt that left less than REPEAT_S ago holds the
// one showing instead of coming back (no "left, right, left" flicker on the roll). t: sim time.
export function takeoffPrompt(st, s, t) {
  let k = takeoffTarget(st, s);
  if (k !== st.last && k !== null && st.last !== null && (RANK[k] ?? 1) < 4 && t - (st.left[k] ?? -Infinity) < REPEAT_S) k = st.last;
  if (k !== st.last && st.last !== null) st.left[st.last] = t;
  st.last = k;
  return k;
}

// The game's input, from main.js's sim (no allocation: one object reused per coach).
const _in = { onGround: true, raFt: 0, aglFt: 0, iasKts: 0, gsKts: 0, vsiFpm: 0, throttle: 0, brakesOn: false, gearDown: true, kid: false, crossM: 0, pitchDeg: 0 };
export function takeoffPromptFor(st, sim, pitchDeg) {
  if (st.key !== sim.aircraftKey) Object.assign(st, createTakeoffCoach(sim.aircraftKey, sim.spec)); // another airframe picked
  _in.onGround = sim.onGround; _in.raFt = sim.raFt; _in.aglFt = sim.aglFt; _in.iasKts = sim.iasKts; _in.gsKts = sim.gsKts;
  _in.vsiFpm = sim.vsiFpm; _in.throttle = sim.throttle; _in.brakesOn = sim.brakesOn; _in.gearDown = sim.gearDown;
  _in.kid = sim.assist === 'kid'; _in.crossM = sim.approach.crossM; _in.pitchDeg = pitchDeg;
  return takeoffPrompt(st, _in, sim.simTime);
}
