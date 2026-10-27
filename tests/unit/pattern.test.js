import { describe, it, expect } from 'vitest';
import { runwayEnd, AIM_POINT_M } from '../../src/airports.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { COACH_MIN_HOLD_S, coachText, coachTarget } from '../../src/coach.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import {
  PATTERN_KEY, PT_TPA_FT, PT_DOWNWIND_NM, PT_DESCENT_DEG, PT_COACH_HOLD_S, PT_TEXT,
  patternLeg, patternTarget, patternPrompt, createPattern, kidGuide,
} from '../../src/pattern.js';

const E16 = runwayEnd('KADS', '16');
const E34 = runwayEnd('KADS', '34');
const C = PT_DOWNWIND_NM * 1852;
// A point `along` m past an end's threshold (its landing direction) and `right` m right of its
// centreline, in sim metres.
function at(end, along, right) {
  const r = end.hdgT * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r);
  return { x: end.thrX + dx * along - dz * right, z: end.thrZ + dz * along + dx * right };
}
const leg = (end, along, right, trackDeg, aglFt = PT_TPA_FT, traffic) =>
  ({ ...patternLeg(end, { ...at(end, along, right), trackDeg: (trackDeg + 360) % 360, aglFt }, traffic) });

describe('the traffic pattern mission (ticket 0048)', () => {
  it('is in the catalogue under Addison, flown in the Cessna, with a blurb', () => {
    const m = missionByKey(PATTERN_KEY);
    expect(m.key).toBe(PATTERN_KEY);
    expect(m).toMatchObject({ kind: 'drill', airport: 'KADS', rwy: '16', aircraft: 'c172', aglFt: PT_TPA_FT, hdg: 340, pattern: true });
    expect(m.blurb.length).toBeGreaterThan(20);
    const kads = groupMissions(MISSIONS).find((g) => g.id === 'KADS');
    expect(kads.missions.map((x) => x.key)).toContain(PATTERN_KEY);
  });

  it('spawns on a left downwind for 16: 0.75 NM east of the centreline, 0.5 NM before abeam the threshold, heading the reciprocal', () => {
    const m = missionByKey(PATTERN_KEY);
    const g = patternLeg(E16, { x: m.pos[0], z: m.pos[1], trackDeg: m.hdg, aglFt: m.aglFt });
    expect(g.leg).toBe('downwind');
    expect(g.turn).toBeNull();
    expect(g.abeam).toBe(false);
    expect(g.along / 1852).toBeCloseTo(0.5, 2);
    expect(g.cross / 1852).toBeCloseTo(-PT_DOWNWIND_NM, 2); // left of 16's landing direction: east
    expect(m.pos[0]).toBeGreaterThan(E16.thrX); // east
    expect(g.targetAglFt).toBe(PT_TPA_FT);
    expect(g.targetHdgT).toBe(340);
  });
});

