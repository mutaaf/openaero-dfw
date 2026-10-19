import { describe, it, expect } from 'vitest';
import {
  resLadder, createResScale, stepResScale,
  RES_SLOW_MS, RES_FAST_MS, RES_COOL_S, RES_MAX_COOL_S, RES_SPIKE_MS,
} from '../../src/resScale.js';

// Feed `seconds` of frames, each `ms` long; returns every ratio change in order.
function run(st, ms, seconds) {
  const changes = [];
  for (let t = 0; t < seconds * 1000; t += ms) {
    const before = st.ratio;
    stepResScale(st, ms);
    if (st.ratio !== before) changes.push(st.ratio);
  }
  return changes;
}

describe('resLadder', () => {
  it('starts at the device ratio capped at 2 and steps down to a floor of 1', () => {
    expect(resLadder(3)).toEqual([2, 1.5, 1.25, 1]);
    expect(resLadder(2.625)).toEqual([2, 1.5, 1.25, 1]);
    expect(resLadder(2)).toEqual([2, 1.5, 1.25, 1]);
    expect(resLadder(1.75)).toEqual([1.75, 1.5, 1.25, 1]);
    expect(resLadder(1.5)).toEqual([1.5, 1.25, 1]);
    expect(resLadder(1)).toEqual([1]);
  });
  it('never goes below 1, even on a sub-1 or missing device ratio', () => {
    expect(resLadder(0.75)).toEqual([1]);
    expect(resLadder(undefined)).toEqual([1]);
    expect(resLadder(NaN)).toEqual([1]);
  });
});

describe('stepResScale', () => {
  it('starts at the device cap', () => {
    expect(createResScale(3).ratio).toBe(2);
    expect(createResScale(1).ratio).toBe(1);
  });

  it('stays at the cap on a fast machine', () => {
    const st = createResScale(2);
    expect(run(st, 8, 60)).toEqual([]);
    expect(st.ratio).toBe(2);
  });

  it('steps down one rung per second of sustained slow frames, to the floor', () => {
    const st = createResScale(2);
    expect(run(st, 40, 1.01)).toEqual([1.5]);
    expect(run(st, 40, 1.01)).toEqual([1.25]);
    expect(run(st, 40, 10)).toEqual([1]);
    expect(st.ratio).toBe(1);
  });

  it('a single slow frame inside a fast second does not step down', () => {
    const st = createResScale(2);
    for (let i = 0; i < 10; i++) {
      stepResScale(st, 100);
      expect(run(st, 8, 0.9)).toEqual([]);
    }
    expect(st.ratio).toBe(2);
  });

  it(`steps up only after ${RES_COOL_S} s under ${RES_FAST_MS} ms`, () => {
    const st = createResScale(2);
    run(st, 40, 1.01);
    expect(st.ratio).toBe(1.5);
    expect(run(st, 8, RES_COOL_S - 1.1)).toEqual([]);
    expect(run(st, 8, 1.2)).toEqual([2]);
  });

  it('frames between the thresholds hold the ratio and reset the cool-down', () => {
    const st = createResScale(2);
    run(st, 40, 1.01);
    run(st, 8, RES_COOL_S - 1.5);
    run(st, (RES_SLOW_MS + RES_FAST_MS) / 2, 2); // middling: hold
    expect(st.ratio).toBe(1.5);
    expect(run(st, 8, RES_COOL_S - 1.5)).toEqual([]); // cool-down started over
  });

  it('never oscillates on alternating fast and slow frames', () => {
    const st = createResScale(2);
    const changes = [];
    for (let i = 0; i < 6000; i++) {
      const before = st.ratio;
      stepResScale(st, i % 2 ? 30 : 10);
      if (st.ratio !== before) changes.push(st.ratio);
    }
    expect(changes).toEqual([]);
  });

  it('backs off when stepping up makes it slow again (no ping-pong on a borderline device)', () => {
    const st = createResScale(2);
    run(st, 40, 1.01); // 2 → 1.5
    // A device that is fast at 1.5 and slow at 2: count the up-steps over two minutes.
    let ups = 0;
    for (let t = 0; t < 120_000;) {
      const ms = st.ratio === 2 ? 40 : 8;
      const before = st.ratio;
      stepResScale(st, ms);
      t += ms;
      if (st.ratio > before) ups++;
    }
    expect(ups).toBeLessThanOrEqual(4); // 5 s, 10 s, 20 s, 40 s cool-downs
    expect(st.coolS).toBeGreaterThan(RES_COOL_S);
    expect(st.coolS).toBeLessThanOrEqual(RES_MAX_COOL_S);
  });

  it(`ignores dt spikes over ${RES_SPIKE_MS} ms (tab switch, GC, alt-tab)`, () => {
    const st = createResScale(2);
    for (let i = 0; i < 20; i++) stepResScale(st, 2000);
    stepResScale(st, RES_SPIKE_MS + 1);
    expect(st.ratio).toBe(2);
  });

  it('ignores non-finite or negative samples', () => {
    const st = createResScale(2);
    for (const bad of [NaN, Infinity, -5, 0]) stepResScale(st, bad);
    expect(st.ratio).toBe(2);
    expect(run(st, 8, 3)).toEqual([]);
  });

  it('reports a change only on the frame the ratio moved', () => {
    const st = createResScale(2);
    let changed = 0;
    for (let t = 0; t < 1010; t += 40) if (stepResScale(st, 40)) changed++;
    expect(changed).toBe(1);
    expect(st.ratio).toBe(1.5);
  });

  it('at the floor and the cap, nothing moves', () => {
    const st = createResScale(1);
    expect(run(st, 60, 10)).toEqual([]);
    expect(run(st, 5, 30)).toEqual([]);
    expect(st.ratio).toBe(1);
  });

  it('allocates nothing per step (same state object, plain numbers)', () => {
    const st = createResScale(2);
    const keys = Object.keys(st).join();
    run(st, 40, 3);
    expect(Object.keys(st).join()).toBe(keys);
  });
});
