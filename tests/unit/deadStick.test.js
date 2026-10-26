import { describe, it, expect } from 'vitest';
import {
  DEADSTICK_KEY, DS_GLIDE_KTS, DS_GLIDE_RATIO, DS_TEXT, DS_FAIL_S, DS_GLIDE_GAMMA_DEG, createDeadStick,
  deadStickTarget, deadStickPrompt, fieldGeometry, landingEnd, missM, deadStickResult, kidGlideGammaDeg, debugFinal,
} from '../../src/deadStick.js';
import { gradeLanding } from '../../src/landing.js';
import { createCoach, stepCoach, coachTarget, coachText } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { runwayEnd, approachGeometry } from '../../src/airports.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { assistConfig, createAssistState, shapeControls, assistBestKey } from '../../src/assists.js';
import { M_TO_FT } from '../../src/constants.js';

const E16 = runwayEnd('KADS', '16');
const E34 = runwayEnd('KADS', '34');
const NM = 1852;
// A point `beforeM` before the 16 threshold on its approach side and `rightM` right of it.
const at16 = (beforeM, rightM = 0) => {
  const r = E16.hdgT * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r);
  return { x: E16.thrX - dx * beforeM - dz * rightM, z: E16.thrZ - dz * beforeM + dx * rightM };
};
const input = (over) => ({ t: 30, iasKts: 68, aglFt: 2500, ...at16(-400, -3704), trackDeg: 340, ...over });

describe('dead-stick mission (ticket 0036)', () => {
  const m = missionByKey(DEADSTICK_KEY);

  it('is the Cessna, 3,500 ft up, engine out, on a left downwind for 16 abeam the runway\'s middle 2 NM east', () => {
    expect(m.key).toBe('deadstick_kads_16');
    expect(m).toMatchObject({ kind: 'drill', airport: 'KADS', rwy: '16', aircraft: 'c172', aglFt: 3500, hdg: 340, deadStick: true });
    const g = approachGeometry(E16, { x: m.pos[0], y: 0, z: m.pos[1] });
    expect(Math.abs(g.crossM + 2 * NM)).toBeLessThan(5); // left of the landing direction: east of the runway
    expect(Math.abs(-g.distM - (E16.lengthM / 2 - E16.displacedM))).toBeLessThan(5); // abeam the middle
  });

  it('is in the Addison group of the picker and deep-links', () => {
    const ads = groupMissions(MISSIONS).find((g) => g.id === 'KADS');
    expect(ads.missions.map((x) => x.key)).toContain(DEADSTICK_KEY);
    expect(missionFromLink(`?mission=${DEADSTICK_KEY}`)).toBe(DEADSTICK_KEY);
    expect(missionFromLink('?airport=KADS')).toBe('kads_16_final'); // "fly from Addison" is still the final
  });

  it('best glide is the POH\'s 68 KIAS, the ratio its 9:1', () => {
    expect(AIRCRAFT_DATABASE.c172.vGlideKts).toBe(68);
    expect(DS_GLIDE_KTS).toBe(68);
    expect(DS_GLIDE_RATIO).toBe(9);
  });

  it('keeps its personal bests per assist level (invariant 6)', () => {
    expect(assistBestKey(DEADSTICK_KEY, 'pilot')).toBe(DEADSTICK_KEY);
    expect(assistBestKey(DEADSTICK_KEY, 'kid')).toBe(`${DEADSTICK_KEY}@kid`);
  });
});

