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
// "Ease the nose" this close to the tail-strike attitude, while the wheels are within TAIL_FT of
// the runway: spec.maxGroundPitchDeg (the 737's 11°, FCTM), else the Cessna's tail contact (0144,
// aircraft.js gear.tail): 15.0° rotated about extended mains but ~13.7° on static struts, which is
// where it first touches on a pull below Vr (14.2° at 35 kt, panel): the lower one, else 15°.
export const TAIL_MARGIN_DEG = 1;
export const STATIC_TAIL_DEG = 13.7;
export const tailStrikeDeg = (spec) => spec.maxGroundPitchDeg ?? (spec.gear?.tail ? STATIC_TAIL_DEG : 15);
// "Slow" in the climb below 1.13 Vs at the flaps set: the floor of V2 (14 CFR 25.107(b)), and no
// lower than Vr - 3 kt. Vs is main.js's sim.stallKts (aero.js stallSpeedKts at the flaps, the tape's
// band; null for the F-16, whose 1.13 Vs is its Vr - 3 anyway): importing aero.js here cost boot bytes.
export const SLOW_VS = 1.13;
export const slowKtsFor = (spec, stallKts) => Math.max(spec.vrKts - 3, SLOW_VS * (stallKts ?? 0));
export const TAIL_FT = 10;
// The tail call looks this far ahead at the pitch rate: a firm pull passes 1° inside a frame of
// the card (first-timer panel: the warning first showed past the tail, 15.6° in the Cessna).
export const TAIL_LEAD_S = 0.5;
// Drifting off the centreline: more than this, now or OFF_LEAD_S ahead at the drift rate (a
// swerve back across it is "drifting left", not "right of the centreline").
export const OFF_M = 4;
export const OFF_LEAD_S = 2;
// Too steep after lift-off: more than this above the rotate attitude and STEEP_KTS under the climb
// speed. Steep alone is no fault: the 737's trim holds its 162 kt at takeoff thrust at ~18-20° nose
// up (a held pull let go at 6° settled there and the call never cleared, e2e under load).
export const STEEP_DEG = 9;
export const STEEP_KTS = 5;
// A prompt that just left does not come back for this long (it holds the one showing instead);
// the safety calls (rank 4: the tail, off the runway) are exempt.
export const REPEAT_S = 4;
// Over at 1,000 ft above the runway: the climb-out is done, and the card goes away.
export const DONE_FT = 1000;

// Ranks (coach.js: a higher one interrupts at once, the same or lower holds 1.5 s first).
Object.assign(RANK, {
  toRoll: 1, toLeft: 1, toRight: 1, toClimb: 1, toKidRoll: 1, toKidClimb: 1,
  toPower: 2, toBrakes: 2, toHold: 2, toGear: 2, toKidPower: 2, toStop: 2,
  toRotate: 3, toSlow: 3, toKidRotate: 3, toSteep: 4, toEase: 4, toKidEase: 4, toOff: 4,
});

// The climb speed the coach calls: the speed the takeoff trim (trim.js takeoffTrimAoaDeg, 0141)
// flies at these flaps (flaps up Vy where published, else 1.2 Vr; trim.js's own rule, written out:
// importing trim.js split it out of the boot chunk, +620 B; a unit test holds the two equal). null for
// a fly-by-wire airframe (the F-16's pitchFbw carries the trim with α, so a released stick holds no
// speed, and full power runs it past 300 kt in the first 1,000 ft: panel): it is told an attitude.
export const climbKts = (spec, flapsIndex) => (spec.pitchFbw ? null
  : Math.round(!flapsIndex && spec.vyKts || 1.2 * spec.vrKts));

