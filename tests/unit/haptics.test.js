import { describe, it, expect, vi } from 'vitest';
import {
  touchdownPattern, alertPattern, patternMs, createAlertEdge, buzz, hapticsSupported,
  loadHaptics, saveHaptics, HAPTICS_KEY,
} from '../../src/haptics.js';

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const throwingStore = { getItem() { throw new Error('private'); }, setItem() { throw new Error('private'); } };

describe('touchdownPattern', () => {
  it('a gentle touchdown is one short tick', () => {
    expect(touchdownPattern(-120)).toEqual([20]);
  });
  it('gets longer and stronger with the sink rate (gentle < firm < hard)', () => {
    const g = patternMs(touchdownPattern(-150));
    const f = patternMs(touchdownPattern(-400));
    const h = patternMs(touchdownPattern(-700));
    expect(g).toBeLessThan(f);
    expect(f).toBeLessThan(h);
    expect(touchdownPattern(-700).length).toBeGreaterThan(1); // a hard one is a pattern, not a tick
  });
  it('is monotonic over a sweep, in either sign convention', () => {
    let last = 0;
    for (let s = 0; s <= 1500; s += 25) {
      const ms = patternMs(touchdownPattern(-s));
      expect(ms).toBeGreaterThanOrEqual(last);
      expect(patternMs(touchdownPattern(s))).toBe(ms);
      last = ms;
    }
  });
  it('reduced motion keeps one short tick, whatever the sink', () => {
    expect(touchdownPattern(-900, true)).toEqual([20]);
  });
  it('garbage in is a gentle tick, not a throw', () => {
    expect(touchdownPattern(NaN)).toEqual([20]);
    expect(touchdownPattern(undefined)).toEqual([20]);
  });
});

describe('alertPattern', () => {
  it('stall and pull-up are distinct pulse patterns', () => {
    const s = alertPattern('stall');
    const p = alertPattern('pullup');
    expect(s.length).toBeGreaterThan(1);
    expect(p.length).toBeGreaterThan(1);
    expect(s).not.toEqual(p);
  });
  it('unknown kinds and reduced motion give no buzz', () => {
    expect(alertPattern('nope')).toBe(null);
    expect(alertPattern('stall', true)).toBe(null);
    expect(alertPattern('pullup', true)).toBe(null);
  });
});

describe('createAlertEdge', () => {
  it('fires once at the onset, not every frame', () => {
    const edge = createAlertEdge(3);
    let n = 0;
    for (let t = 0; t < 10; t += 1 / 60) if (edge(true, t)) n++;
    expect(n).toBe(1);
  });
  it('a flickering warning does not re-fire inside the hold-off', () => {
    const edge = createAlertEdge(3);
    expect(edge(true, 0)).toBe(true);
    expect(edge(false, 0.5)).toBe(false);
    expect(edge(true, 1.0)).toBe(false); // flicker
    expect(edge(false, 1.5)).toBe(false);
    expect(edge(true, 4.0)).toBe(true); // a new warning, 3 s on
  });
  it('a warning held on through the hold-off is still one onset', () => {
    const edge = createAlertEdge(3);
    expect(edge(true, 0)).toBe(true);
    expect(edge(true, 5)).toBe(false);
    expect(edge(false, 6)).toBe(false);
    expect(edge(true, 6.1)).toBe(true);
  });
});

describe('buzz', () => {
  it('calls navigator.vibrate with the pattern', () => {
    const nav = { vibrate: vi.fn(() => true) };
    expect(buzz(nav, [20])).toBe(true);
    expect(nav.vibrate).toHaveBeenCalledWith([20]);
  });
  it('no API, no pattern or a throwing API: no call and no error', () => {
    expect(buzz({}, [20])).toBe(false);
    expect(buzz(undefined, [20])).toBe(false);
    const nav = { vibrate: vi.fn() };
    expect(buzz(nav, null)).toBe(false);
    expect(nav.vibrate).not.toHaveBeenCalled();
    expect(buzz({ vibrate() { throw new Error('blocked'); } }, [20])).toBe(false);
  });
  it('hapticsSupported feature-detects', () => {
    expect(hapticsSupported({ vibrate() {} })).toBe(true);
    expect(hapticsSupported({})).toBe(false);
    expect(hapticsSupported(undefined)).toBe(false);
  });
});

describe('haptics setting', () => {
  it('is on by default and round-trips as openaero_haptics_v1 { v: 1, on, at }', () => {
    const s = memStore();
    expect(loadHaptics(s)).toBe(true);
    saveHaptics(s, false, 123);
    expect(JSON.parse(s.getItem(HAPTICS_KEY))).toEqual({ v: 1, on: false, at: 123 });
    expect(loadHaptics(s)).toBe(false);
    saveHaptics(s, true);
    expect(loadHaptics(s)).toBe(true);
  });
  it('tolerates throwing or junk storage', () => {
    expect(loadHaptics(throwingStore)).toBe(true);
    expect(() => saveHaptics(throwingStore, false)).not.toThrow();
    const s = memStore();
    s.setItem(HAPTICS_KEY, '{not json');
    expect(loadHaptics(s)).toBe(true);
    s.setItem(HAPTICS_KEY, JSON.stringify({ v: 2, on: false }));
    expect(loadHaptics(s)).toBe(true);
  });
});
