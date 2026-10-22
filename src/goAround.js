// Go-around drill (ticket 0047): the mission spawns fast and high on the 35C final, the
// stabilized-approach gate (aero.js, 0020) calls "unstabilized, go around", and the player is
// graded on the missed approach: power, pitch, flaps up a notch, positive rate, gear up.
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
// The coach flies the missed approach to here (runway heading).
export const GA_CLIMB_TO_FT = 2000;

// phase: 'approach' (no verdict yet, or a stabilized one: land it), 'goAround' (the gate
// said unstabilized), 'complete' (climbing away: graded), 'landed' (landed anyway).
export const createGoAround = () => ({ phase: 'approach', gate: null, lowFt: 0, minIasKts: 0, climbFpm: 0 });

// One frame. st is mutated (no allocation); s: { gate (sim.gate: null until the gate
// evaluates), aaeFt (height above the runway), vsFpm, iasKts, onGround }. Returns the
// transition this frame: 'goAround' | 'complete' | 'landed' | ''.
export function goAroundState(st, s) {
  if (st.phase === 'approach') {
    if (!s.gate || s.gate.stable || s.onGround) return '';
    st.phase = 'goAround'; st.gate = s.gate; st.lowFt = s.aaeFt; st.minIasKts = s.iasKts;
    return 'goAround';
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

const WEIGHTS = { decision: 0.35, climb: 0.25, speed: 0.25, config: 0.15 };

// The go-around's grade. t: { lowFt, gateFt, minIasKts, vrefKts, climbFpm, flapsUp (a notch
// up from landing flaps), gearUp (null for fixed gear) }.
export function gradeGoAround(t) {
  const cfg = (t.flapsUp ? 50 : 0) + (t.gearUp !== false ? 50 : 0);
  const factors = [
    // How promptly: the lower it sinks past the gate, the later the decision.
    { key: 'decision', label: 'Went around', value: `lowest ${Math.round(t.lowFt)} ft (gate ${t.gateFt})`,
      score: curve(t.lowFt / t.gateFt, [[0, 0], [0.2, 30], [0.5, 70], [0.8, 100]]) },
    { key: 'climb', label: `Climb at ${GA_COMPLETE_FT} ft`, value: `${Math.round(t.climbFpm)} fpm`,
      score: curve(t.climbFpm, [[GA_MIN_CLIMB_FPM, 40], [300, 70], [600, 100]]) },
    // Pitching up without the power to back it bleeds speed towards the stall.
    { key: 'speed', label: 'Slowest speed', value: `${Math.round(t.minIasKts)} kt (Vref ${t.vrefKts})`,
      score: curve(t.minIasKts - t.vrefKts, [[-15, 0], [-5, 60], [0, 100]]) },
    { key: 'config', label: 'Flaps · gear', value: `${t.flapsUp ? 'flaps up a notch' : 'landing flaps'} · ${t.gearUp === null ? 'fixed gear' : t.gearUp ? 'gear up' : 'gear down'}`,
      score: cfg },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  const score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  return { kind: 'goAround', grade: letterGrade(score), score, factors, reason: null };
}

// Landing after the gate called a go-around: the grade is capped at D, and the card says why.
export const GA_CAP_SCORE = 54;
export const GA_CAP_REASON = 'Should have gone around: the approach was unstabilized at the gate. Grade capped at D.';
export function capUnstableLanding(result) {
  if (result.grade === 'CRASH') return result;
  return {
    ...result, grade: 'D', score: Math.min(result.score, GA_CAP_SCORE),
    reason: result.reason ? `${GA_CAP_REASON} ${result.reason}` : GA_CAP_REASON,
  };
}
