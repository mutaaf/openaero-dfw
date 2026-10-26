// Landing grade and personal bests. Pure: no THREE, no DOM (storage is passed in).
// Tested in tests/unit/landing.test.js.

export const BEST_KEY = 'openaero_best';
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
// Piecewise-linear score through [x, score] points (x ascending).
export function curve(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  }
  return pts[pts.length - 1][1];
}

const WEIGHTS = { rate: 0.35, centreline: 0.2, zone: 0.2, flare: 0.15, speed: 0.1 };

// t: { vsFpm (negative = descending), crossM, pastThresholdM, runwayLengthM, runwayWidthM,
//      pitchDeg (nose up +), bankDeg, iasKts, vrefKts, driftDeg?, gearLocked? (false = belly) }
// driftDeg (crosswind challenge only) adds a "Crab / de-crab" note; it is not weighted.
export function gradeLanding(t) {
  const sink = Math.max(0, -t.vsFpm);
  const cross = Math.abs(t.crossM);
  const bank = Math.abs(t.bankDeg);

  const factors = [
    { key: 'rate', label: 'Touchdown rate', value: `${Math.round(sink)} fpm`,
      score: curve(sink, [[0, 100], [120, 100], [240, 75], [400, 40], [600, 10]]) },
    { key: 'centreline', label: 'Centreline', value: `${cross.toFixed(1)} m ${t.crossM >= 0 ? 'right' : 'left'}`,
      score: curve(cross, [[0, 100], [3, 100], [t.runwayWidthM / 2, 40]]) },
    { key: 'zone', label: 'Touchdown zone', value: `${Math.round(t.pastThresholdM)} m past threshold`,
      score: t.pastThresholdM < 0 ? 0 : curve(t.pastThresholdM, [[0, 70], [150, 100], [600, 100], [900, 40], [1500, 20]]) },
    { key: 'flare', label: 'Flare', value: `${t.pitchDeg.toFixed(1)}° pitch, ${bank.toFixed(1)}° bank`,
      score: Math.max(0, (t.pitchDeg < 0 ? 40 : curve(t.pitchDeg, [[0, 70], [1, 100], [7, 100], [10, 60]])) - Math.max(0, bank - 2) * 8) },
    { key: 'speed', label: 'Speed', value: `${Math.round(t.iasKts)} kt (Vref ${t.vrefKts})`,
      score: curve(t.iasKts - t.vrefKts, [[-20, 20], [-5, 100], [10, 100], [30, 30]]) },
  ];
  if (typeof t.driftDeg === 'number') {
    const drift = Math.abs(t.driftDeg);
    factors.push({ key: 'crab', label: 'Crab / de-crab', value: `${drift.toFixed(1)}° drift (not scored)`,
      score: curve(drift, [[0, 100], [3, 100], [10, 30], [15, 0]]) });
  }
  for (const f of factors) f.score = Math.round(f.score);
  const score = Math.round(factors.reduce((s, f) => s + f.score * (WEIGHTS[f.key] || 0), 0));

  let grade = letterGrade(score);
  let reason = null;
  const offRunway = cross > t.runwayWidthM / 2 || t.pastThresholdM > t.runwayLengthM;
  if (t.gearLocked === false) { grade = 'CRASH'; reason = 'Gear not down and locked: a belly landing.'; }
  else if (sink > 600) { grade = 'CRASH'; reason = 'Hard landing: the gear would not survive that.'; }
  else if (bank > 10) { grade = 'CRASH'; reason = 'Wingtip strike: too much bank at touchdown.'; }
  else if (t.pastThresholdM < 0) { grade = 'D'; reason = 'Touched down short of the runway.'; }
  else if (offRunway) { grade = 'D'; reason = 'Touched down off the runway.'; }
  return { grade, score: grade === 'CRASH' ? 0 : score, factors, reason };
}