// Words with this airframe's numbers at these flaps (the card reads coach.js coachText:
// TOUCH_WORDS on a touch screen, else DRILL_TEXT). The keyboard's nose up is S or ↑ and power is
// Shift (the top bar's POWER reads it); the touch stick is "drag up to raise the nose" (index.html),
// so a touch word never says "pull back" (first-timer panel: dragged towards you, the nose went down).
export function takeoffWords(key, spec, flapsIndex = 0) {
  const pitch = ROTATE_PITCH_DEG[key] ?? 8;
  const vr = Math.round(spec.vrKts);
  const climb = climbKts(spec, flapsIndex);
  return {
    keys: {
      toPower: 'Full power: hold Shift until POWER 100%',
      toBrakes: 'Brakes off (B): let it roll',
      toRoll: `On the centreline: rotate at ${vr} kt`,
      toLeft: 'Drifting left: rudder right (E)',
      toRight: 'Drifting right: rudder left (Q)',
      toOff: 'Off the runway: power idle, brakes (B)',
      toStop: 'Stopping: brakes on (B)',
      toRotate: `Rotate: nose up (S or ↑) to ${pitch}°`,
      toHold: `Hold ${pitch}°: it lifts off by itself`,
      toEase: 'Ease the nose down: the tail is close',
      toSteep: 'Too steep: nose down a little',
      toSlow: 'Slow: lower the nose a little',
      toGear: 'Positive rate: gear up (G)',
      toClimb: climb ? `Climbing: hold ${climb} kt, wings level` : `Climbing: nose ${pitch}° up, wings level`,
      toKidPower: 'Hold Shift: power up to 100%',
      toKidRoll: `Let it roll: nose up (↑) at ${vr} kt`,
      toKidRotate: 'Hold ↑ gently: the nose comes up',
      toKidEase: 'Not so high! Let the nose down a bit',
      toKidClimb: 'Let go: the plane climbs by itself',
    },
    touch: {
      toPower: 'Full power: slide the throttle to the top',
      toBrakes: 'Tap BRAKES to let it roll',
      toLeft: 'Drifting left: stick right to steer',
      toRight: 'Drifting right: stick left to steer',
      toOff: 'Off the runway: power idle, tap BRAKES',
      toStop: 'Stopping: tap BRAKES',
      toRotate: `Rotate: stick up to ${pitch}° nose up`,
      toGear: 'Positive rate: tap GEAR to raise it',
      toKidPower: 'Push the throttle to the top',
      toKidRoll: `Let it roll: stick up at ${vr} kt`,
      toKidRotate: 'Slide the stick up gently: nose up',
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
  st.slowKts = slowKtsFor(spec, null);
  st.retractable = !spec.fixedGear;
  st.climbKts = climbKts(spec, flapsIndex) ?? spec.vrKts * 1.2;
  st.blank = true; // one quiet frame: main.js re-reads the words only when the prompt changes (device panel)
  return st;
}
// A new airframe on the runway is a new takeoff (setAircraft re-seats it: a bounce is not a flight).
const resetFlight = (st) => { st.over = false; st.rolled = false; st.rejected = false; st.flew = false; st.last = null; st.left = {}; };

export const createTakeoffCoach = (key, spec, flapsIndex = 0) => configureTakeoffCoach({
  over: false, rolled: false, rejected: false, flew: false, last: null, left: {}, blank: false, prevCross: null, prevT: 0, crossRate: 0, touch: null,
  prompt(sim, pitchDeg) { return takeoffPromptFor(this, sim, pitchDeg); }, // main.js calls it (no lib handle on the boot side)
}, key, spec, flapsIndex);

// The prompt the roll or the climb asks for now (null: nothing to say). s: { onGround, raFt (the
// wheels' height), aglFt, iasKts, gsKts, vsiFpm, throttle, brakesOn, gearDown, kid, crossM (+ =
// right of the centreline), crossRateMps (its rate), halfWidthM (the runway's; 0 unknown), pitchDeg,
// pitchRateDegS (+ = nose up), autoSteer (the game holds the centreline: Kid and Learner, or touch
// over 40 kt, assists.js groundSteerRudder / input.js touchGroundRudder) }.
export function takeoffTarget(st, s) {
  if (st.over || s.aglFt > DONE_FT) { st.over = true; return null; }
  // Off the wheels before any takeoff roll (an airframe swapped in drops onto its struts): nothing.
  if (!s.onGround && !st.rolled) return null;
  if (!s.onGround && s.raFt > 5) st.flew = true;
  // Back on the runway after flying (a hop, a landing): the landing grade takes it, the coach is done.
  else if (s.onGround && st.flew) { st.over = true; return null; }
  const low = s.onGround || s.raFt < TAIL_FT;
  if (low && s.pitchDeg + Math.max(0, s.pitchRateDegS ?? 0) * TAIL_LEAD_S > st.tailDeg) return s.kid ? 'toKidEase' : 'toEase';
  if (s.onGround) {
    if (s.halfWidthM > 0 && Math.abs(s.crossM) > s.halfWidthM) return 'toOff';
    if (s.throttle >= 0.9 && s.iasKts > 30) st.rolled = true;
    // The power back on a roll that was set: a rejected takeoff. Brakes, then quiet; never "full power" again.
    if (st.rolled && s.throttle < 0.5 && s.iasKts < st.vrKts) st.rejected = true;
    if (st.rejected) {
      if (s.gsKts < 3) { st.over = true; return null; }
      return s.brakesOn ? null : 'toStop';
    }
    if (s.iasKts >= st.vrKts) return s.kid ? 'toKidRotate' : s.pitchDeg < st.pitchDeg - 1 ? 'toRotate' : 'toHold';
    if (s.throttle < 0.9 && s.iasKts < 30) return s.kid ? 'toKidPower' : 'toPower';
    if (s.brakesOn) return 'toBrakes';
    const ahead = s.crossM + (s.crossRateMps ?? 0) * OFF_LEAD_S;
    if (!s.autoSteer && s.gsKts > 5 && Math.abs(ahead) > OFF_M) return ahead > 0 ? 'toRight' : 'toLeft';
    return s.kid ? 'toKidRoll' : 'toRoll';
  }
  if (s.kid) return 'toKidClimb';
  if (s.raFt > 5 && s.iasKts < st.slowKts) return 'toSlow';
  if (s.pitchDeg > st.pitchDeg + STEEP_DEG && s.iasKts < st.climbKts - STEEP_KTS) return 'toSteep';
  if (st.retractable && s.gearDown && s.raFt > 5 && s.vsiFpm > 300) return 'toGear';
  return 'toClimb';
}

// takeoffTarget with the no-repeat rule: a prompt that left less than REPEAT_S ago holds the
// one showing instead of coming back (no "left, right, left" flicker on the roll). t: sim time.
export function takeoffPrompt(st, s, t) {
  let k = takeoffTarget(st, s);
  // One null frame clears the card at once (coach.js), where a lower rank would wait 1.5 s: after the
  // tail call (it lingered to ~90 ft into the climb, device panel), and after new words (configure).
  const easing = st.last === 'toEase' || st.last === 'toKidEase';
  if (st.blank || (easing && k !== st.last && (RANK[k] ?? 1) < 4)) { st.blank = false; st.last = null; return null; }
  if (k !== st.last && k !== null && st.last !== null && (RANK[k] ?? 1) < 4 && t - (st.left[k] ?? -Infinity) < REPEAT_S) k = st.last;
  if (k !== st.last && st.last !== null) st.left[st.last] = t;
  st.last = k;
  return k;
}

// The game's input, from main.js's sim (no allocation: one object reused per coach).
const _in = {
  onGround: true, raFt: 0, aglFt: 0, iasKts: 0, gsKts: 0, vsiFpm: 0, throttle: 0, brakesOn: false, gearDown: true, kid: false,
  crossM: 0, crossRateMps: 0, halfWidthM: 0, pitchDeg: 0, pitchRateDegS: 0, autoSteer: false,
};
export function takeoffPromptFor(st, sim, pitchDeg) {
  // Another airframe or flap notch picked: its numbers and words (the climb speed is the flaps').
  if (st.key !== sim.aircraftKey) resetFlight(st);
  if (st.key !== sim.aircraftKey || st.flaps !== sim.flapsIndex) configureTakeoffCoach(st, sim.aircraftKey, sim.spec, sim.flapsIndex);
  st.touch ??= globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false; // main.js touchOnly's test
  const t = sim.simTime, cross = sim.approach.crossM, dt = t - st.prevT;
  if (st.prevCross !== null && dt > 0 && dt < 1) st.crossRate += ((cross - st.prevCross) / dt - st.crossRate) * Math.min(1, dt * 5);
  st.prevCross = cross; st.prevT = t;
  _in.onGround = sim.onGround; _in.raFt = sim.raFt; _in.aglFt = sim.aglFt; _in.iasKts = sim.iasKts; _in.gsKts = sim.gsKts;
  _in.vsiFpm = sim.vsiFpm; _in.throttle = sim.throttle; _in.brakesOn = sim.brakesOn; _in.gearDown = sim.gearDown;
  _in.kid = sim.assist === 'kid'; _in.crossM = cross; _in.crossRateMps = st.crossRate; _in.pitchDeg = pitchDeg;
  _in.halfWidthM = (sim.activeEnd?.widthM ?? 0) / 2;
  _in.pitchRateDegS = (sim.angVel?.x ?? 0) * 180 / Math.PI;
  _in.autoSteer = sim.assist !== 'pilot' || (st.touch && sim.gsKts > 40);
  st.slowKts = slowKtsFor(sim.spec, sim.stallKts);
  return takeoffPrompt(st, _in, t);
}
