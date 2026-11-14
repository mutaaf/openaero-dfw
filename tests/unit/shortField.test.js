// Short-field landing lesson (ticket 0181, src/shortField.js): the POH's Fig. 5-11 roll, the approach band, the
// coach's words and the grade, driven with synthetic traces. The flown lesson is tests/flight/shortField.test.js.
import { describe, it, expect } from 'vitest';
import {
  createShortField, shortFieldStep, shortFieldPrompt, shortFieldResult, pohRollFt, headwindKts, kidKts, kidLiftM, KID_LIFT_M, KID_HEAD_M,
  ROLL_FT, FLARE_FT, STALL_KTS, tailFactor, longM, APPROACH_KTS, GATE_VREF, POH_AIR_FT, LONG_M, FENCE_M, CAP_B, CAP_C, DONE_NOTE, SAY_S, SHORT_FIELD_KEY, SF_TEXT,
} from '../../src/shortField.js';
import { gradeLanding, capBounced } from '../../src/landing.js';
import { stallSpeedKts } from '../../src/aero.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { coachText, RANK } from '../../src/coach.js';
import { landingTip } from '../../src/landingTip.js';
import { runwayEnd } from '../../src/airports.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { M_TO_FT } from '../../src/constants.js';

const END = runwayEnd('KADS', '16');
const FT = 1 / M_TO_FT;
const s0 = () => ({ alongM: -5000, crossM: 0, aglFt: 900, iasKts: 61, flapsFull: true, onGround: false, gsKts: 61, braking: false, wx: null });
// The approach from `fromFt` to the touchdown at tdM (kts the whole way), then a roll of rollFt with the brakes from brakeS.
function flown({ fromFt = 900, kts = 61, flapsFull = true, tdM = 250, rollFt = 600, brakeS = 0.5, wx = null, off = false } = {}) {
  const sf = createShortField(END), s = s0(), dt = 1 / 30;
  Object.assign(s, { iasKts: kts, flapsFull, wx });
  for (let ft = fromFt; ft > 0; ft -= 10 * dt) { s.aglFt = ft; s.braking = brakeS < 0; shortFieldStep(sf, s, dt); }
  Object.assign(s, { onGround: true, aglFt: 4, alongM: tdM, iasKts: 50, gsKts: 45 });
  shortFieldStep(sf, s, dt);
  const rollM = rollFt * FT;
  for (let t = 0; t < 30 && !sf.stopped; t += dt) {
    s.braking = t >= brakeS;
    s.alongM = off ? tdM + t * 40 : tdM + rollM * Math.min(1, t / 10);
    s.gsKts = off ? 40 : 45 * Math.max(0, 1 - t / 10);
    shortFieldStep(sf, s, dt);
  }
  return sf;
}
const landing = (pastM, iasKts = 50) => gradeLanding({ vsFpm: -150, crossM: 0, pastThresholdM: pastM, runwayLengthM: END.lengthM - END.displacedM, runwayWidthM: END.widthM, pitchDeg: 6, bankDeg: 0, iasKts, vrefKts: 62 });
const result = (sf, kid = false, poh = 600) => shortFieldResult(landing(sf.tdM, sf.tdKts), sf, poh, kid);

