// Wake-turbulence lesson (ticket 0115, src/wake.js + the traffic jet on the player's runway, src/traffic.js):
// AIM 7-4-6, landing behind a larger aircraft on the same runway: stay at or above its final approach path,
// note its touchdown point, land beyond it. The path check, the coach's words and the grade, driven with
// synthetic traces; the scheduler's same-runway jet. The jet's real path is flown in tests/flight/wake.test.js.
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  createWake, wakeStep, wakePrompt, wakeResult, jetPathY, kidLiftM, gateHeightAbovePathM, BELOW_FT, BELOW_S, CHECK_NM, CAP_SCORE, ZONE_W, DONE_NOTE, SAY_S, KID_AIM_PAST_M,
} from '../../src/wake.js';
import { createTrafficScheduler, wakeSpawnFor, WAKE_AHEAD_NM, distToThresholdNm, MAX_TAILWIND_KTS } from '../../src/traffic.js';
import { gradeLanding } from '../../src/landing.js';
import { coachText, RANK } from '../../src/coach.js';
import { runwayEnd, approachSpawn, AIM_POINT_M } from '../../src/airports.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { stepFlightModel, trimThrottle, rollHoldScale } from '../../src/flightModel.js';
import { NM_TO_M, M_TO_FT } from '../../src/constants.js';

const END = runwayEnd('KDFW', '35C');
const FT = 1 / M_TO_FT;
const TAN3 = Math.tan(3 * Math.PI / 180);
// A wake whose jet flew the 3° path to the 305 m aim point (wheels at the path's height) and touched down at tdM.
function flown(tdM = 676) {
  const w = createWake(END);
  for (let a = w.fromM; a < tdM; a += 5) {
    const i = Math.floor((a - w.fromM) / w.binM);
    w.path[i] = END.thrY + Math.max(0, (AIM_POINT_M - a) * TAN3);
  }
  w.tdAlongM = tdM;
  w.spawned = true;
  return w;
}
// The player along the same path, offFt above it (- under), from 3 NM out to `toM`, 60 fps.
function fly(w, offFt, toM = 0, fromM = -3 * NM_TO_M, mps = 33) {
  for (let a = fromM; a < toM; a += mps / 60) wakeStep(w, a, END.thrY + Math.max(0, (AIM_POINT_M - a) * TAN3) + offFt * FT, false, 1 / 60);
  return w;
}
const landing = (pastM) => gradeLanding({ vsFpm: -150, crossM: 0, pastThresholdM: pastM, runwayLengthM: END.lengthM - END.displacedM, runwayWidthM: END.widthM, pitchDeg: 4, bankDeg: 0, iasKts: 62, vrefKts: 61 });

describe('the path check (AIM 7-4-6: at or above its path)', () => {
  it('on the jet\'s path, or above it, is never below', () => {
    expect(fly(flown(), 0).below).toBe(false);
    expect(fly(flown(), 100).below).toBe(false);
    expect(fly(flown(), -BELOW_FT + 2).below).toBe(false); // inside the tolerance (the PAPI's on-path band)
  });
  it(`more than ${BELOW_FT} ft under it for ${BELOW_S} s inside ${CHECK_NM} NM is below, with the worst depth`, () => {
    const w = fly(flown(), -60);
    expect(w.below).toBe(true);
    expect(w.worstFt).toBeGreaterThan(59);
    expect(w.worstFt).toBeLessThan(61);
  });
  it('a dip shorter than the hold is not', () => {
    const w = flown();
    fly(w, 0, -1.5 * NM_TO_M);
    fly(w, -60, -1.5 * NM_TO_M + 33 * (BELOW_S - 0.5), -1.5 * NM_TO_M);
    fly(w, 0, 0, -1.5 * NM_TO_M + 33 * (BELOW_S - 0.5));
    expect(w.below).toBe(false);
  });
  it(`low outside ${CHECK_NM} NM, past the jet's touchdown point or on the ground is not checked`, () => {
    expect(fly(flown(), -200, -CHECK_NM * NM_TO_M - 50).below).toBe(false);
    const w = flown(400);
    for (let a = 410; a < 900; a += 0.5) wakeStep(w, a, END.thrY - 1, false, 1 / 60); // past its wheels
    expect(w.below).toBe(false);
    const g = flown();
    for (let i = 0; i < 300; i++) wakeStep(g, -100, END.thrY - 30, true, 1 / 60);
    expect(g.below).toBe(false);
  });
  it('where the jet has not flown (no sample), nothing is judged', () => {
    const w = createWake(END);
    for (let a = -3000; a < 0; a += 1) wakeStep(w, a, END.thrY, false, 1 / 60);
    expect(w.below).toBe(false);
    expect(w.underFt).toBeNull();
    expect(Number.isNaN(jetPathY(w, -1000))).toBe(true);
  });
});