describe('patternLeg: downwind, base, final around Addison (either end, either traffic)', () => {
  for (const end of [E16, E34]) {
    const h = end.hdgT;
    it(`${end.ident}, left traffic: the legs, their headings and 1,000 ft on the downwind`, () => {
      // Downwind: runway heading + 180, on the left of the landing direction.
      const dw = leg(end, 800, -C, h + 180);
      expect(dw).toMatchObject({ leg: 'downwind', turn: null, abeam: false, targetHdgT: (h + 180) % 360, targetAglFt: PT_TPA_FT });
      // Past abeam the threshold, not yet 45°: descending, no turn yet.
      const ab = leg(end, -400, -C, h + 180, 900);
      expect(ab).toMatchObject({ leg: 'downwind', abeam: true, turn: null });
      expect(ab.targetAglFt).toBeLessThan(PT_TPA_FT);
      // At 45° behind the wing: turn base, toward the runway heading + 90 (a left turn from the downwind).
      const tb = leg(end, -C - 10, -C, h + 180, 700);
      expect(tb).toMatchObject({ leg: 'downwind', turn: 'base', targetHdgT: (h + 90) % 360 });
      // Base: heading runway + 90; final turn when one 20° turn's radius from the centreline.
      const b = leg(end, -C, -800, h + 90, 600);
      expect(b).toMatchObject({ leg: 'base', turn: null, targetHdgT: (h + 90) % 360 });
      const tf = leg(end, -C, -150, h + 90, 500);
      expect(tf).toMatchObject({ leg: 'base', turn: 'final', targetHdgT: h });
      // Final: lined up before the threshold.
      const f = leg(end, -900, 10, h, 300);
      expect(f).toMatchObject({ leg: 'final', turn: null, targetHdgT: h });
      expect(f.targetAglFt).toBeGreaterThan(200);
      expect(f.targetAglFt).toBeLessThan(320);
      // Rolling out of the turn to final (30° to go): still turning final.
      expect(leg(end, -900, -60, h + 30, 300)).toMatchObject({ leg: 'final', turn: 'final' });
      // Upwind past the far end, high enough: turn crosswind (left: runway − 90), then downwind.
      expect(leg(end, end.lengthM, 0, h, 800)).toMatchObject({ leg: 'upwind', turn: 'crosswind', targetHdgT: (h + 270) % 360 });
      // ...within 300 ft of pattern altitude (AC 90-66C): not at 450 ft after a go-around.
      expect(leg(end, end.lengthM, 0, h, 450)).toMatchObject({ leg: 'upwind', turn: null });
      expect(leg(end, end.lengthM + 300, -400, h - 90, 800)).toMatchObject({ leg: 'crosswind', turn: null });
      expect(leg(end, end.lengthM + 300, -C, h - 90, 900)).toMatchObject({ leg: 'crosswind', turn: 'downwind', targetHdgT: (h + 180) % 360 });
    });

    it(`${end.ident}, right traffic: the mirror image`, () => {
      expect(leg(end, 800, C, h + 180, PT_TPA_FT, 'right')).toMatchObject({ leg: 'downwind', turn: null });
      expect(leg(end, -C - 10, C, h + 180, 700, 'right')).toMatchObject({ leg: 'downwind', turn: 'base', targetHdgT: (h + 270) % 360 });
      expect(leg(end, -C, 800, h - 90, 600, 'right')).toMatchObject({ leg: 'base', turn: null });
      expect(leg(end, -C, 150, h - 90, 500, 'right')).toMatchObject({ leg: 'base', turn: 'final', targetHdgT: h });
      expect(leg(end, -900, -10, h, 300, 'right')).toMatchObject({ leg: 'final', turn: null });
    });
  }

  it('the descent: 1,000 ft until abeam, then straight down what is left of the circuit (~4.2°)', () => {
    expect(PT_DESCENT_DEG).toBeGreaterThan(4);
    expect(PT_DESCENT_DEG).toBeLessThan(4.4);
    const t = (along, right, hdg, l = 'downwind') => {
      const g = leg(E16, along, right, hdg);
      expect(g.leg).toBe(l);
      return g.targetAglFt;
    };
    expect(t(10, -C, 340)).toBe(PT_TPA_FT);
    expect(t(0, -C, 340)).toBeCloseTo(PT_TPA_FT, 0);
    // At the base turn two thirds are left; on base and final it keeps falling to the threshold.
    expect(t(-C, -C, 340)).toBeCloseTo(PT_TPA_FT * 2 / 3, 0);
    expect(t(-C, -C, 250, 'base')).toBeCloseTo(PT_TPA_FT * 2 / 3, 0);
    expect(t(-C, -200, 250, 'base')).toBeLessThan(PT_TPA_FT * 2 / 3);
    // On final: the 3° path to the aim point, as the PAPI and the landing coach have it.
    const path = (a) => (a + AIM_POINT_M) * Math.tan(3 * Math.PI / 180) * 3.28084;
    expect(t(-C, 0, 160, 'final')).toBeCloseTo(path(C), 0);
    expect(t(-1, 0, 160, 'final')).toBeCloseTo(path(1), 0);
    expect(t(AIM_POINT_M + 10, 0, 160, 'final')).toBe(0);
  });

  it('cues the turns earlier with a lead time (the coach\'s debounce), pinned to coach.js', () => {
    expect(PT_COACH_HOLD_S).toBe(COACH_MIN_HOLD_S);
    expect(AIM_POINT_M).toBe(305); // pattern.js AIM_M
    const s = { ...at(E16, -C + 40, -C), trackDeg: 340, aglFt: 700, gsMps: 40 };
    expect(patternLeg(E16, s).turn).toBeNull();
    expect(patternLeg(E16, { ...s, leadS: 1.5 }).turn).toBe('base');
  });
});

const c172 = AIRCRAFT_DATABASE.c172;
const pilot = (along, right, trackDeg, aglFt, extra = {}) => ({
  ...at(E16, along, right), trackDeg: (trackDeg + 360) % 360, aglFt, iasKts: 80, slowKts: c172.vrefKts - 4, kid: false, traffic: 'left', ...extra,
});

