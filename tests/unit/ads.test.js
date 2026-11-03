import { describe, it, expect } from 'vitest';
import { slotFills, adsAllowed, breakDue, BREAK_GAP_MS } from '../../src/ads.js';

const store = (v) => ({ getItem: () => (v === undefined ? null : JSON.stringify(v)) });

describe('Marquee ads (operator decision 2026-10-30)', () => {
  it('a slot fills only when Marquee is on and its source is not none', () => {
    expect(slotFills(null, 'title')).toBe(false);
    expect(slotFills({ enabled: false, slots: { title: { source: 'direct' } } }, 'title')).toBe(false);
    expect(slotFills({ enabled: true, slots: { title: { source: 'none' } } }, 'title')).toBe(false);
    expect(slotFills({ enabled: true, slots: {} }, 'title')).toBe(false);
    expect(slotFills({ enabled: true, slots: { title: { source: 'network' } } }, 'title')).toBe(true);
  });

  it('Kid and a chosen clean view show no ads', () => {
    expect(adsAllowed('kid', store())).toBe(false);
    expect(adsAllowed('learner', store())).toBe(true);
    expect(adsAllowed('pilot', store({ v: 1, clean: false, at: 0 }))).toBe(true);
    expect(adsAllowed('pilot', store({ v: 1, clean: true, at: 0 }))).toBe(false);
    expect(adsAllowed('pilot', { getItem: () => { throw new Error('private'); } })).toBe(true);
  });

  it('skips the first flight, then waits the gap between breaks', () => {
    const s = { flights: 0, lastBreak: -Infinity };
    expect(breakDue(s, 0)).toBe(false);
    expect(breakDue(s, 1000)).toBe(true);
    s.lastBreak = 1000;
    expect(breakDue(s, 1000 + BREAK_GAP_MS - 1)).toBe(false);
    expect(breakDue(s, 1000 + BREAK_GAP_MS)).toBe(true);
  });
});
