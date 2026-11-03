// Landing coach (tickets 0008, 0073): contextual prompts on every final, from 2,000 ft to a
// stop. Configuration (gear, landing flaps), speed against the target (Vref + 5), the
// centreline, the glidepath (PAPI), sink rate, the flare and the crosswind de-crab, then the
// rollout (reverse, brakes, stow the reversers, stopped). Pure: no THREE, no DOM (storage is
// passed in). Tested in tests/unit/coach.test.js. Inputs a caller doesn't have are left out
// and their prompts never fire (the first-flight coach of 0008 needs only the first six).

export const COACH_KEY = 'openaero_coach_v1';
export const COACH_MISSION = 'kdfw_35c_final';
// A same-or-lower-rank prompt replaces the current one only after its condition has held
// this long (debounce: a one-frame PAPI blip near a lamp boundary changes nothing).
export const COACH_MIN_HOLD_S = 1.5;
// After touchdown "Touchdown!" stays this long before the rollout prompts take over.
export const COACH_DONE_HOLD_S = 2;
// The FAA Airplane Flying Handbook saves only a slight bounce (power to cushion it); a severe
// one is a go-around, and the Flight Safety Foundation puts "don't try to land" at ~5 ft.
export const BOUNCE_HIGH_FT = 5;

export const COACH_PROMPTS = {
  papi: 'Keep two white, two red on the PAPI',
  wet: 'Wet runway: brake early, longer roll', // a METAR with rain (0108)
  high: "You're high: ease the nose down",
  low: "You're low: raise the nose, add power",
  sink: 'Sinking fast: raise the nose, add power',
  flare: 'Flare now: ease back on the stick',
  idle: 'Idle the throttle',
  done: 'Touchdown! Hold the brakes to stop',
  // Kid level (assists.js flies the power and the flare): one prompt, nothing to contradict it
  kid: 'Let go of the stick: the plane lands itself',
  kidWet: 'Wet runway: let go, then hold BRAKES to stop', // Kid on a wet METAR (0108)
  gear: 'Gear down! (G) You are about to land',
  flaps: 'Landing flaps: press F until 30°',
  slow: 'Slow: add power, nose a touch down',
  fast: 'Fast: ease the power back',
  offLeft: 'Left of the centreline: bank gently right',
  offRight: 'Right of the centreline: bank gently left',
  decrab: 'Flare, and rudder the nose straight',
  reverse: 'Reverse thrust: R, then add power',
  brake: 'Brakes on (B) to stop',
  stow: 'Stow the reversers (R), 60 kt',
  stopped: 'Stopped. Nicely flown!',
  // A bounced landing (0091), while back in the air after the first touchdown. Not "pitch
  // down": pushing the nose over on a bounce flies the nose wheel into the runway.
  bounce: 'Bounced: hold the attitude, add a little power',
  bounceGa: 'Bounced again: go around! Full power',
  bounceHigh: 'Big bounce: go around! Full power', // AFH: a severe bounce is not saved
  bounceKid: 'Bounced! Let go: the plane lands itself', // Kid: the autothrottle has the power
  // The go-around (0047, after the gate called it): power, pitch, flaps a notch, gear, climb.
  gaFlaps: 'Flaps up one notch: press F',
};
// The drills' own prompts are ranked here and worded in their lazy chunks (no boot bytes),
// which add their words to DRILL_TEXT when they load: the go-around's ga* (goAround.js
// GA_TEXT; gaFlaps stays here, it has numbers), the stall drill's st* (stallDrill.js
// STALL_TEXT), the dead-stick's ds* (deadStick.js DS_TEXT, rank 1) and the traffic pattern's
// pt* (pattern.js PT_TEXT, rank 1, through s.ds).
export const DRILL_TEXT = {};
// Higher rank interrupts at once; guidance about the path and the centreline shares a rank.
export const RANK = {
  papi: 1, wet: 1, high: 1, low: 1, kid: 1, fast: 1, offLeft: 1, offRight: 1,
  slow: 2, flaps: 2, sink: 2, gear: 3, flare: 3, decrab: 3, idle: 4,
  done: 5, brake: 5, reverse: 5, stow: 5, stopped: 6, bounce: 5, bounceGa: 5, bounceHigh: 5, bounceKid: 5,
  gaPower: 4, gaPitch: 4, gaFlaps: 4, gaGear: 4, gaClimb: 4, gaKid: 4,
  stIdle: 4, stSlow: 4, stKidSlow: 4, stPower: 4, stWings: 4, stClimb: 4, stNose: 5, stKid: 5,
};

