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

export const COACH_PROMPTS = {
  papi: 'Keep two white, two red on the PAPI',
  high: "You're high: ease the nose down",
  low: "You're low: raise the nose, add power",
  sink: 'Sinking fast: raise the nose, add power',
  flare: 'Flare now: ease back on the stick',
  idle: 'Idle the throttle',
  done: 'Touchdown! Hold the brakes to stop',
  // Kid level (assists.js flies the power and the flare): one prompt, nothing to contradict it
  kid: 'Let go of the stick: the plane lands itself',
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
  // The go-around (0047, after the gate called it): power, pitch, flaps a notch, gear, climb.
  gaPower: 'Go around! Full power',
  gaPitch: 'Pitch up: stop the descent',
  gaFlaps: 'Flaps up one notch: press F',
  gaGear: 'Positive rate: gear up (G)',
  gaClimb: 'Climb straight ahead to 2,000 ft',
  gaKid: 'Going around: the plane climbs for another try',
};
// Higher rank interrupts at once; guidance about the path and the centreline shares a rank.
const RANK = {
  papi: 1, high: 1, low: 1, kid: 1, fast: 1, offLeft: 1, offRight: 1,
  slow: 2, flaps: 2, sink: 2, gear: 3, flare: 3, decrab: 3, idle: 4,
  done: 5, brake: 5, reverse: 5, stow: 5, stopped: 6,
  gaPower: 4, gaPitch: 4, gaFlaps: 4, gaGear: 4, gaClimb: 4, gaKid: 4,
};

// On a touch screen the keys are buttons.
const TOUCH_WORDS = {
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
  return COACH_PROMPTS[key];
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

// s: { aglFt, vsiFpm, papiWhite (0..4, null = no runway ahead), throttle (0..1),
//      onGround, autopilot, kid (Kid assist level: the airplane flies power and flare),
//      optional: iasKts, targetKts (Vref + 5), locDots (+ = right of the centreline),
//      gearLocked, flapsLanding, flareFt (default 50), idleFt (default 30), driftDeg,
//      goAround (the go-around drill's missed approach: goAroundTarget) }
export function coachTarget(s) {
  if (s.onGround || s.autopilot) return null;
  if (s.goAround) return goAroundTarget(s);
  if (s.kid) return s.papiWhite === null || s.papiWhite === undefined || s.aglFt < 50 ? null : 'kid';
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
  return 'papi';
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
  if (target === null || c.prompt === null || RANK[target] > RANK[c.prompt]) {
    c.prompt = target; c.pending = null; c.pendingS = 0;
    return;
  }
  if (target !== c.pending) { c.pending = target; c.pendingS = 0; }
  c.pendingS += dt;
  if (c.pendingS >= COACH_MIN_HOLD_S) { c.prompt = target; c.pending = null; c.pendingS = 0; }
}

// Advances the coach one frame; mutates and returns c (no per-frame allocation). After the
// touchdown, s.rollout (rolloutTarget's input) drives the rollout prompts.
export function stepCoach(c, s, dt) {
  if (c.done) {
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
