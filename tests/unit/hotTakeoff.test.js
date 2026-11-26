// Hot-day takeoff lesson (ticket 0226): shortTakeoff.js's hot day: the scenario air, POH Fig. 5-6, the words, the climb, the
// reject and the grade beside a cool day's figures.
import { describe, it, expect } from 'vitest';
import { runwayEnd } from '../../src/airports.js';
import { DRILL_TEXT, TOUCH_WORDS, coachText } from '../../src/coach.js';
import { densityAltitudeFt, thinAir } from '../../src/atmosphere.js';
import { missionByKey } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import {
  createShortTakeoff, shortTakeoffStep, shortTakeoffTarget, gradeShortTakeoff, pohTakeoff, pohClimbFpm, rejectCall, hotWx, shortTakeoffSimStep,
  CLIMB, FLAPS, OBSTACLE_FT, DONE_FT, HOT_DONE_FT, HOT_C, COOL_C, FAIL_CAP, REJECT_SCORE, REJECT_MARGIN, REJECT_LOF_KTS, FLAPS_UP_KTS,
  HOT_TAKEOFF_KEY,
} from '../../src/shortTakeoff.js';
import { M_TO_FT } from '../../src/constants.js';

const E16 = runwayEnd('KADS', '16');
const HOT = pohTakeoff(E16.elevFt, 29.92, HOT_C);
const base = (o = {}) => ({ brakes: false, throttle: 1, flapsIndex: FLAPS, onGround: true, wheelFt: 0, iasKts: 0, gsKts: 0, alongM: 0, leftM: 2000,
  crossM: 0, halfWidthM: 15, pitchDeg: 0, tailOn: false, poh: HOT, kid: false, ...o });
const ftM = (ft) => ft / M_TO_FT;

// A whole hot-day lesson: the roll, the lift-off, 50 ft, flaps up, then 200 to 400 ft in climbS at climbKts.
function lesson({ rollFt = 1200, obstFt = 2040, liftKts = 52, obstKts = 56, climbS = 20, climbKts = 74, kid = false } = {}) {
  const st = createShortTakeoff(E16, true);
  shortTakeoffStep(st, base({ brakes: true }), 1);
  shortTakeoffStep(st, base(), 0.1);
  for (let k = 10; k < liftKts; k += 5) shortTakeoffStep(st, base({ iasKts: k, gsKts: k, alongM: ftM(rollFt) * k / liftKts, pitchDeg: k >= 45 ? 10 : 0 }), 1);
  shortTakeoffStep(st, base({ onGround: false, wheelFt: 6, iasKts: liftKts, gsKts: liftKts, alongM: ftM(rollFt), pitchDeg: 10 }), 0.5);
  shortTakeoffStep(st, base({ onGround: false, wheelFt: OBSTACLE_FT, iasKts: obstKts, gsKts: obstKts, alongM: ftM(obstFt) }), 1);
  expect(shortTakeoffStep(st, base({ onGround: false, wheelFt: DONE_FT, iasKts: climbKts, alongM: ftM(obstFt + 2000) }), 1)).toBe(''); // the hot day goes on to 400 ft
  shortTakeoffStep(st, base({ onGround: false, wheelFt: 300, iasKts: climbKts }), climbS / 2);
  expect(shortTakeoffStep(st, base({ onGround: false, wheelFt: HOT_DONE_FT, iasKts: climbKts }), climbS / 2)).toBe('done');
  return { st, r: gradeShortTakeoff(st, kid) };
}

