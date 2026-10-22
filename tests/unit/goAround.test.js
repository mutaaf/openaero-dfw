import { describe, it, expect } from 'vitest';
import {
  GO_AROUND_KEY, createGoAround, goAroundState, gradeGoAround, capUnstableLanding, GA_CAP_SCORE,
} from '../../src/goAround.js';
import { gradeLanding } from '../../src/landing.js';
import { coachTarget, coachText, goAroundTarget } from '../../src/coach.js';
import { MISSIONS, groupMissions } from '../../src/missions.js';
import { runwayEnd, approachSpawn, approachGeometry, AIM_POINT_M } from '../../src/airports.js';
import { ilsDots, GS_DOT_DEG } from '../../src/aero.js';

const UNSTABLE = { stable: false, failing: ['FAST', 'GLIDESLOPE'], gateHeight: 500 };
const STABLE = { stable: true, failing: [], gateHeight: 500 };
const frame = (o) => ({ gate: null, aaeFt: 1200, vsFpm: -900, iasKts: 160, onGround: false, ...o });

// Flies a profile [aaeFt, vsFpm] through the state machine; returns every transition.
function fly(st, gate, profile) {
  const events = [];
  for (const [aaeFt, vsFpm, iasKts = 150, onGround = false] of profile) {
    const e = goAroundState(st, frame({ gate, aaeFt, vsFpm, iasKts, onGround }));
    if (e) events.push(e);
  }
  return events;
}

describe('goAroundState (0047)', () => {
  it('flags "complete" only after positive rate through 500 ft following an unstabilized gate', () => {
    const st = createGoAround();
    expect(fly(st, null, [[1200, -900], [800, -900], [520, -900]])).toEqual([]);
    expect(st.phase).toBe('approach');
    // Gate evaluated at 500 ft: unstabilized. Sinks to 420 while the power comes up...
    expect(fly(st, UNSTABLE, [[500, -900], [460, -600], [420, -100]])).toEqual(['goAround']);
    // ...a climb below 500 ft is not yet complete, nor is 500 ft still sinking...
    expect(fly(st, UNSTABLE, [[450, 400], [499, 600]])).toEqual([]);
    expect(st.phase).toBe('goAround');
    expect(fly(st, UNSTABLE, [[505, 700]])).toEqual(['complete']);
    expect(st).toMatchObject({ phase: 'complete', lowFt: 420, climbFpm: 700 });
    // and it fires once.
    expect(fly(st, UNSTABLE, [[600, 700], [700, 700]])).toEqual([]);
  });

  it('never completes without an unstabilized gate: stable, or none at all', () => {
    for (const gate of [null, STABLE]) {
      const st = createGoAround();
      expect(fly(st, gate, [[500, -700], [400, -700], [450, 800], [600, 900], [900, 900]])).toEqual([]);
      expect(st.phase).toBe('approach');
    }
  });

  it('at 500 ft but sinking, or level, is not a go-around yet', () => {
    const st = createGoAround();
    fly(st, UNSTABLE, [[500, -900], [380, -200]]);
    expect(fly(st, UNSTABLE, [[520, -50], [520, 0], [520, 99]])).toEqual([]);
    expect(fly(st, UNSTABLE, [[520, 100]])).toEqual(['complete']);
  });

  it('an IMC gate at 1,000 ft completes after a real climb from the lowest point, not a bump', () => {
    const st = createGoAround();
    const imc = { ...UNSTABLE, gateHeight: 1000 };
    fly(st, imc, [[1000, -800], [900, -200]]);
    expect(fly(st, imc, [[905, 300], [940, 300]])).toEqual([]); // 40 ft up from 900
    expect(fly(st, imc, [[1001, 400]])).toEqual(['complete']);
  });

  it('touching down after the call is "landed" (should have gone around)', () => {
    const st = createGoAround();
    expect(fly(st, UNSTABLE, [[500, -900], [200, -800], [0, -300, 140, true]])).toEqual(['goAround', 'landed']);
    expect(st.phase).toBe('landed');
    expect(fly(st, UNSTABLE, [[100, 500], [600, 900]])).toEqual([]);
  });

  it('tracks the slowest speed of the go-around, from the gate on', () => {
    const st = createGoAround();
    fly(st, null, [[1200, -900, 120]]);
    fly(st, UNSTABLE, [[500, -900, 165], [450, -100, 150], [480, 500, 141], [520, 700, 146]]);
    expect(st.minIasKts).toBe(141);
  });

  it('allocates nothing per frame', () => {
    const st = createGoAround();
    const s = frame({ gate: UNSTABLE, aaeFt: 450, vsFpm: -100 });
    goAroundState(st, s);
    const before = { ...st };
    goAroundState(st, s);
    expect(st.gate).toBe(before.gate);
  });
});

