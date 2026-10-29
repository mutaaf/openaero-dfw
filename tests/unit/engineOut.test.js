import { describe, it, expect } from 'vitest';
import {
  EO_TEXT, EO_REACT_S, EO_INDUCED, EO_BANK_DEG, turnbackHeightFt, distPastRunwayM, createEngineOut, stepEngineOut,
  engineOutTarget, engineOutResult, kidGuide, turnbackBankDeg,
} from '../../src/engineOut.js';
import { DS_GLIDE_KTS } from '../../src/deadStick.js';
import { gradeLanding } from '../../src/landing.js';
import { coachTarget, coachText } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { runwayEnd } from '../../src/airports.js';
import { M_TO_FT } from '../../src/constants.js';

const E16 = runwayEnd('KADS', '16');
const E34 = runwayEnd('KADS', '34');
const D16 = { x: Math.sin(E16.hdgT * Math.PI / 180), z: -Math.cos(E16.hdgT * Math.PI / 180) };
// A point `pastM` past 16's far end (34's threshold) on the extended centreline.
const past = (pastM) => ({ x: E34.thrX + D16.x * pastM, z: E34.thrZ + D16.z * pastM });
const V = 35; // ~68 KTAS, m/s
const calm = { ratio: 9, tasMps: V, glideTasMps: V, bankDeg: 45 };

describe('engine failure after takeoff missions (ticket 0104)', () => {
  it('two Cessna takeoffs from all of Addison 16, flaps up, the engine quitting at 300 and 700 ft, in the Addison group', () => {
    for (const [key, ft] of [['efato_kads_16_300', 300], ['efato_kads_16_700', 700]]) {
      expect(missionByKey(key)).toMatchObject({ key, kind: 'takeoff', airport: 'KADS', rwy: '16', aircraft: 'c172', flaps: 0, fullLength: true, engineOutFt: ft });
      expect(groupMissions(MISSIONS).find((g) => g.id === 'KADS').missions.map((m) => m.key)).toContain(key);
      expect(missionFromLink(`?mission=${key}`)).toBe(key);
    }
    // The blurbs state the lesson.
    expect(missionByKey('efato_kads_16_300').blurb).toMatch(/land ahead/);
    expect(missionByKey('efato_kads_16_700').blurb).toMatch(/turn back/);
    expect(missionFromLink('?airport=KADS')).toBe('kads_16_final'); // "fly from Addison" is not a drill
  });

  it('every prompt has words, short enough for the coach card', () => {
    for (const [k, text] of Object.entries(EO_TEXT)) {
      expect(coachText(k)).toBe(text);
      expect(text.length).toBeLessThanOrEqual(60);
    }
  });
});

describe('turnbackHeightFt (ticket 0104)', () => {
  // Over the far threshold (no glide back): the reaction second, the turn (180° plus twice the
  // cut back from two turn radii beside: 2 x 90° here) at 1 + k(n² - 1) times the glide's sink,
  // and the glide in from beside the runway.
  it('over the runway\'s end, calm, 45°: the reaction, a 360° turn at 1 + k sink, two turn radii back', () => {
    const sink = V / 9, twoR = 2 * V * V / 9.81;
    const turnS = 2 * Math.PI * V / 9.81;
    const want = (sink * EO_REACT_S + sink * (1 + EO_INDUCED) * turnS + twoR / 9) * M_TO_FT;
    expect(turnbackHeightFt({ ...calm, distBackM: 0 })).toBeCloseTo(want, 6);
  });

  it('far out the turn tends to 180° and each metre further needs 1/9 m more: 1 NM out is ~2,000 ft', () => {
    const a = turnbackHeightFt({ ...calm, distBackM: 3000 }), b = turnbackHeightFt({ ...calm, distBackM: 3900 });
    expect((b - a) / (900 * M_TO_FT)).toBeCloseTo(1 / 9, 2);
    const nm = turnbackHeightFt({ ...calm, distBackM: 1852 });
    expect(nm).toBeGreaterThan(1852 * M_TO_FT / 9);
    expect(nm).toBeLessThan(1852 * M_TO_FT / 9 + 300);
  });

  it('a headwind on the takeoff (tailwind on the way back) lowers it; a tailwind raises it', () => {
    const still = turnbackHeightFt({ ...calm, distBackM: 1000 });
    const head = turnbackHeightFt({ ...calm, distBackM: 1000, headwindMps: 5 });
    const tail = turnbackHeightFt({ ...calm, distBackM: 1000, headwindMps: -5 });
    expect(head).toBeLessThan(still - 50);
    expect(tail).toBeGreaterThan(still + 50);
  });

  it('a better glide lowers it, a shallower bank (Kid\'s 30°) raises it, and the climb\'s spare speed is (v² - vg²)/2g of height', () => {
    const base = turnbackHeightFt({ ...calm, distBackM: 1000 });
    expect(turnbackHeightFt({ ...calm, distBackM: 1000, ratio: 7 })).toBeGreaterThan(base);
    expect(turnbackHeightFt({ ...calm, distBackM: 1000, bankDeg: 30 })).toBeGreaterThan(base);
    const fast = turnbackHeightFt({ ...calm, distBackM: 1000, tasMps: 40 });
    expect(base - fast).toBeCloseTo((40 * 40 - V * V) / (2 * 9.81) * M_TO_FT, 6);
    expect(EO_BANK_DEG).toBe(45);
  });

  it('distPastRunwayM is 0 over the runway and grows past 16\'s far end', () => {
    expect(distPastRunwayM(E16.thrX, E16.thrZ)).toBe(0);
    const p = past(800);
    expect(distPastRunwayM(p.x, p.z)).toBeCloseTo(800, 6);
  });
});