describe('patternTarget: what the coach says on each leg', () => {
  it('downwind: hold 1,000 ft (low, high), then abeam the numbers: power back', () => {
    expect(patternTarget(E16, pilot(800, -C, 340, 1000))).toBe('ptDownwind');
    expect(patternTarget(E16, pilot(800, -C, 340, 800))).toBe('ptClimb');
    expect(patternTarget(E16, pilot(800, -C, 340, 1200))).toBe('ptDescend');
    expect(patternTarget(E16, pilot(-200, -C, 340, 950))).toBe('ptAbeam');
  });

  it('turn base at 45°, base, turn final, then the landing coach (null) on final', () => {
    expect(patternTarget(E16, pilot(-C - 20, -C, 340, 680))).toBe('ptTurnBaseL');
    expect(patternTarget(E16, pilot(-C, -900, 250, 600))).toBe('ptBase');
    expect(patternTarget(E16, pilot(-C, -100, 250, 450))).toBe('ptTurnFinalL');
    expect(patternTarget(E16, pilot(-900, 0, 160, 300))).toBeNull();
    // Right traffic says right.
    expect(patternTarget(E16, pilot(-C - 20, C, 340, 680, { traffic: 'right' }))).toBe('ptTurnBaseR');
  });

  it('high or low against the descent, slow anywhere; Kid gets one line until the final', () => {
    expect(patternTarget(E16, pilot(-C, -900, 250, 900))).toBe('ptHigh');
    expect(patternTarget(E16, pilot(-C, -900, 250, 300))).toBe('ptLow');
    expect(patternTarget(E16, pilot(800, -C, 340, 1000, { iasKts: 55 }))).toBe('ptSlow');
    expect(patternTarget(E16, pilot(800, -C, 340, 1000, { kid: true }))).toBe('ptKid');
    // Well below the descent: low, even where a turn cue would show.
    expect(patternTarget(E16, pilot(-C - 20, -C, 340, 300))).toBe('ptLow');
  });

  it('off the circuit: an early base, a U-turn on the downwind, flying on far past the base turn, the crosswind leg', () => {
    // Base turned abeam the runway's middle: no "turn final" into its side.
    expect(patternTarget(E16, pilot(600, -900, 250, 1000))).toBe('ptEarly');
    expect(patternTarget(E16, pilot(600, -100, 250, 1000))).toBe('ptEarly');
    // Reversed on the downwind, before or after abeam: wrong way, turn back.
    expect(patternTarget(E16, pilot(800, -C, 160, 1000))).toBe('ptBackL');
    expect(patternTarget(E16, pilot(-500, -C, 160, 1000))).toBe('ptBackL');
    // Hands off down the downwind 3 NM past the threshold: too far out, turn now.
    expect(patternTarget(E16, pilot(-3 * 1852, -C, 340, 950))).toBe('ptFarL');
    expect(patternTarget(E16, pilot(E16.lengthM + 300, -400, 70, 800))).toBe('ptXw');
    // Off the pattern's side: left traffic flown west of the runway, or over it the reciprocal way,
    // or base flown on past the centreline: no turn cues that point away from it.
    expect(patternTarget(E16, pilot(-C - 20, C, 340, 680))).toBe('ptSideL');
    expect(patternTarget(E16, pilot(-50, 0, 340, 900))).toBe('ptSideL');
    expect(patternTarget(E16, pilot(-C, 600, 250, 500))).toBe('ptSideL');
    expect(patternLeg(E16, { ...at(E16, -C - 20, C), trackDeg: 340, aglFt: 680 }).turn).toBeNull();
    expect(patternTarget(E16, pilot(-900, 0, 160, 300, { kid: true }))).toBeNull();
  });

  it('every key has words, the coach shows them through s.ds, and left/right say so', () => {
    for (const k of ['ptDownwind', 'ptClimb', 'ptDescend', 'ptAbeam', 'ptBase', 'ptEarly', 'ptHigh', 'ptLow', 'ptSlow', 'ptUpwind', 'ptXw', 'ptKid',
      'ptFarL', 'ptFarR', 'ptBackL', 'ptBackR', 'ptSideL', 'ptSideR',
      'ptTurnBaseL', 'ptTurnBaseR', 'ptTurnFinalL', 'ptTurnFinalR', 'ptTurnXwL', 'ptTurnXwR', 'ptTurnDwL', 'ptTurnDwR']) {
      expect(PT_TEXT[k], k).toBeTruthy();
      expect(coachText(k)).toBe(PT_TEXT[k]);
    }
    expect(PT_TEXT.ptTurnBaseL).toMatch(/left/);
    expect(PT_TEXT.ptTurnBaseR).toMatch(/right/);
    expect(PT_TEXT.ptDownwind).toMatch(/1,000 ft above the field/);
    expect(coachTarget({ aglFt: 900, onGround: false, autopilot: false, ds: 'ptTurnBaseL' })).toBe('ptTurnBaseL');
  });
});

