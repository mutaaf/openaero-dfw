// Autopilot tutor: while the autopilot flies, say what it is doing and why, in words a
// first-timer (or a kid) can follow, so watching it is a lesson. Pure: no THREE, no DOM;
// tested in tests/unit/apTutor.test.js. main.js shows the caption, speaks it when sound is
// on, lights the stick and throttle the autopilot is moving, and offers "Your turn".

// The tutor's on/off flag and its blank state live in tutorPrefs.js (boot: the start screen's
// checkbox); this module is a lazy chunk main.js loads after boot (0091, boot JS budget).
import { TUTOR_KEY, createTutor, tutorOn, setTutorOn } from './tutorPrefs.js';
export { TUTOR_KEY, createTutor, tutorOn, setTutorOn };
// A same-or-lower-rank caption waits until its condition has held this long, and the
// caption on screen stays at least TUTOR_MIN_READ_S so it can be read.
export const TUTOR_MIN_HOLD_S = 1.5;
export const TUTOR_MIN_READ_S = 3.5;

// v: { targetKts, hdgDeg, altFt } filled in by the caller when the text is shown.
export const TUTOR_TEXT = {
  intercept: () => 'Turning to line up with the runway: watch the stick lean and the wings bank',
  high: () => "A little high: nose down a touch to slide back onto the 3° glidepath",
  low: () => 'A little low: nose up a touch and more power to climb back onto the glidepath',
  slow: (v) => `Speed below ${v.targetKts} kt: pushing the throttle up`,
  fast: (v) => `Speed above ${v.targetKts} kt: easing the throttle back`,
  onpath: () => 'On the glidepath: two white, two red on the PAPI lights by the runway',
  flare: () => 'Flare: raising the nose gently so the wheels touch down softly',
  retard: () => 'Throttle to idle as the wheels reach the runway',
  rollout: () => 'Touchdown! Keep straight on the centreline and brake to stop',
  cruise: (v) => `Holding heading ${v.hdgDeg}° and ${v.altFt} ft: tiny stick moves keep it steady`,
  heading: (v) => `Holding heading ${v.hdgDeg}°: the stick banks the wings to turn, then levels them`,
  altitude: (v) => `Holding ${v.altFt} ft: the nose goes up or down to stay level`,
};
const RANK = { onpath: 1, cruise: 1, heading: 1, altitude: 1, high: 2, low: 2, slow: 2, fast: 2, intercept: 2, flare: 4, retard: 4, rollout: 5 };

// s: { apMaster, apApproach, apHdgHold, apAltHold, onGround, aglFt (radio altitude, 0122), crossM,
//      heightAbovePathM, iasKts, targetKts }
export function tutorTarget(s) {
  if (!s.apMaster) return null;
  if (s.apApproach) {
    if (s.onGround) return 'rollout';
    if (s.aglFt <= 20) return 'retard'; // radio altitude, with the GPWS "retard" (0122)
    if (s.aglFt < 50) return 'flare';
    if (Math.abs(s.crossM) > 30) return 'intercept';
    if (s.heightAbovePathM > 8) return 'high';
    if (s.heightAbovePathM < -8) return 'low';
    if (s.iasKts < s.targetKts - 4) return 'slow';
    if (s.iasKts > s.targetKts + 4) return 'fast';
    return 'onpath';
  }
  if (s.apHdgHold && s.apAltHold) return 'cruise';
  if (s.apHdgHold) return 'heading';
  if (s.apAltHold) return 'altitude';
  return null;
}

// Advances the tutor one frame; mutates and returns t (no per-frame allocation).
export function stepTutor(t, s, dt) {
  const target = tutorTarget(s);
  t.shownS += dt;
  if (target === t.caption) { t.pending = null; t.pendingS = 0; return t; }
  // Autopilot off clears at once; an urgent phase (flare, idle, touchdown) interrupts.
  // Everything else must persist, so a speed blip doesn't flash a caption.
  const urgent = target !== null && RANK[target] >= 4 && (t.caption === null || RANK[target] > RANK[t.caption]);
  if (target === null || t.caption === null || urgent) {
    t.caption = target; t.shownS = 0; t.pending = null; t.pendingS = 0;
    return t;
  }
  if (target !== t.pending) { t.pending = target; t.pendingS = 0; }
  t.pendingS += dt;
  if (t.pendingS >= TUTOR_MIN_HOLD_S && t.shownS >= TUTOR_MIN_READ_S) {
    t.caption = target; t.shownS = 0; t.pending = null; t.pendingS = 0;
  }
  return t;
}