// Bounced landings (ticket 0091). A bounce is the wheels back above BOUNCE_FT for at least
// BOUNCE_MIN_S after a touchdown (a strut rebound is shorter); the landing is settled once
// the wheels have stayed on the runway for BOUNCE_SETTLE_S. wheelFt is the wheels' height
// (pos.y - groundY - spec.gearHeight, never aglFt: LESSONS 2026-10-21). Mutates b, allocates
// nothing; tested in tests/unit/landing.test.js and flown in tests/flight/bounce.test.js.
export const BOUNCE_FT = 2;
export const BOUNCE_MIN_S = 0.3;
export const BOUNCE_SETTLE_S = 1;
// peakFt: the highest the wheels went after the touchdown (over ~5 ft is no bounce to save).
export const createBounceTracker = () => ({ bounces: 0, airS: 0, groundS: 0, settled: false, contact: true, peakFt: 0 });
// A new bounce counts only after the wheels touched again (contact): wheels wandering around
// 2 ft in ground effect are one bounce, not several.
export function stepBounce(b, wheelFt, onGround, dt) {
  if (b.settled) return b;
  if (onGround) b.contact = true;
  if (wheelFt > b.peakFt) b.peakFt = wheelFt;
  if (wheelFt > BOUNCE_FT) {
    b.groundS = 0;
    b.airS += dt;
    if (b.contact && b.airS >= BOUNCE_MIN_S) { b.bounces++; b.contact = false; }
  } else {
    b.airS = 0;
    b.groundS = onGround ? b.groundS + dt : 0;
    if (b.groundS >= BOUNCE_SETTLE_S) b.settled = true;
  }
  return b;
}

// A touchdown after a bounce is not graded again, but it can still break the airplane: the
// reason it is a crash (gradeLanding's limits), or null.
export function recontactCrash(vsFpm, bankDeg) {
  if (-vsFpm > 600) return 'Hard landing after the bounce: the gear would not survive that.';
  if (Math.abs(bankDeg) > 10) return 'Wingtip strike after the bounce: too much bank.';
  return null;
}

// One bounce caps the grade at C (score 69), two or more at D (54); the touchdown factors
// stay the first touchdown's. A D (off the runway, short) stays a D; a crash stays a crash.
export function capBounced(result, bounces) {
  if (!bounces || result.grade === 'CRASH') return result;
  const score = Math.min(result.score, bounces > 1 ? 54 : 69);
  // Short (it fits the card on a phone held sideways); the coach gave the advice in the air.
  const note = `Bounced ${bounces > 1 ? `×${bounces}: best grade D` : 'once: best grade C'}.`;
  return { ...result, grade: result.grade === 'D' ? 'D' : letterGrade(score), score, bounces, reason: result.reason ? `${note} ${result.reason}` : note };
}

// Tailwind text colour per grade (the results card, the mission picker's bests).
export const GRADE_COLOURS = { S: 'text-fuchsia-300', A: 'text-emerald-300', B: 'text-sky-300', C: 'text-amber-300', D: 'text-orange-400', CRASH: 'text-red-400' };

// The letter for a 0-100 score (landings and go-arounds share it).
export function letterGrade(score) {
  return score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
}

// Drift angle at touchdown: nose heading minus ground track (degrees, + = nose right of the
// track, the crab into a wind from the right). Velocity in the sim frame (+X east, −Z north).
export function driftAngleDeg(headingDeg, vx, vz) {
  if (!vx && !vz) return 0;
  const track = Math.atan2(vx, -vz) * 180 / Math.PI;
  return ((headingDeg - track) % 360 + 540) % 360 - 180;
}

const EMPTY = () => ({ v: 1, missions: {} });

export function loadBest(storage) {
  try {
    const raw = storage.getItem(BEST_KEY);
    if (!raw) return EMPTY();
    const data = JSON.parse(raw);
    if (data && data.v === 1 && data.missions && typeof data.missions === 'object') return data;
    return EMPTY();
  } catch {
    return EMPTY();
  }
}

// Every stored personal-best grade as { missionKey: grade } (ticket 0029: the mission picker).
// Read-only; storage that throws or holds junk reads as no bests.
export function bestGrades(storage) {
  const out = {};
  if (!storage) return out;
  for (const [key, b] of Object.entries(loadBest(storage).missions)) {
    if (typeof b?.grade === 'string') out[key] = b.grade;
  }
  return out;
}

// Records a result if it beats the stored best. Returns { isNewBest, best, previous }.
export function recordBest(storage, missionKey, result, now = Date.now()) {
  const data = loadBest(storage);
  const previous = data.missions[missionKey] || null;
  if (result.grade === 'CRASH') return { isNewBest: false, best: previous, previous };
  if (previous && previous.score >= result.score) return { isNewBest: false, best: previous, previous };
  const best = { score: result.score, grade: result.grade, at: now };
  data.missions[missionKey] = best;
  try { storage.setItem(BEST_KEY, JSON.stringify(data)); } catch { /* private mode: keep in memory only */ }
  return { isNewBest: true, best, previous };
}
