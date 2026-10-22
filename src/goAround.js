// Go-around drill (ticket 0047): the mission spawns fast and high on the 35C final, the
// stabilized-approach gate (aero.js, 0020) calls "unstabilized, go around", and the player is
// graded on the missed approach: power, pitch, flaps up a notch, positive rate, gear up.
// Going around early, before the gate, counts as well.
// The FAA's Airplane Flying Handbook (ch. 8, "Go-Arounds (Rejected Landings)") is the
// procedure. Pure: no THREE, no DOM. Tested in tests/unit/goAround.test.js.
import { curve, letterGrade } from './landing.js';

export const GO_AROUND_KEY = 'go_around_drill';
// Complete = climbing at least this fast through 500 ft above the runway, after the gate.
export const GA_COMPLETE_FT = 500;
export const GA_MIN_CLIMB_FPM = 100;
// ...and at least this far above the lowest point of the go-around (an IMC gate at 1,000 ft
// never takes the airplane below 500, and a bump is not a climb).
export const GA_MIN_GAIN_FT = 50;
// The drill's missed approach climbs straight ahead to here (a drill target, not the
// published KDFW ILS 35C missed approach). The thresholds above and the grade's curves and
// weights below are our own estimates of a crisp go-around, not published numbers.
export const GA_CLIMB_TO_FT = 2000;

// An early go-around, before the gate ever called it, counts too (the approach was plainly
// unstable): go-around power and a real climb from below this height above the runway.
export const GA_EARLY_BELOW_FT = 1000;
export const GA_EARLY_GAIN_FT = 100;
export const GA_POWER = 0.9;

// phase: 'approach' (no verdict yet, or a stabilized one: land it), 'goAround' (the gate
// said unstabilized), 'complete' (climbing away: graded), 'done' (the missed approach is
// over: at 2,000 ft or descending again), 'landed' (landed anyway). callFt: the height of
// the gate's call (null for an early go-around); callFlaps: the flap lever then (the most
// flap of the approach for an early one), so "a notch up" is from what was set.
export const createGoAround = () => ({
  phase: 'approach', gate: null, callFt: null, callFlaps: 0, lowFt: Infinity, minIasKts: Infinity, climbFpm: 0,
});

// One frame. st is mutated (no allocation); s: { gate (sim.gate: null until the gate
// evaluates), aaeFt (height above the runway), vsFpm, iasKts, throttle (0..1), flapsIndex,
// onGround }.
// Returns the transition this frame: 'goAround' | 'complete' | 'done' | 'landed' | ''.
export function goAroundState(st, s) {
  if (st.phase === 'approach') {
    if (s.onGround) return '';
    if (s.aaeFt < st.lowFt) st.lowFt = s.aaeFt;
    if (s.iasKts < st.minIasKts) st.minIasKts = s.iasKts;
    if (s.gate && !s.gate.stable) {
      st.phase = 'goAround'; st.gate = s.gate; st.callFt = s.aaeFt; st.lowFt = s.aaeFt; st.minIasKts = s.iasKts;
      st.callFlaps = s.flapsIndex;
      return 'goAround';
    }
    if (!s.gate && st.lowFt < GA_EARLY_BELOW_FT && s.throttle >= GA_POWER && s.vsFpm >= GA_MIN_CLIMB_FPM
      && s.aaeFt >= st.lowFt + GA_EARLY_GAIN_FT) {
      st.phase = 'complete'; st.climbFpm = s.vsFpm;
      return 'complete';
    }
    if (s.flapsIndex > st.callFlaps) st.callFlaps = s.flapsIndex;
    return '';
  }
  if (st.phase === 'complete') {
    if (s.onGround || s.aaeFt >= GA_CLIMB_TO_FT || s.vsFpm < -300) { st.phase = 'done'; return 'done'; }
    return '';
  }
  if (st.phase !== 'goAround') return '';
  if (s.onGround) { st.phase = 'landed'; return 'landed'; }
  if (s.aaeFt < st.lowFt) st.lowFt = s.aaeFt;
  if (s.iasKts < st.minIasKts) st.minIasKts = s.iasKts;
  if (s.vsFpm >= GA_MIN_CLIMB_FPM && s.aaeFt >= GA_COMPLETE_FT && s.aaeFt >= st.lowFt + GA_MIN_GAIN_FT) {
    st.phase = 'complete'; st.climbFpm = s.vsFpm;
    return 'complete';
  }
  return '';
}

const WEIGHTS = { decision: 0.35, climb: 0.25, speed: 0.25, flaps: 0.15 };
export const GA_EARLY_NOTE = 'Early go-around, before the gate: good call.';

// The go-around's grade. t: { callFt (null: early), lowFt, gateFt, minIasKts, vrefKts,
// climbFpm, flapsUp (a notch up from landing flaps by now; null when the assist flies the
// flaps: not scored) }. The gear is coached, not scored: at 500 ft there has barely been
// time for positive rate, gear up.
export function gradeGoAround(t) {
  const early = t.callFt === null;
  const factors = [
    // How promptly: the lower it sinks after the call, the later the decision.
    { key: 'decision', label: 'Height lost after the call',
      value: early ? 'none: went around early' : `${Math.max(0, Math.round(t.callFt - t.lowFt))} ft`,
      score: early ? 100 : curve(t.lowFt / t.gateFt, [[0, 0], [0.2, 30], [0.5, 70], [0.8, 100]]) },
    { key: 'climb', label: 'Climb rate', value: `${Math.round(t.climbFpm)} fpm`,
      score: curve(t.climbFpm, [[GA_MIN_CLIMB_FPM, 40], [300, 70], [600, 100]]) },
    // Pitching up without the power to back it bleeds speed towards the stall.
    { key: 'speed', label: 'Slowest speed', value: `${Math.round(t.minIasKts)} kt (Vref ${t.vrefKts})`,
      score: curve(t.minIasKts - t.vrefKts, [[-15, 0], [-5, 60], [0, 100]]) },
  ];
  if (t.flapsUp !== null) {
    factors.push({ key: 'flaps', label: 'Flaps', value: t.flapsUp ? 'up a notch' : 'still at landing flaps', score: t.flapsUp ? 100 : 0 });
  }
  for (const f of factors) f.score = Math.round(f.score);
  const w = factors.reduce((sum, f) => sum + WEIGHTS[f.key], 0);
  const score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0) / w);
  return { kind: 'goAround', grade: letterGrade(score), score, factors, reason: null, note: early ? GA_EARLY_NOTE : null };
}

// Landing after the gate called a go-around: the grade is capped at D, and the card says why.
export const GA_CAP_SCORE = 54;
export const GA_CAP_REASON = 'Should have gone around: grade capped at D.';
export function capUnstableLanding(result) {
  if (result.grade === 'CRASH') return result;
  return {
    ...result, grade: 'D', score: Math.min(result.score, GA_CAP_SCORE),
    reason: result.reason ? `${GA_CAP_REASON} ${result.reason}` : GA_CAP_REASON,
  };
}