// On a touch screen the keys are buttons (a drill's chunk adds its own, e.g. windshear.js).
export const TOUCH_WORDS = {
  gear: 'Gear down! Tap GEAR: you are about to land',
  reverse: 'Reverse thrust: tap REV, then add power',
  brake: 'Tap BRAKES to stop',
  stow: 'Tap REV to stow the reversers, 60 kt',
  gaFlaps: 'Flaps up one notch: tap FLAPS',
  gaGear: 'Positive rate: tap GEAR to raise it',
};

// Words with numbers for the prompts that have them (the card and the voice); built only
// when the prompt changes. v: { targetKts, flapsDeg, touch (buttons, not keys) }.
export function coachText(key, v = {}) {
  if (key === 'slow' && v.targetKts) return `Slow: fly ${v.targetKts} kt, add power`;
  if (key === 'fast' && v.targetKts) return `Fast: fly ${v.targetKts} kt, ease the power back`;
  if (key === 'gaFlaps' && typeof v.flapsDeg === 'number') return v.touch ? `Flaps up a notch: tap FLAPS to ${v.flapsDeg}°` : `Flaps up a notch: press F, to ${v.flapsDeg}°`;
  if (key === 'flaps' && v.flapsDeg) return v.touch ? `Landing flaps: tap FLAPS until ${v.flapsDeg}°` : `Landing flaps: press F until ${v.flapsDeg}°`;
  if (v.touch && TOUCH_WORDS[key]) return TOUCH_WORDS[key];
  return COACH_PROMPTS[key] ?? DRILL_TEXT[key];
}

// The missed approach, step by step (s.goAround, set by main.js after the gate called it):
// s.throttle, s.vsiFpm, s.flapsLanding (still at landing flaps), s.gearLocked (retractable
// gear still down; leave it undefined for fixed gear).
export function goAroundTarget(s) {
  if (s.kid) return 'gaKid';
  if (s.throttle < 0.9) return 'gaPower';
  if (s.vsiFpm <= 0) return 'gaPitch';
  if (s.flapsLanding) return 'gaFlaps';
  if (s.gearLocked) return 'gaGear';
  return 'gaClimb';
}

// The stall drill, step by step (s.stall: stallDrill.js's phase, set by main.js): s.throttle,
// s.bankDeg, s.kid. Nothing once it is graded.
export function stallTarget(s) {
  if (s.stall === 'armed') return s.kid ? 'stKidSlow' : s.throttle > 0.05 ? 'stIdle' : 'stSlow';
  if (s.stall === 'stalled') return s.kid ? 'stKid' : 'stNose';
  if (s.stall !== 'unstalled') return null;
  if (s.kid) return 'stKid';
  // The Handbook's order: angle of attack down (done: unstalled), wings level, then power.
  if (Math.abs(s.bankDeg ?? 0) > 5) return 'stWings';
  if (s.throttle < 0.9) return 'stPower';
  return 'stClimb';
}

// s: { aglFt, vsiFpm, papiWhite (0..4, null = no runway ahead), throttle (0..1),
//      onGround, autopilot, kid (Kid assist level: the airplane flies power and flare),
//      optional: iasKts, targetKts (Vref + 5), locDots (+ = right of the centreline),
//      gearLocked, flapsLanding, flareFt (default 50), idleFt (default 30), driftDeg,
//      goAround (the go-around drill's missed approach: goAroundTarget), stall (the stall
//      drill's phase: stallTarget), ds (the dead-stick challenge's or the traffic pattern's
//      prompt key, its words in deadStick.js DS_TEXT or pattern.js PT_TEXT; rank 1),
//      dsGround (on the runway before any lift-off: the engine-failure takeoff's, 0104),
//      wet (the METAR's rain wets the runway: said on a steady final above 500 ft, 0108) }
export function coachTarget(s) {
  if (s.autopilot) return null;
  if (s.onGround) return s.dsGround ?? null; // before the first lift-off: a drill's takeoff words (0104)
  if (s.stall) return stallTarget(s);
  if (s.ds) return s.ds; // the dead-stick challenge's own prompt (deadStick.js), above the flare
  if (s.goAround) return goAroundTarget(s);
  if (s.kid) return s.papiWhite === null || s.papiWhite === undefined || s.aglFt < 50 ? null : s.wet ? 'kidWet' : 'kid';
  if (s.aglFt < (s.idleFt ?? 30) && s.throttle > 0.05) return 'idle';
  if (s.aglFt < (s.flareFt ?? 50)) return Math.abs(s.driftDeg ?? 0) > 4 ? 'decrab' : 'flare';
  if (s.papiWhite === null || s.papiWhite === undefined) return null;
  if (s.gearLocked === false && s.aglFt < 2000) return 'gear';
  if (s.flapsLanding === false && s.aglFt < 1500) return 'flaps';
  if (s.aglFt < 1000 && s.vsiFpm < -1200) return 'sink';
  const fast = s.targetKts ? s.iasKts - s.targetKts : 0;
  if (fast < -5) return 'slow';
  if (Math.abs(s.locDots ?? 0) > 0.6) return s.locDots > 0 ? 'offRight' : 'offLeft';
  if (s.papiWhite >= 3) return 'high';
  if (s.papiWhite <= 1) return 'low';
  if (fast > 10) return 'fast';
  return s.wet && s.aglFt > 500 ? 'wet' : 'papi';
}

