// Takeoff coach (ticket 0093): the roll and the climb-out of the takeoff mission, the other half
// of every flight the landing coach (0073) never covered. Full power, the brakes off, the
// centreline, "rotate" to the airframe's lift-off attitude at Vr, "ease the nose" before the
// tail meets the runway, then positive rate: gear up, and the climb speed the takeoff trim flies
// (trim.js takeoffTrimAoaDeg, 0141). A lazy chunk (no boot bytes): main.js loads it with the
// mission and feeds its key to coach.js as s.ds / s.dsGround, so coach.js's debounce, ranks and
// card do the rest. Pure: no THREE, no DOM. Tested in tests/unit/takeoffCoach.test.js; the
// attitudes are flown headless in tests/flight/takeoffCoach.test.js.
import { DRILL_TEXT, RANK, TOUCH_WORDS } from './coach.js';
import { stallSpeedKts } from './aero.js';

// The lift-off attitude the coach asks for at Vr, degrees nose up:
// - 737-800: "around 8.5°" for a flaps 1 takeoff and 8.2° at flaps 5 (Boeing FCTM, quoted by
//   Singapore TSIB's 9V-MGL report, 2022, and ATSB AO-2018-011); a 2-3°/s rotation reaches 7-9°.
// - F-16: "establish takeoff attitude (8-12 degrees)" (T.O. 1F-16C-1, p. 2-21, as quoted by
//   flight-sim forums; we have not seen the page): the middle, 10°.
// - Cessna 172: the POH and the Airplane Flying Handbook give no number ("the liftoff attitude");
//   7° is the ticket's, and tests/flight/takeoffCoach.test.js holds that it lifts off and climbs.
export const ROTATE_PITCH_DEG = { c172: 7, b738: 8, f16: 10 };
// "Ease the nose" this close to the tail-strike attitude, while the wheels are within TAIL_FT of
// the runway: spec.maxGroundPitchDeg (the 737's 11°, FCTM), else the Cessna's tail contact (0144,
// aircraft.js gear.tail): 15.0° rotated about extended mains but ~13.7° on static struts, which is
// where it first touches on a pull below Vr (14.2° at 35 kt, panel): the lower one, else 15°.
export const TAIL_MARGIN_DEG = 1;
export const STATIC_TAIL_DEG = 13.7;
export const tailStrikeDeg = (spec) => spec.maxGroundPitchDeg ?? (spec.gear?.tail ? STATIC_TAIL_DEG : 15);
// "Slow" in the climb below 1.13 Vs at the flaps set: the floor of V2 (14 CFR 25.107(b)), and no
// lower than Vr - 3 kt.
export const SLOW_VS = 1.13;
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

// The climb speed the coach calls: the speed the takeoff trim (trim.js takeoffTrimAoaDeg, 0141)
// flies at these flaps (flaps up Vy where published, else 1.2 Vr; trim.js's own rule, written out:
// importing trim.js split it out of the boot chunk, +620 B; a unit test holds the two equal). null for a fly-by-wire
// airframe (the F-16's pitchFbw carries the trim with α, so a released stick holds no speed, and
// full power runs it past 300 kt in the first 1,000 ft: panel): it is told an attitude instead.
export const climbKts = (spec, flapsIndex) => (spec.pitchFbw ? null
  : Math.round(!flapsIndex && spec.vyKts || 1.2 * spec.vrKts));

// Words with this airframe's numbers at these flaps (the card reads coach.js coachText:
// TOUCH_WORDS on a touch screen, else DRILL_TEXT).
export function takeoffWords(key, spec, flapsIndex = 0) {
  const pitch = ROTATE_PITCH_DEG[key] ?? 8;
  const vr = Math.round(spec.vrKts);
  const climb = climbKts(spec, flapsIndex);
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
      toClimb: climb ? `Climbing: hold ${climb} kt, wings level` : `Climbing: nose ${pitch}° up, wings level`,
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

// The airframe's numbers and words, for these flaps; re-run when either changes (the state stays).
export function configureTakeoffCoach(st, key, spec, flapsIndex = 0) {
  const w = takeoffWords(key, spec, flapsIndex);
  Object.assign(DRILL_TEXT, w.keys);
  Object.assign(TOUCH_WORDS, w.touch);
  st.key = key; st.spec = spec; st.flaps = flapsIndex;
  st.pitchDeg = ROTATE_PITCH_DEG[key] ?? 8;
  st.tailDeg = tailStrikeDeg(spec) - TAIL_MARGIN_DEG;
  st.vrKts = spec.vrKts;
  st.slowKts = Math.max(spec.vrKts - 3, SLOW_VS * stallSpeedKts(spec, flapsIndex));
  st.retractable = !spec.fixedGear;
  return st;
}

export const createTakeoffCoach = (key, spec, flapsIndex = 0) => configureTakeoffCoach({
  over: false, last: null, left: {},
  prompt(sim, pitchDeg) { return takeoffPromptFor(this, sim, pitchDeg); }, // main.js calls it (no lib handle on the boot side)
}, key, spec, flapsIndex);

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
  if (s.raFt > 5 && s.iasKts < st.slowKts) return 'toSlow';
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
  // Another airframe or flap notch picked: its numbers and words (the climb speed is the flaps').
  if (st.key !== sim.aircraftKey || st.flaps !== sim.flapsIndex) configureTakeoffCoach(st, sim.aircraftKey, sim.spec, sim.flapsIndex);
  _in.onGround = sim.onGround; _in.raFt = sim.raFt; _in.aglFt = sim.aglFt; _in.iasKts = sim.iasKts; _in.gsKts = sim.gsKts;
  _in.vsiFpm = sim.vsiFpm; _in.throttle = sim.throttle; _in.brakesOn = sim.brakesOn; _in.gearDown = sim.gearDown;
  _in.kid = sim.assist === 'kid'; _in.crossM = sim.approach.crossM; _in.pitchDeg = pitchDeg;
  return takeoffPrompt(st, _in, sim.simTime);
}
