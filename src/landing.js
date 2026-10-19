// Landing grade and personal bests. Pure: no THREE, no DOM (storage is passed in).
// Tested in tests/unit/landing.test.js.

export const BEST_KEY = 'openaero_best';
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
// Piecewise-linear score through [x, score] points (x ascending).
function curve(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  }
  return pts[pts.length - 1][1];
}

const WEIGHTS = { rate: 0.35, centreline: 0.2, zone: 0.2, flare: 0.15, speed: 0.1 };

// t: { vsFpm (negative = descending), crossM, pastThresholdM, runwayLengthM, runwayWidthM,
//      pitchDeg (nose up +), bankDeg, iasKts, vrefKts, driftDeg? }
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

  let grade = score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
  let reason = null;
  const offRunway = cross > t.runwayWidthM / 2 || t.pastThresholdM > t.runwayLengthM;
  if (sink > 600) { grade = 'CRASH'; reason = 'Hard landing: the gear would not survive that.'; }
  else if (bank > 10) { grade = 'CRASH'; reason = 'Wingtip strike: too much bank at touchdown.'; }
  else if (t.pastThresholdM < 0) { grade = 'D'; reason = 'Touched down short of the runway.'; }
  else if (offRunway) { grade = 'D'; reason = 'Touched down off the runway.'; }
  return { grade, score: grade === 'CRASH' ? 0 : score, factors, reason };
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