describe('hot-day takeoff (0226): the scenario air', () => {
  it('is a Drills mission at Addison 16 on the short-field lesson, hot; deep-linkable, not "fly from Addison"', () => {
    expect(missionByKey(HOT_TAKEOFF_KEY)).toMatchObject({ kind: 'takeoff', airport: 'KADS', rwy: '16', aircraft: 'c172', flaps: FLAPS, fullLength: true, shortTakeoff: true, hot: true, group: 'drills' });
    expect(missionFromLink(`?mission=${HOT_TAKEOFF_KEY}`)).toBe(HOT_TAKEOFF_KEY);
    expect(missionFromLink('?airport=KADS')).toBe('kads_16_final');
    expect(missionByKey('kads_16_short_field_takeoff').hot).toBeUndefined();
  });
  it('a labelled scenario (never live): 38 °C, 29.92, calm; density altitude ~3,500 ft, thin air', () => {
    const wx = hotWx(E16);
    expect(wx).toMatchObject({ live: false, tempC: 38, altimInHg: 29.92, windKts: 0, icao: 'KADS' });
    expect(wx.raw).toMatch(/^SCENARIO KADS 00000KT .* 38\/16 A2992$/);
    const st = createShortTakeoff(E16, true);
    expect(st.wx).toEqual(wx);
    expect(st.daFt).toBeCloseTo(densityAltitudeFt(E16.elevFt, 29.92, 38), 6);
    expect(st.daFt).toBeGreaterThan(3400); expect(st.daFt).toBeLessThan(3600);
    expect(st.daFt - E16.elevFt).toBeGreaterThan(2800); // ~2,880 ft above the field (the ticket's "> 4,000" needs ~47 °C)
    expect(thinAir(st.daFt, E16.elevFt)).toBe(true);
    expect(createShortTakeoff(E16).wx).toBeNull(); // the short-field lesson flies today's air
  });
  it('POH Fig. 5-6 at its own points and between them; the hot day climbs ~11% less than a cool one at Addison', () => {
    expect(pohClimbFpm(0, 29.92, 20)).toBe(710);
    expect(pohClimbFpm(2000, 29.92, 40)).toBe(560);
    expect(pohClimbFpm(10000, 29.92, -20)).toBe(CLIMB[5][0]);
    expect(pohClimbFpm(0, 29.92, 15)).toBeCloseTo(728.75, 6); // the c172 card's 729
    expect(pohClimbFpm(1000, 29.92, 30)).toBeCloseTo((710 + 645 + 625 + 560) / 4, 6);
    const hot = pohClimbFpm(E16.elevFt, 29.92, HOT_C), cool = pohClimbFpm(E16.elevFt, 29.92, COOL_C);
    expect(hot).toBeCloseTo(625, 0); expect(cool).toBeCloseTo(701, 0);
    expect(hot / cool).toBeGreaterThan(0.85); expect(hot / cool).toBeLessThan(0.92);
  });
});

