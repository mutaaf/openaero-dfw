import { describe, it, expect } from 'vitest';
import { gradeLanding, loadBest, recordBest, BEST_KEY, driftAngleDeg, createBounceTracker, stepBounce, capBounced, recontactCrash } from '../../src/landing.js';

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

describe('crab / de-crab (crosswind challenge)', () => {
  it('drift is heading minus ground track, + = nose right of track', () => {
    expect(driftAngleDeg(0, 0, -70)).toBeCloseTo(0);
    // Tracking north (−Z) with the nose 5° right: crabbed into a wind from the right.
    expect(driftAngleDeg(5, 0, -70)).toBeCloseTo(5);
    // Tracking 180 (+Z), nose at 175: 5° left.
    expect(driftAngleDeg(175, 0, 70)).toBeCloseTo(-5);
    // Across north: heading 358, track 002.
    const vx = Math.sin(2 * Math.PI / 180) * 70, vz = -Math.cos(2 * Math.PI / 180) * 70;
    expect(driftAngleDeg(358, vx, vz)).toBeCloseTo(-4);
    expect(driftAngleDeg(90, 0, 0)).toBe(0);
  });
  it('adds an unweighted note: full marks at ≤3°, score unchanged', () => {
    const plain = gradeLanding(good);
    const decrabbed = gradeLanding({ ...good, driftDeg: 2.5 });
    const crabbed = gradeLanding({ ...good, driftDeg: -9 });
    expect(decrabbed.factors.map((f) => f.key)).toEqual(['rate', 'centreline', 'zone', 'flare', 'speed', 'crab']);
    expect(decrabbed.factors[5].score).toBe(100);
    expect(decrabbed.factors[5].value).toBe('2.5° drift (not scored)');
    expect(crabbed.factors[5].score).toBeLessThan(50);
    expect(decrabbed.score).toBe(plain.score);
    expect(crabbed.score).toBe(plain.score);
    expect(plain.factors).toHaveLength(5);
  });
});

// Ticket 0091: a wheel-height trace (ft) at 60 Hz through the tracker, from the first touchdown.
function track(segments) {
  const b = createBounceTracker();
  const dt = 1 / 60;
  for (const [ft, s, onGround = ft <= 0] of segments) {
    for (let t = 0; t < s - 1e-9; t += dt) stepBounce(b, ft, onGround, dt);
  }
  return b;
}

describe('bounced landings (0091)', () => {
  it('a 3 ft, 0.5 s hop after the touchdown is one bounce, then the landing settles', () => {
    const b = track([[0, 0.2], [3, 0.5], [0, 1.2]]);
    expect(b.bounces).toBe(1);
    expect(b.settled).toBe(true);
    expect(b.peakFt).toBe(3);
  });
  it('a trace that never leaves 1 ft is no bounce', () => {
    const b = track([[0, 0.1], [1, 0.8], [0.5, 0.5], [0, 1.2]]);
    expect(b.bounces).toBe(0);
    expect(b.settled).toBe(true);
  });
  it('a strut rebound shorter than 0.3 s is no bounce, even above 2 ft', () => {
    expect(track([[0, 0.2], [2.5, 0.2], [0, 1.2]]).bounces).toBe(0);
  });
  it('two hops are two bounces, and a long one counts once', () => {
    expect(track([[0, 0.2], [4, 2], [0, 0.3], [3, 0.6], [0, 1.2]]).bounces).toBe(2);
  });
  it('wheels wandering around 2 ft in ground effect, never touching again, are one bounce', () => {
    const b = track([[0, 0.2], [3, 0.5, false], [1.5, 0.1, false], [2.5, 0.5, false], [1.8, 0.1, false], [2.2, 0.5, false], [0, 1.2]]);
    expect(b.bounces).toBe(1);
  });
  it('a touchdown after a bounce is a crash past the landing limits (600 fpm, 10° bank)', () => {
    expect(recontactCrash(-614, 0)).toMatch(/Hard landing after the bounce/);
    expect(recontactCrash(-300, 12)).toMatch(/Wingtip/);
    expect(recontactCrash(-450, 3)).toBeNull();
  });
  it('does not settle while the wheels skim the runway without touching it', () => {
    const b = track([[0, 0.2], [1, 3, false]]);
    expect(b.settled).toBe(false);
  });
  it('stops counting once settled (a later lift-off is a takeoff, not a bounce)', () => {
    expect(track([[0, 1.2], [10, 2]]).bounces).toBe(0);
  });
  it('allocates nothing per step (returns the same object)', () => {
    const b = createBounceTracker();
    expect(stepBounce(b, 0, true, 0.016)).toBe(b);
  });
  it('one bounce caps the grade at C, two or more at D; none leaves it alone', () => {
    const a = gradeLanding(good);
    expect(capBounced(a, 0)).toBe(a);
    const one = capBounced(a, 1);
    expect(one.grade).toBe('C');
    expect(one.score).toBeLessThan(70);
    expect(one.reason).toBe('Bounced once: best grade C.');
    expect(one.factors).toEqual(a.factors); // scored on the first touchdown
    const two = capBounced(a, 3);
    expect(two.grade).toBe('D');
    expect(two.score).toBeLessThan(55);
    expect(two.reason).toBe('Bounced ×3: best grade D.');
  });
  it('a cap never improves a worse grade and leaves a crash alone', () => {
    const off = gradeLanding({ ...good, crossM: 40 }); // D, off the runway
    const c = capBounced(off, 1);
    expect(c.grade).toBe('D');
    expect(c.reason).toMatch(/Bounced once.*off the runway/);
    const crash = gradeLanding({ ...good, vsFpm: -700 });
    expect(capBounced(crash, 2)).toBe(crash);
  });
});