// On the ground after the landing. r: { gsKts, canReverse (the airframe has reversers and
// the player a key for them), reverserPos (0..1), braking (pedals or autobrake working) }.
// null keeps whatever is showing.
export function rolloutTarget(r) {
  if (typeof r.gsKts !== 'number') return null;
  if (r.gsKts < 3) return 'stopped';
  if (r.reverserPos > 0 && r.gsKts < 70) return 'stow';
  if (r.canReverse && !(r.reverserPos > 0) && r.gsKts > 80) return 'reverse';
  if (!r.braking && r.gsKts > 20) return 'brake';
  return null;
}

export const createCoach = () => ({ prompt: null, pending: null, pendingS: 0, flown: false, done: false, doneS: 0 });

// Debounced change of the prompt: silence and escalation are immediate, anything else must
// hold for COACH_MIN_HOLD_S.
function settle(c, target, dt) {
  if (target === c.prompt) { c.pending = null; c.pendingS = 0; return; }
  if (target === null || c.prompt === null || (RANK[target] ?? 1) > (RANK[c.prompt] ?? 1)) {
    c.prompt = target; c.pending = null; c.pendingS = 0;
    return;
  }
  if (target !== c.pending) { c.pending = target; c.pendingS = 0; }
  c.pendingS += dt;
  if (c.pendingS >= COACH_MIN_HOLD_S) { c.prompt = target; c.pending = null; c.pendingS = 0; }
}

// Advances the coach one frame; mutates and returns c (no per-frame allocation). After the
// touchdown, s.rollout (rolloutTarget's input) drives the rollout prompts, and s.bounces
// (landing.js stepBounce's count) the bounce prompts while the wheels are off again, and
// s.bounceHigh (the wheels went past BOUNCE_HIGH_FT) turns the first one into a go-around.
export function stepCoach(c, s, dt) {
  if (c.done) {
    if (s.bounces > 0 && !s.onGround) {
      c.prompt = s.kid ? 'bounceKid' : s.noPower ? 'dsBounce' : s.bounces >= 2 ? 'bounceGa' : s.bounceHigh ? 'bounceHigh' : 'bounce'; c.pending = null; c.pendingS = 0; c.doneS = 0;
      return c;
    }
    // Back on the wheels: the bounce prompt clears, the rollout prompts follow after the hold.
    if (c.prompt?.startsWith('bounce') && s.onGround) c.prompt = null;
    c.doneS += dt;
    if (c.prompt === 'stopped' || !s.onGround || c.doneS < COACH_DONE_HOLD_S || !s.rollout) return c;
    const target = rolloutTarget(s.rollout);
    if (target === null) return c;
    if (target !== c.prompt) { c.prompt = target; c.pending = null; c.pendingS = 0; } // each rollout step at once
    return c;
  }
  if (!s.onGround) c.flown = true;
  else if (c.flown) { c.done = true; c.prompt = 'done'; c.doneS = 0; return c; }
  settle(c, coachTarget(s), dt);
  return c;
}

export function coachSeen(storage) {
  try {
    const data = JSON.parse(storage.getItem(COACH_KEY) || 'null');
    return !!(data && data.v === 1 && data.seen === true);
  } catch {
    return false;
  }
}

export function markCoachSeen(storage, now = Date.now()) {
  try { storage.setItem(COACH_KEY, JSON.stringify({ v: 1, seen: true, at: now })); } catch { /* private mode */ }
}