describe('dead-stick coach (deadStick.js deadStickTarget)', () => {
  it('says engine failure first, whatever else is going on', () => {
    expect(deadStickTarget(input({ t: 0, iasKts: 85 }))).toBe('dsFail');
    expect(deadStickTarget(input({ t: DS_FAIL_S - 0.1, iasKts: 50 }))).toBe('dsFail');
    expect(DS_TEXT.dsFail).toBe('Engine failure! Pitch for 68 knots');
  });

  it('speed before position: slow, then fast, then the field', () => {
    expect(deadStickTarget(input({ iasKts: 58 }))).toBe('dsSlow');
    expect(deadStickTarget(input({ iasKts: 82 }))).toBe('dsFast');
    expect(deadStickTarget(input({}))).toBe('dsLeft');
  });

  it('the field off the left or right wing, from the ground track', () => {
    expect(deadStickTarget(input({ trackDeg: 340 }))).toBe('dsLeft');
    expect(deadStickTarget(input({ trackDeg: 160 }))).toBe('dsRight');
    expect(fieldGeometry(at16(-400, -3704).x, at16(-400, -3704).z, 340).relDeg).toBeLessThan(-45);
  });

  it('low: no height left to glide straight to the nearer threshold', () => {
    const p = at16(2 * NM, -2 * NM);
    const distFt = fieldGeometry(p.x, p.z, 250).distFt;
    expect(deadStickTarget(input({ ...p, trackDeg: 250, aglFt: distFt / DS_GLIDE_RATIO - 50 }))).toBe('dsLow');
    expect(deadStickTarget(input({ ...p, trackDeg: 250, aglFt: distFt / DS_GLIDE_RATIO + 300 }))).not.toBe('dsLow');
  });

  it('high on base near the field, high on final; on final at a good height: final', () => {
    const base = at16(0.6 * NM, -0.8 * NM);
    expect(deadStickTarget(input({ ...base, trackDeg: 250, aglFt: 2500 }))).toBe('dsHigh');
    expect(deadStickTarget(input({ ...base, trackDeg: 250, aglFt: 1200 }))).toBe('dsLeft');
    const final = at16(NM);
    expect(fieldGeometry(final.x, final.z, 160).lined.id).toBe('KADS_16');
    expect(deadStickTarget(input({ ...final, trackDeg: 160, aglFt: NM * M_TO_FT / 9 + 350 }))).toBe('dsHigh');
    expect(deadStickTarget(input({ ...final, trackDeg: 160, aglFt: NM * M_TO_FT / 9 + 100 }))).toBe('dsFinal');
  });

  it('is quiet below the flare height: the landing coach flares it', () => {
    const final = at16(50);
    expect(deadStickTarget(input({ ...final, trackDeg: 160, aglFt: 40 }))).toBeNull();
  });

  it('a synthetic glide fires speed low, speed high, then high on base, in that order (through coach.js)', () => {
    const c = createCoach();
    const base = at16(0.6 * NM, -0.8 * NM);
    const frames = [
      [input({ t: 1, iasKts: 85 }), 3], // the failure
      [input({ iasKts: 58 }), 3], // too slow
      [input({ iasKts: 82 }), 3], // too fast
      [input({ ...base, trackDeg: 250, aglFt: 2500 }), 3], // high on base
    ];
    const seen = [];
    const s = { aglFt: 2500, vsiFpm: -700, papiWhite: null, throttle: 0, onGround: false, autopilot: false, kid: false, ds: null };
    for (const [f, secs] of frames) {
      for (let t = 0; t < secs; t += 0.1) {
        s.ds = deadStickTarget(f);
        stepCoach(c, s, 0.1);
        if (c.prompt !== seen[seen.length - 1]) seen.push(c.prompt);
      }
    }
    expect(seen).toEqual(['dsFail', 'dsSlow', 'dsFast', 'dsHigh']);
    expect(coachText('dsSlow')).toBeUndefined(); // the words are deadStick.js's
    expect(DS_TEXT.dsSlow).toMatch(/68 knots/);
    for (const t of Object.values(DS_TEXT)) expect(t.length).toBeLessThanOrEqual(48); // fits a phone
  });

  it('coach.js: the dead-stick prompt wins over the final\'s, and the flare is still the coach\'s', () => {
    expect(coachTarget({ aglFt: 900, vsiFpm: -700, papiWhite: 4, throttle: 0, onGround: false, ds: 'dsHigh' })).toBe('dsHigh');
    expect(coachTarget({ aglFt: 30, vsiFpm: -500, papiWhite: 2, throttle: 0, onGround: false, ds: null })).toBe('flare');
  });

  it('deadStickPrompt reads the sim (ground track from the velocity) and allocates nothing', () => {
    const st = createDeadStick(100);
    const p = at16(-400, -3704);
    const sim = { simTime: 130, iasKts: 68, aglFt: 2500, pos: { x: p.x, z: p.z }, vel: { x: -10, z: -30 } }; // NNW
    expect(deadStickPrompt(st, sim)).toBe('dsLeft');
    sim.simTime = 101;
    expect(deadStickPrompt(st, sim)).toBe('dsFail');
  });
});