describe('POH Fig. 5-11 ground roll (Cessna 172S, 2550 lb, flaps 30, power off, maximum braking)', () => {
  it('reads the table at its rows and columns', () => {
    expect(pohRollFt(0, 29.92, 0)).toBe(545);
    expect(pohRollFt(0, 29.92, 20)).toBe(585);
    expect(pohRollFt(1000, 29.92, 10)).toBe(585);
    expect(pohRollFt(8000, 29.92, 40)).toBe(840);
    expect(ROLL_FT).toHaveLength(9);
  });
  it('interpolates sea level ISA (15 °C) to the c172 card\'s 575 ft, and Addison at 15 °C to ~588 ft', () => {
    expect(pohRollFt(0, 29.92, 15)).toBeCloseTo(575, 6);
    expect(pohRollFt(END.elevFt, 29.92, 15)).toBeCloseTo(575 + 0.633 * 20, 0);
  });
  it('a low altimeter setting raises the pressure altitude (1,000 ft per inch)', () => {
    expect(pohRollFt(0, 28.92, 0)).toBeCloseTo(565, 6);
  });
  it('clamps off the chart', () => {
    expect(pohRollFt(-500, 30.5, -10)).toBe(545);
    expect(pohRollFt(12000, 29.92, 50)).toBe(840);
  });
  it('note 2: -10% per 9 kt of headwind, +10% per 2 kt of tailwind up to 10 kt', () => {
    expect(pohRollFt(0, 29.92, 0, 9)).toBeCloseTo(545 * 0.9, 6);
    expect(pohRollFt(0, 29.92, 0, -2)).toBeCloseTo(545 * 1.1, 6);
    expect(pohRollFt(0, 29.92, 0, -10)).toBeCloseTo(545 * 1.5, 6);
    expect(pohRollFt(0, 29.92, 0, -15)).toBeCloseTo(545 * 1.5, 6);
  });
  it('the METAR wind along the runway (true direction, + = headwind)', () => {
    expect(headwindKts({ windDirDeg: 160, windKts: 10 }, 160)).toBeCloseTo(10, 6);
    expect(headwindKts({ windDirDeg: 340, windKts: 10 }, 160)).toBeCloseTo(-10, 6);
    expect(headwindKts({ windDirDeg: 250, windKts: 10 }, 160)).toBeCloseTo(0, 6);
    expect(headwindKts(null, 160)).toBe(0);
  });
});

describe('the lesson\'s numbers', () => {
  it('the POH\'s air distance from the 50 ft obstacle (Fig. 5-11: 1,335 total less the 575 roll) and the 1,000 ft line', () => {
    expect(POH_AIR_FT).toBe(760);
    expect(LONG_M * M_TO_FT).toBeCloseTo(1000, 6);
  });
  it('POH Section 4\'s 61 KIAS; the gate calls SLOW only under the band (56), not at 61 under the 62 Vref', () => {
    expect(APPROACH_KTS).toBe(61);
    expect(GATE_VREF).toBe(56);
    expect(kidKts(true)).toBe(61);
    expect(kidKts(false)).toBe(0);
  });
  it('Kid\'s path aims lower than the PAPI\'s, less so into the wind, never higher', () => {
    expect(kidLiftM(null, 160)).toBe(KID_LIFT_M);
    expect(kidLiftM({ windDirDeg: 160, windKts: 4 }, 160)).toBeCloseTo(KID_LIFT_M + 4 * KID_HEAD_M, 9);
    expect(kidLiftM({ windDirDeg: 340, windKts: 5 }, 160)).toBeCloseTo(KID_LIFT_M - 5 * KID_HEAD_M, 9);
    expect(kidLiftM({ windDirDeg: 160, windKts: 20 }, 160)).toBe(0);
  });
});

describe('the approach band (ACS PA.IV.F.S7: 61 +10/-5 below 500 ft)', () => {
  it('61 the whole way is inside it; flaps full at 500 ft are noted', () => {
    const sf = flown();
    expect(sf.speedOut).toBe(false);
    expect(sf.flapsAt500).toBe(true);
    expect(sf.minKts).toBe(61);
  });
  it('55 or 72 for more than 2 s is outside it; above 500 ft it is not checked', () => {
    expect(flown({ kts: 55 }).speedOut).toBe(true);
    expect(flown({ kts: 72 }).speedOut).toBe(true);
    const sf = createShortField(END), s = s0();
    s.iasKts = 80; s.aglFt = 800;
    for (let i = 0; i < 300; i++) shortFieldStep(sf, s, 1 / 30);
    expect(sf.speedOut).toBe(false);
    expect(sf.below500).toBe(false);
  });
  it('half the METAR\'s gust spread widens the top (AFH ch. 9)', () => {
    expect(flown({ kts: 72, wx: { windKts: 10, gustKts: 20 } }).speedOut).toBe(false);
    expect(flown({ kts: 77, wx: { windKts: 10, gustKts: 20 } }).speedOut).toBe(true);
  });
  it('a 1 s gust out of the band is not the pilot\'s', () => {
    const sf = createShortField(END), s = s0();
    for (let t = 0; t < 10; t += 1 / 30) { s.aglFt = 400 - t * 10; s.iasKts = t > 3 && t < 4 ? 50 : 61; shortFieldStep(sf, s, 1 / 30); }
    expect(sf.speedOut).toBe(false);
  });
  it('flaps short of 30 at 500 ft are noted', () => {
    expect(flown({ flapsFull: false }).flapsAt500).toBe(false);
  });
});

