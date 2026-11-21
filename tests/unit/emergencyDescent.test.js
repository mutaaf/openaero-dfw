import { describe, it, expect } from 'vitest';
import {
  ED_KEY, ED_TEXT, ED_TARGET_KTS, ED_ACS_CAP, ED_LOST_CAP, ED_WARN_CAP, ED_ASSIST_BANK_DEG, ED_FAIL_S, ED_LEVEL_S,
  createEmergencyDescent, descentStep, descentPrompt, descentKidGuide, descentKidIdle, descentWords, gradeEmergencyDescent, levelLeadFt,
} from '../../src/emergencyDescent.js';
import { coachText } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { quietMission } from '../../src/tower.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';

const DT = 0.1;
// A scripted descent from 5,535 ft MSL (the mission's 5,000 ft over Grapevine Lake): `fpm` down, `kts`, `bank`,
// `throttle`, `g`, then a level-off `levelFt` off the target (+ = high), led by `leadFt`. Returns every transition.
function flyDescent(st, { fpm = 1800, kts = () => 100, bank = () => 40, throttle = () => 0, g = () => 1.25, levelFt = 0, leadFt = 200,
  limitKts = 163, warnKts = 48, stalledAt = null, seconds = 400 } = {}) {
  const events = [];
  let alt = 5535, t = 0, vs = 0;
  for (let i = 0; i < 10; i++) { const e = descentStep(st, input(false)); if (e) events.push(e); }
  function input(started) {
    return { dt: DT, started, altFt: alt, vsFpm: vs, iasKts: kts(t), bankDeg: bank(t), loadFactor: g(t),
      throttle: throttle(t), limitKts, flapsOut: false, warnKts, aoaDeg: 4, stalled: stalledAt !== null && t >= stalledAt };
  }
  for (let n = 0; n < seconds / DT && st.phase !== 'complete' && st.phase !== 'failed'; n++) {
    t += DT;
    const above = alt - st.targetFt, prev = alt;
    if (st.phase === 'wait' || above > leadFt + levelFt) alt -= fpm / 60 * DT;
    else alt += (st.targetFt + levelFt - alt) * Math.min(1, DT / 2); // a ~2 s round-out onto the level-off
    vs = (alt - prev) / DT * 60;
    const e = descentStep(st, input(true));
    if (e) events.push(e);
  }
  return { events, t };
}

