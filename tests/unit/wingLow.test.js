// Wing-low crosswind landing lesson (ticket 0188, src/wingLow.js): the lesson's wind (live or scenario), which wing and
// which pedal the coach names, the first main and the grade, driven with synthetic touchdowns. Flown on both flight
// models: tests/flight/wingLow.test.js.
import { describe, it, expect } from 'vitest';
import {
  WING_LOW_KEY, FLAPS, SCENARIO_KTS, CAP_B, DONE_NOTE, SAY_S, WL_TEXT, windAcross, liveSuits, scenarioWx, createWingLow, lessonWx, firstMain,
  wingLowStep, wingLowPrompt, wingLowResult, wingLowTip,
} from '../../src/wingLow.js';
import { gradeLanding, capBounced } from '../../src/landing.js';
import { coachText, RANK } from '../../src/coach.js';
import { landingTip } from '../../src/landingTip.js';
import { runwayEnd } from '../../src/airports.js';
import { missionByKey, groupMissions, MISSIONS } from '../../src/missions.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';

const END = runwayEnd('KADS', '16'); // hdgT 160
const live = (dir, kts, gust = kts) => ({ live: true, icao: 'KADS', windDirDeg: dir, windKts: kts, gustKts: gust, altimInHg: 29.92, tempC: 15 });
const air = { onGround: false, aglFt: 200, bankRightDeg: 0, noseHdgT: 160, pitchDeg: 2, loads: [0, 0, 0] };
// A lesson in this wind, flown to a touchdown with this bank (+ right), nose (true) and wheel loads.
function touchdown(wx, { bankRightDeg = 4, noseHdgT = 160, pitchDeg = 5, loads = [0, 0, 3000], driftKts = 0 } = {}) {
  const wl = createWingLow(END);
  lessonWx(wl, wx);
  wingLowStep(wl, { ...air }, 0.1);
  wingLowStep(wl, { ...air, aglFt: 0.5, onGround: true, bankRightDeg, noseHdgT, pitchDeg, loads, driftKts }, 0.1);
  return wl;
}
const landing = ({ bankDeg = -4, pitchDeg = 5, vsFpm = -150 } = {}) => gradeLanding({ vsFpm, crossM: 0.5, pastThresholdM: 300, runwayLengthM: END.lengthM - END.displacedM,
  runwayWidthM: END.widthM, pitchDeg, bankDeg, iasKts: 60, vrefKts: 62 });

describe('the mission (0188)', () => {
  it('is the Cessna on a 2 NM final to Addison 16, flaps 10, in the picker\'s Drills', () => {
    const m = missionByKey(WING_LOW_KEY);
    expect(m).toMatchObject({ key: WING_LOW_KEY, kind: 'final', airport: 'KADS', rwy: '16', distNm: 2, aircraft: 'c172', flaps: FLAPS, wingLow: true });
    expect(AIRCRAFT_DATABASE.c172.flapDetentsDeg[FLAPS]).toBe(10); // POH p. 4-34: the minimum flaps for the field
    expect(groupMissions(MISSIONS).find((g) => g.id === 'drills').missions.map((x) => x.key)).toContain(WING_LOW_KEY);
    expect(m.blurb).toMatch(/upwind wheel first/);
  });
});