describe('the touchdown, the brakes and the stop', () => {
  it('records the touchdown point and speed, the brakes\' delay and the stop', () => {
    const sf = flown({ tdM: 70, rollFt: 600, brakeS: 0.5 });
    expect(sf.tdM).toBe(70);
    expect(sf.tdKts).toBe(50);
    expect(sf.brakeS).toBeGreaterThan(0.45);
    expect(sf.brakeS).toBeLessThan(0.6);
    expect(sf.stopped).toBe(true);
    expect(sf.off).toBe(false);
    expect((sf.stopM - sf.tdM) * M_TO_FT).toBeGreaterThan(560);
  });
  it('a slow exit onto a taxiway (under 15 kt) is a stop, not a run-off', () => {
    const sf = createShortField(END), s = s0();
    Object.assign(s, { onGround: true, aglFt: 4, alongM: 300, gsKts: 40 });
    shortFieldStep(sf, s, 1 / 30);
    Object.assign(s, { alongM: 500, crossM: 30, gsKts: 10 });
    shortFieldStep(sf, s, 1 / 30);
    expect(sf.stopped).toBe(true);
    expect(sf.off).toBe(false);
  });
  it('a go-around before any touchdown, back past 600 ft, clears the approach\'s flags; a climb is not sampled', () => {
    const sf = createShortField(END), s = s0();
    Object.assign(s, { aglFt: 400, iasKts: 74, vsFpm: 600 }); // climbing away at Vy below 500 ft
    for (let i = 0; i < 120; i++) shortFieldStep(sf, s, 1 / 30);
    expect(sf.speedOut).toBe(false);
    Object.assign(s, { iasKts: 75, vsFpm: -400 });
    for (let i = 0; i < 120; i++) shortFieldStep(sf, s, 1 / 30);
    expect(sf.speedOut).toBe(true);
    Object.assign(s, { aglFt: 700, vsFpm: 500 });
    shortFieldStep(sf, s, 1 / 30);
    shortFieldStep(sf, s, 1 / 30);
    expect(sf.speedOut).toBe(false);
    expect(sf.below500).toBe(false);
  });
  it('off the runway\'s end is a stop, off', () => {
    const sf = flown({ off: true, tdM: END.lengthM - END.displacedM - 100 });
    expect(sf.stopped).toBe(true);
    expect(sf.off).toBe(true);
  });
  it('a go-around above 50 ft after a touch starts the touchdown over', () => {
    const sf = createShortField(END), s = s0();
    Object.assign(s, { onGround: true, aglFt: 4, alongM: 900 });
    shortFieldStep(sf, s, 1 / 30);
    expect(sf.tdM).toBe(900);
    Object.assign(s, { onGround: false, aglFt: 60 });
    shortFieldStep(sf, s, 1 / 30);
    expect(sf.tdM).toBeNull();
  });
  it('after a graded stop, taking off and landing again is a new landing, and past 500 ft a new approach (device panel)', () => {
    const sf = flown({ tdM: 250, rollFt: 600 });
    expect(sf.stopped).toBe(true);
    const s = s0();
    Object.assign(s, { onGround: false, aglFt: 60, iasKts: 70 });
    shortFieldStep(sf, s, 1 / 30);
    expect(sf.stopped).toBe(false);
    expect(sf.tdM).toBeNull();
    expect(sf.below500).toBe(true); // the first approach's, until it climbs past 500 ft
    s.aglFt = 800;
    shortFieldStep(sf, s, 1 / 30);
    expect(sf.below500).toBe(false);
    expect(sf.flapsAt500).toBeNull();
    Object.assign(s, { onGround: true, aglFt: 4, alongM: 400, iasKts: 48, gsKts: 48 });
    shortFieldStep(sf, s, 1 / 30);
    expect(sf.tdM).toBe(400);
    expect(sf.tdKts).toBe(48);
    expect(sf.stopped).toBe(false);
  });
  it('graded anyway a minute after the touchdown (rolling on slowly)', () => {
    const sf = createShortField(END), s = s0();
    Object.assign(s, { onGround: true, aglFt: 4, alongM: 60, gsKts: 10 });
    for (let t = 0; t < 61; t += 0.5) shortFieldStep(sf, s, 0.5);
    expect(sf.stopped).toBe(true);
  });
});