describe('descentStep (0209): down 3,000 ft, level off, hold it', () => {
  it('waits for the player, descends, levels off within 100 ft, holds 15 s, completes', () => {
    const st = createEmergencyDescent();
    const { events } = flyDescent(st);
    expect(events).toEqual(['descending', 'leveling', 'complete']);
    expect(Math.abs(st.alt0 - 5535)).toBeLessThan(5); // where the player started
    expect(st.targetFt).toBe(2500); // 5,535 - 3,000, to the 100 ft the tape shows
    expect(st.levelS).toBeGreaterThanOrEqual(ED_LEVEL_S);
    expect(st.levelDevFt).toBeLessThan(10);
    expect(st.bankOkS / st.heldS).toBe(1);
    expect(st.inBandS / st.heldS).toBe(1);
  });
  it('the start screen moves nothing: the level-off is set from where the player starts', () => {
    const st = createEmergencyDescent();
    for (let i = 0; i < 20; i++) descentStep(st, { dt: DT, started: false, altFt: 5600 - i * 10, vsFpm: 0, iasKts: 100, bankDeg: 0, loadFactor: 1, throttle: 0.6, limitKts: 163, flapsOut: false, warnKts: 48, aoaDeg: 3, stalled: false });
    expect(st.phase).toBe('wait');
    expect(st.t).toBe(0);
    expect(st.targetFt).toBe(2400); // 5,410 - 3,000
  });
  it('a 500 fpm let-down is not finished in 4 minutes: failed, too slow', () => {
    const st = createEmergencyDescent();
    const { events } = flyDescent(st, { fpm: 500, bank: () => 0, throttle: () => 0.4 });
    expect(events).toEqual(['descending', 'failed']);
    expect(st.why).toBe('time');
    expect(st.t).toBeGreaterThan(ED_FAIL_S);
    const g = gradeEmergencyDescent(st);
    expect(g.grade).toBe('D');
    expect(g.reason).toMatch(/Too slow/);
  });
  it('past VNE for half a second fails at once, with the limit in the words; with the flaps out it names the flaps', () => {
    const st = createEmergencyDescent();
    flyDescent(st, { kts: (t) => 100 + t * 4 });
    expect(st.why).toBe('limit');
    const g = gradeEmergencyDescent(st);
    expect(g.grade).toBe('D');
    expect(g.reason).toMatch(/163 kt, the never-exceed speed/);
    const f = createEmergencyDescent();
    flyDescent(f, { kts: () => 100, limitKts: 85 });
    f.flapsOut = true; // as descentSimStep's flapsOut would set it
    expect(gradeEmergencyDescent(f).reason).toMatch(/flaps' 85 kt/);
  });
  it('still sinking at a let-down\'s rate through the level-off is not a level-off: the hold waits, and it goes through (panel)', () => {
    const st = createEmergencyDescent();
    flyDescent(st, { fpm: 900, leadFt: -1000 });
    expect(st.phase).toBe('failed');
    expect(st.why).toBe('low');
    expect(st.levelS).toBe(0);
  });
  it('a gust through the limit for less than half a second is not a fail', () => {
    const st = createEmergencyDescent();
    flyDescent(st, { kts: (t) => (t > 20 && t < 20.35 ? 170 : 100) });
    expect(st.phase).toBe('complete');
  });
  it('through the level-off by 300 ft, a stall and over 3.8 g each fail', () => {
    const low = createEmergencyDescent();
    flyDescent(low, { leadFt: -400 });
    expect(low.why).toBe('low');
    expect(gradeEmergencyDescent(low).reason).toMatch(/through your level-off/);
    const stall = createEmergencyDescent();
    flyDescent(stall, { stalledAt: 30 });
    expect(stall.why).toBe('stall');
    const pull = createEmergencyDescent();
    flyDescent(pull, { g: (t) => (t > 30 ? 4.2 : 1.2) });
    expect(pull.why).toBe('g');
  });
});

describe('gradeEmergencyDescent (0209): the ACS tolerances', () => {
  it('the standard flown is an A or better', () => {
    const st = createEmergencyDescent();
    flyDescent(st);
    const g = gradeEmergencyDescent(st);
    expect(g.kind).toBe('emergencyDescent');
    expect(['S', 'A']).toContain(g.grade);
    expect(g.reason).toBeNull();
    expect(g.factors.map((f) => f.key)).toEqual(['rate', 'speed', 'bank', 'level']);
  });
  it('a straight dive (wings level) is capped at C and says why', () => {
    const st = createEmergencyDescent();
    flyDescent(st, { bank: () => 0 });
    const g = gradeEmergencyDescent(st);
    expect(g.score).toBeLessThanOrEqual(ED_WARN_CAP);
    expect(g.reason).toMatch(/straight dive: bank 30-45°/);
  });
  it('fast (115 kt, over VA), power left in, a hard pull or a push, or a 150 ft miss: each no better than a B', () => {
    for (const [o, re] of [[{ kts: () => 115 }, /Up to 115 kt: the drill's speed is 105 kt/], [{ throttle: () => 0.5 }, /Power left in/], [{ g: (t) => (t > 30 && t < 34 ? 3.2 : 1.2) }, /Pulled 2\.\d g/],
      [{ g: (t) => (t > 30 && t < 34 ? -0.8 : 1.2) }, /Pushed to -0\.\d g, below zero/], [{ levelFt: 150 }, /150 ft high/], [{ bank: () => 55 }, /outside 30-45°/]]) {
      const st = createEmergencyDescent();
      flyDescent(st, o);
      const g = gradeEmergencyDescent(st);
      expect([String(re), st.phase, st.why]).toEqual([String(re), 'complete', null]);
      expect(g.score).toBeLessThanOrEqual(ED_ACS_CAP);
      expect(g.reason).toMatch(re);
    }
  });
  it('a bump\'s g (0.3 or 2.4 for half a second) is not the pilot\'s: no cap', () => {
    const st = createEmergencyDescent();
    flyDescent(st, { g: (t) => (t > 30 && t < 30.5 ? 0.3 : t > 40 && t < 40.5 ? 2.4 : 1.2) });
    expect(gradeEmergencyDescent(st).reason).toBeNull();
  });
  it('a snatch past +3.8 g for 0.2 s fails: the structural limit is not filtered away', () => {
    const st = createEmergencyDescent();
    flyDescent(st, { g: (t) => (t > 30 && t < 30.2 ? 4.5 : 1.2) });
    expect(st.why).toBe('g');
  });
  it('levelled 600 ft high and held there: failed with that reason, not "too slow"', () => {
    const st = createEmergencyDescent();
    flyDescent(st, { levelFt: 600 });
    expect(st.why).toBe('high');
    expect(gradeEmergencyDescent(st).reason).toMatch(/Levelled off too high: the level-off is 2,500 ft/);
  });
  it('the binding cap\'s reason: a D cap wins over a B one, and a score under the cap drops "No better than"', () => {
    const st = createEmergencyDescent();
    flyDescent(st, { levelFt: -250, throttle: () => 0.5 });
    expect(gradeEmergencyDescent(st).reason).toMatch(/under your level-off/);
  });
  it('a 250 ft miss of the level-off is a D', () => {
    const st = createEmergencyDescent();
    flyDescent(st, { levelFt: -250 });
    const g = gradeEmergencyDescent(st);
    expect(g.score).toBeLessThanOrEqual(ED_LOST_CAP);
    expect(g.reason).toMatch(/2[45]\d ft under/);
  });
  it('Kid\'s card says the plane flew it', () => {
    const st = createEmergencyDescent();
    flyDescent(st);
    expect(gradeEmergencyDescent(st, true).note).toMatch(/flew the descent for you/);
  });
});

describe('the coach and Kid\'s guide (0209)', () => {
  const s = (o = {}) => ({ altFt: 4500, vsFpm: -1800, iasKts: 100, bankDeg: 40, throttle: 0, ...o });
  const at = (phase, o = {}) => ({ ...createEmergencyDescent(), phase, targetFt: 2500, t: 30, iasF: 100, ...o });
  it('calls the smoke first, then idle, the bank, the speed, the level-off and the hold, each in its words', () => {
    descentWords(2500);
    expect(descentPrompt(at('wait'), s(), false)).toBe('edwSmoke');
    expect(coachText('edwSmoke')).toMatch(/Smoke in the cockpit! Emergency descent to 2,500 ft/);
    expect(descentPrompt(at('descending'), s({ throttle: 0.5 }), false)).toBe('edwIdle');
    expect(descentPrompt(at('descending'), s({ bankDeg: 10 }), false)).toBe('edwBank');
    expect(descentPrompt(at('descending'), s({ bankDeg: -60 }), false)).toBe('edwSteep');
    expect(descentPrompt(at('descending', { iasF: 112 }), s(), false)).toBe('edwFast');
    expect(descentPrompt(at('descending', { iasF: 85 }), s(), false)).toBe('edwNoseDown');
    expect(descentPrompt(at('descending'), s(), false)).toBe('edwHold');
    expect(descentPrompt(at('descending', { gF: 2.4 }), s(), false)).toBe('edwPull');
    expect(descentPrompt(at('descending'), s({ altFt: 2750 }), false)).toBe('edwLevelOff'); // 1,800 fpm: a 180 ft lead + 100
    expect(coachText('edwLevelOff')).toMatch(/Level off at 2,500 ft/);
    expect(descentPrompt(at('leveling'), s({ altFt: 2420 }), false)).toBe('edwLow');
    expect(descentPrompt(at('leveling'), s({ altFt: 2560, vsFpm: -1000 }), false)).toBe('edwLevelOff'); // still diving: not "a little high"
    expect(descentPrompt(at('leveling'), s({ altFt: 2560, vsFpm: 0 }), false)).toBe('edwHigh');
    expect(coachText('edwHold')).toMatch(/95-105 kt, down to 2,500 ft/);
    expect(descentPrompt(at('leveling'), s({ altFt: 2510, vsFpm: 0 }), false)).toBe('edwLevel');
    expect(descentPrompt(at('complete'), s(), false)).toBeNull();
    for (const k of Object.keys(ED_TEXT)) expect(coachText(k)).toBeTruthy();
  });
  it('Kid hears the plane fly it', () => {
    expect(descentPrompt(at('wait'), s(), true)).toBe('edwKidIn');
    expect(descentPrompt(at('descending'), s(), true)).toBe('edwKid');
    expect(descentPrompt(at('leveling'), s(), true)).toBe('edwKidLevel');
  });
  it('the lead is ~10% of the vertical speed, at least 100 ft', () => {
    expect(levelLeadFt(-2000)).toBe(200);
    expect(levelLeadFt(-500)).toBe(100);
  });
  it('Kid\'s guide banks right and walks the path down for the speed; wings level and the path onto the level-off from the lead; idle until then', () => {
    const st = at('descending', { t: 10 }), out = { guideBankDeg: 0, guideGammaDeg: 0 };
    descentKidGuide(st, { ...s(), dt: 0.1, iasKts: 90 }, out);
    expect(out.guideBankDeg).toBe(40);
    expect(out.guideGammaDeg).toBeLessThan(0); // slow: nose down
    expect(descentKidIdle(st, 4500, -1800)).toBe(true);
    descentKidGuide(st, { ...s({ altFt: 2600 }), dt: 0.1 }, out);
    expect(out.guideBankDeg).toBe(0);
    expect(out.guideGammaDeg).toBeLessThan(0);
    expect(descentKidIdle(st, 2600, -1800)).toBe(false);
    expect(ED_ASSIST_BANK_DEG * 0.85).toBeCloseTo(40, 0); // full stick on Kid/Learner is inside S4's 30-45°
  });
});

describe('the mission (0209)', () => {
  const m = missionByKey(ED_KEY);
  it('is a Cessna drill at 5,000 ft AGL and 100 KIAS, in the drills group, not the first flight\'s', () => {
    expect(m.key).toBe(ED_KEY);
    expect(m).toMatchObject({ kind: 'drill', aircraft: 'c172', aglFt: 5000, kias: 100, emergencyDescent: true });
    expect(MISSIONS.filter((x) => x.emergencyDescent)).toHaveLength(1);
    const groups = groupMissions(MISSIONS);
    expect(groups.find((g) => g.id === 'drills').missions.map((x) => x.key)).toContain(ED_KEY);
    expect(groups.find((g) => g.id === 'recommended')?.missions.map((x) => x.key) ?? []).not.toContain(ED_KEY);
    expect(m.blurb).toMatch(/30-45°/);
    expect(ED_TARGET_KTS).toBeLessThan(AIRCRAFT_DATABASE.c172.vneKts);
  });
  it('deep links as ?mission=c172_emergency_descent; the tower stays quiet in it', () => {
    expect(missionFromLink(`?mission=${ED_KEY}`)).toBe(ED_KEY);
    expect(quietMission(m)).toBe(true);
  });
});
