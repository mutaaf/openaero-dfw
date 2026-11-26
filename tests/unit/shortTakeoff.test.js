// Short-field takeoff lesson (ticket 0225): shortTakeoff.js's POH table, step, coach and grade.
import { describe, it, expect } from 'vitest';
import { runwayEnd } from '../../src/airports.js';
import { DRILL_TEXT, TOUCH_WORDS, coachText } from '../../src/coach.js';
import {
  pohTakeoff, headwindKts, TABLE, createShortTakeoff, shortTakeoffStep, shortTakeoffTarget, gradeShortTakeoff, shortTakeoffDone,
  shortTakeoffSimStep, shortTakeoffPrompt, FLAPS, ROTATE_KTS, OBSTACLE_FT, DONE_FT, CAP_B, CAP_C, FAIL_CAP, GIVE_UP_S, FULL_POWER,
} from '../../src/shortTakeoff.js';
import { M_TO_FT } from '../../src/constants.js';

const E16 = runwayEnd('KADS', '16');
const POH = pohTakeoff(0);
const base = (o = {}) => ({ brakes: false, throttle: 1, flapsIndex: FLAPS, onGround: true, wheelFt: 0, iasKts: 0, gsKts: 0, alongM: 0, leftM: 2000,
  crossM: 0, halfWidthM: 15, pitchDeg: 0, tailOn: false, poh: POH, kid: false, ...o });
const ftM = (ft) => ft / M_TO_FT;

// A whole lesson in a few steps: the brakes held, released, a roll to rollFt (the nose up at rotateKts), the lift-off at
// liftKts, 50 ft at obstFt at obstKts, then 200 ft.
function lesson({ rollFt = 960, obstFt = 1633, liftKts = 52, obstKts = 56, rotateKts = 45, flaps = FLAPS, releaseThrottle = 1, crossM = 1, settle = false, kid = false } = {}) {
  const st = createShortTakeoff(E16);
  expect(shortTakeoffStep(st, base({ brakes: true, throttle: releaseThrottle }), 1)).toBe('');
  expect(st.phase).toBe('hold');
  shortTakeoffStep(st, base({ throttle: releaseThrottle, flapsIndex: flaps }), 0.1);
  expect(st.phase).toBe('roll');
  for (let k = 10; k < liftKts; k += 5) {
    shortTakeoffStep(st, base({ iasKts: k, gsKts: k, flapsIndex: flaps, alongM: ftM(rollFt) * k / liftKts, crossM, pitchDeg: k >= rotateKts ? 10 : 0 }), 1);
  }
  shortTakeoffStep(st, base({ onGround: false, wheelFt: 6, iasKts: liftKts, gsKts: liftKts, flapsIndex: flaps, alongM: ftM(rollFt), pitchDeg: 10 }), 0.5);
  if (settle) shortTakeoffStep(st, base({ iasKts: liftKts, gsKts: liftKts, alongM: ftM(rollFt + 50) }), 0.5);
  shortTakeoffStep(st, base({ onGround: false, wheelFt: 25, iasKts: obstKts, gsKts: obstKts, alongM: ftM((rollFt + obstFt) / 2) }), 1);
  shortTakeoffStep(st, base({ onGround: false, wheelFt: OBSTACLE_FT, iasKts: obstKts, gsKts: obstKts, alongM: ftM(obstFt) }), 1);
  expect(shortTakeoffStep(st, base({ onGround: false, wheelFt: DONE_FT, iasKts: 74, alongM: ftM(obstFt + 2000) }), 1)).toBe('done');
  return { st, r: gradeShortTakeoff(st, kid) };
}