describe('the lesson\'s wind: the live METAR when it blows across, else the scenario', () => {
  it('splits a wind across and along the runway (+ from the right, + headwind)', () => {
    const r = windAcross({ windDirDeg: 250, windKts: 12 }, 160);
    expect(r.xw).toBeCloseTo(12, 6);
    expect(r.hw).toBeCloseTo(0, 6);
    const l = windAcross({ windDirDeg: 70, windKts: 10 }, 160);
    expect(l.xw).toBeCloseTo(-10, 6);
    const q = windAcross({ windDirDeg: 190, windKts: 10 }, 160); // 30° right of the nose
    expect(q.xw).toBeCloseTo(5, 6);
    expect(q.hw).toBeCloseTo(8.66, 2);
    expect(windAcross({ windDirDeg: null, windKts: 3 }, 160)).toEqual({ xw: 0, hw: 0 }); // variable: none across
  });

  it('takes a live wind 5-15 kt across with at most 2 kt of tailwind and gusts within the POH\'s 15', () => {
    expect(liveSuits(live(250, 12), 160)).toBe(true);
    expect(liveSuits(live(70, 8), 160)).toBe(true); // from the left
    expect(liveSuits(live(200, 10), 160)).toBe(true); // 6.4 across, 7.7 down the runway
    expect(liveSuits(live(170, 10), 160)).toBe(false); // 1.7 across: nothing to teach
    expect(liveSuits(live(250, 18), 160)).toBe(false); // past the demonstrated 15
    expect(liveSuits(live(250, 12, 20), 160)).toBe(false); // gusting past it
    expect(liveSuits(live(320, 10), 160)).toBe(false); // a tailwind on 16
    expect(liveSuits({ ...live(250, 12), live: false }, 160)).toBe(false); // the game's own scenario day is no METAR
    expect(liveSuits(live(250, 0), 160)).toBe(false);
    // Addison's own report only: main.js falls back to KDFW's when KADS has none, and the card would call it Addison's.
    expect(liveSuits(live(250, 12), 160, 'KADS')).toBe(true);
    expect(liveSuits({ ...live(250, 12), icao: 'KDFW' }, 160, 'KADS')).toBe(false);
  });

  it('the scenario: 12 kt from 90° right of the runway, in a METAR\'s tens, labelled scenario', () => {
    const wx = scenarioWx(END);
    expect(wx).toMatchObject({ windDirDeg: 250, windKts: SCENARIO_KTS, gustKts: SCENARIO_KTS, live: false, icao: 'KADS' });
    expect(wx.raw).toMatch(/^SCENARIO KADS 25012KT/);
    expect(wx.scripted).toBe(true); // the ATIS card: "this mission's", not "offline"
    expect(scenarioWx(runwayEnd('KADS', '34')).windDirDeg).toBe(70);
  });

  it('chooses once per report and never once the player is flying; names the wing', () => {
    const wl = createWingLow(END);
    const calm = live(160, 4);
    expect(lessonWx(wl, calm).live).toBe(false); // a calm METAR: the scenario's 12 kt from the right
    expect(wl.side).toBe('R');
    expect(wl.xwKts).toBeCloseTo(12, 1);
    const first = wl.wx;
    expect(lessonWx(wl, calm)).toBe(first); // the same report: no new object
    const left = live(80, 10);
    expect(lessonWx(wl, left)).toBe(left); // a new report that suits, before the flight starts
    expect(wl.side).toBe('L');
    wingLowStep(wl, { ...air }, 0.1); // flying
    expect(lessonWx(wl, live(250, 12))).toBe(left); // a METAR refresh mid-final keeps the wind
  });
});

