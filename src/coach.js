// First-30-seconds coach (ticket 0008): a few contextual prompts on the default final,
// driven by the PAPI, height and sink rate. Pure: no THREE, no DOM (storage is passed in).
// Tested in tests/unit/coach.test.js.

export const COACH_KEY = 'openaero_coach_v1';
export const COACH_MISSION = 'kdfw_35c_final';
// A prompt stays up at least this long before a same-or-lower-rank prompt replaces it.
export const COACH_MIN_HOLD_S = 1.5;

export const COACH_PROMPTS = {
  papi: 'Keep two white, two red on the PAPI',
  high: "You're high: ease the nose down",
  low: "You're low: raise the nose, add power",
  sink: 'Sinking fast: raise the nose, add power',
  flare: 'Flare now: ease back on the stick',
  idle: 'Idle the throttle',
  done: 'Touchdown! Brakes on (B) to stop',
};
// Higher rank interrupts at once; guidance about the PAPI shares one rank.
const RANK = { papi: 1, high: 1, low: 1, sink: 2, flare: 3, idle: 4, done: 5 };

// s: { aglFt, vsiFpm, papiWhite (0..4, null = no runway ahead), throttle (0..1),
//      onGround, autopilot }
export function coachTarget(s) {
  if (s.onGround || s.autopilot) return null;
  if (s.aglFt < 30 && s.throttle > 0.05) return 'idle';
  if (s.aglFt < 50) return 'flare';
  if (s.papiWhite === null || s.papiWhite === undefined) return null;
  if (s.aglFt < 1000 && s.vsiFpm < -1200) return 'sink';
  if (s.papiWhite >= 3) return 'high';
  if (s.papiWhite <= 1) return 'low';
  return 'papi';
}

export const createCoach = () => ({ prompt: null, held: 0, flown: false, done: false });

// Advances the coach one frame; mutates and returns c (no per-frame allocation).
export function stepCoach(c, s, dt) {
  if (c.done) return c;
  if (!s.onGround) c.flown = true;
  else if (c.flown) { c.done = true; c.prompt = 'done'; c.held = 0; return c; }
  c.held += dt;
  const target = coachTarget(s);
  if (target === c.prompt) return c;
  if (target === null || c.prompt === null || RANK[target] > RANK[c.prompt] || c.held >= COACH_MIN_HOLD_S) {
    c.prompt = target;
    c.held = 0;
  }
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