describe('the grade', () => {
  it('down in the first 1,000 ft at 61, braked at once and stopped inside the POH roll: graded, no cap, the lesson\'s note', () => {
    const r = result(flown({ rollFt: 600 }));
    expect(['S', 'A']).toContain(r.grade);
    expect(r.reason).toBeNull();
    expect(r.note).toBe(DONE_NOTE);
    expect(r.factors.find((f) => f.key === 'zone').score).toBe(100);
    expect(r.factors.find((f) => f.key === 'roll').value).toMatch(/^5\d\d ft \(handbook 600\)$/); // stopped under 3 kt, a little short of 600
    expect(r.factors.find((f) => f.key === 'brakes').score).toBe(100);
  });
  it('the zone: full marks from 400 ft short of the POH\'s ~760 ft touchdown to the 1,000 ft line, not the normal zone\'s 150-600 m', () => {
    const at = (tdFt) => result(flown({ tdM: tdFt * FT })).factors.find((f) => f.key === 'zone').score;
    expect(at(0)).toBe(70);
    expect(at(360)).toBe(100);
    expect(at(1000)).toBe(100);
    expect(at(1500)).toBe(40);
    expect(landing(1500 * FT).factors.find((f) => f.key === 'zone').score).toBe(100); // the normal zone's full marks run to 600 m
  });
  it('a near-stall touchdown is full marks (the normal grade calls 50 kt slow against a 62 Vref); the stall is the sim\'s calibrated 48', () => {
    const r = result(flown());
    expect(landing(250, 50).factors.find((f) => f.key === 'speed').score).toBeLessThan(90);
    expect(r.factors.find((f) => f.key === 'speed').score).toBe(100);
    expect(r.factors.find((f) => f.key === 'speed').value).toBe('50 kt (stall 48)');
    expect(STALL_KTS).toBeCloseTo(stallSpeedKts(AIRCRAFT_DATABASE.c172, 3), 0); // POH Fig. 5-3: 40 KIAS = 48 KCAS
  });
  it('one bounce keeps its C through the lesson\'s rescore, two or more a D (physics panel: it went B 73)', () => {
    const sf = flown();
    const one = shortFieldResult(capBounced(landing(sf.tdM, sf.tdKts), 1), sf, 600);
    expect(one.score).toBeLessThanOrEqual(CAP_C);
    expect(one.reason).toMatch(/Bounced once/);
    expect(shortFieldResult(capBounced(landing(sf.tdM, sf.tdKts), 2), sf, 600).grade).toBe('D');
  });
  it('a tailwind stretches the float line by Fig. 5-11 note 2 (+10% per 2 kt, held at 10 kt); a headwind never tightens it', () => {
    expect(tailFactor(-5)).toBeCloseTo(1.25, 9);
    expect(tailFactor(-15)).toBeCloseTo(1.5, 9);
    expect(tailFactor(8)).toBe(1);
    const tail = (tdFt, kts) => { const sf = flown({ tdM: tdFt * FT, wx: { windDirDeg: 340, windKts: kts } }); return result(sf); };
    expect(tail(1150, 5).reason).toBeNull(); // 1,250 ft line in 5 kt of tailwind
    expect(tail(1150, 5).factors[0].value).toBe('1,150 ft: inside 1,250');
    expect(tail(1300, 5).reason).toMatch(/first 1,250 ft \(1,000 stretched for the tailwind/);
    expect(longM(10) * M_TO_FT).toBeCloseTo(1000, 6);
  });
  it('a variable wind (METAR VRB: no direction) is no wind along the runway, not a tailwind', () => {
    expect(headwindKts({ windDirDeg: null, windKts: 5 }, 160)).toBe(0);
    expect(kidLiftM({ windDirDeg: null, windKts: 5 }, 160)).toBe(KID_LIFT_M);
  });
  it('brakes set before the wheels touched read so, at half marks (full on Kid)', () => {
    const sf = flown({ brakeS: -1 });
    expect(sf.brakesEarly).toBe(true);
    const b = result(sf).factors.find((f) => f.key === 'brakes');
    expect(b.value).toBe('on before touchdown');
    expect(b.score).toBe(50);
    expect(result(sf, true).factors.find((f) => f.key === 'brakes').score).toBe(100);
  });
  it('a float past the first 1,000 ft caps C', () => {
    const r = result(flown({ tdM: LONG_M + 10 }));
    expect(r.score).toBeLessThanOrEqual(CAP_C);
    expect(r.reason).toMatch(/1,000 ft/);
  });
  it('a roll over 1.15x the POH\'s caps B; over 1.5x caps C; no brakes reads "not used"', () => {
    expect(result(flown({ rollFt: 750 })).score).toBeLessThanOrEqual(CAP_B);
    // Brakes on at once: the long roll is the touchdown speed's (the brakes are on/off: no "harder").
    expect(result(flown({ rollFt: 750 })).reason).toMatch(/touch down slower \(50 kt/);
    expect(result(flown({ rollFt: 750, brakeS: 4 })).reason).toMatch(/brakes on right after touchdown/);
    expect(result(flown({ rollFt: 1000 })).score).toBeLessThanOrEqual(CAP_C);
    const none = result(flown({ rollFt: 1400, brakeS: 99 }));
    expect(none.factors.find((f) => f.key === 'brakes').value).toBe('not used');
    expect(none.score).toBeLessThanOrEqual(CAP_C);
  });
  it('outside the speed band or short of full flaps at 500 ft caps B on Pilot, not on Kid (its automation flies them)', () => {
    expect(result(flown({ kts: 72 })).score).toBeLessThanOrEqual(CAP_B);
    expect(result(flown({ kts: 72 })).reason).toMatch(/56-71/);
    expect(result(flown({ flapsFull: false })).reason).toMatch(/Flaps/);
    expect(result(flown({ kts: 72 }), true).reason).toBeNull();
  });
  it('off the runway is a D; a crash stays a crash', () => {
    const sf = flown({ off: true, tdM: END.lengthM - END.displacedM - 100 });
    const r = result(sf);
    expect(r.grade).toBe('D');
    expect(r.reason).toMatch(/Ran off/);
    const crash = { ...landing(250), grade: 'CRASH', score: 0 };
    expect(shortFieldResult(crash, flown(), 600)).toBe(crash);
  });
});

describe('the card\'s "Next time" tip (landingTip.js hands this lesson\'s over) and strip', () => {
  // landingTip shows none on an S (a greaser): the lesson's own tip is checked directly where the grade may be one.
  const tip = (o, kid = false) => result(flown(o), kid).tip;
  it('a float: idle at the edge, land before the blocks (never "aim further in")', () => {
    const r = result(flown({ tdM: 1250 * FT }));
    expect(landingTip(r, {})).toMatch(/^Touched down 1,250 ft in: idle at the runway's edge/);
  });
  it('late or no brakes names the brakes; Kid gets the BRAKES tap, not "let go of the stick"', () => {
    expect(tip({ rollFt: 1300, brakeS: 99 })).toMatch(/Brakes never came on/);
    expect(tip({ rollFt: 700, brakeS: 4 })).toMatch(/Brakes came on 4\.\d s after touchdown/);
    expect(tip({ rollFt: 1300, brakeS: 99 }, true)).toBe('Tap BRAKES the moment the wheels touch.');
  });
  it('a long roll with the brakes on at once names the touchdown speed, never the stall as the approach speed', () => {
    const t = tip({ rollFt: 750 });
    expect(t).toMatch(/Touched down at 50 kt: hold 61/);
    expect(t).not.toMatch(/approach speed \(40\)/);
  });
  it('speed band and flaps are the approach\'s tips', () => {
    expect(tip({ kts: 72 })).toMatch(/Hold 61 knots/);
    expect(tip({ flapsFull: false })).toMatch(/Full flaps \(30°\)/);
  });
  it('the runway strip shades the lesson\'s full marks, 360 ft to the 1,000 ft line', () => {
    const z = result(flown()).zoneM;
    expect(z[0] * M_TO_FT).toBeCloseTo(360, 6);
    expect(z[1] * M_TO_FT).toBeCloseTo(1000, 6);
  });
});

describe('the coach', () => {
  const ap = (distM = 2000) => ({ heightAbovePathM: 0, distM });
  const input = (o = {}) => ({ aglFt: 600, kid: false, iasKts: 61, flapsLanding: true, vsiFpm: -350, locDots: 0, papiWhite: 2, throttle: 0.3, ...o });
  const ready = () => { const sf = createShortField(END); shortFieldStep(sf, s0(), SAY_S + 1); return sf; };
  it('opens with the briefing, Kid\'s own words; then the landing coach (null) flies the PAPI, the flaps and the speed', () => {
    const sf = createShortField(END);
    shortFieldStep(sf, s0(), 1 / 30);
    expect(shortFieldPrompt(sf, input(), ap())).toBe('sfBrief');
    expect(shortFieldPrompt(sf, input({ kid: true }), ap())).toBe('sfKid');
    expect(shortFieldPrompt(ready(), input({ kid: true }), ap())).toBeNull();
    expect(shortFieldPrompt(ready(), input(), ap())).toBeNull();
  });
  it('over the fence with power on: idle (POH: "REDUCE to idle after clearing obstacle")', () => {
    expect(shortFieldPrompt(ready(), input({ aglFt: 70, throttle: 0.2 }), ap(FENCE_M - 10))).toBe('sfIdle');
    expect(shortFieldPrompt(ready(), input({ aglFt: 70, throttle: 0 }), ap(FENCE_M - 10))).toBeNull();
    expect(shortFieldPrompt(ready(), input({ aglFt: 200, throttle: 0.2 }), ap(FENCE_M + 400))).toBeNull();
  });
  it('under 30 ft and after the touchdown: the landing coach\'s idle, flare and brakes', () => {
    expect(shortFieldPrompt(ready(), input({ aglFt: 25, throttle: 0.2 }), ap(-50))).toBeNull();
    expect(shortFieldPrompt(flown(), input(), ap())).toBeNull();
  });
  it('a tailwind on the runway is said after the briefing (Fig. 5-11 note 2: +10% per 2 kt)', () => {
    const sf = createShortField(END), s = s0();
    s.wx = { windDirDeg: 340, windKts: 8 };
    shortFieldStep(sf, s, SAY_S + 1);
    expect(shortFieldPrompt(sf, input(), ap())).toBe('sfTail');
    shortFieldStep(sf, s, SAY_S);
    expect(shortFieldPrompt(sf, input(), ap())).toBeNull();
    expect(shortFieldPrompt(ready(), input(), ap())).toBeNull(); // calm: no tailwind words
  });
  it('the flare is called at 20 ft on the lesson (FLARE_FT), not right after "nose down a touch" at the fence', () => {
    expect(FLARE_FT).toBe(20);
  });
  it('every key has words; idle interrupts', () => {
    for (const k of Object.keys(SF_TEXT)) expect(coachText(k)).toBe(SF_TEXT[k]);
    expect(RANK.sfIdle).toBe(4);
  });
});

describe('the mission', () => {
  it('a Cessna final to Addison 16, flaps up at 70 (POH: 65-75 flaps up), in the Drills group', () => {
    const m = missionByKey(SHORT_FIELD_KEY);
    expect(m.key).toBe(SHORT_FIELD_KEY);
    expect(m).toMatchObject({ kind: 'final', airport: 'KADS', rwy: '16', distNm: 3, aircraft: 'c172', kias: 70, flaps: 0, shortField: true });
    const drills = groupMissions(MISSIONS).find((g) => g.id === 'drills');
    expect(drills.missions.map((x) => x.key)).toContain(SHORT_FIELD_KEY);
    expect(groupMissions(MISSIONS).find((g) => g.id === 'KADS').missions.map((x) => x.key)).not.toContain(SHORT_FIELD_KEY);
  });
});
