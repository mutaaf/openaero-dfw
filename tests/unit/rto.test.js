import { describe, it, expect } from 'vitest';
import {
  RTO_KEY, RTO_TEXT, RTO_MIN_KTS, RTO_MAX_KTS, createRto, stepRto, rtoTarget, gradeRto, rtoRefStopM, rtoDone,
} from '../../src/rto.js';
import { coachText, createCoach, stepCoach } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { M_TO_FT } from '../../src/constants.js';

// A roll step: on the runway, 3,000 m ahead, on the centreline, full thrust, no brakes.
const at = (o) => ({ t: 0, onGround: true, wheelFt: 0, iasKts: 0, gsKts: 0, throttle: 1, reverserPos: 0, braking: false, leftM: 3000, crossM: 0, halfWidthM: 22.9, ...o });
// The drill from the fire at 100 kt (t = 10 s, 3,000 m left) to `end`.
function fired(o = {}) {
  const st = createRto(() => 0.5);
  st.failKts = 100;
  expect(stepRto(st, at({ t: 9, iasKts: 99, gsKts: 99 }))).toBe('');
  expect(stepRto(st, at({ t: 10, iasKts: 100, gsKts: 100 }))).toBe('fire');
  return Object.assign(st, o);
}

describe('rejected takeoff drill (ticket 0107)', () => {
  it('is the 737 on all of DFW 35C, a takeoff in the KDFW group, deep-linkable', () => {
    expect(missionByKey(RTO_KEY)).toMatchObject({ key: RTO_KEY, kind: 'takeoff', airport: 'KDFW', rwy: '35C', aircraft: 'b738', rto: true });
    expect(groupMissions(MISSIONS).find((g) => g.id === 'KDFW').missions.map((m) => m.key)).toContain(RTO_KEY);
    expect(missionFromLink(`?mission=${RTO_KEY}`)).toBe(RTO_KEY);
    expect(missionByKey(RTO_KEY).blurb).toMatch(/idle/);
  });

  it('the fire comes at a speed drawn between 75 and 110 kt, below the 737\'s V1', () => {
    expect(createRto(() => 0).failKts).toBe(RTO_MIN_KTS);
    expect(createRto(() => 1).failKts).toBe(RTO_MAX_KTS);
    expect(RTO_MAX_KTS).toBeLessThan(135 - 3);
  });

  it('fires once, on the runway at the speed; not in the air', () => {
    const st = createRto(() => 0); // 75 kt
    expect(stepRto(st, at({ iasKts: 80, onGround: false, wheelFt: 5 }))).toBe('');
    expect(st.phase).toBe('armed');
    expect(stepRto(st, at({ t: 3, iasKts: 75, gsKts: 74 }))).toBe('fire');
    expect(st).toMatchObject({ phase: 'fire', t0: 3, failGsKts: 74, failLeftM: 3000 });
    expect(stepRto(st, at({ t: 3.1, iasKts: 76, gsKts: 75 }))).toBe('');
    expect(rtoDone(st)).toBe(false);
  });

  it('times the reaction to idle and the brakes, and stops on the runway', () => {
    const st = fired();
    stepRto(st, at({ t: 11.2, iasKts: 102, gsKts: 102, throttle: 0 }));
    stepRto(st, at({ t: 11.5, iasKts: 101, gsKts: 101, throttle: 0, braking: true, crossM: -2 }));
    expect(st.idleS).toBeCloseTo(1.2, 5);
    expect(st.brakeS).toBeCloseTo(1.5, 5);
    expect(stepRto(st, at({ t: 25, gsKts: 0.5, throttle: 0, braking: true, leftM: 2550, crossM: 1 }))).toBe('stopped');
    expect(st).toMatchObject({ stopM: 450, leftM: 2550, maxCrossM: 2 });
    expect(rtoDone(st)).toBe(true);
    expect(stepRto(st, at({ t: 26 }))).toBe(''); // over: no second end
  });

  it('idle is the thrust levers closed: sleeves moving with the levers up don\'t count', () => {
    const st = fired();
    stepRto(st, at({ t: 10.8, gsKts: 100, throttle: 0.6, reverserPos: 0.3 }));
    expect(st.idleS).toBe(null);
    stepRto(st, at({ t: 11.1, gsKts: 100, throttle: 0, reverserPos: 0.5 }));
    expect(st.idleS).toBeCloseTo(1.1, 5);
  });

  it('a drill that arms well past its speed (a late chunk) never fires', () => {
    const st = createRto(() => 0); // 75 kt
    expect(stepRto(st, at({ iasKts: 120, gsKts: 120 }))).toBe('');
    expect(st.phase).toBe('late');
    expect(stepRto(st, at({ t: 1, iasKts: 121, gsKts: 121 }))).toBe('');
    expect(rtoDone(st)).toBe(false);
  });

  it('ends at once on an overrun, off the side, or a lift-off', () => {
    expect(stepRto(fired(), at({ t: 30, gsKts: 40, leftM: -1 }))).toBe('overrun');
    expect(stepRto(fired(), at({ t: 30, gsKts: 40, crossM: 26.5 }))).toBe('off');
    expect(stepRto(fired(), at({ t: 30, gsKts: 40, crossM: -25 }))).toBe('');
    expect(stepRto(fired(), at({ t: 30, iasKts: 140, onGround: false, wheelFt: 5 }))).toBe('');
    expect(stepRto(fired(), at({ t: 30, iasKts: 140, onGround: false, wheelFt: 20 }))).toBe('rotated');
    // Airborne past the end, however low: a takeoff, not a roll off the end.
    expect(stepRto(fired(), at({ t: 30, iasKts: 140, onGround: false, wheelFt: 5, leftM: -10 }))).toBe('rotated');
  });

  it('the coach: roll words, then idle, brakes, reverse, straight; Kid lets the plane do it', () => {
    const st = createRto(() => 0);
    const s = { onGround: true, throttle: 1, reverserPos: 0, braking: false, canReverse: true, gsKts: 100, kid: false };
    expect(rtoTarget(st, s)).toBe('rtoRoll');
    expect(rtoTarget(st, { ...s, kid: true })).toBe('rtoKidRoll');
    st.phase = 'fire';
    expect(rtoTarget(st, s)).toBe('rtoIdle');
    expect(rtoTarget(st, { ...s, throttle: 0 })).toBe('rtoBrake');
    expect(rtoTarget(st, { ...s, throttle: 0, braking: true })).toBe('rtoReverse');
    // Reverse thrust is the lever up with the sleeves out: not an "idle" call.
    expect(rtoTarget(st, { ...s, throttle: 0.8, braking: true, reverserPos: 1 })).toBe('rtoStraight');
    expect(rtoTarget(st, { ...s, throttle: 0, braking: true, gsKts: 50 })).toBe('rtoStraight');
    expect(rtoTarget(st, { ...s, throttle: 0, braking: true, canReverse: false })).toBe('rtoStraight');
    expect(rtoTarget(st, { ...s, kid: true })).toBe('rtoKid');
    st.phase = 'stopped';
    expect(rtoTarget(st, s)).toBe(null);
  });

  it('every prompt has words that fit the coach card; each step of the reject shows at once', () => {
    for (const [k, text] of Object.entries(RTO_TEXT)) {
      expect(coachText(k)).toBe(text);
      expect(text.length).toBeLessThanOrEqual(60);
    }
    // On the runway (dsGround), the fire's call replaces the roll's without the 1.5 s hold.
    const c = createCoach();
    const s = { onGround: true, autopilot: false, aglFt: 0, vsiFpm: 0, throttle: 1 };
    stepCoach(c, { ...s, dsGround: 'rtoRoll' }, 0.1);
    for (const k of ['rtoIdle', 'rtoBrake', 'rtoReverse', 'rtoStraight']) {
      stepCoach(c, { ...s, dsGround: k }, 0.01);
      expect(c.prompt).toBe(k);
    }
  });

  it('the reference stop: 2.5 s at the failure speed, then 14 ft/s²', () => {
    const v = 100 * 0.514444;
    expect(rtoRefStopM(100)).toBeCloseTo(v * 2.5 + v * v / (2 * 14 * 0.3048), 6);
  });

  it('grades a quick, straight stop S; slow, long or crooked costs', () => {
    const ref = rtoRefStopM(100);
    const good = gradeRto(fired({ phase: 'stopped', idleS: 0.8, brakeS: 0.9, stopM: ref, leftM: 2000, maxCrossM: 1 }));
    expect(good).toMatchObject({ kind: 'rto', title: 'Rejected takeoff', grade: 'S', score: 100, reason: null });
    expect(good.note).toMatch(/Fire at 100 kt/);
    expect(good.factors.map((f) => f.key)).toEqual(['reaction', 'stop', 'centreline']);
    expect(good.factors[0].value).toBe('0.8 s');
    expect(good.factors[1].value).toBe(`${Math.round(ref * M_TO_FT).toLocaleString('en-US')} ft, ${Math.round(2000 * M_TO_FT).toLocaleString('en-US')} ft of runway left`);
    const slow = gradeRto(fired({ phase: 'stopped', idleS: 3, brakeS: 3, stopM: 1.5 * ref, leftM: 1500, maxCrossM: 1 }));
    expect(slow.score).toBeLessThan(good.score);
    expect(['C', 'D']).toContain(slow.grade);
    const crooked = gradeRto(fired({ phase: 'stopped', idleS: 0.8, stopM: ref, leftM: 2000, maxCrossM: 15 }));
    expect(crooked.score).toBeLessThan(90);
  });

  it('caps an overrun, a run off the side and a takeoff after the fire at D, with the reason', () => {
    for (const [phase, re] of [['overrun', /end of the runway/], ['off', /side of the runway/], ['rotated', /Took off after the fire/]]) {
      const g = gradeRto(fired({ phase, idleS: 0.5, stopM: 100, leftM: 0, maxCrossM: 0 }));
      expect(g.grade).toBe('D');
      expect(g.title).toBe('Rejected takeoff failed');
      expect(g.reason).toMatch(re);
      expect(g.factors[1].value).toBe('did not stop');
    }
    // Never idled at all.
    expect(gradeRto(fired({ phase: 'overrun' })).factors[0]).toMatchObject({ value: 'never', score: 0 });
  });

  it('Kid: the plane closed the thrust and braked, so the reaction is not the player\'s to score', () => {
    const g = gradeRto(fired({ phase: 'stopped', idleS: 0, stopM: rtoRefStopM(100), leftM: 2000, maxCrossM: 1 }), true);
    expect(g.factors[0]).toMatchObject({ value: 'the plane did it', score: 100 });
    expect(g.note).toMatch(/Kid level/);
  });
});
