// Ticket 0229: the best landing's track, kept per mission (the ghost's data, 0230).
import { describe, it, expect } from 'vitest';
import { createReplayBuffer, recordReplay, REPLAY_STRIDE } from '../../src/replay.js';
import { approachGeometry } from '../../src/airports.js';
import {
  packTrack, unpackTrack, loadBestTracks, recordBestTrack, saveBestLanding,
  TRACK_KEY, TRACK_MAX_KEYS, TRACK_MAX_BYTES, TRACK_STRIDE,
} from '../../src/bestTrack.js';

// A runway end heading 350° true, threshold at (1000, 180 m up, -2000).
const END = { id: '35C', hdgT: 350, thrX: 1000, thrY: 180, thrZ: -2000 };
const r = (350 * Math.PI) / 180, dir = { x: Math.sin(r), z: -Math.cos(r) };

// A 3° final from `startS` seconds out at 65 m/s, touching down `tdPastM` past the threshold, then
// `rollS` seconds of rollout, recorded at the replay's 20 Hz. Crabbed 6 m right of centre.
function flight({ finalS = 40, rollS = 4, tdPastM = 300, speed = 65, bufS = 30 } = {}) {
  const buf = createReplayBuffer(bufS);
  const sim = { simTime: 0, pos: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, throttle: 0.3, gearDown: true, aileronInput: 0, elevInput: 0, rudderInput: 0 };
  const total = finalS + rollS;
  for (let t = 0; t <= total + 1e-9; t += 1 / 60) {
    sim.simTime = t;
    const past = tdPastM - speed * (finalS - t); // metres past the threshold
    const h = past < tdPastM ? (tdPastM - past) * Math.tan(3 * Math.PI / 180) : 0;
    sim.pos.x = END.thrX + dir.x * past + -dir.z * 6;
    sim.pos.z = END.thrZ + dir.z * past + dir.x * 6;
    sim.pos.y = END.thrY + h + 1.5;
    recordReplay(buf, sim);
  }
  return buf;
}

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => m.delete(k), m };
}

