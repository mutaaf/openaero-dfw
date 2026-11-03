import { describe, it, expect } from 'vitest';
import {
  GO_AROUND_KEY, GA_TEXT, createGoAround, goAroundState, gradeGoAround, capUnstableLanding, GA_CAP_SCORE,
} from '../../src/goAround.js';
import { gradeLanding } from '../../src/landing.js';
import { coachTarget, coachText, goAroundTarget } from '../../src/coach.js';
import { MISSIONS, groupMissions } from '../../src/missions.js';
import { runwayEnd, approachSpawn, approachGeometry, AIM_POINT_M } from '../../src/airports.js';
import { ilsDots, GS_DOT_DEG } from '../../src/aero.js';

const UNSTABLE = { stable: false, failing: ['FAST', 'GLIDESLOPE'], gateHeight: 500 };
const STABLE = { stable: true, failing: [], gateHeight: 500 };
const frame = (o) => ({ gate: null, aaeFt: 1200, vsFpm: -900, iasKts: 160, throttle: 0.5, flapsIndex: 2, onGround: false, ...o });

// Flies a profile [aaeFt, vsFpm] through the state machine; returns every transition.
function fly(st, gate, profile, extra = {}) {
  const events = [];
  for (const [aaeFt, vsFpm, iasKts = 150, onGround = false] of profile) {
    const e = goAroundState(st, frame({ gate, aaeFt, vsFpm, iasKts, onGround, ...extra }));
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
    expect(st).toMatchObject({ phase: 'complete', callFt: 500, lowFt: 420, climbFpm: 700, callFlaps: 2 });
    // and it fires once.
    expect(fly(st, UNSTABLE, [[600, 700], [700, 700]])).toEqual([]);
  });

  it('the missed approach is over at 2,000 ft, or when it descends again for another try', () => {
    for (const end of [[2000, 900], [1500, -400]]) {
      const st = createGoAround();
      fly(st, UNSTABLE, [[500, -900], [420, -100], [520, 700]]);
      expect(fly(st, UNSTABLE, [[1500, 900], [1500, -100], end])).toEqual(['done']);
      expect(st.phase).toBe('done');
      expect(fly(st, UNSTABLE, [[400, -700], [0, -200, 140, true]])).toEqual([]); // no cap, no second card
    }
  });

  it('an early go-around, below 1,000 ft with go-around power and a real climb, counts too', () => {
    const st = createGoAround();
    // Power alone is not a go-around, nor a climb at approach power.
    fly(st, null, [[1200, -900], [900, -800], [800, -300]]);
    expect(fly(st, null, [[850, 300], [950, 400]])).toEqual([]);
    expect(fly(st, null, [[960, 300]], { throttle: 1 })).toEqual(['complete']);
    expect(st).toMatchObject({ phase: 'complete', callFt: null, lowFt: 800 });
    // From high up (above 1,000 ft) a climb is not a go-around yet.
    const hi = createGoAround();
    expect(fly(hi, null, [[1300, -900], [1250, -300], [1400, 500]], { throttle: 1 })).toEqual([]);
  });

  it('remembers the flap lever at the call (the most flap of the approach for an early one)', () => {
    const st = createGoAround();
    fly(st, null, [[1200, -900]], { flapsIndex: 3 });
    fly(st, null, [[800, -900]], { flapsIndex: 2 });
    expect(st.callFlaps).toBe(3);
    fly(st, UNSTABLE, [[500, -900]], { flapsIndex: 3 });
    expect(st.callFlaps).toBe(3);
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
  const crisp = { callFt: 500, lowFt: 430, gateFt: 500, minIasKts: 150, vrefKts: 136, climbFpm: 1500, flapsUp: true };
  it('a prompt, clean go-around grades S or A', () => {
    const g = gradeGoAround(crisp);
    expect(g.kind).toBe('goAround');
    expect(['S', 'A']).toContain(g.grade);
    expect(g.factors.map((f) => f.key)).toEqual(['decision', 'climb', 'speed', 'flaps']);
    expect(g.factors[0].value).toBe('70 ft');
    expect(g.note).toBeNull();
  });
  it('sinking to 100 ft before climbing scores much lower', () => {
    expect(gradeGoAround({ ...crisp, lowFt: 100 }).score).toBeLessThan(gradeGoAround(crisp).score - 20);
  });
  it('bleeding to 10 kt under Vref costs the speed factor', () => {
    const g = gradeGoAround({ ...crisp, minIasKts: 126 });
    expect(g.factors.find((f) => f.key === 'speed').score).toBeLessThan(50);
  });
  it('landing flaps left set cost the flaps factor; when the assist flies the flaps it is not scored', () => {
    expect(gradeGoAround({ ...crisp, flapsUp: false }).factors.find((f) => f.key === 'flaps').score).toBe(0);
    const kid = gradeGoAround({ ...crisp, flapsUp: null });
    expect(kid.factors.map((f) => f.key)).toEqual(['decision', 'climb', 'speed']);
    expect(kid.score).toBe(gradeGoAround(crisp).score); // a perfect run is still a perfect score
  });
  it('an early go-around loses no height and says so', () => {
    const g = gradeGoAround({ ...crisp, callFt: null, lowFt: 800 });
    expect(g.factors[0]).toMatchObject({ score: 100, value: /early/ });
    expect(g.note).toMatch(/early go-around/i);
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
    for (const t of Object.values(GA_TEXT)) expect(t.length).toBeLessThanOrEqual(48); // goAround.js's words, added on load
    expect(coachText('gaPower')).toBe(GA_TEXT.gaPower);
    expect(coachText('gaGear')).toMatch(/gear up/i);
    expect(coachText('gaFlaps', { touch: true })).toMatch(/tap FLAPS/);
    expect(coachText('gaGear', { touch: true })).toMatch(/tap GEAR/);
    expect(coachText('gaFlaps')).toMatch(/press F/);
    expect(coachText('gaFlaps', { flapsDeg: 10 })).toBe('Flaps up a notch: press F, to 10°');
    expect(coachText('gaFlaps', { flapsDeg: 10, touch: true })).toBe('Flaps up a notch: tap FLAPS to 10°');
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