describe('hot-day takeoff (0226): the coach', () => {
  it('the density altitude and the handbook roll before the brakes come off; the same speeds', () => {
    const st = createShortTakeoff(E16, true);
    expect(shortTakeoffTarget(st, base({ brakes: true, flapsIndex: 0, throttle: 0 }))).toBe('htoFlaps');
    expect(shortTakeoffTarget(st, base({ brakes: true, throttle: 0 }))).toBe('htoPower');
    expect(shortTakeoffTarget(st, base({ brakes: true }))).toBe('htoRelease');
    expect(shortTakeoffTarget(st, base({ brakes: true, kid: true }))).toBe('htoKidPower');
    expect(DRILL_TEXT.htoFlaps).toBe('Hot day (scenario 38 °C): density altitude 3,500 ft. Flaps 10°: press F');
    expect(DRILL_TEXT.htoPower).toBe('Scenario 38 °C, density altitude 3,500 ft: the handbook roll is 1,202 ft, not 1,017. Hold Shift: full power');
    expect(coachText('htoPower', { touch: true })).toMatch(/1,202 ft, not 1,017\. Throttle to the top$/);
    expect(DRILL_TEXT.htoRelease).toMatch(/The same 45 knots, a longer roll \(1,202 ft\)\. Let the brakes go \(B\)/);
    expect(TOUCH_WORDS.htoRelease).toMatch(/Tap BRAKES/);
    // The short-field lesson keeps its own words.
    expect(shortTakeoffTarget(createShortTakeoff(E16), base({ brakes: true }))).toBe('stoRelease');
    // The roll and the rotation are the short-field lesson's: 45 knots, as on a cool day.
    shortTakeoffStep(st, base(), 0.1);
    expect(shortTakeoffTarget(st, base({ iasKts: 30, gsKts: 30 }))).toBe('stoRoll');
    expect(shortTakeoffTarget(st, base({ iasKts: 46, gsKts: 46 }))).toBe('stoRotate');
  });
  it(`flaps up above ${FLAPS_UP_KTS} knots past 50 ft (POH step 8), then the hot climb; the lever comes up a notch then`, () => {
    const st = createShortTakeoff(E16, true);
    shortTakeoffStep(st, base(), 0.1);
    shortTakeoffStep(st, base({ onGround: false, wheelFt: 10, iasKts: 52, gsKts: 52, alongM: 400 }), 0.1);
    shortTakeoffStep(st, base({ onGround: false, wheelFt: 55, iasKts: 57, alongM: 600 }), 0.1);
    expect(st.flapsUp).toBeFalsy();
    expect(shortTakeoffTarget(st, base({ onGround: false, wheelFt: 55, iasKts: 57, vsFpm: 600, pitchDeg: 12 }))).toBe('stoClear');
    // Not climbing, or the nose already low: hold it and let the speed build; sinking: nose up (first-timer panel).
    expect(shortTakeoffTarget(st, base({ onGround: false, wheelFt: 55, iasKts: 57, vsFpm: 100, pitchDeg: 12 }))).toBe('htoBuild');
    expect(shortTakeoffTarget(st, base({ onGround: false, wheelFt: 55, iasKts: 57, vsFpm: 600, pitchDeg: 5 }))).toBe('htoBuild');
    expect(shortTakeoffTarget(st, base({ onGround: false, wheelFt: 120, iasKts: 83, vsFpm: -400 }))).toBe('htoSink');
    expect(TOUCH_WORDS.htoSink).toMatch(/Stick up a touch \(nose up\)/);
    expect(shortTakeoffTarget(st, base({ onGround: false, wheelFt: 120, iasKts: 83, vsFpm: 300, flapsIndex: 0 }))).toBe('htoFast');
    expect(shortTakeoffTarget(st, base({ onGround: false, wheelFt: 120, iasKts: 73, vsFpm: 600, flapsIndex: 0 }))).toBe('htoGood');
    // Back on the runway after the lift-off: not the roll's "45 knots" words.
    expect(shortTakeoffTarget(st, base({ iasKts: 80, gsKts: 80 }))).toBe('htoSettle');
    shortTakeoffStep(st, base({ onGround: false, wheelFt: 90, iasKts: 61 }), 0.1);
    expect(st.flapsUp).toBe(true);
    expect(shortTakeoffTarget(st, base({ onGround: false, wheelFt: 90, iasKts: 61 }))).toBe('htoFlapsUp');
    expect(DRILL_TEXT.htoFlapsUp).toBe('Above 60 knots: flaps up, press F. Climb at 74');
    expect(shortTakeoffTarget(st, base({ onGround: false, wheelFt: 120, iasKts: 66, flapsIndex: 0, vsFpm: 600, pitchDeg: 12 }))).toBe('stoClear');
    expect(shortTakeoffTarget(st, base({ onGround: false, wheelFt: 250, iasKts: 74, flapsIndex: 0, vsFpm: 600 }))).toBe('htoClimb');
    expect(shortTakeoffTarget(st, base({ onGround: false, wheelFt: 250, iasKts: 74, kid: true }))).toBe('htoKidClimb');
    // The card: the lever's flaps-up direction ends with the lesson (a landing after KEEP FLYING needs F to lower them).
    shortTakeoffStep(st, base({ onGround: false, wheelFt: DONE_FT, iasKts: 74, flapsIndex: 0 }), 0.1);
    expect(shortTakeoffStep(st, base({ onGround: false, wheelFt: HOT_DONE_FT, iasKts: 74, flapsIndex: 0 }), 20)).toBe('done');
    expect(st.flapsUp).toBe(false);
  });
});