// One step's input, the sim's numbers as engineOut.js's input() builds them.
const step = (over) => ({ t: 0, aglFt: 0, ...past(0), trackDeg: E16.hdgT, iasKts: 74, tasKts: 76, aoaDeg: 5, stallAoaDeg: 14.1, flaps: 0, headwindKts: 0, bankMaxDeg: 45, kid: false, onGround: false, ...over });

describe('the engine failure and the coach (ticket 0104)', () => {
  const m300 = missionByKey('efato_kads_16_300');

  it('climbs coached, quits at its height, and says land ahead when the turn back cannot make it', () => {
    const st = createEngineOut(m300);
    expect(engineOutTarget(st, step({ onGround: true }))).toBe(null);
    expect(stepEngineOut(st, step({ aglFt: 200 }))).toBe(false);
    expect(engineOutTarget(st, step({ aglFt: 200 }))).toBe('eoClimb');
    expect(stepEngineOut(st, step({ t: 10, aglFt: 300 }))).toBe(true);
    expect(st.failed).toBe(true);
    expect(st.turnbackFt).toBeGreaterThan(300);
    expect(st.canTurn).toBe(false);
    expect(engineOutTarget(st, step({ t: 12, aglFt: 290 }))).toBe('eoFail');
    expect(coachText('eoFail')).toBe(`Engine failure! Nose down, ${DS_GLIDE_KTS} knots, land ahead`);
    expect(engineOutTarget(st, step({ t: 16, aglFt: 260, iasKts: 68 }))).toBe('eoAhead');
    expect(engineOutTarget(st, step({ t: 16, aglFt: 260, iasKts: 58 }))).toBe('eoSlow');
    // Turning back anyway: too low; once round, line up.
    stepEngineOut(st, step({ t: 17, aglFt: 250, trackDeg: E16.hdgT - 40 }));
    expect(engineOutTarget(st, step({ t: 17, aglFt: 250, trackDeg: E16.hdgT - 40, iasKts: 68 }))).toBe('eoTooLow');
    expect(engineOutTarget(st, step({ t: 25, aglFt: 120, trackDeg: E34.hdgT, iasKts: 68 }))).toBe('eoLineUp');
    // Below the flare height the landing coach has it; through coach.js the drill's words win above it.
    expect(engineOutTarget(st, step({ t: 30, aglFt: 40, iasKts: 68 }))).toBe(null);
    expect(coachTarget({ aglFt: 260, onGround: false, ds: 'eoAhead' })).toBe('eoAhead');
  });

  it('high and close enough: "you can turn back" from the failure, then keep turning', () => {
    const st = createEngineOut({ engineOutFt: 700 });
    stepEngineOut(st, step({ t: 0, aglFt: 700, ...past(1000) }));
    expect(st.canTurn).toBe(true);
    expect(engineOutTarget(st, step({ t: 1, aglFt: 700, ...past(1000) }))).toBe('eoFailTurn');
    expect(engineOutTarget(st, step({ t: 6, aglFt: 660, ...past(1100), trackDeg: E16.hdgT - 90, iasKts: 68 }))).toBe('eoTurning');
    // Not turned and gone on too far: no longer.
    const late = createEngineOut({ engineOutFt: 700 });
    stepEngineOut(late, step({ t: 0, aglFt: 700, ...past(1000) }));
    expect(engineOutTarget(late, step({ t: 30, aglFt: 400, ...past(2000), iasKts: 68 }))).toBe('eoAhead');
  });

  it('Kid: its own words, and the guide glides ahead wings level', () => {
    const st = createEngineOut(m300);
    stepEngineOut(st, step({ aglFt: 300, kid: true }));
    expect(engineOutTarget(st, step({ t: 1, aglFt: 300, kid: true }))).toBe('eoKidFail');
    expect(engineOutTarget(st, step({ t: 9, aglFt: 200, kid: true }))).toBe('eoKid');
    const out = kidGuide({ iasKts: DS_GLIDE_KTS }, {});
    expect(out.guideBankDeg).toBe(0);
    expect(out.guideGammaDeg).toBeCloseTo(-Math.atan(1 / 9) * 180 / Math.PI, 6);
  });

  it('records the turn: where it started, the height it cost, and a stall in it (not in the flare)', () => {
    const st = createEngineOut(m300);
    stepEngineOut(st, step({ t: 0, aglFt: 300 }));
    stepEngineOut(st, step({ t: 2, aglFt: 290, trackDeg: E16.hdgT - 35 }));
    stepEngineOut(st, step({ t: 5, aglFt: 240, trackDeg: E16.hdgT - 90, aoaDeg: 15 }));
    stepEngineOut(st, step({ t: 9, aglFt: 150, trackDeg: E34.hdgT + 10 }));
    stepEngineOut(st, step({ t: 15, aglFt: 60, trackDeg: E34.hdgT }));
    expect(st).toMatchObject({ turned: true, turnFromFt: 290, back: true, costFt: 140, stalled: true });
    const flare = createEngineOut(m300);
    stepEngineOut(flare, step({ t: 0, aglFt: 300 }));
    stepEngineOut(flare, step({ t: 30, aglFt: 5, aoaDeg: 16 }));
    expect(flare.stalled).toBe(false);
  });

  it('the turn-back steering turns left from behind the runway, toward 34\'s centreline', () => {
    const p = past(1000);
    expect(turnbackBankDeg(p.x, p.z, E16.hdgT)).toBe(-45);
    expect(Math.abs(turnbackBankDeg(p.x, p.z, E34.hdgT))).toBeLessThan(5);
  });
});