describe('packTrack', () => {
  it('reads the replay buffer\'s layout', () => { expect(TRACK_STRIDE).toBe(REPLAY_STRIDE); });

  it('keeps the last 30 s before touchdown, one point a second plus the touchdown, in runway metres', () => {
    // The replay holds 30 s and the card comes up after a moment on the wheels: here 0.5 s of it is rollout.
    const buf = flight({ rollS: 0.5 });
    const p = packTrack(buf, END, 300);
    expect(p.v).toBe(1);
    expect(p.dt).toBe(1);
    expect(p.pts.length).toBe(30); // 29 one-second steps back from the touchdown (all the buffer has), and the touchdown
    const last = p.pts[p.pts.length - 1];
    // The touchdown: on the runway 300 m past the threshold, 6 m right, wheels-height up.
    expect(last[2]).toBeGreaterThanOrEqual(300);
    expect(last[2]).toBeLessThanOrEqual(304);
    expect(last[0]).toBe(6);
    expect(last[1]).toBeLessThanOrEqual(2);
    // 29 s at 65 m/s before it: the first point ~1,585 m before the threshold, ~99 m up.
    expect(p.pts[0][2]).toBeLessThan(-1500);
    expect(p.pts[0][1]).toBeGreaterThan(80);
    // A buffer holding more than 30 s before the touchdown keeps only the last 30 (31 points).
    const long = packTrack(flight({ bufS: 60, rollS: 0.5 }), END, 300);
    expect(long.pts.length).toBe(31);
    expect(long.pts[0][2]).toBeGreaterThan(-1700);
    expect(Object.keys(p).sort()).toEqual(['dt', 'pts', 'v']);
    // Nothing from the rollout after the touchdown.
    for (const q of p.pts) expect(q[2]).toBeLessThanOrEqual(304);
    for (const q of p.pts) for (const c of q) expect(Number.isInteger(c)).toBe(true);
  });

  it('is under 1.5 kB of JSON and decodes within 1 m of the replay samples', () => {
    const buf = flight({ finalS: 120, speed: 120 }); // a long, fast final: big numbers
    const p = packTrack(buf, END, 300);
    expect(JSON.stringify(p).length).toBeLessThan(TRACK_MAX_BYTES);
    expect(TRACK_MAX_BYTES).toBe(1500);
    const pts = unpackTrack(p);
    expect(pts.length).toBe(p.pts.length);
    // Every decoded point is within 1 m of the recording at its time (the touchdown sample, then a second apart back from it).
    const d = buf.data, S = 14, at = (i) => ((buf.head - buf.count + i + buf.n) % buf.n) * S;
    const geo = (i) => approachGeometry(END, { x: d[at(i) + 1], y: d[at(i) + 2], z: d[at(i) + 3] });
    let k = 0;
    while (-geo(k).distM < 300) k++;
    const tdT = d[at(k)];
    for (let j = 0; j < pts.length; j++) {
      const t = tdT - (pts.length - 1 - j) * p.dt;
      let i = 0;
      while (i < buf.count - 1 && d[at(i + 1)] < t) i++;
      const t0 = d[at(i)], t1 = d[at(i + 1)], f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
      const a = geo(i), b = geo(i + 1);
      const want = { x: a.crossM + (b.crossM - a.crossM) * f, z: -(a.distM + (b.distM - a.distM) * f),
        y: d[at(i) + 2] + (d[at(i + 1) + 2] - d[at(i) + 2]) * f - END.thrY };
      expect(Math.hypot(want.x - pts[j].x, want.y - pts[j].y, want.z - pts[j].z)).toBeLessThanOrEqual(1);
    }
  });

  it('a track under 5 s, an empty buffer or a missing end: nothing', () => {
    expect(packTrack(flight({ finalS: 4 }), END, 300)).toBeNull();
    expect(packTrack(createReplayBuffer(), END, 300)).toBeNull();
    expect(packTrack(null, END, 300)).toBeNull();
    expect(packTrack(flight(), null, 300)).toBeNull();
    expect(packTrack(flight(), END, NaN)).toBeNull();
  });

  it('a touchdown the buffer never reached: nothing', () => {
    expect(packTrack(flight(), END, 5000)).toBeNull();
  });

  it('unpackTrack refuses junk', () => {
    expect(unpackTrack(null)).toBeNull();
    expect(unpackTrack({ v: 2, dt: 1, pts: [[0, 0, 0]] })).toBeNull();
    expect(unpackTrack({ v: 1, dt: 1, pts: [[0, 'a', 0]] })).toBeNull();
    expect(unpackTrack({ v: 1, dt: 1, pts: 'x' })).toBeNull();
  });
});

describe('recordBestTrack', () => {
  const pack = { v: 1, dt: 1, pts: [[0, 10, -100], [0, 0, 300]] };

  it('stores under openaero_besttrack_v1 by mission key, Kid and Learner keys included', () => {
    const s = memStorage();
    expect(recordBestTrack(s, 'kdfw_35c_flare', pack, 1000)).toBe(true);
    expect(recordBestTrack(s, 'kdfw_35c_flare@kid', pack, 1001)).toBe(true);
    const data = JSON.parse(s.getItem(TRACK_KEY));
    expect(TRACK_KEY).toBe('openaero_besttrack_v1');
    expect(data.v).toBe(1);
    expect(data.tracks.kdfw_35c_flare.pts).toEqual(pack.pts);
    expect(data.tracks.kdfw_35c_flare.at).toBe(1000);
    expect(data.tracks['kdfw_35c_flare@kid'].at).toBe(1001);
    expect(loadBestTracks(s).tracks.kdfw_35c_flare.dt).toBe(1);
  });

  it('keeps at most 40 mission keys: the oldest goes', () => {
    const s = memStorage();
    for (let i = 0; i <= TRACK_MAX_KEYS; i++) recordBestTrack(s, `m${i}`, pack, 1000 + i);
    const keys = Object.keys(loadBestTracks(s).tracks);
    expect(TRACK_MAX_KEYS).toBe(40);
    expect(keys.length).toBe(40);
    expect(keys).not.toContain('m0');
    expect(keys).toContain('m40');
  });

  it('a quota error or a throwing storage is swallowed and leaves the best score alone', () => {
    const best = JSON.stringify({ v: 1, missions: { a: { score: 90, grade: 'A', at: 1 } } });
    const s = memStorage({ openaero_best: best });
    s.setItem = (k) => { if (k === TRACK_KEY) throw new DOMException('full', 'QuotaExceededError'); };
    expect(recordBestTrack(s, 'a', pack, 5)).toBe(false);
    expect(s.getItem('openaero_best')).toBe(best);
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(recordBestTrack(blocked, 'a', pack, 5)).toBe(false);
    expect(loadBestTracks(blocked)).toEqual({ v: 1, tracks: {} });
    expect(recordBestTrack(null, 'a', pack, 5)).toBe(false);
  });

  it('junk or another version under the key reads as empty and is not thrown away silently into a crash', () => {
    expect(loadBestTracks(memStorage({ [TRACK_KEY]: '{oops' }))).toEqual({ v: 1, tracks: {} });
    expect(loadBestTracks(memStorage({ [TRACK_KEY]: '{"v":9,"tracks":{}}' }))).toEqual({ v: 1, tracks: {} });
    const mixed = memStorage({ [TRACK_KEY]: JSON.stringify({ v: 1, tracks: { good: { ...pack, at: 3 }, bad: { v: 1, pts: 7 } } }) });
    expect(Object.keys(loadBestTracks(mixed).tracks)).toEqual(['good']);
  });
});