describe('the coach names the wing and the pedal from the wind', () => {
  it('words', () => {
    expect(coachText('wlBriefR')).toBe('Wind from the right: lower the right wing, left rudder (Q) to hold the line');
    expect(coachText('wlBriefL')).toBe('Wind from the left: lower the left wing, right rudder (E) to hold the line');
    expect(coachText('wlBriefR', { touch: true })).toBe('Wind from the right: right wing down, tap ◀ RUD');
    expect(coachText('wlHoldR')).toBe('Hold it: keep the right wing down, right wheel first');
    expect(coachText('wlHoldR', { touch: true })).toBe('Hold it: keep the right wing down, right wheel first');
    expect(coachText('wlFlareR')).toBe('Flare: ease back, keep the right wing down');
    // Off the centreline the wing steers (wind from the right: right of the line, less right wing; left of it, more).
    expect(coachText('wlOffRR')).toBe('Right of the centreline: a little less right wing');
    expect(coachText('wlOffLR')).toBe('Left of the centreline: a little more right wing');
    expect(coachText('wlOffRL')).toBe('Right of the centreline: a little more left wing');
    expect(coachText('wlOffLL')).toBe('Left of the centreline: a little less left wing');
    expect(RANK.wlFlareR).toBe(RANK.flare);
    expect(coachText('wlNoseRR')).toBe('Nose right of the runway: left rudder (Q) to line it up, right wing down');
    expect(coachText('wlNoseLL', { touch: true })).toBe('Nose left: tap RUD ▶, left wing down');
    expect(RANK.wlHoldR).toBe(RANK.flare);
    for (const k of Object.keys(WL_TEXT)) expect(coachText(k)).toBe(WL_TEXT[k]);
  });

  it('the briefing, then the landing coach; the nose under 300 ft; the centreline in wing; the wheel at 50 ft; idle, then the flare with the wing down', () => {
    const wl = createWingLow(END);
    lessonWx(wl, live(70, 10)); // from the left
    const c = (aglFt, noseOffDeg = 0, kid = false, locDots = 0, throttle = 0) => wingLowPrompt(wl, { aglFt, noseOffDeg, kid, locDots, throttle });
    expect(c(600)).toBe(null); // not flying yet
    wingLowStep(wl, { ...air, aglFt: 600 }, 0.1);
    expect(c(600)).toBe('wlBriefL');
    expect(c(600, 0, true)).toBe('wlKidL');
    wingLowStep(wl, { ...air, aglFt: 600 }, SAY_S);
    expect(c(600)).toBe(null);
    expect(c(600, 0, true)).toBe(null);
    expect(c(600, 8)).toBe(null); // a crab high on final is the crab method's: allowed
    expect(c(250, 8)).toBe('wlNoseRL'); // under 300 ft the nose 8° right of the runway: left rudder, left wing down
    expect(c(250, -6)).toBe('wlNoseLL');
    expect(c(250, 3)).toBe(null);
    expect(c(600, 0, false, 0.8)).toBe('wlOffRL'); // right of the line in a left wind: more left wing
    expect(c(600, 0, false, -0.8)).toBe('wlOffLL');
    expect(c(600, 0, false, 0.4)).toBe(null);
    expect(c(45)).toBe('wlHoldL');
    expect(c(25, 0, false, 0, 0.3)).toBe(null); // the landing coach's idle first
    expect(c(25)).toBe('wlFlareL'); // then the lesson's flare: the wing stays down
  });
});

describe('the first main down', () => {
  it('from the wheel loads [nose, left, right]', () => {
    expect(firstMain([0, 0, 2000], 'R', 4)).toBe('upwind');
    expect(firstMain([0, 2000, 0], 'R', -1)).toBe('downwind');
    expect(firstMain([0, 2000, 0], 'L', 4)).toBe('upwind');
    expect(firstMain([0, 1500, 1500], 'R', 0)).toBe('both');
    expect(firstMain([900, 0, 0], 'R', 0)).toBe('nose');
  });
  it('from the bank where the flight model reports none (JSBSim)', () => {
    expect(firstMain(null, 'R', 3)).toBe('upwind');
    expect(firstMain(null, 'R', -3)).toBe('downwind');
    expect(firstMain(null, 'R', 0.9)).toBe('upwind'); // a correct 5 kt landing's ~1° (physics panel)
    expect(firstMain(null, 'R', 0.3)).toBe('both');
  });
});

