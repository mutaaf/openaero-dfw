import { describe, it, expect } from 'vitest';
import { gradeLanding, loadBest, recordBest, BEST_KEY } from '../../src/landing.js';

const good = { vsFpm: -110, crossM: 0.8, pastThresholdM: 320, runwayLengthM: 4085, runwayWidthM: 45.7, pitchDeg: 3.5, bankDeg: 0.5, iasKts: 140, vrefKts: 136 };

describe('gradeLanding', () => {
  it('a greaser on the centreline in the zone is S or A', () => {
    const g = gradeLanding(good);
    expect(['S', 'A']).toContain(g.grade);
    expect(g.score).toBeGreaterThanOrEqual(85);
    expect(g.factors.map((f) => f.key)).toEqual(['rate', 'centreline', 'zone', 'flare', 'speed']);
  });
  it('120 fpm on centreline in the zone grades A or better', () => {
    expect(['S', 'A']).toContain(gradeLanding({ ...good, vsFpm: -120 }).grade);
  });
  it('700 fpm is a crash', () => {
    const g = gradeLanding({ ...good, vsFpm: -700 });
    expect(g.grade).toBe('CRASH');
    expect(g.reason).toMatch(/hard/i);
  });
  it('a wingtip strike (bank > 10°) is a crash', () => {
    expect(gradeLanding({ ...good, bankDeg: -12 }).grade).toBe('CRASH');
  });
  it('landing off the runway caps the grade at D', () => {
    const g = gradeLanding({ ...good, crossM: 40 });
    expect(g.grade).toBe('D');
    expect(g.reason).toMatch(/off the runway/i);
  });
  it('touching down short of the threshold is an undershoot', () => {
    const g = gradeLanding({ ...good, pastThresholdM: -60 });
    expect(g.grade).toBe('D');
    expect(g.reason).toMatch(/short/i);
  });
  it('a firm, long, nose-first landing scores worse than a good one', () => {
    const bad = gradeLanding({ ...good, vsFpm: -380, pastThresholdM: 1100, pitchDeg: -1 });
    expect(bad.score).toBeLessThan(gradeLanding(good).score - 25);
  });
});

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

describe('personal bests', () => {
  it('starts empty and versioned', () => {
    expect(loadBest(memStorage())).toEqual({ v: 1, missions: {} });
  });
  it('survives junk without throwing', () => {
    expect(loadBest(memStorage({ [BEST_KEY]: '{not json' }))).toEqual({ v: 1, missions: {} });
  });
  it('records a new best and keeps the better one', () => {
    const s = memStorage();
    const r1 = recordBest(s, 'kdfw_35c_final', { score: 80, grade: 'B' }, 1000);
    expect(r1.isNewBest).toBe(true);
    const r2 = recordBest(s, 'kdfw_35c_final', { score: 70, grade: 'C' }, 2000);
    expect(r2.isNewBest).toBe(false);
    expect(r2.best.score).toBe(80);
    const stored = JSON.parse(s.getItem(BEST_KEY));
    expect(stored).toEqual({ v: 1, missions: { kdfw_35c_final: { score: 80, grade: 'B', at: 1000 } } });
  });
  it('crashes never become a personal best', () => {
    const s = memStorage();
    expect(recordBest(s, 'm', { score: 0, grade: 'CRASH' }, 1).isNewBest).toBe(false);
    expect(loadBest(s).missions).toEqual({});
  });
  it('storage that throws (private mode) is tolerated', () => {
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(loadBest(bad)).toEqual({ v: 1, missions: {} });
    expect(recordBest(bad, 'm', { score: 90, grade: 'A' }, 1).isNewBest).toBe(true);
  });
});
