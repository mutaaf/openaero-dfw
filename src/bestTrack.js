// The best landing's track, kept per mission (ticket 0229): the data a later ghost (0230) flies.
// Imported by results.js only, so it rides in the results card's lazy chunk. Pure apart from the
// storage it is handed; every read and write is in try/catch and nothing here ever throws.
//
// packTrack reads the replay buffer (replay.js layout, TRACK_STRIDE) and keeps the last
// TRACK_S seconds up to the touchdown: the touchdown sample itself and, a second apart back from
// it, the recording interpolated at each step. Runway-relative metres rounded to 1 m:
// x across (right of the centreline +), y up (above the threshold), z along (past the threshold +).
//   { v: 1, dt: 1, pts: [[x, y, z], ...] }   oldest first, the last point is the touchdown
// Stored under openaero_besttrack_v1 = { v: 1, tracks: { <missionKey>: { v, dt, pts, at } } }
// (the same keys as landing.js's openaero_best, @kid / @learner included), at most TRACK_MAX_KEYS.
import { approachGeometry } from './airports.js';

export const TRACK_KEY = 'openaero_besttrack_v1';
export const TRACK_S = 30;
export const TRACK_MIN_S = 5;
export const TRACK_MAX_KEYS = 40;
export const TRACK_MAX_BYTES = 1500;
// replay.js's sample layout (REPLAY_STRIDE: t, pos xyz, ...), pinned by a unit card so replay.js stays its own chunk.
export const TRACK_STRIDE = 14;

export function packTrack(buf, end, tdPastM) {
  if (!buf || !end || !(buf.count > 1) || !Number.isFinite(tdPastM)) return null;
  const d = buf.data, S = TRACK_STRIDE, at = (i) => ((buf.head - buf.count + i + buf.n) % buf.n) * S;
  const pos = { x: 0, y: 0, z: 0 };
  const frame = (i, out) => {
    const o = at(i);
    pos.x = d[o + 1]; pos.y = d[o + 2]; pos.z = d[o + 3];
    const g = approachGeometry(end, pos);
    out[0] = g.crossM; out[1] = pos.y - (end.thrY ?? 0); out[2] = -g.distM;
    return out;
  };
  const a = [0, 0, 0], b = [0, 0, 0];
  // The touchdown: the first sample at or past its point along the runway (trackPlot.js profilePoints' rule).
  let k = -1;
  for (let i = 0; i < buf.count; i++) if (frame(i, a)[2] >= tdPastM) { k = i; break; }
  if (k < 1) return null;
  const tdT = d[at(k)], steps = Math.floor(Math.min(TRACK_S, tdT - d[at(0)]) + 1e-6);
  if (steps < TRACK_MIN_S) return null;
  const pts = [];
  let i = 0;
  for (let s = steps; s >= 1; s--) {
    const t = tdT - s;
    while (i < k - 1 && d[at(i + 1)] < t) i++;
    const t0 = d[at(i)], t1 = d[at(i + 1)], f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    frame(i, a); frame(i + 1, b);
    pts.push([Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)]);
  }
  frame(k, a);
  pts.push([Math.round(a[0]), Math.round(a[1]), Math.round(a[2])]);
  const pack = { v: 1, dt: 1, pts };
  return JSON.stringify(pack).length < TRACK_MAX_BYTES ? pack : null;
}

const isPt = (q) => Array.isArray(q) && q.length === 3 && q.every(Number.isFinite);
const isPack = (p) => !!p && p.v === 1 && p.dt > 0 && Array.isArray(p.pts) && p.pts.length > 1 && p.pts.every(isPt);

// A stored pack as [{ x, y, z }] (runway metres, oldest first), or null for anything else.
export function unpackTrack(p) {
  if (!isPack(p)) return null;
  return p.pts.map(([x, y, z]) => ({ x, y, z }));
}

const EMPTY = () => ({ v: 1, tracks: {} });

// Every stored track; junk entries are dropped from what is read (the next write cleans them up).
export function loadBestTracks(storage) {
  try {
    const raw = storage?.getItem(TRACK_KEY);
    if (!raw) return EMPTY();
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !data.tracks || typeof data.tracks !== 'object') return EMPTY();
    const tracks = {};
    for (const [key, t] of Object.entries(data.tracks)) if (isPack(t)) tracks[key] = t;
    return { v: 1, tracks };
  } catch {
    return EMPTY();
  }
}

// Stores `pack` as `missionKey`'s best track. true if written; a full or blocked storage drops it.
export function recordBestTrack(storage, missionKey, pack, now = Date.now()) {
  if (!storage || !missionKey || !isPack(pack)) return false;
  const data = loadBestTracks(storage);
  data.tracks[missionKey] = { v: 1, dt: pack.dt, pts: pack.pts, at: now };
  const keys = Object.keys(data.tracks);
  if (keys.length > TRACK_MAX_KEYS) {
    keys.sort((p, q) => (data.tracks[p].at || 0) - (data.tracks[q].at || 0));
    for (const key of keys.slice(0, keys.length - TRACK_MAX_KEYS)) delete data.tracks[key];
  }
  try { storage.setItem(TRACK_KEY, JSON.stringify(data)); return true; } catch { return false; }
}

// The results card's hook: a landing that set a new personal best (landing.js recordBest's answer,
// with its key) keeps its final approach. Not a crash, not a lesson with its own track plot, not a
// landing off the runway (td null), not a track under TRACK_MIN_S. Never throws.
export function saveBestLanding(storage, best, result, buf, end, td) {
  try {
    if (!best?.isNewBest || !best.key || !result || result.grade === 'CRASH' || result.track || !td) return false;
    const pack = packTrack(buf, end, td.pastThresholdM);
    return pack ? recordBestTrack(storage, best.key, pack, best.best?.at ?? Date.now()) : false;
  } catch {
    return false;
  }
}