describe('the coach\'s words', () => {
  it('first the jet ahead, then (after a pause) the landing coach, its touchdown point in feet when it lands, below the path at once', () => {
    const w = flown();
    w.tdAlongM = null;
    wakeStep(w, -5 * NM_TO_M, 500, false, 1 / 60);
    expect(wakePrompt(w, 1500, false)).toBe('wkWatch');
    expect(wakePrompt(w, 1500, true)).toBe('wkWatchKid');
    for (let i = 0; i < 60 * SAY_S; i++) wakeStep(w, -5 * NM_TO_M, 500, false, 1 / 60);
    expect(wakePrompt(w, 1500, false)).toBeNull(); // the PAPI coaching goes on
    w.tdAlongM = 676;
    wakeStep(w, -3 * NM_TO_M, 500, false, 1 / 60);
    expect(wakePrompt(w, 1000, false)).toBe('wkLanded');
    expect(coachText('wkLanded')).toBe('The jet touched down 2200 ft in: land beyond that');
    expect(wakePrompt(w, 1000, true)).toBe('wkLandedKid');
    for (let i = 0; i < 60 * SAY_S; i++) wakeStep(w, -3 * NM_TO_M, 500, false, 1 / 60);
    expect(wakePrompt(w, 1000, false)).toBeNull();
    fly(w, -60, -0.5 * NM_TO_M, -1.9 * NM_TO_M);
    expect(wakePrompt(w, 300, false)).toBe('wkBelow');
    expect(wakePrompt(w, 80, false)).toBeNull(); // the flare's words own the last 100 ft
    expect(wakePrompt(w, 300, true)).not.toBe('wkBelow'); // Kid's guide flies the path
    expect(RANK.wkBelow).toBeGreaterThan(RANK.papi);
  });
  it('silent with no jet', () => {
    const w = createWake(END);
    w.spawned = true; w.noJet = 'too close';
    wakeStep(w, -1000, 100, false, 1 / 60);
    expect(wakePrompt(w, 500, false)).toBeNull();
  });
});

