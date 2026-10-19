// First-30-seconds coach (ticket 0008): a few contextual prompts on the default final,
// driven by the PAPI, height and sink rate. Pure: no THREE, no DOM (storage is passed in).
// Tested in tests/unit/coach.test.js.

export const COACH_KEY = 'openaero_coach_v1';
export const COACH_MISSION = 'kdfw_35c_final';
// A same-or-lower-rank prompt replaces the current one only after its condition has held
// this long (debounce: a one-frame PAPI blip near a lamp boundary changes nothing).
export const COACH_MIN_HOLD_S = 1.5;

export const COACH_PROMPTS = {
  papi: 'Keep two white, two red on the PAPI',
  high: "You're high: ease the nose down",
  low: "You're low: raise the nose, add power",
  sink: 'Sinking fast: raise the nose, add power',
  flare: 'Flare now: ease back on the stick',
  idle: 'Idle the throttle',
  done: 'Touchdown! Hold the brakes to stop',
  // Kid level (assists.js flies the power and the flare): one prompt, nothing to contradict it
  kid: 'Let go of the stick: the plane lines up and lands',
};
// Higher rank interrupts at once; guidance about the PAPI shares one rank.
const RANK = { papi: 1, high: 1, low: 1, kid: 1, sink: 2, flare: 3, idle: 4, done: 5 };

// s: { aglFt, vsiFpm, papiWhite (0..4, null = no runway ahead), throttle (0..1),
//      onGround, autopilot, kid (Kid assist level: the airplane flies power and flare) }
export function coachTarget(s) {
  if (s.onGround || s.autopilot) return null;
  if (s.kid) return s.papiWhite === null || s.papiWhite === undefined || s.aglFt < 50 ? null : 'kid';
  if (s.aglFt < 30 && s.throttle > 0.05) return 'idle';
  if (s.aglFt < 50) return 'flare';
  if (s.papiWhite === null || s.papiWhite === undefined) return null;
  if (s.aglFt < 1000 && s.vsiFpm < -1200) return 'sink';
  if (s.papiWhite >= 3) return 'high';
  if (s.papiWhite <= 1) return 'low';
  return 'papi';
}

export const createCoach = () => ({ prompt: null, pending: null, pendingS: 0, flown: false, done: false });

// Advances the coach one frame; mutates and returns c (no per-frame allocation).
export function stepCoach(c, s, dt) {
  if (c.done) return c;
  if (!s.onGround) c.flown = true;
  else if (c.flown) { c.done = true; c.prompt = 'done'; return c; }
  const target = coachTarget(s);
  if (target === c.prompt) { c.pending = null; c.pendingS = 0; return c; }
  // Silence (ground, autopilot) and escalation are immediate; anything else must hold.
  if (target === null || c.prompt === null || RANK[target] > RANK[c.prompt]) {
    c.prompt = target; c.pending = null; c.pendingS = 0;
    return c;
  }
  if (target !== c.pending) { c.pending = target; c.pendingS = 0; }
  c.pendingS += dt;
  if (c.pendingS >= COACH_MIN_HOLD_S) { c.prompt = target; c.pending = null; c.pendingS = 0; }
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
