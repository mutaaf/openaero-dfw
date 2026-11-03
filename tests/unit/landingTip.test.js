import { describe, it, expect } from 'vitest';
import { gradeLanding, capBounced, recontactCrash } from '../../src/landing.js';
import { capUnstableLanding, GA_CAP_REASON } from '../../src/goAround.js';
import { deadStickResult } from '../../src/deadStick.js';
import { runwayEnd } from '../../src/airports.js';
import { landingTip } from '../../src/landingTip.js';

// Ticket 0061: the results card names the one thing to fix next time. Every input is a real
// gradeLanding output, so a change to the grade's wording or values breaks these first.
const good = { vsFpm: -110, crossM: 0.8, pastThresholdM: 320, runwayLengthM: 4085, runwayWidthM: 45.7, pitchDeg: 3.5, bankDeg: 0.5, iasKts: 140, vrefKts: 136 };
const tip = (t, ctx) => landingTip(gradeLanding({ ...good, ...t }), ctx);

const FACTOR_CASES = [
  [{ vsFpm: -380 }, /^Touched down at 380 fpm: flare a little earlier/],
  [{ vsFpm: -200, iasKts: 147 }, /^Touched down at 200 fpm: nearly there, hold the flare/], // rate worst, under 240
  [{ crossM: 14 }, /^14\.0 m right of the centreline: /],
  [{ crossM: -14 }, /^14\.0 m left of the centreline: /],
  [{ pastThresholdM: 1200 }, /^Touched down 1200 m past threshold: .*don't float/],
  [{ pastThresholdM: 5 }, /^Touched down only 5 m past threshold: aim further in/],
  [{ pitchDeg: -2 }, /^Nose down at touchdown \(-2\.0°\): .*main wheels/],
  [{ pitchDeg: 0, iasKts: 151 }, /^Flat touchdown \(0\.0° nose up\): /],
  [{ pitchDeg: 11 }, /^11\.0° nose up at touchdown: /],
  [{ bankDeg: 8 }, /^8\.0° of bank at touchdown: use only enough bank to hold the centreline/],
  [{ iasKts: 165 }, /^165 kt, 29 kt over the approach speed \(136\): slow down sooner, power to idle/],
  [{ iasKts: 118 }, /^118 kt, 18 kt under the approach speed \(136\): fly 136 kt down to the flare/],
];

describe('landingTip', () => {
  it('an S gets no tip', () => {
    const g = gradeLanding(good);
    expect(g.grade).toBe('S');
    expect(landingTip(g)).toBeNull();
  });

  it('each factor, when it is the worst, gets its own tip with the number the card showed', () => {
    for (const [t, re] of FACTOR_CASES) {
      const g = gradeLanding({ ...good, ...t });
      expect(g.grade, JSON.stringify(t)).not.toBe('S');
      expect(landingTip(g), JSON.stringify(t)).toMatch(re);
    }
  });

  it('ties go to the first factor in a fixed order (rate, centreline, zone, flare, speed)', () => {
    const g = gradeLanding(good);
    const scored = { ...g, grade: 'B', factors: g.factors.map((f) => ({ ...f, score: f.key === 'zone' || f.key === 'speed' ? 50 : 100 })) };
    expect(landingTip(scored)).toMatch(/past threshold/);
    const allEqual = { ...g, grade: 'A', factors: g.factors.map((f) => ({ ...f, score: 90 })) };
    expect(landingTip(allEqual)).toMatch(/^Touched down at 110 fpm/);
  });

  it('a factor that lost no points is never blamed', () => {
    expect(landingTip({ ...gradeLanding(good), grade: 'A' })).toBeNull();
  });

  it('the unscored crab factor is not what the tip picks', () => {
    expect(tip({ vsFpm: -300, driftDeg: 14 })).toMatch(/fpm/);
  });

  it('every CRASH reason gets a tip', () => {
    expect(tip({ gearLocked: false })).toMatch(/gear .*down/i);
    expect(tip({ vsFpm: -720 })).toMatch(/^720 fpm is too hard: start the flare earlier \(under 240 fpm/);
    expect(tip({ bankDeg: -12 })).toMatch(/^12\.0° of bank at touchdown: /);
    // A hard re-contact after a bounce (main.js builds this result from recontactCrash).
    const first = gradeLanding(good);
    for (const reason of [recontactCrash(-700, 0), recontactCrash(-100, 14)]) {
      const r = { ...first, grade: 'CRASH', score: 0, reason, bounces: 1 };
      expect(landingTip(r)).toBe('After a bounce, hold the landing attitude, add a little power or go around.');
      expect(landingTip(r, { noEngine: true })).toBe('After a bounce, hold the landing attitude and let it settle.');
    }
  });

  it('every D reason gets a tip', () => {
    expect(tip({ pastThresholdM: -60 })).toMatch(/^Touched down short: .*PAPI/);
    expect(tip({ crossM: 40 })).toMatch(/^40\.0 m right of the centreline: /); // off the side
    expect(tip({ pastThresholdM: 4200 })).toMatch(/^Touched down 4200 m past threshold: /); // off the end
  });

  it('a bounce names what made it bounce', () => {
    expect(landingTip(capBounced(gradeLanding({ ...good, vsFpm: -260 }), 1))).toMatch(/^You bounced\. Touched down at 260 fpm: flare a little earlier/);
    expect(landingTip(capBounced(gradeLanding({ ...good, vsFpm: -80, iasKts: 161 }), 1))).toMatch(/^You bounced\. 161 kt, 25 kt over/);
    expect(landingTip(capBounced(gradeLanding(good), 1))).toBe('You bounced: hold the landing attitude, add a little power or go around.');
  });

  it('landing anyway in the go-around drill says to go around, not to fix a fine touchdown', () => {
    const r = capUnstableLanding(gradeLanding(good));
    expect(r.reason).toBe(GA_CAP_REASON);
    expect(landingTip(r)).toMatch(/^When the gate calls go around: full power/);
  });

  it('Kid is told to let the assist fly, never to work the power or the flare', () => {
    for (const [t] of FACTOR_CASES) expect(tip(t, { kid: true })).toMatch(/^Let go of the stick/);
    expect(landingTip(capBounced(gradeLanding({ ...good, vsFpm: -260 }), 1), { kid: true })).toMatch(/^Let go of the stick/);
  });

  it('no engine, no power advice', () => {
    expect(tip({ iasKts: 165 }, { noEngine: true })).not.toMatch(/power/);
    expect(landingTip(capBounced(gradeLanding(good), 1), { noEngine: true })).not.toMatch(/power/);
  });

  it('dead-stick: made the runway gets the touchdown tip; a miss already says what to do', () => {
    const E16 = runwayEnd('KADS', '16');
    const r = E16.hdgT * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r);
    const P = (beforeM) => ({ x: E16.thrX - dx * beforeM, y: 0, z: E16.thrZ - dz * beforeM });
    const c172 = { ...good, runwayLengthM: E16.lengthM - E16.displacedM, runwayWidthM: E16.widthM, iasKts: 60, vrefKts: 62 };
    const made = deadStickResult(gradeLanding({ ...c172, vsFpm: -380 }), E16, P(-250));
    expect(made.madeRunway).toBe(true);
    expect(landingTip(made, { noEngine: true })).toMatch(/380 fpm/);
    const missed = deadStickResult(gradeLanding({ ...c172, pastThresholdM: -400 }), E16, P(400));
    expect(missed.madeRunway).toBe(false);
    expect(landingTip(missed, { noEngine: true })).toBeNull();
    // A wingtip strike off the runway: the miss keeps only rate and speed (no flare factor).
    const strike = deadStickResult(gradeLanding({ ...c172, bankDeg: 14, pastThresholdM: -400 }), E16, P(400));
    expect(strike.grade).toBe('CRASH');
    expect(() => landingTip(strike, { noEngine: true })).not.toThrow();
  });

  it('drills with their own cards (go-around, stall) get none', () => {
    expect(landingTip({ kind: 'goAround', grade: 'C', factors: [] })).toBeNull();
    expect(landingTip({ kind: 'stall', grade: 'D', factors: [] })).toBeNull();
  });

  it('every tip is one short sentence (fits the card sideways on a phone)', () => {
    const results = [...FACTOR_CASES.map(([t]) => gradeLanding({ ...good, ...t })),
      ...[{ gearLocked: false }, { vsFpm: -720 }, { bankDeg: 12 }, { pastThresholdM: -60 }, { crossM: 40 }].map((t) => gradeLanding({ ...good, ...t })),
      capBounced(gradeLanding({ ...good, vsFpm: -380 }), 1), capBounced(gradeLanding({ ...good, iasKts: 165 }), 2)];
    for (const res of results) {
      for (const ctx of [{}, { kid: true }, { noEngine: true }]) {
        const s = landingTip(res, ctx);
        expect(s.length, s).toBeLessThanOrEqual(120);
        expect(s).toMatch(/\.$/);
      }
    }
  });
});