describe('the grade', () => {
  it('a wing-low touchdown: the right wing down 4°, no drift, the nose straight, the right wheel first: S or A, the lesson\'s note, no cap', () => {
    const wl = touchdown(scenarioWx(END));
    expect(wl.td).toMatchObject({ first: 'upwind' });
    expect(wl.td.bankIntoDeg).toBeCloseTo(4, 6);
    const base = landing();
    const r = wingLowResult(base, wl);
    expect(r.factors.slice(0, 4).map((f) => [f.key, f.score])).toEqual([['wing', 100], ['drift', 100], ['align', 100], ['wheel', 100]]);
    expect(r.factors.find((f) => f.key === 'drift').value).toBe('none');
    expect(r.factors.find((f) => f.key === 'wing').value).toBe('4.0° right wing down');
    expect(r.factors.find((f) => f.key === 'wheel').value).toBe('right (upwind) main');
    // The bank the lesson asks for costs the flare nothing (gradeLanding takes 16 points off it past 2°).
    expect(base.factors.find((f) => f.key === 'flare').score).toBe(84);
    expect(r.factors.find((f) => f.key === 'flare').score).toBe(100);
    expect(r.score).toBeGreaterThan(base.score);
    expect(['S', 'A']).toContain(r.grade);
    expect(r.reason).toBe(null);
    expect(r.note).toBe(DONE_NOTE);
    expect(r.wingLow).toBe(true);
    expect(r.tip).toBe(null);
  });

  it('a crabbed touchdown (wings level, the nose 9° right): capped at B, told why, and the tip says which pedal', () => {
    const wl = touchdown(scenarioWx(END), { bankRightDeg: 0, noseHdgT: 169, loads: [0, 1500, 1500] });
    const r = wingLowResult(landing({ bankDeg: 0 }), wl);
    expect(r.score).toBeLessThanOrEqual(CAP_B);
    expect(['B', 'C']).toContain(r.grade);
    expect(r.reason).toMatch(/^Touched down crabbed, the nose 9° off the runway: .*Best grade B\./);
    expect(r.reason).toMatch(/Both mains together: keep the right wing down through the flare\./);
    expect(r.reason).toMatch(/Wings level at touchdown: the right wing holds the line\./);
    expect(r.factors.find((f) => f.key === 'align').value).toBe('9.0° right');
    expect(r.tip).toMatch(/^Left rudder to point the nose down the runway/);
    expect(landingTip(r)).toBe(r.tip);
    expect(r.note ?? null).toBe(null);
  });

  it('both mains and a big bank are named but cap nothing; the downwind wheel too', () => {
    const both = wingLowResult(landing(), touchdown(scenarioWx(END), { loads: [0, 1500, 1500] }));
    expect(both.reason).toBe('Both mains together: keep the right wing down through the flare.');
    expect(both.score).toBeGreaterThan(CAP_B);
    // Too much wing drifts into the wind; too little, with it: named with the fix, uncapped.
    const big = wingLowResult(landing({ bankDeg: -7 }), touchdown(scenarioWx(END), { bankRightDeg: 7, driftKts: 3.4 }));
    expect(big.reason).toBe('Drifting 3.4 kt right, into the wind: a little less right wing.');
    expect(big.factors.find((f) => f.key === 'drift').value).toBe('3.4 kt right (into the wind)');
    expect(big.tip).toMatch(/^Drifting right at touchdown: a little less right wing/);
    expect(big.score).toBeGreaterThan(CAP_B);
    const little = wingLowResult(landing({ bankDeg: -1 }), touchdown(scenarioWx(END), { bankRightDeg: 1, driftKts: -2.5 }));
    expect(little.reason).toBe('Drifting 2.5 kt left, with the wind: a little more right wing.');
    expect(little.tip).toMatch(/^Drifting left at touchdown: a little more right wing/);
    // 1° of wing in a light wind is a correct landing (the bank that cancels the drift is ~0.2° a knot).
    const light = wingLowResult(landing({ bankDeg: -1 }), touchdown(live(250, 5), { bankRightDeg: 1, driftKts: -0.2 }));
    expect(light.reason).toBe(null);
    expect(light.note).toBe(DONE_NOTE);
    const away = wingLowResult(landing({ bankDeg: 3 }), touchdown(scenarioWx(END), { bankRightDeg: -3, loads: [0, 2000, 0] }));
    expect(away.reason).toMatch(/The left \(downwind\) wheel touched first\./);
    expect(away.reason).toMatch(/The left wing was down, away from the wind\./);
    expect(away.factors.find((f) => f.key === 'wing').value).toBe('3.0° left wing down (away from the wind)');
    expect(away.tip).toMatch(/^Keep the right wing down all the way/);
  });

  it('a wind from the left asks for the left wing', () => {
    const wl = touchdown(live(70, 10), { bankRightDeg: -4, loads: [0, 2500, 0] });
    const r = wingLowResult(landing({ bankDeg: 4 }), wl);
    expect(wl.side).toBe('L');
    expect(r.factors.find((f) => f.key === 'wing').value).toBe('4.0° left wing down');
    expect(r.factors.find((f) => f.key === 'wheel').value).toBe('left (upwind) main');
    expect(r.reason).toBe(null);
  });

  it('Kid: the landing\'s own card (its de-crab flew the wing and the nose)', () => {
    const wl = touchdown(scenarioWx(END), { bankRightDeg: 0, noseHdgT: 169, loads: [0, 1500, 1500] });
    const base = landing({ bankDeg: 0 });
    expect(wingLowResult(base, wl, true)).toBe(base);
  });

  it('a crash and a runway D stay; a bounce still caps after it', () => {
    const wl = touchdown(scenarioWx(END));
    const crash = { ...landing(), grade: 'CRASH', score: 0 };
    expect(wingLowResult(crash, wl)).toBe(crash);
    const short = gradeLanding({ vsFpm: -150, crossM: 0, pastThresholdM: -20, runwayLengthM: 1900, runwayWidthM: 30, pitchDeg: 5, bankDeg: -4, iasKts: 60, vrefKts: 62 });
    expect(wingLowResult(short, wl).grade).toBe('D');
    expect(capBounced(wingLowResult(landing(), wl), 1).score).toBeLessThanOrEqual(69);
  });

  it('a go-around clears the touchdown: the next one is graded', () => {
    const wl = touchdown(scenarioWx(END), { bankRightDeg: 0, noseHdgT: 170, loads: [0, 1500, 1500] });
    wingLowStep(wl, { ...air, aglFt: 60 }, 0.1);
    expect(wl.td).toBe(null);
    wingLowStep(wl, { ...air, aglFt: 0.3, onGround: true, bankRightDeg: 3, loads: [0, 0, 2000] }, 0.1);
    expect(wl.td.first).toBe('upwind');
    wingLowStep(wl, { ...air, aglFt: 3, onGround: false, loads: [0, 0, 0] }, 0.1); // a skip under 50 ft keeps it
    expect(wl.td.first).toBe('upwind');
  });

  it('tip order: the crab, then the wing, then the wheel', () => {
    expect(wingLowTip({ noseOffDeg: -5, bankIntoDeg: 0, first: 'both', driftUpKts: 0 }, 'R')).toMatch(/^Right rudder/);
    expect(wingLowTip({ noseOffDeg: 1, bankIntoDeg: 0.2, first: 'both', driftUpKts: -3 }, 'L')).toMatch(/^Keep the left wing down/);
    expect(wingLowTip({ noseOffDeg: 1, bankIntoDeg: 1, first: 'upwind', driftUpKts: -3 }, 'L')).toMatch(/^Drifting right at touchdown: a little more left wing/);
    expect(wingLowTip({ noseOffDeg: 1, bankIntoDeg: 3, first: 'both', driftUpKts: 0 }, 'R')).toMatch(/^A little more right wing/);
    expect(wingLowTip({ noseOffDeg: 1, bankIntoDeg: 3, first: 'upwind', driftUpKts: 0.5 }, 'R')).toBe(null);
  });
});
