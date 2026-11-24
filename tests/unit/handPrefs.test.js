// Ticket 0221: the left-handed touch layout is remembered as openaero_hand_v1 = { v: 1, left, at }.
import { describe, it, expect } from 'vitest';
import { HAND_KEY, loadLeftHanded, saveLeftHanded } from '../../src/handPrefs.js';
import { TOUCH, sheetSections } from '../../src/controlsSheet.js';

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

describe('left-handed touch layout preference (0221)', () => {
  it('is right-handed on a first visit and remembers the choice', () => {
    const st = mem();
    expect(HAND_KEY).toBe('openaero_hand_v1');
    expect(loadLeftHanded(st)).toBe(false);
    saveLeftHanded(st, true, 7);
    expect(JSON.parse(st.getItem(HAND_KEY))).toEqual({ v: 1, left: true, at: 7 });
    expect(loadLeftHanded(st)).toBe(true);
    saveLeftHanded(st, false, 8);
    expect(loadLeftHanded(st)).toBe(false);
  });
  it('falls back to right-handed for junk, other versions, a non-boolean and storage that throws or is missing', () => {
    expect(loadLeftHanded(mem({ [HAND_KEY]: '{nope' }))).toBe(false);
    expect(loadLeftHanded(mem({ [HAND_KEY]: JSON.stringify({ v: 2, left: true }) }))).toBe(false);
    expect(loadLeftHanded(mem({ [HAND_KEY]: JSON.stringify({ v: 1, left: 'yes' }) }))).toBe(false);
    expect(loadLeftHanded(mem({ [HAND_KEY]: 'null' }))).toBe(false);
    const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(loadLeftHanded(throwing)).toBe(false);
    expect(() => saveLeftHanded(throwing, true)).not.toThrow();
    expect(loadLeftHanded(null)).toBe(false);
    expect(() => saveLeftHanded(null, true)).not.toThrow();
  });
  it('the controls sheet names the stick and slider by the side they are on', () => {
    const words = (left) => sheetSections(true, left)[0].rows.map((r) => r.input).join(' | ');
    expect(words(false)).toContain('Right stick');
    expect(words(false)).toContain('Left slider');
    expect(words(true)).toContain('Left stick');
    expect(words(true)).toContain('Right slider');
    expect(words(true)).not.toContain('Right stick');
    // The table itself (what the unit test holds to the deck's ids) is unchanged.
    expect(TOUCH[0].ids).toEqual(['touchStick']);
  });
});