describe('saveBestLanding (the results card calls this)', () => {
  const landed = { grade: 'A', score: 88 };
  const td = { pastThresholdM: 300 };
  const newBest = { isNewBest: true, key: 'kdfw_35c_flare', best: { score: 88, grade: 'A', at: 1234 } };

  it('a new best stores its track, stamped with the best\'s time', () => {
    const s = memStorage();
    expect(saveBestLanding(s, newBest, landed, flight(), END, td)).toBe(true);
    const t = loadBestTracks(s).tracks.kdfw_35c_flare;
    expect(t.at).toBe(1234);
    expect(t.pts.length).toBeGreaterThan(20);
  });

  it('a worse landing leaves the stored track alone', () => {
    const s = memStorage();
    saveBestLanding(s, newBest, landed, flight(), END, td);
    const before = s.getItem(TRACK_KEY);
    const worse = { isNewBest: false, key: 'kdfw_35c_flare', best: newBest.best };
    expect(saveBestLanding(s, worse, { grade: 'C', score: 60 }, flight({ tdPastM: 600 }), END, { pastThresholdM: 600 })).toBe(false);
    expect(s.getItem(TRACK_KEY)).toBe(before);
  });

  it('a crash, a lesson with its own track plot, a missed runway or a short track: nothing stored', () => {
    const s = memStorage();
    expect(saveBestLanding(s, newBest, { grade: 'CRASH', score: 0 }, flight(), END, td)).toBe(false);
    expect(saveBestLanding(s, newBest, { ...landed, track: { pts: [] } }, flight(), END, td)).toBe(false);
    expect(saveBestLanding(s, newBest, landed, flight(), END, null)).toBe(false);
    expect(saveBestLanding(s, newBest, landed, flight({ finalS: 3 }), END, td)).toBe(false);
    expect(saveBestLanding(s, newBest, landed, null, END, td)).toBe(false);
    expect(saveBestLanding(s, { ...newBest, key: undefined }, landed, flight(), END, td)).toBe(false);
    expect(s.getItem(TRACK_KEY)).toBeNull();
  });

  it('a new best whose own track cannot be kept drops the old best\'s track (no ghost of a beaten landing)', () => {
    const s = memStorage();
    saveBestLanding(s, newBest, landed, flight(), END, td);
    saveBestLanding(s, { ...newBest, key: 'other' }, landed, flight(), END, td);
    const better = { isNewBest: true, key: 'kdfw_35c_flare', best: { score: 95, grade: 'S', at: 5000 } };
    expect(saveBestLanding(s, better, { grade: 'S', score: 95 }, flight({ finalS: 3 }), END, td)).toBe(false);
    const tracks = loadBestTracks(s).tracks;
    expect(tracks.kdfw_35c_flare).toBeUndefined();
    expect(tracks.other).toBeDefined();
    // Not a new best: nothing dropped.
    saveBestLanding(s, { ...newBest, key: 'other', isNewBest: false }, landed, null, END, td);
    expect(loadBestTracks(s).tracks.other).toBeDefined();
  });

  it('never throws, whatever the storage does', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(() => saveBestLanding(blocked, newBest, landed, flight(), END, td)).not.toThrow();
    expect(saveBestLanding(blocked, newBest, landed, flight(), END, td)).toBe(false);
  });
});
