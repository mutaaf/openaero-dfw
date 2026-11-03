import { describe, it, expect } from 'vitest';
import { MISSIONS, RECOMMENDED_KEY, groupMissions, missionSun } from '../../src/missions.js';
import { TIME_MODES } from '../../src/sun.js';
import { BEST_KEY, bestGrades } from '../../src/landing.js';

describe('groupMissions (0029)', () => {
  const groups = groupMissions(MISSIONS);
  const keys = groups.flatMap((g) => g.missions.map((m) => m.key));

  it('returns every mission key exactly once', () => {
    expect(keys.slice().sort()).toEqual(MISSIONS.map((m) => m.key).sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('puts the recommended final first, then airports in order, then drills, then tours', () => {
    expect(groups[0]).toMatchObject({ id: 'recommended' });
    expect(groups[0].missions.map((m) => m.key)).toEqual([RECOMMENDED_KEY]);
    expect(groups.map((g) => g.id)).toEqual(['recommended', 'KDFW', 'KDAL', 'KADS', 'KAFW', 'KFTW', 'KGKY', 'drills', 'tours']);
    for (const g of groups.slice(1, -2)) {
      for (const m of g.missions) expect(m.airport).toBe(g.id);
    }
    expect(groups.at(-2).missions.every((m) => m.kind === 'drill')).toBe(true);
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

describe('bestGrades (0029)', () => {
  const store = (raw) => ({ getItem: (k) => (k === BEST_KEY ? raw : null) });

  it('reads the stored grades, nothing when none', () => {
    const s = store(JSON.stringify({ v: 1, missions: { kdfw_35c_final: { score: 91, grade: 'A', at: 1 } } }));
    expect(bestGrades(s)).toEqual({ kdfw_35c_final: 'A' });
    expect(bestGrades(store(null))).toEqual({});
  });

  it('tolerates storage that throws or holds junk', () => {
    expect(bestGrades({ getItem: () => { throw new Error('private'); } })).toEqual({});
    expect(bestGrades(store('{not json'))).toEqual({});
    expect(bestGrades(null)).toEqual({});
    expect(bestGrades(store(JSON.stringify({ v: 1, missions: { k: { grade: 7 }, n: null } })))).toEqual({});
  });
});

describe('night and dusk missions (0060)', () => {
  it('a mission sun is one of the When? presets, never Now', () => {
    const withSun = MISSIONS.filter((m) => m.sun);
    expect(withSun.length).toBeGreaterThanOrEqual(2);
    for (const m of withSun) {
      expect(TIME_MODES, m.key).toContain(m.sun);
      expect(m.sun, m.key).not.toBe('Now');
    }
  });

  it('KDFW 35C at night and KDAL 31R at dusk, each its own mission key under its airport', () => {
    const night = MISSIONS.find((m) => m.key === 'kdfw_35c_night');
    const dusk = MISSIONS.find((m) => m.key === 'kdal_31r_dusk');
    expect(night).toMatchObject({ kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 4, sun: 'Night' });
    expect(dusk).toMatchObject({ kind: 'final', airport: 'KDAL', rwy: '31R', sun: 'Dusk' });
    // Personal bests key by mission key: separate from the day finals.
    expect(night.key).not.toBe('kdfw_35c_final');
    expect(dusk.key).not.toBe('kdal_31r_final');
    const groups = groupMissions(MISSIONS);
    expect(groups.find((g) => g.id === 'KDFW').missions.map((m) => m.key)).toContain('kdfw_35c_night');
    expect(groups.find((g) => g.id === 'KDAL').missions.map((m) => m.key)).toContain('kdal_31r_dusk');
  });

  const NOW = TIME_MODES.indexOf('Now');
  const NOON = TIME_MODES.indexOf('Noon');
  const NIGHT = TIME_MODES.indexOf('Night');
  const DUSK = TIME_MODES.indexOf('Dusk');

  it('missionSun flies the preset and keeps the player\'s choice to give back', () => {
    expect(missionSun({ sun: 'Night' }, NOON, null)).toEqual({ mode: NIGHT, before: NOON });
    // FLY AGAIN, or another night/dusk mission, keeps the original choice.
    expect(missionSun({ sun: 'Night' }, NIGHT, NOON)).toEqual({ mode: NIGHT, before: NOON });
    expect(missionSun({ sun: 'Dusk' }, NIGHT, NOON)).toEqual({ mode: DUSK, before: NOON });
    // The next mission without one restores it.
    expect(missionSun({}, NIGHT, NOON)).toEqual({ mode: NOON, before: null });
  });

  it('missionSun leaves the When? choice alone for a mission without a sun', () => {
    expect(missionSun({}, NOW, null)).toEqual({ mode: NOW, before: null });
    expect(missionSun({}, DUSK, null)).toEqual({ mode: DUSK, before: null });
  });

  it('an unknown preset is ignored, not applied as -1', () => {
    expect(missionSun({ sun: 'Midnight' }, NOON, null)).toEqual({ mode: NOON, before: null });
  });
});
