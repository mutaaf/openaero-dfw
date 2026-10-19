import { describe, it, expect } from 'vitest';
import { VIEW_KEY, loadCleanView, saveCleanView } from '../../src/viewPrefs.js';

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

describe('clean view preference', () => {
  it('is on for a first visit and remembers the choice', () => {
    const st = mem();
    expect(loadCleanView(st)).toBe(true);
    saveCleanView(st, false, 5);
    expect(JSON.parse(st.getItem(VIEW_KEY))).toEqual({ v: 1, clean: false, at: 5 });
    expect(loadCleanView(st)).toBe(false);
  });
  it('falls back to on for junk, other versions and storage that throws', () => {
    expect(loadCleanView(mem({ [VIEW_KEY]: '{nope' }))).toBe(true);
    expect(loadCleanView(mem({ [VIEW_KEY]: JSON.stringify({ v: 2, clean: false }) }))).toBe(true);
    const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(loadCleanView(throwing)).toBe(true);
    expect(() => saveCleanView(throwing, false)).not.toThrow();
  });
});
