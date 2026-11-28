import { describe, it, expect } from 'vitest';
import { PREFS_KEY, loadPrefs, savePrefs } from '../../src/prefs.js';
import { MISSIONS } from '../../src/missions.js';

// Ticket 0022: sound, camera and the last mission flown, remembered between visits as
// openaero_prefs_v1 = { v: 1, sound, camera, mission, at }. The storage comes in through a
// getter, so a window.localStorage that throws on access (private mode, blocked site data)
// is caught inside, as is one that throws on read or write.
const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const KEYS = MISSIONS.map((m) => m.key);
const DEFAULTS = { sound: true, camera: 0, mission: null, tilt: false };

describe('player prefs (0022)', () => {
  it('a first visit gets the defaults: sound on, the cockpit, no mission', () => {
    expect(loadPrefs(() => mem(), KEYS, 6)).toEqual(DEFAULTS);
  });

  it('round-trips sound, camera and mission under one versioned key', () => {
    const st = mem();
    savePrefs(() => st, { sound: false, camera: 3, mission: 'kads_16_short_field' }, 7);
    expect(JSON.parse(st.getItem(PREFS_KEY))).toEqual({ v: 1, sound: false, camera: 3, mission: 'kads_16_short_field', tilt: false, at: 7 });
    expect(loadPrefs(() => st, KEYS, 6)).toEqual({ sound: false, camera: 3, mission: 'kads_16_short_field', tilt: false });
  });

  it('the key is openaero_-prefixed and touches nothing else (openaero_best untouched)', () => {
    const best = JSON.stringify({ v: 1, missions: { kdfw_35c_final: { score: 80, grade: 'A', at: 0 } } });
    const st = mem({ openaero_best: best });
    savePrefs(() => st, { sound: true, camera: 1, mission: 'kdfw_35c_final' });
    expect(PREFS_KEY).toMatch(/^openaero_/);
    expect(st.getItem('openaero_best')).toBe(best);
    expect([...st.m.keys()].sort()).toEqual(['openaero_best', PREFS_KEY].sort());
  });

  it('corrupt JSON, another version or a non-object read as the defaults', () => {
    for (const raw of ['{nope', 'null', '42', '"x"', '[]', JSON.stringify({ v: 2, sound: false, camera: 2, mission: 'kdfw_35c_final' })]) {
      expect(loadPrefs(() => mem({ [PREFS_KEY]: raw }), KEYS, 6)).toEqual(DEFAULTS);
    }
  });

  it('each field is validated on its own: a bad one falls back, the good ones stay', () => {
    const read = (o) => loadPrefs(() => mem({ [PREFS_KEY]: JSON.stringify({ v: 1, ...o }) }), KEYS, 6);
    expect(read({ sound: 'yes', camera: 2, mission: 'kdfw_35c_final' })).toEqual({ sound: true, camera: 2, mission: 'kdfw_35c_final', tilt: false });
    for (const camera of [-1, 6, 2.5, '2', null]) expect(read({ sound: false, camera }).camera).toBe(0);
    expect(read({ sound: false, camera: 5 }).camera).toBe(5);
    // A mission that no longer exists (renamed, dropped) or today's dynamic crosswind
    // (it needs a live METAR) is not restored.
    for (const mission of ['gone_mission', 'crosswind_today', 7, '']) expect(read({ mission }).mission).toBe(null);
    expect(read({ sound: false }).sound).toBe(false);
  });

  it('phone tilt steering (0231) is off unless stored exactly true, and round-trips', () => {
    const read = (o) => loadPrefs(() => mem({ [PREFS_KEY]: JSON.stringify({ v: 1, ...o }) }), KEYS, 6);
    for (const tilt of [undefined, false, 'true', 1, null, {}]) expect(read({ sound: false, tilt }).tilt).toBe(false);
    expect(read({ sound: false, tilt: true })).toMatchObject({ sound: false, tilt: true });
    const st = mem();
    savePrefs(() => st, { sound: true, camera: 0, mission: null, tilt: true }, 9);
    expect(JSON.parse(st.getItem(PREFS_KEY))).toEqual({ v: 1, sound: true, camera: 0, mission: null, tilt: true, at: 9 });
    expect(loadPrefs(() => st, KEYS, 6).tilt).toBe(true);
  });

  it('storage that throws on access, read or write is tolerated', () => {
    const denied = () => { throw new Error('SecurityError'); };
    const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    expect(loadPrefs(denied, KEYS, 6)).toEqual(DEFAULTS);
    expect(loadPrefs(() => throwing, KEYS, 6)).toEqual(DEFAULTS);
    expect(loadPrefs(() => null, KEYS, 6)).toEqual(DEFAULTS);
    expect(() => savePrefs(denied, { sound: true, camera: 0, mission: null })).not.toThrow();
    expect(() => savePrefs(() => throwing, { sound: true, camera: 0, mission: null })).not.toThrow();
  });
});