describe('shortTakeoff.js POH Fig. 5-5 table (0225)', () => {
  it('reads the table at its own points and interpolates between them (sea level 15 °C: the c172 card\'s 960 / 1,633 ft)', () => {
    expect(pohTakeoff(0, 29.92, 0)).toEqual({ rollFt: 860, totalFt: 1465, headKts: 0, offChart: false });
    expect(pohTakeoff(8000, 29.92, 40)).toEqual({ rollFt: 2450, totalFt: 4615, headKts: 0, offChart: false });
    expect(pohTakeoff(3000, 29.92, 20)).toEqual({ rollFt: TABLE[3][2][0], totalFt: TABLE[3][2][1], headKts: 0, offChart: false });
    expect(POH.rollFt).toBeCloseTo(960, 6);
    expect(POH.totalFt).toBeCloseTo(1632.5, 6);
    // Addison (633 ft), 29.92, 15 °C: between the sea-level and 1,000 ft rows.
    const ads = pohTakeoff(E16.elevFt);
    expect(ads.rollFt).toBeGreaterThan(960); expect(ads.rollFt).toBeLessThan(1050);
  });
  it('pressure altitude from the altimeter setting; clamped off the table; note 3 wind', () => {
    expect(pohTakeoff(0, 28.92, 10).rollFt).toBeCloseTo(1010, 6); // 1 inHg low = 1,000 ft of pressure altitude
    expect(pohTakeoff(-500, 31, -20)).toEqual(pohTakeoff(0, 29.92, 0));
    // The card says the wind it counted.
    const st = createShortTakeoff(E16);
    st.poh = pohTakeoff(633, 29.92, 18, -10);
    expect(gradeShortTakeoff(st).note).toMatch(/a 10 kt tailwind counted as its note 3 says/);
    st.poh = pohTakeoff(633);
    expect(gradeShortTakeoff(st).note).not.toMatch(/wind/);
    // Past the chart's 10 kt of tailwind: said, and the x 1.15 cap is off (the figure is short of the truth).
    const far = { ...lesson({ obstFt: 2000 }).st, poh: pohTakeoff(0, 29.92, 15, -20) };
    expect(far.poh.offChart).toBe(true);
    const g = gradeShortTakeoff(far);
    expect(g.note).toMatch(/past the chart's 10 kt/);
    expect(g.reason ?? '').not.toMatch(/past the handbook's/);
    expect(pohTakeoff(0, 29.92, 0, 9).rollFt).toBeCloseTo(860 * 0.9, 6);
    expect(pohTakeoff(0, 29.92, 0, -2).totalFt).toBeCloseTo(1465 * 1.1, 6);
    expect(pohTakeoff(0, 29.92, 0, -20).rollFt).toBeCloseTo(860 * 1.5, 6); // held at the chart's 10 kt
    expect(headwindKts({ windKts: 10, windDirDeg: 160 }, 160)).toBeCloseTo(10, 6);
    expect(headwindKts({ windKts: 10, windDirDeg: null }, 160)).toBe(0);
  });
});

describe('shortTakeoff.js step and grade (0225)', () => {
  it('the POH lesson on the table\'s numbers grades S with no reason', () => {
    const { st, r } = lesson();
    expect(shortTakeoffDone(st)).toBe(true);
    expect(r.kind).toBe('shortTakeoff');
    expect(r.grade).toBe('S');
    expect(r.reason).toBeNull();
    expect(r.factors.map((f) => f.key)).toEqual(['roll', 'obstacle', 'liftoff', 'rotate', 'speed', 'line']);
    expect(r.factors[0].value).toBe('960 ft (handbook 960)');
    expect(r.factors[1].value).toBe('1,633 ft (handbook 1,633)');
    expect(r.note).toMatch(/Fig\. 5-5/);
  });
  it('the distances run from where the brakes came off, not from the spawn', () => {
    const st = createShortTakeoff(E16);
    shortTakeoffStep(st, base({ brakes: true, alongM: -300 }), 1);
    shortTakeoffStep(st, base({ alongM: -299 }), 0.1);
    expect(st.startAlongM).toBe(-299);
    expect(st.poh).toBe(POH);
  });
  it('50 ft later than the table x 1.15 caps B and says by how much; x 1.1 does not', () => {
    const late = lesson({ obstFt: 1633 * 1.2 }).r;
    expect(late.score).toBeLessThanOrEqual(CAP_B);
    expect(late.reason).toMatch(/past the handbook's 1,633 ft/);
    expect(lesson({ obstFt: 1633 * 1.1 }).r.score).toBeGreaterThan(CAP_B);
  });
  it('flaps up at the lift-off caps B, named; the nose up 10 kt early caps B, named; Kid is not capped for either', () => {
    const up = lesson({ flaps: 0 }).r;
    expect(up.score).toBeLessThanOrEqual(CAP_B);
    expect(up.reason).toMatch(/Flaps 0° at the lift-off/);
    const early = lesson({ rotateKts: ROTATE_KTS - 10 }).r;
    expect(early.score).toBeLessThanOrEqual(CAP_B);
    expect(early.reason).toMatch(/Nose up too early/);
    const kid = lesson({ flaps: 0, rotateKts: 30, kid: true }).r;
    expect(kid.score).toBeGreaterThan(CAP_B);
    expect(kid.factors.map((f) => f.key)).toEqual(['roll', 'obstacle']);
    expect(kid.note).toMatch(/Kid level/);
  });
  it('a slow lift-off and a slow 50 ft are named; letting the brakes go before full power is named, not capped', () => {
    const slow = lesson({ liftKts: 46, obstKts: 50 }).r;
    expect(slow.reason).toMatch(/Lifted off too slow/);
    expect(slow.factors.find((f) => f.key === 'speed').score).toBeLessThan(50);
    const idle = lesson({ releaseThrottle: 0.2 }).r;
    expect(idle.reason).toMatch(/Full power on the brakes first/);
    expect(idle.score).toBeGreaterThan(CAP_B);
  });
  it('a settle back onto the runway caps C; an overrun, a run-off or a stop caps D', () => {
    expect(lesson({ settle: true }).r.score).toBeLessThanOrEqual(CAP_C);
    const run = (s) => { const st = createShortTakeoff(E16); shortTakeoffStep(st, base({ brakes: true }), 1); shortTakeoffStep(st, base({ iasKts: 20, gsKts: 20 }), 1); expect(shortTakeoffStep(st, base(s), 1)).toBe('done'); return gradeShortTakeoff(st); };
    expect(run({ iasKts: 40, gsKts: 40, leftM: -1 }).reason).toMatch(/Ran out of runway/);
    expect(run({ iasKts: 40, gsKts: 40, crossM: 19 }).reason).toMatch(/off the side/);
    const stop = run({ throttle: 0, iasKts: 1, gsKts: 1 });
    expect(stop.reason).toMatch(/Never got airborne/);
    expect(stop.score).toBeLessThanOrEqual(FAIL_CAP);
    expect(stop.title).toBe('Short-field takeoff failed');
    // No give-up clock on the brakes; once rolling it runs.
    const st = createShortTakeoff(E16);
    for (let i = 0; i < 5; i++) shortTakeoffStep(st, base({ brakes: true }), GIVE_UP_S);
    expect(st.phase).toBe('hold');
  });
  it('a hop that settles under 5 ft is not the lift-off: the roll and its speed come from the last time the wheels left', () => {
    const st = createShortTakeoff(E16);
    shortTakeoffStep(st, base({ brakes: true }), 1);
    shortTakeoffStep(st, base({ iasKts: 30, gsKts: 30, alongM: 100 }), 1);
    shortTakeoffStep(st, base({ onGround: false, wheelFt: 0.3, iasKts: 48, alongM: 200 }), 0.1);
    shortTakeoffStep(st, base({ iasKts: 49, gsKts: 49, alongM: 210 }), 0.1);
    shortTakeoffStep(st, base({ onGround: false, wheelFt: 3, iasKts: 52, alongM: 250 }), 0.1);
    expect(st.phase).toBe('roll'); // "Flying!" waits for 5 ft
    shortTakeoffStep(st, base({ onGround: false, wheelFt: 6, iasKts: 53, alongM: 260 }), 0.1);
    expect(st.phase).toBe('air');
    expect(st.liftKts).toBe(52);
    expect(st.rollM).toBe(150); // from the release at 100 m
  });
});

describe('shortTakeoff.js first-timer panel (0225)', () => {
  it('the brakes on again mid-roll: the coach says so, and a stop at full power on them ends it in 10 s, not 150', () => {
    const st = createShortTakeoff(E16);
    shortTakeoffStep(st, base({ brakes: true }), 1);
    shortTakeoffStep(st, base({ iasKts: 30, gsKts: 30 }), 1);
    expect(shortTakeoffTarget(st, base({ brakes: true, iasKts: 20, gsKts: 20 }))).toBe('stoBrakesOff');
    expect(TOUCH_WORDS.stoBrakesOff).toMatch(/tap BRAKES/);
    let r = '';
    for (let i = 0; i < 12 && !r; i++) r = shortTakeoffStep(st, base({ brakes: true, iasKts: 0, gsKts: 0 }), 1);
    expect(r).toBe('done');
    expect(st.t).toBeLessThan(20);
    expect(gradeShortTakeoff(st).reason).toMatch(/Never got airborne/);
  });
  it('lifted off, settled back and stopped is named as that, not "never airborne"', () => {
    const st = createShortTakeoff(E16);
    shortTakeoffStep(st, base({ brakes: true }), 1);
    shortTakeoffStep(st, base({ iasKts: 30, gsKts: 30 }), 1);
    shortTakeoffStep(st, base({ onGround: false, wheelFt: 6, iasKts: 49, gsKts: 49, alongM: 250 }), 1);
    shortTakeoffStep(st, base({ iasKts: 30, gsKts: 30, alongM: 300 }), 1);
    expect(shortTakeoffStep(st, base({ iasKts: 1, gsKts: 1, alongM: 400 }), 1)).toBe('done');
    expect(gradeShortTakeoff(st).reason).toMatch(/settled back and stopped/);
  });
  it('the ease call comes ahead of a nose rising fast; flaps 20 at the lift-off is worded as more flap', () => {
    const st = createShortTakeoff(E16);
    shortTakeoffStep(st, base({ brakes: true }), 1);
    shortTakeoffStep(st, base({ iasKts: 46, gsKts: 46 }), 1);
    expect(shortTakeoffTarget(st, base({ iasKts: 47, pitchDeg: 9, pitchRateDeg: 1 }))).toBe('stoHold');
    expect(shortTakeoffTarget(st, base({ iasKts: 47, pitchDeg: 9, pitchRateDeg: 20 }))).toBe('stoEase');
    expect(lesson({ flaps: 2 }).r.reason).toMatch(/Flaps 20° at the lift-off.*more flap is more drag/);
  });
  it('the tail caps Pilot at B; Learner\'s card names it uncapped', () => {
    const { st } = lesson();
    st.tail = true;
    expect(gradeShortTakeoff(st).score).toBeLessThanOrEqual(CAP_B);
    const l = gradeShortTakeoff(st, false, true);
    expect(l.score).toBeGreaterThan(CAP_B);
    expect(l.reason).toMatch(/tail touched/);
  });
});

describe('shortTakeoff.js coach (0225)', () => {
  const target = (st, o) => shortTakeoffTarget(st, base(o));
  it('on the brakes: flaps 10, then full power, then let them go; Kid is told the power only', () => {
    const st = createShortTakeoff(E16);
    expect(target(st, { brakes: true, flapsIndex: 0, throttle: 0 })).toBe('stoFlaps');
    expect(target(st, { brakes: true, throttle: 0.5 })).toBe('stoPower');
    expect(target(st, { brakes: true, throttle: FULL_POWER })).toBe('stoRelease');
    expect(target(st, { brakes: true, throttle: 0, kid: true })).toBe('stoKidPower');
  });
  it('the roll, the rotation, the tail, the obstacle speed and the climb after it', () => {
    const st = createShortTakeoff(E16);
    shortTakeoffStep(st, base({ brakes: true }), 1);
    shortTakeoffStep(st, base({ iasKts: 5, gsKts: 5 }), 1);
    expect(target(st, { iasKts: 20, throttle: 0.4 })).toBe('stoPowerRoll');
    expect(target(st, { iasKts: 30 })).toBe('stoRoll');
    expect(target(st, { iasKts: ROTATE_KTS, pitchDeg: 2 })).toBe('stoRotate');
    expect(target(st, { iasKts: ROTATE_KTS + 3, pitchDeg: 10 })).toBe('stoHold');
    expect(target(st, { iasKts: ROTATE_KTS + 3, pitchDeg: 13 })).toBe('stoEase');
    st.phase = 'air';
    expect(target(st, { onGround: false, wheelFt: 5, iasKts: 52 })).toBe('stoObstacle'); // just off, still accelerating
    expect(target(st, { onGround: false, wheelFt: 15, iasKts: 51 })).toBe('stoSlow');
    expect(target(st, { onGround: false, wheelFt: 30, iasKts: 62 })).toBe('stoFast');
    expect(target(st, { onGround: false, wheelFt: 30, iasKts: 57 })).toBe('stoObstacle');
    expect(target(st, { onGround: false, wheelFt: 30, iasKts: 57, kid: true })).toBe('stoKidClimb');
    st.obstM = 500;
    expect(target(st, { onGround: false, wheelFt: 60, iasKts: 60 })).toBe('stoClear');
  });
  it('every prompt has words on keys, and the touch ones say buttons and the stick, not keys', () => {
    const keys = Object.keys(DRILL_TEXT).filter((k) => k.startsWith('sto'));
    expect(keys.length).toBeGreaterThanOrEqual(16);
    for (const k of keys) {
      const touch = coachText(k, { touch: true });
      expect(touch).toBeTruthy();
      expect(touch).not.toMatch(/Shift|\(B\)|↑|press F/);
    }
    expect(TOUCH_WORDS.stoRelease).toMatch(/tap BRAKES/);
    expect(DRILL_TEXT.stoRelease).toMatch(/\(B\)/);
  });
});

describe('shortTakeoff.js against the sim (0225)', () => {
  const sim = (o = {}) => ({
    pos: { x: E16.thrX, y: 0, z: E16.thrZ }, angVel: { x: 0, y: 0, z: 0 }, groundY: 0, spec: { gearHeight: 1 }, onGround: true, iasKts: 0, gsKts: 0,
    throttle: 0, flapsIndex: FLAPS, brakesOn: true, assist: 'pilot', wheelLoads: [1, 1, 1, 0], wx: { altimInHg: 29.92, tempC: 15, windKts: 0 }, ...o,
  });
  it('Kid\'s brakes come off by themselves at full power; Pilot\'s stay on until the player lets them go', () => {
    const st = createShortTakeoff(E16), k = sim({ assist: 'kid', throttle: 1 });
    shortTakeoffSimStep(st, k, 0, 0.016);
    expect(k.brakesOn).toBe(false);
    expect(st.phase).toBe('roll');
    expect(st.poh.rollFt).toBeCloseTo(pohTakeoff(E16.elevFt).rollFt, 6);
    const st3 = createShortTakeoff(E16), k3 = sim({ assist: 'kid', throttle: 1 });
    shortTakeoffPrompt(st3, k3, 0);
    expect(k3.brakesOn).toBe(true); // the coach's read changes nothing
    const st2 = createShortTakeoff(E16), p = sim({ throttle: 1 });
    expect(shortTakeoffPrompt(st2, p, 0)).toBe('stoRelease');
    shortTakeoffSimStep(st2, p, 0, 0.016);
    expect(p.brakesOn).toBe(true);
    expect(st2.phase).toBe('hold');
  });
});