describe('engineOutResult (ticket 0104)', () => {
  const soft = (pastThresholdM, crossM = 0) => gradeLanding({
    vsFpm: -100, crossM, pastThresholdM, runwayLengthM: E16.lengthM - E16.displacedM, runwayWidthM: E16.widthM,
    pitchDeg: 5, bankDeg: 0, iasKts: 60, vrefKts: 62,
  });
  const failed = (over) => ({ ...createEngineOut({ engineOutFt: 300 }), failed: true, turnbackFt: 420, ...over });

  it('landed ahead in a field, gently: survives, a B at best, the right call', () => {
    const pos = past(400);
    const r = engineOutResult(soft(2300), failed(), E16, { ...pos, y: 0 });
    expect(r.title).toBe('Engine failure after takeoff');
    expect(r.factors[0]).toMatchObject({ key: 'decision', value: 'landed ahead', score: 100 });
    expect(r.factors[1].value).toMatch(/^missed by/);
    expect(r.grade).toBe('B');
    expect(r.note).toBe('Landed ahead in a field: the right call this low');
    expect(r.reason).toBe(null);
  });

  it('turned back below the height it needed: a D at best, with the cost of the turn, even if it reached the runway', () => {
    const st = failed({ turned: true, turnFromFt: 290, startFt: 290, costFt: 160 });
    const r = engineOutResult(soft(300), st, E34, { x: E34.thrX + Math.sin(E34.hdgT * Math.PI / 180) * 300, y: 0, z: E34.thrZ - Math.cos(E34.hdgT * Math.PI / 180) * 300 });
    expect(r.madeRunway).toBe(true);
    expect(r.grade).toBe('D');
    expect(r.reason).toBe('Turned back from 290 ft, below the 420 ft it needs: land ahead. The turn cost you 160 ft.');
  });

  it('turned back from high enough and made it: full marks possible', () => {
    const st = failed({ turnbackFt: 650, turned: true, turnFromFt: 700, startFt: 700, costFt: 130 });
    const r = engineOutResult(soft(300), st, E34, { x: E34.thrX + Math.sin(E34.hdgT * Math.PI / 180) * 300, y: 0, z: E34.thrZ - Math.cos(E34.hdgT * Math.PI / 180) * 300 });
    expect(['S', 'A']).toContain(r.grade);
    expect(r.note).toBe('Turned back and made the runway');
  });

  it('a crash stays a crash; stalled in the turn says what the turn cost', () => {
    const crash = { ...soft(300), grade: 'CRASH', score: 0, reason: 'Hard landing: the gear would not survive that.' };
    const st = failed({ turned: true, turnFromFt: 290, startFt: 290, costFt: 250, stalled: true });
    const r = engineOutResult(crash, st, E34, { ...past(-100), y: 0 });
    expect(r.grade).toBe('CRASH');
    expect(r.reason).toBe('Stalled in the turn back. The turn cost you 250 ft.');
  });
});