describe("main.js's calls (from the sim, no allocation)", () => {
  const sim = (along, right, hdg, aglFt, extra = {}) => {
    const p = at(E16, along, right), r = hdg * Math.PI / 180;
    return { pos: { x: p.x, y: 0, z: p.z }, vel: { x: Math.sin(r) * 40, y: 0, z: -Math.cos(r) * 40 }, aglFt, iasKts: 80, spec: c172, flapsIndex: 0, assist: 'pilot', activeEnd: null, ...extra };
  };
  const st = createPattern(missionByKey(PATTERN_KEY));

  it('createPattern: Addison 16, left traffic', () => {
    expect(st.end.id).toBe('KADS_16');
    expect(st.traffic).toBe('left');
    expect(st.aircraft).toBe('c172');
  });

  it("another airframe picked mid-mission (the aircraft selector) gets neither the Cessna's words nor its guide", () => {
    expect(patternPrompt(st, sim(800, -C, 340, 1000, { aircraftKey: 'b738' }))).toBeNull();
    const out = { guideBankDeg: 3, guideGammaDeg: -1 };
    kidGuide(st, sim(800, -C + 200, 340, 800, { aircraftKey: 'b738', assist: 'kid' }), out);
    expect(out).toEqual({ guideBankDeg: 3, guideGammaDeg: -1 });
    expect(patternPrompt(st, sim(800, -C, 340, 1000, { aircraftKey: 'c172' }))).toBe('ptDownwind');
  });

  it('the side keys are built once: the same string object every frame', () => {
    const a = patternTarget(E16, pilot(-C - 20, -C, 340, 680));
    expect(a).toBe('ptTurnBaseL');
    expect(Object.keys(PT_TEXT)).toContain(a);
  });

  it('patternPrompt reads the sim, and cues the base turn 1.5 s early', () => {
    expect(patternPrompt(st, sim(800, -C, 340, 1000))).toBe('ptDownwind');
    expect(patternPrompt(st, sim(-C + 40, -C, 340, 700))).toBe('ptTurnBaseL');
    expect(patternPrompt(st, sim(800, -C, 340, 1000, { assist: 'kid' }))).toBe('ptKid');
  });

  it('kidGuide: holds the downwind line and 1,000 ft, turns where cued, descends, and leaves a picked final to the game', () => {
    const out = { guideBankDeg: 0, guideGammaDeg: 0 };
    expect(kidGuide(st, sim(800, -C, 340, 1000), out)).toBe(out);
    expect(Math.abs(out.guideBankDeg)).toBeLessThan(1);
    expect(Math.abs(out.guideGammaDeg)).toBeLessThan(0.5);
    kidGuide(st, sim(800, -C + 200, 340, 1000), out); // drifted 200 m toward the runway: bank back right (away)
    expect(out.guideBankDeg).toBeGreaterThan(2);
    kidGuide(st, sim(800, -C, 340, 800), out); // low: climb
    expect(out.guideGammaDeg).toBeGreaterThan(1);
    kidGuide(st, sim(-C - 20, -C, 340, 667), out); // the base turn: bank left
    expect(out.guideBankDeg).toBeLessThan(-15);
    kidGuide(st, sim(-C, -900, 250, 600), out); // base: wings level, descending
    expect(Math.abs(out.guideBankDeg)).toBeLessThan(1);
    expect(out.guideGammaDeg).toBeLessThan(-3);
    kidGuide(st, sim(-C, -150, 250, 450), out); // turn final: bank left
    expect(out.guideBankDeg).toBeLessThan(-10);
    // On a final the game has picked (sim.activeEnd), its own localizer and glidepath guide flies.
    out.guideBankDeg = 7; out.guideGammaDeg = -2.5;
    kidGuide(st, sim(-900, 0, 160, 300, { activeEnd: E16 }), out);
    expect(out).toEqual({ guideBankDeg: 7, guideGammaDeg: -2.5 });
    // Past the threshold the game's guide stops: keep down the 3° path to the aim point (no float).
    kidGuide(st, sim(100, 0, 160, 37, { activeEnd: E16 }), out);
    expect(out.guideGammaDeg).toBeLessThan(-2);
    expect(Math.abs(out.guideBankDeg)).toBeLessThan(1);
    // Not picked yet (main.js picks twice a second): this guide lines it up and flies the path.
    kidGuide(st, sim(-900, 30, 160, (900 + 305) * Math.tan(3 * Math.PI / 180) * 3.28084), out);
    expect(out.guideBankDeg).toBeLessThan(0); // right of it: bank left
    expect(out.guideGammaDeg).toBeCloseTo(-3, 1);
  });
});
