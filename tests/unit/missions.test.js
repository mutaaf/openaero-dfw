import { describe, it, expect } from 'vitest';
import { MISSIONS, RECOMMENDED_KEY, groupMissions } from '../../src/missions.js';
import { BEST_KEY, bestGradeFor } from '../../src/landing.js';

describe('groupMissions (0029)', () => {
  const groups = groupMissions(MISSIONS);
  const keys = groups.flatMap((g) => g.missions.map((m) => m.key));

  it('returns every mission key exactly once', () => {
    expect(keys.slice().sort()).toEqual(MISSIONS.map((m) => m.key).sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('puts the recommended final first, then airports in order, then tours', () => {
    expect(groups[0]).toMatchObject({ id: 'recommended' });
    expect(groups[0].missions.map((m) => m.key)).toEqual([RECOMMENDED_KEY]);
    expect(groups.map((g) => g.id)).toEqual(['recommended', 'KDFW', 'KDAL', 'KADS', 'KAFW', 'KFTW', 'KGKY', 'tours']);
    for (const g of groups.slice(1, -1)) {
      for (const m of g.missions) expect(m.airport).toBe(g.id);
    }
    expect(groups.at(-1).missions.every((m) => m.kind === 'tour')).toBe(true);
  });

  it('a new mission lands in its airport group with no other edit', () => {
    const extra = { key: 'kdfw_18r_final', label: 'KDFW 18R', kind: 'final', airport: 'KDFW', rwy: '18R', distNm: 4, blurb: 'x' };
    const g = groupMissions([...MISSIONS, extra]).find((x) => x.id === 'KDFW');
    expect(g.missions.at(-1).key).toBe('kdfw_18r_final');
  });

  it('drops empty groups and keeps an unknown airport in its own group', () => {
    const g = groupMissions([{ key: 'a', kind: 'final', airport: 'KXYZ' }]);
    expect(g.map((x) => x.id)).toEqual(['KXYZ']);
  });

  it('every mission has a one-line blurb', () => {
    for (const m of MISSIONS) {
      expect(typeof m.blurb, m.key).toBe('string');
      expect(m.blurb.length, m.key).toBeGreaterThan(10);
      expect(m.blurb, m.key).not.toMatch(/\n/);
    }
  });
});

describe('bestGradeFor (0029)', () => {
  const store = (raw) => ({ getItem: (k) => (k === BEST_KEY ? raw : null) });

  it('reads the stored grade, nothing when none', () => {
    const s = store(JSON.stringify({ v: 1, missions: { kdfw_35c_final: { score: 91, grade: 'A', at: 1 } } }));
    expect(bestGradeFor(s, 'kdfw_35c_final')).toBe('A');
    expect(bestGradeFor(s, 'kdal_31r_final')).toBeNull();
  });

  it('tolerates storage that throws or holds junk', () => {
    expect(bestGradeFor({ getItem: () => { throw new Error('private'); } }, 'kdfw_35c_final')).toBeNull();
    expect(bestGradeFor(store('{not json'), 'kdfw_35c_final')).toBeNull();
    expect(bestGradeFor(null, 'kdfw_35c_final')).toBeNull();
    expect(bestGradeFor(store(JSON.stringify({ v: 1, missions: { k: { grade: 7 } } })), 'k')).toBeNull();
  });
});