describe('gradeGoAround (0047)', () => {
  const crisp = { lowFt: 430, gateFt: 500, minIasKts: 150, vrefKts: 136, climbFpm: 1500, flapsUp: true, gearUp: true };
  it('a prompt, clean go-around grades S or A', () => {
    const g = gradeGoAround(crisp);
    expect(g.kind).toBe('goAround');
    expect(['S', 'A']).toContain(g.grade);
    expect(g.factors.map((f) => f.key)).toEqual(['decision', 'climb', 'speed', 'config']);
  });
  it('sinking to 100 ft before climbing scores much lower', () => {
    expect(gradeGoAround({ ...crisp, lowFt: 100 }).score).toBeLessThan(gradeGoAround(crisp).score - 20);
  });
  it('bleeding to 10 kt under Vref costs the speed factor', () => {
    const g = gradeGoAround({ ...crisp, minIasKts: 126 });
    expect(g.factors.find((f) => f.key === 'speed').score).toBeLessThan(50);
  });
  it('landing flaps and gear left down cost the configuration factor; fixed gear is not a fault', () => {
    expect(gradeGoAround({ ...crisp, flapsUp: false, gearUp: false }).factors.find((f) => f.key === 'config').score).toBe(0);
    expect(gradeGoAround({ ...crisp, gearUp: null }).factors.find((f) => f.key === 'config')).toMatchObject({ score: 100, value: /fixed gear/ });
  });
});

describe('capUnstableLanding (0047)', () => {
  const greaser = { vsFpm: -110, crossM: 0.8, pastThresholdM: 320, runwayLengthM: 4085, runwayWidthM: 45.7, pitchDeg: 3.5, bankDeg: 0.5, iasKts: 140, vrefKts: 136 };
  it('a greaser after the go-around call is capped at D, and says why', () => {
    const r = capUnstableLanding(gradeLanding(greaser));
    expect(r.grade).toBe('D');
    expect(r.score).toBeLessThanOrEqual(GA_CAP_SCORE);
    expect(r.reason).toMatch(/should have gone around/i);
  });
  it('keeps a crash a crash, and an off-runway reason too', () => {
    expect(capUnstableLanding(gradeLanding({ ...greaser, vsFpm: -800 })).grade).toBe('CRASH');
    const off = capUnstableLanding(gradeLanding({ ...greaser, crossM: 40 }));
    expect(off.reason).toMatch(/gone around.*off the runway/i);
  });
});

describe('the go-around coach (0047)', () => {
  const ga = { goAround: true, aglFt: 450, vsiFpm: -600, throttle: 0.4, onGround: false, autopilot: false, papiWhite: 4, flapsLanding: true, gearLocked: true };
  it('walks power, pitch, flaps, gear, then the climb', () => {
    expect(coachTarget(ga)).toBe('gaPower');
    expect(coachTarget({ ...ga, throttle: 1 })).toBe('gaPitch');
    expect(coachTarget({ ...ga, throttle: 1, vsiFpm: 300 })).toBe('gaFlaps');
    expect(coachTarget({ ...ga, throttle: 1, vsiFpm: 300, flapsLanding: false })).toBe('gaGear');
    expect(coachTarget({ ...ga, throttle: 1, vsiFpm: 300, flapsLanding: false, gearLocked: false })).toBe('gaClimb');
    // Fixed gear (the Cessna) skips the gear step.
    expect(goAroundTarget({ ...ga, throttle: 1, vsiFpm: 300, flapsLanding: false, gearLocked: undefined })).toBe('gaClimb');
  });
  it('never says flare or idle low down in a go-around; Kid gets one calm line', () => {
    expect(coachTarget({ ...ga, aglFt: 40, throttle: 1 })).toBe('gaPitch');
    expect(coachTarget({ ...ga, kid: true })).toBe('gaKid');
  });
  it('names the button on a touch screen', () => {
    expect(coachText('gaFlaps', { touch: true })).toMatch(/tap FLAPS/);
    expect(coachText('gaGear', { touch: true })).toMatch(/tap GEAR/);
    expect(coachText('gaFlaps')).toMatch(/press F/);
  });
});

describe('the go_around_drill mission (0047)', () => {
  const m = MISSIONS.find((x) => x.key === GO_AROUND_KEY);
  it('is a KDFW 35C 4 NM final, listed under KDFW with a blurb', () => {
    expect(m).toMatchObject({ kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 4, fastKts: 20, highDots: 1 });
    expect(groupMissions(MISSIONS).find((g) => g.id === 'KDFW').missions.map((x) => x.key)).toContain(GO_AROUND_KEY);
    expect(m.blurb.length).toBeGreaterThan(10);
  });
  it('approachSpawn(highM) starts 1 glideslope dot high', () => {
    const end = runwayEnd('KDFW', '35C');
    const distM = 4 * 1852;
    const highM = Math.tan(GS_DOT_DEG * Math.PI / 180) * (distM + AIM_POINT_M);
    const s = approachSpawn(end, 4, 80, highM);
    const g = approachGeometry(end, s.pos);
    expect(ilsDots(g.heightAbovePathM, g.distM + AIM_POINT_M, GS_DOT_DEG)).toBeCloseTo(1, 2);
    expect(approachSpawn(end, 4, 80).pos.y).toBeCloseTo(s.pos.y - highM, 6);
  });
});