describe('the grade (0115 acceptance)', () => {
  it('beyond the jet\'s point, on or above its path: graded normally, the zone scored from the jet\'s point, a note', () => {
    const w = fly(flown(), 10);
    const plain = landing(800);
    const r = wakeResult(plain, w, 800); // 124 m beyond the jet: full marks in the drill's zone
    expect(r.factors.find((f) => f.key === 'zone')).toMatchObject({ label: "Past the jet's touchdown", score: 100 });
    expect(r.factors.find((f) => f.key === 'zone').value).toBe('407 ft beyond it');
    const oldZone = plain.factors.find((f) => f.key === 'zone').score;
    expect(oldZone).toBeLessThan(100); // landing.js's zone would have marked it down for landing long
    expect(r.score).toBe(Math.round(plain.score + (100 - oldZone) * ZONE_W));
    expect(['A', 'S']).toContain(r.grade);
    expect(r.reason).toBeNull();
    expect(r.note).toBe(DONE_NOTE);
  });
  it('touching down short of the jet\'s point is capped at C, with the reason', () => {
    const r = wakeResult(landing(400), fly(flown(), 10), 400);
    expect(r.score).toBeLessThanOrEqual(CAP_SCORE);
    expect(r.grade).toBe('C');
    expect(r.reason).toMatch(/short of the jet's touchdown point/);
    expect(r.factors.find((f) => f.key === 'zone')).toMatchObject({ score: 0, value: '906 ft short of it' });
    expect(r.note).toBeNull();
  });
  it('below its path inside 2 NM is capped at C, with how deep', () => {
    const r = wakeResult(landing(800), fly(flown(), -60), 800);
    expect(r.grade).toBe('C');
    expect(r.reason).toMatch(/under the jet's path inside 2 NM \(6[01] ft under\)/); // a 5 m bin is < 1 ft of the path
  });
  it('both: both reasons; a crash stays a crash; a D for the runway stays a D', () => {
    const both = wakeResult(landing(400), fly(flown(), -60), 400);
    expect(both.reason).toMatch(/short of.*under/);
    const crash = { ...landing(800), grade: 'CRASH', score: 0, reason: 'Hard landing' };
    expect(wakeResult(crash, flown(), 800)).toBe(crash);
    const off = gradeLanding({ vsFpm: -150, crossM: 40, pastThresholdM: 800, runwayLengthM: 4000, runwayWidthM: 61, pitchDeg: 4, bankDeg: 0, iasKts: 62, vrefKts: 61 });
    expect(off.grade).toBe('D');
    expect(wakeResult(off, fly(flown(), 10), 800).grade).toBe('D');
  });
  it('no jet (too close in, or the wind): a normal landing, and the card says why', () => {
    const w = createWake(END);
    w.spawned = true; w.noJet = 'too close to the runway to fit it in ahead of you';
    const r = wakeResult(landing(300), w, 300);
    expect(r.grade).toBe(landing(300).grade);
    expect(r.reason).toMatch(/No jet today \(too close/);
  });
});

describe('the stabilized gate and the PAPI\'s "high" on the lesson', () => {
  it('from the 3° path up to a path past the jet\'s point is on path; under it or above that, the distance', () => {
    const w = createWake(END);
    expect(gateHeightAbovePathM(w, 10)).toBe(10); // the jet not down yet: the 3° path's error
    w.tdAlongM = 676;
    const lift = kidLiftM(w);
    expect(lift).toBeGreaterThan(20);
    expect(gateHeightAbovePathM(w, 0)).toBe(0);
    expect(gateHeightAbovePathM(w, lift / 2)).toBe(0);
    expect(gateHeightAbovePathM(w, lift + 5)).toBeCloseTo(5, 6);
    expect(gateHeightAbovePathM(w, -7)).toBe(-7);
  });
  it('high on the PAPI inside that band: the lesson\'s words, not "You\'re high"; above it, the landing coach\'s', () => {
    const w = flown();
    wakeStep(w, -3 * NM_TO_M, 500, false, 1 / 60);
    for (let i = 0; i < 60 * 2 * SAY_S; i++) wakeStep(w, -3 * NM_TO_M, 500, false, 1 / 60);
    expect(wakePrompt(w, 800, false, 3, 10)).toBe('wkHigh');
    expect(coachText('wkHigh')).toMatch(/Above the jet's path: good/);
    expect(wakePrompt(w, 800, false, 2, 0)).toBeNull();
    expect(wakePrompt(w, 800, false, 4, kidLiftM(w) + 20)).toBeNull();
    expect(wakePrompt(w, 800, true, 3, 10)).toBeNull();
  });
});

describe("Kid's guide aims past the jet", () => {
  it('nothing until the jet lands; then a path KID_AIM_PAST_M past its touchdown point', () => {
    const w = createWake(END);
    expect(kidLiftM(w, AIM_POINT_M)).toBe(0);
    w.tdAlongM = 676;
    expect(kidLiftM(w, AIM_POINT_M)).toBeCloseTo((676 + KID_AIM_PAST_M - AIM_POINT_M) * TAN3, 6);
    w.tdAlongM = 100;
    expect(kidLiftM(w, AIM_POINT_M)).toBe(0); // never below the standard path
  });
});

describe('the mission', () => {
  it('the Cessna on a 5 NM final to KDFW 35C at midday, in the KDFW group, saying no wake is simulated', () => {
    const m = missionByKey('kdfw_35c_wake');
    expect(m).toMatchObject({ key: 'kdfw_35c_wake', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 5, aircraft: 'c172', wake: true, sun: 'Noon' });
    expect(m.blurb).toMatch(/no wake is simulated/i);
    expect(MISSIONS.filter((x) => x.key === m.key)).toHaveLength(1);
    expect(groupMissions(MISSIONS).find((g) => g.id === 'KDFW').missions).toContain(m);
  });
});

describe('the scheduler flies the lesson\'s jet on the player\'s own runway (0115)', () => {
  const final = (nm = 5) => {
    const p = approachSpawn(END, nm).pos;
    const sim = { simTime: 0, activeEnd: END, loadedMission: { key: 'w' }, pos: new Vector3(p.x, p.y, p.z), windVec: new Vector3(), mslOffsetM: 0, isaDevC: 0, altimInHg: 29.92, fm: { stepFlightModel, trimThrottle, rollHoldScale } };
    sim.wake = createWake(END);
    return sim;
  };
  const run = (sim, sch, s, allowed = true, dark = false) => { for (let t = 0; t < s; t += 1 / 60) { sim.simTime += 1 / 60; sch.tick(allowed, dark); } };
  it('none until the player is flying, then at once on 35C, 2 NM closer in than the player, over 1 NM away', () => {
    const sim = final(), sch = createTrafficScheduler(sim);
    run(sim, sch, 20);
    expect(sch.jet).toBeNull(); // behind the start screen: no parallel jet either
    sim.wake.ready = true;
    run(sim, sch, 0.1);
    expect(sch.jet.end.id).toBe(END.id);
    expect(sch.jet.wake).toBe(sim.wake);
    expect(sim.wake.spawned).toBe(true);
    const ahead = distToThresholdNm(END, sim.pos) - distToThresholdNm(END, sch.jet.body.pos);
    expect(ahead).toBeCloseTo(WAKE_AHEAD_NM, 1);
    expect(sch.jet.body.pos.distanceTo(sim.pos)).toBeGreaterThan(NM_TO_M);
  });
  it('kept on a struggling device and after dark (the lesson needs it); ordinary traffic is not', () => {
    const sim = final(), sch = createTrafficScheduler(sim);
    sim.wake.ready = true;
    run(sim, sch, 1, false, true);
    expect(sch.jet?.wake).toBe(sim.wake);
    run(sim, sch, 5, false, true);
    expect(sch.jet?.wake).toBe(sim.wake);
  });
  it('records its path and touchdown point, then parallel traffic follows as usual', () => {
    const sim = final(), sch = createTrafficScheduler(sim, { rand: () => 0 });
    sim.wake.ready = true;
    run(sim, sch, 150);
    expect(sim.wake.tdAlongM).toBeGreaterThan(0);
    expect(sim.wake.jetDone).toBe(true);
    expect(Number.isNaN(jetPathY(sim.wake, -NM_TO_M))).toBe(false);
    run(sim, sch, 45);
    expect(sch.jet).not.toBeNull();
    expect(sch.jet.end.id).not.toBe(END.id);
    expect(sch.jet.wake).toBeUndefined();
  });
  it('too close in, or a tailwind over the 737\'s limit: no jet, and the reason', () => {
    const sim = final(3), sch = createTrafficScheduler(sim);
    sim.wake.ready = true;
    run(sim, sch, 1);
    expect(sch.jet).toBeNull();
    expect(sim.wake.noJet).toMatch(/too close/);
    const s2 = final();
    s2.wx = { windDirDeg: 180, windKts: MAX_TAILWIND_KTS + 5, gustKts: null };
    expect(wakeSpawnFor(END, s2)).toMatchObject({ distNm: null, reason: expect.stringMatching(/tailwind/) });
  });
});
