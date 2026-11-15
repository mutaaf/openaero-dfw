import { describe, it, expect } from 'vitest';
import { runwayEnd, AIM_POINT_M } from '../../src/airports.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { COACH_MIN_HOLD_S, coachText, coachTarget } from '../../src/coach.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import {
  PATTERN_KEY, PT_TPA_FT, PT_DOWNWIND_NM, PT_DESCENT_DEG, PT_COACH_HOLD_S, PT_TEXT,
  patternLeg, patternTarget, patternPrompt, createPattern, kidGuide,
  ENTRY_KEY, PTE_CAP_B, PTE_CAP_C, entryLeg, entryTarget, entryStep, entryResult, createEntry,
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

// Joining the pattern (ticket 0187): the 45° entry to the downwind, abeam the runway's midpoint, at
// pattern altitude (AC 90-66C §11.3; Appendix A item 1). Left traffic for 16 joins with a right turn.
describe('the pattern entry mission (ticket 0187)', () => {
  const m = missionByKey(ENTRY_KEY);
  const mid = (end) => end.lengthM / 2 - end.displacedM; // the runway's midpoint, past the landing threshold

  it('is in the catalogue under Addison, the Cessna at 1,000 ft, with a blurb and its own best key', () => {
    expect(m).toMatchObject({ kind: 'drill', airport: 'KADS', rwy: '16', aircraft: 'c172', aglFt: PT_TPA_FT, pattern: true, entry: true });
    expect(m.key).not.toBe(PATTERN_KEY);
    expect(m.blurb).toMatch(/45°/);
    const kads = groupMissions(MISSIONS).find((g) => g.id === 'KADS');
    expect(kads.missions.map((x) => x.key)).toContain(ENTRY_KEY);
  });

  it('spawns 4 NM out on the 45° line to the downwind abeam the midpoint, heading along it (295°, 45° off the 340° downwind)', () => {
    const g = entryLeg(E16, { x: m.pos[0], z: m.pos[1], trackDeg: m.hdg, aglFt: m.aglFt });
    expect(g.phase).toBe('inbound');
    expect(g.distM / 1852).toBeCloseTo(4, 2);
    expect(Math.abs(g.offLineM)).toBeLessThan(5);
    expect(g.entryHdgT).toBe(295);
    expect(g.downwindHdgT).toBe(340);
    expect(m.hdg).toBe(295);
    expect(g.outsideM).toBeGreaterThan(0); // outside the downwind (east of it)
  });

  for (const end of [E16, E34]) {
    for (const traffic of ['left', 'right']) {
      const t = traffic === 'right' ? 1 : -1; // the pattern's side: right of the landing direction for right traffic
      const dw = (end.hdgT + 180) % 360;
      const eh = (dw + 45 * t + 360) % 360;
      const p = (along, side) => ({ ...at(end, along, side * t) });
      it(`${end.ident}, ${traffic} traffic: inbound far out, on the 45° near it, the turn onto downwind, joined, or straight in`, () => {
        // 1 NM out on the 45° line, heading along it: entry45. The line runs back from the join point.
        const er = (eh - end.hdgT) * Math.PI / 180;
        const back = (d) => p(mid(end) - Math.cos(er) * d, C - Math.sin(er) * t * d);
        const on = entryLeg(end, { ...back(1852), trackDeg: eh, aglFt: 1000 }, traffic);
        expect(on).toMatchObject({ phase: 'entry45', turn: false, entryHdgT: eh, downwindHdgT: dw });
        expect(Math.abs(on.offLineM)).toBeLessThan(1);
        expect(on.outsideM).toBeGreaterThan(1000);
        // 3 NM out: still arriving.
        expect(entryLeg(end, { ...back(3 * 1852), trackDeg: eh, aglFt: 1000 }, traffic).phase).toBe('inbound');
        // 150 m short of the downwind line on the 45°: turn now (the other way from the pattern's turns).
        const near = entryLeg(end, { ...back(150 / Math.SQRT1_2), trackDeg: eh, aglFt: 1000, gsMps: 46 }, traffic);
        expect(near.turn).toBe(true);
        // On the downwind line abeam the midpoint, tracking it: joined.
        expect(entryLeg(end, { ...p(mid(end), C), trackDeg: dw, aglFt: 1000 }, traffic).phase).toBe('downwind');
        // On a base from the pattern's side, before the threshold: joined straight in on base.
        expect(entryLeg(end, { ...p(-1200, C), trackDeg: (end.hdgT - 90 * t + 360) % 360, aglFt: 800 }, traffic).phase).toBe('base');
        // Over the runway's side of the downwind, not joined: inside.
        expect(entryLeg(end, { ...p(mid(end), 200), trackDeg: eh, aglFt: 1000 }, traffic).phase).toBe('inside');
        // A late turn, 600 m past the downwind line (still 1/4 NM out): still told to turn.
        expect(entryLeg(end, { ...p(mid(end), C - 600), trackDeg: eh, aglFt: 1000, gsMps: 46 }, traffic).turn).toBe(true);
        // Off the line to its right (right of the course): a positive offset.
        const right = (h) => ({ x: Math.cos(h * Math.PI / 180) * 500, z: Math.sin(h * Math.PI / 180) * 500 });
        const b1 = back(1852), o = right(eh);
        expect(entryLeg(end, { x: b1.x + o.x, z: b1.z + o.z, trackDeg: eh, aglFt: 1000 }, traffic).offLineM).toBeCloseTo(500, 0);
      });
    }
  }

  it('entryTarget: the words through the join, height first, the turn (right for left traffic), then the circuit takes over', () => {
    const er = (295 - 160) * Math.PI / 180;
    const back = (d) => at(E16, mid(E16) - Math.cos(er) * d, -(C - Math.sin(er) * -1 * d));
    const pilot = (pt, trackDeg, aglFt, extra = {}) => ({ ...pt, trackDeg, aglFt, gsMps: 46, leadS: 0, iasKts: 90, slowKts: 58, kid: false, traffic: 'left', ...extra });
    expect(entryTarget(E16, pilot(back(3 * 1852), 295, 1000))).toBe('pteIn');
    expect(entryTarget(E16, pilot(back(1852), 295, 1000))).toBe('pte45');
    expect(entryTarget(E16, pilot(back(1852), 295, 1200))).toBe('ptDescend');
    expect(entryTarget(E16, pilot(back(1852), 295, 850))).toBe('ptClimb');
    expect(entryTarget(E16, pilot(back(1852), 295, 1000, { iasKts: 55 }))).toBe('ptSlow');
    expect(entryTarget(E16, pilot(back(1852), 295, 1000, { kid: true }))).toBe('ptKid');
    expect(entryTarget(E16, pilot(back(150 / Math.SQRT1_2), 295, 1000))).toBe('pteJoinR');
    expect(PT_TEXT.pteJoinR).toBe('Join: turn right onto downwind, the runway on your left');
    // Overshot inside the downwind line still on the 45°: turn onto it; tracking it already: the circuit's words.
    expect(entryTarget(E16, pilot(at(E16, mid(E16), -300), 295, 1000))).toBe('pteMissR');
    expect(entryTarget(E16, pilot(at(E16, mid(E16), -300), 340, 1000))).toBeNull();
    // Heading away from the field (back along the 45°): wrong way, and which way to turn back.
    const away = entryTarget(E16, pilot(back(3 * 1852), 115, 1000));
    expect(['pteBackL', 'pteBackR']).toContain(away);
    // On the line 3 NM out flying south (160°): the join point (295°) is to the right.
    expect(entryTarget(E16, pilot(back(3 * 1852), 160, 1000))).toBe('pteBackR');
    expect(entryTarget(E16, pilot(back(3 * 1852), 70, 1000))).toBe('pteBackL');
    // 600 m right of the 45° line (north-east of it), 1 NM out: turn left toward the line.
    const b = back(1852), r = 295 * Math.PI / 180; // right of the 295° course: (cos h, sin h) in sim x, z
    expect(entryTarget(E16, pilot({ x: b.x + Math.cos(r) * 600, z: b.z + Math.sin(r) * 600 }, 295, 1000))).toBe('pteOffL');
    // Joined: the circuit's coach (null here).
    expect(entryTarget(E16, pilot(at(E16, mid(E16), -C), 340, 1000))).toBeNull();
    for (const k of ['pteIn', 'pte45', 'pteJoinL', 'pteJoinR', 'pteOffL', 'pteOffR', 'pteBackL', 'pteBackR', 'pteMissL', 'pteMissR']) {
      expect(PT_TEXT[k]).toBeTruthy();
      expect(coachText(k)).toBe(PT_TEXT[k]);
    }
  });

  const flown = (o) => ({ end: E16, ent: { ...createEntry(), done: 'downwind', joinFt: 1000, joinKts: 90, joinOutM: 0, joinAlongM: 0, angleDeg: 45, minFt: 980, maxFt: 1020, ...o } });
  const card = { grade: 'A', score: 92, reason: null, note: null, factors: [] };
  it('entryResult: a clean join keeps the grade and says so; each miss caps B and is named', () => {
    expect(entryResult(card, flown())).toMatchObject({ grade: 'A', score: 92, reason: null, note: 'Joined on the 45° at 1,000 ft', entry: true });
    const miss = (o, re) => {
      const r = entryResult(card, flown(o));
      expect(r.score).toBe(PTE_CAP_B);
      expect(r.grade).toBe('B');
      expect(r.reason).toMatch(re);
      expect(r.note).toBeNull();
    };
    miss({ angleDeg: 80 }, /^Joined the downwind at 80°, not 45° \(±20°\)/);
    miss({ angleDeg: null, joinOutM: -200 }, /from the runway side/);
    miss({ angleDeg: null, joinOutM: 600 }, /^Turned onto the downwind early, too far out/);
    miss({ joinAlongM: 2080 }, /^Joined the downwind abeam past the far end of the runway/);
    miss({ joinAlongM: -1420 }, /^Joined the downwind abeam before the runway/);
    miss({ minFt: 500 }, /^Came up through the 45° entry from 500 ft/);
    miss({ inside: true }, /^Crossed inside the downwind before joining/);
    // Inside the coach's grace (1,140 ft, stepped down): no cap.
    expect(entryResult(card, flown({ maxFt: 1140 })).grade).toBe('A');
    miss({ joinFt: 1180, maxFt: 1180 }, /^Joined the downwind 180 ft high/);
    miss({ joinFt: 850 }, /^Joined the downwind 150 ft low/);
    miss({ maxFt: 1600 }, /^Came down through the 45° entry from 1,600 ft/);
    miss({ joinKts: 112 }, /^Joined at 112 knots/);
  });

  it('entryResult: straight in on base or never joined caps C; a D keeps its reason and a crash is untouched', () => {
    const base = entryResult(card, flown({ done: 'base' }));
    expect(base).toMatchObject({ grade: 'C', score: PTE_CAP_C });
    expect(base.reason).toMatch(/^Joined straight in on base/);
    expect(entryResult(card, flown({ done: null })).reason).toMatch(/^Never joined the downwind/);
    const d = { grade: 'D', score: 40, reason: 'Landed beside the runway.', factors: [] };
    expect(entryResult(d, flown({ done: 'base' }))).toMatchObject({ grade: 'D', score: 40 });
    const crash = { grade: 'CRASH', score: 0, reason: 'x', factors: [] };
    expect(entryResult(crash, flown({ done: 'base' }))).toBe(crash);
    // No entry (the plain pattern): unchanged.
    expect(entryResult(card, { ent: null })).toBe(card);
  });

  it('entryStep records the join once, from the sim; the plain pattern has no entry', () => {
    expect(createPattern(missionByKey(PATTERN_KEY)).ent).toBeNull();
    const st = createPattern(m);
    expect(st.ent).toEqual(createEntry());
    const c172 = AIRCRAFT_DATABASE.c172;
    const sim = (pt, hdg, aglFt, iasKts = 90) => {
      const r = hdg * Math.PI / 180;
      return { pos: { x: pt.x, y: 0, z: pt.z }, vel: { x: Math.sin(r) * 46, y: 0, z: -Math.cos(r) * 46 }, aglFt, iasKts, spec: c172, assist: 'pilot', aircraftKey: 'c172' };
    };
    const er = (295 - 160) * Math.PI / 180;
    const back = (d) => at(E16, mid(E16) - Math.cos(er) * d, -(C - Math.sin(er) * -1 * d));
    entryStep(st, { ...sim(back(1852), 295, 1040), simTime: 10 });
    entryStep(st, { ...sim(back(300 / Math.SQRT1_2), 295, 1010), simTime: 30 }); // straight on the 45°, outside the line: the angle is read
    expect(st.ent.angleDeg).toBeCloseTo(45, 0);
    entryStep(st, { ...sim(back(100 / Math.SQRT1_2), 315, 1010), simTime: 31 }); // turning 20°/s: not read
    expect(st.ent.angleDeg).toBeCloseTo(45, 0);
    expect(st.ent.angleDeg).toBeCloseTo(45, 0);
    expect(st.ent.maxFt).toBe(1040);
    expect(patternPrompt(st, sim(back(1852), 295, 1000))).toBe('pte45');
    entryStep(st, sim(at(E16, mid(E16) - 100, -C), 340, 1005, 88));
    expect(st.ent).toMatchObject({ done: 'downwind', joinFt: 1005, joinKts: 88, inside: false });
    expect(st.ent.joinAlongM).toBeCloseTo(-100, 0);
    entryStep(st, sim(at(E16, -1200, -C), 250, 700)); // later legs do not rewrite it
    expect(st.ent.done).toBe('downwind');
    // Joined: the circuit's words and guide.
    expect(patternPrompt(st, sim(at(E16, 800, -C), 340, 1000))).toBe('ptDownwind');
    // Another airframe picked mid-mission records nothing.
    const st2 = createPattern(m);
    entryStep(st2, { ...sim(at(E16, mid(E16), -C), 340, 1000), aircraftKey: 'b738' });
    expect(st2.ent.done).toBeNull();
  });

  it("kidGuide on the join: holds the 45° line and 1,000 ft, then turns onto the downwind line", () => {
    const st = createPattern(m);
    const er = (295 - 160) * Math.PI / 180;
    const back = (d) => at(E16, mid(E16) - Math.cos(er) * d, -(C - Math.sin(er) * -1 * d));
    const sim = (pt, hdg, aglFt) => {
      const r = hdg * Math.PI / 180;
      return { pos: { x: pt.x, y: 0, z: pt.z }, vel: { x: Math.sin(r) * 46, y: 0, z: -Math.cos(r) * 46 }, aglFt, iasKts: 90, spec: AIRCRAFT_DATABASE.c172, assist: 'kid', aircraftKey: 'c172' };
    };
    const out = { guideBankDeg: 0, guideGammaDeg: 0 };
    kidGuide(st, sim(back(1852), 295, 1000), out);
    expect(Math.abs(out.guideBankDeg)).toBeLessThan(1);
    expect(Math.abs(out.guideGammaDeg)).toBeLessThan(0.5);
    kidGuide(st, sim(back(1852), 295, 900), out);
    expect(out.guideGammaDeg).toBeGreaterThan(1);
    kidGuide(st, sim(back(100 / Math.SQRT1_2), 295, 1000), out); // the turn: right, onto the 340° downwind
    expect(out.guideBankDeg).toBeGreaterThan(10);
  });
});