describe('dead-stick touchdown (deadStick.js)', () => {
  const landing = (over) => gradeLanding({
    vsFpm: -150, crossM: 0, pastThresholdM: 250, runwayLengthM: E16.lengthM - E16.displacedM, runwayWidthM: E16.widthM,
    pitchDeg: 4, bankDeg: 0, iasKts: 60, vrefKts: 62, gearLocked: true, ...over,
  });

  it('grades on the Addison end nearer the heading', () => {
    expect(landingEnd(158).id).toBe('KADS_16');
    expect(landingEnd(345).id).toBe('KADS_34');
    expect(landingEnd(250).id).toBe('KADS_16');
  });

  it('miss distance: 0 anywhere on the pavement (the displaced threshold too), the gap to it off it', () => {
    expect(missM(E16, { ...at16(-300), y: 0 })).toBe(0);
    expect(missM(E16, { ...at16(E16.displacedM - 5), y: 0 })).toBe(0); // short of the threshold, on the pavement
    expect(missM(E16, { ...at16(E16.displacedM + 300), y: 0 })).toBeCloseTo(300, 0);
    expect(missM(E16, { ...at16(-300, 100), y: 0 })).toBeCloseTo(100 - E16.widthM / 2, 0);
    expect(missM(E34, { ...at16(-300), y: 0 })).toBe(0);
  });

  it('made the runway: 30% of the grade, and the card says so', () => {
    const r = deadStickResult(landing(), 0);
    expect(r.title).toBe('Dead-stick landing');
    expect(r.madeRunway).toBe(true);
    expect(r.factors[0]).toMatchObject({ label: 'Made the runway', value: 'yes', score: 100 });
    expect(r.note).toMatch(/Made the runway/);
    expect(r.score).toBe(Math.round(landing().score * 0.7 + 30));
    expect(['S', 'A']).toContain(r.grade);
  });

  it('on the displaced threshold\'s pavement counts as made: gradeLanding\'s "short" D is lifted', () => {
    const l = landing({ pastThresholdM: -50 });
    expect(l.grade).toBe('D');
    const r = deadStickResult(l, 0);
    expect(r.grade).not.toBe('D');
    expect(r.reason).toBeNull();
  });

  it('missed: a D at best, and the card says by how much', () => {
    const r = deadStickResult(landing({ pastThresholdM: -400 }), 400 - E16.displacedM);
    expect(r.grade).toBe('D');
    expect(r.score).toBeLessThanOrEqual(54);
    expect(r.madeRunway).toBe(false);
    expect(r.missFt).toBe(Math.round((400 - E16.displacedM) * M_TO_FT));
    expect(r.reason).toMatch(/^Missed the runway by [\d,]+ ft/);
    expect(r.factors[0].value).toMatch(/^missed by [\d,]+ ft$/);
    // A perfect touchdown in the field is still a D.
    expect(deadStickResult(landing(), 1000).grade).toBe('D');
  });

  it('a crash stays a crash', () => {
    const r = deadStickResult(landing({ vsFpm: -900 }), 2000);
    expect(r.grade).toBe('CRASH');
    expect(r.score).toBe(0);
    expect(r.factors[0].value).toMatch(/missed by/);
  });
});

describe('Kid with no engine (deadStick.js kidGlideGammaDeg, assists.js noFloor)', () => {
  it('the guide flies the 9:1 glide at 68 kt, steeper when slow, shallower when fast', () => {
    expect(DS_GLIDE_GAMMA_DEG).toBeCloseTo(-6.34, 2);
    expect(kidGlideGammaDeg(68)).toBeCloseTo(DS_GLIDE_GAMMA_DEG, 6);
    expect(kidGlideGammaDeg(60)).toBeLessThan(DS_GLIDE_GAMMA_DEG);
    expect(kidGlideGammaDeg(76)).toBeGreaterThan(DS_GLIDE_GAMMA_DEG);
    expect(kidGlideGammaDeg(20)).toBe(-12);
    expect(kidGlideGammaDeg(120)).toBe(-2);
  });

  it('noFloor lets Kid\'s held pitch follow the glide below 500 ft', () => {
    const cfg = assistConfig('kid');
    const s = { pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg: -2, bankRightDeg: 0, pitchRateUp: 0, rollRateRight: 0, aoaDeg: 4,
      betaDeg: 0, stallAoaDeg: 14, tailstrikeDeg: 13, onGround: false, wheelHeightM: 100, airspeedMps: 35, guideBankDeg: 0, guideGammaDeg: -6.3 };
    const floored = createAssistState(), free = createAssistState();
    floored.pitchHoldDeg = free.pitchHoldDeg = 0;
    shapeControls(cfg, floored, s, 0.1, {});
    shapeControls(cfg, free, { ...s, noFloor: true }, 0.1, {});
    expect(floored.pitchHoldDeg).toBeCloseTo(0, 6); // the -4° floor + 4° α
    expect(free.pitchHoldDeg).toBeLessThan(0); // easing down toward the glide (-6.3° + 4° α)
  });
});

describe('debugFinal (?debug, e2e)', () => {
  it('puts the airplane on 16\'s extended centreline, wings level at 68 kt on the glide', () => {
    const v3 = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); return this; } });
    const sim = { pos: v3(), vel: v3(), angVel: v3(), quat: { set(x, y, z, w) { Object.assign(this, { x, y, z, w }); } }, flapsIndex: 2 };
    debugFinal(sim, 1, 700, { heightAt: () => 10 });
    const g = approachGeometry(E16, sim.pos);
    expect(g.distM).toBeCloseTo(NM, 0);
    expect(g.crossM).toBeCloseTo(0, 3);
    expect((sim.pos.y - 10) * M_TO_FT).toBeCloseTo(700, 3);
    expect(Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z) / 0.514444).toBeCloseTo(68, 3);
    expect(Math.atan2(sim.vel.x, -sim.vel.z) * 180 / Math.PI).toBeCloseTo(E16.hdgT, 3);
    expect(sim.flapsIndex).toBe(0);
    expect(Math.hypot(sim.quat.x, sim.quat.y, sim.quat.z, sim.quat.w)).toBeCloseTo(1, 9);
  });
});