describe('hot-day takeoff (0226): the grade', () => {
  it('the handbook pilot: A or better; the roll, 50 ft and climb shown beside a cool day\'s; the scenario said', () => {
    const { st, r } = lesson();
    expect(st.climbFpm).toBeCloseTo(600, 6);
    expect(r.title).toBe('Hot-day takeoff');
    expect(r.score).toBeGreaterThanOrEqual(85);
    const f = Object.fromEntries(r.factors.map((x) => [x.key, x]));
    expect(f.roll.value).toBe('1,200 ft (handbook 1,202; 15 °C: 1,017)');
    expect(f.obstacle.value).toBe('2,040 ft (handbook 2,037; 15 °C: 1,729)');
    expect(f.climb.value).toBe('600 fpm at 74 kt (handbook 625; 15 °C: 701)');
    expect(f.climb.score).toBe(100);
    expect(r.note).toMatch(/^Scenario day: 38 °C, 29\.92, calm, density altitude 3,500 ft at Addison\..*a weaker climb/);
    // The short-field lesson's card has no cool-day column and no climb.
    const sf = createShortTakeoff(E16);
    expect(gradeShortTakeoff(sf).factors.map((x) => x.key)).not.toContain('climb');
  });
  it('50 ft past the hot table x 1.15 caps B; a weak climb scores low; a climb off Vy is named and held to 60', () => {
    expect(lesson({ obstFt: 2037 * 1.2 }).r.score).toBeLessThanOrEqual(84);
    const weak = lesson({ climbS: 200 / 400 * 60 }); // 400 fpm
    expect(weak.r.factors.find((x) => x.key === 'climb').score).toBeLessThan(50);
    const slow = lesson({ climbKts: 60, climbS: 18 });
    expect(slow.r.factors.find((x) => x.key === 'climb').score).toBe(60);
    expect(slow.r.reason).toMatch(/Climb at 74 knots: the hot day's best rate is only 625 fpm/);
  });
  it('Kid: the roll and the obstacle only', () => {
    expect(lesson({ kid: true }).r.factors.map((x) => x.key)).toEqual(['roll', 'obstacle']);
  });
  it('never to 400 ft says 400', () => {
    const st = createShortTakeoff(E16, true);
    st.why = 'noclimb'; st.liftKts = 52; st.rollM = 400;
    expect(gradeShortTakeoff(st).reason).toMatch(/Never climbed to 400 ft/);
  });
});

describe('hot-day takeoff (0226): the reject', () => {
  it('rejectCall: the runway to the lift-off speed at the acceleration it had, against the runway left', () => {
    // 30 kt over the ground, IAS 28 (thin air), 2 kt/s and no low-speed sample: the constant acceleration's (v² - u²) / 2a.
    const c = rejectCall(30, 28, 2, 1000);
    const v = REJECT_LOF_KTS * 30 / 28;
    expect(c.needM).toBeCloseTo(0.514444 * (v * v - 900) / 4, 6);
    expect(c.warranted).toBe(false);
    expect(rejectCall(30, 28, 2, c.needM / REJECT_MARGIN - 1).warranted).toBe(true);
    expect(rejectCall(30, 28, 0, 5000)).toMatchObject({ needM: Infinity, warranted: true }); // not accelerating
    // Falling from 2.3 kt/s at 15 kt to 2 at 30: a = A - B v², B = 0.3/675; ∫ v dv / a = ln(a(30) / a(vLof)) / 2B.
    const f = rejectCall(30, 28, 2, 1000, { kts: 15, accelKps: 2.3 });
    const B = 0.3 / 675, aLof = 2 - B * (v * v - 900);
    expect(f.needM).toBeCloseTo(0.514444 * Math.log(2 / aLof) / (2 * B), 6);
    expect(f.needM).toBeGreaterThan(c.needM); // the fall costs runway
    // Never reaching the lift-off speed at that rate of fall: Infinity, the right call.
    // A fit that would never reach it is floored at FIT_FLOOR of the measured acceleration (first-timer panel: a sawtooth
    // sample read Infinity, "the right call", on a normal roll): finite, and only a roll that stopped gaining is Infinity.
    const floored = rejectCall(30, 28, 0.5, 1e6, { kts: 15, accelKps: 3 });
    expect(Number.isFinite(floored.needM)).toBe(true);
    expect(floored.needM).toBeGreaterThan(rejectCall(30, 28, 0.5, 1e6).needM);
    expect(rejectCall(30, 28, 0.04, 1e6, { kts: 15, accelKps: 3 })).toMatchObject({ needM: Infinity, warranted: true });
    expect(rejectCall(60, 56, 1, 10).needM).toBe(0); // already past the lift-off speed
  });
  // Pulled to idle at speed on a strip the roll wouldn't have made, then stopped: graded A for the decision.
  function rejected(leftM, accel) {
    const st = createShortTakeoff(E16, true);
    shortTakeoffStep(st, base({ brakes: true }), 1);
    shortTakeoffStep(st, base({ throttle: 0.6 }), 0.1);
    for (let t = 0; t <= 15; t++) shortTakeoffStep(st, base({ throttle: 0.6, iasKts: 2 + accel * t, gsKts: 2 + accel * t, alongM: accel * t * t, leftM: leftM - accel * t * t }), 1);
    shortTakeoffStep(st, base({ throttle: 0, brakes: true, iasKts: 2 + accel * 15, gsKts: 2 + accel * 15, alongM: 300, leftM: leftM - 300 }), 0.1);
    for (let k = 2 + accel * 15; k > 0; k -= 6) shortTakeoffStep(st, base({ throttle: 0, brakes: true, iasKts: Math.max(0, k), gsKts: Math.max(0, k), alongM: 320, leftM: leftM - 320 }), 1);
    expect(shortTakeoffStep(st, base({ throttle: 0, brakes: true, alongM: 330, leftM: leftM - 330 }), 1)).toBe('done');
    return { st, r: gradeShortTakeoff(st) };
  }
  it('a reject on a roll that would not have made the end: the right call, A', () => {
    const { st, r } = rejected(500, 1);
    expect(st.why).toBe('stopped');
    expect(st.reject.warranted).toBe(true);
    expect(st.accelKps).toBeCloseTo(1, 1);
    expect(r.score).toBe(REJECT_SCORE);
    expect(r.grade).toBe('A');
    expect(r.title).toBe('Hot-day takeoff: rejected');
    expect(r.reason).toMatch(/^Right call: at 17 knots it still needed about [\d,]+ ft to lift off, and [\d,]+ ft were left/);
  });
  it('a reject on a roll that would have flown: a needless stop, D, with the estimate', () => {
    const { st, r } = rejected(5000, 1);
    expect(st.reject.warranted).toBe(false);
    expect(r.score).toBeLessThanOrEqual(FAIL_CAP);
    expect(r.title).toBe('Hot-day takeoff failed');
    expect(r.reason).toMatch(/^Stopped a takeoff that would have flown/);
  });
  // Physics panel: the throttle eased down (the keys move it 0.4/s) with the brakes on must not count as the roll's acceleration.
  it('a needless reject with the throttle ramped down and the brakes on is still needless (the roll\'s acceleration is kept)', () => {
    const st = createShortTakeoff(E16, true);
    shortTakeoffStep(st, base({ brakes: true }), 1);
    shortTakeoffStep(st, base(), 0.1);
    let v = 2, x = 0;
    for (let t = 0; t < 14; t += 0.1) { shortTakeoffStep(st, base({ iasKts: v, gsKts: v, alongM: x, leftM: 2000 - x }), 0.1); x += v * 0.0514; v += 0.25; }
    for (let thr = 1; thr > 0; thr -= 0.04) { v -= 0.2; shortTakeoffStep(st, base({ brakes: true, throttle: thr, iasKts: v, gsKts: v, alongM: x, leftM: 2000 - x }), 0.1); }
    expect(st.reject.warranted).toBe(false);
    expect(st.reject.kts).toBeCloseTo(37, 0);
    expect(st.accelKps).toBeCloseTo(2.5, 1);
  });
  it('a roll that never had half power is a stop, not a judged reject', () => {
    const st = createShortTakeoff(E16, true);
    shortTakeoffStep(st, base({ brakes: true, throttle: 0.45 }), 1);
    shortTakeoffStep(st, base({ throttle: 0.45 }), 0.1);
    for (let k = 2; k < 40; k++) shortTakeoffStep(st, base({ throttle: 0.45, iasKts: k, gsKts: k, alongM: k * 5 }), 1);
    expect(st.reject).toBeNull();
    shortTakeoffStep(st, base({ throttle: 0, iasKts: 30, gsKts: 30, alongM: 300 }), 1);
    expect(st.reject).toBeNull();
  });
  it('power changed mid-roll: the low-speed sample of the other power is not fitted', () => {
    const st = createShortTakeoff(E16, true);
    shortTakeoffStep(st, base(), 0.1);
    for (let k = 2; k < 20; k++) shortTakeoffStep(st, base({ iasKts: k, gsKts: k, alongM: k * 5 }), 1);
    expect(st.low.thr).toBe(1);
    for (let k = 20; k < 30; k++) shortTakeoffStep(st, base({ throttle: 0.6, iasKts: k, gsKts: k, alongM: k * 5 }), 1);
    shortTakeoffStep(st, base({ throttle: 0, iasKts: 30, gsKts: 30, alongM: 160 }), 1);
    expect(st.cut.thr).toBe(1);
    expect(st.reject).not.toBeNull();
  });
  it('the short-field lesson never judges a reject', () => {
    const st = createShortTakeoff(E16);
    shortTakeoffStep(st, base(), 0.1);
    shortTakeoffStep(st, base({ iasKts: 30, gsKts: 30, alongM: 100 }), 1);
    shortTakeoffStep(st, base({ throttle: 0, iasKts: 30, gsKts: 30, alongM: 110 }), 1);
    expect(st.reject).toBeNull();
  });
});

// First-timer panel: flightModel.js rounds sim.gsKts to whole knots; differentiated per frame the acceleration was a
// sawtooth and a normal reject at 20-30 kt read Infinity ("Right call", A). The chunk reads the unrounded velocity.
describe('hot-day takeoff (0226) against the sim: the speed the reject reads', () => {
  const r = E16.hdgT * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r);
  function roll(rejectKts) {
    const st = createShortTakeoff(E16, true);
    const sim = { pos: { x: E16.thrX, y: 0, z: E16.thrZ }, vel: { x: 0, y: 0, z: 0 }, angVel: { x: 0, y: 0, z: 0 }, groundY: 0, spec: { gearHeight: 1 },
      onGround: true, iasKts: 0, gsKts: 0, throttle: 1, flapsIndex: FLAPS, brakesOn: false, assist: 'pilot', wheelLoads: [1, 1, 1, 0], wx: hotWx(E16) };
    let v = 0; // m/s, falling acceleration like the airplane's: 1.2 m/s² less 0.0002 v²
    for (let t = 0; t < 60 && st.phase !== 'done'; t += 1 / 60) {
      const kts = v / 0.514444;
      if (kts >= rejectKts) { sim.throttle = 0; sim.brakesOn = true; }
      const a = sim.throttle ? 1.2 - 0.0002 * v * v : -3;
      v = Math.max(0, v + a / 60);
      sim.vel.x = v * dx; sim.vel.z = v * dz; sim.pos.x += sim.vel.x / 60; sim.pos.z += sim.vel.z / 60;
      sim.iasKts = v / 0.514444 * 0.95; sim.gsKts = Math.round(v / 0.514444);
      shortTakeoffSimStep(st, sim, 0, 1 / 60);
    }
    return st;
  }
  for (const k of [20, 25, 30, 40]) it(`a normal full-power roll rejected at ${k} kt is needless (D), with a finite estimate`, () => {
    const st = roll(k);
    expect(st.why).toBe('stopped');
    expect(st.reject.warranted).toBe(false);
    expect(Number.isFinite(st.reject.needM)).toBe(true);
    expect(gradeShortTakeoff(st).score).toBeLessThanOrEqual(FAIL_CAP);
  });
  it('Kid: "a bit more" when the nose stays low past 50 kt on the roll', () => {
    const st = createShortTakeoff(E16, true);
    shortTakeoffStep(st, base({ kid: true }), 0.1);
    expect(shortTakeoffTarget(st, base({ kid: true, iasKts: 52, gsKts: 52, pitchDeg: 3 }))).toBe('htoKidMore');
    expect(shortTakeoffTarget(st, base({ kid: true, iasKts: 52, gsKts: 52, pitchDeg: 9 }))).toBe('stoKidRotate');
    expect(TOUCH_WORDS.htoKidMore).toMatch(/stick up/);
  });
});
