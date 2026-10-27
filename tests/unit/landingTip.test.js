import { describe, it, expect } from 'vitest';
import { gradeLanding, capBounced, recontactCrash } from '../../src/landing.js';
import { capUnstableLanding } from '../../src/goAround.js';
import { landingTip } from '../../src/landingTip.js';

// Ticket 0061: the results card names the one thing to fix next time. Every input is a real
// gradeLanding output, so a change to the grade's wording or values breaks these first.
const good = { vsFpm: -110, crossM: 0.8, pastThresholdM: 320, runwayLengthM: 4085, runwayWidthM: 45.7, pitchDeg: 3.5, bankDeg: 0.5, iasKts: 140, vrefKts: 136 };
const tip = (t) => landingTip(gradeLanding({ ...good, ...t }));

describe('landingTip', () => {
  it('an S gets no tip', () => {
    const g = gradeLanding(good);
    expect(g.grade).toBe('S');
    expect(landingTip(g)).toBeNull();
  });

  it('each factor, when it is the worst, gets its own tip with the number the card showed', () => {
    const cases = [
      [{ vsFpm: -380 }, /^Touched down at 380 fpm: .*flare/],
      [{ crossM: 14 }, /^14\.0 m right of the centreline: /],
      [{ crossM: -14 }, /^14\.0 m left of the centreline: /],
      [{ pastThresholdM: 1200 }, /^Touched down 1200 m past threshold: .*float/],
      [{ pastThresholdM: 5 }, /^Touched down only 5 m past threshold: /],
      [{ pitchDeg: -2 }, /^Nose down at touchdown \(-2\.0°\): .*main wheels/],
      [{ pitchDeg: 0, iasKts: 151 }, /^Flat touchdown \(0\.0° nose up\): /],
      [{ pitchDeg: 11 }, /^11\.0° nose up is a lot: /],
      [{ bankDeg: 8 }, /^8\.0° of bank at touchdown: level the wings/],
      [{ iasKts: 165 }, /^165 kt at touchdown, Vref 136: slow to Vref/],
      [{ iasKts: 118 }, /^118 kt, slower than Vref 136: /],
    ];
    for (const [t, re] of cases) {
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

  it('the crash-only crab factor is not what the tip picks', () => {
    const g = gradeLanding({ ...good, vsFpm: -300, driftDeg: 14 });
    expect(landingTip(g)).toMatch(/fpm/);
  });

  it('every CRASH reason gets a tip', () => {
    expect(tip({ gearLocked: false })).toMatch(/gear .*down/i);
    expect(tip({ vsFpm: -720 })).toMatch(/^720 fpm is too hard: /);
    expect(tip({ bankDeg: -12 })).toMatch(/^12\.0° of bank at touchdown: /);
    // A hard re-contact after a bounce (main.js builds this result from recontactCrash).
    const first = gradeLanding(good);
    for (const reason of [recontactCrash(-700, 0), recontactCrash(-100, 14)]) {
      expect(landingTip({ ...first, grade: 'CRASH', score: 0, reason, bounces: 1 })).toMatch(/^After a bounce/);
    }
  });

  it('every D reason gets a tip', () => {
    expect(tip({ pastThresholdM: -60 })).toMatch(/^Touched down short: .*PAPI/);
    expect(tip({ crossM: 40 })).toMatch(/^40\.0 m right of the centreline: /); // off the side
    expect(tip({ pastThresholdM: 4200 })).toMatch(/^Touched down 4200 m past threshold: /); // off the end
  });

  it('a bounce is the tip, with the sink it bounced off', () => {
    const g = capBounced(gradeLanding({ ...good, vsFpm: -260 }), 1);
    expect(['C', 'D']).toContain(g.grade);
    expect(landingTip(g)).toMatch(/^You bounced off a 260 fpm touchdown: /);
  });

  it('landing anyway in the go-around drill still gets the touchdown tip', () => {
    expect(landingTip(capUnstableLanding(gradeLanding({ ...good, iasKts: 160 })))).toMatch(/^160 kt at touchdown/);
  });

  it('dead-stick: made the runway gets the touchdown tip; a miss already says what to do', () => {
    const made = { ...gradeLanding({ ...good, vsFpm: -380 }), title: 'Dead-stick landing', madeRunway: true };
    made.factors = [{ key: 'made', label: 'Made the runway', value: 'yes', score: 100 }, ...made.factors];
    expect(landingTip(made)).toMatch(/380 fpm/);
    expect(landingTip({ ...made, grade: 'D', madeRunway: false, reason: 'Short of the runway by 900 ft: turn for it sooner.' })).toBeNull();
  });

  it('drills with their own cards (go-around, stall) get none', () => {
    expect(landingTip({ kind: 'goAround', grade: 'C', factors: [] })).toBeNull();
    expect(landingTip({ kind: 'stall', grade: 'D', factors: [] })).toBeNull();
  });

  it('every tip is one short sentence (fits the card sideways on a phone)', () => {
    const inputs = [{ vsFpm: -380 }, { crossM: 14 }, { pastThresholdM: 1200 }, { pastThresholdM: 5 }, { pitchDeg: -2 },
      { pitchDeg: 0, iasKts: 151 }, { pitchDeg: 11 }, { bankDeg: 8 }, { iasKts: 165 }, { iasKts: 118 }, { gearLocked: false },
      { vsFpm: -720 }, { bankDeg: 12 }, { pastThresholdM: -60 }, { crossM: 40 }];
    for (const t of inputs) {
      const s = tip(t);
      expect(s.length, s).toBeLessThanOrEqual(110);
      expect(s).toMatch(/\.$/);
    }
  });
});
